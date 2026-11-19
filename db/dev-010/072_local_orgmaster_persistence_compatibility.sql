-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core
-- contract-impact: orgmaster.local-administration-owner-bootstrap.v2
-- compatibility: backward-compatible
-- governance-review: ORGMASTER/DEV-070 local-only compatibility ACL
BEGIN;
DO $compatibility$
DECLARE
  plan jsonb := current_setting('orgmaster.dev070.local_owner_plan', true)::jsonb;
  wrapper record;
  legacy oid;
  runtime_login text := plan#>>'{target,sessionUser}';
  legacy_writer oid := to_regprocedure('orgmaster.write_active_persistence_artifacts_v1(jsonb,text,text,text)');
  legacy_outbox_writer oid := to_regprocedure('orgmaster.write_active_persistence_artifacts_with_entitlement_outbox_v1(jsonb,text,text,text,jsonb)');
BEGIN
  IF SESSION_USER <> 'postgres' OR current_user <> 'postgres'
    OR current_database() !~ '^jenfu_local_[a-z0-9_]{3,80}$'
    OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1'
    OR plan#>>'{target,database}' IS DISTINCT FROM current_database()
    OR plan#>>'{target,host}' IS DISTINCT FROM '127.0.0.1'
    OR (plan#>>'{target,port}')::integer IS DISTINCT FROM inet_server_port()
    OR plan#>>'{ownershipBootstrap,compatibility,path}' IS DISTINCT FROM 'db/dev-010/072_local_orgmaster_persistence_compatibility.sql'
    OR COALESCE(plan#>>'{ownershipBootstrap,compatibility,sourceSha256}', '') !~ '^[a-f0-9]{64}$'
    OR NOT EXISTS (
      SELECT 1 FROM orgmaster_core.administration_local_owner_bootstrap_receipts_v1
      WHERE command_id = (plan->>'commandId')::uuid AND plan_sha256 = plan->>'planSha256'
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname = runtime_login AND rolcanlogin
        AND pg_has_role(oid, 'jenfu_orgmaster_runtime', 'USAGE')
    )
  THEN RAISE EXCEPTION 'DEV070_LOCAL_PERSISTENCE_COMPATIBILITY_TARGET_INVALID'; END IF;

  -- Restore only the dependencies of the three wrappers transferred by 071.
  FOR wrapper IN SELECT * FROM (VALUES
    ('read_active_persistence_artifact_v1(text)', 'p_artifact_key'),
    ('read_active_persistence_authority_v1()', ''),
    ('write_active_persistence_artifacts_v1(jsonb,text,text,text)', 'p_changes, p_source_revision, p_updated_by, p_reason_code')
  ) AS signatures(signature, arguments) LOOP
    legacy := to_regprocedure('orgmaster.' || wrapper.signature);
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc
      WHERE oid = to_regprocedure('orgmaster_core.' || wrapper.signature)
        AND proowner = 'jenfu_orgmaster_migrator'::regrole AND prosecdef
        AND proconfig = ARRAY['search_path=pg_catalog']
        AND btrim(prosrc) = 'SELECT * FROM orgmaster.' || split_part(wrapper.signature, '(', 1) || '(' || wrapper.arguments || ');'
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_proc WHERE oid = legacy
        AND proowner IN ('postgres'::regrole, 'jenfu_orgmaster_migrator'::regrole)
        AND prosecdef AND proconfig = ARRAY['search_path=pg_catalog']
    ) THEN RAISE EXCEPTION 'DEV070_LOCAL_PERSISTENCE_COMPATIBILITY_ABI_INVALID'; END IF;
  END LOOP;
  IF legacy_outbox_writer IS NULL THEN
    RAISE EXCEPTION 'DEV070_LOCAL_PERSISTENCE_COMPATIBILITY_ABI_INVALID';
  END IF;

  GRANT USAGE ON SCHEMA orgmaster TO jenfu_orgmaster_migrator;
  GRANT EXECUTE ON FUNCTION
    orgmaster.read_active_persistence_artifact_v1(text),
    orgmaster.read_active_persistence_authority_v1(),
    orgmaster.write_active_persistence_artifacts_v1(jsonb,text,text,text)
  TO jenfu_orgmaster_migrator;

  -- Runtime writes enter through the Principal-fenced orgmaster_core writer.
  REVOKE EXECUTE ON FUNCTION
    orgmaster.write_active_persistence_artifacts_v1(jsonb,text,text,text),
    orgmaster.write_active_persistence_artifacts_with_entitlement_outbox_v1(jsonb,text,text,text,jsonb)
  FROM PUBLIC, jenfu_orgmaster_runtime;
  IF NOT has_schema_privilege('jenfu_orgmaster_migrator', 'orgmaster', 'USAGE')
    OR NOT has_function_privilege('jenfu_orgmaster_migrator', 'orgmaster.read_active_persistence_artifact_v1(text)', 'EXECUTE')
    OR NOT has_function_privilege('jenfu_orgmaster_migrator', 'orgmaster.read_active_persistence_authority_v1()', 'EXECUTE')
    OR NOT has_function_privilege('jenfu_orgmaster_migrator', legacy_writer, 'EXECUTE')
    OR has_function_privilege(runtime_login, legacy_writer, 'EXECUTE')
    OR has_function_privilege(runtime_login, legacy_outbox_writer, 'EXECUTE')
  THEN RAISE EXCEPTION 'DEV070_LOCAL_PERSISTENCE_COMPATIBILITY_READBACK_INVALID'; END IF;
END;
$compatibility$;
COMMIT;
