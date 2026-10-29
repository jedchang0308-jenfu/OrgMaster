-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_contract
-- contract-impact: orgmaster.local-principal-lifecycle-state.v1
-- compatibility: additive
-- governance-review: ORGMASTER/DEV-060, AIPDM/DEV-126
-- Narrow local-only current version projection; grants and event payloads stay private.
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
CREATE VIEW orgmaster_contract.v_local_principal_lifecycle_state_v1
WITH (security_barrier = true) AS
SELECT DISTINCT ON (sandbox_id, generation, principal_id)
       'orgmaster.local-principal-lifecycle-state.v1'::text AS contract_version,
       sandbox_id, generation, fixture_version, fixture_hash, principal_id,
       lifecycle_version AS account_lifecycle_version,
       (state_snapshot->>'profileVersion')::integer AS profile_version,
       state_snapshot->>'principalStatus' AS principal_status,
       state_snapshot->>'employeeStatus' AS employee_status
  FROM orgmaster_contract.v_local_principal_lifecycle_events_v1
 ORDER BY sandbox_id, generation, principal_id, lifecycle_version DESC;
ALTER VIEW orgmaster_contract.v_local_principal_lifecycle_state_v1 OWNER TO jenfu_orgmaster_migrator;
REVOKE ALL ON orgmaster_contract.v_local_principal_lifecycle_state_v1 FROM PUBLIC;
GRANT USAGE ON SCHEMA orgmaster_contract TO jenfu_ai_pdm_migrator;
GRANT SELECT ON orgmaster_contract.v_local_principal_lifecycle_state_v1 TO jenfu_ai_pdm_migrator;
COMMENT ON VIEW orgmaster_contract.v_local_principal_lifecycle_state_v1 IS
  'Isolated synthetic Principal versions and statuses only. No grants or lifecycle mutation authority.';
COMMIT;
