#include "getops/recall.hpp"

#include <algorithm>
#include <array>
#include <cctype>
#include <cmath>
#include <string_view>
#include <unordered_set>

#include "getops/errors.hpp"

namespace getops {
namespace {

const std::unordered_set<std::string> kStopWords{
    "about", "after", "again", "also", "among", "because", "before", "being",
    "between", "could", "does", "during", "each", "from", "have", "into",
    "more", "must", "only", "other", "over", "same", "should", "such", "than",
    "that", "their", "them", "then", "there", "these", "they", "this", "those",
    "through", "under", "using", "when", "where", "which", "while", "with", "would",
};

const std::array<std::unordered_set<std::string>, 10> kSynonymGroups{{
    {"quote", "quotation"},
    {"trade", "execution", "fill", "transaction"},
    {"buy", "buying", "bid"},
    {"sell", "selling", "ask", "offer"},
    {"quantity", "size", "volume"},
    {"delay", "delayed", "latency", "lag"},
    {"stale", "staleness", "freshness"},
    {"sequence", "sequencing", "continuity"},
    {"escalate", "escalation", "notify", "notification"},
    {"displayed", "available", "shown", "visible"},
}};

const std::array<std::unordered_set<std::string>, 5> kSpecificityGroups{{
    {"timestamp", "clock", "latency", "lag", "freshness", "watermark"},
    {"sequence", "heartbeat", "gap", "duplicate", "replay", "snapshot"},
    {"queue", "cpu", "memory", "network", "throughput", "capacity", "rate"},
    {"position", "limit", "risk", "exposure", "reject", "order", "fill", "execution", "price", "size"},
    {"session", "venue", "channel", "feed", "consumer", "subscription", "reconcile", "audit", "escalate"},
}};

std::string trim(const std::string& value) {
  const auto first = value.find_first_not_of(" \t\r\n");
  if (first == std::string::npos) {
    return {};
  }
  const auto last = value.find_last_not_of(" \t\r\n");
  return value.substr(first, last - first + 1);
}

std::vector<std::string> tokenize(const std::string& value) {
  std::vector<std::string> tokens;
  std::string current;
  for (const char raw_character : value) {
    const auto character = static_cast<unsigned char>(raw_character);
    if (std::isalnum(character) != 0) {
      current.push_back(static_cast<char>(std::tolower(character)));
    } else if (!current.empty()) {
      tokens.push_back(std::move(current));
      current.clear();
    }
  }
  if (!current.empty()) {
    tokens.push_back(std::move(current));
  }
  return tokens;
}

int count_words(const std::string& value) {
  int count = 0;
  bool in_word = false;
  for (const char raw_character : value) {
    const auto character = static_cast<unsigned char>(raw_character);
    if (std::isspace(character) == 0) {
      if (!in_word) {
        ++count;
        in_word = true;
      }
    } else {
      in_word = false;
    }
  }
  return count;
}

bool equivalent_token(
    const std::unordered_set<std::string>& answer_tokens,
    const std::string& concept_token) {
  if (answer_tokens.contains(concept_token)) {
    return true;
  }
  for (const auto& group : kSynonymGroups) {
    if (!group.contains(concept_token)) {
      continue;
    }
    return std::any_of(
        group.begin(),
        group.end(),
        [&answer_tokens](const std::string& candidate) {
          return answer_tokens.contains(candidate);
        });
  }
  return false;
}

std::vector<std::string> concepts_for(const Flashcard& card) {
  std::vector<std::string> concepts;
  std::unordered_set<std::string> seen;
  const auto append = [&concepts, &seen](const std::string& source) {
    for (const auto& token : tokenize(source)) {
      if (concepts.size() == 8) {
        return;
      }
      if (token.size() < 4 || kStopWords.contains(token) || !seen.insert(token).second) {
        continue;
      }
      concepts.push_back(token);
    }
  };
  append(card.answer);
  append(card.deep_dive);
  return concepts;
}

bool contains_any(
    const std::unordered_set<std::string>& tokens,
    const std::initializer_list<std::string_view> candidates) {
  return std::any_of(
      candidates.begin(),
      candidates.end(),
      [&tokens](const std::string_view candidate) {
        return tokens.contains(std::string(candidate));
      });
}

}  // namespace

void to_json(nlohmann::json& output, const RecallResult& result) {
  output = nlohmann::json{
      {"cardId", result.card_id},
      {"answer", result.answer},
      {"rubricVersion", result.rubric_version},
      {"wordCount", result.word_count},
      {"coverageScore", result.coverage_score},
      {"structureScore", result.structure_score},
      {"specificityScore", result.specificity_score},
      {"score", result.score},
      {"verdict", result.verdict},
      {"resolved", result.resolved},
      {"matched", result.matched},
      {"missing", result.missing},
  };
}

RecallResult RecallScorer::validate(
    const std::string& card_id,
    const std::string& raw_answer) const {
  const auto& card = catalog_.require(card_id);
  const auto answer = trim(raw_answer);
  if (answer.size() < 20 || answer.size() > 1'200) {
    throw DomainError("answer_invalid", "Recall answer must contain between 20 and 1200 characters.");
  }

  const auto answer_token_list = tokenize(answer);
  const auto answer_word_count = count_words(answer);
  if (answer_word_count < 4 || answer_word_count > 500) {
    throw DomainError("answer_invalid", "Recall answer must contain between 4 and 500 words.");
  }
  const std::unordered_set<std::string> answer_tokens(
      answer_token_list.begin(),
      answer_token_list.end());
  const auto concepts = concepts_for(card);
  if (concepts.empty()) {
    throw DomainError("catalog_invalid", "Flashcard has no scorable concepts.");
  }

  RecallResult result{
      .card_id = card.id,
      .answer = answer,
      .rubric_version = 2,
      .word_count = answer_word_count,
      .coverage_score = 0,
      .structure_score = 0,
      .specificity_score = 0,
      .score = 0,
      .verdict = {},
      .resolved = false,
      .matched = {},
      .missing = {},
  };
  for (const auto& concept_token : concepts) {
    if (equivalent_token(answer_tokens, concept_token)) {
      result.matched.push_back(concept_token);
    } else {
      result.missing.push_back(concept_token);
    }
  }

  const auto coverage_ratio =
      static_cast<double>(result.matched.size()) / static_cast<double>(concepts.size());
  result.coverage_score = static_cast<int>(std::lround(coverage_ratio * 60.0));

  if (result.word_count >= 12) {
    result.structure_score += 8;
  }
  if (result.word_count >= 24) {
    result.structure_score += 4;
  }
  if (contains_any(
          answer_tokens,
          {"because", "therefore", "first", "then", "while", "before", "after", "verify", "check"})) {
    result.structure_score += 7;
  }
  if (answer.find_first_of(".;:") != std::string::npos) {
    result.structure_score += 3;
  }
  if (contains_any(answer_tokens, {"compare", "scope", "confirm", "assess", "inspect", "reconcile"})) {
    result.structure_score += 3;
  }
  result.structure_score = std::min(result.structure_score, 25);

  for (const auto& group : kSpecificityGroups) {
    const bool present = std::any_of(
        group.begin(),
        group.end(),
        [&answer_tokens](const std::string& term) {
          return answer_tokens.contains(term);
        });
    if (present) {
      result.specificity_score += 3;
    }
  }
  result.specificity_score = std::min(result.specificity_score, 15);

  result.score = std::min(
      100,
      result.coverage_score + result.structure_score + result.specificity_score);
  result.resolved = result.score >= 75;
  result.verdict =
      result.score >= 80 ? "strong" : (result.score >= 60 ? "developing" : "needs-work");
  return result;
}

}  // namespace getops
