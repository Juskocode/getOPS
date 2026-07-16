#include "getops/catalog.hpp"

#include <array>
#include <fstream>
#include <regex>
#include <string_view>
#include <unordered_set>
#include <utility>

#include "getops/errors.hpp"

namespace getops {
namespace {

constexpr std::array<std::string_view, 9> kBranches{
    "market",
    "feed",
    "orders",
    "sessions",
    "monitoring",
    "incident",
    "capacity",
    "risk",
    "interview",
};

bool supported_branch(const std::string& branch) {
  for (const auto candidate : kBranches) {
    if (candidate == branch) {
      return true;
    }
  }
  return false;
}

std::string required_string(
    const nlohmann::json& value,
    const char* field,
    std::size_t maximum) {
  if (!value.contains(field) || !value.at(field).is_string()) {
    throw DomainError("catalog_invalid", std::string("Card field '") + field + "' must be a string.");
  }
  auto result = value.at(field).get<std::string>();
  if (result.empty() || result.size() > maximum) {
    throw DomainError(
        "catalog_invalid",
        std::string("Card field '") + field + "' has an invalid length.");
  }
  return result;
}

}  // namespace

Catalog::Catalog(
    nlohmann::json document,
    std::unordered_map<std::string, Flashcard> cards)
    : document_(std::move(document)), cards_(std::move(cards)) {}

Catalog Catalog::load(const std::filesystem::path& path) {
  std::ifstream input(path);
  if (!input) {
    throw DomainError("catalog_unavailable", "Could not open flashcard catalog: " + path.string());
  }

  nlohmann::json document;
  try {
    input >> document;
  } catch (const nlohmann::json::exception& error) {
    throw DomainError("catalog_invalid", std::string("Could not parse flashcard catalog: ") + error.what());
  }

  if (!document.is_object() || document.value("schemaVersion", 0) != 1 ||
      !document.contains("cards") || !document.at("cards").is_array() ||
      document.at("cards").size() != 150) {
    throw DomainError("catalog_invalid", "Flashcard catalog must contain schema version 1 and 150 cards.");
  }

  const std::regex id_pattern(R"(^f(?:0[1-9]|[1-9][0-9]|1[0-4][0-9]|150)$)");
  std::unordered_map<std::string, Flashcard> cards;
  std::unordered_set<std::string> prompts;
  cards.reserve(150);
  prompts.reserve(150);

  for (const auto& raw_card : document.at("cards")) {
    if (!raw_card.is_object()) {
      throw DomainError("catalog_invalid", "Every flashcard must be an object.");
    }
    Flashcard card{
        .id = required_string(raw_card, "id", 4),
        .branch = required_string(raw_card, "branch", 32),
        .prompt = required_string(raw_card, "prompt", 160),
        .answer = required_string(raw_card, "answer", 1'200),
        .deep_dive = required_string(raw_card, "deepDive", 1'200),
    };
    if (!std::regex_match(card.id, id_pattern)) {
      throw DomainError("catalog_invalid", "Flashcard ID is outside the supported f01-f150 range.");
    }
    if (!supported_branch(card.branch)) {
      throw DomainError("catalog_invalid", "Flashcard branch is not supported: " + card.branch);
    }
    if (!prompts.insert(card.prompt).second) {
      throw DomainError("catalog_invalid", "Flashcard prompts must be unique.");
    }
    const auto [unused, inserted] = cards.emplace(card.id, std::move(card));
    static_cast<void>(unused);
    if (!inserted) {
      throw DomainError("catalog_invalid", "Flashcard IDs must be unique.");
    }
  }

  return Catalog(std::move(document), std::move(cards));
}

const Flashcard& Catalog::require(const std::string& id) const {
  const auto card = cards_.find(id);
  if (card == cards_.end()) {
    throw DomainError("card_not_found", "Unknown flashcard: " + id);
  }
  return card->second;
}

}  // namespace getops
