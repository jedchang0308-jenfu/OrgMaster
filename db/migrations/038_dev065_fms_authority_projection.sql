-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: jenfu.orgmaster.fms-authority.v1
-- compatibility: new-version
-- governance-review: ORGMASTER/DEV-059, DEV-065/068
--
-- FMS receives a narrow owner projection. It reads only the active persistence
-- batch, the active published V3 policy, the current workspace artifact, and
-- the typed Principal adapter. Drafts, migration 009 relations, and bundled
-- catalog fixtures are intentionally outside this contract.
-- manifest_hash is the lowercase SHA-256 of the complete UTF-8 manifest file;
-- it is a content pin, not a detached signature.
-- Existing assignments on an existing_only role may retain a prior catalog
-- version only when the published V3 history supplies its exact content hash;
-- the wire still binds effective catalogVersion/catalogSha256 to the active
-- release and carries the prior version/hash as authoring provenance.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtext('dev065-fms-authority-projection'), hashtext(current_database()));
SET LOCAL ROLE jenfu_orgmaster_migrator;

CREATE VIEW orgmaster_contract.v_fms_authority_v1
WITH (security_barrier = true)
AS
WITH active_batch AS (
  SELECT batch.id
    FROM orgmaster_core.persistence_authority authority
    JOIN orgmaster_core.persistence_batches batch
      ON batch.id = authority.active_batch_id
     AND batch.status = 'active'
   WHERE authority.singleton = true
), governance AS (
  SELECT artifact.payload,
         trim(artifact.canonical_sha256) AS governance_revision
    FROM active_batch
    JOIN orgmaster_core.persistence_artifacts artifact
      ON artifact.batch_id = active_batch.id
     AND artifact.artifact_kind = 'governance'
     AND artifact.artifact_key = 'orgmaster-governance.v3.json'
), active_version AS (
  SELECT version.value AS payload,
         governance.governance_revision
    FROM governance
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(governance.payload->'publishedVersions') = 'array'
        THEN governance.payload->'publishedVersions' ELSE '[]'::jsonb END
    ) version(value)
   WHERE version.value->>'id' = governance.payload->>'activePolicyVersionId'
     AND version.value->>'kind' = 'assignment-governance-v3'
), current_workspace AS (
  SELECT manifest.payload->>'currentVersionId' AS workspace_version_id,
         workspace.payload AS payload,
         trim(workspace.canonical_sha256) AS workspace_revision
    FROM active_batch
    JOIN orgmaster_core.persistence_artifacts manifest
      ON manifest.batch_id = active_batch.id
     AND manifest.artifact_kind = 'workspace-manifest'
     AND manifest.artifact_key = 'orgmaster-workspace.v1.json'
    JOIN orgmaster_core.persistence_artifacts workspace
      ON workspace.batch_id = active_batch.id
     AND workspace.artifact_kind = 'workspace-version'
     AND workspace.artifact_key = 'orgmaster-versions/' || (manifest.payload->>'currentVersionId') || '.json'
   WHERE workspace.payload->>'kind' = 'document'
     AND trim(workspace.canonical_sha256) ~ '^[a-f0-9]{64}$'
), current_workspace_employees AS (
  SELECT employee.value->>'id' AS employee_id
    FROM current_workspace workspace
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(workspace.payload#>'{state,employees}') = 'array'
        THEN workspace.payload#>'{state,employees}' ELSE '[]'::jsonb END
    ) employee(value)
   WHERE employee.value->>'status' = 'active'
), fms_catalog AS (
  SELECT catalog.value AS payload,
         active_version.payload AS version_payload,
         active_version.governance_revision
    FROM active_version
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(active_version.payload->'externalRoleCatalogs') = 'array'
        THEN active_version.payload->'externalRoleCatalogs' ELSE '[]'::jsonb END
    ) catalog(value)
   WHERE catalog.value->>'applicationId' = 'financial-management-system'
     AND catalog.value->>'sourceKind' = 'application-contract'
     AND catalog.value->>'validationState' = 'valid'
     AND catalog.value->>'effectState' = 'not-synchronized'
     AND catalog.value->>'contentSha256' ~ '^[a-f0-9]{64}$'
     AND catalog.value->>'artifactSha256' ~ '^[a-f0-9]{64}$'
     AND NULLIF(catalog.value->>'publishedByPrincipalId', '') IS NOT NULL
     AND NULLIF(catalog.value->>'publishedByEmployeeId', '') IS NOT NULL
), published_fms_catalogs AS (
  SELECT catalog.value AS payload
    FROM governance
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(governance.payload->'publishedVersions') = 'array'
        THEN governance.payload->'publishedVersions' ELSE '[]'::jsonb END
    ) version(value)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(version.value->'externalRoleCatalogs') = 'array'
        THEN version.value->'externalRoleCatalogs' ELSE '[]'::jsonb END
    ) catalog(value)
   WHERE catalog.value->>'applicationId' = 'financial-management-system'
     AND catalog.value->>'sourceKind' = 'application-contract'
     AND catalog.value->>'validationState' = 'valid'
     AND catalog.value->>'effectState' = 'not-synchronized'
     AND catalog.value->>'contentSha256' ~ '^[a-f0-9]{64}$'
     AND catalog.value->>'artifactSha256' ~ '^[a-f0-9]{64}$'
     AND NULLIF(catalog.value->>'publishedByPrincipalId', '') IS NOT NULL
     AND NULLIF(catalog.value->>'publishedByEmployeeId', '') IS NOT NULL
), typed_principals AS (
  SELECT account.principal_id,
         max(account.employee_id) AS employee_id,
         max(account.account_type) AS account_type,
         max(account.mapping_version)::text AS principal_binding_version
    FROM orgmaster_contract.v_active_principal_accounts_v1 account
    JOIN current_workspace_employees employee
      ON employee.employee_id = account.employee_id
   WHERE account.employee_status = 'active'
     AND account.account_type IN ('human_personal', 'human_privileged')
     AND account.principal_id IS NOT NULL
     AND account.employee_id IS NOT NULL
    GROUP BY account.principal_id
  HAVING count(*) = 1
     AND count(DISTINCT account.employee_id) = 1
     AND count(DISTINCT account.account_type) = 1
     AND count(DISTINCT (account.principal_issuer, account.principal_subject)) = 1
     AND count(DISTINCT account.mapping_version) = 1
), valid_assignments AS (
  SELECT principal.principal_id,
         principal.employee_id,
         principal.principal_binding_version,
         version.payload AS version_payload,
         version.governance_revision,
         workspace.workspace_version_id,
         workspace.workspace_revision,
         catalog.payload AS catalog_payload,
         assignment.value AS assignment_payload,
         authoring.content_sha256 AS authoring_catalog_sha256
    FROM active_version version
    JOIN current_workspace workspace ON true
    JOIN fms_catalog catalog ON catalog.version_payload = version.payload
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(version.payload#>'{policy,roleAssignments}') = 'array'
        THEN version.payload#>'{policy,roleAssignments}' ELSE '[]'::jsonb END
    ) assignment(value)
    JOIN typed_principals principal
      ON principal.employee_id = assignment.value->>'employeeId'
     AND principal.account_type = 'human_personal'
    LEFT JOIN LATERAL (
      SELECT max(historical.payload->>'contentSha256') AS content_sha256
        FROM published_fms_catalogs historical
       WHERE historical.payload->>'catalogVersion' = COALESCE(assignment.value->>'authoringCatalogVersion', assignment.value->>'catalogVersion')
       HAVING count(DISTINCT historical.payload->>'contentSha256') = 1
    ) authoring ON true
   WHERE assignment.value->>'applicationId' = 'financial-management-system'
     AND assignment.value->>'status' = 'active'
     AND assignment.value->>'subjectKind' = 'employee'
     AND assignment.value->>'targetPrincipalId' IS NULL
     AND assignment.value#>>'{scope,kind}' = 'workspace'
     AND assignment.value#>>'{scope,value}' = 'company-jenfu'
     AND NULLIF(assignment.value->>'id', '') IS NOT NULL
     AND NULLIF(assignment.value->>'roleId', '') IS NOT NULL
     AND NULLIF(assignment.value->>'validFrom', '') IS NOT NULL
     AND (assignment.value->>'validFrom')::timestamptz <= CURRENT_TIMESTAMP
     AND (assignment.value->>'validTo' IS NULL OR (assignment.value->>'validTo')::timestamptz > CURRENT_TIMESTAMP)
     AND (
       assignment.value->>'catalogVersion' = catalog.payload->>'catalogVersion'
       OR (
         EXISTS (
           SELECT 1
             FROM jsonb_array_elements(CASE WHEN jsonb_typeof(catalog.payload->'roles') = 'array' THEN catalog.payload->'roles' ELSE '[]'::jsonb END) role(value)
            WHERE role.value->>'stableRoleId' = assignment.value->>'roleId'
              AND role.value->>'assignmentPolicy' = 'existing_only'
         )
         AND authoring.content_sha256 IS NOT NULL
       )
     )
     AND authoring.content_sha256 IS NOT NULL
     AND COALESCE(assignment.value->>'authoringCatalogSha256', authoring.content_sha256) = authoring.content_sha256
     AND authoring.content_sha256 ~ '^[a-f0-9]{64}$'
     AND EXISTS (
       SELECT 1
         FROM jsonb_array_elements(CASE WHEN jsonb_typeof(catalog.payload->'roles') = 'array' THEN catalog.payload->'roles' ELSE '[]'::jsonb END) role(value)
        WHERE role.value->>'stableRoleId' = assignment.value->>'roleId'
          AND role.value->>'status' = 'active'
          AND role.value->>'subjectKind' = 'employee'
          AND role.value->>'assignmentTier' = 'app_admin'
          AND role.value->'allowedScopeKinds' ? 'workspace'
     )
), valid_grants AS (
  SELECT principal.principal_id,
         principal.employee_id,
         principal.principal_binding_version,
         version.payload AS version_payload,
         version.governance_revision,
         workspace.workspace_version_id,
         workspace.workspace_revision,
         catalog.payload AS catalog_payload,
         grant_row.value AS grant_payload
    FROM active_version version
    JOIN current_workspace workspace ON true
    JOIN fms_catalog catalog ON catalog.version_payload = version.payload
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(version.payload#>'{policy,managementGrants}') = 'array'
        THEN version.payload#>'{policy,managementGrants}' ELSE '[]'::jsonb END
    ) grant_row(value)
    JOIN typed_principals principal
      ON principal.principal_id = grant_row.value->>'principalId'
     AND principal.employee_id = grant_row.value->>'employeeId'
   WHERE grant_row.value->>'applicationId' = 'financial-management-system'
     AND grant_row.value->>'status' = 'active'
     AND NULLIF(grant_row.value->>'id', '') IS NOT NULL
     AND grant_row.value->>'capability' IN (
       'financial-management-system.catalog.read',
       'financial-management-system.catalog.edit',
       'financial-management-system.catalog.publish',
       'financial-management-system.catalog.import',
       'financial-management-system.catalog.activate',
       'financial-management-system.workflow.read',
       'financial-management-system.workflow.edit',
       'financial-management-system.workflow.publish',
       'financial-management-system.workflow.activate',
       'financial-management-system.workflow.reassign'
     )
     AND NULLIF(grant_row.value->>'validFrom', '') IS NOT NULL
     AND (grant_row.value->>'validFrom')::timestamptz <= CURRENT_TIMESTAMP
     AND (grant_row.value->>'validTo' IS NULL OR (grant_row.value->>'validTo')::timestamptz > CURRENT_TIMESTAMP)
), authority_principals AS (
  SELECT DISTINCT ON (principal_id, employee_id)
         principal_id, employee_id, principal_binding_version, version_payload,
         governance_revision, workspace_version_id, workspace_revision, catalog_payload
    FROM (
      SELECT principal_id, employee_id, principal_binding_version, version_payload,
             governance_revision, workspace_version_id, workspace_revision, catalog_payload
        FROM valid_assignments
      UNION ALL
      SELECT principal_id, employee_id, principal_binding_version, version_payload,
             governance_revision, workspace_version_id, workspace_revision, catalog_payload
        FROM valid_grants
    ) source
   ORDER BY principal_id, employee_id
)
SELECT 'jenfu.orgmaster.fms-authority.v1'::text AS contract_version,
       'abdbcf13cdaea492a8e506d274800b74e2336dafd38be221efa1f4b14d28c6c2'::text AS manifest_hash,
       'financial-management-system'::text AS application_id,
       principal.principal_id,
       principal.employee_id,
       principal.principal_binding_version,
       CURRENT_TIMESTAMP AS read_at,
       principal.governance_revision,
       principal.version_payload->>'id' AS assignment_version,
       principal.workspace_version_id,
       principal.workspace_revision,
       principal.catalog_payload->>'catalogVersion' AS catalog_version,
       principal.catalog_payload->>'contentSha256' AS catalog_content_sha256,
       principal.catalog_payload->>'artifactSha256' AS catalog_artifact_sha256,
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
           'principalId', assignment.principal_id,
           'employeeId', assignment.employee_id,
           'assignmentId', assignment.assignment_payload->>'id',
           'stableRoleId', assignment.assignment_payload->>'roleId',
           'scope', jsonb_build_object('kind', assignment.assignment_payload#>>'{scope,kind}', 'key', assignment.assignment_payload#>>'{scope,value}'),
           'validFrom', assignment.assignment_payload->>'validFrom',
           'validUntil', assignment.assignment_payload->>'validTo',
           'revokedAt', NULL,
           'catalogVersion', assignment.catalog_payload->>'catalogVersion',
           'catalogSha256', assignment.catalog_payload->>'contentSha256',
           'assignmentVersion', assignment.version_payload->>'id',
           'sourceAssignmentId', assignment.assignment_payload->>'id',
           'authoringCatalogVersion', COALESCE(assignment.assignment_payload->>'authoringCatalogVersion', assignment.assignment_payload->>'catalogVersion'),
           'authoringCatalogSha256', COALESCE(assignment.assignment_payload->>'authoringCatalogSha256', assignment.authoring_catalog_sha256)
         ) ORDER BY assignment.assignment_payload->>'id')
         FROM valid_assignments assignment
        WHERE assignment.principal_id = principal.principal_id
          AND assignment.employee_id = principal.employee_id
       ), '[]'::jsonb) AS assignments,
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
           'grantId', grant_row.grant_payload->>'id',
           'applicationId', grant_row.grant_payload->>'applicationId',
           'principalId', grant_row.grant_payload->>'principalId',
           'operation', replace(grant_row.grant_payload->>'capability', 'financial-management-system.', ''),
           'revision', grant_row.governance_revision,
           'validFrom', grant_row.grant_payload->>'validFrom',
           'validUntil', grant_row.grant_payload->>'validTo'
         ) ORDER BY grant_row.grant_payload->>'id')
         FROM valid_grants grant_row
        WHERE grant_row.principal_id = principal.principal_id
          AND grant_row.employee_id = principal.employee_id
       ), '[]'::jsonb) AS protected_grants
  FROM authority_principals principal;

ALTER VIEW orgmaster_contract.v_fms_authority_v1 OWNER TO jenfu_orgmaster_migrator;
REVOKE ALL ON orgmaster_contract.v_fms_authority_v1
  FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime,
    jenfu_platform_migrator, jenfu_ai_pdm_migrator;
GRANT SELECT ON orgmaster_contract.v_fms_authority_v1
  TO jenfu_orgmaster_runtime, jenfu_orgmaster_migrator;

CREATE VIEW orgmaster_contract.v_fms_principal_admissions_v1
WITH (security_barrier = true)
AS
SELECT 'jenfu.orgmaster.fms-authority.v1'::text AS contract_version,
       account.principal_issuer AS identity_issuer,
       account.principal_subject AS identity_subject,
       account.principal_id,
       account.employee_id,
       account.account_type,
       true AS active,
       account.mapping_version::text AS mapping_version,
       account.mapping_version::text AS typed_account_version,
       NULL::text AS security_binding_stamp,
       CURRENT_TIMESTAMP AS read_at,
       employee.workspace_revision
  FROM orgmaster_contract.v_active_principal_accounts_v1 account
  JOIN orgmaster_core.v_current_workspace_employees_v1 employee
    ON employee.employee_id = account.employee_id
   AND employee.employee_status = 'active'
 WHERE account.employee_status = 'active'
   AND account.account_type IN ('human_personal', 'human_privileged')
   AND NULLIF(account.principal_issuer, '') IS NOT NULL
   AND NULLIF(account.principal_subject, '') IS NOT NULL
   AND NULLIF(account.principal_id, '') IS NOT NULL
   AND NULLIF(account.employee_id, '') IS NOT NULL
   AND account.mapping_version IS NOT NULL;

ALTER VIEW orgmaster_contract.v_fms_principal_admissions_v1 OWNER TO jenfu_orgmaster_migrator;
REVOKE ALL ON orgmaster_contract.v_fms_principal_admissions_v1
  FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime,
    jenfu_platform_migrator, jenfu_ai_pdm_migrator;
GRANT SELECT ON orgmaster_contract.v_fms_principal_admissions_v1
  TO jenfu_orgmaster_runtime, jenfu_orgmaster_migrator;

CREATE VIEW orgmaster_contract.v_fms_principal_candidates_v1
WITH (security_barrier = true)
AS
SELECT authority.contract_version,
       authority.manifest_hash,
       authority.application_id,
       authority.principal_id,
       authority.employee_id,
       authority.principal_binding_version,
       authority.governance_revision,
       authority.assignment_version,
       authority.workspace_version_id,
       authority.workspace_revision,
       authority.catalog_version,
       authority.catalog_content_sha256,
       authority.catalog_artifact_sha256,
       assignment.value->>'assignmentId' AS assignment_id,
       assignment.value->>'stableRoleId' AS stable_role_id,
       assignment.value#>>'{scope,kind}' AS scope_kind,
       assignment.value#>>'{scope,key}' AS scope_key,
       (assignment.value->>'validFrom')::timestamptz AS valid_from,
       (assignment.value->>'validUntil')::timestamptz AS valid_until,
       assignment.value->>'sourceAssignmentId' AS source_assignment_id,
       assignment.value->>'authoringCatalogVersion' AS authoring_catalog_version,
       assignment.value->>'authoringCatalogSha256' AS authoring_catalog_sha256
  FROM orgmaster_contract.v_fms_authority_v1 authority
  CROSS JOIN LATERAL jsonb_array_elements(authority.assignments) assignment(value);

ALTER VIEW orgmaster_contract.v_fms_principal_candidates_v1 OWNER TO jenfu_orgmaster_migrator;
REVOKE ALL ON orgmaster_contract.v_fms_principal_candidates_v1
  FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime,
    jenfu_platform_migrator, jenfu_ai_pdm_migrator;
GRANT SELECT ON orgmaster_contract.v_fms_principal_candidates_v1
  TO jenfu_orgmaster_runtime, jenfu_orgmaster_migrator;

-- The consuming FMS login is provisioned by deployment. If its restricted
-- group role is present, expose only the three versioned read projections.
DO $fms_reader$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'fms_runtime') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA orgmaster_contract TO fms_runtime';
    EXECUTE 'GRANT SELECT ON orgmaster_contract.v_fms_authority_v1 TO fms_runtime';
    EXECUTE 'GRANT SELECT ON orgmaster_contract.v_fms_principal_admissions_v1 TO fms_runtime';
    EXECUTE 'GRANT SELECT ON orgmaster_contract.v_fms_principal_candidates_v1 TO fms_runtime';
  END IF;
END;
$fms_reader$;

COMMENT ON VIEW orgmaster_contract.v_fms_authority_v1 IS
  'FMS-only active published authority. It never reads draft policy, migration 009 tables, or bundled fixtures; revoked rows are absent.';
COMMENT ON VIEW orgmaster_contract.v_fms_principal_candidates_v1 IS
  'FMS authorized workflow candidates only: exact active human_personal Principal/Employee rows with an effective assignment, scope, catalog, and publication evidence.';

COMMENT ON VIEW orgmaster_contract.v_fms_principal_admissions_v1 IS
  'FMS typed current admission over the canonical active Principal/Employee mapping. typed_account_version is the real mapping_version; security_binding_stamp is explicitly null because no such owner contract exists.';

INSERT INTO orgmaster_core.contract_manifest (contract_id, contract_version, signature_sha256, payload_sha256)
VALUES ('orgmaster.fms-authority', 'jenfu.orgmaster.fms-authority.v1', 'abdbcf13cdaea492a8e506d274800b74e2336dafd38be221efa1f4b14d28c6c2', NULL);

COMMIT;
