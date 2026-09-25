-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: orgmaster.session-principal.v2
-- compatibility: backward-compatible
-- governance-review: DEV-057 / DEV-014

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SELECT pg_advisory_xact_lock(
  hashtext('dev057-session-principal-policy-path'),
  hashtext(current_database())
);
SET LOCAL ROLE jenfu_orgmaster_migrator;

-- Forward-only correction: migration 022 read applicationRoles/applications at
-- the published-version root, but governance stores both under policy.
-- Preserve the v2 signature and ACL while restoring admission eligibility.
-- v1 admitted only employees with an OrgMaster role.  The managed-login
-- bridge also needs a session for an employee who has a published AI-PDM
-- assignment; OrgMaster's API permission checks still fail closed for every
-- OrgMaster capability that the employee does not hold.  Keep v1 intact and
-- publish an additive v2 contract for the wider session bootstrap boundary.
CREATE OR REPLACE VIEW orgmaster_contract.v_orgmaster_session_principals_v2
WITH (security_barrier = true) AS
WITH active_governance AS (
  SELECT artifact.payload
  FROM orgmaster_core.persistence_authority authority
  JOIN orgmaster_core.persistence_batches batch
    ON batch.id = authority.active_batch_id
   AND batch.status = 'active'
  JOIN orgmaster_core.persistence_artifacts artifact
    ON artifact.batch_id = batch.id
   AND artifact.artifact_key = 'orgmaster-governance.v3.json'
   AND artifact.artifact_kind = 'governance'
  WHERE authority.singleton = true
), active_version AS (
  SELECT version.value AS payload
  FROM active_governance governance
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(governance.payload->'publishedVersions') = 'array'
      THEN governance.payload->'publishedVersions' ELSE '[]'::jsonb END
  ) version(value)
  WHERE version.value->>'id' = governance.payload->>'activePolicyVersionId'
    AND version.value->>'kind' = 'assignment-governance-v3'
), eligible_employees AS (
  SELECT DISTINCT assignment.value->>'employeeId' AS employee_id
  FROM active_version version
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(version.payload#>'{policy,roleAssignments}') = 'array'
      THEN version.payload#>'{policy,roleAssignments}' ELSE '[]'::jsonb END
  ) assignment(value)
  WHERE assignment.value->>'applicationId' IN ('orgmaster', 'ai-pdm')
    AND assignment.value->>'status' = 'active'
    AND (assignment.value->>'validFrom' IS NULL OR (assignment.value->>'validFrom')::timestamptz <= CURRENT_TIMESTAMP)
    AND (assignment.value->>'validTo' IS NULL OR (assignment.value->>'validTo')::timestamptz > CURRENT_TIMESTAMP)
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(version.payload#>'{policy,applicationRoles}') = 'array'
          THEN version.payload#>'{policy,applicationRoles}' ELSE '[]'::jsonb END
      ) role(value)
      WHERE role.value->>'id' = assignment.value->>'roleId'
        AND role.value->>'applicationId' = assignment.value->>'applicationId'
        AND role.value->>'status' = 'active'
    )
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(version.payload#>'{policy,applications}') = 'array'
          THEN version.payload#>'{policy,applications}' ELSE '[]'::jsonb END
      ) application(value)
      WHERE application.value->>'id' = assignment.value->>'applicationId'
        AND application.value->>'status' = 'active'
    )
)
SELECT
  'orgmaster.session-principal.v2'::text AS contract_version,
  mapping.principal_issuer,
  mapping.principal_subject,
  mapping.principal_id,
  mapping.employee_id,
  mapping.employee_status,
  mapping.mapping_version,
  mapping.published_at
FROM orgmaster_contract.v_active_principal_mappings_v1 mapping
JOIN eligible_employees eligible
  ON eligible.employee_id = mapping.employee_id
WHERE mapping.employee_status = 'active';

ALTER VIEW orgmaster_contract.v_orgmaster_session_principals_v2 OWNER TO jenfu_orgmaster_migrator;
REVOKE ALL ON orgmaster_contract.v_orgmaster_session_principals_v2 FROM PUBLIC, jenfu_platform_runtime, jenfu_ai_pdm_runtime;
GRANT SELECT ON orgmaster_contract.v_orgmaster_session_principals_v2 TO jenfu_orgmaster_runtime;

COMMIT;
