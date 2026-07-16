BEGIN;

CREATE TABLE IF NOT EXISTS getops_schema_migrations (
    version integer PRIMARY KEY,
    name text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS profile_states (
    profile_id varchar(40) PRIMARY KEY,
    revision bigint NOT NULL CHECK (revision >= 1),
    state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT profile_states_profile_id_format
        CHECK (profile_id ~ '^[A-Za-z0-9_-]{1,40}$')
);

CREATE TABLE IF NOT EXISTS profile_state_history (
    profile_id varchar(40) NOT NULL
        REFERENCES profile_states(profile_id) ON DELETE CASCADE,
    revision bigint NOT NULL CHECK (revision >= 1),
    state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
    request_id varchar(100) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (profile_id, revision)
);

CREATE INDEX IF NOT EXISTS profile_state_history_created_at_idx
    ON profile_state_history (created_at DESC);

INSERT INTO getops_schema_migrations (version, name)
VALUES (1, 'profile state and revision history')
ON CONFLICT (version) DO NOTHING;

COMMIT;
