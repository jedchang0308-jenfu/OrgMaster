-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core
-- contract-impact: correct current workspace revision to the canonical workspace artifact SHA
-- compatibility: backward-compatible
-- governance-review: DEV-014 / OrgMaster DEV-054

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SELECT pg_advisory_xact_lock(
  hashtext('dev014-workspace-revision-contract'),
  hashtext(current_database())
);
SET LOCAL ROLE jenfu_orgmaster_migrator;

CREATE OR REPLACE VIEW orgmaster_core.v_current_workspace_employees_v1
WITH (security_barrier = true) AS
WITH active_batch AS (
  SELECT b.id
    FROM orgmaster_core.persistence_authority a
    JOIN orgmaster_core.persistence_batches b
      ON b.id = a.active_batch_id
     AND b.status = 'active'
   WHERE a.singleton = true
), manifest AS (
  SELECT ab.id AS batch_id,
         p.payload->>'currentVersionId' AS current_version_id
    FROM active_batch ab
    JOIN orgmaster_core.persistence_artifacts p
      ON p.batch_id = ab.id
     AND p.artifact_key = 'orgmaster-workspace.v1.json'
     AND p.artifact_kind = 'workspace-manifest'
), current_document AS (
  SELECT trim(p.canonical_sha256) AS workspace_revision,
         m.current_version_id,
         p.payload
    FROM manifest m
    JOIN orgmaster_core.persistence_artifacts p
      ON p.batch_id = m.batch_id
     AND p.artifact_key = 'orgmaster-versions/' || m.current_version_id || '.json'
     AND p.artifact_kind = 'workspace-version'
   WHERE p.payload->>'kind' = 'document'
     AND trim(p.canonical_sha256) ~ '^[a-f0-9]{64}$'
)
SELECT m.current_version_id AS workspace_version_id,
       m.workspace_revision,
       employee.value->>'id' AS employee_id,
       CASE
         WHEN employee.value->>'status' IN ('active', 'inactive') THEN employee.value->>'status'
         ELSE 'inactive'
       END AS employee_status
  FROM current_document m
 CROSS JOIN LATERAL jsonb_array_elements(
   CASE
     WHEN jsonb_typeof(m.payload#>'{state,employees}') = 'array' THEN m.payload#>'{state,employees}'
     ELSE '[]'::jsonb
   END
 ) employee(value);

ALTER VIEW orgmaster_core.v_current_workspace_employees_v1 OWNER TO jenfu_orgmaster_migrator;
REVOKE ALL ON orgmaster_core.v_current_workspace_employees_v1
  FROM PUBLIC, jenfu_orgmaster_runtime, jenfu_platform_runtime, jenfu_ai_pdm_runtime;

COMMIT;
