BEGIN;

SET LOCAL ROLE jenfu_platform_migrator;

CREATE SCHEMA IF NOT EXISTS organization AUTHORIZATION jenfu_platform_migrator;
REVOKE CREATE ON SCHEMA organization FROM PUBLIC;

CREATE OR REPLACE VIEW organization.v_active_principal_mappings_v1
WITH (security_barrier = true)
AS
WITH active_governance AS (
  SELECT artifact.payload
  FROM orgmaster.persistence_authority AS authority
  JOIN orgmaster.persistence_batches AS batch
    ON batch.id = authority.active_batch_id
   AND batch.status = 'active'
  JOIN orgmaster.persistence_artifacts AS artifact
    ON artifact.batch_id = batch.id
   AND artifact.artifact_key = 'orgmaster-governance.v2.json'
   AND artifact.artifact_kind = 'governance'
  WHERE authority.singleton = true
),
active_version AS (
  SELECT version.value AS payload
  FROM active_governance AS governance
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(governance.payload->'publishedVersions') = 'array'
        THEN governance.payload->'publishedVersions'
      ELSE '[]'::jsonb
    END
  ) AS version(value)
  WHERE version.value->>'id' = governance.payload->>'activePolicyVersionId'
    AND version.value->>'kind' = 'assignment-governance-v2'
),
version_workspace AS (
  SELECT version.payload AS version_payload, workspace.payload AS workspace_payload
  FROM active_version AS version
  JOIN orgmaster.persistence_authority AS authority ON authority.singleton = true
  JOIN orgmaster.persistence_batches AS batch
    ON batch.id = authority.active_batch_id
   AND batch.status = 'active'
  JOIN orgmaster.persistence_artifacts AS workspace
    ON workspace.batch_id = batch.id
   AND workspace.artifact_kind = 'workspace-version'
   AND workspace.artifact_key =
       'orgmaster-versions/' || (version.payload#>>'{organizationSnapshot,workspaceVersionId}') || '.json'
   AND (
     trim(workspace.source_sha256) = version.payload#>>'{organizationSnapshot,workspaceRevision}'
     OR trim(workspace.canonical_sha256) = version.payload#>>'{organizationSnapshot,workspaceRevision}'
   )
),
candidate_mappings AS (
  SELECT
    version_workspace.version_payload,
    identity.value AS identity_payload,
    employee.value AS employee_payload
  FROM version_workspace
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(version_workspace.version_payload#>'{policy,identityLinks}') = 'array'
        THEN version_workspace.version_payload#>'{policy,identityLinks}'
      ELSE '[]'::jsonb
    END
  ) AS identity(value)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(version_workspace.workspace_payload#>'{state,employees}') = 'array'
        THEN version_workspace.workspace_payload#>'{state,employees}'
      ELSE '[]'::jsonb
    END
  ) AS employee(value)
  WHERE employee.value->>'id' = identity.value->>'employeeId'
)
SELECT
  'organization.active-principal.v1'::text AS contract_version,
  identity_payload->>'issuer' AS principal_issuer,
  identity_payload->>'subject' AS principal_subject,
  identity_payload->>'principalId' AS principal_id,
  identity_payload->>'employeeId' AS employee_id,
  employee_payload->>'status' AS employee_status,
  (version_payload->>'versionNumber')::bigint AS mapping_version,
  (version_payload->>'publishedAt')::timestamptz AS published_at
FROM candidate_mappings
WHERE identity_payload->>'status' = 'active'
  AND employee_payload->>'status' = 'active'
  AND NULLIF(identity_payload->>'issuer', '') IS NOT NULL
  AND NULLIF(identity_payload->>'subject', '') IS NOT NULL
  AND NULLIF(identity_payload->>'principalId', '') IS NOT NULL
  AND NULLIF(identity_payload->>'employeeId', '') IS NOT NULL
  AND (identity_payload->>'validFrom')::timestamptz <= CURRENT_TIMESTAMP
  AND (
    identity_payload->>'validTo' IS NULL
    OR (identity_payload->>'validTo')::timestamptz > CURRENT_TIMESTAMP
  );

ALTER VIEW organization.v_active_principal_mappings_v1
  OWNER TO jenfu_platform_migrator;

REVOKE ALL ON TABLE organization.v_active_principal_mappings_v1 FROM PUBLIC;
GRANT USAGE ON SCHEMA organization
  TO jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;
GRANT SELECT ON TABLE organization.v_active_principal_mappings_v1
  TO jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;

COMMENT ON VIEW organization.v_active_principal_mappings_v1 IS
  'Published, active OrgMaster issuer+subject to employee admission contract. Draft, stale workspace, inactive and expired mappings fail closed.';

COMMIT;
