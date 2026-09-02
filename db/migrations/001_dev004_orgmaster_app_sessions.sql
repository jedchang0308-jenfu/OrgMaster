BEGIN;

SET LOCAL ROLE jenfu_platform_migrator;

CREATE SCHEMA IF NOT EXISTS orgmaster AUTHORIZATION jenfu_platform_migrator;
ALTER SCHEMA orgmaster OWNER TO jenfu_platform_migrator;
REVOKE CREATE ON SCHEMA orgmaster FROM PUBLIC;

CREATE TABLE IF NOT EXISTS orgmaster.app_sessions (
  id uuid PRIMARY KEY,
  session_id_hash char(64) UNIQUE NOT NULL,
  identity_issuer text NOT NULL,
  identity_subject text NOT NULL,
  principal_id text NOT NULL,
  employee_id text NOT NULL,
  app_id text NOT NULL CHECK (app_id = 'orgmaster'),
  auth_epoch bigint NOT NULL CHECK (auth_epoch >= 0),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  revoke_reason text NULL,
  assurance_level text NOT NULL CHECK (assurance_level IN ('aal1', 'aal2')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT orgmaster_app_sessions_hash_format
    CHECK (session_id_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT orgmaster_app_sessions_issuer_length
    CHECK (char_length(identity_issuer) BETWEEN 1 AND 255),
  CONSTRAINT orgmaster_app_sessions_subject_length
    CHECK (char_length(identity_subject) BETWEEN 1 AND 255),
  CONSTRAINT orgmaster_app_sessions_principal_length
    CHECK (char_length(principal_id) BETWEEN 1 AND 255),
  CONSTRAINT orgmaster_app_sessions_employee_length
    CHECK (char_length(employee_id) BETWEEN 1 AND 255),
  CONSTRAINT orgmaster_app_sessions_expiry_order
    CHECK (expires_at > issued_at)
);

ALTER TABLE orgmaster.app_sessions OWNER TO jenfu_platform_migrator;

CREATE INDEX IF NOT EXISTS orgmaster_app_sessions_expires_at_idx
  ON orgmaster.app_sessions (expires_at);
CREATE INDEX IF NOT EXISTS orgmaster_app_sessions_identity_revoked_idx
  ON orgmaster.app_sessions (identity_issuer, identity_subject, revoked_at);

REVOKE ALL ON TABLE orgmaster.app_sessions FROM PUBLIC;
REVOKE ALL ON TABLE orgmaster.app_sessions
  FROM jenfu_platform_runtime, jenfu_ai_pdm_runtime;
GRANT USAGE ON SCHEMA orgmaster TO jenfu_orgmaster_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE orgmaster.app_sessions
  TO jenfu_orgmaster_runtime;

COMMIT;
