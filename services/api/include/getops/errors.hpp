#pragma once

#include <stdexcept>
#include <string>
#include <utility>

namespace getops {

class DomainError final : public std::runtime_error {
 public:
  DomainError(std::string code, std::string message)
      : std::runtime_error(std::move(message)), code_(std::move(code)) {}

  [[nodiscard]] const std::string& code() const noexcept { return code_; }

 private:
  std::string code_;
};

}  // namespace getops
