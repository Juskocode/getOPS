#pragma once

#include <string>

#include <nlohmann/json.hpp>

namespace getops {

class RecallScorer;

class StateValidator final {
 public:
  static constexpr std::size_t kMaximumSerializedBytes = 1'900'000;

  static void validate_profile_id(const std::string& profile);
  static void validate(const nlohmann::json& state);
  static void validate_recall_evidence(
      const nlohmann::json& state,
      const RecallScorer& scorer);
};

}  // namespace getops
