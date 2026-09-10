#pragma once

#include <cstddef>
#include <filesystem>
#include <string>
#include <unordered_map>

#include <nlohmann/json.hpp>

namespace getops {

struct Flashcard {
  std::string id;
  std::string branch;
  std::string prompt;
  std::string answer;
  std::string deep_dive;
};

class Catalog final {
 public:
  static Catalog load(const std::filesystem::path& path);

  [[nodiscard]] const Flashcard& require(const std::string& id) const;
  [[nodiscard]] const nlohmann::json& document() const noexcept { return document_; }
  [[nodiscard]] std::size_t size() const noexcept { return cards_.size(); }

 private:
  Catalog(nlohmann::json document, std::unordered_map<std::string, Flashcard> cards);

  nlohmann::json document_;
  std::unordered_map<std::string, Flashcard> cards_;
};

}  // namespace getops
