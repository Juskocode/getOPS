#include "getops/profile_repository.hpp"

#include <libpq-fe.h>

#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <utility>
#include <vector>

#include "getops/state_validator.hpp"

namespace getops {
namespace {

struct ConnectionDeleter {
  void operator()(PGconn* connection) const noexcept {
    if (connection != nullptr) {
      PQfinish(connection);
    }
  }
};

struct ResultDeleter {
  void operator()(PGresult* result) const noexcept {
    if (result != nullptr) {
      PQclear(result);
    }
  }
};

using Connection = std::unique_ptr<PGconn, ConnectionDeleter>;
using Result = std::unique_ptr<PGresult, ResultDeleter>;

Connection connect(const std::string& connection_string) {
  Connection connection(PQconnectdb(connection_string.c_str()));
  if (!connection || PQstatus(connection.get()) != CONNECTION_OK) {
    const std::string message =
        connection ? PQerrorMessage(connection.get()) : "libpq returned a null connection.";
    throw RepositoryError("database_unavailable", "PostgreSQL connection failed: " + message);
  }
  return connection;
}

Result execute(
    PGconn* connection,
    const std::string& sql,
    const std::vector<std::string>& parameters = {},
    ExecStatusType expected = PGRES_TUPLES_OK) {
  std::vector<const char*> values;
  values.reserve(parameters.size());
  for (const auto& parameter : parameters) {
    values.push_back(parameter.c_str());
  }
  Result result(PQexecParams(
      connection,
      sql.c_str(),
      static_cast<int>(values.size()),
      nullptr,
      values.empty() ? nullptr : values.data(),
      nullptr,
      nullptr,
      0));
  if (!result || PQresultStatus(result.get()) != expected) {
    const std::string sql_state =
        result && PQresultErrorField(result.get(), PG_DIAG_SQLSTATE) != nullptr
            ? PQresultErrorField(result.get(), PG_DIAG_SQLSTATE)
            : "";
    const std::string message =
        result ? PQresultErrorMessage(result.get()) : PQerrorMessage(connection);
    throw RepositoryError(
        sql_state.empty() ? "database_query_failed" : "postgres_" + sql_state,
        "PostgreSQL query failed: " + message);
  }
  return result;
}

class Transaction final {
 public:
  explicit Transaction(PGconn* connection) : connection_(connection) {
    static_cast<void>(execute(connection_, "BEGIN", {}, PGRES_COMMAND_OK));
  }

  Transaction(const Transaction&) = delete;
  Transaction& operator=(const Transaction&) = delete;

  ~Transaction() {
    if (!committed_) {
      const auto result = PQexec(connection_, "ROLLBACK");
      if (result != nullptr) {
        PQclear(result);
      }
    }
  }

  void commit() {
    static_cast<void>(execute(connection_, "COMMIT", {}, PGRES_COMMAND_OK));
    committed_ = true;
  }

 private:
  PGconn* connection_;
  bool committed_{false};
};

std::optional<std::string> nullable_text(PGresult* result, int row, int column) {
  if (PQgetisnull(result, row, column) != 0) {
    return std::nullopt;
  }
  return std::string(PQgetvalue(result, row, column));
}

std::int64_t parse_integer(const char* raw_value, const char* field) {
  try {
    return std::stoll(raw_value);
  } catch (const std::exception&) {
    throw RepositoryError(
        "database_result_invalid",
        std::string("PostgreSQL returned an invalid integer for ") + field + ".");
  }
}

ProfileRecord record_from_result(
    const std::string& profile,
    PGresult* result,
    int row = 0) {
  ProfileRecord record{
      .profile = profile,
      .state = std::nullopt,
      .revision = parse_integer(PQgetvalue(result, row, 0), "revision"),
      .updated_at = nullable_text(result, row, 2),
  };
  try {
    record.state = nlohmann::json::parse(PQgetvalue(result, row, 1));
  } catch (const nlohmann::json::exception& error) {
    throw RepositoryError(
        "database_result_invalid",
        std::string("PostgreSQL returned invalid state JSON: ") + error.what());
  }
  return record;
}

constexpr auto kRecordProjection =
    "revision, state::text, "
    "to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')";

}  // namespace

RevisionConflict::RevisionConflict(
    std::int64_t expected_revision,
    std::int64_t current_revision,
    std::optional<std::string> updated_at)
    : std::runtime_error(
          "Expected revision " + std::to_string(expected_revision) +
          " but current revision is " + std::to_string(current_revision) + "."),
      expected_revision_(expected_revision),
      current_revision_(current_revision),
      updated_at_(std::move(updated_at)) {}

ProfileRepository::ProfileRepository(std::string connection_string)
    : connection_string_(std::move(connection_string)) {
  if (connection_string_.empty()) {
    throw RepositoryError("database_configuration_invalid", "PostgreSQL connection string is empty.");
  }
}

ProfileRecord ProfileRepository::load(const std::string& profile) const {
  StateValidator::validate_profile_id(profile);
  auto connection = connect(connection_string_);
  const auto result = execute(
      connection.get(),
      std::string("SELECT ") + kRecordProjection +
          " FROM profile_states WHERE profile_id = $1",
      {profile});
  if (PQntuples(result.get()) == 0) {
    return ProfileRecord{
        .profile = profile,
        .state = std::nullopt,
        .revision = 0,
        .updated_at = std::nullopt,
    };
  }
  return record_from_result(profile, result.get());
}

ProfileRecord ProfileRepository::save(
    const std::string& profile,
    std::int64_t expected_revision,
    const nlohmann::json& state,
    const std::string& request_id) const {
  StateValidator::validate_profile_id(profile);
  StateValidator::validate(state);
  if (expected_revision < 0) {
    throw RepositoryError("revision_invalid", "Expected revision cannot be negative.");
  }
  if (request_id.empty() || request_id.size() > 100) {
    throw RepositoryError("request_id_invalid", "Request ID must contain 1-100 characters.");
  }

  auto connection = connect(connection_string_);
  Transaction transaction(connection.get());
  // PostgreSQL row locks cannot lock a row that does not exist. The advisory
  // lock serializes both first creation and later updates for one profile.
  static_cast<void>(execute(
      connection.get(),
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      {profile}));
  const auto locked = execute(
      connection.get(),
      std::string("SELECT ") + kRecordProjection +
          " FROM profile_states WHERE profile_id = $1 FOR UPDATE",
      {profile});

  ProfileRecord saved;
  const auto serialized_state = state.dump();
  if (PQntuples(locked.get()) == 0) {
    if (expected_revision != 0) {
      throw RevisionConflict(expected_revision, 0, std::nullopt);
    }
    const auto inserted = execute(
        connection.get(),
        std::string(
            "INSERT INTO profile_states (profile_id, revision, state, updated_at) "
            "VALUES ($1, 1, $2::jsonb, clock_timestamp()) RETURNING ") +
            kRecordProjection,
        {profile, serialized_state});
    saved = record_from_result(profile, inserted.get());
  } else {
    const auto current = record_from_result(profile, locked.get());
    if (current.revision != expected_revision) {
      throw RevisionConflict(expected_revision, current.revision, current.updated_at);
    }
    const auto updated = execute(
        connection.get(),
        std::string(
            "UPDATE profile_states "
            "SET revision = revision + 1, state = $2::jsonb, updated_at = clock_timestamp() "
            "WHERE profile_id = $1 RETURNING ") +
            kRecordProjection,
        {profile, serialized_state});
    saved = record_from_result(profile, updated.get());
  }

  static_cast<void>(execute(
      connection.get(),
      "INSERT INTO profile_state_history "
      "(profile_id, revision, state, request_id, created_at) "
      "VALUES ($1, $2::bigint, $3::jsonb, $4, clock_timestamp())",
      {profile, std::to_string(saved.revision), serialized_state, request_id},
      PGRES_COMMAND_OK));
  static_cast<void>(execute(
      connection.get(),
      "DELETE FROM profile_state_history "
      "WHERE profile_id = $1 AND revision IN ("
      "  SELECT revision FROM profile_state_history "
      "  WHERE profile_id = $1 ORDER BY revision DESC OFFSET 200"
      ")",
      {profile},
      PGRES_COMMAND_OK));
  transaction.commit();
  return saved;
}

ProfileRecord ProfileRepository::import_empty(
    const std::string& profile,
    const nlohmann::json& state,
    const std::string& request_id) const {
  return save(profile, 0, state, request_id);
}

bool ProfileRepository::ready() const {
  try {
    auto connection = connect(connection_string_);
    const auto result = execute(
        connection.get(),
        "SELECT "
        "to_regclass('public.profile_states') IS NOT NULL "
        "AND to_regclass('public.profile_state_history') IS NOT NULL "
        "AND EXISTS (SELECT 1 FROM getops_schema_migrations WHERE version = 1)");
    return PQntuples(result.get()) == 1 &&
           std::string(PQgetvalue(result.get(), 0, 0)) == "t";
  } catch (const RepositoryError&) {
    return false;
  }
}

std::int64_t ProfileRepository::history_count(const std::string& profile) const {
  StateValidator::validate_profile_id(profile);
  auto connection = connect(connection_string_);
  const auto result = execute(
      connection.get(),
      "SELECT count(*)::text FROM profile_state_history WHERE profile_id = $1",
      {profile});
  return parse_integer(PQgetvalue(result.get(), 0, 0), "history count");
}

nlohmann::json ProfileRepository::diagnostics() const {
  auto connection = connect(connection_string_);
  const auto result = execute(
      connection.get(),
      "SELECT "
      "current_setting('server_version'), "
      "(SELECT count(*)::text FROM profile_states), "
      "(SELECT count(*)::text FROM profile_state_history), "
      "(SELECT COALESCE(max(version), 0)::text FROM getops_schema_migrations)");
  return {
      {"ready", true},
      {"serverVersion", PQgetvalue(result.get(), 0, 0)},
      {"profiles", parse_integer(PQgetvalue(result.get(), 0, 1), "profile count")},
      {"historyRows", parse_integer(PQgetvalue(result.get(), 0, 2), "history row count")},
      {"schemaVersion", parse_integer(PQgetvalue(result.get(), 0, 3), "schema version")},
  };
}

}  // namespace getops
