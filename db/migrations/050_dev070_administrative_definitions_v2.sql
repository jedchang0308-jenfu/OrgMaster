-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: additive fixed administrative definitions, AI-PDM grants v6, FMS authority v4
-- compatibility: additive
-- governance-review: DEV-070
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL ROLE jenfu_orgmaster_migrator;
SELECT pg_advisory_xact_lock(hashtext('dev070-administrative-definitions-v2'),hashtext(current_database()));

CREATE FUNCTION orgmaster_core.administrative_definition_current_v2(p_application text,p_binding jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $definition$
 SELECT CASE p_application
  WHEN 'orgmaster' THEN p_binding=jsonb_build_object(
   'catalogVersion','orgmaster.administration.2026-11-08.v1',
   'contentSha256','aa36accdbe620b9cc8f11db51fa8fde94417b33ac4007c436d2dc7b20201737b',
   'stableRoleId','role-orgmaster-admin',
   'roleDefinitionHash','aa36accdbe620b9cc8f11db51fa8fde94417b33ac4007c436d2dc7b20201737b')
  WHEN 'ai-pdm' THEN p_binding=jsonb_build_object(
   'catalogVersion','ai-pdm.administration.2026-11-08.v1',
   'contentSha256','a1f299753dc62591eafef37d49db692ab75bda808211bb3389d1a8933a5c6959',
   'stableRoleId','role-application-system-admin',
   'roleDefinitionHash','a1f299753dc62591eafef37d49db692ab75bda808211bb3389d1a8933a5c6959')
  WHEN 'financial-management-system' THEN p_binding=jsonb_build_object(
   'catalogVersion','financial-management-system.administration.2026-11-08.v1',
   'contentSha256','c7c3f66834213b986dd02b9eb6c785c1c4a9d27f7df1d41c8481bcfd116a392d',
   'stableRoleId','fms-full-catalog-administration',
   'roleDefinitionHash','c7c3f66834213b986dd02b9eb6c785c1c4a9d27f7df1d41c8481bcfd116a392d')
  ELSE false END;
$definition$;
REVOKE ALL ON FUNCTION orgmaster_core.administrative_definition_current_v2(text,jsonb) FROM PUBLIC;

ALTER FUNCTION orgmaster_core.administrative_catalog_current_v1(text,jsonb)
 RENAME TO administrative_catalog_current_legacy_v1;
CREATE FUNCTION orgmaster_core.administrative_catalog_current_v1(p_application text,p_binding jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $compatibility$
 SELECT orgmaster_core.administrative_definition_current_v2(p_application,p_binding)
     OR orgmaster_core.administrative_catalog_current_legacy_v1(p_application,p_binding);
$compatibility$;
REVOKE ALL ON FUNCTION orgmaster_core.administrative_catalog_current_v1(text,jsonb),
 orgmaster_core.administrative_catalog_current_legacy_v1(text,jsonb) FROM PUBLIC;

DO $writer_definition$ DECLARE definition text; needle text; replacement text; role_needle text; role_replacement text;
BEGIN
 definition:=pg_get_functiondef('orgmaster_core.submit_administration_command_private_v1(jsonb,text,text,jsonb)'::regprocedure);
 role_needle:='WHEN ''financial-management-system'' THEN ''role-system-admin''';
 role_replacement:='WHEN ''financial-management-system'' THEN ''fms-full-catalog-administration''';
 IF position(role_needle IN definition)=0 OR length(definition)-length(replace(definition,role_needle,''))<>length(role_needle) THEN
  RAISE EXCEPTION 'ADMINISTRATION_V2_PREDECESSOR_DRIFT';
 END IF;
 definition:=replace(definition,role_needle,role_replacement);
 needle:='IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(publication->''externalRoleCatalogs'') catalog WHERE catalog->>''applicationId''=target->>''applicationId''';
 replacement:='IF NOT orgmaster_core.administrative_definition_current_v2(target->>''applicationId'',binding) AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(publication->''externalRoleCatalogs'') catalog WHERE catalog->>''applicationId''=target->>''applicationId''';
 IF position(needle IN definition)=0 OR length(definition)-length(replace(definition,needle,''))<>length(needle) THEN
  RAISE EXCEPTION 'ADMINISTRATION_V2_PREDECESSOR_DRIFT';
 END IF;
 definition:=replace(definition,needle,replacement);
 EXECUTE definition;
END; $writer_definition$;

DO $policy_definition$ DECLARE definition text; needle text; replacement text;
BEGIN
 definition:=pg_get_functiondef('orgmaster_core.assert_administration_policy_v1(jsonb)'::regprocedure);
 needle:='WHEN ''financial-management-system'' THEN ''role-system-admin''';
 replacement:='WHEN ''financial-management-system'' THEN ''fms-full-catalog-administration''';
 IF position(needle IN definition)=0 OR length(definition)-length(replace(definition,needle,''))<>length(needle) THEN
  RAISE EXCEPTION 'ADMINISTRATION_V2_PREDECESSOR_DRIFT';
 END IF;
 EXECUTE replace(definition,needle,replacement);
END; $policy_definition$;

DO $batch_schema$ DECLARE definition text; needle text; replacement text;
BEGIN
 definition:=pg_get_functiondef('orgmaster_core.assert_administration_command_v1(jsonb)'::regprocedure);
 needle:='DECLARE initialization boolean; target jsonb; binding jsonb; entry record;';
 replacement:='DECLARE initialization boolean; batching boolean; target jsonb; binding jsonb; entry record;';
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'ADMINISTRATION_V2_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,replacement);
 needle:='initialization:=p_command->>''operation''=''initialize_platform_administrator'';';
 replacement:=needle||E'\n batching:=p_command->>''operation''=''grant_application_administrators_batch'';';
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'ADMINISTRATION_V2_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,replacement);
 needle:='OR p_command->>''contractVersion'' IS DISTINCT FROM ''orgmaster.administration-command.v1''';
 replacement:='OR (batching AND p_command->>''contractVersion'' IS DISTINCT FROM ''orgmaster.administration-batch-command.v2'' OR NOT batching AND p_command->>''contractVersion'' IS DISTINCT FROM ''orgmaster.administration-command.v1'')';
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'ADMINISTRATION_V2_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,replacement);
 needle:='CASE WHEN initialization THEN ARRAY[''contractVersion'',''commandId'',''operation'',''environmentKey'',''target'',''reason'',''expected'',''catalogBindings'',''previewHash'',''grants'',''plannedProtectedOperations''] ELSE ARRAY[''contractVersion'',''commandId'',''operation'',''target'',''grantId'',''reason'',''expected'',''catalogBindings'',''previewHash''] END';
 replacement:='CASE WHEN initialization THEN ARRAY[''contractVersion'',''commandId'',''operation'',''environmentKey'',''target'',''reason'',''expected'',''catalogBindings'',''previewHash'',''grants'',''plannedProtectedOperations''] WHEN batching THEN ARRAY[''contractVersion'',''commandId'',''operation'',''target'',''grantId'',''reason'',''expected'',''catalogBindings'',''applications'',''previewHash''] ELSE ARRAY[''contractVersion'',''commandId'',''operation'',''target'',''grantId'',''reason'',''expected'',''catalogBindings'',''previewHash''] END';
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'ADMINISTRATION_V2_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,replacement);
 needle:='''grant_application_administrator'',''revoke_application_administrator''';
 replacement:='''grant_application_administrator'',''grant_application_administrators_batch'',''revoke_application_administrator''';
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'ADMINISTRATION_V2_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,replacement);
 needle:='target:=p_command->''target'';';
 replacement:=needle||E'\n IF batching AND (target=''null''::jsonb OR target->''applicationId''<>''null''::jsonb OR jsonb_typeof(p_command->''applications'')<>''array'' OR jsonb_array_length(p_command->''applications'') NOT BETWEEN 1 AND 3 OR (SELECT count(*)<>count(DISTINCT value) FROM jsonb_array_elements_text(p_command->''applications'')) OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_command->''applications'') value WHERE value NOT IN(''orgmaster'',''ai-pdm'',''financial-management-system''))) THEN RAISE EXCEPTION ''ADMIN_TARGET_INVALID''; END IF;';
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'ADMINISTRATION_V2_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,replacement);
 EXECUTE definition;
END; $batch_schema$;

DO $batch_writer$ DECLARE definition text; needle text; replacement text;
BEGIN
 definition:=pg_get_functiondef('orgmaster_core.submit_administration_command_private_v1(jsonb,text,text,jsonb)'::regprocedure);
 needle:='root boolean; revoking boolean; replacing boolean; initializing boolean; no_change boolean:=false;';
 replacement:='root boolean; revoking boolean; replacing boolean; initializing boolean; batching boolean; no_change boolean:=false;';
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'ADMINISTRATION_V2_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,replacement);
 needle:='IF p_command->>''contractVersion''<>''orgmaster.administration-command.v1'' OR operation NOT IN';
 replacement:='IF (batching AND p_command->>''contractVersion''<>''orgmaster.administration-batch-command.v2'' OR NOT batching AND p_command->>''contractVersion''<>''orgmaster.administration-command.v1'') OR operation NOT IN';
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'ADMINISTRATION_V2_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,replacement);
 needle:='initializing:=operation=''initialize_platform_administrator'';';
 replacement:=needle||E'\n batching:=operation=''grant_application_administrators_batch'';';
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'ADMINISTRATION_V2_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,replacement);
 needle:='''grant_application_administrator'',''revoke_application_administrator''';
 replacement:='''grant_application_administrator'',''grant_application_administrators_batch'',''revoke_application_administrator''';
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'ADMINISTRATION_V2_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,replacement);
 needle:='CASE WHEN initializing THEN p_command->''grants'' ELSE jsonb_build_array(jsonb_build_object(''operation'',operation,''target'',target,''grantId'',p_command->''grantId'')) END';
 replacement:='CASE WHEN initializing THEN p_command->''grants'' WHEN batching THEN (SELECT jsonb_agg(jsonb_build_object(''applicationId'',value) ORDER BY value) FROM jsonb_array_elements_text(p_command->''applications'') value) ELSE jsonb_build_array(jsonb_build_object(''operation'',operation,''target'',target,''grantId'',p_command->''grantId'')) END';
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'ADMINISTRATION_V2_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,replacement);
 needle:='ELSE root:=operation LIKE ''%platform_administrator'';revoking:=operation LIKE ''revoke_%'';replacing:=operation=''replace_application_administrator'';END IF;';
 replacement:='ELSIF batching THEN target:=(p_command->''target'')||jsonb_build_object(''applicationId'',operation_grant->''applicationId'');root:=false;revoking:=false;replacing:=false; ELSE root:=operation LIKE ''%platform_administrator'';revoking:=operation LIKE ''revoke_%'';replacing:=operation=''replace_application_administrator'';END IF;';
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'ADMINISTRATION_V2_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,replacement);
 needle:='AND value->>''validFrom''=target->>''validFrom'' AND value->>''validTo'' IS NOT DISTINCT FROM target->>''validTo'';';
 replacement:='AND (batching AND (value->>''validFrom'')::timestamptz<=(target->>''validFrom'')::timestamptz AND (target->>''validTo'' IS NOT NULL AND (value->>''validTo'' IS NULL OR (value->>''validTo'')::timestamptz>=(target->>''validTo'')::timestamptz) OR target->>''validTo'' IS NULL AND value->>''validTo'' IS NULL) OR value->>''validFrom''=target->>''validFrom'' AND value->>''validTo'' IS NOT DISTINCT FROM target->>''validTo'');';
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'ADMINISTRATION_V2_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,replacement);
 needle:='INSERT INTO orgmaster_core.administrative_command_receipts_v1 VALUES(command_id_value,''orgmaster.administration-command.v1'',';
 replacement:='INSERT INTO orgmaster_core.administrative_command_receipts_v1 VALUES(command_id_value,CASE WHEN batching THEN ''orgmaster.administration-batch-command.v2'' ELSE ''orgmaster.administration-command.v1'' END,';
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'ADMINISTRATION_V2_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,replacement);
 EXECUTE definition;
END; $batch_writer$;

DO $batch_constraints$ DECLARE constraint_name text; contract_constraint_name text;
BEGIN
 SELECT conname INTO STRICT constraint_name FROM pg_constraint
 WHERE conrelid='orgmaster_core.administrative_command_receipts_v1'::regclass AND conname='administrative_command_receipts_v1_operation_check';
 EXECUTE format('ALTER TABLE orgmaster_core.administrative_command_receipts_v1 DROP CONSTRAINT %I',constraint_name);
 SELECT conname INTO STRICT contract_constraint_name FROM pg_constraint
 WHERE conrelid='orgmaster_core.administrative_command_receipts_v1'::regclass AND conname='administrative_command_receipts_v1_contract_version_check';
 EXECUTE format('ALTER TABLE orgmaster_core.administrative_command_receipts_v1 DROP CONSTRAINT %I',contract_constraint_name);
 ALTER TABLE orgmaster_core.administrative_command_receipts_v1 ADD CONSTRAINT administrative_command_operation_v2 CHECK(operation IN(
  'initialize_platform_administrator','grant_platform_administrator','revoke_platform_administrator','grant_application_administrator',
  'grant_application_administrators_batch','revoke_application_administrator','replace_application_administrator'));
 ALTER TABLE orgmaster_core.administrative_command_receipts_v1 ADD CONSTRAINT administrative_command_contract_v2 CHECK(contract_version IN(
  'orgmaster.administration-command.v1','orgmaster.administration-batch-command.v2'));
 ALTER TABLE orgmaster_core.privileged_security_alert_intents DROP CONSTRAINT security_alert_operation_dev070;
 ALTER TABLE orgmaster_core.privileged_security_alert_intents ADD CONSTRAINT security_alert_operation_dev070_v2 CHECK(operation IN(
  'grant_system_admin','revoke_system_admin','initialize_platform_administrator','grant_platform_administrator','revoke_platform_administrator',
  'grant_application_administrator','grant_application_administrators_batch','revoke_application_administrator','replace_application_administrator'));
END; $batch_constraints$;

CREATE FUNCTION orgmaster_contract.read_ai_pdm_principal_effective_grants_v6(p_principal_id text,p_employee_id text)
RETURNS TABLE(contract_version text,assignment_version_id text,assignment_version bigint,assignment_id text,
 grant_kind text,delegation_id text,application_id text,principal_id text,employee_id text,subject_kind text,
 target_principal_id text,stable_role_id text,role_code text,catalog_version text,scope_kind text,scope_key text,
 valid_from timestamptz,valid_until timestamptz,published_at timestamptz,source_assignment_id text,
 source_grant_id text,admin_catalog_sha256 text,role_definition_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $reader$
 SELECT 'jenfu.orgmaster.ai-pdm-principal-grants.v6'::text,
  source.assignment_version_id,source.assignment_version,source.assignment_id,source.grant_kind,source.delegation_id,
  source.application_id,source.principal_id,source.employee_id,source.subject_kind,source.target_principal_id,
  source.stable_role_id,source.role_code,source.catalog_version,source.scope_kind,source.scope_key,
  source.valid_from,source.valid_until,source.published_at,source.source_assignment_id,
  source.source_grant_id,source.admin_catalog_sha256,source.role_definition_hash
 FROM orgmaster_contract.read_ai_pdm_principal_effective_grants_v5(p_principal_id,p_employee_id) source;
$reader$;
CREATE FUNCTION orgmaster_contract.read_ai_pdm_principal_effective_grants_v6()
RETURNS TABLE(contract_version text,assignment_version_id text,assignment_version bigint,assignment_id text,
 grant_kind text,delegation_id text,application_id text,principal_id text,employee_id text,subject_kind text,
 target_principal_id text,stable_role_id text,role_code text,catalog_version text,scope_kind text,scope_key text,
 valid_from timestamptz,valid_until timestamptz,published_at timestamptz,source_assignment_id text,
 source_grant_id text,admin_catalog_sha256 text,role_definition_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $reader$
 SELECT 'jenfu.orgmaster.ai-pdm-principal-grants.v6'::text,
  source.assignment_version_id,source.assignment_version,source.assignment_id,source.grant_kind,source.delegation_id,
  source.application_id,source.principal_id,source.employee_id,source.subject_kind,source.target_principal_id,
  source.stable_role_id,source.role_code,source.catalog_version,source.scope_kind,source.scope_key,
  source.valid_from,source.valid_until,source.published_at,source.source_assignment_id,
  source.source_grant_id,source.admin_catalog_sha256,source.role_definition_hash
 FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v5 source;
$reader$;
REVOKE ALL ON FUNCTION orgmaster_contract.read_ai_pdm_principal_effective_grants_v6(text,text),
 orgmaster_contract.read_ai_pdm_principal_effective_grants_v6() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orgmaster_contract.read_ai_pdm_principal_effective_grants_v6(text,text),
 orgmaster_contract.read_ai_pdm_principal_effective_grants_v6() TO jenfu_ai_pdm_runtime;

CREATE VIEW orgmaster_contract.v_fms_authority_v4 WITH(security_barrier=true) AS
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
base AS(SELECT * FROM orgmaster_contract.v_fms_authority_v2),
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
 WHERE grant_row.value->>'roleCode'='application_system_admin'
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
LEFT JOIN administrators admin USING(principal_id,employee_id);

ALTER VIEW orgmaster_contract.v_fms_authority_v4 OWNER TO jenfu_orgmaster_migrator;
REVOKE ALL ON orgmaster_contract.v_fms_authority_v4 FROM PUBLIC;
GRANT SELECT ON orgmaster_contract.v_fms_authority_v4 TO jenfu_orgmaster_runtime;
DO $fms_acl$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='fms_runtime') THEN
  GRANT SELECT ON orgmaster_contract.v_fms_authority_v4 TO fms_runtime;
 END IF;
END; $fms_acl$;

COMMENT ON VIEW orgmaster_contract.v_fms_authority_v4 IS
 'Business assignments remain on the dynamic financial catalog. Exact app-admin grants emit only the five fixed catalog-management operations; no financial business capability is implied.';
COMMIT;
