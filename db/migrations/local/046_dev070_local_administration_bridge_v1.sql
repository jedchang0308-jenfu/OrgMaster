-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: orgmaster.local-administration-owner-bridge.v1
-- compatibility: additive
-- governance-review: ORGMASTER/DEV-070 local owner bridge; excluded from production profile
BEGIN;
SET LOCAL ROLE jenfu_orgmaster_migrator;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $target$ BEGIN
 IF SESSION_USER<>'jenfu_orgmaster_migrator' OR current_database() !~ '^jenfu_local_[a-z0-9_]{3,80}$'
 OR COALESCE(host(inet_server_addr()),'')<>'127.0.0.1' THEN RAISE EXCEPTION 'DEV070_LOCAL_OWNER_TARGET_INVALID'; END IF;
END; $target$;
CREATE TABLE orgmaster_core.administration_local_bridge_installations_v1(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),source_path text NOT NULL,
 source_sha256 text NOT NULL CHECK(source_sha256~'^[a-f0-9]{64}$'),source_revision text NOT NULL CHECK(source_revision~'^[a-f0-9]{40}$'),
 installed_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE orgmaster_core.administration_local_bridge_receipts_v1(
 command_id uuid PRIMARY KEY,plan_sha256 text NOT NULL CHECK(plan_sha256~'^[a-f0-9]{64}$'),response jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp());
REVOKE ALL ON orgmaster_core.administration_local_bridge_installations_v1,orgmaster_core.administration_local_bridge_receipts_v1 FROM PUBLIC;
CREATE TRIGGER administration_local_bridge_installation_immutable BEFORE UPDATE OR DELETE ON orgmaster_core.administration_local_bridge_installations_v1 FOR EACH ROW EXECUTE FUNCTION orgmaster_core.reject_lifecycle_payload_mutation_v2();
CREATE TRIGGER administration_local_bridge_receipt_immutable BEFORE UPDATE OR DELETE ON orgmaster_core.administration_local_bridge_receipts_v1 FOR EACH ROW EXECUTE FUNCTION orgmaster_core.reject_lifecycle_payload_mutation_v2();

CREATE FUNCTION orgmaster_core.bind_local_administration_workloads_v1(p_plan jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE run text;org_login text;platform_login text;fms_login text;before_rows jsonb;after_rows jsonb;before_hash text;after_hash text;plan_hash text;prior record;receipt jsonb;item record;changed integer;
BEGIN
 IF SESSION_USER<>'jenfu_orgmaster_migrator' OR current_database() !~ '^jenfu_local_[a-z0-9_]{3,80}$'
 OR COALESCE(host(inet_server_addr()),'')<>'127.0.0.1' OR pg_has_role(SESSION_USER,'jenfu_orgmaster_runtime','MEMBER')
 THEN RAISE EXCEPTION 'DEV070_LOCAL_OWNER_TARGET_INVALID'; END IF;
 IF jsonb_typeof(p_plan) IS DISTINCT FROM 'object' OR NOT(p_plan?&ARRAY['format','commandId','sourceRevision','sourceSha256','configurationSha256','profileSha256','sqlProfileSha256','runId','target','postmaster','clusterRecordSha256','ownerProof','beforeLedgerSha256','beforeBindingsSha256','beforeRuntimeRolesSha256','beforeOwnership','ownershipBootstrap','migrations','localMigration','fmsRuntimeLogin','reason','createdAt','expiresAt'])
 OR p_plan-ARRAY['format','commandId','sourceRevision','sourceSha256','configurationSha256','profileSha256','sqlProfileSha256','runId','target','postmaster','clusterRecordSha256','ownerProof','beforeLedgerSha256','beforeBindingsSha256','beforeRuntimeRolesSha256','beforeOwnership','ownershipBootstrap','migrations','localMigration','fmsRuntimeLogin','reason','createdAt','expiresAt']<>'{}'::jsonb
 OR p_plan->>'format' IS DISTINCT FROM 'orgmaster.local-administration-bridge-plan.v1'
 OR p_plan#>>'{target,database}' IS DISTINCT FROM current_database() OR p_plan#>>'{target,host}' IS DISTINCT FROM '127.0.0.1'
 OR (p_plan#>>'{target,port}')::integer IS DISTINCT FROM inet_server_port()
 OR p_plan#>>'{ownerProof,subject}' IS DISTINCT FROM '109035753048386897825'
 OR p_plan#>>'{ownerProof,email}' IS DISTINCT FROM 'dev010-orgmaster-migrator@jenfu-platform-nonprod.iam.gserviceaccount.com'
 OR p_plan->>'runId' !~ '^[a-f0-9]{32}$' OR p_plan->>'sourceRevision' !~ '^[a-f0-9]{40}$'
 OR p_plan->>'sourceSha256' !~ '^[a-f0-9]{64}$' OR p_plan->>'profileSha256' !~ '^[a-f0-9]{64}$'
 OR p_plan->>'sqlProfileSha256' !~ '^[a-f0-9]{64}$' OR p_plan->>'beforeBindingsSha256' !~ '^[a-f0-9]{64}$'
 OR p_plan->>'beforeRuntimeRolesSha256' !~ '^[a-f0-9]{64}$' OR p_plan->>'beforeLedgerSha256' !~ '^[a-f0-9]{64}$'
 OR char_length(btrim(COALESCE(p_plan->>'reason',''))) NOT BETWEEN 1 AND 240
 OR (p_plan->>'createdAt')::timestamptz>clock_timestamp() OR (p_plan->>'expiresAt')::timestamptz<=clock_timestamp()
 OR (p_plan->>'expiresAt')::timestamptz-(p_plan->>'createdAt')::timestamptz<>interval '15 minutes'
 THEN RAISE EXCEPTION 'DEV070_LOCAL_OWNER_PLAN_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('dev070-local-administration-bridge'),hashtext(current_database()));
 run:=p_plan->>'runId';org_login:='dev069_orgmaster_'||left(run,12);platform_login:='dev069_platform_'||left(run,12);fms_login:='fms_test_runtime_'||left(run,12);
 IF p_plan#>>'{target,sessionUser}' IS DISTINCT FROM org_login OR p_plan->>'fmsRuntimeLogin' IS DISTINCT FROM fms_login THEN RAISE EXCEPTION 'DEV070_LOCAL_OWNER_PLAN_INVALID'; END IF;
 FOR item IN SELECT * FROM(VALUES(org_login,'jenfu_orgmaster_runtime'),(platform_login,'jenfu_platform_runtime'),(fms_login,'fms_runtime'))roles(login,group_name) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname=item.group_name AND NOT(r.rolcanlogin OR r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls)) THEN RAISE EXCEPTION 'DEV070_LOCAL_RUNTIME_ROLE_INVALID'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname=item.login AND r.rolcanlogin AND NOT(r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls)
   AND pg_has_role(r.rolname,item.group_name,'MEMBER') AND NOT pg_has_role(r.rolname,'jenfu_orgmaster_migrator','MEMBER')
   AND NOT EXISTS(SELECT 1 FROM pg_roles p WHERE pg_has_role(r.rolname,p.oid,'MEMBER') AND(p.rolsuper OR p.rolcreaterole OR p.rolcreatedb OR p.rolreplication OR p.rolbypassrls OR p.rolname~*'(owner|migrator)'))
   AND NOT EXISTS(SELECT 1 FROM pg_roles other WHERE other.rolname IN('jenfu_orgmaster_runtime','jenfu_platform_runtime','fms_runtime') AND other.rolname<>item.group_name AND pg_has_role(r.rolname,other.oid,'MEMBER'))
   AND NOT EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND has_schema_privilege(r.rolname,n.oid,'CREATE'))
   AND NOT EXISTS(SELECT 1 FROM pg_database d WHERE d.datname=current_database() AND pg_has_role(r.rolname,d.datdba,'USAGE')))
  THEN RAISE EXCEPTION 'DEV070_LOCAL_RUNTIME_ROLE_INVALID'; END IF;
 END LOOP;
 PERFORM 1 FROM orgmaster_core.workload_principal_bindings WHERE principal_id IN('principal-workload:orgmaster-managed-identity-lifecycle','principal-workload:platform-principal-lifecycle-invalidation') ORDER BY principal_id FOR UPDATE;
 SELECT jsonb_agg(to_jsonb(b) ORDER BY principal_id) INTO before_rows FROM(
  SELECT principal_id,owner,purpose,provider_issuer,provider_subject,db_session_user,binding_version::text binding_version,enabled FROM orgmaster_core.workload_principal_bindings
  WHERE principal_id IN('principal-workload:orgmaster-managed-identity-lifecycle','principal-workload:platform-principal-lifecycle-invalidation'))b;
 before_hash:=orgmaster_core.administration_sha256_v1(before_rows);plan_hash:=orgmaster_core.administration_sha256_v1(p_plan);
 SELECT * INTO prior FROM orgmaster_core.administration_local_bridge_receipts_v1 WHERE command_id=(p_plan->>'commandId')::uuid;
 IF FOUND THEN
  IF prior.plan_sha256<>plan_hash OR prior.response->>'afterBindingsSha256' IS DISTINCT FROM before_hash THEN RAISE EXCEPTION 'DEV070_LOCAL_OWNER_RECEIPT_CONFLICT'; END IF;
  RETURN prior.response;
 END IF;
 IF before_hash IS DISTINCT FROM p_plan->>'beforeBindingsSha256' OR jsonb_array_length(before_rows)<>2 THEN RAISE EXCEPTION 'DEV070_LOCAL_OWNER_BINDING_CONFLICT'; END IF;
 IF EXISTS(SELECT 1 FROM orgmaster_core.workload_principal_bindings b WHERE b.principal_id IN('principal-workload:orgmaster-managed-identity-lifecycle','principal-workload:platform-principal-lifecycle-invalidation') AND NOT(
  b.provider_issuer='https://accounts.google.com' AND b.enabled AND(
   (b.principal_id='principal-workload:orgmaster-managed-identity-lifecycle' AND b.owner='orgmaster' AND b.purpose='managed-identity-lifecycle' AND((b.provider_subject='109928765105400231333' AND b.db_session_user='orgmaster-prod-runtime@jenfu-platform-prod.iam' AND b.binding_version=1) OR(b.provider_subject='102985156037283277347' AND b.db_session_user=org_login AND b.binding_version>=2)))
   OR(b.principal_id='principal-workload:platform-principal-lifecycle-invalidation' AND b.owner='platform' AND b.purpose='principal-lifecycle-invalidation' AND((b.provider_subject='101029748006912113815' AND b.db_session_user='platform-prod-runtime@jenfu-platform-prod.iam' AND b.binding_version=1) OR(b.provider_subject='117743617824418208171' AND b.db_session_user=platform_login AND b.binding_version>=2))))))
 THEN RAISE EXCEPTION 'DEV070_LOCAL_OWNER_BINDING_CONFLICT'; END IF;
 UPDATE orgmaster_core.workload_principal_bindings SET provider_subject=CASE owner WHEN 'orgmaster' THEN '102985156037283277347' ELSE '117743617824418208171' END,
  db_session_user=CASE owner WHEN 'orgmaster' THEN org_login ELSE platform_login END,binding_version=binding_version+1
 WHERE principal_id IN('principal-workload:orgmaster-managed-identity-lifecycle','principal-workload:platform-principal-lifecycle-invalidation') AND(db_session_user<>CASE owner WHEN 'orgmaster' THEN org_login ELSE platform_login END);
 GET DIAGNOSTICS changed=ROW_COUNT;
 SELECT jsonb_agg(to_jsonb(b) ORDER BY principal_id) INTO after_rows FROM(SELECT principal_id,owner,purpose,provider_issuer,provider_subject,db_session_user,binding_version::text binding_version,enabled FROM orgmaster_core.workload_principal_bindings WHERE principal_id IN('principal-workload:orgmaster-managed-identity-lifecycle','principal-workload:platform-principal-lifecycle-invalidation'))b;
 after_hash:=orgmaster_core.administration_sha256_v1(after_rows);
 receipt:=jsonb_build_object('format','orgmaster.local-administration-bridge-receipt.v1','commandId',p_plan->>'commandId','database',current_database(),'sourceRevision',p_plan->>'sourceRevision','planSha256',plan_hash,'changedBindings',changed,'beforeBindingsSha256',before_hash,'afterBindingsSha256',after_hash);
 INSERT INTO orgmaster_core.administration_local_bridge_receipts_v1(command_id,plan_sha256,response) VALUES((p_plan->>'commandId')::uuid,plan_hash,receipt);
 RETURN receipt;
END; $fn$;
REVOKE ALL ON FUNCTION orgmaster_core.bind_local_administration_workloads_v1(jsonb) FROM PUBLIC;
GRANT USAGE ON SCHEMA orgmaster_contract TO fms_runtime;
GRANT SELECT ON orgmaster_contract.v_fms_principal_admissions_v2,orgmaster_contract.v_fms_authority_v3,orgmaster_contract.v_fms_principal_display_profiles_v1,orgmaster_contract.v_fms_catalog_binding_v1,orgmaster_contract.v_fms_catalog_activation_receipts_v1 TO fms_runtime;
GRANT EXECUTE ON FUNCTION orgmaster_contract.read_fms_authority_v3(),orgmaster_contract.read_fms_principal_display_profiles_v1(),orgmaster_contract.read_fms_administration_initialization_v1(text,text),orgmaster_contract.read_fms_catalog_initialization_activation_v1(text,text,text,text,text,text,text) TO fms_runtime;
COMMIT;
