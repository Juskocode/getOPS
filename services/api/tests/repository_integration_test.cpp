#include <chrono>
#include <cstdlib>
#include <future>
#include <iostream>
#include <string>

#include <nlohmann/json.hpp>

#include "getops/profile_repository.hpp"

namespace {

int failures = 0;

void expect(bool condition, const std::string& message) {
  if (!condition) {
    ++failures;
    std::cerr << "FAIL: " << message << '\n';
  }
}

}  // namespace

int main() {
  const char* database_url = std::getenv("GETOPS_TEST_DATABASE_URL");
  if (database_url == nullptr || std::string(database_url).empty()) {
    std::cout << "GETOPS_TEST_DATABASE_URL is not set; skipping PostgreSQL integration.\n";
    return 77;
  }

  const auto suffix = std::chrono::steady_clock::now().time_since_epoch().count();
  const auto profile = "it_" + std::to_string(suffix).substr(0, 20);
  const getops::ProfileRepository repository(database_url);
  expect(repository.ready(), "Repository reports a migrated PostgreSQL schema.");

  const auto missing = repository.load(profile);
  expect(!missing.state.has_value(), "A missing profile has null state.");
  expect(missing.revision == 0, "A missing profile starts at revision zero.");

  const nlohmann::json first_state{
      {"uiVersion", 30},
      {"xp", 10},
      {"displayName", "Integration Operator"},
      {"flashDrafts", nlohmann::json::object()},
      {"flashAttempts", nlohmann::json::array()},
  };
  const auto first = repository.save(profile, 0, first_state, "integration-create");
  expect(first.revision == 1, "First save creates revision one.");
  expect(first.state.has_value() && first.state->at("xp") == 10, "First state is returned.");

  try {
    static_cast<void>(repository.save(profile, 0, first_state, "integration-conflict"));
    expect(false, "A stale writer should receive a revision conflict.");
  } catch (const getops::RevisionConflict& conflict) {
    expect(conflict.current_revision() == 1, "Conflict reports the current revision.");
    expect(conflict.expected_revision() == 0, "Conflict reports the expected revision.");
  }

  auto second_state = first_state;
  second_state["xp"] = 25;
  const auto second = repository.save(profile, 1, second_state, "integration-update");
  expect(second.revision == 2, "Second save increments the revision.");
  expect(repository.load(profile).state->at("xp") == 25, "Load returns the committed update.");
  expect(repository.history_count(profile) == 2, "Every committed revision has history.");

  const auto concurrent_profile = "race_" + std::to_string(suffix).substr(0, 18);
  auto first_writer = std::async(std::launch::async, [&repository, &concurrent_profile, &first_state]() {
    try {
      static_cast<void>(
          repository.save(concurrent_profile, 0, first_state, "integration-race-one"));
      return std::string("saved");
    } catch (const getops::RevisionConflict&) {
      return std::string("conflict");
    }
  });
  auto second_writer = std::async(std::launch::async, [&repository, &concurrent_profile, &first_state]() {
    try {
      static_cast<void>(
          repository.save(concurrent_profile, 0, first_state, "integration-race-two"));
      return std::string("saved");
    } catch (const getops::RevisionConflict&) {
      return std::string("conflict");
    }
  });
  const auto first_outcome = first_writer.get();
  const auto second_outcome = second_writer.get();
  expect(first_outcome != second_outcome, "Concurrent first writers produce one save and one conflict.");
  expect(repository.load(concurrent_profile).revision == 1, "Concurrent creation commits one revision.");
  expect(repository.history_count(concurrent_profile) == 1, "Concurrent creation records one history row.");

  const auto imported_profile = "import_" + std::to_string(suffix).substr(0, 16);
  const auto imported =
      repository.import_empty(imported_profile, first_state, "integration-import");
  expect(imported.revision == 1, "Import creates an empty profile at revision one.");
  try {
    static_cast<void>(
        repository.import_empty(imported_profile, second_state, "integration-import-again"));
    expect(false, "Import must not overwrite an existing profile.");
  } catch (const getops::RevisionConflict& conflict) {
    expect(conflict.current_revision() == 1, "Repeated import reports the existing revision.");
  }

  const auto diagnostics = repository.diagnostics();
  expect(diagnostics.at("ready") == true, "Diagnostics report readiness.");
  expect(diagnostics.at("schemaVersion") == 1, "Diagnostics report schema version one.");

  if (failures != 0) {
    std::cerr << failures << " assertion(s) failed.\n";
    return EXIT_FAILURE;
  }
  std::cout << "PostgreSQL repository assertions passed.\n";
  return EXIT_SUCCESS;
}
