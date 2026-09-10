#pragma once

#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "getops/catalog.hpp"

namespace getops {

struct RecallResult {
  std::string card_id;
  std::string answer;
  int rubric_version{2};
  int word_count{0};
  int coverage_score{0};
  int structure_score{0};
  int specificity_score{0};
  int score{0};
  std::string verdict;
  bool resolved{false};
  std::vector<std::string> matched;
  std::vector<std::string> missing;
};

void to_json(nlohmann::json& output, const RecallResult& result);

class RecallScorer final {
 public:
  explicit RecallScorer(const Catalog& catalog) : catalog_(catalog) {}

  [[nodiscard]] RecallResult validate(
      const std::string& card_id,
      const std::string& raw_answer) const;

 private:
  const Catalog& catalog_;
};

}  // namespace getops
