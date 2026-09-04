-- DEV-002 S0: minimum Portal app visibility projection.
-- The Portal reads app visibility only; role, scope and identity details remain
-- inside OrgMaster / application-specific projections.
BEGIN;

SET LOCAL ROLE jenfu_platform_migrator;

CREATE VIEW access_governance.v_portal_app_visibility_v1
WITH (security_barrier = true)
AS
WITH active_batch AS (
  SELECT batch.id
  FROM orgmaster.persistence_authority AS authority
  JOIN orgmaster.persistence_batches AS batch
    ON batch.id = authority.active_batch_id
   AND batch.status = 'active'
  WHERE authority.singleton = true
), active_version AS (
  SELECT version.value AS version_payload
  FROM active_batch
  JOIN orgmaster.persistence_artifacts AS governance
    ON governance.batch_id = active_batch.id
   AND governance.artifact_kind = 'governance'
   AND governance.artifact_key = 'orgmaster-governance.v3.json'
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(governance.payload->'publishedVersions') = 'array'
      THEN governance.payload->'publishedVersions' ELSE '[]'::jsonb END
  ) AS version(value)
  WHERE version.value->>'id' = governance.payload->>'activePolicyVersionId'
    AND version.value->>'kind' = 'assignment-governance-v3'
), active_principals AS (
  SELECT
    principal_issuer,
    principal_subject,
    principal_id,
    employee_id
  FROM access_governance.v_active_principal_links_v1
), orgmaster_assignments AS (
  SELECT
    (active_version.version_payload->>'versionNumber')::bigint AS assignment_version,
    assignment.value AS assignment_payload
  FROM active_version
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(active_version.version_payload#>'{policy,roleAssignments}') = 'array'
      THEN active_version.version_payload#>'{policy,roleAssignments}' ELSE '[]'::jsonb END
  ) AS assignment(value)
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
        CASE WHEN jsonb_typeof(active_version.version_payload#>'{policy,applicationRoles}') = 'array'
          THEN active_version.version_payload#>'{policy,applicationRoles}' ELSE '[]'::jsonb END
      ) AS role(value)
      WHERE role.value->>'id' = assignment.value->>'roleId'
        AND role.value->>'applicationId' = 'orgmaster'
        AND role.value->>'status' = 'active'
    )
), orgmaster_visible AS (
  SELECT
    'orgmaster'::text AS application_id,
    principal.principal_issuer,
    principal.principal_subject,
    assignments.assignment_version
  FROM orgmaster_assignments AS assignments
  JOIN active_principals AS principal
    ON principal.employee_id = assignments.assignment_payload->>'employeeId'
   AND (
     (
       assignments.assignment_payload->>'subjectKind' = 'employee'
       AND assignments.assignment_payload->'targetPrincipalId' = 'null'::jsonb
     )
     OR (
       assignments.assignment_payload->>'subjectKind' = 'principal'
       AND assignments.assignment_payload->>'targetPrincipalId' = principal.principal_id
     )
   )
), ai_pdm_visible AS (
  SELECT
    'ai-pdm'::text AS application_id,
    effective.identity_issuer AS principal_issuer,
    effective.identity_subject AS principal_subject,
    effective.assignment_version
  FROM access_governance.v_effective_role_assignments_v1 AS effective
  WHERE effective.application_id = 'ai-pdm'
)
SELECT
  visible.application_id,
  visible.principal_issuer,
  visible.principal_subject,
  MAX(visible.assignment_version) AS assignment_version,
  'visible'::text AS visibility_state
FROM (
  SELECT * FROM orgmaster_visible
  UNION ALL
  SELECT * FROM ai_pdm_visible
) AS visible
WHERE NULLIF(visible.principal_issuer, '') IS NOT NULL
  AND NULLIF(visible.principal_subject, '') IS NOT NULL
GROUP BY visible.application_id, visible.principal_issuer, visible.principal_subject;

ALTER VIEW access_governance.v_portal_app_visibility_v1 OWNER TO jenfu_platform_migrator;

REVOKE ALL ON access_governance.v_portal_app_visibility_v1
  FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;
GRANT USAGE ON SCHEMA access_governance TO jenfu_platform_runtime;
GRANT SELECT ON access_governance.v_portal_app_visibility_v1 TO jenfu_platform_runtime;

COMMENT ON VIEW access_governance.v_portal_app_visibility_v1 IS
  'Portal minimum projection: visible application id and assignment version for an already-admitted identity. No roles, scopes or identity-directory fields are exposed.';

COMMIT;
