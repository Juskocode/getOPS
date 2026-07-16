#include <cstdlib>
#include <iostream>
#include <string>

#include <nlohmann/json.hpp>

#include "getops/catalog.hpp"
#include "getops/errors.hpp"
#include "getops/recall.hpp"

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

}  // namespace

int main() {
  const auto catalog = getops::Catalog::load(GETOPS_TEST_CATALOG);
  expect(catalog.size() == 150, "Catalog loads exactly 150 cards.");
  expect(catalog.require("f01").branch == "market", "f01 belongs to market mechanics.");
  expect(catalog.document().at("schemaVersion") == 1, "Catalog schema version is retained.");

  const getops::RecallScorer scorer(catalog);
  const auto reference = scorer.validate(
      "f01",
      "A quote shows available buying or selling interest with bid or ask price and size. "
      "A trade is a completed transaction or execution at a specific price and quantity.");
  expect(reference.score >= 75, "A complete quote-versus-trade answer clears the evidence gate.");
  expect(reference.resolved, "A complete answer resolves the card.");
  expect(reference.rubric_version == 2, "The service emits rubric version 2.");
  expect(reference.score ==
             reference.coverage_score + reference.structure_score + reference.specificity_score,
         "Recall score equals its components.");

  const auto repeated = scorer.validate(
      "f01",
      "A quote shows available buying or selling interest with bid or ask price and size. "
      "A trade is a completed transaction or execution at a specific price and quantity.");
  expect(nlohmann::json(reference) == nlohmann::json(repeated), "Recall scoring is deterministic.");

  const auto shallow = scorer.validate(
      "f01",
      "They are two different market messages and operators should know the distinction.");
  expect(shallow.score < 75, "A generic answer does not resolve the card.");
  expect(!shallow.resolved, "A weak answer remains unresolved.");

  expect_domain_error(
      [&scorer]() { static_cast<void>(scorer.validate("f999", "This is a sufficiently long answer.")); },
      "card_not_found");
  expect_domain_error(
      [&scorer]() { static_cast<void>(scorer.validate("f01", "Too short.")); },
      "answer_invalid");

  if (failures != 0) {
    std::cerr << failures << " assertion(s) failed.\n";
    return EXIT_FAILURE;
  }
  std::cout << "Catalog and recall assertions passed.\n";
  return EXIT_SUCCESS;
}
