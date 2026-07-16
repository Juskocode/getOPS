#pragma once

#include <string>

#include <nlohmann/json.hpp>

namespace getops {

class StateValidator final {
 public:
  static constexpr std::size_t kMaximumSerializedBytes = 1'900'000;

  static void validate_profile_id(const std::string& profile);
  static void validate(const nlohmann::json& state);
};

}  // namespace getops
