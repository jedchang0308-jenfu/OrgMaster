-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: orgmaster.administration-policy.v1
-- compatibility: new-version
-- governance-review: ORGMASTER/DEV-070
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SET LOCAL ROLE jenfu_orgmaster_migrator;
SELECT pg_advisory_xact_lock(hashtext('dev070-administration'),hashtext(current_database()));

CREATE FUNCTION orgmaster_core.read_administration_publication_v1()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE document jsonb; publication jsonb;
BEGIN
  SELECT artifact.payload INTO STRICT document
    FROM orgmaster_core.persistence_authority authority
    JOIN orgmaster_core.persistence_batches batch ON batch.id=authority.active_batch_id AND batch.status='active'
    JOIN orgmaster_core.persistence_artifacts artifact ON artifact.batch_id=batch.id AND artifact.artifact_key='orgmaster-governance.v3.json' AND artifact.artifact_kind='governance'
   WHERE authority.singleton;
  IF document->>'schemaVersion'<>'3' OR jsonb_typeof(document->'publishedVersions')<>'array' THEN RAISE EXCEPTION 'ADMINISTRATION_DEPENDENCY_UNAVAILABLE'; END IF;
  IF document->>'activePolicyVersionId' IS NULL THEN RETURN NULL; END IF;
  SELECT value INTO STRICT publication FROM jsonb_array_elements(document->'publishedVersions')
   WHERE value->>'id'=document->>'activePolicyVersionId' AND value->>'kind'='assignment-governance-v3';
  IF publication#>'{policy,administration}' IS NOT NULL AND (
    publication#>>'{policy,administration,contractVersion}'<>'orgmaster.administration-policy.v1'
    OR jsonb_typeof(publication#>'{policy,administration,grants}')<>'array'
    OR (publication#>>'{policy,administration,version}')::numeric NOT BETWEEN 1 AND 9007199254740991
  ) THEN RAISE EXCEPTION 'ADMINISTRATION_DEPENDENCY_UNAVAILABLE'; END IF;
  IF to_regprocedure('orgmaster_core.assert_administration_policy_v1(jsonb)') IS NOT NULL THEN
   BEGIN EXECUTE 'SELECT orgmaster_core.assert_administration_policy_v1($1)' USING publication#>'{policy,administration}';
   EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'ADMINISTRATION_DEPENDENCY_UNAVAILABLE'; END;
  END IF;
  RETURN publication;
EXCEPTION WHEN no_data_found OR too_many_rows OR invalid_text_representation THEN
  RAISE EXCEPTION 'ADMINISTRATION_DEPENDENCY_UNAVAILABLE';
END;
$fn$;

CREATE FUNCTION orgmaster_core.administrative_catalog_current_v1(p_application text,p_binding jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE current_match boolean; provenance_match boolean; publication jsonb; definition jsonb; codes jsonb; definition_hash text; content_hash text;
BEGIN
 IF p_application='ai-pdm' THEN
 IF to_regclass('ai_pdm_contract.v_application_role_catalog_v3') IS NULL OR to_regclass('ai_pdm_contract.v_role_policy_publications_v1') IS NULL THEN RETURN false; END IF;
 EXECUTE 'SELECT EXISTS(SELECT 1 FROM ai_pdm_contract.v_application_role_catalog_v3 WHERE stable_role_id=$1 AND role_code=''application_system_admin'' AND role_definition_hash=$2 AND role_status=''active'' AND subject_kind=''principal'' AND NOT assignable)' INTO current_match USING p_binding->>'stableRoleId',p_binding->>'roleDefinitionHash';
 EXECUTE 'SELECT EXISTS(SELECT 1 FROM ai_pdm_contract.v_role_policy_publications_v1 WHERE catalog_version=$1 AND catalog_sha256=$2 AND stable_role_id=$3 AND role_definition_hash=$4)' INTO provenance_match USING p_binding->>'catalogVersion',p_binding->>'contentSha256',p_binding->>'stableRoleId',p_binding->>'roleDefinitionHash';
 RETURN current_match AND provenance_match;
 ELSIF p_application='orgmaster' THEN
 publication:=orgmaster_core.read_administration_publication_v1();
 IF publication IS NULL AND to_regprocedure('orgmaster_core.administration_bootstrap_seed_v1()') IS NOT NULL THEN EXECUTE 'SELECT jsonb_build_object(''policy'',orgmaster_core.administration_bootstrap_seed_v1())' INTO publication; END IF;
 SELECT COALESCE(jsonb_agg(permission->>'code' ORDER BY permission->>'code'),'[]'::jsonb) INTO codes FROM jsonb_array_elements(COALESCE(publication#>'{policy,permissions}','[]'::jsonb)) permission
 WHERE permission->>'applicationId'='orgmaster' AND permission->>'status'='active' AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(publication#>'{policy,rolePermissionGrants}','[]'::jsonb)) grant_row WHERE grant_row->>'roleId'='role-orgmaster-admin' AND grant_row->>'effect'='allow' AND grant_row->>'permissionId'=permission->>'id');
 definition:=jsonb_build_object('stableRoleId','role-orgmaster-admin','permissionCodes',codes);
 -- This function is installed before the v045 canonicalizer. jsonb text is
 -- never treated as a JS content hash; the writer supplies the source pin.
 IF to_regprocedure('orgmaster_core.administration_sha256_v1(jsonb)') IS NULL THEN RETURN false; END IF;
 EXECUTE 'SELECT orgmaster_core.administration_sha256_v1($1),orgmaster_core.administration_sha256_v1($2)' INTO definition_hash,content_hash USING definition,jsonb_build_object('catalogVersion','orgmaster.system-admin.v1','definition',definition);
 RETURN p_binding->>'catalogVersion'='orgmaster.system-admin.v1' AND p_binding->>'stableRoleId'='role-orgmaster-admin' AND p_binding->>'roleDefinitionHash'=definition_hash AND p_binding->>'contentSha256'=content_hash;
 ELSIF p_application='financial-management-system' THEN
 publication:=orgmaster_core.read_administration_publication_v1();
 RETURN p_binding->>'roleDefinitionHash'='2a8ab5c084e00f9cd1f9a87e193d1269ea85c80eb66fba78c1b6ab2ab467ce11' AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(publication->'externalRoleCatalogs','[]'::jsonb)) catalog
 CROSS JOIN LATERAL jsonb_array_elements(COALESCE(catalog->'roles','[]'::jsonb)) role
 WHERE catalog->>'applicationId'=p_application AND catalog->>'validationState'='valid' AND role->>'stableRoleId'='role-system-admin' AND role->>'status'='active' AND role->>'roleDefinitionHash'=p_binding->>'roleDefinitionHash'
 AND EXISTS(SELECT 1 FROM orgmaster_core.persistence_authority authority JOIN orgmaster_core.persistence_artifacts artifact ON artifact.batch_id=authority.active_batch_id AND artifact.artifact_key='orgmaster-governance.v3.json'
 CROSS JOIN LATERAL jsonb_array_elements(artifact.payload->'publishedVersions') version CROSS JOIN LATERAL jsonb_array_elements(COALESCE(version->'externalRoleCatalogs','[]'::jsonb)) authoring
 WHERE authoring->>'applicationId'=p_application AND authoring->>'catalogVersion'=p_binding->>'catalogVersion' AND authoring->>'contentSha256'=p_binding->>'contentSha256'));
 END IF;
 RETURN false;
END; $fn$;
REVOKE ALL ON FUNCTION orgmaster_core.administrative_catalog_current_v1(text,jsonb) FROM PUBLIC;

CREATE VIEW orgmaster_core.v_effective_administrative_grants_v1 WITH(security_barrier=true) AS
WITH publication AS (SELECT orgmaster_core.read_administration_publication_v1() AS payload),
native AS (
 SELECT principal_id,min(employee_id) employee_id FROM orgmaster_contract.v_active_principal_accounts_v1
 WHERE employee_status='active' AND account_type IN ('human_personal','human_privileged')
 GROUP BY principal_id HAVING count(DISTINCT employee_id)=1 AND count(DISTINCT account_type)=1
), grants AS (
 SELECT publication.payload,grant_row.value AS grant_payload FROM publication
 CROSS JOIN LATERAL jsonb_array_elements(COALESCE(publication.payload#>'{policy,administration,grants}','[]'::jsonb)) grant_row(value)
)
SELECT grants.payload AS publication,grants.grant_payload
FROM grants JOIN native ON native.principal_id=grants.grant_payload->>'principalId' AND native.employee_id=grants.grant_payload->>'employeeId'
JOIN orgmaster_core.v_current_workspace_employees_v1 employee ON employee.employee_id=native.employee_id AND employee.employee_status='active'
WHERE grant_payload->>'status'='active' AND grant_payload->>'subjectKind'='principal' AND grant_payload->>'basis'='manual'
 AND (grant_payload->>'validFrom')::timestamptz<=CURRENT_TIMESTAMP
 AND ((grant_payload->>'validTo') IS NULL OR (grant_payload->>'validTo')::timestamptz>CURRENT_TIMESTAMP)
 AND ((grant_payload->>'roleCode'='platform_super_admin' AND grant_payload->>'applicationId' IS NULL AND grant_payload#>>'{scope,kind}'='platform' AND grant_payload->>'validTo' IS NULL AND grant_payload->>'catalogBinding' IS NULL)
 OR (grant_payload->>'roleCode'='application_system_admin' AND grant_payload#>>'{scope,kind}'='global' AND grant_payload->>'applicationId' IN ('orgmaster','ai-pdm','financial-management-system')
 AND orgmaster_core.administrative_catalog_current_v1(grant_payload->>'applicationId',grant_payload->'catalogBinding')));

CREATE VIEW orgmaster_contract.v_platform_administrator_grants_v1 WITH(security_barrier=true) AS
SELECT 'orgmaster.platform-administrator-grants.v1'::text AS contract_version,
 (publication#>>'{policy,administration,version}')::bigint AS administration_version,
 (grant_payload->>'id')::uuid AS grant_id,grant_payload->>'principalId' AS principal_id,grant_payload->>'employeeId' AS employee_id,
 grant_payload->>'roleCode' AS role_code,grant_payload#>>'{scope,kind}' AS scope_kind,grant_payload->>'status' AS status,
 (grant_payload->>'validFrom')::timestamptz AS valid_from,(grant_payload->>'validTo')::timestamptz AS valid_until,
 publication->>'id' AS published_policy_id,(publication->>'publishedAt')::timestamptz AS published_at
FROM orgmaster_core.v_effective_administrative_grants_v1 WHERE grant_payload->>'roleCode'='platform_super_admin';

CREATE VIEW orgmaster_contract.v_application_administrator_grants_v1 WITH(security_barrier=true) AS
SELECT 'orgmaster.application-administrator-grants.v1'::text AS contract_version,
 (publication#>>'{policy,administration,version}')::bigint AS administration_version,
 (grant_payload->>'id')::uuid AS grant_id,grant_payload->>'applicationId' AS application_id,
 grant_payload->>'principalId' AS principal_id,grant_payload->>'employeeId' AS employee_id,
 grant_payload->>'roleCode' AS role_code,grant_payload->>'subjectKind' AS subject_kind,grant_payload->>'principalId' AS target_principal_id,
 grant_payload->>'basis' AS basis,grant_payload#>>'{scope,kind}' AS scope_kind,NULL::text AS scope_key,grant_payload->>'status' AS status,
 (grant_payload->>'validFrom')::timestamptz AS valid_from,(grant_payload->>'validTo')::timestamptz AS valid_until,
 grant_payload#>>'{createdBy,kind}' AS created_by_kind,grant_payload#>>'{createdBy,id}' AS created_by_id,grant_payload->>'reason' AS reason,
 grant_payload#>>'{catalogBinding,catalogVersion}' AS catalog_version,grant_payload#>>'{catalogBinding,contentSha256}' AS catalog_content_sha256,
 grant_payload#>>'{catalogBinding,stableRoleId}' AS stable_role_id,grant_payload#>>'{catalogBinding,roleDefinitionHash}' AS role_definition_hash,
 (publication->>'publishedAt')::timestamptz AS published_at
FROM orgmaster_core.v_effective_administrative_grants_v1 WHERE grant_payload->>'roleCode'='application_system_admin';

CREATE FUNCTION orgmaster_contract.read_administration_state_v1()
RETURNS TABLE(contract_version text,administration_version bigint,initialized_by_command_id uuid,published_policy_id text,published_at timestamptz,effective_root_count bigint,recovery_required boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE publication jsonb; marker uuid; root_count bigint; pending_administration_barrier boolean:=false;
BEGIN
 publication:=orgmaster_core.read_administration_publication_v1();
 marker:=(publication#>>'{policy,administration,initializedByCommandId}')::uuid;
 SELECT count(*) INTO root_count FROM orgmaster_contract.v_platform_administrator_grants_v1 root
 WHERE EXISTS(SELECT 1 FROM orgmaster_contract.v_application_administrator_grants_v1 entry
   WHERE entry.application_id='orgmaster' AND entry.principal_id=root.principal_id AND entry.employee_id=root.employee_id);
 IF marker IS NOT NULL AND root_count=0 THEN
 SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(publication#>'{policy,administration,grants}','[]'::jsonb)) root
 JOIN LATERAL jsonb_array_elements(orgmaster_core.read_principal_lifecycle_facts_v2()) fact ON fact->>'principalId'=root->>'principalId' AND fact->>'employeeId'=root->>'employeeId'
 WHERE root->>'roleCode'='platform_super_admin' AND root->>'status'='active' AND(root->>'validFrom')::timestamptz<=CURRENT_TIMESTAMP
 AND fact#>>'{facts,employeeStatus}'='active' AND fact->>'accountType' IN('human_personal','human_privileged')
 AND((fact#>'{facts,managed}'<>'null'::jsonb AND fact#>>'{facts,managed,linkState}'='active' AND fact#>>'{facts,managed,admissionEnabled}'='true' AND fact#>>'{facts,managed,directoryState}'='present' AND fact#>>'{facts,managed,primaryEmailMatches}'='true')
 OR(fact#>'{facts,managed}'='null'::jsonb AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(publication#>'{policy,identityLinks}','[]'::jsonb)) link
 JOIN LATERAL jsonb_array_elements(COALESCE(publication#>'{policy,principalAdmissions}','[]'::jsonb)) admission ON admission->>'identityLinkId'=link->>'id'
 WHERE link->>'principalId'=root->>'principalId' AND link->>'employeeId'=root->>'employeeId' AND link->>'status'='active' AND(link->>'validFrom')::timestamptz<=CURRENT_TIMESTAMP AND(link->>'validTo' IS NULL OR(link->>'validTo')::timestamptz>CURRENT_TIMESTAMP) AND admission->>'status'='active' AND admission->>'accountType' IN('human_personal','human_privileged'))))
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(publication#>'{policy,administration,grants}') entry WHERE entry->>'principalId'=root->>'principalId' AND entry->>'employeeId'=root->>'employeeId' AND entry->>'applicationId'='orgmaster' AND entry->>'status'='active' AND(entry->>'validFrom')::timestamptz<=CURRENT_TIMESTAMP AND(entry->>'validTo' IS NULL OR(entry->>'validTo')::timestamptz>CURRENT_TIMESTAMP) AND orgmaster_core.administrative_catalog_current_v1('orgmaster',entry->'catalogBinding'))
 AND EXISTS(SELECT 1 FROM orgmaster_contract.v_principal_lifecycle_targets_v2 target JOIN orgmaster_core.principal_lifecycle_events_v2 event ON event.event_id=target.event_id::uuid JOIN orgmaster_core.principal_lifecycle_delivery_v2 delivery ON delivery.event_id=event.event_id
 WHERE target.principal_id=root->>'principalId' AND event.reason_code='administration_changed' AND delivery.status IN('pending','processing') AND delivery.attempt_count<5)
 AND NOT EXISTS(SELECT 1 FROM orgmaster_contract.v_principal_lifecycle_targets_v2 target JOIN orgmaster_core.principal_lifecycle_events_v2 event ON event.event_id=target.event_id::uuid JOIN orgmaster_core.principal_lifecycle_delivery_v2 delivery ON delivery.event_id=event.event_id
 WHERE target.principal_id=root->>'principalId' AND event.reason_code<>'administration_changed' AND delivery.status<>'completed')) INTO pending_administration_barrier;
 END IF;
 RETURN QUERY SELECT 'orgmaster.administration-state.v1'::text,COALESCE((publication#>>'{policy,administration,version}')::bigint,0),marker,
 publication->>'id',(publication->>'publishedAt')::timestamptz,root_count,marker IS NOT NULL AND root_count=0 AND NOT pending_administration_barrier;
END;
$fn$;

CREATE VIEW orgmaster_contract.v_ai_pdm_principal_effective_grants_v5 WITH(security_barrier=true) AS
SELECT 'jenfu.orgmaster.ai-pdm-principal-grants.v5'::text AS contract_version,
 legacy.assignment_version_id,legacy.assignment_version,legacy.assignment_id,legacy.grant_kind,legacy.delegation_id,
 legacy.application_id,legacy.principal_id,legacy.employee_id,legacy.subject_kind,legacy.target_principal_id,legacy.stable_role_id,legacy.role_code,
 legacy.catalog_version,legacy.scope_kind,legacy.scope_key,legacy.valid_from,legacy.valid_until,legacy.published_at,
 legacy.assignment_id AS source_assignment_id,NULL::text AS source_grant_id,NULL::text AS admin_catalog_sha256,NULL::text AS role_definition_hash
FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v4 legacy
UNION ALL
SELECT 'jenfu.orgmaster.ai-pdm-principal-grants.v5',publication->>'id',(publication->>'versionNumber')::bigint,
 admin.grant_id::text,'direct',NULL::text,'ai-pdm',admin.principal_id,admin.employee_id,'principal',admin.principal_id,
 admin.stable_role_id,'application_system_admin',admin.catalog_version,'global',NULL::text,admin.valid_from,admin.valid_until,admin.published_at,
 admin.grant_id::text,admin.grant_id::text,admin.catalog_content_sha256,admin.role_definition_hash
FROM orgmaster_contract.v_application_administrator_grants_v1 admin
CROSS JOIN LATERAL (SELECT orgmaster_core.read_administration_publication_v1() AS publication) published
WHERE admin.application_id='ai-pdm';

CREATE FUNCTION orgmaster_contract.lock_ai_pdm_role_policy_authority_v2() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 PERFORM 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton FOR SHARE;
 PERFORM 1 FROM orgmaster_core.persistence_authority WHERE singleton FOR SHARE;
END;
$fn$;
CREATE FUNCTION orgmaster_contract.ai_pdm_role_policy_manager_eligible_v2(p_principal text,p_employee text,p_issuer text,p_subject text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
SELECT EXISTS(SELECT 1 FROM orgmaster_contract.v_active_principal_accounts_v1 typed
 WHERE typed.principal_id=p_principal AND typed.employee_id=p_employee AND typed.principal_issuer=p_issuer AND typed.principal_subject=p_subject
 AND typed.employee_status='active' AND typed.account_type IN ('human_personal','human_privileged')
 AND EXISTS(SELECT 1 FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v5 effective
 WHERE effective.principal_id=p_principal AND effective.employee_id=p_employee AND effective.grant_kind='direct' AND effective.delegation_id IS NULL
 AND effective.subject_kind='principal' AND effective.target_principal_id=p_principal AND effective.scope_kind='global'
 AND (effective.stable_role_id='role-application-system-admin' AND effective.source_grant_id IS NOT NULL
   OR effective.stable_role_id='role-system-admin' AND effective.role_code='system_admin' AND typed.account_type='human_privileged')));
$fn$;

REVOKE ALL ON FUNCTION orgmaster_core.read_administration_publication_v1() FROM PUBLIC;
REVOKE ALL ON orgmaster_core.v_effective_administrative_grants_v1 FROM PUBLIC;
REVOKE ALL ON orgmaster_contract.v_platform_administrator_grants_v1,orgmaster_contract.v_application_administrator_grants_v1,orgmaster_contract.v_ai_pdm_principal_effective_grants_v5 FROM PUBLIC;
REVOKE ALL ON FUNCTION orgmaster_contract.read_administration_state_v1(),orgmaster_contract.lock_ai_pdm_role_policy_authority_v2(),orgmaster_contract.ai_pdm_role_policy_manager_eligible_v2(text,text,text,text) FROM PUBLIC;
GRANT SELECT ON orgmaster_contract.v_platform_administrator_grants_v1 TO jenfu_platform_runtime,jenfu_orgmaster_runtime;
GRANT EXECUTE ON FUNCTION orgmaster_contract.read_administration_state_v1() TO jenfu_platform_runtime,jenfu_orgmaster_runtime;
GRANT SELECT ON orgmaster_contract.v_application_administrator_grants_v1 TO jenfu_orgmaster_runtime;
GRANT SELECT ON orgmaster_contract.v_ai_pdm_principal_effective_grants_v5 TO jenfu_ai_pdm_runtime;
GRANT EXECUTE ON FUNCTION orgmaster_contract.lock_ai_pdm_role_policy_authority_v2(),orgmaster_contract.ai_pdm_role_policy_manager_eligible_v2(text,text,text,text) TO jenfu_ai_pdm_runtime,jenfu_ai_pdm_migrator;
CREATE VIEW orgmaster_contract.v_fms_authority_v3 WITH(security_barrier=true) AS
WITH publication AS(SELECT orgmaster_core.read_administration_publication_v1() AS value),
catalog AS(SELECT entry.value AS payload FROM publication CROSS JOIN LATERAL jsonb_array_elements(publication.value->'externalRoleCatalogs') entry(value) WHERE entry.value->>'applicationId'='financial-management-system' AND entry.value->>'validationState'='valid'),
base AS(SELECT * FROM orgmaster_contract.v_fms_authority_v2),
administrators AS(
 SELECT admin.*,typed.mapping_version::text AS principal_binding_version,publication.value AS publication,catalog.payload AS catalog,
 employee.workspace_revision,employee.workspace_version_id,artifact.canonical_sha256 AS governance_revision
 FROM orgmaster_contract.v_application_administrator_grants_v1 admin
 JOIN LATERAL(SELECT min(mapping_version) mapping_version FROM orgmaster_contract.v_active_principal_accounts_v1 typed WHERE typed.principal_id=admin.principal_id AND typed.employee_id=admin.employee_id HAVING count(DISTINCT employee_id)=1) typed ON true
 JOIN orgmaster_core.v_current_workspace_employees_v1 employee ON employee.employee_id=admin.employee_id AND employee.employee_status='active'
 CROSS JOIN publication CROSS JOIN catalog
 JOIN orgmaster_core.persistence_authority authority ON authority.singleton
 JOIN orgmaster_core.persistence_artifacts artifact ON artifact.batch_id=authority.active_batch_id AND artifact.artifact_key='orgmaster-governance.v3.json'
 WHERE admin.application_id='financial-management-system' AND admin.stable_role_id='role-system-admin'
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(catalog.payload->'roles') role WHERE role->>'stableRoleId'=admin.stable_role_id AND role->>'roleDefinitionHash'=admin.role_definition_hash AND role->>'status'='active')
), principals AS(SELECT principal_id,employee_id FROM base UNION SELECT principal_id,employee_id FROM administrators)
SELECT 'jenfu.orgmaster.fms-authority.v3'::text AS contract_version,
 '0d7e8dc00941097690b351316c2e610a6cc5cf0ff52609581103d35f1a3fa5d1'::text AS manifest_hash,
 'financial-management-system'::text AS application_id,principal.principal_id,principal.employee_id,
 COALESCE(base.principal_binding_version,admin.principal_binding_version) AS principal_binding_version,CURRENT_TIMESTAMP AS read_at,
 COALESCE(base.governance_revision,trim(admin.governance_revision)) AS governance_revision,
 COALESCE(base.assignment_version,admin.publication->>'id') AS assignment_version,
 COALESCE(base.workspace_version_id,admin.workspace_version_id) AS workspace_version_id,
 COALESCE(base.workspace_revision,admin.workspace_revision) AS workspace_revision,
 COALESCE(base.catalog_version,admin.catalog->>'catalogVersion') AS catalog_version,
 COALESCE(base.catalog_content_sha256,admin.catalog->>'contentSha256') AS catalog_content_sha256,
 COALESCE(base.catalog_artifact_sha256,admin.catalog->>'artifactSha256') AS catalog_artifact_sha256,
 COALESCE((SELECT jsonb_agg(assignment||jsonb_build_object('subjectKind','employee','basis','manual','targetPrincipalId',NULL,'sourceKind','role_assignment','sourceGrantId',NULL,'administrativeDefinitionHash',NULL)) FROM jsonb_array_elements(base.assignments) assignment),'[]'::jsonb)
 ||CASE WHEN admin.grant_id IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object(
 'principalId',admin.principal_id,'employeeId',admin.employee_id,'assignmentId',admin.grant_id,'stableRoleId',admin.stable_role_id,
 'scope',jsonb_build_object('kind','workspace','key','company-jenfu'),'validFrom',to_char(admin.valid_from AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'validUntil',CASE WHEN admin.valid_until IS NULL THEN NULL ELSE to_char(admin.valid_until AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,'revokedAt',NULL,
 'catalogVersion',admin.catalog->>'catalogVersion','catalogSha256',admin.catalog->>'contentSha256','assignmentVersion',admin.publication->>'id',
 'sourceAssignmentId',admin.grant_id,'authoringCatalogVersion',admin.catalog_version,'authoringCatalogSha256',admin.catalog_content_sha256,
 'subjectKind','principal','basis','manual','targetPrincipalId',admin.principal_id,'sourceKind','administrative_grant','sourceGrantId',admin.grant_id,'administrativeDefinitionHash',admin.role_definition_hash)) END AS assignments,
 COALESCE(base.protected_grants,'[]'::jsonb) AS protected_grants
FROM principals principal LEFT JOIN base USING(principal_id,employee_id) LEFT JOIN administrators admin USING(principal_id,employee_id);
REVOKE ALL ON orgmaster_contract.v_fms_authority_v3 FROM PUBLIC;
GRANT SELECT ON orgmaster_contract.v_fms_authority_v3 TO jenfu_orgmaster_runtime;
GRANT SELECT ON orgmaster_contract.v_principal_display_profiles_v1 TO jenfu_ai_pdm_runtime;
DO $fms_acl$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='fms_runtime') THEN GRANT SELECT ON orgmaster_contract.v_fms_authority_v3 TO fms_runtime; END IF;
END; $fms_acl$;

DO $visibility$ BEGIN
 EXECUTE 'CREATE VIEW orgmaster_core.v_portal_visibility_before_administration_v1 WITH(security_barrier=true) AS '||pg_get_viewdef('orgmaster_contract.v_portal_app_visibility_v1'::regclass,true);
END; $visibility$;
REVOKE ALL ON orgmaster_core.v_portal_visibility_before_administration_v1 FROM PUBLIC;
CREATE OR REPLACE VIEW orgmaster_contract.v_portal_app_visibility_v1 WITH(security_barrier=true) AS
SELECT application_id,principal_issuer,principal_subject,max(assignment_version) AS assignment_version,'visible'::text AS visibility_state FROM(
 SELECT application_id,principal_issuer,principal_subject,assignment_version FROM orgmaster_core.v_portal_visibility_before_administration_v1
 UNION ALL
 SELECT admin.application_id,account.principal_issuer,account.principal_subject,(publication->>'versionNumber')::bigint
 FROM orgmaster_contract.v_application_administrator_grants_v1 admin
 JOIN orgmaster_contract.v_active_principal_accounts_v1 account ON account.principal_id=admin.principal_id AND account.employee_id=admin.employee_id
 CROSS JOIN LATERAL(SELECT orgmaster_core.read_administration_publication_v1() AS publication) published
) rows GROUP BY application_id,principal_issuer,principal_subject;
DO $session_projection$ DECLARE definition text;
BEGIN
 definition:=regexp_replace(pg_get_viewdef('orgmaster_contract.v_orgmaster_session_principals_v2'::regclass,true),';\s*$','');
 EXECUTE 'CREATE OR REPLACE VIEW orgmaster_contract.v_orgmaster_session_principals_v2 WITH(security_barrier=true) AS ('||definition||') UNION SELECT ''orgmaster.session-principal.v2''::text,mapping.principal_issuer,mapping.principal_subject,mapping.principal_id,mapping.employee_id,mapping.employee_status,mapping.mapping_version,mapping.published_at FROM orgmaster_contract.v_active_principal_mappings_v1 mapping JOIN orgmaster_contract.v_application_administrator_grants_v1 admin ON admin.principal_id=mapping.principal_id AND admin.employee_id=mapping.employee_id WHERE admin.application_id IN(''orgmaster'',''ai-pdm'') AND mapping.employee_status=''active''';
END; $session_projection$;
-- A view does not confer EXECUTE on functions in its expressions. Each narrow
-- reader owns only its view's exact tuple; callers never receive the private
-- publication function or a generic application roster.
DO $narrow_readers$ DECLARE item record; definition text; columns text;
BEGIN
 FOR item IN SELECT * FROM (VALUES
 ('v_platform_administrator_grants_v1','read_platform_administrator_grants_v1','jenfu_platform_runtime,jenfu_orgmaster_runtime'),
 ('v_application_administrator_grants_v1','read_application_administrator_grants_v1','jenfu_orgmaster_runtime'),
 ('v_ai_pdm_principal_effective_grants_v5','read_ai_pdm_principal_effective_grants_v5','jenfu_ai_pdm_runtime'),
 ('v_fms_authority_v3','read_fms_authority_v3','jenfu_orgmaster_runtime'),
 ('v_portal_app_visibility_v1','read_portal_app_visibility_administration_v1','jenfu_platform_runtime'),
 ('v_orgmaster_session_principals_v2','read_orgmaster_session_principals_administration_v1','jenfu_orgmaster_runtime'),
 ('v_principal_display_profiles_v1','read_principal_display_profiles_administration_v1','jenfu_platform_runtime,jenfu_ai_pdm_runtime')) AS readers(view_name,function_name,readers)
 LOOP
 definition:=pg_get_viewdef(('orgmaster_contract.'||item.view_name)::regclass,true);
 SELECT string_agg(quote_ident(attname)||' '||format_type(atttypid,atttypmod),',' ORDER BY attnum) INTO columns FROM pg_attribute WHERE attrelid=('orgmaster_contract.'||item.view_name)::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('CREATE FUNCTION orgmaster_contract.%I() RETURNS TABLE(%s) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS %L',item.function_name,columns,definition);
 EXECUTE format('REVOKE ALL ON FUNCTION orgmaster_contract.%I() FROM PUBLIC',item.function_name);
 EXECUTE format('GRANT EXECUTE ON FUNCTION orgmaster_contract.%I() TO %s',item.function_name,item.readers);
 EXECUTE format('CREATE OR REPLACE VIEW orgmaster_contract.%I WITH(security_barrier=true) AS SELECT * FROM orgmaster_contract.%I()',item.view_name,item.function_name);
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='fms_runtime') THEN GRANT EXECUTE ON FUNCTION orgmaster_contract.read_fms_authority_v3() TO fms_runtime; END IF;
END; $narrow_readers$;

-- FMS may read names only for current, exact FMS-qualified Principal/Employee
-- pairs. The generic Platform/PDM display reader is not an FMS contract.
CREATE FUNCTION orgmaster_contract.read_fms_principal_display_profiles_v1()
RETURNS TABLE(principal_id text,employee_id text,employee_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 SELECT display.principal_id,display.employee_id,display.employee_name
 FROM orgmaster_contract.v_principal_display_profiles_v1 display
 WHERE EXISTS(SELECT 1 FROM orgmaster_contract.v_fms_authority_v3 authority
  WHERE authority.principal_id=display.principal_id AND authority.employee_id=display.employee_id);
$fn$;
REVOKE ALL ON FUNCTION orgmaster_contract.read_fms_principal_display_profiles_v1() FROM PUBLIC;
CREATE VIEW orgmaster_contract.v_fms_principal_display_profiles_v1 WITH(security_barrier=true) AS
SELECT * FROM orgmaster_contract.read_fms_principal_display_profiles_v1();
REVOKE ALL ON orgmaster_contract.v_fms_principal_display_profiles_v1 FROM PUBLIC;
COMMENT ON VIEW orgmaster_contract.v_fms_principal_display_profiles_v1 IS
 'orgmaster.principal-display-profile.v1: optional display name for current exact FMS authority pairs only; never an authorization or admission source.';
DO $fms_display_reader$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='fms_runtime') THEN
  REVOKE ALL ON orgmaster_contract.v_principal_display_profiles_v1 FROM fms_runtime;
  REVOKE ALL ON FUNCTION orgmaster_contract.read_principal_display_profiles_administration_v1() FROM fms_runtime;
  GRANT SELECT ON orgmaster_contract.v_fms_principal_display_profiles_v1 TO fms_runtime;
  GRANT EXECUTE ON FUNCTION orgmaster_contract.read_fms_principal_display_profiles_v1() TO fms_runtime;
 END IF;
END; $fms_display_reader$;

-- Point-only proof for the FMS owner's first protected catalog installation.
-- It is neither an application assignment nor a protected-operation grant.
CREATE FUNCTION orgmaster_contract.read_fms_administration_initialization_v1(p_principal_id text,p_employee_id text)
RETURNS TABLE(contract_version text,administration_version bigint,root_grant_id uuid,principal_id text,employee_id text,published_policy_id text,published_at timestamptz,read_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE state_row record;
BEGIN
 SELECT * INTO STRICT state_row FROM orgmaster_contract.read_administration_state_v1();
 IF state_row.administration_version=0 OR state_row.initialized_by_command_id IS NULL OR state_row.recovery_required THEN RETURN; END IF;
 IF state_row.administration_version<1 OR state_row.published_policy_id IS NULL OR state_row.published_at IS NULL THEN RAISE EXCEPTION 'ADMINISTRATION_DEPENDENCY_UNAVAILABLE'; END IF;
 RETURN QUERY SELECT 'orgmaster.fms-administration-initialization.v1'::text,root.administration_version,root.grant_id,root.principal_id,root.employee_id,root.published_policy_id,root.published_at,clock_timestamp()
 FROM orgmaster_contract.v_platform_administrator_grants_v1 root
 WHERE root.principal_id=p_principal_id AND root.employee_id=p_employee_id
  AND root.administration_version=state_row.administration_version AND root.published_policy_id=state_row.published_policy_id AND root.published_at=state_row.published_at;
END; $fn$;
REVOKE ALL ON FUNCTION orgmaster_contract.read_fms_administration_initialization_v1(text,text) FROM PUBLIC,jenfu_orgmaster_runtime,jenfu_platform_runtime,jenfu_ai_pdm_runtime;
DO $fms_initialization_reader$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='fms_runtime') THEN GRANT EXECUTE ON FUNCTION orgmaster_contract.read_fms_administration_initialization_v1(text,text) TO fms_runtime; END IF;
END; $fms_initialization_reader$;
COMMIT;
