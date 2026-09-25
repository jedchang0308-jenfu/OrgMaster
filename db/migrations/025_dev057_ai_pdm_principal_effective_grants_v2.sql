-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: orgmaster.ai-pdm-principal-effective-grants.v2
-- compatibility: new-version
-- governance-review: DEV-057
--
-- Principal-keyed authorization projection. Provider aliases are admitted
-- through typed identity facts but never appear in the grant contract.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SET LOCAL ROLE jenfu_orgmaster_migrator;

CREATE VIEW orgmaster_contract.v_ai_pdm_principal_effective_grants_v2
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
), active_principals AS (
  SELECT typed.principal_id,
         min(typed.employee_id) AS employee_id,
         min(typed.account_type) AS account_type
    FROM orgmaster_contract.v_active_principal_accounts_v1 typed
    JOIN orgmaster_core.principal_ownership_reservations owner
      ON owner.principal_id = typed.principal_id
     AND owner.employee_id = typed.employee_id
     AND owner.account_type = typed.account_type
   WHERE typed.principal_id IS NOT NULL
     AND typed.employee_id IS NOT NULL
     AND typed.account_type IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM orgmaster_core.principal_identity_reservations unresolved
        WHERE unresolved.employee_id = typed.employee_id
          AND unresolved.principal_id IS NULL
     )
   GROUP BY typed.principal_id
  HAVING count(*) = count(DISTINCT (typed.principal_issuer, typed.principal_subject))
     AND count(DISTINCT typed.employee_id) = 1
     AND count(DISTINCT typed.account_type) = 1
     AND count(*) = (
       SELECT count(*)
         FROM orgmaster_contract.v_active_principal_mappings_v1 mapping
        WHERE mapping.principal_id = typed.principal_id
     )
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
SELECT 'jenfu.orgmaster.ai-pdm-principal-grants.v2'::text AS contract_version,
       version_payload->>'id' AS assignment_version_id,
       (version_payload->>'versionNumber')::bigint AS assignment_version,
       projected_assignment_id AS assignment_id,
       grant_kind,
       delegation_id,
       'ai-pdm'::text AS application_id,
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

ALTER VIEW orgmaster_contract.v_ai_pdm_principal_effective_grants_v2 OWNER TO jenfu_orgmaster_migrator;

REVOKE ALL ON orgmaster_contract.v_ai_pdm_principal_effective_grants_v2
  FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime,
    jenfu_ai_pdm_runtime, jenfu_ai_pdm_migrator, jenfu_platform_migrator;
GRANT SELECT ON orgmaster_contract.v_ai_pdm_principal_effective_grants_v2
  TO jenfu_ai_pdm_runtime, jenfu_ai_pdm_migrator,
     jenfu_orgmaster_runtime, jenfu_orgmaster_migrator;

COMMENT ON VIEW orgmaster_contract.v_ai_pdm_principal_effective_grants_v2 IS
  'AI-PDM effective grants keyed once by canonical principal_id; issuer and subject are admission evidence only.';

INSERT INTO orgmaster_core.contract_manifest (
  contract_id, contract_version, signature_sha256, payload_sha256
) VALUES (
  'orgmaster.ai-pdm-principal-effective-grants',
  'jenfu.orgmaster.ai-pdm-principal-grants.v2',
  '74a9890b416b547cd013673487a78322a49da44b415b903015d55768504bbe71',
  NULL
);

COMMIT;
