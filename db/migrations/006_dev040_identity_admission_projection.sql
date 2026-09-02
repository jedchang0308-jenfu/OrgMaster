BEGIN;

SET LOCAL ROLE jenfu_platform_migrator;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS organization AUTHORIZATION jenfu_platform_migrator;
REVOKE CREATE ON SCHEMA organization FROM PUBLIC;

CREATE OR REPLACE VIEW organization.v_identity_admission_reconciliation_v2
WITH (security_barrier = true)
AS
WITH active_batch AS (
  SELECT batch.id, trim(batch.source_revision) AS source_revision
  FROM orgmaster.persistence_authority AS authority
  JOIN orgmaster.persistence_batches AS batch ON batch.id = authority.active_batch_id AND batch.status = 'active'
  WHERE authority.singleton = true
), governance AS (
  SELECT artifact.payload, artifact.source_sha256
  FROM active_batch
  JOIN orgmaster.persistence_artifacts AS artifact ON artifact.batch_id = active_batch.id
  WHERE artifact.artifact_key IN ('orgmaster-governance.v2.json', 'orgmaster-governance.v3.json') AND artifact.artifact_kind = 'governance'
), active_version AS (
  SELECT governance.payload AS governance_payload, governance.source_sha256, version.value AS version_payload
  FROM governance
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(governance.payload->'publishedVersions') = 'array' THEN governance.payload->'publishedVersions' ELSE '[]'::jsonb END) AS version(value)
  WHERE version.value->>'id' = governance.payload->>'activePolicyVersionId'
    AND version.value->>'kind' IN ('assignment-governance-v2', 'assignment-governance-v3')
), workspace AS (
  SELECT active_version.*, active_batch.source_revision AS batch_source_revision, artifact.payload AS workspace_payload
  FROM active_version
  JOIN active_batch ON true
  JOIN orgmaster.persistence_artifacts AS artifact ON artifact.batch_id = active_batch.id
    AND artifact.artifact_kind = 'workspace-version'
    AND artifact.artifact_key = 'orgmaster-versions/' || (active_version.version_payload#>>'{organizationSnapshot,workspaceVersionId}') || '.json'
    AND (artifact.source_sha256 = active_version.version_payload#>>'{organizationSnapshot,workspaceRevision}' OR artifact.canonical_sha256 = active_version.version_payload#>>'{organizationSnapshot,workspaceRevision}')
), admissions AS (
  SELECT workspace.*, admission.value AS admission_payload
  FROM workspace
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(workspace.version_payload#>'{policy,principalAdmissions}') = 'array' THEN workspace.version_payload#>'{policy,principalAdmissions}' ELSE '[]'::jsonb END) AS admission(value)
), links AS (
  SELECT admissions.*, link.value AS link_payload
  FROM admissions
  LEFT JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(admissions.version_payload#>'{policy,identityLinks}') = 'array' THEN admissions.version_payload#>'{policy,identityLinks}' ELSE '[]'::jsonb END) AS link(value)
    ON link.value->>'id' = admissions.admission_payload->>'identityLinkId'
), projected AS (
  SELECT
    'organization.identity-admission.v2'::text AS contract_version,
    links.batch_source_revision AS source_revision_sha256,
    (links.version_payload->>'versionNumber')::bigint AS policy_version,
    (links.version_payload->>'publishedAt')::timestamptz AS published_at,
    encode(digest('jenfu.identity-admission.principal.v1' || chr(0) || (links.link_payload->>'issuer') || chr(0) || (links.link_payload->>'subject'), 'sha256'), 'hex') AS principal_fingerprint_sha256,
    encode(digest('jenfu.identity-admission.issuer.v1' || chr(0) || (links.link_payload->>'issuer'), 'sha256'), 'hex') AS issuer_fingerprint_sha256,
    links.admission_payload->>'accountType' AS account_type,
    links.admission_payload->>'status' AS admission_status,
    links.admission_payload->>'sharedRetirementState' AS shared_retirement_state,
    CASE WHEN links.link_payload IS NULL THEN 0 ELSE 1 END::bigint AS identity_link_match_count,
    CASE WHEN links.link_payload IS NULL THEN 0 ELSE (SELECT count(*) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(links.workspace_payload#>'{state,employees}') = 'array' THEN links.workspace_payload#>'{state,employees}' ELSE '[]'::jsonb END) AS employee(value) WHERE employee.value->>'id' = links.link_payload->>'employeeId') END::bigint AS employee_match_count,
    CASE WHEN links.admission_payload->>'accountType' IN ('human_personal', 'human_privileged') THEN COALESCE((SELECT bool_or(employee.value->>'status' = 'active') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(links.workspace_payload#>'{state,employees}') = 'array' THEN links.workspace_payload#>'{state,employees}' ELSE '[]'::jsonb END) AS employee(value) WHERE employee.value->>'id' = links.link_payload->>'employeeId'), false) ELSE false END AS employee_active,
    CASE WHEN links.admission_payload->>'accountType' IN ('human_personal', 'human_privileged') THEN COALESCE((links.link_payload->>'employeeId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', false) ELSE false END AS employee_id_is_uuid_v7
  FROM links
)
SELECT * FROM projected
WHERE account_type IN ('human_personal', 'human_privileged', 'legacy_shared', 'service')
  AND admission_status IN ('active', 'inactive')
  AND source_revision_sha256 ~ '^[0-9a-f]{64}$';

ALTER VIEW organization.v_identity_admission_reconciliation_v2 OWNER TO jenfu_platform_migrator;
REVOKE ALL ON TABLE organization.v_identity_admission_reconciliation_v2 FROM PUBLIC, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;
GRANT USAGE ON SCHEMA organization TO jenfu_platform_runtime;
GRANT SELECT ON TABLE organization.v_identity_admission_reconciliation_v2 TO jenfu_platform_runtime;
COMMENT ON VIEW organization.v_identity_admission_reconciliation_v2 IS 'DEV-040 redacted identity admission reconciliation projection; never an authentication or authorization source.';

COMMIT;
