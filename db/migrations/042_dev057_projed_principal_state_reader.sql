-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_contract
-- contract-impact: orgmaster.projed-principal.v1
-- compatibility: additive
-- governance-review: DEV-057
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SET LOCAL ROLE jenfu_orgmaster_migrator;
-- Platform-owned SECURITY DEFINER state/epoch functions need this exact view.
-- No direct core access, new role, workload identity or business grant.
GRANT SELECT ON orgmaster_contract.v_projed_principal_admissions_v1 TO jenfu_platform_migrator;
COMMIT;
