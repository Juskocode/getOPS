#include "getops/api_server.hpp"

#include <httplib.h>

#include <atomic>
#include <chrono>
#include <cstdint>
#include <functional>
#include <iomanip>
#include <iostream>
#include <memory>
#include <mutex>
#include <regex>
#include <sstream>
#include <string>
#include <utility>

#include <nlohmann/json.hpp>

#include "getops/catalog.hpp"
#include "getops/errors.hpp"
#include "getops/profile_repository.hpp"
#include "getops/recall.hpp"
#include "getops/state_validator.hpp"

namespace getops {
namespace {

using Handler = std::function<void(
    const httplib::Request&,
    httplib::Response&,
    const std::string&)>;

std::string generated_request_id() {
  static std::atomic<std::uint64_t> sequence{0};
  const auto now = std::chrono::steady_clock::now().time_since_epoch().count();
  std::ostringstream output;
  output << "api-" << std::hex << now << '-' << sequence.fetch_add(1);
  return output.str();
}

std::string request_id(const httplib::Request& request) {
  static const std::regex valid_pattern(R"(^[A-Za-z0-9._-]{1,100}$)");
  const auto supplied = request.get_header_value("X-Request-ID");
  return std::regex_match(supplied, valid_pattern) ? supplied : generated_request_id();
}

void common_headers(httplib::Response& response, const std::string& id) {
  response.set_header("X-Request-ID", id);
  response.set_header("X-Content-Type-Options", "nosniff");
  response.set_header("Referrer-Policy", "no-referrer");
  response.set_header("Cache-Control", "no-store");
}

void json_response(
    httplib::Response& response,
    int status,
    const nlohmann::json& payload) {
  response.status = status;
  response.set_content(payload.dump(), "application/json; charset=utf-8");
}

void error_response(
    httplib::Response& response,
    int status,
    const std::string& code,
    const std::string& message,
    const std::string& id,
    nlohmann::json details = nlohmann::json::object()) {
  details["error"] = code;
  details["message"] = message;
  details["requestId"] = id;
  json_response(response, status, details);
}

nlohmann::json parse_json_body(const httplib::Request& request) {
  const auto content_type = request.get_header_value("Content-Type");
  if (content_type.rfind("application/json", 0) != 0) {
    throw DomainError("content_type_invalid", "Content-Type must be application/json.");
  }
  if (request.body.empty()) {
    throw DomainError("body_invalid", "JSON request body is required.");
  }
  try {
    return nlohmann::json::parse(request.body);
  } catch (const nlohmann::json::exception&) {
    throw DomainError("body_invalid", "Request body is not valid JSON.");
  }
}

std::int64_t required_revision(const nlohmann::json& body) {
  if (!body.is_object() || !body.contains("revision") ||
      !body.at("revision").is_number_integer()) {
    throw DomainError("revision_invalid", "Request revision must be a non-negative integer.");
  }
  const auto revision = body.at("revision").get<std::int64_t>();
  if (revision < 0) {
    throw DomainError("revision_invalid", "Request revision must be a non-negative integer.");
  }
  return revision;
}

std::string state_etag(const std::string& profile, std::int64_t revision) {
  return "\"state-" + profile + "-r" + std::to_string(revision) + "\"";
}

nlohmann::json profile_payload(const ProfileRecord& record) {
  return {
      {"profile", record.profile},
      {"state", record.state.has_value() ? *record.state : nlohmann::json(nullptr)},
      {"revision", record.revision},
      {"updatedAt",
       record.updated_at.has_value()
           ? nlohmann::json(*record.updated_at)
           : nlohmann::json(nullptr)},
  };
}

std::string route_profile(const httplib::Request& request) {
  if (request.matches.size() < 2) {
    throw DomainError("profile_invalid", "Profile route is malformed.");
  }
  return request.matches[1].str();
}

std::string query_profile(const httplib::Request& request) {
  return request.has_param("profile") ? request.get_param_value("profile") : "local";
}

void verify_if_match(
    const httplib::Request& request,
    const std::string& profile,
    std::int64_t revision) {
  const auto supplied = request.get_header_value("If-Match");
  if (supplied.empty()) {
    throw DomainError("if_match_required", "If-Match is required for profile writes.");
  }
  if (supplied != state_etag(profile, revision)) {
    throw DomainError("if_match_invalid", "If-Match does not match the request revision.");
  }
}

}  // namespace

class ApiServer::Impl final {
 public:
  explicit Impl(Config config)
      : config_(std::move(config)),
        catalog_(Catalog::load(config_.catalog_path)),
        scorer_(catalog_),
        repository_(config_.database_url) {
    server_.set_payload_max_length(StateValidator::kMaximumSerializedBytes + 32'000);
    server_.new_task_queue = [workers = config_.worker_threads]() {
      return new httplib::ThreadPool(workers);
    };
    register_routes();
  }

  [[nodiscard]] bool run() {
    std::cout
        << nlohmann::json{
               {"event", "api_starting"},
               {"bind", config_.bind_address},
               {"port", config_.port},
               {"workers", config_.worker_threads},
               {"catalogCards", catalog_.size()},
           }
               .dump()
        << '\n';
    return server_.listen(config_.bind_address, config_.port);
  }

  void stop() { server_.stop(); }

 private:
  auto protected_handler(Handler handler) {
    return [this, handler = std::move(handler)](
               const httplib::Request& request,
               httplib::Response& response) {
      const auto id = request_id(request);
      common_headers(response, id);
      try {
        handler(request, response, id);
      } catch (const RevisionConflict& conflict) {
        nlohmann::json details{{"revision", conflict.current_revision()}};
        if (conflict.updated_at().has_value()) {
          details["updatedAt"] = *conflict.updated_at();
        }
        error_response(
            response,
            409,
            "revision_conflict",
            conflict.what(),
            id,
            std::move(details));
      } catch (const DomainError& error) {
        const int status =
            error.code() == "card_not_found" ? 404
            : error.code() == "profile_invalid" ? 400
            : error.code() == "body_invalid" || error.code() == "content_type_invalid" ||
                    error.code() == "revision_invalid" ||
                    error.code() == "if_match_required" ||
                    error.code() == "if_match_invalid"
                ? 400
                : 422;
        error_response(response, status, error.code(), error.what(), id);
      } catch (const RepositoryError& error) {
        const int status =
            error.code() == "database_unavailable" ? 503 : 500;
        log_error(id, error.code(), error.what());
        error_response(
            response,
            status,
            error.code(),
            status == 503 ? "PostgreSQL is unavailable." : "Persistence request failed.",
            id);
      } catch (const std::exception& error) {
        log_error(id, "internal_error", error.what());
        error_response(
            response,
            500,
            "internal_error",
            "The request could not be completed.",
            id);
      }
    };
  }

  void log_error(
      const std::string& request_id_value,
      const std::string& code,
      const std::string& message) {
    std::lock_guard lock(log_mutex_);
    std::cerr
        << nlohmann::json{
               {"event", "api_error"},
               {"requestId", request_id_value},
               {"code", code},
               {"detail", message},
           }
               .dump()
        << '\n';
  }

  void get_profile(
      const std::string& profile,
      const httplib::Request& request,
      httplib::Response& response) {
    StateValidator::validate_profile_id(profile);
    const auto record = repository_.load(profile);
    const auto etag = state_etag(profile, record.revision);
    response.set_header("ETag", etag);
    if (request.get_header_value("If-None-Match") == etag) {
      response.status = 304;
      return;
    }
    json_response(response, 200, profile_payload(record));
  }

  void save_profile(
      const std::string& profile,
      const nlohmann::json& body,
      const httplib::Request& request,
      httplib::Response& response,
      const std::string& id) {
    StateValidator::validate_profile_id(profile);
    const auto revision = required_revision(body);
    if (!body.contains("state") || !body.at("state").is_object()) {
      throw DomainError("state_invalid", "Request state must be a JSON object.");
    }
    StateValidator::validate_recall_evidence(body.at("state"), scorer_);
    verify_if_match(request, profile, revision);
    const auto record = repository_.save(profile, revision, body.at("state"), id);
    response.set_header("ETag", state_etag(profile, record.revision));
    json_response(response, 200, profile_payload(record));
  }

  void register_routes() {
    server_.Get(
        "/api/v1/health/live",
        protected_handler([](
                              const httplib::Request&,
                              httplib::Response& response,
                              const std::string&) {
          json_response(
              response,
              200,
              {
                  {"status", "ok"},
                  {"service", "getops-api"},
                  {"version", GETOPS_VERSION},
                  {"database", "not-checked"},
              });
        }));
    server_.Get(
        "/api/v1/health/ready",
        protected_handler([this](
                              const httplib::Request&,
                              httplib::Response& response,
                              const std::string& id) {
          if (!repository_.ready()) {
            error_response(
                response,
                503,
                "not_ready",
                "PostgreSQL schema is unavailable.",
                id);
            return;
          }
          json_response(
              response,
              200,
              {
                  {"status", "ok"},
                  {"service", "getops-api"},
                  {"version", GETOPS_VERSION},
                  {"database", "ready"},
              });
        }));
    server_.Get(
        "/api/health/live",
        protected_handler([](
                              const httplib::Request&,
                              httplib::Response& response,
                              const std::string&) {
          json_response(
              response,
              200,
              {{"status", "ok"}, {"service", "getops-api"}, {"version", GETOPS_VERSION}});
        }));
    server_.Get(
        "/api/health/ready",
        protected_handler([this](
                              const httplib::Request&,
                              httplib::Response& response,
                              const std::string& id) {
          if (!repository_.ready()) {
            error_response(response, 503, "not_ready", "PostgreSQL schema is unavailable.", id);
            return;
          }
          json_response(
              response,
              200,
              {{"status", "ok"}, {"service", "getops-api"}, {"version", GETOPS_VERSION}});
        }));

    server_.Get(
        "/api/v1/catalog/flashcards",
        protected_handler([this](
                              const httplib::Request&,
                              httplib::Response& response,
                              const std::string&) {
          response.set_header("Cache-Control", "public, max-age=300");
          json_response(response, 200, catalog_.document());
        }));
    server_.Post(
        "/api/v1/recall/validate",
        protected_handler([this](
                              const httplib::Request& request,
                              httplib::Response& response,
                              const std::string&) {
          const auto body = parse_json_body(request);
          if (!body.is_object() || !body.contains("cardId") ||
              !body.at("cardId").is_string() || !body.contains("answer") ||
              !body.at("answer").is_string()) {
            throw DomainError(
                "answer_invalid",
                "Recall request requires string cardId and answer fields.");
          }
          json_response(
              response,
              200,
              scorer_.validate(
                  body.at("cardId").get<std::string>(),
                  body.at("answer").get<std::string>()));
        }));

    server_.Get(
        R"(/api/v1/profiles/([A-Za-z0-9_-]+)/state)",
        protected_handler([this](
                              const httplib::Request& request,
                              httplib::Response& response,
                              const std::string&) {
          get_profile(route_profile(request), request, response);
        }));
    server_.Put(
        R"(/api/v1/profiles/([A-Za-z0-9_-]+)/state)",
        protected_handler([this](
                              const httplib::Request& request,
                              httplib::Response& response,
                              const std::string& id) {
          save_profile(
              route_profile(request),
              parse_json_body(request),
              request,
              response,
              id);
        }));
    server_.Get(
        R"(/api/v1/profiles/([A-Za-z0-9_-]+)/export)",
        protected_handler([this](
                              const httplib::Request& request,
                              httplib::Response& response,
                              const std::string&) {
          const auto profile = route_profile(request);
          StateValidator::validate_profile_id(profile);
          const auto record = repository_.load(profile);
          response.set_header(
              "Content-Disposition",
              "attachment; filename=\"getops-" + profile + ".json\"");
          json_response(response, 200, profile_payload(record));
        }));
    server_.Post(
        R"(/api/v1/profiles/([A-Za-z0-9_-]+)/import)",
        protected_handler([this](
                              const httplib::Request& request,
                              httplib::Response& response,
                              const std::string& id) {
          const auto profile = route_profile(request);
          const auto body = parse_json_body(request);
          const auto& state =
              body.is_object() && body.contains("state") ? body.at("state") : body;
          if (!state.is_object()) {
            throw DomainError("state_invalid", "Import state must be a JSON object.");
          }
          StateValidator::validate_recall_evidence(state, scorer_);
          const auto record = repository_.import_empty(profile, state, id);
          response.set_header("ETag", state_etag(profile, record.revision));
          json_response(response, 201, profile_payload(record));
        }));

    server_.Get(
        "/api/v1/diagnostics",
        protected_handler([this](
                              const httplib::Request&,
                              httplib::Response& response,
                              const std::string&) {
          auto diagnostics = repository_.diagnostics();
          diagnostics["serviceVersion"] = GETOPS_VERSION;
          diagnostics["catalogCards"] = catalog_.size();
          json_response(response, 200, diagnostics);
        }));

    server_.Get(
        "/api/state",
        protected_handler([this](
                              const httplib::Request& request,
                              httplib::Response& response,
                              const std::string&) {
          get_profile(query_profile(request), request, response);
        }));
    server_.Put(
        "/api/state",
        protected_handler([this](
                              const httplib::Request& request,
                              httplib::Response& response,
                              const std::string& id) {
          const auto body = parse_json_body(request);
          if (!body.is_object() || !body.contains("profile") ||
              !body.at("profile").is_string()) {
            throw DomainError("profile_invalid", "Compatibility write requires a profile.");
          }
          save_profile(
              body.at("profile").get<std::string>(),
              body,
              request,
              response,
              id);
        }));
    server_.Get(
        "/api/export",
        protected_handler([this](
                              const httplib::Request& request,
                              httplib::Response& response,
                              const std::string&) {
          const auto profile = query_profile(request);
          StateValidator::validate_profile_id(profile);
          json_response(response, 200, profile_payload(repository_.load(profile)));
        }));
    server_.Get(
        "/api/diagnostics",
        protected_handler([this](
                              const httplib::Request&,
                              httplib::Response& response,
                              const std::string&) {
          json_response(response, 200, repository_.diagnostics());
        }));

    server_.set_error_handler(
        [](const httplib::Request& request, httplib::Response& response) {
          if (!response.body.empty()) {
            return;
          }
          const auto id = request_id(request);
          common_headers(response, id);
          error_response(
              response,
              response.status == 405 ? 405 : 404,
              response.status == 405 ? "method_not_allowed" : "not_found",
              response.status == 405 ? "Method is not allowed." : "Route was not found.",
              id);
        });
    server_.set_logger([this](
                           const httplib::Request& request,
                           const httplib::Response& response) {
      std::lock_guard lock(log_mutex_);
      std::cout
          << nlohmann::json{
                 {"event", "http_request"},
                 {"requestId", response.get_header_value("X-Request-ID")},
                 {"method", request.method},
                 {"path", request.path},
                 {"status", response.status},
             }
                 .dump()
          << '\n';
    });
  }

  Config config_;
  Catalog catalog_;
  RecallScorer scorer_;
  ProfileRepository repository_;
  httplib::Server server_;
  std::mutex log_mutex_;
};

ApiServer::ApiServer(Config config) : impl_(std::make_unique<Impl>(std::move(config))) {}
ApiServer::~ApiServer() = default;

bool ApiServer::run() { return impl_->run(); }
void ApiServer::stop() { impl_->stop(); }

}  // namespace getops
