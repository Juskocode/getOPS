#include <csignal>
#include <cstdlib>
#include <exception>
#include <iostream>

#include <nlohmann/json.hpp>

#include "getops/api_server.hpp"
#include "getops/config.hpp"

namespace {

getops::ApiServer* active_server = nullptr;

void stop_server(int) {
  if (active_server != nullptr) {
    active_server->stop();
  }
}

}  // namespace

int main() {
  try {
    auto server = getops::ApiServer(getops::Config::from_environment());
    active_server = &server;
    std::signal(SIGINT, stop_server);
    std::signal(SIGTERM, stop_server);
    const bool stopped_cleanly = server.run();
    active_server = nullptr;
    return stopped_cleanly ? EXIT_SUCCESS : EXIT_FAILURE;
  } catch (const std::exception& error) {
    std::cerr << "{\"event\":\"api_start_failed\",\"detail\":"
              << nlohmann::json(error.what()).dump() << "}\n";
    return EXIT_FAILURE;
  }
}
