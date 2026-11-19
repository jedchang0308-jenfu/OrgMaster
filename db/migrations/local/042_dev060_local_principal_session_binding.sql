-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core
-- contract-impact: orgmaster.local-principal-session-binding.v1
-- compatibility: additive
-- governance-review: ORGMASTER/DEV-060, JENFU/DEV-021
-- Local-only binding between an OrgMaster v2 native session and Platform registration.
-- No credentials, assertion grants, or parallel permission registry are stored here.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $local_target$
BEGIN
  IF current_database() !~ '^jenfu_local_[a-z0-9_]{3,51}$'
     OR COALESCE(host(inet_server_addr()), '') NOT IN ('127.0.0.1', '::1') THEN
    RAISE EXCEPTION 'LOCAL_SANDBOX_TARGET_REQUIRED';
  END IF;
END
$local_target$;
SET LOCAL ROLE jenfu_orgmaster_migrator;

CREATE TABLE orgmaster_core.local_sandbox_session_bindings (
  session_id uuid PRIMARY KEY REFERENCES orgmaster_core.app_sessions(id) ON DELETE CASCADE,
  sandbox_id text NOT NULL CHECK (sandbox_id ~ '^[a-z][a-z0-9-]{2,63}$'),
  generation uuid NOT NULL,
  registration_id uuid NOT NULL,
  portal_session_id uuid NOT NULL,
  scenario_id text NOT NULL CHECK (char_length(scenario_id) BETWEEN 1 AND 128),
  fixture_version text NOT NULL CHECK (char_length(fixture_version) BETWEEN 1 AND 128),
  fixture_hash text NOT NULL CHECK (fixture_hash ~ '^[0-9a-f]{64}$'),
  native_session_contract_version text NOT NULL CHECK (native_session_contract_version = 'jenfu.orgmaster-session.v2'),
  native_session_id_hash text NOT NULL UNIQUE CHECK (native_session_id_hash ~ '^[0-9a-f]{64}$'),
  join_digest text NOT NULL CHECK (join_digest ~ '^[0-9a-f]{64}$'),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$'),
  status text NOT NULL CHECK (status IN ('pending', 'active', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT orgmaster_local_registration_unique UNIQUE (sandbox_id, registration_id),
  CONSTRAINT orgmaster_local_idempotency_unique UNIQUE (sandbox_id, idempotency_key)
);

ALTER TABLE orgmaster_core.local_sandbox_session_bindings OWNER TO jenfu_orgmaster_migrator;
REVOKE ALL ON TABLE orgmaster_core.local_sandbox_session_bindings FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE orgmaster_core.local_sandbox_session_bindings TO jenfu_orgmaster_runtime;
COMMENT ON TABLE orgmaster_core.local_sandbox_session_bindings IS
  'Local-only native-session binding to the Platform central registration. Does not store synthetic credentials or grants.';
COMMIT;
