-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: additive exact-Principal FMS v4 authority reader
-- compatibility: backward-compatible
-- governance-review: DEV-070
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_orgmaster_migrator;
SELECT pg_advisory_xact_lock(hashtext('dev070-fms-authority-point-v4'), hashtext(current_database()));

-- Keep the v4 authority rules from 040 and 050. Filter the Principal before
-- expanding business assignments and exact administrator grants. The v4 view
-- remains the authority for enumeration and older consumers.
CREATE FUNCTION orgmaster_contract.read_fms_authority_for_principal_v4(p_principal_id text, p_application_id text)
RETURNS SETOF orgmaster_contract.v_fms_authority_v4
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $reader$
SELECT scoped.*
  FROM (
  WITH governance AS(
   SELECT artifact.payload AS document,artifact.canonical_sha256 AS governance_revision
   FROM orgmaster_core.persistence_authority authority
   JOIN orgmaster_core.persistence_artifacts artifact
    ON artifact.batch_id=authority.active_batch_id AND artifact.artifact_key='orgmaster-governance.v3.json'
   WHERE authority.singleton
  ),
  publication AS(
   SELECT version.value,governance.governance_revision
   FROM governance CROSS JOIN LATERAL jsonb_array_elements(governance.document->'publishedVersions') version(value)
   WHERE version.value->>'id'=governance.document->>'activePolicyVersionId'
  ),
  catalog AS(
   SELECT entry.value AS payload FROM publication
   CROSS JOIN LATERAL jsonb_array_elements(publication.value->'externalRoleCatalogs') entry(value)
   WHERE entry.value->>'applicationId'='financial-management-system' AND entry.value->>'validationState'='valid'
  ),
  base AS(
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
      WHERE account.principal_id = p_principal_id
        AND account.employee_status = 'active'
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
        AND principal.account_type IN ('human_personal', 'human_privileged')
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
   SELECT 'jenfu.orgmaster.fms-authority.v2'::text AS contract_version,
          'a7a12188c7b1bb1860f008edfca1abaced2fe3c4afa144c5457f1b5b83c571bb'::text AS manifest_hash,
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
     FROM authority_principals principal
  ),
  administrators AS(
   SELECT (grant_row.value->>'id')::uuid AS grant_id,grant_row.value->>'principalId' AS principal_id,
    grant_row.value->>'employeeId' AS employee_id,(grant_row.value->>'validFrom')::timestamptz AS valid_from,
    NULLIF(grant_row.value->>'validTo','')::timestamptz AS valid_until,
    (publication.value#>>'{policy,administration,version}')::bigint AS administration_version,
    grant_row.value#>>'{catalogBinding,catalogVersion}' AS catalog_version,
    grant_row.value#>>'{catalogBinding,contentSha256}' AS catalog_content_sha256,
    grant_row.value#>>'{catalogBinding,stableRoleId}' AS stable_role_id,
    grant_row.value#>>'{catalogBinding,roleDefinitionHash}' AS role_definition_hash,
    typed.mapping_version::text AS principal_binding_version,publication.value AS publication,catalog.payload AS catalog,
    employee.workspace_revision,employee.workspace_version_id,publication.governance_revision
   FROM publication
   CROSS JOIN LATERAL jsonb_array_elements(publication.value#>'{policy,administration,grants}') grant_row(value)
   JOIN LATERAL(
    SELECT min(mapping_version) mapping_version FROM orgmaster_contract.v_active_principal_accounts_v1 typed
    WHERE typed.principal_id=grant_row.value->>'principalId' AND typed.employee_id=grant_row.value->>'employeeId'
    HAVING count(DISTINCT employee_id)=1 AND count(DISTINCT account_type)=1
   ) typed ON true
   JOIN orgmaster_core.v_current_workspace_employees_v1 employee
    ON employee.employee_id=grant_row.value->>'employeeId' AND employee.employee_status='active'
   CROSS JOIN catalog
   WHERE grant_row.value->>'principalId'=p_principal_id
    AND grant_row.value->>'roleCode'='application_system_admin'
    AND grant_row.value->>'applicationId'='financial-management-system'
    AND grant_row.value->>'status'='active'
    AND (grant_row.value->>'validFrom')::timestamptz<=CURRENT_TIMESTAMP
    AND (grant_row.value->>'validTo' IS NULL OR (grant_row.value->>'validTo')::timestamptz>CURRENT_TIMESTAMP)
    AND grant_row.value#>>'{catalogBinding,catalogVersion}'='financial-management-system.administration.2026-11-08.v1'
    AND grant_row.value#>>'{catalogBinding,contentSha256}'='c7c3f66834213b986dd02b9eb6c785c1c4a9d27f7df1d41c8481bcfd116a392d'
    AND grant_row.value#>>'{catalogBinding,stableRoleId}'='fms-full-catalog-administration'
    AND grant_row.value#>>'{catalogBinding,roleDefinitionHash}'='c7c3f66834213b986dd02b9eb6c785c1c4a9d27f7df1d41c8481bcfd116a392d'
  ),
  principals AS(SELECT principal_id,employee_id FROM base UNION SELECT principal_id,employee_id FROM administrators)
  SELECT 'jenfu.orgmaster.fms-authority.v4'::text AS contract_version,
   'c992970e8efab4b901d13a37bc151fe15adc198436087ab6bcde24acf649ee82'::text AS manifest_hash,
   'financial-management-system'::text AS application_id,principal.principal_id,principal.employee_id,
   COALESCE(base.principal_binding_version,admin.principal_binding_version) AS principal_binding_version,
   CURRENT_TIMESTAMP AS read_at,COALESCE(base.governance_revision,trim(admin.governance_revision)) AS governance_revision,
   COALESCE(base.assignment_version,admin.publication->>'id') AS assignment_version,
   COALESCE(base.workspace_version_id,admin.workspace_version_id) AS workspace_version_id,
   COALESCE(base.workspace_revision,admin.workspace_revision) AS workspace_revision,
   COALESCE(base.catalog_version,admin.catalog->>'catalogVersion') AS catalog_version,
   COALESCE(base.catalog_content_sha256,admin.catalog->>'contentSha256') AS catalog_content_sha256,
   COALESCE(base.catalog_artifact_sha256,admin.catalog->>'artifactSha256') AS catalog_artifact_sha256,
   COALESCE(base.assignments,'[]'::jsonb) AS assignments,
   COALESCE((
    SELECT jsonb_agg(value) FROM jsonb_array_elements(COALESCE(base.protected_grants,'[]'::jsonb)) grant_row(value)
    WHERE admin.grant_id IS NULL OR value->>'operation' NOT IN('catalog.read','catalog.edit','catalog.publish','catalog.import','catalog.activate')
   ),'[]'::jsonb)
   ||CASE WHEN admin.grant_id IS NULL THEN '[]'::jsonb ELSE (
    SELECT jsonb_agg(jsonb_build_object(
     'grantId',admin.grant_id::text||':'||operation,
     'applicationId','financial-management-system','principalId',admin.principal_id,
     'operation',operation,'revision',admin.administration_version::text,
     'validFrom',to_char(admin.valid_from AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
     'validUntil',CASE WHEN admin.valid_until IS NULL THEN NULL ELSE to_char(admin.valid_until AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END))
    FROM unnest(ARRAY['catalog.read','catalog.edit','catalog.publish','catalog.import','catalog.activate']) operation
   ) END AS protected_grants
  FROM principals principal
  LEFT JOIN base USING(principal_id,employee_id)
  LEFT JOIN administrators admin USING(principal_id,employee_id)
  ) scoped
 WHERE NULLIF(p_principal_id, '') IS NOT NULL
   AND p_application_id = 'financial-management-system'
   AND scoped.application_id = p_application_id
   AND scoped.principal_id = p_principal_id;
$reader$;

REVOKE ALL ON FUNCTION orgmaster_contract.read_fms_authority_for_principal_v4(text, text) FROM PUBLIC;
DO $fms_acl$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='fms_runtime') THEN
  GRANT EXECUTE ON FUNCTION orgmaster_contract.read_fms_authority_for_principal_v4(text, text) TO fms_runtime;
 END IF;
END; $fms_acl$;

COMMENT ON FUNCTION orgmaster_contract.read_fms_authority_for_principal_v4(text, text) IS
 'Fresh exact-Principal projection with the same v4 rows and permission rules. Not an authority cache.';

COMMIT;
