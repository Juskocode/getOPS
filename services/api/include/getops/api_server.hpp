#pragma once

#include <memory>

#include "getops/config.hpp"

namespace getops {

class ApiServer final {
 public:
  explicit ApiServer(Config config);
  ~ApiServer();

  ApiServer(const ApiServer&) = delete;
  ApiServer& operator=(const ApiServer&) = delete;

  [[nodiscard]] bool run();
  void stop();

 private:
  class Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace getops
