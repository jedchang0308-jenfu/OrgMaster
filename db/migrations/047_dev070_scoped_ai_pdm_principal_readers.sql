-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: additive typed AI-PDM Principal readers; legacy V1/V5 retained
-- compatibility: backward-compatible
-- governance-review: DEV-070
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SET LOCAL ROLE jenfu_orgmaster_migrator;
SELECT pg_advisory_xact_lock(hashtext('dev070-scoped-principal-readers'),hashtext(current_database()));

-- One statement owns its publication snapshot. No process/request cache, caller
-- identity override, or replacement of the existing public V1/V5 projections.
-- Scoping happens before JSON joins while every alias of the selected Principal
-- remains available to the existing ambiguity/ownership/lifecycle checks.
CREATE FUNCTION orgmaster_core.read_ai_pdm_principal_accounts_v1(p_principal_id text,p_issuer text,p_subject text,p_all boolean DEFAULT false)
RETURNS SETOF orgmaster_contract.v_active_principal_accounts_v1
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $accounts$
WITH active_governance AS MATERIALIZED (
  SELECT artifact.payload
    FROM orgmaster_core.persistence_authority authority
    JOIN orgmaster_core.persistence_batches batch
      ON batch.id = authority.active_batch_id AND batch.status = 'active'
    JOIN orgmaster_core.persistence_artifacts artifact
      ON artifact.batch_id = batch.id
     AND artifact.artifact_key = 'orgmaster-governance.v3.json'
     AND artifact.artifact_kind = 'governance'
   WHERE authority.singleton = true
), active_version AS MATERIALIZED (
  SELECT version.value AS payload
    FROM active_governance governance
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(governance.payload->'publishedVersions') = 'array'
        THEN governance.payload->'publishedVersions' ELSE '[]'::jsonb END
    ) version(value)
   WHERE version.value->>'id' = governance.payload->>'activePolicyVersionId'
     AND version.value->>'kind' = 'assignment-governance-v3'
), workspace_employees AS MATERIALIZED (
  SELECT * FROM orgmaster_core.v_current_workspace_employees_v1
), legacy_candidates AS (
  SELECT version.payload AS version_payload,
         identity.value AS identity_payload,
         employee.employee_id,
         employee.employee_status
    FROM active_version version
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(version.payload#>'{policy,identityLinks}') = 'array'
        THEN version.payload#>'{policy,identityLinks}' ELSE '[]'::jsonb END
    ) identity(value)
    JOIN workspace_employees employee
      ON employee.employee_id = identity.value->>'employeeId'
     AND employee.employee_status = 'active'
   WHERE (p_all OR ((p_principal_id IS NOT NULL AND identity.value->>'principalId' = p_principal_id)
      OR (p_principal_id IS NULL AND p_issuer IS NOT NULL AND p_subject IS NOT NULL
          AND identity.value->>'issuer' = p_issuer AND identity.value->>'subject' = p_subject)))
     AND identity.value->>'status' = 'active'
     AND NULLIF(identity.value->>'issuer', '') IS NOT NULL
     AND NULLIF(identity.value->>'subject', '') IS NOT NULL
     AND NULLIF(identity.value->>'principalId', '') IS NOT NULL
     AND (identity.value->>'validFrom')::timestamptz <= CURRENT_TIMESTAMP
     AND (identity.value->>'validTo' IS NULL OR (identity.value->>'validTo')::timestamptz > CURRENT_TIMESTAMP)
     AND NOT EXISTS (
       SELECT 1 FROM orgmaster_core.managed_identity_lifecycle_outbox lifecycle
        WHERE lifecycle.employee_id = identity.value->>'employeeId'
          AND lifecycle.status <> 'completed'
     )
     AND NOT EXISTS (
       SELECT 1 FROM orgmaster_contract.v_principal_lifecycle_targets_v2 target
       JOIN orgmaster_core.principal_lifecycle_delivery_v2 delivery ON delivery.event_id=target.event_id::uuid
       WHERE target.principal_id=identity.value->>'principalId' AND delivery.status<>'completed'
     )
), mappings AS MATERIALIZED (
SELECT 'organization.active-principal.v1'::text AS contract_version,
       identity_payload->>'issuer' AS principal_issuer,
       identity_payload->>'subject' AS principal_subject,
       identity_payload->>'principalId' AS principal_id,
       employee_id,
       employee_status,
       (version_payload->>'versionNumber')::bigint AS mapping_version,
       (version_payload->>'publishedAt')::timestamptz AS published_at
  FROM legacy_candidates
UNION ALL
SELECT 'organization.active-principal.v1', identity.auth_issuer, identity.auth_subject,
       identity.principal_id, identity.employee_id, employee.employee_status,
       identity.admission_revision, identity.admission_changed_at
  FROM orgmaster_core.managed_daily_identities identity
  JOIN workspace_employees employee
    ON employee.employee_id = identity.employee_id
   AND employee.employee_status = 'active'
 WHERE (p_all OR ((p_principal_id IS NOT NULL AND identity.principal_id = p_principal_id)
      OR (p_principal_id IS NULL AND p_issuer IS NOT NULL AND p_subject IS NOT NULL
          AND identity.auth_issuer = p_issuer AND identity.auth_subject = p_subject)))
   AND identity.link_state = 'active'
   AND identity.auth_issuer IS NOT NULL
   AND identity.auth_subject IS NOT NULL
   AND identity.admission_revision IS NOT NULL
   AND identity.admission_changed_at IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM orgmaster_core.managed_identity_admission_authority authority
      WHERE authority.singleton = true AND authority.admission_enabled
   )
   AND EXISTS (
     SELECT 1 FROM orgmaster_core.managed_identity_observations observation
      WHERE observation.identity_record_id = identity.identity_record_id
        AND observation.directory_state = 'present'
   )
   AND NOT EXISTS (
     SELECT 1 FROM orgmaster_core.managed_identity_lifecycle_outbox lifecycle
      WHERE lifecycle.employee_id = identity.employee_id
        AND lifecycle.status <> 'completed'
   )
   AND NOT EXISTS (
     SELECT 1 FROM orgmaster_contract.v_principal_lifecycle_targets_v2 target
     JOIN orgmaster_core.principal_lifecycle_delivery_v2 delivery ON delivery.event_id=target.event_id::uuid
     WHERE target.principal_id=identity.principal_id AND delivery.status<>'completed'
   )
), governance_account_types AS (
  SELECT
    link.value->>'issuer' AS principal_issuer,
    link.value->>'subject' AS principal_subject,
    link.value->>'principalId' AS principal_id,
    link.value->>'employeeId' AS employee_id,
    admission.value->>'accountType' AS account_type
  FROM active_version version
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(version.payload#>'{policy,identityLinks}') = 'array'
      THEN version.payload#>'{policy,identityLinks}' ELSE '[]'::jsonb END
  ) link(value)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(version.payload#>'{policy,principalAdmissions}') = 'array'
      THEN version.payload#>'{policy,principalAdmissions}' ELSE '[]'::jsonb END
  ) admission(value)
  WHERE (p_all OR ((p_principal_id IS NOT NULL AND link.value->>'principalId' = p_principal_id)
      OR (p_principal_id IS NULL AND p_issuer IS NOT NULL AND p_subject IS NOT NULL
          AND link.value->>'issuer' = p_issuer AND link.value->>'subject' = p_subject)))
    AND link.value->>'status' = 'active'
    AND admission.value->>'identityLinkId' = link.value->>'id'
    AND admission.value->>'status' = 'active'
    AND admission.value->>'accountType' IN ('human_personal', 'human_privileged')
)
SELECT
  mapping.contract_version,
  mapping.principal_issuer,
  mapping.principal_subject,
  mapping.principal_id,
  mapping.employee_id,
  COALESCE(CASE WHEN managed.identity_record_id IS NOT NULL THEN 'human_personal'::text END,
           governed.account_type) AS account_type,
  mapping.employee_status,
  mapping.mapping_version,
  mapping.published_at
FROM mappings mapping
LEFT JOIN orgmaster_core.managed_daily_identities managed
  ON managed.employee_id = mapping.employee_id
 AND managed.principal_id = mapping.principal_id
 AND managed.auth_issuer = mapping.principal_issuer
 AND managed.auth_subject = mapping.principal_subject
 AND managed.link_state = 'active'
 AND managed.admission_revision = mapping.mapping_version
 AND managed.admission_changed_at = mapping.published_at
 AND EXISTS (
   SELECT 1 FROM orgmaster_core.managed_identity_admission_authority authority
    WHERE authority.singleton = true AND authority.admission_enabled
 )
 AND EXISTS (
   SELECT 1 FROM orgmaster_core.managed_identity_observations observation
    WHERE observation.identity_record_id = managed.identity_record_id
      AND observation.directory_state = 'present'
 )
 AND NOT EXISTS (
   SELECT 1 FROM orgmaster_core.managed_identity_lifecycle_outbox lifecycle
    WHERE lifecycle.employee_id = managed.employee_id
      AND lifecycle.status <> 'completed'
 )
LEFT JOIN governance_account_types governed
  ON governed.employee_id = mapping.employee_id
 AND governed.principal_id = mapping.principal_id
 AND governed.principal_issuer = mapping.principal_issuer
 AND governed.principal_subject = mapping.principal_subject
WHERE managed.identity_record_id IS NOT NULL
   OR governed.account_type IS NOT NULL;
$accounts$;
REVOKE ALL ON FUNCTION orgmaster_core.read_ai_pdm_principal_accounts_v1(text,text,text,boolean) FROM PUBLIC;

CREATE FUNCTION orgmaster_contract.read_ai_pdm_active_principal_accounts_v1(p_principal_id text)
RETURNS SETOF orgmaster_contract.v_active_principal_accounts_v1
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $reader$
 SELECT * FROM orgmaster_core.read_ai_pdm_principal_accounts_v1(p_principal_id,NULL,NULL);
$reader$;
CREATE FUNCTION orgmaster_contract.read_ai_pdm_active_principal_identity_v1(p_issuer text,p_subject text)
RETURNS SETOF orgmaster_contract.v_active_principal_accounts_v1
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $reader$
 SELECT * FROM orgmaster_core.read_ai_pdm_principal_accounts_v1(NULL,p_issuer,p_subject);
$reader$;

CREATE FUNCTION orgmaster_core.read_ai_pdm_principal_grants_v5(p_principal_id text,p_employee_id text,p_all boolean)
RETURNS SETOF orgmaster_contract.v_ai_pdm_principal_effective_grants_v5
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $grants$
DECLARE current_publication jsonb; candidate_grant jsonb;
        validated_administrators jsonb:='[]'::jsonb; native_eligible boolean;
BEGIN
 -- Validate the entire administration publication even for an absent target:
 -- malformed/overlapping grants elsewhere must retain global fail-closed behavior.
 current_publication:=orgmaster_core.read_administration_publication_v1();
 -- The old no-argument administration reader evaluates every eligible app's
 -- catalog, even when the eventual caller selects an absent Principal. Retain
 -- those dependency errors before any target restriction or empty-set shortcut.
 FOR candidate_grant IN SELECT value FROM jsonb_array_elements(
   COALESCE(current_publication#>'{policy,administration,grants}','[]'::jsonb))
   WHERE value->>'roleCode'='application_system_admin' AND value->>'status'='active'
     AND value->>'subjectKind'='principal' AND value->>'basis'='manual'
     AND value#>>'{scope,kind}'='global'
     AND (value->>'validFrom')::timestamptz<=CURRENT_TIMESTAMP
     AND ((value->>'validTo') IS NULL OR (value->>'validTo')::timestamptz>CURRENT_TIMESTAMP)
 LOOP
   SELECT EXISTS(SELECT 1 FROM (
     SELECT min(account.employee_id) AS employee_id
     FROM orgmaster_core.read_ai_pdm_principal_accounts_v1(candidate_grant->>'principalId',NULL,NULL) account
     WHERE account.employee_status='active' AND account.account_type IN ('human_personal','human_privileged')
     GROUP BY account.principal_id
     HAVING count(DISTINCT account.employee_id)=1 AND count(DISTINCT account.account_type)=1
   ) native JOIN orgmaster_core.v_current_workspace_employees_v1 employee
       ON employee.employee_id=native.employee_id AND employee.employee_status='active'
     WHERE native.employee_id=candidate_grant->>'employeeId') INTO native_eligible;
   IF native_eligible AND orgmaster_core.administrative_catalog_current_v1(
       candidate_grant->>'applicationId',candidate_grant->'catalogBinding') THEN
     validated_administrators:=validated_administrators||jsonb_build_array(candidate_grant);
   END IF;
 END LOOP;
 RETURN QUERY
WITH active_batch AS (
  SELECT batch.id
    FROM orgmaster_core.persistence_authority authority
    JOIN orgmaster_core.persistence_batches batch
      ON batch.id = authority.active_batch_id
     AND batch.status = 'active'
   WHERE authority.singleton = true
), active_version AS MATERIALIZED (
  SELECT current_publication AS version_payload WHERE current_publication IS NOT NULL
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
), typed_accounts AS MATERIALIZED (
  SELECT * FROM orgmaster_core.read_ai_pdm_principal_accounts_v1(p_principal_id,NULL,NULL,p_all)
), active_principals AS (
  SELECT typed.principal_id,
         min(typed.employee_id) AS employee_id,
         min(typed.account_type) AS account_type
    FROM typed_accounts typed
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
   WHERE (p_all OR assignment.value->>'employeeId' = p_employee_id)
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
   WHERE (p_all OR delegation.value->>'toEmployeeId' = p_employee_id)
     AND delegation.value->>'status' = 'active'
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
         principal.employee_id
    FROM catalog_valid
    JOIN active_principals principal
      ON principal.employee_id = catalog_valid.recipient_employee_id
     AND (
       (catalog_valid.grant_kind = 'delegated' AND catalog_valid.catalog_subject_kind = 'employee' AND principal.account_type IN ('human_personal', 'human_privileged'))
       OR (
         catalog_valid.grant_kind = 'direct'
         AND catalog_valid.assignment_payload->>'subjectKind' = 'employee'
         AND catalog_valid.assignment_payload->'targetPrincipalId' = 'null'::jsonb
         AND catalog_valid.catalog_subject_kind = 'employee'
         AND principal.account_type IN ('human_personal', 'human_privileged')
       )
       OR (
         catalog_valid.grant_kind = 'direct'
         AND catalog_valid.assignment_payload->>'subjectKind' = 'principal'
         AND catalog_valid.assignment_payload->>'targetPrincipalId' = principal.principal_id
         AND catalog_valid.catalog_subject_kind = 'principal'
         AND principal.account_type = 'human_privileged'
       )
     )
), legacy AS (
SELECT 'jenfu.orgmaster.ai-pdm-principal-grants.v4'::text AS contract_version,
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
       (version_payload->>'publishedAt')::timestamptz AS published_at
  FROM resolved
)
, native_administrator AS (
  SELECT principal_id,min(employee_id) AS employee_id FROM typed_accounts
  WHERE employee_status='active' AND account_type IN ('human_personal','human_privileged')
  GROUP BY principal_id HAVING count(DISTINCT employee_id)=1 AND count(DISTINCT account_type)=1
), administrative_grants AS (
  SELECT grant_row.value AS grant_payload
  FROM jsonb_array_elements(validated_administrators) grant_row(value)
  JOIN native_administrator native ON native.principal_id=grant_row.value->>'principalId'
    AND native.employee_id=grant_row.value->>'employeeId'
  JOIN orgmaster_core.v_current_workspace_employees_v1 employee
    ON employee.employee_id=native.employee_id AND employee.employee_status='active'
  WHERE (p_all OR (grant_row.value->>'principalId'=p_principal_id AND grant_row.value->>'employeeId'=p_employee_id))
    AND grant_row.value->>'applicationId'='ai-pdm' AND grant_row.value->>'roleCode'='application_system_admin'
    AND grant_row.value->>'status'='active' AND grant_row.value->>'subjectKind'='principal'
    AND grant_row.value->>'basis'='manual' AND grant_row.value#>>'{scope,kind}'='global'
    AND (grant_row.value->>'validFrom')::timestamptz<=CURRENT_TIMESTAMP
    AND ((grant_row.value->>'validTo') IS NULL OR (grant_row.value->>'validTo')::timestamptz>CURRENT_TIMESTAMP)
)
SELECT 'jenfu.orgmaster.ai-pdm-principal-grants.v5'::text,
 legacy.assignment_version_id,legacy.assignment_version,legacy.assignment_id,legacy.grant_kind,legacy.delegation_id,
 legacy.application_id,legacy.principal_id,legacy.employee_id,legacy.subject_kind,legacy.target_principal_id,
 legacy.stable_role_id,legacy.role_code,legacy.catalog_version,legacy.scope_kind,legacy.scope_key,
 legacy.valid_from,legacy.valid_until,legacy.published_at,
 legacy.assignment_id,NULL::text,NULL::text,NULL::text
FROM legacy WHERE p_all OR (legacy.principal_id=p_principal_id AND legacy.employee_id=p_employee_id)
UNION ALL
SELECT 'jenfu.orgmaster.ai-pdm-principal-grants.v5',current_publication->>'id',
 (current_publication->>'versionNumber')::bigint,(grant_payload->>'id')::uuid::text,'direct',NULL::text,
 'ai-pdm',grant_payload->>'principalId',grant_payload->>'employeeId','principal',grant_payload->>'principalId',
 grant_payload#>>'{catalogBinding,stableRoleId}','application_system_admin',
 grant_payload#>>'{catalogBinding,catalogVersion}','global',NULL::text,
 (grant_payload->>'validFrom')::timestamptz,(grant_payload->>'validTo')::timestamptz,
 (current_publication->>'publishedAt')::timestamptz,
 (grant_payload->>'id')::uuid::text,(grant_payload->>'id')::uuid::text,
 grant_payload#>>'{catalogBinding,contentSha256}',grant_payload#>>'{catalogBinding,roleDefinitionHash}'
FROM administrative_grants
;
END;
$grants$;
REVOKE ALL ON FUNCTION orgmaster_core.read_ai_pdm_principal_grants_v5(text,text,boolean) FROM PUBLIC;

CREATE FUNCTION orgmaster_contract.read_ai_pdm_principal_effective_grants_v5(p_principal_id text,p_employee_id text)
RETURNS SETOF orgmaster_contract.v_ai_pdm_principal_effective_grants_v5
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $reader$
 SELECT * FROM orgmaster_core.read_ai_pdm_principal_grants_v5(p_principal_id,p_employee_id,false);
$reader$;

-- Keep the old caller ABI on the same optimized live projection. No app rollout
-- is required for publication sharing; typed callers additionally scope targets.
CREATE OR REPLACE FUNCTION orgmaster_contract.read_ai_pdm_principal_effective_grants_v5()
RETURNS TABLE(contract_version text,assignment_version_id text,assignment_version bigint,assignment_id text,
 grant_kind text,delegation_id text,application_id text,principal_id text,employee_id text,subject_kind text,
 target_principal_id text,stable_role_id text,role_code text,catalog_version text,scope_kind text,scope_key text,
 valid_from timestamptz,valid_until timestamptz,published_at timestamptz,source_assignment_id text,
 source_grant_id text,admin_catalog_sha256 text,role_definition_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $reader$
 SELECT * FROM orgmaster_core.read_ai_pdm_principal_grants_v5(NULL,NULL,true);
$reader$;

CREATE OR REPLACE VIEW orgmaster_contract.v_active_principal_accounts_v1 WITH(security_barrier=true) AS
WITH active_governance AS MATERIALIZED (
  SELECT artifact.payload
    FROM orgmaster_core.persistence_authority authority
    JOIN orgmaster_core.persistence_batches batch
      ON batch.id = authority.active_batch_id AND batch.status = 'active'
    JOIN orgmaster_core.persistence_artifacts artifact
      ON artifact.batch_id = batch.id
     AND artifact.artifact_key = 'orgmaster-governance.v3.json'
     AND artifact.artifact_kind = 'governance'
   WHERE authority.singleton = true
), active_version AS MATERIALIZED (
  SELECT version.value AS payload
    FROM active_governance governance
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(governance.payload->'publishedVersions') = 'array'
        THEN governance.payload->'publishedVersions' ELSE '[]'::jsonb END
    ) version(value)
   WHERE version.value->>'id' = governance.payload->>'activePolicyVersionId'
     AND version.value->>'kind' = 'assignment-governance-v3'
), workspace_employees AS MATERIALIZED (
  SELECT * FROM orgmaster_core.v_current_workspace_employees_v1
), legacy_candidates AS (
  SELECT version.payload AS version_payload,
         identity.value AS identity_payload,
         employee.employee_id,
         employee.employee_status
    FROM active_version version
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(version.payload#>'{policy,identityLinks}') = 'array'
        THEN version.payload#>'{policy,identityLinks}' ELSE '[]'::jsonb END
    ) identity(value)
    JOIN workspace_employees employee
      ON employee.employee_id = identity.value->>'employeeId'
     AND employee.employee_status = 'active'
   WHERE true
     AND identity.value->>'status' = 'active'
     AND NULLIF(identity.value->>'issuer', '') IS NOT NULL
     AND NULLIF(identity.value->>'subject', '') IS NOT NULL
     AND NULLIF(identity.value->>'principalId', '') IS NOT NULL
     AND (identity.value->>'validFrom')::timestamptz <= CURRENT_TIMESTAMP
     AND (identity.value->>'validTo' IS NULL OR (identity.value->>'validTo')::timestamptz > CURRENT_TIMESTAMP)
     AND NOT EXISTS (
       SELECT 1 FROM orgmaster_core.managed_identity_lifecycle_outbox lifecycle
        WHERE lifecycle.employee_id = identity.value->>'employeeId'
          AND lifecycle.status <> 'completed'
     )
     AND NOT EXISTS (
       SELECT 1 FROM orgmaster_contract.v_principal_lifecycle_targets_v2 target
       JOIN orgmaster_core.principal_lifecycle_delivery_v2 delivery ON delivery.event_id=target.event_id::uuid
       WHERE target.principal_id=identity.value->>'principalId' AND delivery.status<>'completed'
     )
), mappings AS NOT MATERIALIZED (
SELECT 'organization.active-principal.v1'::text AS contract_version,
       identity_payload->>'issuer' AS principal_issuer,
       identity_payload->>'subject' AS principal_subject,
       identity_payload->>'principalId' AS principal_id,
       employee_id,
       employee_status,
       (version_payload->>'versionNumber')::bigint AS mapping_version,
       (version_payload->>'publishedAt')::timestamptz AS published_at
  FROM legacy_candidates
UNION ALL
SELECT 'organization.active-principal.v1', identity.auth_issuer, identity.auth_subject,
       identity.principal_id, identity.employee_id, employee.employee_status,
       identity.admission_revision, identity.admission_changed_at
  FROM orgmaster_core.managed_daily_identities identity
  JOIN workspace_employees employee
    ON employee.employee_id = identity.employee_id
   AND employee.employee_status = 'active'
 WHERE true
   AND identity.link_state = 'active'
   AND identity.auth_issuer IS NOT NULL
   AND identity.auth_subject IS NOT NULL
   AND identity.admission_revision IS NOT NULL
   AND identity.admission_changed_at IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM orgmaster_core.managed_identity_admission_authority authority
      WHERE authority.singleton = true AND authority.admission_enabled
   )
   AND EXISTS (
     SELECT 1 FROM orgmaster_core.managed_identity_observations observation
      WHERE observation.identity_record_id = identity.identity_record_id
        AND observation.directory_state = 'present'
   )
   AND NOT EXISTS (
     SELECT 1 FROM orgmaster_core.managed_identity_lifecycle_outbox lifecycle
      WHERE lifecycle.employee_id = identity.employee_id
        AND lifecycle.status <> 'completed'
   )
   AND NOT EXISTS (
     SELECT 1 FROM orgmaster_contract.v_principal_lifecycle_targets_v2 target
     JOIN orgmaster_core.principal_lifecycle_delivery_v2 delivery ON delivery.event_id=target.event_id::uuid
     WHERE target.principal_id=identity.principal_id AND delivery.status<>'completed'
   )
), governance_account_types AS (
  SELECT
    link.value->>'issuer' AS principal_issuer,
    link.value->>'subject' AS principal_subject,
    link.value->>'principalId' AS principal_id,
    link.value->>'employeeId' AS employee_id,
    admission.value->>'accountType' AS account_type
  FROM active_version version
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(version.payload#>'{policy,identityLinks}') = 'array'
      THEN version.payload#>'{policy,identityLinks}' ELSE '[]'::jsonb END
  ) link(value)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(version.payload#>'{policy,principalAdmissions}') = 'array'
      THEN version.payload#>'{policy,principalAdmissions}' ELSE '[]'::jsonb END
  ) admission(value)
  WHERE true
    AND link.value->>'status' = 'active'
    AND admission.value->>'identityLinkId' = link.value->>'id'
    AND admission.value->>'status' = 'active'
    AND admission.value->>'accountType' IN ('human_personal', 'human_privileged')
)
SELECT
  mapping.contract_version,
  mapping.principal_issuer,
  mapping.principal_subject,
  mapping.principal_id,
  mapping.employee_id,
  COALESCE(CASE WHEN managed.identity_record_id IS NOT NULL THEN 'human_personal'::text END,
           governed.account_type) AS account_type,
  mapping.employee_status,
  mapping.mapping_version,
  mapping.published_at
FROM mappings mapping
LEFT JOIN orgmaster_core.managed_daily_identities managed
  ON managed.employee_id = mapping.employee_id
 AND managed.principal_id = mapping.principal_id
 AND managed.auth_issuer = mapping.principal_issuer
 AND managed.auth_subject = mapping.principal_subject
 AND managed.link_state = 'active'
 AND managed.admission_revision = mapping.mapping_version
 AND managed.admission_changed_at = mapping.published_at
 AND EXISTS (
   SELECT 1 FROM orgmaster_core.managed_identity_admission_authority authority
    WHERE authority.singleton = true AND authority.admission_enabled
 )
 AND EXISTS (
   SELECT 1 FROM orgmaster_core.managed_identity_observations observation
    WHERE observation.identity_record_id = managed.identity_record_id
      AND observation.directory_state = 'present'
 )
 AND NOT EXISTS (
   SELECT 1 FROM orgmaster_core.managed_identity_lifecycle_outbox lifecycle
    WHERE lifecycle.employee_id = managed.employee_id
      AND lifecycle.status <> 'completed'
 )
LEFT JOIN governance_account_types governed
  ON governed.employee_id = mapping.employee_id
 AND governed.principal_id = mapping.principal_id
 AND governed.principal_issuer = mapping.principal_issuer
 AND governed.principal_subject = mapping.principal_subject
WHERE managed.identity_record_id IS NOT NULL
   OR governed.account_type IS NOT NULL;

REVOKE ALL ON FUNCTION orgmaster_contract.read_ai_pdm_active_principal_accounts_v1(text),
 orgmaster_contract.read_ai_pdm_active_principal_identity_v1(text,text),
 orgmaster_contract.read_ai_pdm_principal_effective_grants_v5(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orgmaster_contract.read_ai_pdm_active_principal_accounts_v1(text),
 orgmaster_contract.read_ai_pdm_active_principal_identity_v1(text,text),
 orgmaster_contract.read_ai_pdm_principal_effective_grants_v5(text,text) TO jenfu_ai_pdm_runtime;
COMMENT ON FUNCTION orgmaster_contract.read_ai_pdm_principal_effective_grants_v5(text,text) IS
 'Exact typed AI-PDM Principal/Employee selection of the V5 contract. All publication, alias, ownership, lifecycle, expiry, delegation and catalog fences remain live; no cross-request cache.';
COMMIT;
