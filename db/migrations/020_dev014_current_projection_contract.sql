-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: preserve portal and AI-PDM projections across canonical workspace refreshes
-- compatibility: backward-compatible
-- governance-review: DEV-014 / OrgMaster DEV-055

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SELECT pg_advisory_xact_lock(
  hashtext('dev014-current-projection-contract'),
  hashtext(current_database())
);
SET LOCAL ROLE jenfu_orgmaster_migrator;

CREATE OR REPLACE VIEW orgmaster_contract.v_ai_pdm_entitlement_authority_v1
WITH (security_barrier = true)
AS
WITH active_employees AS (
  SELECT mapping.employee_id
    FROM orgmaster_contract.v_active_principal_mappings_v1 mapping
   GROUP BY mapping.employee_id
)
SELECT 'jenfu.platform-entitlement.v1'::text AS contract_version,
       app.application_id,
       COALESCE(override.authority_source, app.authority_source) AS authority_source,
       COALESCE(override.authority_version, app.authority_version) AS authority_version,
       employee.employee_id,
       COALESCE(override.updated_at, app.updated_at) AS updated_at,
       COALESCE(override.operation_id, app.operation_id) AS operation_id
  FROM orgmaster_core.application_authority_state app
 CROSS JOIN active_employees employee
  LEFT JOIN orgmaster_core.employee_authority_overrides override
    ON override.application_id = app.application_id
   AND override.employee_id = employee.employee_id
 WHERE app.application_id = 'ai-pdm';

ALTER VIEW orgmaster_contract.v_ai_pdm_entitlement_authority_v1 OWNER TO jenfu_orgmaster_migrator;

CREATE OR REPLACE VIEW orgmaster_contract.v_ai_pdm_effective_role_assignments_v1
WITH (security_barrier = true)
AS
WITH active_batch AS (
  SELECT batch.id
    FROM orgmaster_core.persistence_authority authority
    JOIN orgmaster_core.persistence_batches batch
      ON batch.id = authority.active_batch_id
     AND batch.status = 'active'
   WHERE authority.singleton = true
), active_version AS (
  SELECT version.value AS version_payload
    FROM active_batch
    JOIN orgmaster_core.persistence_artifacts governance
      ON governance.batch_id = active_batch.id
     AND governance.artifact_kind = 'governance'
     AND governance.artifact_key = 'orgmaster-governance.v3.json'
   CROSS JOIN LATERAL jsonb_array_elements(
     CASE WHEN jsonb_typeof(governance.payload->'publishedVersions') = 'array'
       THEN governance.payload->'publishedVersions' ELSE '[]'::jsonb END
   ) version(value)
   WHERE version.value->>'id' = governance.payload->>'activePolicyVersionId'
     AND version.value->>'kind' = 'assignment-governance-v3'
), current_workspace AS (
  SELECT workspace.payload AS workspace_payload
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
), version_workspace AS (
  SELECT active_version.version_payload, current_workspace.workspace_payload
    FROM active_version
   CROSS JOIN current_workspace
), governance_account_types AS (
  SELECT link.value->>'issuer' AS principal_issuer,
         link.value->>'subject' AS principal_subject,
         link.value->>'principalId' AS principal_id,
         link.value->>'employeeId' AS employee_id,
         admission.value->>'accountType' AS account_type
    FROM active_version version
   CROSS JOIN LATERAL jsonb_array_elements(
     CASE WHEN jsonb_typeof(version.version_payload#>'{policy,identityLinks}') = 'array'
       THEN version.version_payload#>'{policy,identityLinks}' ELSE '[]'::jsonb END
   ) link(value)
   CROSS JOIN LATERAL jsonb_array_elements(
     CASE WHEN jsonb_typeof(version.version_payload#>'{policy,principalAdmissions}') = 'array'
       THEN version.version_payload#>'{policy,principalAdmissions}' ELSE '[]'::jsonb END
   ) admission(value)
   WHERE link.value->>'status' = 'active'
     AND admission.value->>'identityLinkId' = link.value->>'id'
     AND admission.value->>'status' = 'active'
     AND admission.value->>'accountType' IN ('human_personal', 'human_privileged')
), active_principals AS (
  SELECT mapping.principal_issuer,
         mapping.principal_subject,
         mapping.principal_id,
         mapping.employee_id,
         COALESCE(
           CASE WHEN managed.identity_record_id IS NOT NULL THEN 'human_personal'::text END,
           governed.account_type
         ) AS account_type
    FROM orgmaster_contract.v_active_principal_mappings_v1 mapping
    LEFT JOIN orgmaster_core.managed_daily_identities managed
      ON managed.employee_id = mapping.employee_id
     AND managed.principal_id = mapping.principal_id
     AND managed.auth_issuer = mapping.principal_issuer
     AND managed.auth_subject = mapping.principal_subject
     AND managed.link_state = 'active'
    LEFT JOIN governance_account_types governed
      ON governed.employee_id = mapping.employee_id
     AND governed.principal_id = mapping.principal_id
     AND governed.principal_issuer = mapping.principal_issuer
     AND governed.principal_subject = mapping.principal_subject
), direct_grants AS (
  SELECT version_workspace.version_payload,
         version_workspace.workspace_payload,
         assignment.value AS assignment_payload,
         assignment.value->>'employeeId' AS source_employee_id,
         assignment.value->>'employeeId' AS recipient_employee_id,
         'direct'::text AS grant_kind,
         NULL::text AS delegation_id,
         assignment.value->>'id' AS projected_assignment_id,
         assignment.value->>'validFrom' AS projected_valid_from,
         assignment.value->>'validTo' AS projected_valid_until
    FROM version_workspace
   CROSS JOIN LATERAL jsonb_array_elements(
     CASE WHEN jsonb_typeof(version_workspace.version_payload#>'{policy,roleAssignments}') = 'array'
       THEN version_workspace.version_payload#>'{policy,roleAssignments}' ELSE '[]'::jsonb END
   ) assignment(value)
), delegated_grants AS (
  SELECT version_workspace.version_payload,
         version_workspace.workspace_payload,
         source.value AS assignment_payload,
         source.value->>'employeeId' AS source_employee_id,
         delegation.value->>'toEmployeeId' AS recipient_employee_id,
         'delegated'::text AS grant_kind,
         delegation.value->>'id' AS delegation_id,
         delegation.value->>'id' AS projected_assignment_id,
         delegation.value->>'validFrom' AS projected_valid_from,
         delegation.value->>'validTo' AS projected_valid_until
    FROM version_workspace
   CROSS JOIN LATERAL jsonb_array_elements(
     CASE WHEN jsonb_typeof(version_workspace.version_payload#>'{policy,roleDelegations}') = 'array'
       THEN version_workspace.version_payload#>'{policy,roleDelegations}' ELSE '[]'::jsonb END
   ) delegation(value)
    JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(version_workspace.version_payload#>'{policy,roleAssignments}') = 'array'
        THEN version_workspace.version_payload#>'{policy,roleAssignments}' ELSE '[]'::jsonb END
    ) source(value)
      ON source.value->>'id' = delegation.value->>'sourceAssignmentId'
     AND source.value->>'employeeId' = delegation.value->>'fromEmployeeId'
     AND source.value->>'roleId' = delegation.value->>'roleId'
     AND source.value->>'catalogVersion' = delegation.value->>'catalogVersion'
     AND source.value->'scope' = delegation.value->'scope'
   WHERE delegation.value->>'status' = 'active'
     AND NULLIF(delegation.value->>'validFrom', '') IS NOT NULL
     AND NULLIF(delegation.value->>'validTo', '') IS NOT NULL
     AND (delegation.value->>'validFrom')::timestamptz <= CURRENT_TIMESTAMP
     AND (delegation.value->>'validTo')::timestamptz > CURRENT_TIMESTAMP
), grants AS (
  SELECT * FROM direct_grants
  UNION ALL
  SELECT * FROM delegated_grants
), valid_grants AS (
  SELECT grants.*
    FROM grants
   WHERE assignment_payload->>'applicationId' = 'ai-pdm'
     AND assignment_payload->>'status' = 'active'
     AND NULLIF(assignment_payload->>'id', '') IS NOT NULL
     AND NULLIF(assignment_payload->>'employeeId', '') IS NOT NULL
     AND NULLIF(assignment_payload->>'roleId', '') IS NOT NULL
     AND NULLIF(assignment_payload->>'roleCodeSnapshot', '') IS NOT NULL
     AND NULLIF(assignment_payload->>'catalogVersion', '') IS NOT NULL
     AND NULLIF(assignment_payload->>'validFrom', '') IS NOT NULL
     AND (assignment_payload->>'validFrom')::timestamptz <= CURRENT_TIMESTAMP
     AND (assignment_payload->>'validTo' IS NULL OR (assignment_payload->>'validTo')::timestamptz > CURRENT_TIMESTAMP)
     AND NULLIF(projected_assignment_id, '') IS NOT NULL
     AND NULLIF(projected_valid_from, '') IS NOT NULL
     AND (projected_valid_from)::timestamptz <= CURRENT_TIMESTAMP
     AND (projected_valid_until IS NULL OR (projected_valid_until)::timestamptz > CURRENT_TIMESTAMP)
     AND (
       (
         assignment_payload->>'basis' = 'manual'
         AND jsonb_array_length(CASE WHEN jsonb_typeof(assignment_payload->'sources') = 'array' THEN assignment_payload->'sources' ELSE '[]'::jsonb END) = 0
       )
       OR (
         assignment_payload->>'basis' = 'position_adoption'
         AND EXISTS (
           SELECT 1
             FROM jsonb_array_elements(CASE WHEN jsonb_typeof(assignment_payload->'sources') = 'array' THEN assignment_payload->'sources' ELSE '[]'::jsonb END) source(value)
             JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(workspace_payload#>'{state,positions}') = 'array' THEN workspace_payload#>'{state,positions}' ELSE '[]'::jsonb END) position(value)
               ON position.value->>'id' = source.value->>'positionId'
              AND position.value->>'status' = 'active'
             JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(workspace_payload#>'{state,assignments}') = 'array' THEN workspace_payload#>'{state,assignments}' ELSE '[]'::jsonb END) position_assignment(value)
               ON position_assignment.value->>'id' = source.value->>'positionAssignmentId'
              AND position_assignment.value->>'positionId' = source.value->>'positionId'
              AND position_assignment.value->>'employeeId' = source_employee_id
            WHERE NULLIF(position_assignment.value->>'validFrom', '') IS NOT NULL
              AND (position_assignment.value->>'validFrom')::timestamptz <= CURRENT_TIMESTAMP
              AND (position_assignment.value->>'validTo' IS NULL OR (position_assignment.value->>'validTo')::timestamptz > CURRENT_TIMESTAMP)
              AND source.value->>'scopeKeySnapshot' = assignment_payload#>>'{scope,value}'
              AND (
                (source.value->>'scopeSource' = 'jenfu_workspace' AND assignment_payload#>>'{scope,kind}' = 'workspace' AND assignment_payload#>>'{scope,value}' = 'company-jenfu')
                OR (source.value->>'scopeSource' = 'fixed_project' AND assignment_payload#>>'{scope,kind}' = 'project' AND NULLIF(assignment_payload#>>'{scope,value}', '') IS NOT NULL)
              )
         )
       )
     )
), catalog_valid AS (
  SELECT valid_grants.*,
         catalog.stable_role_id,
         catalog.role_code,
         catalog.subject_kind AS catalog_subject_kind
    FROM valid_grants
    JOIN ai_pdm_contract.v_application_role_catalog_v1 catalog
      ON catalog.application_id = 'ai-pdm'
     AND catalog.stable_role_id = valid_grants.assignment_payload->>'roleId'
     AND catalog.role_code = valid_grants.assignment_payload->>'roleCodeSnapshot'
     AND catalog.assignable = true
     AND catalog.allowed_scope_kinds ? (valid_grants.assignment_payload#>>'{scope,kind}')
     AND (valid_grants.grant_kind = 'direct' OR catalog.delegation_allowed = true)
   WHERE valid_grants.assignment_payload#>>'{scope,kind}' IN ('workspace', 'project', 'global')
     AND (
       (valid_grants.assignment_payload#>>'{scope,kind}' = 'global' AND valid_grants.assignment_payload#>'{scope,value}' IS NULL)
       OR (valid_grants.assignment_payload#>>'{scope,kind}' <> 'global' AND NULLIF(valid_grants.assignment_payload#>>'{scope,value}', '') IS NOT NULL)
     )
     AND (
       valid_grants.assignment_payload->>'roleId' <> 'role-external-specialist'
       OR (
         valid_grants.assignment_payload#>>'{scope,kind}' = 'project'
         AND valid_grants.assignment_payload->>'validTo' IS NOT NULL
         AND NULLIF(valid_grants.assignment_payload#>>'{metadata,sponsorEmployeeId}', '') IS NOT NULL
         AND NULLIF(valid_grants.assignment_payload#>>'{metadata,reviewDueAt}', '') IS NOT NULL
       )
     )
), resolved AS (
  SELECT catalog_valid.*,
         principal.principal_issuer,
         principal.principal_subject,
         principal.principal_id,
         principal.employee_id,
         authority.authority_version
    FROM catalog_valid
    JOIN active_principals principal
      ON principal.employee_id = catalog_valid.recipient_employee_id
     AND (
       (catalog_valid.grant_kind = 'delegated' AND catalog_valid.catalog_subject_kind = 'employee' AND principal.account_type = 'human_personal')
       OR (
         catalog_valid.grant_kind = 'direct'
         AND catalog_valid.assignment_payload->>'subjectKind' = 'employee'
         AND catalog_valid.assignment_payload->'targetPrincipalId' = 'null'::jsonb
         AND catalog_valid.catalog_subject_kind = 'employee'
         AND principal.account_type = 'human_personal'
       )
       OR (
         catalog_valid.grant_kind = 'direct'
         AND catalog_valid.assignment_payload->>'subjectKind' = 'principal'
         AND catalog_valid.assignment_payload->>'targetPrincipalId' = principal.principal_id
         AND catalog_valid.catalog_subject_kind = 'principal'
         AND principal.account_type = 'human_privileged'
       )
     )
    JOIN orgmaster_contract.v_ai_pdm_entitlement_authority_v1 authority
      ON authority.application_id = 'ai-pdm'
     AND authority.employee_id = catalog_valid.recipient_employee_id
     AND authority.authority_source = 'orgmaster_authority'
)
SELECT 'jenfu.platform-entitlement.v1'::text AS contract_version,
       version_payload->>'id' AS assignment_version_id,
       (version_payload->>'versionNumber')::bigint AS assignment_version,
       projected_assignment_id AS assignment_id,
       grant_kind,
       delegation_id,
       'ai-pdm'::text AS application_id,
       principal_issuer AS identity_issuer,
       principal_subject AS identity_subject,
       principal_id,
       employee_id,
       CASE WHEN grant_kind = 'delegated' THEN 'employee' ELSE assignment_payload->>'subjectKind' END AS subject_kind,
       CASE WHEN grant_kind = 'delegated' THEN NULL ELSE assignment_payload->>'targetPrincipalId' END AS target_principal_id,
       stable_role_id,
       role_code,
       assignment_payload->>'catalogVersion' AS catalog_version,
       assignment_payload#>>'{scope,kind}' AS scope_kind,
       assignment_payload#>>'{scope,value}' AS scope_key,
       (projected_valid_from)::timestamptz AS valid_from,
       (projected_valid_until)::timestamptz AS valid_until,
       (version_payload->>'publishedAt')::timestamptz AS published_at,
       authority_version
  FROM resolved;

ALTER VIEW orgmaster_contract.v_ai_pdm_effective_role_assignments_v1 OWNER TO jenfu_orgmaster_migrator;

CREATE OR REPLACE VIEW orgmaster_contract.v_portal_app_visibility_v1
WITH (security_barrier = true)
AS
WITH active_governance AS (
  SELECT governance.payload
    FROM orgmaster_core.persistence_authority authority
    JOIN orgmaster_core.persistence_batches batch
      ON batch.id = authority.active_batch_id
     AND batch.status = 'active'
    JOIN orgmaster_core.persistence_artifacts governance
      ON governance.batch_id = batch.id
     AND governance.artifact_kind = 'governance'
     AND governance.artifact_key = 'orgmaster-governance.v3.json'
   WHERE authority.singleton = true
), active_version AS (
  SELECT version.value AS version_payload
    FROM active_governance governance
   CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(governance.payload->'publishedVersions') = 'array' THEN governance.payload->'publishedVersions' ELSE '[]'::jsonb END) version(value)
   WHERE version.value->>'id' = governance.payload->>'activePolicyVersionId'
     AND version.value->>'kind' = 'assignment-governance-v3'
), orgmaster_assignments AS (
  SELECT (active_version.version_payload->>'versionNumber')::bigint AS assignment_version,
         assignment.value AS assignment_payload
    FROM active_version
   CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(active_version.version_payload#>'{policy,roleAssignments}') = 'array' THEN active_version.version_payload#>'{policy,roleAssignments}' ELSE '[]'::jsonb END) assignment(value)
   WHERE assignment.value->>'applicationId' = 'orgmaster'
     AND assignment.value->>'status' = 'active'
     AND NULLIF(assignment.value->>'employeeId', '') IS NOT NULL
     AND NULLIF(assignment.value->>'roleId', '') IS NOT NULL
     AND NULLIF(assignment.value->>'validFrom', '') IS NOT NULL
     AND (assignment.value->>'validFrom')::timestamptz <= CURRENT_TIMESTAMP
     AND (assignment.value->>'validTo' IS NULL OR (assignment.value->>'validTo')::timestamptz > CURRENT_TIMESTAMP)
     AND EXISTS (
       SELECT 1
         FROM jsonb_array_elements(CASE WHEN jsonb_typeof(active_version.version_payload#>'{policy,applicationRoles}') = 'array' THEN active_version.version_payload#>'{policy,applicationRoles}' ELSE '[]'::jsonb END) role(value)
        WHERE role.value->>'id' = assignment.value->>'roleId'
          AND role.value->>'applicationId' = 'orgmaster'
          AND role.value->>'status' = 'active'
     )
), orgmaster_visible AS (
  SELECT 'orgmaster'::text AS application_id,
         principal.principal_issuer,
         principal.principal_subject,
         assignment.assignment_version
    FROM orgmaster_assignments assignment
    JOIN orgmaster_contract.v_active_principal_mappings_v1 principal
      ON principal.employee_id = assignment.assignment_payload->>'employeeId'
     AND (
       (assignment.assignment_payload->>'subjectKind' = 'employee' AND assignment.assignment_payload->'targetPrincipalId' = 'null'::jsonb)
       OR (assignment.assignment_payload->>'subjectKind' = 'principal' AND assignment.assignment_payload->>'targetPrincipalId' = principal.principal_id)
     )
), ai_pdm_visible AS (
  SELECT 'ai-pdm'::text AS application_id,
         effective.identity_issuer AS principal_issuer,
         effective.identity_subject AS principal_subject,
         effective.assignment_version
    FROM orgmaster_contract.v_ai_pdm_effective_role_assignments_v1 effective
)
SELECT visible.application_id,
       visible.principal_issuer,
       visible.principal_subject,
       MAX(visible.assignment_version) AS assignment_version,
       'visible'::text AS visibility_state
  FROM (
    SELECT * FROM orgmaster_visible
    UNION ALL
    SELECT * FROM ai_pdm_visible
  ) visible
 WHERE NULLIF(visible.principal_issuer, '') IS NOT NULL
   AND NULLIF(visible.principal_subject, '') IS NOT NULL
 GROUP BY visible.application_id, visible.principal_issuer, visible.principal_subject;

ALTER VIEW orgmaster_contract.v_portal_app_visibility_v1 OWNER TO jenfu_orgmaster_migrator;

COMMIT;
