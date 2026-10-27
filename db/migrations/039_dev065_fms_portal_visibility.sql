-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: orgmaster.portal-app-visibility.v1
-- compatibility: backward-compatible
-- governance-review: DEV-065/068
--
-- Reuse the authoritative FMS projection when exposing Portal visibility.
-- Management grants alone do not open the application; at least one effective
-- FMS business-role assignment is required.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtext('dev065-fms-portal-visibility'), hashtext(current_database()));
SET LOCAL ROLE jenfu_orgmaster_migrator;

CREATE OR REPLACE VIEW orgmaster_contract.v_portal_app_visibility_v1
WITH (security_barrier = true)
AS
WITH active_governance AS (
  SELECT artifact.payload
    FROM orgmaster_core.persistence_authority authority
    JOIN orgmaster_core.persistence_batches batch
      ON batch.id = authority.active_batch_id
     AND batch.status = 'active'
    JOIN orgmaster_core.persistence_artifacts artifact
      ON artifact.batch_id = batch.id
     AND artifact.artifact_kind = 'governance'
     AND artifact.artifact_key = 'orgmaster-governance.v3.json'
   WHERE authority.singleton = true
), active_version AS (
  SELECT version.value AS version_payload
    FROM active_governance governance
   CROSS JOIN LATERAL jsonb_array_elements(
     CASE WHEN jsonb_typeof(governance.payload->'publishedVersions') = 'array'
       THEN governance.payload->'publishedVersions' ELSE '[]'::jsonb END
   ) version(value)
   WHERE version.value->>'id' = governance.payload->>'activePolicyVersionId'
     AND version.value->>'kind' = 'assignment-governance-v3'
), active_accounts AS (
  SELECT account.principal_issuer,
         account.principal_subject,
         account.principal_id,
         account.employee_id
    FROM (
      SELECT typed.*,
             count(*) OVER (
               PARTITION BY typed.principal_issuer, typed.principal_subject
             ) AS pair_row_count
        FROM orgmaster_contract.v_active_principal_accounts_v1 typed
    ) account
   WHERE account.pair_row_count = 1
), orgmaster_visible AS (
  SELECT 'orgmaster'::text AS application_id,
         principal.principal_issuer,
         principal.principal_subject,
         (version.version_payload->>'versionNumber')::bigint AS assignment_version
    FROM active_version version
   CROSS JOIN LATERAL jsonb_array_elements(
     CASE WHEN jsonb_typeof(version.version_payload#>'{policy,roleAssignments}') = 'array'
       THEN version.version_payload#>'{policy,roleAssignments}' ELSE '[]'::jsonb END
   ) assignment(value)
    JOIN active_accounts principal
      ON principal.employee_id = assignment.value->>'employeeId'
     AND (
       (
         assignment.value->>'subjectKind' = 'employee'
         AND assignment.value->'targetPrincipalId' = 'null'::jsonb
       )
       OR (
         assignment.value->>'subjectKind' = 'principal'
         AND assignment.value->>'targetPrincipalId' = principal.principal_id
       )
     )
   WHERE assignment.value->>'applicationId' = 'orgmaster'
     AND assignment.value->>'status' = 'active'
     AND NULLIF(assignment.value->>'employeeId', '') IS NOT NULL
     AND NULLIF(assignment.value->>'roleId', '') IS NOT NULL
     AND NULLIF(assignment.value->>'validFrom', '') IS NOT NULL
     AND (assignment.value->>'validFrom')::timestamptz <= CURRENT_TIMESTAMP
     AND (
       assignment.value->>'validTo' IS NULL
       OR (assignment.value->>'validTo')::timestamptz > CURRENT_TIMESTAMP
     )
     AND EXISTS (
       SELECT 1
         FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(version.version_payload#>'{policy,applicationRoles}') = 'array'
             THEN version.version_payload#>'{policy,applicationRoles}' ELSE '[]'::jsonb END
         ) role(value)
        WHERE role.value->>'id' = assignment.value->>'roleId'
          AND role.value->>'applicationId' = 'orgmaster'
          AND role.value->>'status' = 'active'
     )
), ai_pdm_visible AS (
  SELECT 'ai-pdm'::text AS application_id,
         principal.principal_issuer,
         principal.principal_subject,
         pdm_grant.assignment_version
    FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v4 pdm_grant
    JOIN active_accounts principal
      ON principal.principal_id = pdm_grant.principal_id
     AND principal.employee_id = pdm_grant.employee_id
), fms_visible AS (
  SELECT 'financial-management-system'::text AS application_id,
         principal.principal_issuer,
         principal.principal_subject,
         (version.version_payload->>'versionNumber')::bigint AS assignment_version
    FROM active_version version
    JOIN orgmaster_contract.v_fms_authority_v1 authority
      ON authority.assignment_version = version.version_payload->>'id'
    JOIN active_accounts principal
      ON principal.principal_id = authority.principal_id
     AND principal.employee_id = authority.employee_id
   WHERE jsonb_array_length(authority.assignments) > 0
)
SELECT application_id,
       principal_issuer,
       principal_subject,
       max(assignment_version) AS assignment_version,
       'visible'::text AS visibility_state
  FROM (
    SELECT * FROM orgmaster_visible
    UNION ALL
    SELECT * FROM ai_pdm_visible
    UNION ALL
    SELECT * FROM fms_visible
  ) visible
 WHERE NULLIF(principal_issuer, '') IS NOT NULL
   AND NULLIF(principal_subject, '') IS NOT NULL
 GROUP BY application_id, principal_issuer, principal_subject;

ALTER VIEW orgmaster_contract.v_portal_app_visibility_v1
  OWNER TO jenfu_orgmaster_migrator;

REVOKE ALL ON orgmaster_contract.v_portal_app_visibility_v1
  FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime,
    jenfu_ai_pdm_runtime, jenfu_ai_pdm_migrator, jenfu_platform_migrator;
GRANT SELECT ON orgmaster_contract.v_portal_app_visibility_v1
  TO jenfu_platform_runtime;

COMMENT ON VIEW orgmaster_contract.v_portal_app_visibility_v1 IS
  'Portal visibility for effective OrgMaster, AI-PDM, and FMS business-role assignments.';

COMMIT;
