-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: retire never-enabled ai-pdm.role-policy-consumer-compatibility.v2; retain ai-pdm.role-policy-manager.v1
-- compatibility: backward-compatible
-- governance-review: DEV-058
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_orgmaster_migrator;

-- Only the untouched initial declaration may be removed. A configured/live
-- consumer needs its own compatibility plan; this migration must not erase it.
-- No enabled consumer contract is withdrawn by this initial-state-only append.
LOCK TABLE orgmaster_core.ai_pdm_role_policy_compatibility IN ACCESS EXCLUSIVE MODE;
DO $unused$
BEGIN
  IF (SELECT count(*) = 1 AND bool_and(
       readiness = 'NOT_READY' AND compatibility_revision = 0
       AND accepted_registry_hash IS NULL AND accepted_baseline_role_identity_hash IS NULL
       AND accepted_protected_policy_hash IS NULL AND consumer_source_revision IS NULL
       AND enablement_ref IS NULL)
      FROM orgmaster_core.ai_pdm_role_policy_compatibility) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'DEV058_CONFIGURED_COMPATIBILITY_REQUIRES_MIGRATION_PLAN';
  END IF;
END;
$unused$;

-- No CASCADE: an unexpected dependency aborts the complete transaction.
DROP VIEW orgmaster_contract.v_ai_pdm_role_policy_compatibility_v2;
DROP TABLE orgmaster_core.ai_pdm_role_policy_compatibility;
DELETE FROM orgmaster_core.contract_manifest
 WHERE contract_id = 'orgmaster.ai-pdm-role-policy-consumer-compatibility-v2'
   AND contract_version = 'ai-pdm.role-policy-consumer-compatibility.v2';

-- The independent post-wait Principal/session/grant fence from 035 is unchanged.
COMMIT;
