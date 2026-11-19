-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: orgmaster.local-principal-lifecycle.v1
-- compatibility: additive
-- governance-review: ORGMASTER/DEV-060, JENFU/DEV-021
-- Local-only append-only lifecycle state for manifest-bound synthetic Principals.
-- The manifest remains immutable; its lifecycle version is the baseline.

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

CREATE TABLE orgmaster_core.local_principal_lifecycle_events (
  event_id uuid PRIMARY KEY,
  contract_version text NOT NULL CHECK (contract_version = 'orgmaster.local-principal-lifecycle.v1'),
  sandbox_id text NOT NULL CHECK (sandbox_id ~ '^[a-z][a-z0-9-]{2,63}$'),
  generation uuid NOT NULL,
  fixture_version text NOT NULL CHECK (char_length(fixture_version) BETWEEN 1 AND 128),
  fixture_hash char(64) NOT NULL CHECK (fixture_hash ~ '^[0-9a-f]{64}$'),
  principal_id text NOT NULL CHECK (principal_id ~ '^local-[a-z0-9-]{1,100}$'),
  expected_lifecycle_version integer NOT NULL CHECK (expected_lifecycle_version >= 1),
  lifecycle_version integer NOT NULL CHECK (lifecycle_version = expected_lifecycle_version + 1),
  operation text NOT NULL CHECK (operation IN ('disable', 'revoke', 'grants_changed', 'profile_changed')),
  snapshot_hash char(64) NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  event_hash char(64) NOT NULL CHECK (event_hash ~ '^[0-9a-f]{64}$'),
  state_snapshot jsonb NOT NULL CHECK (
    jsonb_typeof(state_snapshot) = 'object'
    AND state_snapshot ?& ARRAY['principalStatus', 'employeeStatus', 'accountLifecycleVersion', 'profileVersion', 'grants']
    AND (state_snapshot->>'accountLifecycleVersion')::integer = lifecycle_version
    AND jsonb_typeof(state_snapshot->'grants') = 'array'
  ),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT orgmaster_local_lifecycle_version_unique
    UNIQUE (sandbox_id, generation, principal_id, lifecycle_version)
);

ALTER TABLE orgmaster_core.local_principal_lifecycle_events OWNER TO jenfu_orgmaster_migrator;
REVOKE ALL ON TABLE orgmaster_core.local_principal_lifecycle_events FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE orgmaster_core.local_principal_lifecycle_events TO jenfu_orgmaster_runtime;

CREATE VIEW orgmaster_contract.v_local_principal_lifecycle_events_v1
WITH (security_barrier = true)
AS
SELECT event.contract_version,
       event.event_id::text AS event_id,
       event.sandbox_id,
       event.generation::text AS generation,
       event.fixture_version,
       btrim(event.fixture_hash) AS fixture_hash,
       event.principal_id,
       event.expected_lifecycle_version,
       event.lifecycle_version,
       event.operation,
       btrim(event.snapshot_hash) AS snapshot_hash,
       btrim(event.event_hash) AS event_hash,
       event.state_snapshot,
       event.occurred_at
  FROM orgmaster_core.local_principal_lifecycle_events event
 WHERE event.sandbox_id = replace(substr(current_database(), char_length('jenfu_local_') + 1), '_', '-')
   AND event.principal_id ~ '^local-[a-z0-9-]{1,100}$'
   AND current_database() ~ '^jenfu_local_[a-z0-9_]{3,51}$'
   AND COALESCE(host(inet_server_addr()), '') IN ('127.0.0.1', '::1');

ALTER VIEW orgmaster_contract.v_local_principal_lifecycle_events_v1 OWNER TO jenfu_orgmaster_migrator;
REVOKE ALL ON orgmaster_contract.v_local_principal_lifecycle_events_v1 FROM PUBLIC;
GRANT SELECT ON orgmaster_contract.v_local_principal_lifecycle_events_v1
  TO jenfu_orgmaster_runtime, jenfu_platform_runtime;

CREATE TABLE orgmaster_core.local_principal_lifecycle_session_bindings (
  session_id uuid PRIMARY KEY REFERENCES orgmaster_core.app_sessions(id) ON DELETE CASCADE,
  sandbox_id text NOT NULL CHECK (sandbox_id ~ '^[a-z][a-z0-9-]{2,63}$'),
  generation uuid NOT NULL,
  principal_id text NOT NULL CHECK (principal_id ~ '^local-[a-z0-9-]{1,100}$'),
  fixture_version text NOT NULL CHECK (char_length(fixture_version) BETWEEN 1 AND 128),
  fixture_hash char(64) NOT NULL CHECK (fixture_hash ~ '^[0-9a-f]{64}$'),
  account_lifecycle_version integer NOT NULL CHECK (account_lifecycle_version >= 1),
  profile_version integer NOT NULL CHECK (profile_version >= 1),
  state_hash char(64) NOT NULL CHECK (state_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE orgmaster_core.local_principal_lifecycle_session_bindings OWNER TO jenfu_orgmaster_migrator;
REVOKE ALL ON TABLE orgmaster_core.local_principal_lifecycle_session_bindings FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE orgmaster_core.local_principal_lifecycle_session_bindings TO jenfu_orgmaster_runtime;

COMMENT ON TABLE orgmaster_core.local_principal_lifecycle_events IS
  'Append-only local synthetic Principal lifecycle state. Fixture version/hash remain the immutable baseline.';
COMMENT ON VIEW orgmaster_contract.v_local_principal_lifecycle_events_v1 IS
  'Read-only versioned OrgMaster synthetic lifecycle event and state contract for the isolated Platform verifier.';
COMMENT ON TABLE orgmaster_core.local_principal_lifecycle_session_bindings IS
  'Immutable local session binding to the owner lifecycle snapshot current at session creation.';
COMMIT;
