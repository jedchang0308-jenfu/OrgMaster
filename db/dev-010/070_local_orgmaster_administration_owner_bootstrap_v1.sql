-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core
-- contract-impact: orgmaster.local-administration-owner-bootstrap.v1
-- compatibility: new-version
-- governance-review: ORGMASTER/DEV-070 exact three-function local owner repair
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $target$ BEGIN
 IF SESSION_USER<>'postgres' OR current_user<>'postgres' OR current_database() !~ '^jenfu_local_[a-z0-9_]{3,80}$'
 OR COALESCE(host(inet_server_addr()),'')<>'127.0.0.1' OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='jenfu_orgmaster_migrator' AND NOT(rolcanlogin OR rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls))
 THEN RAISE EXCEPTION 'DEV070_LOCAL_BOOTSTRAP_TARGET_INVALID'; END IF;
END; $target$;
SET LOCAL ROLE jenfu_orgmaster_migrator;
CREATE TABLE IF NOT EXISTS orgmaster_core.administration_local_owner_bootstrap_receipts_v1(
 command_id uuid PRIMARY KEY,plan_sha256 text NOT NULL CHECK(plan_sha256~'^[a-f0-9]{64}$'),source_sha256 text NOT NULL CHECK(source_sha256~'^[a-f0-9]{64}$'),
 before_functions jsonb NOT NULL,after_functions jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
DO $shape$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid='orgmaster_core.administration_local_owner_bootstrap_receipts_v1'::regclass AND c.relkind='r' AND pg_get_userbyid(c.relowner)='jenfu_orgmaster_migrator')
 OR (SELECT array_agg(column_name||':'||data_type||':'||is_nullable ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='orgmaster_core' AND table_name='administration_local_owner_bootstrap_receipts_v1')
 IS DISTINCT FROM ARRAY['command_id:uuid:NO','plan_sha256:text:NO','source_sha256:text:NO','before_functions:jsonb:NO','after_functions:jsonb:NO','created_at:timestamp with time zone:NO']::text[]
 THEN RAISE EXCEPTION 'DEV070_LOCAL_BOOTSTRAP_RECEIPT_SHAPE_INVALID'; END IF;
END; $shape$;
REVOKE ALL ON orgmaster_core.administration_local_owner_bootstrap_receipts_v1 FROM PUBLIC,jenfu_orgmaster_runtime,jenfu_platform_runtime,jenfu_ai_pdm_runtime,fms_runtime;
DO $immutable$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='orgmaster_core.administration_local_owner_bootstrap_receipts_v1'::regclass AND tgname='administration_local_owner_bootstrap_immutable' AND tgfoid<>'orgmaster_core.reject_lifecycle_payload_mutation_v2()'::regprocedure) THEN RAISE EXCEPTION 'DEV070_LOCAL_BOOTSTRAP_RECEIPT_TRIGGER_INVALID'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='orgmaster_core.administration_local_owner_bootstrap_receipts_v1'::regclass AND tgname='administration_local_owner_bootstrap_immutable') THEN
  CREATE TRIGGER administration_local_owner_bootstrap_immutable BEFORE UPDATE OR DELETE ON orgmaster_core.administration_local_owner_bootstrap_receipts_v1 FOR EACH ROW EXECUTE FUNCTION orgmaster_core.reject_lifecycle_payload_mutation_v2();
 END IF;
END; $immutable$;
RESET ROLE;
DO $bootstrap$
DECLARE plan jsonb;expected jsonb;actual jsonb;after_rows jsonb;item record;row_before jsonb;row_after jsonb;prior record;object_count integer;
BEGIN
 plan:=current_setting('orgmaster.dev070.local_owner_plan',true)::jsonb;
 IF plan->>'format' IS DISTINCT FROM 'orgmaster.local-administration-bridge-plan.v1'
 OR plan#>>'{target,database}' IS DISTINCT FROM current_database() OR plan#>>'{target,host}' IS DISTINCT FROM '127.0.0.1'
 OR (plan#>>'{target,port}')::integer IS DISTINCT FROM inet_server_port()
 OR plan#>>'{ownerProof,email}' IS DISTINCT FROM 'dev010-orgmaster-migrator@jenfu-platform-nonprod.iam.gserviceaccount.com'
 OR plan#>>'{ownerProof,subject}' IS DISTINCT FROM '109035753048386897825'
 OR COALESCE(plan->>'planSha256','') !~ '^[a-f0-9]{64}$'
 OR COALESCE(plan#>>'{ownershipBootstrap,sourceSha256}','') !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'DEV070_LOCAL_BOOTSTRAP_PLAN_INVALID'; END IF;
 expected:=plan->'beforeOwnership';
 SELECT jsonb_agg(to_jsonb(snapshot) ORDER BY signature) INTO actual FROM (
 SELECT p.oid::regprocedure::text signature,pg_get_userbyid(p.proowner) owner,pg_get_functiondef(p.oid) definition,p.prosrc body,
 encode(public.digest(convert_to(pg_get_functiondef(p.oid),'UTF8'),'sha256'),'hex') AS "definitionSha256",encode(public.digest(convert_to(p.prosrc,'UTF8'),'sha256'),'hex') AS "bodySha256",
 p.prosecdef AS "securityDefiner",COALESCE(p.proconfig,ARRAY[]::text[]) configuration,
 (SELECT COALESCE(jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantee,a.privilege_type,a.grantor),'[]'::jsonb) FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner)))a) acl
 FROM pg_proc p WHERE p.oid IN(to_regprocedure('orgmaster_core.read_active_persistence_artifact_v1(text)'),to_regprocedure('orgmaster_core.read_active_persistence_authority_v1()'),to_regprocedure('orgmaster_core.write_active_persistence_artifacts_v1(jsonb,text,text,text)')))snapshot;
 IF jsonb_array_length(expected)<>3 OR actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'DEV070_LOCAL_BOOTSTRAP_CAS_CONFLICT'; END IF;
 SELECT * INTO prior FROM orgmaster_core.administration_local_owner_bootstrap_receipts_v1 WHERE command_id=(plan->>'commandId')::uuid;
 IF FOUND THEN RAISE EXCEPTION 'DEV070_LOCAL_BOOTSTRAP_RECEIPT_REQUIRES_STATUS'; END IF;
 FOR item IN SELECT * FROM(VALUES
 ('orgmaster_core.read_active_persistence_artifact_v1(text)'),('orgmaster_core.read_active_persistence_authority_v1()'),('orgmaster_core.write_active_persistence_artifacts_v1(jsonb,text,text,text)'))fixed(signature) LOOP
  SELECT value INTO STRICT row_before FROM jsonb_array_elements(expected) WHERE value->>'signature'=item.signature;
  IF row_before->>'owner' NOT IN('postgres','jenfu_orgmaster_migrator') THEN RAISE EXCEPTION 'DEV070_LOCAL_BOOTSTRAP_OWNER_INVALID'; END IF;
  IF row_before->>'owner'='postgres' THEN EXECUTE format('ALTER FUNCTION %s OWNER TO jenfu_orgmaster_migrator',item.signature); END IF;
 END LOOP;
 SELECT jsonb_agg(to_jsonb(snapshot) ORDER BY signature) INTO after_rows FROM (
 SELECT p.oid::regprocedure::text signature,pg_get_userbyid(p.proowner) owner,pg_get_functiondef(p.oid) definition,p.prosrc body,
 encode(public.digest(convert_to(pg_get_functiondef(p.oid),'UTF8'),'sha256'),'hex') AS "definitionSha256",encode(public.digest(convert_to(p.prosrc,'UTF8'),'sha256'),'hex') AS "bodySha256",
 p.prosecdef AS "securityDefiner",COALESCE(p.proconfig,ARRAY[]::text[]) configuration,
 (SELECT COALESCE(jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantee,a.privilege_type,a.grantor),'[]'::jsonb) FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner)))a) acl
 FROM pg_proc p WHERE p.oid IN(to_regprocedure('orgmaster_core.read_active_persistence_artifact_v1(text)'),to_regprocedure('orgmaster_core.read_active_persistence_authority_v1()'),to_regprocedure('orgmaster_core.write_active_persistence_artifacts_v1(jsonb,text,text,text)')))snapshot;
 FOR row_after IN SELECT value FROM jsonb_array_elements(after_rows) LOOP
  SELECT value INTO STRICT row_before FROM jsonb_array_elements(expected) WHERE value->>'signature'=row_after->>'signature';
  IF row_after->>'owner'<>'jenfu_orgmaster_migrator' OR row_after-'owner'-'acl' IS DISTINCT FROM row_before-'owner'-'acl'
   OR jsonb_array_length(row_after->'acl')<>jsonb_array_length(row_before->'acl')
   OR NOT((row_after->'acl') @> replace((row_before->'acl')::text,'"postgres"','"jenfu_orgmaster_migrator"')::jsonb)
   OR NOT(replace((row_before->'acl')::text,'"postgres"','"jenfu_orgmaster_migrator"')::jsonb @> (row_after->'acl'))
  THEN RAISE EXCEPTION 'DEV070_LOCAL_BOOTSTRAP_READBACK_INVALID'; END IF;
 END LOOP;
 INSERT INTO orgmaster_core.administration_local_owner_bootstrap_receipts_v1(command_id,plan_sha256,source_sha256,before_functions,after_functions)
 VALUES((plan->>'commandId')::uuid,plan->>'planSha256',plan#>>'{ownershipBootstrap,sourceSha256}',expected,after_rows);
END; $bootstrap$;
COMMIT;
