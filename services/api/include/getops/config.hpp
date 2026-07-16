#pragma once

#include <cstddef>
#include <filesystem>
#include <string>

namespace getops {

struct Config {
  std::string bind_address{"127.0.0.1"};
  int port{8780};
  std::size_t worker_threads{8};
  std::string database_url;
  std::filesystem::path catalog_path{"content/flashcards.json"};

  static Config from_environment();
};

}  // namespace getops
