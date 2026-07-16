#include "getops/config.hpp"

#include <algorithm>
#include <cstdlib>
#include <stdexcept>
#include <string>

namespace getops {
namespace {

std::string environment(const char* name, const std::string& fallback = {}) {
  const char* raw_value = std::getenv(name);
  return raw_value == nullptr || std::string(raw_value).empty()
             ? fallback
             : std::string(raw_value);
}

int bounded_integer(
    const char* name,
    int fallback,
    int minimum,
    int maximum) {
  const auto raw_value = environment(name);
  if (raw_value.empty()) {
    return fallback;
  }
  try {
    const auto parsed = std::stoi(raw_value);
    if (parsed < minimum || parsed > maximum) {
      throw std::out_of_range(name);
    }
    return parsed;
  } catch (const std::exception&) {
    throw std::runtime_error(
        std::string(name) + " must be an integer between " +
        std::to_string(minimum) + " and " + std::to_string(maximum) + ".");
  }
}

}  // namespace

Config Config::from_environment() {
  Config config;
  config.bind_address = environment("GETOPS_BIND", config.bind_address);
  config.port = bounded_integer("GETOPS_PORT", config.port, 1, 65'535);
  config.worker_threads = static_cast<std::size_t>(
      bounded_integer("GETOPS_WORKERS", static_cast<int>(config.worker_threads), 1, 64));
  config.database_url = environment("GETOPS_DATABASE_URL");
  if (config.database_url.empty()) {
    throw std::runtime_error("GETOPS_DATABASE_URL is required.");
  }
  config.catalog_path = environment("GETOPS_CATALOG_PATH", config.catalog_path.string());
  return config;
}

}  // namespace getops
