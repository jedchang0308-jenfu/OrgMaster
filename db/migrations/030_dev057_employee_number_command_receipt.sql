-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core
-- contract-impact: orgmaster internal employee-number command v2; response DTO unchanged
-- compatibility: backward-compatible
-- governance-review: DEV-057 / JENFU DEV-014 QA014-05,06,18,19

BEGIN;
SET LOCAL ROLE jenfu_orgmaster_migrator;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION orgmaster_core.assign_employee_number_v2(p_command_id text, p_employee_id text, p_employee_number text, p_actor text, p_expected_workspace_revision text DEFAULT NULL, p_expected_registry_revision text DEFAULT NULL, p_now timestamptz DEFAULT NULL)
RETURNS TABLE(disposition text, assignment jsonb, document jsonb, revision text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE
  v_employee text;
  v_current orgmaster_core.employee_number_assignments%ROWTYPE;
  v_number text := upper(trim(p_employee_number));
  v_revision bigint;
  v_expected text;
  v_fingerprint text;
  v_receipt orgmaster_core.managed_identity_command_receipts%ROWTYPE;
  v_payload jsonb;
  v_now timestamptz := COALESCE(p_now, clock_timestamp());
BEGIN
  PERFORM 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton = true FOR UPDATE;
  PERFORM 1 FROM orgmaster_core.persistence_authority WHERE singleton = true FOR UPDATE;
  IF p_command_id IS NULL OR char_length(p_command_id) NOT BETWEEN 1 AND 255 OR trim(p_command_id) = '' OR p_actor IS NULL OR char_length(p_actor) NOT BETWEEN 1 AND 255 OR trim(p_actor) = '' THEN RAISE EXCEPTION 'MANAGED_IDENTITY_IDEMPOTENCY_CONFLICT'; END IF;
  SELECT encode(public.digest(convert_to((octet_length('assign_employee_number_v2')::text || ':' || 'assign_employee_number_v2') || (CASE WHEN p_employee_id IS NULL THEN '-:' ELSE octet_length(p_employee_id)::text || ':' || p_employee_id END) || (CASE WHEN v_number IS NULL THEN '-:' ELSE octet_length(v_number)::text || ':' || v_number END) || (CASE WHEN p_actor IS NULL THEN '-:' ELSE octet_length(p_actor)::text || ':' || p_actor END) || (CASE WHEN p_expected_workspace_revision IS NULL THEN '-:' ELSE octet_length(p_expected_workspace_revision)::text || ':' || p_expected_workspace_revision END) || (CASE WHEN p_expected_registry_revision IS NULL THEN '-:' ELSE octet_length(p_expected_registry_revision)::text || ':' || p_expected_registry_revision END), 'UTF8'), 'sha256'), 'hex') INTO v_fingerprint;
  SELECT * INTO v_receipt FROM orgmaster_core.managed_identity_command_receipts WHERE command_id = p_command_id;
  IF FOUND THEN
    IF v_receipt.action <> 'assign_employee_number_v2' OR v_receipt.request_hash_sha256 <> v_fingerprint OR v_receipt.employee_id <> p_employee_id OR v_receipt.identity_record_id IS NOT NULL OR v_receipt.response_payload->>'contractVersion' IS DISTINCT FROM 'orgmaster.employee-number-command.v2' THEN RAISE EXCEPTION 'MANAGED_IDENTITY_IDEMPOTENCY_CONFLICT'; END IF;
    RETURN QUERY SELECT 'replayed', v_receipt.response_payload->'assignment', '{}'::jsonb, v_receipt.response_payload->>'revision';
    RETURN;
  END IF;
  SELECT e.employee_id INTO v_employee
    FROM orgmaster_core.v_current_workspace_employees_v1 e
   WHERE e.employee_id = p_employee_id
     AND e.employee_status IN ('active','inactive')
     AND (p_expected_workspace_revision IS NULL OR e.workspace_revision = p_expected_workspace_revision);
  IF v_employee IS NULL THEN RAISE EXCEPTION 'MANAGED_IDENTITY_REVISION_CONFLICT'; END IF;
  IF v_number IS NULL OR v_number !~ '^JFS[0-9]{4}$' OR v_number = 'JFS0000' THEN RAISE EXCEPTION 'EMPLOYEE_NUMBER_INVALID'; END IF;
  SELECT * INTO v_current FROM orgmaster_core.employee_number_assignments WHERE employee_id = p_employee_id FOR UPDATE;
  v_expected := COALESCE(v_current.revision, 0)::text;
  IF p_expected_registry_revision IS DISTINCT FROM v_expected THEN RAISE EXCEPTION 'MANAGED_IDENTITY_REVISION_CONFLICT'; END IF;
  IF FOUND AND v_current.employee_number = v_number THEN
    INSERT INTO orgmaster_core.managed_identity_command_receipts(command_id, request_hash_sha256, action, employee_id, response_payload, created_at)
    VALUES(p_command_id, v_fingerprint, 'assign_employee_number_v2', p_employee_id, jsonb_build_object('contractVersion','orgmaster.employee-number-command.v2','assignment',to_jsonb(v_current),'revision',v_current.revision::text), v_now);
    RETURN QUERY SELECT 'noop', to_jsonb(v_current), '{}'::jsonb, v_current.revision::text;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM orgmaster_core.employee_number_assignments a WHERE a.employee_number = v_number AND a.employee_id <> p_employee_id)
     OR EXISTS (SELECT 1 FROM orgmaster_core.employee_number_tombstones t WHERE t.employee_number = v_number AND t.first_employee_id <> p_employee_id)
  THEN RAISE EXCEPTION 'EMPLOYEE_NUMBER_CONFLICT'; END IF;
  IF EXISTS (SELECT 1 FROM orgmaster_core.employee_number_tombstones t WHERE t.employee_number = v_number AND t.retired_at IS NOT NULL AND t.first_employee_id = p_employee_id)
  THEN RAISE EXCEPTION 'EMPLOYEE_NUMBER_RETIRED'; END IF;
  v_revision := COALESCE(v_current.revision, 0) + 1;
  INSERT INTO orgmaster_core.employee_number_tombstones(employee_number, first_employee_id, first_assigned_at)
  VALUES (v_number, p_employee_id, v_now)
  ON CONFLICT (employee_number) DO NOTHING;
  IF v_current.employee_number IS NOT NULL AND v_current.employee_number <> v_number THEN
    UPDATE orgmaster_core.employee_number_tombstones SET retired_at = v_now WHERE employee_number = v_current.employee_number AND first_employee_id = p_employee_id;
  END IF;
  INSERT INTO orgmaster_core.employee_number_assignments(employee_id, employee_number, revision, assigned_at, assigned_by, updated_at, updated_by)
  VALUES (p_employee_id, v_number, v_revision, v_now, p_actor, v_now, p_actor)
  ON CONFLICT (employee_id) DO UPDATE SET employee_number = EXCLUDED.employee_number, revision = EXCLUDED.revision, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
  SELECT to_jsonb(a) INTO v_payload FROM orgmaster_core.employee_number_assignments a WHERE a.employee_id = p_employee_id;
  INSERT INTO orgmaster_core.managed_identity_audit_events(command_id, action, actor, employee_id, result, reason_code, before_hash, after_hash, occurred_at)
  VALUES (p_command_id, CASE WHEN v_current.employee_id IS NULL THEN 'employee_number_assigned' ELSE 'employee_number_changed' END, p_actor, p_employee_id, 'applied', 'employee_number_command', CASE WHEN v_current.employee_id IS NULL THEN NULL ELSE encode(public.digest(to_jsonb(v_current)::text, 'sha256'),'hex') END, encode(public.digest(v_payload::text,'sha256'),'hex'), v_now);
  INSERT INTO orgmaster_core.managed_identity_command_receipts(command_id, request_hash_sha256, action, employee_id, response_payload, created_at)
  VALUES(p_command_id, v_fingerprint, 'assign_employee_number_v2', p_employee_id, jsonb_build_object('contractVersion','orgmaster.employee-number-command.v2','assignment',v_payload,'revision',v_revision::text), v_now);
  RETURN QUERY SELECT 'applied', v_payload, '{}'::jsonb, v_revision::text;
END;
$fn$;

ALTER FUNCTION orgmaster_core.assign_employee_number_v2(text,text,text,text,text,text,timestamptz) OWNER TO jenfu_orgmaster_migrator;
REVOKE ALL ON FUNCTION orgmaster_core.assign_employee_number_v2(text,text,text,text,text,text,timestamptz) FROM PUBLIC, jenfu_platform_runtime, jenfu_ai_pdm_runtime;
GRANT EXECUTE ON FUNCTION orgmaster_core.assign_employee_number_v2(text,text,text,text,text,text,timestamptz) TO jenfu_orgmaster_runtime;
COMMIT;
