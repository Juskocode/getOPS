#pragma once

#include <cstdint>
#include <optional>
#include <stdexcept>
#include <string>
#include <utility>

#include <nlohmann/json.hpp>

namespace getops {

struct ProfileRecord {
  std::string profile;
  std::optional<nlohmann::json> state;
  std::int64_t revision{0};
  std::optional<std::string> updated_at;
};

class RepositoryError final : public std::runtime_error {
 public:
  RepositoryError(std::string code, std::string message)
      : std::runtime_error(std::move(message)), code_(std::move(code)) {}

  [[nodiscard]] const std::string& code() const noexcept { return code_; }

 private:
  std::string code_;
};

class RevisionConflict final : public std::runtime_error {
 public:
  RevisionConflict(
      std::int64_t expected_revision,
      std::int64_t current_revision,
      std::optional<std::string> updated_at);

  [[nodiscard]] std::int64_t expected_revision() const noexcept {
    return expected_revision_;
  }
  [[nodiscard]] std::int64_t current_revision() const noexcept {
    return current_revision_;
  }
  [[nodiscard]] const std::optional<std::string>& updated_at() const noexcept {
    return updated_at_;
  }

 private:
  std::int64_t expected_revision_;
  std::int64_t current_revision_;
  std::optional<std::string> updated_at_;
};

class ProfileRepository final {
 public:
  explicit ProfileRepository(std::string connection_string);

  [[nodiscard]] ProfileRecord load(const std::string& profile) const;
  [[nodiscard]] ProfileRecord save(
      const std::string& profile,
      std::int64_t expected_revision,
      const nlohmann::json& state,
      const std::string& request_id) const;
  [[nodiscard]] ProfileRecord import_empty(
      const std::string& profile,
      const nlohmann::json& state,
      const std::string& request_id) const;
  [[nodiscard]] bool ready() const;
  [[nodiscard]] std::int64_t history_count(const std::string& profile) const;
  [[nodiscard]] nlohmann::json diagnostics() const;

 private:
  std::string connection_string_;
};

}  // namespace getops
