-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: FMS v4 read compatibility and internal FMS publication impact
-- compatibility: backward-compatible
-- governance-review: DEV-059
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_orgmaster_migrator;

-- Keep the public point readers on the same evaluator that calculates publication impact.
CREATE FUNCTION orgmaster_core.read_fms_fact_accounts_at_v1(
  p_principal_id text, p_issuer text, p_subject text, p_at timestamptz
) RETURNS SETOF orgmaster_contract.v_active_principal_accounts_v1
LANGUAGE sql STABLE SET search_path=pg_catalog AS $accounts$
WITH source AS MATERIALIZED (
  SELECT * FROM orgmaster_core.v_fms_fact_source_v1
), policy AS MATERIALIZED (
  SELECT row.fact FROM source
  JOIN orgmaster_core.fms_artifact_facts row ON row.batch_id=source.batch_id
    AND row.artifact_key='orgmaster-governance.v3.json' AND row.kind='policy' AND row.lookup_key=''
  WHERE row.fact->>'kind'='assignment-governance-v3'
), links AS MATERIALIZED (
  SELECT row.fact FROM source
  JOIN orgmaster_core.fms_artifact_facts row ON row.batch_id=source.batch_id
    AND row.artifact_key='orgmaster-governance.v3.json'
    AND row.kind=CASE WHEN p_principal_id IS NULL THEN 'identity_link' ELSE 'principal_link' END
    AND row.lookup_key=COALESCE(p_principal_id,md5(jsonb_build_array(p_issuer,p_subject)::text))
  WHERE row.fact->>'status'='active'
    AND (p_principal_id IS NOT NULL OR (row.fact->>'issuer'=p_issuer AND row.fact->>'subject'=p_subject))
), candidates AS (
  SELECT link.fact->>'issuer' AS issuer, link.fact->>'subject' AS subject,
    link.fact->>'principalId' AS principal, link.fact->>'employeeId' AS employee,
    (policy.fact->>'versionNumber')::bigint AS revision,
    (policy.fact->>'publishedAt')::timestamptz AS published_at
  FROM links link CROSS JOIN policy
  WHERE NULLIF(link.fact->>'issuer','') IS NOT NULL
    AND NULLIF(link.fact->>'subject','') IS NOT NULL
    AND NULLIF(link.fact->>'principalId','') IS NOT NULL
    AND (link.fact->>'validFrom')::timestamptz <= p_at
    AND ((link.fact->>'validTo') IS NULL OR (link.fact->>'validTo')::timestamptz > p_at)
  UNION ALL
  SELECT identity.auth_issuer,identity.auth_subject,identity.principal_id,identity.employee_id,
    identity.admission_revision,identity.admission_changed_at
  FROM orgmaster_core.managed_daily_identities identity
  WHERE (identity.principal_id=p_principal_id OR
        (p_principal_id IS NULL AND identity.auth_issuer=p_issuer AND identity.auth_subject=p_subject))
    AND identity.link_state='active' AND identity.auth_issuer IS NOT NULL AND identity.auth_subject IS NOT NULL
    AND identity.admission_revision IS NOT NULL AND identity.admission_changed_at IS NOT NULL
    AND EXISTS (SELECT 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton AND admission_enabled)
    AND EXISTS (SELECT 1 FROM orgmaster_core.managed_identity_observations observation
      WHERE observation.identity_record_id=identity.identity_record_id AND observation.directory_state='present')
), mappings AS (
  SELECT candidates.* FROM candidates CROSS JOIN source
  JOIN orgmaster_core.fms_artifact_facts employee ON employee.batch_id=source.batch_id
    AND employee.artifact_key=source.workspace_artifact_key AND employee.kind='employee'
  WHERE employee.lookup_key=candidates.employee AND employee.fact->>'status'='active'
    AND NOT EXISTS (SELECT 1 FROM orgmaster_core.managed_identity_lifecycle_outbox lifecycle
      WHERE lifecycle.employee_id=candidates.employee AND lifecycle.status<>'completed')
    AND NOT EXISTS (SELECT 1 FROM orgmaster_core.fms_lifecycle_targets target
      JOIN orgmaster_core.principal_lifecycle_delivery_v2 delivery ON delivery.event_id=target.event_id
      WHERE target.principal_id=candidates.principal AND delivery.status<>'completed')
), governed AS (
  SELECT link.fact, admission.fact->>'accountType' AS account_type
  FROM links link CROSS JOIN source
  JOIN orgmaster_core.fms_artifact_facts admission ON admission.batch_id=source.batch_id
    AND admission.artifact_key='orgmaster-governance.v3.json' AND admission.kind='admission'
  WHERE admission.lookup_key=link.fact->>'id' AND admission.fact->>'status'='active'
    AND admission.fact->>'accountType' IN ('human_personal','human_privileged')
)
SELECT 'organization.active-principal.v1'::text, mapping.issuer,mapping.subject,mapping.principal,mapping.employee,
  COALESCE(CASE WHEN managed.identity_record_id IS NOT NULL THEN 'human_personal'::text END,governed.account_type),
  'active'::text,mapping.revision,mapping.published_at
FROM mappings mapping
LEFT JOIN orgmaster_core.managed_daily_identities managed ON managed.employee_id=mapping.employee
  AND managed.principal_id=mapping.principal AND managed.auth_issuer=mapping.issuer AND managed.auth_subject=mapping.subject
  AND managed.link_state='active' AND managed.admission_revision=mapping.revision AND managed.admission_changed_at=mapping.published_at
  AND EXISTS (SELECT 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton AND admission_enabled)
  AND EXISTS (SELECT 1 FROM orgmaster_core.managed_identity_observations observation
    WHERE observation.identity_record_id=managed.identity_record_id AND observation.directory_state='present')
  AND NOT EXISTS (SELECT 1 FROM orgmaster_core.managed_identity_lifecycle_outbox lifecycle
    WHERE lifecycle.employee_id=managed.employee_id AND lifecycle.status<>'completed')
LEFT JOIN governed ON governed.fact->>'employeeId'=mapping.employee AND governed.fact->>'principalId'=mapping.principal
  AND governed.fact->>'issuer'=mapping.issuer AND governed.fact->>'subject'=mapping.subject
WHERE managed.identity_record_id IS NOT NULL OR governed.account_type IS NOT NULL;
$accounts$;

CREATE FUNCTION orgmaster_core.read_fms_authority_at_v1(p_principal_id text, p_application_id text, p_at timestamptz)
RETURNS SETOF orgmaster_contract.v_fms_authority_v4
LANGUAGE sql STABLE SET search_path = pg_catalog
AS $reader$
SELECT scoped.*
  FROM (
  WITH source AS MATERIALIZED (
    SELECT * FROM orgmaster_core.v_fms_fact_source_v1
    WHERE NULLIF(p_principal_id,'') IS NOT NULL AND p_application_id='financial-management-system'
  ), accounts AS MATERIALIZED (
    SELECT * FROM orgmaster_core.read_fms_fact_accounts_at_v1(p_principal_id,NULL,NULL,p_at)
  ), publication AS MATERIALIZED (
    SELECT projected.fact AS value,source.*
    FROM source JOIN orgmaster_core.fms_artifact_facts projected ON projected.batch_id=source.batch_id
      AND projected.artifact_key='orgmaster-governance.v3.json' AND projected.kind='policy' AND projected.lookup_key=''
  ), catalogs AS MATERIALIZED (
    SELECT projected.fact AS payload,publication.value AS version_payload,publication.governance_revision
    FROM publication JOIN orgmaster_core.fms_artifact_facts projected ON projected.batch_id=publication.batch_id
      AND projected.artifact_key='orgmaster-governance.v3.json' AND projected.kind='catalog' AND projected.lookup_key=''
    WHERE projected.fact->>'validationState'='valid'
  ), typed_principals AS (
    SELECT account.principal_id,max(account.employee_id) AS employee_id,
      max(account.account_type) AS account_type,max(account.mapping_version)::text AS principal_binding_version
    FROM accounts account
    WHERE account.principal_id=p_principal_id AND account.employee_status='active'
      AND account.account_type IN ('human_personal','human_privileged')
      AND account.employee_id IS NOT NULL
    GROUP BY account.principal_id
    HAVING count(*)=1 AND count(DISTINCT account.employee_id)=1 AND count(DISTINCT account.account_type)=1
      AND count(DISTINCT (account.principal_issuer,account.principal_subject))=1
      AND count(DISTINCT account.mapping_version)=1
  ), base AS (
    WITH active_version AS (
      SELECT value AS payload,governance_revision,batch_id FROM publication
      WHERE value->>'kind'='assignment-governance-v3'
    ), fms_catalog AS (
      SELECT * FROM catalogs catalog
      WHERE catalog.payload->>'sourceKind'='application-contract'
        AND catalog.payload->>'effectState'='not-synchronized'
        AND catalog.payload->>'contentSha256' ~ '^[a-f0-9]{64}$'
        AND catalog.payload->>'artifactSha256' ~ '^[a-f0-9]{64}$'
        AND NULLIF(catalog.payload->>'publishedByPrincipalId','') IS NOT NULL
        AND NULLIF(catalog.payload->>'publishedByEmployeeId','') IS NOT NULL
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
       JOIN source workspace ON true
       JOIN fms_catalog catalog ON catalog.version_payload = version.payload
       JOIN typed_principals principal ON true
       JOIN LATERAL (
         SELECT fact AS value FROM orgmaster_core.fms_artifact_facts
         WHERE batch_id=version.batch_id AND artifact_key='orgmaster-governance.v3.json'
           AND kind='assignment' AND lookup_key=principal.employee_id
       ) assignment ON true
       LEFT JOIN LATERAL (
         SELECT max(historical.fact->>'contentSha256') AS content_sha256
         FROM orgmaster_core.fms_artifact_facts historical
         WHERE historical.batch_id=version.batch_id AND historical.artifact_key='orgmaster-governance.v3.json'
           AND historical.kind='historical_catalog'
           AND historical.lookup_key=COALESCE(assignment.value->>'authoringCatalogVersion',assignment.value->>'catalogVersion')
           AND historical.fact->>'sourceKind'='application-contract'
           AND historical.fact->>'validationState'='valid'
           AND historical.fact->>'effectState'='not-synchronized'
           AND historical.fact->>'contentSha256' ~ '^[a-f0-9]{64}$'
           AND historical.fact->>'artifactSha256' ~ '^[a-f0-9]{64}$'
           AND NULLIF(historical.fact->>'publishedByPrincipalId','') IS NOT NULL
           AND NULLIF(historical.fact->>'publishedByEmployeeId','') IS NOT NULL
         HAVING count(DISTINCT historical.fact->>'contentSha256')=1
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
        AND (assignment.value->>'validFrom')::timestamptz <= p_at
        AND (assignment.value->>'validTo' IS NULL OR (assignment.value->>'validTo')::timestamptz > p_at)
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
       JOIN source workspace ON true
       JOIN fms_catalog catalog ON catalog.version_payload = version.payload
       JOIN typed_principals principal ON true
       JOIN LATERAL (
         SELECT fact AS value FROM orgmaster_core.fms_artifact_facts
         WHERE batch_id=version.batch_id AND artifact_key='orgmaster-governance.v3.json'
           AND kind='management_grant' AND lookup_key=principal.principal_id
       ) grant_row ON grant_row.value->>'employeeId'=principal.employee_id
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
        AND (grant_row.value->>'validFrom')::timestamptz <= p_at
        AND (grant_row.value->>'validTo' IS NULL OR (grant_row.value->>'validTo')::timestamptz > p_at)
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
          p_at AS read_at,
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
    (publication.value->>'administrationVersion')::bigint AS administration_version,
    grant_row.value#>>'{catalogBinding,catalogVersion}' AS catalog_version,
    grant_row.value#>>'{catalogBinding,contentSha256}' AS catalog_content_sha256,
    grant_row.value#>>'{catalogBinding,stableRoleId}' AS stable_role_id,
    grant_row.value#>>'{catalogBinding,roleDefinitionHash}' AS role_definition_hash,
    typed.mapping_version::text AS principal_binding_version,publication.value AS publication,catalog.payload AS catalog,
    publication.workspace_revision,publication.workspace_version_id,publication.governance_revision
   FROM publication
   JOIN LATERAL (
     SELECT fact AS value FROM orgmaster_core.fms_artifact_facts
     WHERE batch_id=publication.batch_id AND artifact_key='orgmaster-governance.v3.json'
       AND kind='admin_grant' AND lookup_key=p_principal_id
   ) grant_row ON true
   JOIN LATERAL(
     SELECT min(mapping_version) mapping_version FROM accounts typed
     WHERE typed.principal_id=grant_row.value->>'principalId' AND typed.employee_id=grant_row.value->>'employeeId'
     HAVING count(DISTINCT employee_id)=1 AND count(DISTINCT account_type)=1
   ) typed ON true
   JOIN orgmaster_core.fms_artifact_facts employee ON employee.batch_id=publication.batch_id
     AND employee.artifact_key=publication.workspace_artifact_key AND employee.kind='employee'
     AND employee.lookup_key=grant_row.value->>'employeeId' AND employee.fact->>'status'='active'
   CROSS JOIN catalogs catalog
   WHERE grant_row.value->>'principalId'=p_principal_id
    AND grant_row.value->>'roleCode'='application_system_admin'
    AND grant_row.value->>'applicationId'='financial-management-system'
    AND grant_row.value->>'status'='active'
    AND (grant_row.value->>'validFrom')::timestamptz<=p_at
    AND (grant_row.value->>'validTo' IS NULL OR (grant_row.value->>'validTo')::timestamptz>p_at)
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
   p_at AS read_at,COALESCE(base.governance_revision,trim(admin.governance_revision)) AS governance_revision,
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

CREATE OR REPLACE FUNCTION orgmaster_core.read_fms_fact_accounts_v1(
  p_principal_id text, p_issuer text, p_subject text
) RETURNS SETOF orgmaster_contract.v_active_principal_accounts_v1
LANGUAGE sql STABLE SET search_path=pg_catalog AS $accounts_now$
  SELECT * FROM orgmaster_core.read_fms_fact_accounts_at_v1(p_principal_id, p_issuer, p_subject, CURRENT_TIMESTAMP);
$accounts_now$;

CREATE OR REPLACE FUNCTION orgmaster_contract.read_fms_authority_for_principal_v4(p_principal_id text, p_application_id text)
RETURNS SETOF orgmaster_contract.v_fms_authority_v4
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $reader_now$
  SELECT * FROM orgmaster_core.read_fms_authority_at_v1(p_principal_id, p_application_id, CURRENT_TIMESTAMP);
$reader_now$;

REVOKE ALL ON FUNCTION orgmaster_core.read_fms_fact_accounts_at_v1(text,text,text,timestamptz),
  orgmaster_core.read_fms_authority_at_v1(text,text,timestamptz) FROM PUBLIC;

-- Evaluate the same v4 authority at each known future transition. Keep absent
-- intervals as boundaries so a change to an effective start or end is visible.
CREATE FUNCTION orgmaster_core.read_fms_authority_timeline_v1(p_principal_id text, p_at timestamptz)
RETURNS TABLE(valid_from timestamptz, valid_until timestamptz, effect jsonb)
LANGUAGE sql STABLE SET search_path=pg_catalog SET timezone='UTC' AS $timeline$
WITH source AS MATERIALIZED (
  SELECT batch_id FROM orgmaster_core.v_fms_fact_source_v1
), links AS MATERIALIZED (
  SELECT link.fact FROM source JOIN orgmaster_core.fms_artifact_facts link USING (batch_id)
  WHERE link.artifact_key='orgmaster-governance.v3.json' AND link.kind='principal_link'
    AND link.lookup_key=p_principal_id AND link.fact->>'status'='active'
), employees AS (
  SELECT fact->>'employeeId' AS employee_id FROM links
  UNION
  SELECT managed.employee_id FROM orgmaster_core.managed_daily_identities managed
  WHERE managed.principal_id=p_principal_id AND managed.link_state='active'
), relevant AS (
  SELECT fact FROM links
  UNION ALL
  SELECT row.fact FROM source JOIN orgmaster_core.fms_artifact_facts row USING (batch_id)
  WHERE row.artifact_key='orgmaster-governance.v3.json' AND row.fact->>'status'='active'
    AND ((row.kind IN ('management_grant','admin_grant') AND row.lookup_key=p_principal_id)
      OR (row.kind='assignment' AND row.lookup_key IN (SELECT employee_id FROM employees)))
), points AS (
  SELECT p_at AS instant
  UNION
  SELECT boundary.instant FROM relevant
  CROSS JOIN LATERAL (VALUES (NULLIF(fact->>'validFrom','')::timestamptz),
    (NULLIF(fact->>'validTo','')::timestamptz)) boundary(instant)
  WHERE boundary.instant > p_at
), evaluated AS (
  SELECT points.instant, COALESCE(authority.effect,'[]'::jsonb) AS effect
  FROM points
  CROSS JOIN LATERAL (
    SELECT jsonb_agg(signature.value ORDER BY signature.value) AS effect
    FROM orgmaster_core.read_fms_authority_at_v1(p_principal_id,'financial-management-system',points.instant) row
    CROSS JOIN LATERAL (
      -- Published counters and audit metadata can change without changing rights.
      SELECT jsonb_build_array(row.employee_id, row.catalog_version, row.catalog_content_sha256,
        row.catalog_artifact_sha256,
        (SELECT jsonb_agg(jsonb_build_array(a.principal_issuer,a.principal_subject,a.account_type) ORDER BY a.principal_issuer,a.principal_subject,a.account_type)
          FROM orgmaster_core.read_fms_fact_accounts_at_v1(p_principal_id,NULL,NULL,points.instant) a
          WHERE a.employee_id=row.employee_id),
        (SELECT COALESCE(jsonb_agg(row_value-'assignmentVersion' ORDER BY row_value-'assignmentVersion'),'[]'::jsonb)
          FROM jsonb_array_elements(row.assignments) assignment(row_value)),
        (SELECT COALESCE(jsonb_agg(row_value-'revision' ORDER BY row_value-'revision'),'[]'::jsonb)
          FROM jsonb_array_elements(row.protected_grants) grant_row(row_value))) AS value
    ) signature
  ) authority
), changes AS (
  SELECT instant, effect, lag(effect) OVER (ORDER BY instant) AS previous FROM evaluated
), intervals AS (
  SELECT instant, lead(instant) OVER (ORDER BY instant) AS ends_at, effect
  FROM changes WHERE changes.effect IS DISTINCT FROM changes.previous
)
SELECT intervals.instant, intervals.ends_at, intervals.effect
FROM intervals WHERE intervals.effect<>'[]'::jsonb ORDER BY intervals.instant;
$timeline$;

CREATE FUNCTION orgmaster_core.read_fms_session_impact_v1(p_at timestamptz, p_principal_ids text[] DEFAULT NULL)
RETURNS TABLE(principal_id text, effect jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog SET timezone='UTC' AS $impact$
BEGIN
  IF p_at IS NULL OR NOT orgmaster_contract.is_fms_authority_publication_ready_v1() THEN
    RAISE EXCEPTION 'FMS_AUTHORITY_PUBLICATION_UNAVAILABLE';
  END IF;
  RETURN QUERY
  WITH source AS MATERIALIZED (SELECT batch_id FROM orgmaster_core.v_fms_fact_source_v1),
  linked AS (
    SELECT link.lookup_key AS principal_id, link.fact->>'employeeId' AS employee_id
    FROM source JOIN orgmaster_core.fms_artifact_facts link USING (batch_id)
    WHERE link.artifact_key='orgmaster-governance.v3.json' AND link.kind='principal_link'
      AND link.fact->>'status'='active'
    UNION
    SELECT identity.principal_id, identity.employee_id FROM orgmaster_core.managed_daily_identities identity
    WHERE identity.link_state='active' AND identity.principal_id IS NOT NULL
  ), potential AS MATERIALIZED (
    SELECT DISTINCT link.principal_id FROM linked link
    WHERE (p_principal_ids IS NULL OR link.principal_id=ANY(p_principal_ids))
      AND EXISTS (
        SELECT 1 FROM source JOIN orgmaster_core.fms_artifact_facts fact USING (batch_id)
        WHERE fact.artifact_key='orgmaster-governance.v3.json' AND fact.fact->>'status'='active'
          AND ((fact.kind='assignment' AND fact.lookup_key=link.employee_id)
            OR (fact.kind IN ('management_grant','admin_grant') AND fact.lookup_key=link.principal_id))
      )
  )
  SELECT potential.principal_id, timeline.effect
  FROM potential
  CROSS JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_array(NULLIF(period.valid_from,p_at),period.valid_until,period.effect)
      ORDER BY period.valid_from) AS effect
    FROM orgmaster_core.read_fms_authority_timeline_v1(potential.principal_id,p_at) period
  ) timeline
  WHERE timeline.effect IS NOT NULL ORDER BY potential.principal_id COLLATE "C";
END;
$impact$;

REVOKE ALL ON FUNCTION orgmaster_core.read_fms_authority_timeline_v1(text,timestamptz),
  orgmaster_core.read_fms_session_impact_v1(timestamptz,text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orgmaster_core.read_fms_session_impact_v1(timestamptz,text[]) TO jenfu_orgmaster_runtime;
COMMIT;
