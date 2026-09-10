#include <cstdlib>
#include <iostream>
#include <string>

#include <nlohmann/json.hpp>

#include "getops/catalog.hpp"
#include "getops/errors.hpp"
#include "getops/recall.hpp"
#include "getops/state_validator.hpp"

namespace {

int failures = 0;

void expect(bool condition, const std::string& message) {
  if (!condition) {
    ++failures;
    std::cerr << "FAIL: " << message << '\n';
  }
}

template <typename Function>
void expect_domain_error(Function function, const std::string& code) {
  try {
    function();
    expect(false, "Expected DomainError with code " + code);
  } catch (const getops::DomainError& error) {
    expect(error.code() == code, "Expected error code " + code + ", got " + error.code());
  }
}

nlohmann::json valid_attempt() {
  return {
      {"id", "flash-f01-test"},
      {"cardId", "f01"},
      {"answer", "A quote is available interest while a trade is a completed transaction."},
      {"createdAt", "2026-07-16T10:20:30.000Z"},
      {"rubricVersion", 1},
      {"wordCount", 12},
      {"coverageScore", 40},
      {"structureScore", 20},
      {"specificityScore", 10},
      {"score", 70},
      {"verdict", "developing"},
      {"resolved", false},
      {"matched", nlohmann::json::array({"quote", "trade"})},
      {"missing", nlohmann::json::array({"price"})},
  };
}

}  // namespace

int main() {
  getops::StateValidator::validate_profile_id("operator_23");
  expect_domain_error(
      []() { getops::StateValidator::validate_profile_id("../../bad"); },
      "profile_invalid");

  auto state = nlohmann::json{
      {"uiVersion", 30},
      {"xp", 100},
      {"displayName", "Operator"},
      {"legacyUnknownField", {{"preserved", true}}},
      {"flashDrafts",
       {{"f01",
         {{"text", "A private draft."}, {"updatedAt", "2026-07-16T10:20:30.000Z"}}}}},
      {"flashAttempts", nlohmann::json::array({valid_attempt()})},
      {"flashActiveId", "f01"},
      {"flashRecent", nlohmann::json::array({"f02", "f03"})},
      {"flashRewardClaims", nlohmann::json::array({"f01:2026-07-16"})},
  };
  getops::StateValidator::validate(state);

  const auto catalog = getops::Catalog::load(GETOPS_TEST_CATALOG);
  const getops::RecallScorer scorer(catalog);
  auto authoritative = nlohmann::json(scorer.validate(
      "f01",
      "A quote shows available buying or selling interest with price and size. "
      "A trade is a completed execution at a specific price and quantity."));
  authoritative["id"] = "flash-f01-authoritative";
  authoritative["createdAt"] = "2026-07-16T11:20:30.000Z";
  state["flashAttempts"].push_back(authoritative);
  getops::StateValidator::validate_recall_evidence(state, scorer);

  auto forged_evidence = state;
  forged_evidence["flashAttempts"][1]["coverageScore"] =
      forged_evidence["flashAttempts"][1]["coverageScore"].get<int>() - 1;
  forged_evidence["flashAttempts"][1]["score"] =
      forged_evidence["flashAttempts"][1]["score"].get<int>() - 1;
  expect_domain_error(
      [&forged_evidence, &scorer]() {
        getops::StateValidator::validate_recall_evidence(forged_evidence, scorer);
      },
      "state_score_invalid");

  auto bad_total = state;
  bad_total["flashAttempts"][0]["score"] = 99;
  expect_domain_error(
      [&bad_total]() { getops::StateValidator::validate(bad_total); },
      "state_invalid");

  auto duplicate_attempt = state;
  duplicate_attempt["flashAttempts"][1]["id"] = duplicate_attempt["flashAttempts"][0]["id"];
  expect_domain_error(
      [&duplicate_attempt]() { getops::StateValidator::validate(duplicate_attempt); },
      "state_invalid");

  auto invalid_card = state;
  invalid_card["flashActiveId"] = "f999";
  expect_domain_error(
      [&invalid_card]() { getops::StateValidator::validate(invalid_card); },
      "state_invalid");

  auto invalid_type = state;
  invalid_type["flashDrafts"] = nlohmann::json::array();
  expect_domain_error(
      [&invalid_type]() { getops::StateValidator::validate(invalid_type); },
      "state_invalid");

  if (failures != 0) {
    std::cerr << failures << " assertion(s) failed.\n";
    return EXIT_FAILURE;
  }
  std::cout << "State validation assertions passed.\n";
  return EXIT_SUCCESS;
}
