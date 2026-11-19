-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: FMS v4 authority and additive exact admission/display readers
-- compatibility: additive
-- governance-review: DEV-070
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_orgmaster_migrator;
SELECT pg_advisory_xact_lock(hashtext('dev070-fms-indexed-authority'),hashtext(current_database()));

-- These facts follow the source artifact's batch and key. The existing batch
-- pointer remains the publication boundary. Dates and lifecycle fences are
-- evaluated by the readers, so clock transitions require no refresh.
CREATE TABLE orgmaster_core.fms_artifact_facts (
  batch_id uuid NOT NULL,
  artifact_key text NOT NULL,
  kind text NOT NULL,
  lookup_key text NOT NULL,
  fact jsonb NOT NULL,
  FOREIGN KEY (batch_id, artifact_key)
    REFERENCES orgmaster_core.persistence_artifacts(batch_id, artifact_key)
    ON DELETE CASCADE
);
CREATE INDEX fms_artifact_facts_lookup
  ON orgmaster_core.fms_artifact_facts(batch_id, artifact_key, kind, lookup_key);
REVOKE ALL ON TABLE orgmaster_core.fms_artifact_facts FROM PUBLIC;

CREATE FUNCTION orgmaster_core.project_fms_artifact_v1(
  p_batch_id uuid, p_artifact_key text, p_artifact_kind text, p_payload jsonb
) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $project$
BEGIN
  IF p_artifact_key = 'orgmaster-governance.v3.json' AND p_artifact_kind = 'governance' THEN
    INSERT INTO orgmaster_core.fms_artifact_facts
      (batch_id, artifact_key, kind, lookup_key, fact)
    WITH published AS MATERIALIZED (
      SELECT version.value AS publication
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_payload->'publishedVersions')='array'
        THEN p_payload->'publishedVersions' ELSE '[]'::jsonb END) version(value)
    ), current_policy AS MATERIALIZED (
      SELECT publication FROM published
      WHERE publication->>'id'=p_payload->>'activePolicyVersionId'
    ), facts AS (
      SELECT 'policy' AS kind, '' AS lookup_key,
        jsonb_build_object('id',publication->'id','kind',publication->'kind',
          'versionNumber',publication->'versionNumber','publishedAt',publication->'publishedAt',
          'administrationVersion',publication#>'{policy,administration,version}') AS fact
      FROM current_policy
      UNION ALL
      SELECT 'catalog', '', entry.value FROM current_policy
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(publication->'externalRoleCatalogs')='array'
        THEN publication->'externalRoleCatalogs' ELSE '[]'::jsonb END) entry(value)
      WHERE entry.value->>'applicationId'='financial-management-system'
      UNION ALL
      SELECT 'historical_catalog', COALESCE(entry.value->>'catalogVersion',''),
        entry.value - 'roles' FROM published
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(publication->'externalRoleCatalogs')='array'
        THEN publication->'externalRoleCatalogs' ELSE '[]'::jsonb END) entry(value)
      WHERE entry.value->>'applicationId'='financial-management-system'
      UNION ALL
      SELECT 'assignment', assignment.value->>'employeeId', assignment.value FROM current_policy
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(publication#>'{policy,roleAssignments}')='array'
        THEN publication#>'{policy,roleAssignments}' ELSE '[]'::jsonb END) assignment(value)
      WHERE assignment.value->>'applicationId'='financial-management-system'
        AND assignment.value->>'employeeId' IS NOT NULL AND publication->>'kind'='assignment-governance-v3'
      UNION ALL
      SELECT 'management_grant', grant_row.value->>'principalId', grant_row.value FROM current_policy
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(publication#>'{policy,managementGrants}')='array'
        THEN publication#>'{policy,managementGrants}' ELSE '[]'::jsonb END) grant_row(value)
      WHERE grant_row.value->>'applicationId'='financial-management-system'
        AND grant_row.value->>'principalId' IS NOT NULL AND publication->>'kind'='assignment-governance-v3'
      UNION ALL
      SELECT 'admin_grant', grant_row.value->>'principalId', grant_row.value FROM current_policy
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(publication#>'{policy,administration,grants}')='array'
        THEN publication#>'{policy,administration,grants}' ELSE '[]'::jsonb END) grant_row(value)
      WHERE grant_row.value->>'applicationId'='financial-management-system'
        AND grant_row.value->>'principalId' IS NOT NULL
      UNION ALL
      SELECT key.kind, key.lookup_key, link.value FROM current_policy
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(publication#>'{policy,identityLinks}')='array'
        THEN publication#>'{policy,identityLinks}' ELSE '[]'::jsonb END) link(value)
      CROSS JOIN LATERAL (VALUES ('principal_link', link.value->>'principalId'),
        ('identity_link', md5(jsonb_build_array(link.value->>'issuer',link.value->>'subject')::text))) key(kind,lookup_key)
      WHERE key.lookup_key IS NOT NULL AND publication->>'kind'='assignment-governance-v3'
      UNION ALL
      SELECT 'admission', entry.value->>'identityLinkId', entry.value FROM current_policy
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(publication#>'{policy,principalAdmissions}')='array'
        THEN publication#>'{policy,principalAdmissions}' ELSE '[]'::jsonb END) entry(value)
      WHERE entry.value->>'identityLinkId' IS NOT NULL AND publication->>'kind'='assignment-governance-v3'
    )
    SELECT p_batch_id,p_artifact_key,kind,lookup_key,fact FROM facts;
    IF (SELECT count(*) FROM orgmaster_core.fms_artifact_facts
        WHERE batch_id=p_batch_id AND artifact_key=p_artifact_key AND kind='policy' AND lookup_key='') > 1 THEN
      RAISE EXCEPTION 'FMS_ACTIVE_POLICY_AMBIGUOUS';
    END IF;
  ELSIF p_artifact_key = 'orgmaster-workspace.v1.json' AND p_artifact_kind = 'workspace-manifest' THEN
    INSERT INTO orgmaster_core.fms_artifact_facts VALUES
      (p_batch_id,p_artifact_key,'workspace_pointer','',jsonb_build_object('versionId',p_payload->'currentVersionId'));
  ELSIF p_artifact_kind = 'workspace-version' AND p_payload->>'kind' = 'document' THEN
    INSERT INTO orgmaster_core.fms_artifact_facts
    SELECT p_batch_id,p_artifact_key,'employee',employee.value->>'id',
      jsonb_build_object('status',employee.value->'status','name',employee.value->'name')
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_payload#>'{state,employees}')='array'
      THEN p_payload#>'{state,employees}' ELSE '[]'::jsonb END) employee(value)
    WHERE employee.value->>'id' IS NOT NULL;
  END IF;
END;
$project$;

CREATE FUNCTION orgmaster_core.refresh_fms_artifact_facts_v1(p_batch_id uuid) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $refresh$
BEGIN
  DELETE FROM orgmaster_core.fms_artifact_facts;
  PERFORM orgmaster_core.project_fms_artifact_v1(batch_id,artifact_key,artifact_kind,payload)
  FROM orgmaster_core.persistence_artifacts
  WHERE batch_id=p_batch_id AND artifact_key IN ('orgmaster-governance.v3.json','orgmaster-workspace.v1.json');
  PERFORM orgmaster_core.project_fms_artifact_v1(workspace.batch_id,workspace.artifact_key,workspace.artifact_kind,workspace.payload)
  FROM orgmaster_core.fms_artifact_facts pointer
  JOIN orgmaster_core.persistence_artifacts workspace ON workspace.batch_id=pointer.batch_id
    AND workspace.artifact_key='orgmaster-versions/'||(pointer.fact->>'versionId')||'.json'
    AND workspace.artifact_kind='workspace-version'
  WHERE pointer.batch_id=p_batch_id AND pointer.kind='workspace_pointer';
END;
$refresh$;

CREATE FUNCTION orgmaster_core.sync_fms_active_batch_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $sync$
BEGIN
  IF TG_OP='DELETE' THEN
    PERFORM orgmaster_core.refresh_fms_artifact_facts_v1(NULL);
    RETURN OLD;
  END IF;
  IF TG_OP='INSERT' OR OLD.active_batch_id IS DISTINCT FROM NEW.active_batch_id THEN
    PERFORM orgmaster_core.refresh_fms_artifact_facts_v1(NEW.active_batch_id);
  END IF;
  RETURN NEW;
END;
$sync$;

CREATE FUNCTION orgmaster_core.sync_fms_active_artifact_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $sync$
DECLARE source orgmaster_core.persistence_artifacts%ROWTYPE; active uuid;
BEGIN
  IF TG_OP='UPDATE' AND (OLD.batch_id,OLD.artifact_key,OLD.artifact_kind,OLD.canonical_sha256)
      IS NOT DISTINCT FROM (NEW.batch_id,NEW.artifact_key,NEW.artifact_kind,NEW.canonical_sha256)
      AND OLD.payload IS NOT DISTINCT FROM NEW.payload THEN
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' THEN source := OLD; ELSE source := NEW; END IF;
  IF source.artifact_key NOT IN ('orgmaster-governance.v3.json','orgmaster-workspace.v1.json')
      AND source.artifact_kind <> 'workspace-version' THEN
    RETURN source;
  END IF;
  -- Normal writers lock this row before building the next batch. A write to
  -- the active source serializes with publication, including owner fixtures.
  SELECT active_batch_id INTO active FROM orgmaster_core.persistence_authority WHERE singleton FOR UPDATE;
  IF source.batch_id=active AND (source.artifact_kind <> 'workspace-version' OR EXISTS (
    SELECT 1 FROM orgmaster_core.fms_artifact_facts pointer
    WHERE pointer.batch_id=active AND pointer.kind='workspace_pointer'
      AND source.artifact_key='orgmaster-versions/'||(pointer.fact->>'versionId')||'.json'
  )) THEN
    PERFORM orgmaster_core.refresh_fms_artifact_facts_v1(active);
  END IF;
  RETURN source;
END;
$sync$;
REVOKE ALL ON FUNCTION orgmaster_core.project_fms_artifact_v1(uuid,text,text,jsonb),
  orgmaster_core.refresh_fms_artifact_facts_v1(uuid), orgmaster_core.sync_fms_active_batch_v1(),
  orgmaster_core.sync_fms_active_artifact_v1() FROM PUBLIC;

-- Lock in the source writer's order. Only active facts are retained. Every
-- activation, including reactivation of an older batch, projects its sources
-- in the same transaction as the existing publication pointer.
LOCK TABLE orgmaster_core.persistence_authority IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE orgmaster_core.persistence_artifacts IN SHARE ROW EXCLUSIVE MODE;
CREATE TRIGGER fms_batch_projection AFTER INSERT OR UPDATE OR DELETE
ON orgmaster_core.persistence_authority FOR EACH ROW
EXECUTE FUNCTION orgmaster_core.sync_fms_active_batch_v1();
CREATE TRIGGER fms_artifact_projection AFTER INSERT OR UPDATE OF payload, canonical_sha256 OR DELETE
ON orgmaster_core.persistence_artifacts FOR EACH ROW
EXECUTE FUNCTION orgmaster_core.sync_fms_active_artifact_v1();
SELECT orgmaster_core.refresh_fms_artifact_facts_v1(active_batch_id)
FROM orgmaster_core.persistence_authority WHERE singleton;

-- Lookup context carries only scalar artifact metadata and current pointers.
CREATE VIEW orgmaster_core.v_fms_fact_source_v1 AS
SELECT authority.active_batch_id AS batch_id,
       trim(governance.canonical_sha256) AS governance_revision,
       trim(workspace.canonical_sha256) AS workspace_revision,
       pointer.fact->>'versionId' AS workspace_version_id,
       workspace.artifact_key AS workspace_artifact_key
FROM orgmaster_core.persistence_authority authority
JOIN orgmaster_core.persistence_batches batch ON batch.id=authority.active_batch_id AND batch.status='active'
JOIN orgmaster_core.persistence_artifacts governance ON governance.batch_id=batch.id
  AND governance.artifact_key='orgmaster-governance.v3.json' AND governance.artifact_kind='governance'
JOIN orgmaster_core.fms_artifact_facts pointer ON pointer.batch_id=batch.id
  AND pointer.artifact_key='orgmaster-workspace.v1.json' AND pointer.kind='workspace_pointer' AND pointer.lookup_key=''
JOIN orgmaster_core.persistence_artifacts workspace ON workspace.batch_id=batch.id
  AND workspace.artifact_key='orgmaster-versions/'||(pointer.fact->>'versionId')||'.json'
  AND workspace.artifact_kind='workspace-version'
WHERE authority.singleton AND trim(workspace.canonical_sha256) ~ '^[a-f0-9]{64}$';

-- The event payload is immutable. Index its exact Principal targets once;
-- delivery status stays live and does not require a projection refresh.
CREATE TABLE orgmaster_core.fms_lifecycle_targets (
  principal_id text NOT NULL,
  event_id uuid NOT NULL REFERENCES orgmaster_core.principal_lifecycle_events_v2(event_id),
  PRIMARY KEY(principal_id,event_id)
);
REVOKE ALL ON TABLE orgmaster_core.fms_lifecycle_targets FROM PUBLIC;

CREATE FUNCTION orgmaster_core.project_fms_lifecycle_targets_v1(p_event_id uuid,p_snapshot text)
RETURNS void LANGUAGE sql SET search_path=pg_catalog AS $project$
  INSERT INTO orgmaster_core.fms_lifecycle_targets(principal_id,event_id)
  SELECT DISTINCT principal.value->>'principalId',p_event_id
  FROM jsonb_array_elements(p_snapshot::jsonb->'principals') principal(value)
  WHERE principal.value->>'principalId' IS NOT NULL
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(principal.value->'pairs'))
  ON CONFLICT DO NOTHING
$project$;
CREATE FUNCTION orgmaster_core.sync_fms_lifecycle_targets_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $sync$
BEGIN
  PERFORM orgmaster_core.project_fms_lifecycle_targets_v1(NEW.event_id,NEW.snapshot_text);
  RETURN NEW;
END;
$sync$;
REVOKE ALL ON FUNCTION orgmaster_core.project_fms_lifecycle_targets_v1(uuid,text),
  orgmaster_core.sync_fms_lifecycle_targets_v1() FROM PUBLIC;

LOCK TABLE orgmaster_core.principal_lifecycle_events_v2 IN SHARE ROW EXCLUSIVE MODE;
CREATE TRIGGER fms_lifecycle_projection AFTER INSERT
ON orgmaster_core.principal_lifecycle_events_v2 FOR EACH ROW
EXECUTE FUNCTION orgmaster_core.sync_fms_lifecycle_targets_v1();
SELECT orgmaster_core.project_fms_lifecycle_targets_v1(event_id,snapshot_text)
FROM orgmaster_core.principal_lifecycle_events_v2;

CREATE FUNCTION orgmaster_core.read_fms_fact_accounts_v1(
  p_principal_id text, p_issuer text, p_subject text
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
    AND (link.fact->>'validFrom')::timestamptz <= CURRENT_TIMESTAMP
    AND ((link.fact->>'validTo') IS NULL OR (link.fact->>'validTo')::timestamptz > CURRENT_TIMESTAMP)
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
REVOKE ALL ON FUNCTION orgmaster_core.read_fms_fact_accounts_v1(text,text,text) FROM PUBLIC;

CREATE FUNCTION orgmaster_contract.read_fms_principal_admission_v2(p_issuer text,p_subject text)
RETURNS SETOF orgmaster_contract.v_fms_principal_admissions_v2
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $admission$
SELECT 'jenfu.orgmaster.fms-authority.v2'::text,account.principal_issuer,account.principal_subject,
  account.principal_id,account.employee_id,account.account_type,true,account.mapping_version::text,
  account.mapping_version::text,NULL::text,CURRENT_TIMESTAMP,source.workspace_revision
FROM orgmaster_core.read_fms_fact_accounts_v1(NULL,p_issuer,p_subject) account
CROSS JOIN orgmaster_core.v_fms_fact_source_v1 source
JOIN orgmaster_core.fms_artifact_facts employee ON employee.batch_id=source.batch_id
  AND employee.artifact_key=source.workspace_artifact_key AND employee.kind='employee'
WHERE employee.lookup_key=account.employee_id AND employee.fact->>'status'='active'
  AND NULLIF(account.principal_issuer,'') IS NOT NULL AND NULLIF(account.principal_subject,'') IS NOT NULL
  AND NULLIF(account.principal_id,'') IS NOT NULL AND NULLIF(account.employee_id,'') IS NOT NULL
  AND account.mapping_version IS NOT NULL;
$admission$;

CREATE OR REPLACE FUNCTION orgmaster_contract.read_fms_authority_for_principal_v4(p_principal_id text, p_application_id text)
RETURNS SETOF orgmaster_contract.v_fms_authority_v4
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $reader$
SELECT scoped.*
  FROM (
  WITH source AS MATERIALIZED (
    SELECT * FROM orgmaster_core.v_fms_fact_source_v1
    WHERE NULLIF(p_principal_id,'') IS NOT NULL AND p_application_id='financial-management-system'
  ), accounts AS MATERIALIZED (
    SELECT * FROM orgmaster_core.read_fms_fact_accounts_v1(p_principal_id,NULL,NULL)
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

CREATE FUNCTION orgmaster_contract.read_fms_principal_display_profile_v1(p_principal_id text,p_employee_id text)
RETURNS SETOF orgmaster_contract.v_fms_principal_display_profiles_v1
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $display$
WITH qualified AS MATERIALIZED (
  SELECT authority.principal_id,authority.employee_id
  FROM orgmaster_contract.read_fms_authority_for_principal_v4(p_principal_id,'financial-management-system') authority
), employee AS (
  SELECT min(NULLIF(btrim(projected.fact->>'name'),'')) AS employee_name
  FROM orgmaster_core.v_fms_fact_source_v1 source
  JOIN orgmaster_core.fms_artifact_facts projected ON projected.batch_id=source.batch_id
    AND projected.artifact_key=source.workspace_artifact_key AND projected.kind='employee'
    AND projected.lookup_key=p_employee_id
  HAVING count(*)=1 AND bool_and(projected.fact->>'status'='active')
)
SELECT p_principal_id,p_employee_id,employee.employee_name FROM employee
WHERE (SELECT count(*) FROM qualified)=1
  AND EXISTS (SELECT 1 FROM qualified WHERE principal_id=p_principal_id AND employee_id=p_employee_id);
$display$;

REVOKE ALL ON FUNCTION orgmaster_contract.read_fms_principal_admission_v2(text,text),
  orgmaster_contract.read_fms_principal_display_profile_v1(text,text) FROM PUBLIC;
DO $fms_acl$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fms_runtime') THEN
    GRANT EXECUTE ON FUNCTION orgmaster_contract.read_fms_principal_admission_v2(text,text),
      orgmaster_contract.read_fms_principal_display_profile_v1(text,text) TO fms_runtime;
  END IF;
END; $fms_acl$;

COMMENT ON FUNCTION orgmaster_contract.read_fms_principal_admission_v2(text,text) IS
  'FMS v2 admission columns for one exact issuer/subject. Identity and lifecycle eligibility are evaluated live.';
COMMENT ON FUNCTION orgmaster_contract.read_fms_principal_display_profile_v1(text,text) IS
  'Optional name for one exact currently FMS-v4-qualified Principal/Employee pair. Not an admission source.';
COMMENT ON FUNCTION orgmaster_contract.read_fms_authority_for_principal_v4(text,text) IS
  'FMS v4 authority from transactionally published indexed facts with live identity, expiry and lifecycle fences.';

COMMIT;
