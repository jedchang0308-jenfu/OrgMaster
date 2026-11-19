-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: orgmaster.principal-display-profile.v1 (Platform display only)
-- compatibility: additive
-- governance-review: DEV-057 / JENFU DEV-015

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_orgmaster_migrator;

CREATE VIEW orgmaster_contract.v_principal_display_profiles_v1
WITH (security_barrier = true) AS
WITH active_batch AS (
  SELECT batch.id
    FROM orgmaster_core.persistence_authority authority
    JOIN orgmaster_core.persistence_batches batch
      ON batch.id = authority.active_batch_id AND batch.status = 'active'
   WHERE authority.singleton = true
), current_document AS (
  SELECT document.payload
    FROM active_batch batch
    JOIN orgmaster_core.persistence_artifacts manifest
      ON manifest.batch_id = batch.id
     AND manifest.artifact_key = 'orgmaster-workspace.v1.json'
     AND manifest.artifact_kind = 'workspace-manifest'
    JOIN orgmaster_core.persistence_artifacts document
      ON document.batch_id = batch.id
     AND document.artifact_key = 'orgmaster-versions/' || (manifest.payload->>'currentVersionId') || '.json'
     AND document.artifact_kind = 'workspace-version'
     AND document.payload->>'kind' = 'document'
), employees AS (
  SELECT employee.value->>'id' AS employee_id,
         min(NULLIF(btrim(employee.value->>'name'), '')) AS employee_name
    FROM current_document document
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(document.payload#>'{state,employees}') = 'array'
        THEN document.payload#>'{state,employees}' ELSE '[]'::jsonb END
    ) employee(value)
   GROUP BY employee.value->>'id'
  HAVING count(*) = 1 AND bool_and(employee.value->>'status' = 'active')
), principals AS (
  SELECT mapping.principal_id, min(mapping.employee_id) AS employee_id
    FROM orgmaster_contract.v_active_principal_mappings_v1 mapping
   WHERE mapping.employee_status = 'active'
   GROUP BY mapping.principal_id
  HAVING count(DISTINCT mapping.employee_id) = 1
)
SELECT principal.principal_id, principal.employee_id, employee.employee_name
  FROM principals principal
  JOIN employees employee ON employee.employee_id = principal.employee_id;

ALTER VIEW orgmaster_contract.v_principal_display_profiles_v1 OWNER TO jenfu_orgmaster_migrator;
REVOKE ALL ON orgmaster_contract.v_principal_display_profiles_v1 FROM PUBLIC;
GRANT SELECT ON orgmaster_contract.v_principal_display_profiles_v1 TO jenfu_platform_runtime;
COMMENT ON VIEW orgmaster_contract.v_principal_display_profiles_v1 IS
  'orgmaster.principal-display-profile.v1: active canonical Principal and current Employee name for Platform display; never an authorization source.';
COMMIT;
