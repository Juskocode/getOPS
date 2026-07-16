#include "getops/state_validator.hpp"

#include <algorithm>
#include <cctype>
#include <cstdint>
#include <regex>
#include <string>
#include <unordered_set>

#include "getops/errors.hpp"
#include "getops/recall.hpp"

namespace getops {
namespace {

const std::regex kProfilePattern(R"(^[A-Za-z0-9_-]{1,40}$)");
const std::regex kCardPattern(R"(^f(?:0[1-9]|[1-9][0-9]|1[0-4][0-9]|150)$)");
const std::regex kTimestampPattern(
    R"(^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$)");

[[noreturn]] void invalid(const std::string& message) {
  throw DomainError("state_invalid", message);
}

std::int64_t integer(
    const nlohmann::json& object,
    const char* field,
    std::int64_t minimum,
    std::int64_t maximum) {
  if (!object.contains(field) || !object.at(field).is_number_integer()) {
    invalid(std::string("Field '") + field + "' must be an integer.");
  }
  const auto value = object.at(field).get<std::int64_t>();
  if (value < minimum || value > maximum) {
    invalid(std::string("Field '") + field + "' is outside its supported range.");
  }
  return value;
}

std::string text(
    const nlohmann::json& object,
    const char* field,
    std::size_t minimum,
    std::size_t maximum) {
  if (!object.contains(field) || !object.at(field).is_string()) {
    invalid(std::string("Field '") + field + "' must be a string.");
  }
  auto value = object.at(field).get<std::string>();
  if (value.size() < minimum || value.size() > maximum) {
    invalid(std::string("Field '") + field + "' has an invalid length.");
  }
  return value;
}

int word_count(const std::string& value) {
  int count = 0;
  bool in_word = false;
  for (const char character : value) {
    if (std::isspace(static_cast<unsigned char>(character)) == 0) {
      if (!in_word) {
        ++count;
        in_word = true;
      }
    } else {
      in_word = false;
    }
  }
  return count;
}

void inspect_shape(const nlohmann::json& value, int depth, std::size_t& nodes) {
  if (depth > 48) {
    invalid("State nesting exceeds 48 levels.");
  }
  ++nodes;
  if (nodes > 200'000) {
    invalid("State contains too many JSON values.");
  }
  if (value.is_string() && value.get_ref<const std::string&>().size() > 250'000) {
    invalid("State contains an oversized string.");
  }
  if (value.is_array()) {
    for (const auto& child : value) {
      inspect_shape(child, depth + 1, nodes);
    }
  } else if (value.is_object()) {
    for (const auto& [key, child] : value.items()) {
      if (key.size() > 160) {
        invalid("State contains an oversized object key.");
      }
      inspect_shape(child, depth + 1, nodes);
    }
  }
}

void validate_string_array(const nlohmann::json& object, const char* field) {
  if (!object.contains(field) || !object.at(field).is_array() || object.at(field).size() > 8) {
    invalid(std::string("Field '") + field + "' must be an array with at most 8 values.");
  }
  std::unordered_set<std::string> values;
  for (const auto& item : object.at(field)) {
    if (!item.is_string()) {
      invalid(std::string("Field '") + field + "' contains a non-string value.");
    }
    const auto value = item.get<std::string>();
    if (value.empty() || value.size() > 80 || !values.insert(value).second) {
      invalid(std::string("Field '") + field + "' contains an invalid or duplicate value.");
    }
  }
}

void validate_attempt(const nlohmann::json& attempt) {
  if (!attempt.is_object()) {
    invalid("Every flash attempt must be an object.");
  }
  text(attempt, "id", 1, 100);
  const auto card_id = text(attempt, "cardId", 3, 4);
  if (!std::regex_match(card_id, kCardPattern)) {
    invalid("Flash attempt cardId is invalid.");
  }
  const auto answer = text(attempt, "answer", 20, 1'200);
  const auto timestamp = text(attempt, "createdAt", 20, 40);
  if (!std::regex_match(timestamp, kTimestampPattern)) {
    invalid("Flash attempt createdAt must be an RFC 3339 timestamp.");
  }
  const auto rubric = integer(attempt, "rubricVersion", 1, 2);
  if (rubric != 1 && rubric != 2) {
    invalid("Flash attempt rubricVersion must be 1 or 2.");
  }
  const auto recorded_words = integer(attempt, "wordCount", 4, 500);
  if (recorded_words != word_count(answer)) {
    invalid("Flash attempt wordCount does not match the answer.");
  }
  const auto coverage = integer(attempt, "coverageScore", 0, 60);
  const auto structure = integer(attempt, "structureScore", 0, 25);
  const auto specificity = integer(attempt, "specificityScore", 0, 15);
  const auto score = integer(attempt, "score", 0, 100);
  if (coverage + structure + specificity != score) {
    invalid("Flash attempt component scores do not equal the total score.");
  }
  const auto verdict = text(attempt, "verdict", 6, 10);
  const auto expected_verdict =
      score >= 80 ? "strong" : (score >= 60 ? "developing" : "needs-work");
  if (verdict != expected_verdict) {
    invalid("Flash attempt verdict is invalid.");
  }
  if (!attempt.contains("resolved") || !attempt.at("resolved").is_boolean()) {
    invalid("Flash attempt resolved must be a boolean.");
  }
  if (attempt.at("resolved").get<bool>() != (score >= 75)) {
    invalid("Flash attempt resolved does not match the score gate.");
  }
  validate_string_array(attempt, "matched");
  validate_string_array(attempt, "missing");

  std::unordered_set<std::string> matched;
  for (const auto& item : attempt.at("matched")) {
    matched.insert(item.get<std::string>());
  }
  for (const auto& item : attempt.at("missing")) {
    if (matched.contains(item.get<std::string>())) {
      invalid("Flash attempt concepts cannot be both matched and missing.");
    }
  }
}

void compare_recall_field(
    const nlohmann::json& attempt,
    const nlohmann::json& expected,
    const char* field) {
  if (!attempt.contains(field) || attempt.at(field) != expected.at(field)) {
    throw DomainError(
        "state_score_invalid",
        std::string("Flash attempt field '") + field +
            "' does not match authoritative scoring.");
  }
}

}  // namespace

void StateValidator::validate_profile_id(const std::string& profile) {
  if (!std::regex_match(profile, kProfilePattern)) {
    throw DomainError(
        "profile_invalid",
        "Profile IDs must contain 1-40 letters, numbers, underscores, or hyphens.");
  }
}

void StateValidator::validate(const nlohmann::json& state) {
  if (!state.is_object()) {
    invalid("Profile state must be a JSON object.");
  }
  if (state.dump().size() > kMaximumSerializedBytes) {
    invalid("Profile state exceeds the 1.9 MB limit.");
  }

  std::size_t nodes = 0;
  inspect_shape(state, 0, nodes);

  if (state.contains("uiVersion")) {
    integer(state, "uiVersion", 1, 100);
  }
  if (state.contains("xp")) {
    integer(state, "xp", 0, 100'000'000);
  }
  if (state.contains("displayName") && text(state, "displayName", 0, 80).empty()) {
    // Empty names remain valid during migration and are normalized by the client.
  }
  if (state.contains("profileObjective")) {
    text(state, "profileObjective", 0, 160);
  }

  if (state.contains("flashDrafts")) {
    const auto& drafts = state.at("flashDrafts");
    if (!drafts.is_object() || drafts.size() > 150) {
      invalid("flashDrafts must be an object with at most 150 cards.");
    }
    for (const auto& [card_id, draft] : drafts.items()) {
      if (!std::regex_match(card_id, kCardPattern) || !draft.is_object()) {
        invalid("flashDrafts contains an invalid card or draft.");
      }
      text(draft, "text", 0, 1'200);
      const auto updated_at = text(draft, "updatedAt", 0, 40);
      if (!updated_at.empty() && !std::regex_match(updated_at, kTimestampPattern)) {
        invalid("Flash draft updatedAt must be empty or an RFC 3339 timestamp.");
      }
    }
  }

  if (state.contains("flashAttempts")) {
    const auto& attempts = state.at("flashAttempts");
    if (!attempts.is_array() || attempts.size() > 200) {
      invalid("flashAttempts must be an array with at most 200 attempts.");
    }
    std::unordered_set<std::string> attempt_ids;
    for (const auto& attempt : attempts) {
      validate_attempt(attempt);
      const auto id = attempt.at("id").get<std::string>();
      if (!attempt_ids.insert(id).second) {
        invalid("flashAttempts contains duplicate attempt IDs.");
      }
    }
  }

  if (state.contains("flashActiveId")) {
    const auto card_id = text(state, "flashActiveId", 0, 4);
    if (!card_id.empty() && !std::regex_match(card_id, kCardPattern)) {
      invalid("flashActiveId is invalid.");
    }
  }
  if (state.contains("flashRecent")) {
    const auto& recent = state.at("flashRecent");
    if (!recent.is_array() || recent.size() > 6) {
      invalid("flashRecent must contain at most 6 card IDs.");
    }
    std::unordered_set<std::string> card_ids;
    for (const auto& item : recent) {
      if (!item.is_string() || !std::regex_match(item.get<std::string>(), kCardPattern) ||
          !card_ids.insert(item.get<std::string>()).second) {
        invalid("flashRecent contains an invalid or duplicate card ID.");
      }
    }
  }
  if (state.contains("flashRewardClaims")) {
    const auto& claims = state.at("flashRewardClaims");
    if (!claims.is_array() || claims.size() > 1'000) {
      invalid("flashRewardClaims must contain at most 1000 values.");
    }
    std::unordered_set<std::string> values;
    for (const auto& claim : claims) {
      if (!claim.is_string()) {
        invalid("flashRewardClaims contains a non-string value.");
      }
      const auto value = claim.get<std::string>();
      if (value.empty() || value.size() > 80 || !values.insert(value).second) {
        invalid("flashRewardClaims contains an invalid or duplicate value.");
      }
    }
  }
}

void StateValidator::validate_recall_evidence(
    const nlohmann::json& state,
    const RecallScorer& scorer) {
  validate(state);
  if (!state.contains("flashAttempts")) {
    return;
  }
  for (const auto& attempt : state.at("flashAttempts")) {
    if (attempt.at("rubricVersion").get<int>() != 2) {
      continue;
    }
    const auto expected = nlohmann::json(scorer.validate(
        attempt.at("cardId").get<std::string>(),
        attempt.at("answer").get<std::string>()));
    for (const char* field : {
             "cardId",
             "answer",
             "rubricVersion",
             "wordCount",
             "coverageScore",
             "structureScore",
             "specificityScore",
             "score",
             "verdict",
             "resolved",
             "matched",
             "missing",
         }) {
      compare_recall_field(attempt, expected, field);
    }
  }
}

}  // namespace getops
