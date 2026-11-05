-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: orgmaster.administration-command.v1
-- compatibility: new-version
-- governance-review: ORGMASTER/DEV-070
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SET LOCAL ROLE jenfu_orgmaster_migrator;
-- BEGIN DEV070 GENERATED SOURCE SEED
CREATE FUNCTION orgmaster_core.administration_bootstrap_seed_v1() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $seed$ SELECT $json${"applications":[{"id":"orgmaster","name":"OrgMaster","status":"active"},{"id":"ai-pdm","name":"AI-PDM","status":"active"},{"id":"financial-management-system","name":"FMS","status":"active"}],"identityLinks":[],"principalAdmissions":[],"applicationRoles":[{"id":"role-orgmaster-admin","applicationId":"orgmaster","code":"orgmaster_admin","name":"OrgMaster 系統管理員","status":"active","systemDefined":true}],"permissions":[{"id":"permission-orgmaster-governance-manage","applicationId":"orgmaster","kind":"system","code":"orgmaster.governance.manage","name":"管理治理設定","risk":"high","status":"active"},{"id":"permission-orgmaster-governance-publish","applicationId":"orgmaster","kind":"system","code":"orgmaster.governance.publish","name":"發布治理政策","risk":"high","status":"active"},{"id":"permission-orgmaster-governance-simulate","applicationId":"orgmaster","kind":"system","code":"orgmaster.governance.simulate","name":"執行治理測試器","risk":"normal","status":"active"},{"id":"permission-orgmaster-identity-view","applicationId":"orgmaster","kind":"page","code":"orgmaster.identity.view","name":"查看員工登入帳號","risk":"normal","status":"active"},{"id":"permission-orgmaster-identity-refresh","applicationId":"orgmaster","kind":"action","code":"orgmaster.identity.refresh","name":"刷新公司登入身分狀態","risk":"high","status":"active"},{"id":"permission-orgmaster-employee-number-manage","applicationId":"orgmaster","kind":"action","code":"orgmaster.employee-number.manage","name":"管理 JFS 員工編號","risk":"high","status":"active"},{"id":"permission-orgmaster-identity-invite","applicationId":"orgmaster","kind":"action","code":"orgmaster.identity.invite","name":"邀請員工登入帳號","risk":"high","status":"active"},{"id":"permission-orgmaster-identity-link","applicationId":"orgmaster","kind":"action","code":"orgmaster.identity.link","name":"連結既有登入帳號","risk":"high","status":"active"},{"id":"permission-orgmaster-identity-invitation-manage","applicationId":"orgmaster","kind":"action","code":"orgmaster.identity.invitation.manage","name":"管理登入帳號邀請","risk":"high","status":"active"},{"id":"permission-orgmaster-management-method-create","applicationId":"orgmaster","kind":"action","code":"orgmaster.management_method.create","name":"建立管理辦法","risk":"normal","status":"active"},{"id":"permission-orgmaster-management-method-read-readable","applicationId":"orgmaster","kind":"page","code":"orgmaster.management_method.read_readable","name":"閱讀管理辦法","risk":"normal","status":"active"},{"id":"permission-orgmaster-management-method-read-draft","applicationId":"orgmaster","kind":"page","code":"orgmaster.management_method.read_draft","name":"閱讀管理辦法草稿","risk":"normal","status":"active"},{"id":"permission-orgmaster-management-method-edit-draft","applicationId":"orgmaster","kind":"action","code":"orgmaster.management_method.edit_draft","name":"編輯管理辦法草稿","risk":"normal","status":"active"},{"id":"permission-orgmaster-management-method-manage-readable","applicationId":"orgmaster","kind":"action","code":"orgmaster.management_method.manage_read_availability","name":"管理管理辦法閱讀狀態","risk":"high","status":"active"},{"id":"permission-orgmaster-management-method-manage-metadata","applicationId":"orgmaster","kind":"action","code":"orgmaster.management_method.manage_metadata","name":"管理管理辦法 metadata","risk":"normal","status":"active"}],"rolePermissionGrants":[{"id":"grant-orgmaster-admin-permission-orgmaster-governance-manage","roleId":"role-orgmaster-admin","permissionId":"permission-orgmaster-governance-manage","effect":"allow"},{"id":"grant-orgmaster-admin-permission-orgmaster-governance-publish","roleId":"role-orgmaster-admin","permissionId":"permission-orgmaster-governance-publish","effect":"allow"},{"id":"grant-orgmaster-admin-permission-orgmaster-governance-simulate","roleId":"role-orgmaster-admin","permissionId":"permission-orgmaster-governance-simulate","effect":"allow"},{"id":"grant-orgmaster-admin-permission-orgmaster-identity-view","roleId":"role-orgmaster-admin","permissionId":"permission-orgmaster-identity-view","effect":"allow"},{"id":"grant-orgmaster-admin-permission-orgmaster-identity-refresh","roleId":"role-orgmaster-admin","permissionId":"permission-orgmaster-identity-refresh","effect":"allow"},{"id":"grant-orgmaster-admin-permission-orgmaster-employee-number-manage","roleId":"role-orgmaster-admin","permissionId":"permission-orgmaster-employee-number-manage","effect":"allow"},{"id":"grant-orgmaster-admin-permission-orgmaster-identity-invite","roleId":"role-orgmaster-admin","permissionId":"permission-orgmaster-identity-invite","effect":"allow"},{"id":"grant-orgmaster-admin-permission-orgmaster-identity-link","roleId":"role-orgmaster-admin","permissionId":"permission-orgmaster-identity-link","effect":"allow"},{"id":"grant-orgmaster-admin-permission-orgmaster-identity-invitation-manage","roleId":"role-orgmaster-admin","permissionId":"permission-orgmaster-identity-invitation-manage","effect":"allow"},{"id":"grant-orgmaster-admin-permission-orgmaster-management-method-create","roleId":"role-orgmaster-admin","permissionId":"permission-orgmaster-management-method-create","effect":"allow"},{"id":"grant-orgmaster-admin-permission-orgmaster-management-method-read-readable","roleId":"role-orgmaster-admin","permissionId":"permission-orgmaster-management-method-read-readable","effect":"allow"},{"id":"grant-orgmaster-admin-permission-orgmaster-management-method-read-draft","roleId":"role-orgmaster-admin","permissionId":"permission-orgmaster-management-method-read-draft","effect":"allow"},{"id":"grant-orgmaster-admin-permission-orgmaster-management-method-edit-draft","roleId":"role-orgmaster-admin","permissionId":"permission-orgmaster-management-method-edit-draft","effect":"allow"},{"id":"grant-orgmaster-admin-permission-orgmaster-management-method-manage-readable","roleId":"role-orgmaster-admin","permissionId":"permission-orgmaster-management-method-manage-readable","effect":"allow"},{"id":"grant-orgmaster-admin-permission-orgmaster-management-method-manage-metadata","roleId":"role-orgmaster-admin","permissionId":"permission-orgmaster-management-method-manage-metadata","effect":"allow"}],"roleAssignments":[],"roleDelegations":[],"positionRolePolicies":[],"applicationPositionAdoptions":[],"managementGrants":[]}$json$::jsonb; $seed$;
REVOKE ALL ON FUNCTION orgmaster_core.administration_bootstrap_seed_v1() FROM PUBLIC;
-- END DEV070 GENERATED SOURCE SEED

CREATE FUNCTION orgmaster_core.administration_canonical_json_v1(value jsonb) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog AS $fn$
SELECT CASE jsonb_typeof(value)
 WHEN 'object' THEN '{'||COALESCE((SELECT string_agg(to_jsonb(key)::text||':'||orgmaster_core.administration_canonical_json_v1(item),',' ORDER BY key COLLATE "C") FROM jsonb_each(value) entry(key,item)),'')||'}'
 WHEN 'array' THEN '['||COALESCE((SELECT string_agg(orgmaster_core.administration_canonical_json_v1(item),',' ORDER BY ordinal) FROM jsonb_array_elements(value) WITH ORDINALITY entry(item,ordinal)),'')||']'
 ELSE value::text END;
$fn$;
CREATE FUNCTION orgmaster_core.administration_sha256_v1(value jsonb) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog AS $fn$
SELECT encode(public.digest(convert_to(orgmaster_core.administration_canonical_json_v1(value),'UTF8'),'sha256'),'hex');
$fn$;
CREATE FUNCTION orgmaster_core.read_administration_organization_snapshot_v1() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
SELECT jsonb_build_object('workspaceVersionId',manifest.payload->>'currentVersionId','workspaceRevision',trim(workspace.canonical_sha256),
 'capturedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 'employees',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',employee->>'id','primaryAssignmentId',employee->'primaryAssignmentId')),'[]'::jsonb) FROM jsonb_array_elements(COALESCE(workspace.payload#>'{state,employees}','[]'::jsonb)) employee),
 'departments',COALESCE(workspace.payload#>'{state,departments}','[]'::jsonb),'organizationRoles',COALESCE(workspace.payload#>'{state,roles}','[]'::jsonb),
 'positions',COALESCE(workspace.payload#>'{state,positions}','[]'::jsonb),'assignments',COALESCE(workspace.payload#>'{state,assignments}','[]'::jsonb))
FROM orgmaster_core.persistence_authority authority JOIN orgmaster_core.persistence_artifacts manifest ON manifest.batch_id=authority.active_batch_id AND manifest.artifact_key='orgmaster-workspace.v1.json'
JOIN orgmaster_core.persistence_artifacts workspace ON workspace.batch_id=authority.active_batch_id AND workspace.artifact_key='orgmaster-versions/'||(manifest.payload->>'currentVersionId')||'.json'
WHERE authority.singleton AND workspace.payload->>'kind'='document';
$fn$;
REVOKE ALL ON FUNCTION orgmaster_core.read_administration_organization_snapshot_v1() FROM PUBLIC;

CREATE FUNCTION orgmaster_core.assert_administration_policy_v1(p_policy jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
DECLARE grant_row jsonb; binding jsonb;
BEGIN
 IF p_policy IS NULL THEN RETURN; END IF;
 IF jsonb_typeof(p_policy)<>'object' OR NOT(p_policy?&ARRAY['contractVersion','version','initializedByCommandId','grants'])
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_policy) key WHERE key NOT IN('contractVersion','version','initializedByCommandId','grants'))
 OR p_policy->>'contractVersion' IS DISTINCT FROM 'orgmaster.administration-policy.v1' OR jsonb_typeof(p_policy->'version')<>'number'
 OR (p_policy->>'version')::numeric NOT BETWEEN 1 AND 9007199254740991 OR (p_policy->>'version')::numeric<>trunc((p_policy->>'version')::numeric)
 OR jsonb_typeof(p_policy->'grants')<>'array' THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
 IF p_policy->>'initializedByCommandId' IS NOT NULL THEN PERFORM (p_policy->>'initializedByCommandId')::uuid;
 ELSIF jsonb_array_length(p_policy->'grants')>0 THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
 IF (SELECT count(*)<>count(DISTINCT (value->>'id')::uuid) FROM jsonb_array_elements(p_policy->'grants')) THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
 FOR grant_row IN SELECT value FROM jsonb_array_elements(p_policy->'grants') LOOP
 IF jsonb_typeof(grant_row)<>'object' OR NOT(grant_row?&ARRAY['id','principalId','employeeId','roleCode','applicationId','subjectKind','basis','scope','status','validFrom','validTo','createdBy','reason','catalogBinding'])
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(grant_row) key WHERE key NOT IN('id','principalId','employeeId','roleCode','applicationId','subjectKind','basis','scope','status','validFrom','validTo','createdBy','reason','catalogBinding'))
 OR grant_row->>'subjectKind' IS DISTINCT FROM 'principal' OR grant_row->>'basis' IS DISTINCT FROM 'manual' OR grant_row->>'status' NOT IN('active','revoked')
 OR NULLIF(btrim(grant_row->>'principalId'),'') IS NULL OR NULLIF(btrim(grant_row->>'employeeId'),'') IS NULL
 OR grant_row->>'roleCode' NOT IN('platform_super_admin','application_system_admin')
 OR grant_row->>'reason' IS DISTINCT FROM normalize(btrim(grant_row->>'reason'),NFC) OR char_length(grant_row->>'reason') NOT BETWEEN 1 AND 240
 OR jsonb_typeof(grant_row->'createdBy')<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(grant_row->'createdBy') key WHERE key NOT IN('kind','id'))
 OR grant_row#>>'{createdBy,kind}' NOT IN('principal','owner_workload') OR NULLIF(btrim(grant_row#>>'{createdBy,id}'),'') IS NULL
 THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
 PERFORM (grant_row->>'id')::uuid;
 IF grant_row->>'validFrom' IS DISTINCT FROM to_char((grant_row->>'validFrom')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
 OR grant_row->>'validTo' IS NOT NULL AND(grant_row->>'validTo' IS DISTINCT FROM to_char((grant_row->>'validTo')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') OR(grant_row->>'validTo')::timestamptz<=(grant_row->>'validFrom')::timestamptz) THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
 IF grant_row->>'roleCode'='platform_super_admin' THEN
 IF grant_row->'applicationId'<>'null'::jsonb OR grant_row->'validTo'<>'null'::jsonb OR grant_row->'catalogBinding'<>'null'::jsonb OR grant_row->'scope'<>'{"kind":"platform"}'::jsonb THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
 ELSE
 binding:=grant_row->'catalogBinding';
 IF grant_row->>'applicationId' NOT IN('orgmaster','ai-pdm','financial-management-system') OR grant_row->'scope'<>'{"kind":"global"}'::jsonb
 OR jsonb_typeof(binding)<>'object' OR NOT(binding?&ARRAY['catalogVersion','contentSha256','stableRoleId','roleDefinitionHash']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(binding) key WHERE key NOT IN('catalogVersion','contentSha256','stableRoleId','roleDefinitionHash'))
 OR NULLIF(binding->>'catalogVersion','') IS NULL OR binding->>'contentSha256'!~'^[a-f0-9]{64}$' OR binding->>'roleDefinitionHash'!~'^[a-f0-9]{64}$'
 OR binding->>'stableRoleId' IS DISTINCT FROM(CASE grant_row->>'applicationId' WHEN 'orgmaster' THEN 'role-orgmaster-admin' WHEN 'ai-pdm' THEN 'role-application-system-admin' WHEN 'financial-management-system' THEN 'role-system-admin' END) THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
 END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_policy->'grants') a CROSS JOIN jsonb_array_elements(p_policy->'grants') b WHERE (a->>'id')::uuid<(b->>'id')::uuid AND a->>'status'='active' AND b->>'status'='active'
 AND a->>'principalId'=b->>'principalId' AND a->>'roleCode'=b->>'roleCode' AND a->>'applicationId' IS NOT DISTINCT FROM b->>'applicationId'
 AND(a->>'validFrom')::timestamptz<COALESCE((b->>'validTo')::timestamptz,'infinity') AND(b->>'validFrom')::timestamptz<COALESCE((a->>'validTo')::timestamptz,'infinity')) THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
END; $fn$;
REVOKE ALL ON FUNCTION orgmaster_core.assert_administration_policy_v1(jsonb) FROM PUBLIC;
CREATE FUNCTION orgmaster_core.administrative_protected_definition_v1(p_policy jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
SELECT jsonb_build_object(
 'roles',(SELECT COALESCE(jsonb_agg(value ORDER BY value->>'id'),'[]'::jsonb) FROM jsonb_array_elements(COALESCE(p_policy->'applicationRoles','[]'::jsonb)) WHERE value->>'id'='role-orgmaster-admin'),
 'grants',(SELECT COALESCE(jsonb_agg(value ORDER BY value->>'id'),'[]'::jsonb) FROM jsonb_array_elements(COALESCE(p_policy->'rolePermissionGrants','[]'::jsonb)) WHERE value->>'roleId'='role-orgmaster-admin'),
 'permissions',(SELECT COALESCE(jsonb_agg(value ORDER BY value->>'id'),'[]'::jsonb) FROM jsonb_array_elements(COALESCE(p_policy->'permissions','[]'::jsonb)) WHERE value->>'id' IN(SELECT grant_row->>'permissionId' FROM jsonb_array_elements(COALESCE(p_policy->'rolePermissionGrants','[]'::jsonb)) grant_row WHERE grant_row->>'roleId'='role-orgmaster-admin')));
$fn$;
CREATE FUNCTION orgmaster_core.administrative_legacy_management_v1(p_policy jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
SELECT jsonb_build_object('assignments',(SELECT COALESCE(jsonb_agg(value ORDER BY value->>'id'),'[]'::jsonb) FROM jsonb_array_elements(COALESCE(p_policy->'roleAssignments','[]'::jsonb)) WHERE value->>'roleId' IN('role-orgmaster-admin','role-system-admin','role-owner')),
 'managementGrants',COALESCE(p_policy->'managementGrants','[]'::jsonb));
$fn$;
REVOKE ALL ON FUNCTION orgmaster_core.administrative_protected_definition_v1(jsonb),orgmaster_core.administrative_legacy_management_v1(jsonb) FROM PUBLIC;

CREATE TABLE orgmaster_core.administrative_command_receipts_v1 (
 command_id uuid PRIMARY KEY, contract_version text NOT NULL CHECK(contract_version='orgmaster.administration-command.v1'),
 environment_key text NOT NULL,operation text NOT NULL CHECK(operation IN('initialize_platform_administrator','grant_platform_administrator','revoke_platform_administrator','grant_application_administrator','revoke_application_administrator','replace_application_administrator')),
 actor_kind text NOT NULL CHECK(actor_kind IN('principal','owner_workload')),actor_id text NOT NULL,
 request_sha256 char(64) NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),preview_sha256 char(64) NOT NULL CHECK(preview_sha256~'^[a-f0-9]{64}$'),
 target_principal_id text,target_employee_id text,result_kind text NOT NULL CHECK(result_kind IN('applied','no_change')),
 administration_version bigint NOT NULL CHECK(administration_version BETWEEN 0 AND 9007199254740991),
 administration_sha256 char(64) NOT NULL CHECK(administration_sha256~'^[a-f0-9]{64}$'),published_policy_id text NOT NULL,
 transaction_id xid8 NOT NULL,result jsonb NOT NULL,committed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX administrative_initialize_once_v1 ON orgmaster_core.administrative_command_receipts_v1(environment_key) WHERE operation='initialize_platform_administrator';
CREATE FUNCTION orgmaster_core.reject_administration_receipt_mutation_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$ BEGIN RAISE EXCEPTION 'ADMINISTRATION_COMMAND_CONFLICT'; END; $fn$;
CREATE TRIGGER immutable_administrative_receipt BEFORE UPDATE OR DELETE ON orgmaster_core.administrative_command_receipts_v1 FOR EACH ROW EXECUTE FUNCTION orgmaster_core.reject_administration_receipt_mutation_v1();

CREATE FUNCTION orgmaster_core.administration_receipt_response_v1(p_result jsonb) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
SELECT p_result||jsonb_build_object('activation',CASE WHEN EXISTS(
 SELECT 1 FROM jsonb_array_elements_text(p_result->'outboxIds') outbox(id)
 LEFT JOIN orgmaster_core.principal_lifecycle_delivery_v2 delivery ON delivery.event_id::text=outbox.id
 WHERE outbox.id~'^[0-9a-f]{8}-[0-9a-f-]{27}$' AND delivery.status IS DISTINCT FROM 'completed'
) THEN 'pending' ELSE 'acknowledged' END);
$fn$;
REVOKE ALL ON FUNCTION orgmaster_core.administration_receipt_response_v1(jsonb) FROM PUBLIC;

-- Reuse the existing durable alert queue. Owner initialization has a workload
-- actor and must never be represented by a fabricated human Principal.
ALTER TABLE orgmaster_core.privileged_security_alert_intents
 ADD COLUMN actor jsonb,
 ALTER COLUMN actor_principal_id DROP NOT NULL;
ALTER TABLE orgmaster_core.privileged_security_alert_intents
 DROP CONSTRAINT privileged_security_alert_intents_operation_check;
ALTER TABLE orgmaster_core.privileged_security_alert_intents
 ADD CONSTRAINT security_alert_operation_dev070 CHECK(operation IN('grant_system_admin','revoke_system_admin','initialize_platform_administrator','grant_platform_administrator','revoke_platform_administrator','grant_application_administrator','revoke_application_administrator','replace_application_administrator')),
 ADD CONSTRAINT security_alert_actor_dev070 CHECK(COALESCE((
  (actor IS NULL AND actor_principal_id IS NOT NULL) OR
  (jsonb_typeof(actor)='object' AND actor-'kind'-'id'='{}'::jsonb AND actor ?& ARRAY['kind','id'] AND actor->>'kind' IN('principal','owner_workload')
   AND char_length(actor->>'id') BETWEEN 1 AND 255
   AND CASE WHEN actor->>'kind'='principal' THEN actor_principal_id IS NOT DISTINCT FROM actor->>'id' ELSE actor_principal_id IS NULL END)),false));

CREATE FUNCTION orgmaster_core.claim_privileged_security_alerts_v2(p_worker_id text,p_limit integer DEFAULT 20,p_lease_seconds integer DEFAULT 60)
RETURNS SETOF orgmaster_core.privileged_security_alert_intents
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 IF char_length(btrim(p_worker_id)) NOT BETWEEN 1 AND 128 OR p_limit NOT BETWEEN 1 AND 100 OR p_lease_seconds NOT BETWEEN 5 AND 600 THEN RAISE EXCEPTION 'SECURITY_ALERT_CLAIM_INVALID'; END IF;
 RETURN QUERY WITH candidates AS(
  SELECT intent.alert_reference FROM orgmaster_core.privileged_security_alert_intents intent
  WHERE (intent.status IN('pending','failed') AND intent.next_attempt_at<=clock_timestamp())
   OR (intent.status='processing' AND intent.lease_until<clock_timestamp())
  ORDER BY intent.next_attempt_at,intent.created_at FOR UPDATE SKIP LOCKED LIMIT p_limit
 ) UPDATE orgmaster_core.privileged_security_alert_intents intent
 SET status='processing',attempt_count=intent.attempt_count+1,worker_id=btrim(p_worker_id),lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds)
 FROM candidates WHERE intent.alert_reference=candidates.alert_reference RETURNING intent.*;
END; $fn$;
-- The old app-private entry still returns the expanded table row type; callers
-- that consume its original fields remain compatible during the transition.
CREATE OR REPLACE FUNCTION orgmaster_core.claim_privileged_security_alerts_v1(p_worker_id text,p_limit integer DEFAULT 20,p_lease_seconds integer DEFAULT 60)
RETURNS SETOF orgmaster_core.privileged_security_alert_intents
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 SELECT * FROM orgmaster_core.claim_privileged_security_alerts_v2(p_worker_id,p_limit,p_lease_seconds);
$fn$;
REVOKE ALL ON FUNCTION orgmaster_core.claim_privileged_security_alerts_v2(text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orgmaster_core.claim_privileged_security_alerts_v2(text,integer,integer) TO jenfu_orgmaster_runtime;

CREATE FUNCTION orgmaster_core.assert_administration_command_v1(p_command jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
DECLARE initialization boolean; target jsonb; binding jsonb; entry record;
BEGIN
 initialization:=p_command->>'operation'='initialize_platform_administrator';
 IF jsonb_typeof(p_command) IS DISTINCT FROM 'object'
 OR NOT(p_command?&ARRAY['contractVersion','commandId','operation','target','reason','expected','catalogBindings','previewHash'])
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) key WHERE key<>ALL(CASE WHEN initialization THEN ARRAY['contractVersion','commandId','operation','environmentKey','target','reason','expected','catalogBindings','previewHash','grants','plannedProtectedOperations'] ELSE ARRAY['contractVersion','commandId','operation','target','grantId','reason','expected','catalogBindings','previewHash'] END))
 OR p_command->>'contractVersion' IS DISTINCT FROM 'orgmaster.administration-command.v1'
 OR p_command->>'reason' IS DISTINCT FROM normalize(btrim(p_command->>'reason'),NFC) OR char_length(p_command->>'reason') NOT BETWEEN 1 AND 240
 OR COALESCE(p_command->>'previewHash','')!~'^[a-f0-9]{64}$'
 OR jsonb_typeof(p_command->'expected') IS DISTINCT FROM 'object'
 OR NOT((p_command->'expected')?&ARRAY['governanceRevision','organizationRevision','administrationVersion'])
 OR (p_command->'expected')-'governanceRevision'-'organizationRevision'-'administrationVersion'<>'{}'::jsonb
 OR jsonb_typeof(p_command#>'{expected,administrationVersion}') IS DISTINCT FROM 'number'
 OR (p_command#>>'{expected,administrationVersion}')::numeric NOT BETWEEN 0 AND 9007199254740991
 OR (p_command#>>'{expected,administrationVersion}')::numeric<>trunc((p_command#>>'{expected,administrationVersion}')::numeric)
 OR char_length(COALESCE(p_command#>>'{expected,governanceRevision}','')) NOT BETWEEN 1 AND 255
 OR char_length(COALESCE(p_command#>>'{expected,organizationRevision}','')) NOT BETWEEN 1 AND 255
 OR jsonb_typeof(p_command->'catalogBindings') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
 PERFORM (p_command->>'commandId')::uuid;
 IF NOT initialization THEN
  IF NOT(p_command?'grantId') OR p_command->>'operation' NOT IN('grant_platform_administrator','revoke_platform_administrator','grant_application_administrator','revoke_application_administrator','replace_application_administrator') THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
  IF p_command->>'operation' LIKE 'revoke_%' THEN
   IF p_command->'target'<>'null'::jsonb OR p_command->>'grantId' IS NULL THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
  ELSIF p_command->>'operation'='replace_application_administrator' THEN
   IF p_command->>'grantId' IS NULL OR p_command->'target'='null'::jsonb THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
  ELSIF p_command->'grantId'<>'null'::jsonb THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
  IF p_command->>'grantId' IS NOT NULL THEN PERFORM (p_command->>'grantId')::uuid; END IF;
 END IF;
 target:=p_command->'target';
 IF target<>'null'::jsonb THEN
  IF jsonb_typeof(target) IS DISTINCT FROM 'object' OR char_length(COALESCE(target->>'principalId','')) NOT BETWEEN 1 AND 255 OR char_length(COALESCE(target->>'employeeId','')) NOT BETWEEN 1 AND 255
  OR (CASE WHEN initialization THEN NOT(target?&ARRAY['principalId','employeeId','directoryKey','identityFactsHash']) OR target-'principalId'-'employeeId'-'directoryKey'-'identityFactsHash'<>'{}'::jsonb
      ELSE NOT(target?&ARRAY['principalId','employeeId','applicationId','validFrom','validTo']) OR target-'principalId'-'employeeId'-'applicationId'-'validFrom'-'validTo'<>'{}'::jsonb END)
  THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
 END IF;
 FOR entry IN SELECT key,value FROM jsonb_each(p_command->'catalogBindings') LOOP
  binding:=entry.value;
  IF entry.key NOT IN('orgmaster','ai-pdm','financial-management-system') OR jsonb_typeof(binding) IS DISTINCT FROM 'object'
   OR NOT(binding?&ARRAY['catalogVersion','contentSha256','stableRoleId','roleDefinitionHash']) OR binding-'catalogVersion'-'contentSha256'-'stableRoleId'-'roleDefinitionHash'<>'{}'::jsonb
   OR char_length(COALESCE(binding->>'catalogVersion','')) NOT BETWEEN 1 AND 255 OR char_length(COALESCE(binding->>'stableRoleId','')) NOT BETWEEN 1 AND 255
   OR COALESCE(binding->>'contentSha256','')!~'^[a-f0-9]{64}$' OR COALESCE(binding->>'roleDefinitionHash','')!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
 END LOOP;
END; $fn$;
REVOKE ALL ON FUNCTION orgmaster_core.assert_administration_command_v1(jsonb) FROM PUBLIC;

CREATE FUNCTION orgmaster_core.enqueue_administration_invalidation_v1(p_event_id uuid,p_command_id uuid,p_source_revision text,p_actor_id text,p_actor_kind text,p_grants jsonb,p_grant_ids jsonb,p_intrinsic_facts jsonb) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE targets jsonb; payload text;
BEGIN
 SELECT jsonb_agg(jsonb_build_object('principalId',fact->>'principalId','employeeId',fact->>'employeeId','accountType',fact->>'accountType','pairs',fact->'pairs') ORDER BY fact->>'principalId') INTO targets
 FROM jsonb_array_elements(p_intrinsic_facts) fact WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(p_grants) grant_row
 WHERE grant_row->>'id' IN(SELECT jsonb_array_elements_text(p_grant_ids)) AND grant_row->>'principalId'=fact->>'principalId' AND grant_row->>'employeeId'=fact->>'employeeId');
 IF targets IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(targets) target WHERE target->>'accountType' NOT IN('human_personal','human_privileged') OR jsonb_array_length(target->'pairs')=0) THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
 payload:=jsonb_build_object('contractVersion','orgmaster.principal-lifecycle.v2','eventId',p_event_id::text,'operationId',p_command_id::text||':administration','sourceRevision',p_source_revision,'reasonCode','administration_changed',
 'originatingPrincipalId',p_actor_id,'initiatingPrincipalId',CASE WHEN p_actor_kind='principal' THEN p_actor_id ELSE NULL END,'principals',targets)::text;
 INSERT INTO orgmaster_core.principal_lifecycle_events_v2(event_id,operation_id,source_revision,originating_principal_id,initiating_principal_id,reason_code,snapshot_text,snapshot_hash)
 VALUES(p_event_id,p_command_id::text||':administration',p_source_revision,p_actor_id,CASE WHEN p_actor_kind='principal' THEN p_actor_id ELSE NULL END,'administration_changed',payload,encode(public.digest(payload,'sha256'),'hex'));
 INSERT INTO orgmaster_core.principal_lifecycle_delivery_v2(event_id) VALUES(p_event_id);
END; $fn$;
REVOKE ALL ON FUNCTION orgmaster_core.enqueue_administration_invalidation_v1(uuid,uuid,text,text,text,jsonb,jsonb,jsonb) FROM PUBLIC;

ALTER TABLE orgmaster_core.workload_principal_bindings
 ADD COLUMN bound_command_id uuid,ADD COLUMN bound_plan_sha256 char(64),ADD COLUMN bound_target_principal_id text,
 ADD COLUMN bound_target_employee_id text,ADD COLUMN bound_environment_key text,ADD COLUMN consumed_at timestamptz;
DO $constraint$ DECLARE constraint_name text;
BEGIN
 FOR constraint_name IN SELECT conname FROM pg_constraint WHERE conrelid='orgmaster_core.workload_principal_bindings'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%managed-identity-lifecycle%'
 LOOP EXECUTE format('ALTER TABLE orgmaster_core.workload_principal_bindings DROP CONSTRAINT %I',constraint_name); END LOOP;
END; $constraint$;
ALTER TABLE orgmaster_core.workload_principal_bindings ADD CONSTRAINT workload_purpose_dev070 CHECK(
 (owner='orgmaster' AND purpose IN('managed-identity-lifecycle','administration-initialize')) OR (owner='platform' AND purpose='principal-lifecycle-invalidation'));
ALTER TABLE orgmaster_core.workload_principal_bindings ADD CONSTRAINT workload_administration_bound_dev070 CHECK(
 CASE WHEN purpose='administration-initialize' THEN bound_command_id IS NOT NULL AND bound_plan_sha256~'^[a-f0-9]{64}$'
 AND bound_target_principal_id IS NOT NULL AND bound_target_employee_id IS NOT NULL AND bound_environment_key IS NOT NULL
 ELSE bound_command_id IS NULL AND bound_plan_sha256 IS NULL AND bound_target_principal_id IS NULL AND bound_target_employee_id IS NULL AND bound_environment_key IS NULL AND consumed_at IS NULL END);

CREATE FUNCTION orgmaster_core.assert_administration_session_v1(p_actor jsonb,p_principal text,p_recent boolean) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE session_row orgmaster_core.app_sessions%ROWTYPE; age_ms numeric; epoch record;
BEGIN
 IF p_actor->>'kind'<>'principal' THEN RAISE EXCEPTION 'IDENTITY_CONTEXT_REQUIRED'; END IF;
 SELECT * INTO STRICT session_row FROM orgmaster_core.app_sessions WHERE id=(p_actor->>'sessionId')::uuid AND app_id='orgmaster' FOR SHARE;
 IF session_row.revoked_at IS NOT NULL OR session_row.expires_at<=clock_timestamp() OR session_row.principal_id IS DISTINCT FROM p_principal
 OR session_row.session_schema_version<>2 OR session_row.epoch_kind<>'principal'
 OR session_row.principal_auth_epoch IS DISTINCT FROM (p_actor->>'principalAuthEpoch')::bigint
 OR session_row.authenticated_at IS DISTINCT FROM (p_actor->>'authenticatedAt')::timestamptz
 OR session_row.assurance_level IS DISTINCT FROM p_actor->>'assuranceLevel'
 OR NOT EXISTS(SELECT 1 FROM orgmaster_contract.v_active_principal_accounts_v1 account WHERE account.principal_id=session_row.principal_id AND account.employee_id=session_row.employee_id AND account.principal_issuer=session_row.identity_issuer AND account.principal_subject=session_row.identity_subject)
 THEN RAISE EXCEPTION 'IDENTITY_CONTEXT_REQUIRED'; END IF;
 SELECT * INTO STRICT epoch FROM platform_contract.read_principal_auth_state_v3(p_principal);
 IF epoch.principal_id IS DISTINCT FROM p_principal OR epoch.auth_epoch IS DISTINCT FROM session_row.principal_auth_epoch OR(epoch.revoked_before IS NOT NULL AND session_row.authenticated_at<=epoch.revoked_before) THEN RAISE EXCEPTION 'IDENTITY_CONTEXT_REQUIRED'; END IF;
 age_ms:=extract(epoch FROM clock_timestamp()-session_row.authenticated_at)*1000;
 IF p_recent AND (session_row.assurance_level NOT IN('aal1','aal2') OR age_ms NOT BETWEEN 0 AND 300000) THEN RAISE EXCEPTION 'AUTH_RECENT_REQUIRED'; END IF;
END; $fn$;

CREATE FUNCTION orgmaster_core.assert_administration_continuity_v1() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE state record; boundary timestamptz; publication jsonb;
BEGIN
 SELECT * INTO STRICT state FROM orgmaster_contract.read_administration_state_v1();
 IF state.initialized_by_command_id IS NULL THEN RETURN; END IF;
 IF state.effective_root_count=0 THEN RAISE EXCEPTION 'LAST_PLATFORM_ADMIN'; END IF;
 publication:=orgmaster_core.read_administration_publication_v1();
 FOR boundary IN SELECT DISTINCT (value->>'validTo')::timestamptz FROM jsonb_array_elements(publication#>'{policy,administration,grants}') WHERE value->>'status'='active' AND (value->>'validTo')::timestamptz>CURRENT_TIMESTAMP
 LOOP
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(publication#>'{policy,administration,grants}') root
 JOIN LATERAL jsonb_array_elements(publication#>'{policy,administration,grants}') entry ON entry->>'principalId'=root->>'principalId' AND entry->>'employeeId'=root->>'employeeId'
 WHERE root->>'roleCode'='platform_super_admin' AND root->>'status'='active' AND(root->>'validFrom')::timestamptz<=boundary
 AND entry->>'applicationId'='orgmaster' AND entry->>'status'='active' AND(entry->>'validFrom')::timestamptz<=boundary AND(entry->>'validTo' IS NULL OR(entry->>'validTo')::timestamptz>boundary)
 AND orgmaster_core.administrative_catalog_current_v1('orgmaster',entry->'catalogBinding')
 AND EXISTS(SELECT 1 FROM orgmaster_contract.v_active_principal_accounts_v1 account WHERE account.principal_id=root->>'principalId' AND account.employee_id=root->>'employeeId' AND account.employee_status='active' AND account.account_type IN('human_personal','human_privileged'))
 ) THEN RAISE EXCEPTION 'LAST_PLATFORM_ADMIN'; END IF;
 END LOOP;
END; $fn$;

-- Voluntary native admission withdrawal and operator quarantine share the same
-- lock and continuity rule as governance. External Directory observations keep
-- their existing fail-closed path and may require explicit owner recovery.
DO $withdrawal_guard$ DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('orgmaster_core.set_managed_identity_admission_v1(bigint,boolean,text,text)'::regprocedure);
 definition:=replace(definition,'CREATE OR REPLACE FUNCTION orgmaster_core.set_managed_identity_admission_v1(', 'CREATE FUNCTION orgmaster_core.set_managed_identity_admission_administration_base_v1(');
 EXECUTE definition;
 definition:=pg_get_functiondef('orgmaster_core.quarantine_managed_identity_v1(uuid,bigint,text,text,text)'::regprocedure);
 definition:=replace(definition,'CREATE OR REPLACE FUNCTION orgmaster_core.quarantine_managed_identity_v1(', 'CREATE FUNCTION orgmaster_core.quarantine_managed_identity_administration_base_v1(');
 EXECUTE definition;
END; $withdrawal_guard$;
REVOKE ALL ON FUNCTION orgmaster_core.set_managed_identity_admission_administration_base_v1(bigint,boolean,text,text),orgmaster_core.quarantine_managed_identity_administration_base_v1(uuid,bigint,text,text,text) FROM PUBLIC,jenfu_orgmaster_runtime,jenfu_ai_pdm_runtime,jenfu_platform_runtime;
CREATE OR REPLACE FUNCTION orgmaster_core.set_managed_identity_admission_v1(p_expected_revision bigint,p_enabled boolean,p_actor text,p_reason_code text)
RETURNS TABLE(revision bigint,admission_enabled boolean,affected_identity_count integer,outbox_count integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 PERFORM 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton FOR UPDATE;
 PERFORM 1 FROM orgmaster_core.persistence_authority WHERE singleton FOR UPDATE;
 RETURN QUERY SELECT * FROM orgmaster_core.set_managed_identity_admission_administration_base_v1(p_expected_revision,p_enabled,p_actor,p_reason_code);
 PERFORM orgmaster_core.assert_administration_continuity_v1();
END; $fn$;
CREATE OR REPLACE FUNCTION orgmaster_core.quarantine_managed_identity_v1(p_identity_record_id uuid,p_expected_revision bigint,p_incident_ref text,p_actor text,p_reason_code text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE result boolean;
BEGIN
 PERFORM 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton FOR UPDATE;
 PERFORM 1 FROM orgmaster_core.persistence_authority WHERE singleton FOR UPDATE;
 result:=orgmaster_core.quarantine_managed_identity_administration_base_v1(p_identity_record_id,p_expected_revision,p_incident_ref,p_actor,p_reason_code);
 PERFORM orgmaster_core.assert_administration_continuity_v1();RETURN result;
END; $fn$;

-- Preserve the established v031 lock/facts/private-writer/outbox sequence while
-- separating actor admission from persistence. Refuse an unexpected predecessor.
DO $private_writer$ DECLARE definition text; admission text;
BEGIN
 definition:=replace(pg_get_functiondef('orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v2(jsonb,text,text,text,text,jsonb)'::regprocedure),chr(13),'');
 admission:='IF NOT EXISTS (SELECT 1 FROM orgmaster_contract.v_active_principal_accounts_v1 a WHERE a.principal_id=p_updated_by) THEN'||chr(10)||'    PERFORM orgmaster_core.assert_lifecycle_executor_v2(p_updated_by);'||chr(10)||'  END IF;';
 IF position(admission IN definition)=0 THEN RAISE EXCEPTION 'ADMINISTRATION_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,'write_active_persistence_artifacts_with_identity_fence_v2','write_active_persistence_artifacts_with_administration_fence_v1');
 definition:=replace(definition,admission,'');
 definition:=replace(definition,'RETURN QUERY SELECT result.authority_version','PERFORM orgmaster_core.assert_administration_continuity_v1();'||chr(10)||'  RETURN QUERY SELECT result.authority_version');
 EXECUTE definition;
END; $private_writer$;

CREATE FUNCTION orgmaster_core.guard_administration_artifact_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE old_publication jsonb; next_publication jsonb; next_admin jsonb; old_admin jsonb; current_document jsonb; candidate jsonb;
BEGIN
 IF NEW.artifact_key<>'orgmaster-governance.v3.json' THEN RETURN NEW; END IF;
 old_publication:=orgmaster_core.read_administration_publication_v1();
 old_admin:=old_publication#>'{policy,administration}';
 SELECT value INTO next_publication FROM jsonb_array_elements(NEW.payload->'publishedVersions') WHERE value->>'id'=NEW.payload->>'activePolicyVersionId';
 next_admin:=next_publication#>'{policy,administration}';
 PERFORM orgmaster_core.assert_administration_policy_v1(next_admin);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(old_admin->'grants','[]'::jsonb)) previous
 LEFT JOIN jsonb_array_elements(COALESCE(next_admin->'grants','[]'::jsonb)) next_grant ON previous->>'id'=next_grant->>'id'
 WHERE next_grant IS NULL OR(previous-'status') IS DISTINCT FROM(next_grant-'status') OR previous->>'status'='revoked' AND next_grant->>'status'<>'revoked') THEN RAISE EXCEPTION 'ADMINISTRATION_CONFLICT'; END IF;
 IF next_admin IS DISTINCT FROM old_admin THEN
  IF NOT EXISTS(SELECT 1 FROM orgmaster_core.administrative_command_receipts_v1 receipt WHERE receipt.transaction_id=pg_current_xact_id()
   AND receipt.administration_sha256=orgmaster_core.administration_sha256_v1(next_admin)
   AND receipt.administration_version=(next_admin->>'version')::bigint AND receipt.published_policy_id=next_publication->>'id') THEN RAISE EXCEPTION 'ADMINISTRATION_CONFLICT'; END IF;
 END IF;
 IF NEW.payload#>'{draft,administration}' IS DISTINCT FROM next_admin THEN RAISE EXCEPTION 'ADMINISTRATION_CONFLICT'; END IF;
 IF old_admin->>'initializedByCommandId' IS NOT NULL THEN
 IF orgmaster_core.administrative_protected_definition_v1(next_publication->'policy') IS DISTINCT FROM orgmaster_core.administrative_protected_definition_v1(old_publication->'policy')
 OR orgmaster_core.administrative_protected_definition_v1(NEW.payload->'draft') IS DISTINCT FROM orgmaster_core.administrative_protected_definition_v1(old_publication->'policy') THEN RAISE EXCEPTION 'ADMINISTRATION_CONFLICT'; END IF;
 SELECT artifact.payload INTO current_document FROM orgmaster_core.persistence_authority authority JOIN orgmaster_core.persistence_artifacts artifact ON artifact.batch_id=authority.active_batch_id AND artifact.artifact_key='orgmaster-governance.v3.json' WHERE authority.singleton;
 FOR candidate IN SELECT NEW.payload->'draft' UNION ALL SELECT next_publication->'policy' LOOP
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(candidate->'rolePermissionGrants','[]'::jsonb)) grant_row
 JOIN LATERAL jsonb_array_elements(COALESCE(old_publication#>'{policy,permissions}','[]'::jsonb)) permission ON permission->>'id'=grant_row->>'permissionId'
 WHERE grant_row->>'roleId'<>'role-orgmaster-admin' AND grant_row->>'effect'='allow' AND permission->>'applicationId'='orgmaster' AND permission->>'risk' IN('high','critical')
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(current_document#>'{draft,rolePermissionGrants}','[]'::jsonb)||COALESCE(old_publication#>'{policy,rolePermissionGrants}','[]'::jsonb)) previous WHERE previous=grant_row)) THEN RAISE EXCEPTION 'ADMINISTRATION_CONFLICT'; END IF;
 END LOOP;
 END IF;
 IF EXISTS(SELECT 1 FROM orgmaster_core.administrative_command_receipts_v1 WHERE operation='initialize_platform_administrator')
 AND (next_admin->>'initializedByCommandId') IS NULL THEN RAISE EXCEPTION 'ADMINISTRATION_ALREADY_INITIALIZED'; END IF;
 RETURN NEW;
END; $fn$;
CREATE TRIGGER administration_artifact_fence BEFORE INSERT OR UPDATE ON orgmaster_core.persistence_artifacts FOR EACH ROW EXECUTE FUNCTION orgmaster_core.guard_administration_artifact_v1();
CREATE FUNCTION orgmaster_core.guard_administration_active_batch_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE publication jsonb; candidate jsonb; administration jsonb;
BEGIN
 IF NEW.active_batch_id IS NOT DISTINCT FROM OLD.active_batch_id OR NOT EXISTS(SELECT 1 FROM orgmaster_core.administrative_command_receipts_v1 WHERE operation='initialize_platform_administrator') THEN RETURN NEW; END IF;
 SELECT version INTO publication FROM orgmaster_core.persistence_artifacts artifact CROSS JOIN LATERAL jsonb_array_elements(artifact.payload->'publishedVersions') version WHERE artifact.batch_id=OLD.active_batch_id AND artifact.artifact_key='orgmaster-governance.v3.json' AND version->>'id'=artifact.payload->>'activePolicyVersionId';
 SELECT version INTO candidate FROM orgmaster_core.persistence_artifacts artifact CROSS JOIN LATERAL jsonb_array_elements(artifact.payload->'publishedVersions') version WHERE artifact.batch_id=NEW.active_batch_id AND artifact.artifact_key='orgmaster-governance.v3.json' AND version->>'id'=artifact.payload->>'activePolicyVersionId';
 administration:=candidate#>'{policy,administration}';PERFORM orgmaster_core.assert_administration_policy_v1(administration);
 IF administration IS NULL OR(administration IS DISTINCT FROM publication#>'{policy,administration}' AND NOT EXISTS(SELECT 1 FROM orgmaster_core.administrative_command_receipts_v1 receipt WHERE receipt.transaction_id=pg_current_xact_id() AND receipt.administration_sha256=orgmaster_core.administration_sha256_v1(administration) AND receipt.administration_version=(administration->>'version')::bigint AND receipt.published_policy_id=candidate->>'id')) THEN RAISE EXCEPTION 'ADMINISTRATION_CONFLICT'; END IF;
 RETURN NEW;
END; $fn$;
REVOKE ALL ON FUNCTION orgmaster_core.guard_administration_active_batch_v1() FROM PUBLIC;
CREATE TRIGGER administration_batch_fence BEFORE UPDATE ON orgmaster_core.persistence_authority FOR EACH ROW EXECUTE FUNCTION orgmaster_core.guard_administration_active_batch_v1();

CREATE FUNCTION orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v3(p_changes jsonb,p_source_revision text,p_updated_by text,p_reason_code text,p_operation_id text,p_entitlement_changes jsonb,p_actor jsonb)
RETURNS TABLE(authority_version bigint,source_revision text,outbox_count integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE publication jsonb; change jsonb; next_version jsonb; current_document jsonb; management_changed boolean:=false;
BEGIN
 PERFORM 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton FOR UPDATE;
 PERFORM 1 FROM orgmaster_core.persistence_authority WHERE singleton FOR UPDATE;
 IF p_actor->>'kind'='principal' THEN PERFORM orgmaster_core.assert_administration_session_v1(p_actor,p_updated_by,false);
 ELSIF p_actor='{"kind":"owner_workload"}'::jsonb THEN PERFORM orgmaster_core.assert_lifecycle_executor_v2(p_updated_by);
 ELSE RAISE EXCEPTION 'IDENTITY_CONTEXT_REQUIRED'; END IF;
 publication:=orgmaster_core.read_administration_publication_v1();
 SELECT artifact.payload INTO current_document FROM orgmaster_core.persistence_authority authority JOIN orgmaster_core.persistence_artifacts artifact ON artifact.batch_id=authority.active_batch_id AND artifact.artifact_key='orgmaster-governance.v3.json' WHERE authority.singleton;
 FOR change IN SELECT value FROM jsonb_array_elements(p_changes) WHERE value->>'artifactKey'='orgmaster-governance.v3.json'
 LOOP
 SELECT value INTO next_version FROM jsonb_array_elements(change#>'{payload,publishedVersions}') WHERE value->>'id'=change#>>'{payload,activePolicyVersionId}';
 IF next_version#>'{policy,administration}' IS DISTINCT FROM publication#>'{policy,administration}' OR change#>'{payload,draft,administration}' IS DISTINCT FROM publication#>'{policy,administration}' THEN RAISE EXCEPTION 'ADMINISTRATION_CONFLICT'; END IF;
 management_changed:=orgmaster_core.administrative_legacy_management_v1(change#>'{payload,draft}') IS DISTINCT FROM orgmaster_core.administrative_legacy_management_v1(current_document->'draft') OR orgmaster_core.administrative_legacy_management_v1(next_version->'policy') IS DISTINCT FROM orgmaster_core.administrative_legacy_management_v1(publication->'policy');
 IF publication#>>'{policy,administration,initializedByCommandId}' IS NOT NULL AND management_changed THEN
 IF p_actor->>'kind' IS DISTINCT FROM 'principal' OR NOT EXISTS(SELECT 1 FROM orgmaster_contract.v_platform_administrator_grants_v1 root WHERE root.principal_id=p_updated_by) THEN RAISE EXCEPTION 'PLATFORM_ADMIN_REQUIRED'; END IF;
 PERFORM orgmaster_core.assert_administration_session_v1(p_actor,p_updated_by,true);
 END IF;
 END LOOP;
 RETURN QUERY SELECT * FROM orgmaster_core.write_active_persistence_artifacts_with_administration_fence_v1(p_changes,p_source_revision,p_updated_by,p_reason_code,p_operation_id,p_entitlement_changes);
END; $fn$;

CREATE FUNCTION orgmaster_core.read_administration_command_v1(p_command uuid,p_actor jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE receipt orgmaster_core.administrative_command_receipts_v1%ROWTYPE; actor_id text;
BEGIN
 SELECT principal_id INTO actor_id FROM orgmaster_core.app_sessions WHERE id=(p_actor->>'sessionId')::uuid;
 PERFORM orgmaster_core.assert_administration_session_v1(p_actor,actor_id,false);
 SELECT * INTO receipt FROM orgmaster_core.administrative_command_receipts_v1 WHERE command_id=p_command;
 IF NOT FOUND THEN RAISE EXCEPTION 'COMMAND_NOT_COMMITTED'; END IF;
 IF NOT(receipt.actor_kind='principal' AND receipt.actor_id=actor_id) AND NOT EXISTS(SELECT 1 FROM orgmaster_contract.v_platform_administrator_grants_v1 root WHERE root.principal_id=actor_id) THEN RAISE EXCEPTION 'PLATFORM_ADMIN_REQUIRED'; END IF;
 RETURN orgmaster_core.administration_receipt_response_v1(receipt.result);
END; $fn$;

REVOKE ALL ON orgmaster_core.administrative_command_receipts_v1 FROM PUBLIC,jenfu_orgmaster_runtime,jenfu_platform_runtime,jenfu_ai_pdm_runtime;
REVOKE ALL ON FUNCTION orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v1(jsonb,text,text,text,text,jsonb),orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v2(jsonb,text,text,text,text,jsonb),orgmaster_core.write_active_persistence_artifacts_v1(jsonb,text,text,text) FROM jenfu_orgmaster_runtime;
REVOKE ALL ON FUNCTION orgmaster_core.write_active_persistence_artifacts_with_administration_fence_v1(jsonb,text,text,text,text,jsonb),orgmaster_core.assert_administration_session_v1(jsonb,text,boolean),orgmaster_core.assert_administration_continuity_v1(),orgmaster_core.guard_administration_artifact_v1(),orgmaster_core.reject_administration_receipt_mutation_v1(),orgmaster_core.administration_canonical_json_v1(jsonb),orgmaster_core.administration_sha256_v1(jsonb),orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v3(jsonb,text,text,text,text,jsonb,jsonb),orgmaster_core.read_administration_command_v1(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v3(jsonb,text,text,text,text,jsonb,jsonb),orgmaster_core.read_administration_command_v1(uuid,jsonb) TO jenfu_orgmaster_runtime;
CREATE FUNCTION orgmaster_core.submit_administration_command_private_v1(p_command jsonb,p_actor_kind text,p_actor_id text,p_authentication jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE document jsonb; publication jsonb; policy jsonb; administration jsonb; grants jsonb; target jsonb; old_grant jsonb; binding jsonb;
 current_revision text; workspace_revision text; current_version bigint; request_hash text; preview_hash text; target_facts jsonb;
 receipt orgmaster_core.administrative_command_receipts_v1%ROWTYPE; operation text; command_id_value uuid; now_value text;
 root boolean; revoking boolean; replacing boolean; initializing boolean; no_change boolean:=false; new_grant_id uuid; version_id text;
 grant_ids jsonb:='[]'::jsonb; outbox_ids jsonb:='[]'::jsonb; event jsonb; version_payload jsonb; next_version jsonb; next_document jsonb;
 payload_hash text; next_hash text; previous_hash text; operation_grant jsonb; iter jsonb; result jsonb; change jsonb; body jsonb; lifecycle_event_id uuid; intrinsic_facts jsonb;
BEGIN
 PERFORM orgmaster_core.assert_administration_command_v1(p_command);
 PERFORM 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton FOR UPDATE;
 PERFORM 1 FROM orgmaster_core.persistence_authority WHERE singleton FOR UPDATE;
 command_id_value:=(p_command->>'commandId')::uuid;operation:=p_command->>'operation';
 initializing:=operation='initialize_platform_administrator';
 IF p_command->>'contractVersion'<>'orgmaster.administration-command.v1' OR operation NOT IN('initialize_platform_administrator','grant_platform_administrator','revoke_platform_administrator','grant_application_administrator','revoke_application_administrator','replace_application_administrator')
 OR NULLIF(btrim(p_command->>'reason'),'') IS NULL OR char_length(p_command->>'reason')>240 THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
 body:=p_command-'previewHash';
 request_hash:=orgmaster_core.administration_sha256_v1(jsonb_build_object('actorId',p_actor_id,'environmentKey',current_database(),'payload',body));
 SELECT * INTO receipt FROM orgmaster_core.administrative_command_receipts_v1 WHERE command_id=command_id_value;
 IF FOUND THEN
 IF receipt.request_sha256<>request_hash OR receipt.actor_id<>p_actor_id OR receipt.actor_kind<>p_actor_kind OR receipt.environment_key<>current_database() THEN RAISE EXCEPTION 'ADMINISTRATION_COMMAND_CONFLICT'; END IF;
 RETURN orgmaster_core.administration_receipt_response_v1(receipt.result);
 END IF;
 SELECT artifact.payload,trim(artifact.canonical_sha256) INTO STRICT document,current_revision FROM orgmaster_core.persistence_authority authority
 JOIN orgmaster_core.persistence_artifacts artifact ON artifact.batch_id=authority.active_batch_id AND artifact.artifact_key='orgmaster-governance.v3.json' WHERE authority.singleton;
 publication:=orgmaster_core.read_administration_publication_v1();
 IF publication IS NULL THEN
  IF NOT initializing THEN RAISE EXCEPTION 'ADMINISTRATION_DEPENDENCY_UNAVAILABLE'; END IF;
  policy:=orgmaster_core.administration_bootstrap_seed_v1();
  -- First administration publication must not register another application as
  -- an implicit side effect while managed admission is already enabled.
  policy:=jsonb_set(policy,'{applications}',COALESCE((SELECT jsonb_agg(seed.value ORDER BY seed.value->>'id')
   FROM jsonb_array_elements(policy->'applications') seed(value)
   WHERE EXISTS(SELECT 1 FROM orgmaster_core.managed_identity_invalidation_applications registered
    WHERE registered.application_id=seed.value->>'id' AND registered.status='active')),'[]'::jsonb));
  publication:=jsonb_build_object('kind','assignment-governance-v3','policy',policy,'externalRoleCatalogs','[]'::jsonb,'organizationSnapshot',jsonb_build_object('workspaceVersionId',NULL,'workspaceRevision',NULL,'capturedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'employees','[]'::jsonb,'departments','[]'::jsonb,'organizationRoles','[]'::jsonb,'positions','[]'::jsonb,'assignments','[]'::jsonb));
 END IF;
 policy:=publication->'policy';
 administration:=COALESCE(policy->'administration','{"contractVersion":"orgmaster.administration-policy.v1","version":0,"initializedByCommandId":null,"grants":[]}'::jsonb);
 current_version:=(administration->>'version')::bigint;
 SELECT employee.workspace_revision INTO workspace_revision FROM orgmaster_core.v_current_workspace_employees_v1 employee LIMIT 1;
 IF current_revision IS DISTINCT FROM p_command#>>'{expected,governanceRevision}' OR workspace_revision IS DISTINCT FROM p_command#>>'{expected,organizationRevision}' OR current_version IS DISTINCT FROM (p_command#>>'{expected,administrationVersion}')::bigint THEN RAISE EXCEPTION 'ADMINISTRATION_CONFLICT'; END IF;
 IF initializing AND (administration->>'initializedByCommandId' IS NOT NULL OR EXISTS(SELECT 1 FROM orgmaster_core.administrative_command_receipts_v1 previous_receipt WHERE previous_receipt.operation='initialize_platform_administrator')) THEN RAISE EXCEPTION 'ADMINISTRATION_ALREADY_INITIALIZED'; END IF;
 grants:=administration->'grants';target:=p_command->'target';
 IF target IS NOT NULL AND target<>'null'::jsonb THEN
  SELECT jsonb_build_object('principalId',account.principal_id,'employeeId',min(account.employee_id),'accountType',min(account.account_type),'mappingVersion',min(account.mapping_version)::text)
  INTO target_facts FROM orgmaster_contract.v_active_principal_accounts_v1 account WHERE account.principal_id=target->>'principalId' AND account.employee_id=target->>'employeeId' AND account.employee_status='active' AND account.account_type IN('human_personal','human_privileged')
  GROUP BY account.principal_id HAVING count(DISTINCT account.employee_id)=1 AND count(DISTINCT account.account_type)=1;
  IF target_facts IS NULL THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
 END IF;
 preview_hash:=orgmaster_core.administration_sha256_v1(jsonb_build_object('requestHash',request_hash,'expected',p_command->'expected','catalogBindings',p_command->'catalogBindings','targetFacts',target_facts,'authentication',p_authentication));
 IF p_command->>'previewHash' IS DISTINCT FROM preview_hash THEN RAISE EXCEPTION 'ADMINISTRATION_CONFLICT'; END IF;
 now_value:=to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 intrinsic_facts:=orgmaster_core.read_principal_lifecycle_facts_v2();
 FOR operation_grant IN SELECT value FROM jsonb_array_elements(CASE WHEN initializing THEN p_command->'grants' ELSE jsonb_build_array(jsonb_build_object('operation',operation,'target',target,'grantId',p_command->'grantId')) END)
 LOOP
 IF initializing THEN
  root:=operation_grant->>'roleCode'='platform_super_admin';
  target:=(p_command->'target')||jsonb_build_object('applicationId',operation_grant->'applicationId','validFrom',operation_grant->'validFrom','validTo',operation_grant->'validTo');revoking:=false;replacing:=false;
 ELSE root:=operation LIKE '%platform_administrator';revoking:=operation LIKE 'revoke_%';replacing:=operation='replace_application_administrator';END IF;
 old_grant:=NULL;
 IF NOT initializing AND p_command->>'grantId' IS NOT NULL THEN
 SELECT value INTO old_grant FROM jsonb_array_elements(grants) WHERE value->>'id'=p_command->>'grantId';
 IF old_grant IS NULL OR (root AND old_grant->>'roleCode'<>'platform_super_admin') OR (NOT root AND old_grant->>'roleCode'<>'application_system_admin') THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
 END IF;
 IF revoking THEN
 IF old_grant IS NULL OR target<>'null'::jsonb THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
 no_change:=old_grant->>'status'='revoked';
 SELECT jsonb_agg(CASE WHEN value->>'id'=old_grant->>'id' THEN jsonb_set(value,'{status}','"revoked"') ELSE value END) INTO grants FROM jsonb_array_elements(grants);
 grant_ids:=grant_ids||jsonb_build_array(old_grant->>'id');
 ELSE
 IF NOT initializing AND NOT replacing AND p_command->>'grantId' IS NOT NULL THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
 IF root THEN
 IF target->>'applicationId' IS NOT NULL OR target->>'validTo' IS NOT NULL THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;binding:=NULL;
 ELSE
 binding:=p_command->'catalogBindings'->(target->>'applicationId');
 IF binding IS NULL OR binding->>'stableRoleId' IS DISTINCT FROM (CASE target->>'applicationId' WHEN 'orgmaster' THEN 'role-orgmaster-admin' WHEN 'ai-pdm' THEN 'role-application-system-admin' WHEN 'financial-management-system' THEN 'role-system-admin' END) THEN RAISE EXCEPTION 'CATALOG_BINDING_CONFLICT'; END IF;
 IF NOT orgmaster_core.administrative_catalog_current_v1(target->>'applicationId',binding) THEN RAISE EXCEPTION 'CATALOG_BINDING_CONFLICT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(publication->'externalRoleCatalogs') catalog WHERE catalog->>'applicationId'=target->>'applicationId' AND catalog->>'catalogVersion'=binding->>'catalogVersion' AND COALESCE(catalog->>'contentSha256',catalog->>'payloadHash')=binding->>'contentSha256'
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(catalog->'roles') role WHERE role->>'stableRoleId'=binding->>'stableRoleId' AND role->>'roleDefinitionHash'=binding->>'roleDefinitionHash')) AND target->>'applicationId' IN('ai-pdm','financial-management-system') THEN RAISE EXCEPTION 'CATALOG_BINDING_CONFLICT'; END IF;
 END IF;
 IF (target->>'validFrom')::timestamptz IS NULL OR (target->>'validTo' IS NOT NULL AND (target->>'validTo')::timestamptz<=(target->>'validFrom')::timestamptz) THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
 IF replacing THEN
 IF old_grant->>'principalId' IS DISTINCT FROM target->>'principalId' OR old_grant->>'employeeId' IS DISTINCT FROM target->>'employeeId' OR old_grant->>'applicationId' IS DISTINCT FROM target->>'applicationId' THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
 SELECT jsonb_agg(CASE WHEN value->>'id'=old_grant->>'id' THEN jsonb_set(value,'{status}','"revoked"') ELSE value END) INTO grants FROM jsonb_array_elements(grants);
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(grants) grant_row WHERE grant_row->>'status'='active' AND grant_row->>'principalId'=target->>'principalId' AND grant_row->>'applicationId' IS NOT DISTINCT FROM target->>'applicationId'
 AND (grant_row->>'validFrom')::timestamptz<COALESCE((target->>'validTo')::timestamptz,'infinity') AND (target->>'validFrom')::timestamptz<COALESCE((grant_row->>'validTo')::timestamptz,'infinity')) THEN
 SELECT value INTO iter FROM jsonb_array_elements(grants) WHERE value->>'status'='active' AND value->>'principalId'=target->>'principalId' AND value->>'employeeId'=target->>'employeeId' AND value->>'applicationId' IS NOT DISTINCT FROM target->>'applicationId'
  AND value->>'validFrom'=target->>'validFrom' AND value->>'validTo' IS NOT DISTINCT FROM target->>'validTo';
 IF iter IS NULL THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
 no_change:=true;grant_ids:=grant_ids||jsonb_build_array(iter->>'id');
 ELSE
 new_grant_id:=gen_random_uuid();grant_ids:=grant_ids||jsonb_build_array(new_grant_id);
 grants:=grants||jsonb_build_array(jsonb_build_object('id',new_grant_id,'principalId',target->>'principalId','employeeId',target->>'employeeId','roleCode',CASE WHEN root THEN 'platform_super_admin' ELSE 'application_system_admin' END,
 'applicationId',target->'applicationId','subjectKind','principal','basis','manual','scope',jsonb_build_object('kind',CASE WHEN root THEN 'platform' ELSE 'global' END),'status','active','validFrom',target->>'validFrom','validTo',target->'validTo',
 'createdBy',jsonb_build_object('kind',p_actor_kind,'id',p_actor_id),'reason',p_command->>'reason','catalogBinding',binding));
 END IF;
 END IF;
 END LOOP;
 IF initializing AND (NOT EXISTS(SELECT 1 FROM jsonb_array_elements(grants) value WHERE value->>'roleCode'='platform_super_admin') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(grants) value WHERE value->>'applicationId'='orgmaster')) THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
 IF grants=administration->'grants' THEN no_change:=true; ELSE no_change:=false; END IF;
 administration:=administration||jsonb_build_object('version',current_version+CASE WHEN no_change THEN 0 ELSE 1 END,'grants',grants,'initializedByCommandId',CASE WHEN initializing THEN to_jsonb(command_id_value) ELSE administration->'initializedByCommandId' END);
 version_id:=CASE WHEN no_change THEN publication->>'id' ELSE 'assignment-policy-'||gen_random_uuid()::text END;
 IF NOT no_change THEN
 policy:=jsonb_set(policy,'{administration}',administration);
 version_payload:=jsonb_build_object('kind','assignment-governance-v3','policy',policy,'externalRoleCatalogs',publication->'externalRoleCatalogs','organizationSnapshot',orgmaster_core.read_administration_organization_snapshot_v1(),'effectState','not-synchronized');
 payload_hash:=orgmaster_core.administration_sha256_v1(version_payload);
 next_version:=version_payload||jsonb_build_object('id',version_id,'versionNumber',jsonb_array_length(document->'publishedVersions')+1,'publishedAt',now_value,'publishedByPrincipalId',CASE WHEN p_actor_kind='principal' THEN p_actor_id ELSE NULL END,'publishedBy',jsonb_build_object('kind',p_actor_kind,'id',p_actor_id),'publishReason',p_command->>'reason','hashFormat','orgmaster.sorted-json.v1','snapshotHash',payload_hash);
 next_document:=document||jsonb_build_object('activePolicyVersionId',version_id,'publishedVersions',(document->'publishedVersions')||jsonb_build_array(next_version),
 'draft',(document->'draft')||jsonb_build_object('administration',administration,'basePolicyVersionId',version_id,'updatedAt',now_value));
 previous_hash:=document#>>ARRAY['auditEvents',(jsonb_array_length(document->'auditEvents')-1)::text,'eventHash'];
 event:=jsonb_build_object('id','audit-'||gen_random_uuid()::text,'commandId',command_id_value,'commandHash',request_hash,'occurredAt',now_value,'actorPrincipalId',CASE WHEN p_actor_kind='principal' THEN p_actor_id ELSE NULL END,
 'actor',jsonb_build_object('kind',p_actor_kind,'id',p_actor_id),'action',operation,'entityType','administration','entityId',version_id,'reason',p_command->>'reason','beforeHash',orgmaster_core.administration_sha256_v1(document#>'{draft,administration}'),'afterHash',orgmaster_core.administration_sha256_v1(administration),'previousEventHash',previous_hash,'hashFormat','orgmaster.sorted-json.v1');
 event:=event||jsonb_build_object('eventHash',orgmaster_core.administration_sha256_v1(event));next_document:=jsonb_set(next_document,'{auditEvents}',(document->'auditEvents')||jsonb_build_array(event));
 lifecycle_event_id:=gen_random_uuid();outbox_ids:=jsonb_build_array(lifecycle_event_id,'security-alert:'||command_id_value::text);
 END IF;
 result:=jsonb_build_object('contractVersion','orgmaster.administration-receipt.v1','commandId',command_id_value,'result',CASE WHEN no_change THEN 'no_change' ELSE 'applied' END,'administrationVersion',(administration->>'version')::bigint,'publishedPolicyId',version_id,'grantIds',grant_ids,'outboxIds',outbox_ids,'activation',CASE WHEN no_change THEN 'acknowledged' ELSE 'pending' END);
 INSERT INTO orgmaster_core.administrative_command_receipts_v1 VALUES(command_id_value,'orgmaster.administration-command.v1',current_database(),operation,p_actor_kind,p_actor_id,request_hash,preview_hash,target->>'principalId',target->>'employeeId',CASE WHEN no_change THEN 'no_change' ELSE 'applied' END,(administration->>'version')::bigint,orgmaster_core.administration_sha256_v1(administration),version_id,pg_current_xact_id(),result,clock_timestamp());
 IF NOT no_change THEN
 next_hash:=orgmaster_core.administration_sha256_v1(next_document);
 change:=jsonb_build_array(jsonb_build_object('artifactKey','orgmaster-governance.v3.json','artifactKind','governance','payload',next_document,'expectedCanonicalSha256',current_revision,'nextCanonicalSha256',next_hash,'sourceSha256',next_hash,'sourceBytes',octet_length(orgmaster_core.administration_canonical_json_v1(next_document))));
 PERFORM * FROM orgmaster_core.write_active_persistence_artifacts_with_administration_fence_v1(change,next_hash,p_actor_id,operation,command_id_value::text,'[]'::jsonb);
 PERFORM orgmaster_core.enqueue_administration_invalidation_v1(lifecycle_event_id,command_id_value,next_hash,p_actor_id,p_actor_kind,grants,grant_ids,intrinsic_facts);
 INSERT INTO orgmaster_core.privileged_security_alert_intents(alert_reference,command_id,operation,actor_principal_id,actor,employee_id,target_hint,audit_reference,reason_sha256,status,next_attempt_at,created_at)
 VALUES('security-alert:'||command_id_value::text,command_id_value::text,operation,CASE WHEN p_actor_kind='principal' THEN p_actor_id ELSE NULL END,
  jsonb_build_object('kind',p_actor_kind,'id',p_actor_id),COALESCE(target->>'employeeId',old_grant->>'employeeId'),
  'Principal '||substr(encode(public.digest(COALESCE(target->>'principalId',old_grant->>'principalId'),'sha256'),'hex'),1,12),
  event->>'id',encode(public.digest(p_command->>'reason','sha256'),'hex'),'pending',clock_timestamp(),clock_timestamp());
 END IF;
 RETURN result;
END; $fn$;

CREATE FUNCTION orgmaster_core.apply_administration_command_v1(p_command jsonb,p_actor jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor_id text;
BEGIN
 PERFORM 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton FOR UPDATE;
 PERFORM 1 FROM orgmaster_core.persistence_authority WHERE singleton FOR UPDATE;
 SELECT principal_id INTO actor_id FROM orgmaster_core.app_sessions WHERE id=(p_actor->>'sessionId')::uuid;
 PERFORM orgmaster_core.assert_administration_session_v1(p_actor,actor_id,true);
 IF p_command->>'operation'='initialize_platform_administrator' OR NOT EXISTS(SELECT 1 FROM orgmaster_contract.v_platform_administrator_grants_v1 root JOIN orgmaster_contract.v_application_administrator_grants_v1 entry ON entry.principal_id=root.principal_id AND entry.employee_id=root.employee_id AND entry.application_id='orgmaster' WHERE root.principal_id=actor_id) THEN RAISE EXCEPTION 'PLATFORM_ADMIN_REQUIRED'; END IF;
 RETURN orgmaster_core.submit_administration_command_private_v1(p_command,'principal',actor_id,p_actor);
END; $fn$;

CREATE FUNCTION orgmaster_core.bind_administration_owner_package_v1(p_plan jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE binding orgmaster_core.workload_principal_bindings%ROWTYPE;
BEGIN
 PERFORM 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton FOR UPDATE;
 PERFORM 1 FROM orgmaster_core.persistence_authority WHERE singleton FOR UPDATE;
 IF NOT pg_has_role(SESSION_USER,'jenfu_orgmaster_migrator','MEMBER') OR pg_has_role(SESSION_USER,'jenfu_orgmaster_runtime','MEMBER')
 OR p_plan#>>'{owner,dbSessionUser}' IS DISTINCT FROM SESSION_USER::text OR p_plan->>'environmentKey' IS DISTINCT FROM current_database()
 OR p_plan->>'planHash' IS DISTINCT FROM orgmaster_core.administration_sha256_v1(p_plan-'planHash') OR p_plan#>>'{owner,providerSubject}' !~ '^[0-9]{18,24}$'
 THEN RAISE EXCEPTION 'PLATFORM_ADMIN_REQUIRED'; END IF;
 IF current_database()='jenfu_prod' AND SESSION_USER::text<>'orgmaster-prod-migrator@jenfu-platform-prod.iam' THEN RAISE EXCEPTION 'PLATFORM_ADMIN_REQUIRED'; END IF;
 SELECT * INTO binding FROM orgmaster_core.workload_principal_bindings WHERE owner='orgmaster' AND purpose='administration-initialize' FOR UPDATE;
 IF FOUND THEN
 IF binding.db_session_user IS DISTINCT FROM SESSION_USER::text OR binding.provider_subject IS DISTINCT FROM p_plan#>>'{owner,providerSubject}' OR binding.bound_command_id IS DISTINCT FROM (p_plan->>'commandId')::uuid OR binding.bound_plan_sha256 IS DISTINCT FROM p_plan->>'planHash' THEN RAISE EXCEPTION 'ADMINISTRATION_COMMAND_CONFLICT'; END IF;
 RETURN jsonb_build_object('commandId',binding.bound_command_id,'planHash',binding.bound_plan_sha256,'bound',true);
 END IF;
 IF EXISTS(SELECT 1 FROM orgmaster_core.administrative_command_receipts_v1 WHERE operation='initialize_platform_administrator') THEN RAISE EXCEPTION 'ADMINISTRATION_ALREADY_INITIALIZED'; END IF;
 INSERT INTO orgmaster_core.workload_principal_bindings(principal_id,owner,purpose,provider_issuer,provider_subject,db_session_user,binding_version,enabled,bound_command_id,bound_plan_sha256,bound_target_principal_id,bound_target_employee_id,bound_environment_key)
 VALUES(p_plan#>>'{owner,principalId}','orgmaster','administration-initialize','https://accounts.google.com',p_plan#>>'{owner,providerSubject}',SESSION_USER::text,1,true,(p_plan->>'commandId')::uuid,p_plan->>'planHash',p_plan#>>'{target,principalId}',p_plan#>>'{target,employeeId}',current_database());
 RETURN jsonb_build_object('commandId',p_plan->>'commandId','planHash',p_plan->>'planHash','bound',true);
END; $fn$;
REVOKE ALL ON FUNCTION orgmaster_core.bind_administration_owner_package_v1(jsonb) FROM PUBLIC;

CREATE FUNCTION orgmaster_core.assert_administration_owner_plan_v1(p_command jsonb,p_binding jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
DECLARE plan jsonb;
BEGIN
 plan:=jsonb_build_object('contractVersion','orgmaster.administration-owner-plan.v1','commandId',p_command->'commandId','environmentKey',p_command->'environmentKey',
 'owner',jsonb_build_object('principalId',p_binding->>'principal_id','dbSessionUser',p_binding->>'db_session_user','providerSubject',p_binding->>'provider_subject'),
 'target',p_command->'target','expected',p_command->'expected','catalogBindings',p_command->'catalogBindings','grants',p_command->'grants','plannedProtectedOperations',p_command->'plannedProtectedOperations','reason',p_command->'reason');
 IF orgmaster_core.administration_sha256_v1(plan) IS DISTINCT FROM p_binding->>'bound_plan_sha256' THEN RAISE EXCEPTION 'ADMINISTRATION_COMMAND_CONFLICT'; END IF;
END; $fn$;
REVOKE ALL ON FUNCTION orgmaster_core.assert_administration_owner_plan_v1(jsonb,jsonb) FROM PUBLIC;
CREATE FUNCTION orgmaster_core.prepare_administration_identity_owner_v1(p_package jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE binding orgmaster_core.workload_principal_bindings%ROWTYPE; command jsonb; facts jsonb; existing record; identity_id uuid; admission bigint; receipt jsonb; receipt_key text; facts_hash text;
BEGIN
 PERFORM 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton FOR UPDATE;
 PERFORM 1 FROM orgmaster_core.persistence_authority WHERE singleton FOR UPDATE;
 command:=p_package->'command';facts:=p_package->'nativeFacts';
 SELECT * INTO STRICT binding FROM orgmaster_core.workload_principal_bindings WHERE db_session_user=SESSION_USER::text AND owner='orgmaster' AND purpose='administration-initialize' FOR UPDATE;
 PERFORM orgmaster_core.assert_administration_owner_plan_v1(command,to_jsonb(binding));
 IF NOT binding.enabled OR binding.consumed_at IS NOT NULL OR binding.bound_command_id IS DISTINCT FROM (command->>'commandId')::uuid OR binding.bound_plan_sha256 IS DISTINCT FROM p_package->>'planHash'
 OR binding.bound_target_principal_id IS DISTINCT FROM command#>>'{target,principalId}' OR binding.bound_target_employee_id IS DISTINCT FROM command#>>'{target,employeeId}' OR binding.bound_environment_key IS DISTINCT FROM current_database()
 OR command->>'environmentKey' IS DISTINCT FROM current_database() OR command->>'operation'<>'initialize_platform_administrator' THEN RAISE EXCEPTION 'ADMINISTRATION_COMMAND_CONFLICT'; END IF;
 IF extract(epoch FROM clock_timestamp()-(p_package->>'verifiedAt')::timestamptz) NOT BETWEEN 0 AND 300
 OR extract(epoch FROM clock_timestamp()-(facts->>'authenticatedAt')::timestamptz) NOT BETWEEN 0 AND 300 OR facts->>'assuranceLevel' NOT IN('aal1','aal2') THEN RAISE EXCEPTION 'AUTH_RECENT_REQUIRED'; END IF;
 facts_hash:=orgmaster_core.administration_sha256_v1(facts-'authenticatedAt'-'assuranceLevel');
 IF facts_hash IS DISTINCT FROM command#>>'{target,identityFactsHash}' OR facts->>'principalId' IS DISTINCT FROM binding.bound_target_principal_id OR facts->>'employeeId' IS DISTINCT FROM binding.bound_target_employee_id
 OR NULLIF(facts->>'issuer','') IS NULL OR NULLIF(facts->>'subject','') IS NULL OR NULLIF(facts->>'primaryEmail','') IS NULL
 OR facts->>'directoryCustomerId' IS DISTINCT FROM command#>>'{target,directoryKey,customerId}' OR facts->>'directoryUserId' IS DISTINCT FROM command#>>'{target,directoryKey,userId}' THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
 IF NOT EXISTS(SELECT 1 FROM orgmaster_core.v_current_workspace_employees_v1 employee WHERE employee.employee_id=binding.bound_target_employee_id AND employee.employee_status='active') THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
 IF EXISTS(SELECT 1 FROM orgmaster_contract.v_principal_alias_history_v1 history WHERE history.employee_id=binding.bound_target_employee_id AND history.resolution_status='unresolved') THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
 receipt_key:=binding.bound_command_id::text||':identity';
 SELECT response_payload INTO receipt FROM orgmaster_core.managed_identity_command_receipts WHERE command_id=receipt_key;
 IF FOUND THEN IF receipt->>'identityFactsHash'<>facts_hash THEN RAISE EXCEPTION 'ADMINISTRATION_COMMAND_CONFLICT'; END IF;RETURN receipt;END IF;
 SELECT principal_id,employee_id INTO existing FROM orgmaster_contract.v_active_principal_accounts_v1 WHERE principal_issuer=facts->>'issuer' AND principal_subject=facts->>'subject';
 IF FOUND THEN
 IF existing.principal_id IS DISTINCT FROM binding.bound_target_principal_id OR existing.employee_id IS DISTINCT FROM binding.bound_target_employee_id THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
 receipt:=jsonb_build_object('contractVersion','orgmaster.administration-identity-prepare.v1','commandId',binding.bound_command_id,'principalId',existing.principal_id,'employeeId',existing.employee_id,'identityFactsHash',facts_hash,'result','reused');
 ELSE
 IF EXISTS(SELECT 1 FROM orgmaster_core.principal_identity_reservations WHERE principal_issuer=facts->>'issuer' AND principal_subject=facts->>'subject' AND(principal_id IS DISTINCT FROM binding.bound_target_principal_id OR employee_id IS DISTINCT FROM binding.bound_target_employee_id)) THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
 IF binding.bound_target_principal_id !~ '^principal-managed:[0-9a-f-]{36}$' THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
 identity_id:=substring(binding.bound_target_principal_id FROM 19)::uuid;
 SELECT identity_record_id,principal_id,employee_id,directory_customer_id,directory_user_id,auth_issuer,auth_subject INTO existing FROM orgmaster_core.managed_daily_identities WHERE employee_id=binding.bound_target_employee_id FOR UPDATE;
 IF FOUND THEN
 IF existing.identity_record_id IS DISTINCT FROM identity_id OR existing.principal_id IS DISTINCT FROM binding.bound_target_principal_id OR existing.directory_customer_id IS DISTINCT FROM facts->>'directoryCustomerId' OR existing.directory_user_id IS DISTINCT FROM facts->>'directoryUserId' OR(existing.auth_issuer IS NOT NULL AND(existing.auth_issuer IS DISTINCT FROM facts->>'issuer' OR existing.auth_subject IS DISTINCT FROM facts->>'subject')) THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
 ELSE
 INSERT INTO orgmaster_core.managed_daily_identities(identity_record_id,employee_id,principal_id,directory_customer_id,directory_user_id,last_verified_primary_email,link_state,created_by,updated_by)
 VALUES(identity_id,binding.bound_target_employee_id,binding.bound_target_principal_id,facts->>'directoryCustomerId',facts->>'directoryUserId',facts->>'primaryEmail','directory_linked_pending_auth',binding.principal_id,binding.principal_id);
 END IF;
 INSERT INTO orgmaster_core.managed_identity_observations(identity_record_id,primary_email,directory_state,source_etag,adapter_outcome,trusted_observed_at,last_attempt_at,freshness)
 VALUES(identity_id,facts->>'primaryEmail','present',p_package->>'sourceEtag','success',clock_timestamp(),clock_timestamp(),'fresh') ON CONFLICT(identity_record_id) DO UPDATE SET primary_email=EXCLUDED.primary_email,directory_state='present',source_etag=EXCLUDED.source_etag,adapter_outcome='success',trusted_observed_at=EXCLUDED.trusted_observed_at,last_attempt_at=EXCLUDED.last_attempt_at,freshness='fresh';
 PERFORM * FROM orgmaster_core.bind_managed_identity_auth_v1(binding.bound_target_employee_id,facts->>'issuer',facts->>'subject',facts->>'primaryEmail',receipt_key);
 receipt:=jsonb_build_object('contractVersion','orgmaster.administration-identity-prepare.v1','commandId',binding.bound_command_id,'principalId',binding.bound_target_principal_id,'employeeId',binding.bound_target_employee_id,'identityFactsHash',facts_hash,'result','prepared');
 END IF;
 INSERT INTO orgmaster_core.managed_identity_command_receipts(command_id,request_hash_sha256,action,employee_id,identity_record_id,response_payload)
 VALUES(receipt_key,facts_hash,'dev070_owner_identity_prepare',binding.bound_target_employee_id,identity_id,receipt);
 RETURN receipt;
END; $fn$;

CREATE FUNCTION orgmaster_core.initialize_administration_owner_v1(p_package jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE binding orgmaster_core.workload_principal_bindings%ROWTYPE; command jsonb;
BEGIN
 PERFORM 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton FOR UPDATE;
 PERFORM 1 FROM orgmaster_core.persistence_authority WHERE singleton FOR UPDATE;
 command:=p_package->'command';
 SELECT * INTO STRICT binding FROM orgmaster_core.workload_principal_bindings WHERE db_session_user=SESSION_USER::text AND owner='orgmaster' AND purpose='administration-initialize' FOR UPDATE;
 PERFORM orgmaster_core.assert_administration_owner_plan_v1(command,to_jsonb(binding));
 IF binding.bound_command_id IS DISTINCT FROM (command->>'commandId')::uuid OR binding.bound_plan_sha256 IS DISTINCT FROM p_package->>'planHash'
 OR binding.bound_target_principal_id IS DISTINCT FROM command#>>'{target,principalId}' OR binding.bound_target_employee_id IS DISTINCT FROM command#>>'{target,employeeId}' OR binding.bound_environment_key IS DISTINCT FROM current_database()
 OR command->>'environmentKey' IS DISTINCT FROM current_database() OR command->>'operation'<>'initialize_platform_administrator' THEN RAISE EXCEPTION 'ADMINISTRATION_COMMAND_CONFLICT'; END IF;
 IF binding.consumed_at IS NOT NULL THEN RETURN orgmaster_core.submit_administration_command_private_v1(command,'owner_workload',binding.principal_id); END IF;
 IF NOT binding.enabled OR extract(epoch FROM clock_timestamp()-(p_package->>'verifiedAt')::timestamptz) NOT BETWEEN 0 AND 300 THEN RAISE EXCEPTION 'AUTH_RECENT_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM orgmaster_core.managed_identity_command_receipts prepared WHERE prepared.command_id=binding.bound_command_id::text||':identity' AND prepared.action='dev070_owner_identity_prepare' AND prepared.response_payload->>'identityFactsHash'=command#>>'{target,identityFactsHash}' AND prepared.employee_id=binding.bound_target_employee_id) THEN RAISE EXCEPTION 'ADMIN_TARGET_INVALID'; END IF;
 UPDATE orgmaster_core.workload_principal_bindings SET enabled=false,consumed_at=clock_timestamp() WHERE principal_id=binding.principal_id;
 RETURN orgmaster_core.submit_administration_command_private_v1(command,'owner_workload',binding.principal_id);
END; $fn$;
CREATE FUNCTION orgmaster_core.read_administration_command_owner_v1(p_command uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM orgmaster_core.workload_principal_bindings WHERE db_session_user=SESSION_USER::text AND owner='orgmaster' AND purpose='administration-initialize' AND bound_command_id=p_command) THEN RAISE EXCEPTION 'PLATFORM_ADMIN_REQUIRED'; END IF;
 RETURN (SELECT orgmaster_core.administration_receipt_response_v1(result) FROM orgmaster_core.administrative_command_receipts_v1 WHERE command_id=p_command);
END; $fn$;
REVOKE ALL ON FUNCTION orgmaster_core.submit_administration_command_private_v1(jsonb,text,text,jsonb),orgmaster_core.apply_administration_command_v1(jsonb,jsonb),orgmaster_core.prepare_administration_identity_owner_v1(jsonb),orgmaster_core.initialize_administration_owner_v1(jsonb),orgmaster_core.read_administration_command_owner_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orgmaster_core.apply_administration_command_v1(jsonb,jsonb) TO jenfu_orgmaster_runtime;
COMMIT;
