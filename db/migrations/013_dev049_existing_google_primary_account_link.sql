-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: organization.active-principal.v1 managed admission behavior is preserved while pending identity first-login becomes reachable
-- compatibility: backward-compatible
-- governance-review: DEV-049

BEGIN;
SET LOCAL ROLE jenfu_orgmaster_migrator;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- DEV-047 candidate revisions used a different meaning.  Permanent mappings
-- are preserved; only unconsumed ephemeral capabilities are invalidated.
UPDATE orgmaster_core.managed_identity_candidate_leases
   SET invalidated_at = clock_timestamp()
 WHERE consumed_at IS NULL
   AND invalidated_at IS NULL;

CREATE OR REPLACE FUNCTION orgmaster_core.read_employee_managed_identity_v1(p_employee_id text)
RETURNS TABLE(employee_id text, employee_status text, employee_number text, identity_record_id uuid, identity_state text, primary_email text, directory_state text, freshness text, registry_revision bigint, admission_enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
  SELECT e.employee_id, e.employee_status, a.employee_number, i.identity_record_id,
         COALESCE(i.link_state, 'not_linked'), i.last_verified_primary_email, o.directory_state, o.freshness,
         COALESCE(a.revision, 0), aa.admission_enabled
    FROM orgmaster_core.v_current_workspace_employees_v1 e
    LEFT JOIN orgmaster_core.employee_number_assignments a ON a.employee_id = e.employee_id
    LEFT JOIN orgmaster_core.managed_daily_identities i ON i.employee_id = e.employee_id
    LEFT JOIN orgmaster_core.managed_identity_observations o ON o.identity_record_id = i.identity_record_id
    CROSS JOIN orgmaster_core.managed_identity_admission_authority aa
   WHERE e.employee_id = p_employee_id
     AND aa.singleton = true;
$fn$;

CREATE OR REPLACE FUNCTION orgmaster_core.assign_employee_number_v1(p_employee_id text, p_employee_number text, p_actor text, p_expected_workspace_revision text DEFAULT NULL, p_expected_registry_revision text DEFAULT NULL, p_now timestamptz DEFAULT clock_timestamp())
RETURNS TABLE(disposition text, assignment jsonb, document jsonb, revision text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE
  v_employee text;
  v_current orgmaster_core.employee_number_assignments%ROWTYPE;
  v_number text := upper(trim(p_employee_number));
  v_revision bigint;
  v_expected text;
  v_hash text;
BEGIN
  PERFORM 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton = true FOR UPDATE;
  SELECT e.employee_id INTO v_employee
    FROM orgmaster_core.v_current_workspace_employees_v1 e
   WHERE e.employee_id = p_employee_id
     AND e.employee_status IN ('active','inactive')
     AND (p_expected_workspace_revision IS NULL OR e.workspace_revision = p_expected_workspace_revision);
  IF v_employee IS NULL THEN RAISE EXCEPTION 'MANAGED_IDENTITY_REVISION_CONFLICT'; END IF;
  IF v_number !~ '^JFS[0-9]{4}$' OR v_number = 'JFS0000' THEN RAISE EXCEPTION 'EMPLOYEE_NUMBER_INVALID'; END IF;
  SELECT * INTO v_current FROM orgmaster_core.employee_number_assignments WHERE employee_id = p_employee_id FOR UPDATE;
  v_expected := COALESCE(v_current.revision, 0)::text;
  IF p_expected_registry_revision IS DISTINCT FROM v_expected THEN RAISE EXCEPTION 'MANAGED_IDENTITY_REVISION_CONFLICT'; END IF;
  IF FOUND AND v_current.employee_number = v_number THEN
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
  VALUES (v_number, p_employee_id, p_now)
  ON CONFLICT (employee_number) DO NOTHING;
  IF v_current.employee_number IS NOT NULL AND v_current.employee_number <> v_number THEN
    UPDATE orgmaster_core.employee_number_tombstones SET retired_at = p_now WHERE employee_number = v_current.employee_number AND first_employee_id = p_employee_id;
  END IF;
  INSERT INTO orgmaster_core.employee_number_assignments(employee_id, employee_number, revision, assigned_at, assigned_by, updated_at, updated_by)
  VALUES (p_employee_id, v_number, v_revision, p_now, p_actor, p_now, p_actor)
  ON CONFLICT (employee_id) DO UPDATE SET employee_number = EXCLUDED.employee_number, revision = EXCLUDED.revision, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
  SELECT encode(public.digest(convert_to(p_employee_id, 'UTF8') || decode('00', 'hex') || convert_to(v_number, 'UTF8') || decode('00', 'hex') || convert_to(p_actor, 'UTF8'), 'sha256'), 'hex') INTO v_hash;
  INSERT INTO orgmaster_core.managed_identity_audit_events(action, actor, employee_id, result, reason_code, after_hash, occurred_at)
  VALUES ('employee_number_assigned', p_actor, p_employee_id, 'applied', 'employee_number_assignment', v_hash, p_now);
  RETURN QUERY SELECT 'applied', to_jsonb(a), '{}'::jsonb, a.revision::text FROM orgmaster_core.employee_number_assignments a WHERE a.employee_id = p_employee_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION orgmaster_core.lease_managed_identity_candidate_v1(p_employee_id text, p_employee_number text, p_expected_primary_email text, p_customer_id text, p_directory_user_id text, p_primary_email text, p_source_etag text, p_workspace_revision text, p_registry_revision text, p_actor text)
RETURNS TABLE(lease_id uuid, candidate_token text, expires_at timestamptz, directory_customer_id text, directory_user_id text, primary_email text, source_etag text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE
  v_token text := encode(public.gen_random_bytes(32), 'hex');
  v_id uuid := public.gen_random_uuid();
  v_expires timestamptz := clock_timestamp() + interval '5 minutes';
  v_assignment orgmaster_core.employee_number_assignments%ROWTYPE;
  v_actor_hash text := encode(public.digest(convert_to(p_actor, 'UTF8'), 'sha256'), 'hex');
BEGIN
  PERFORM 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton = true FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM orgmaster_core.v_current_workspace_employees_v1 e WHERE e.employee_id = p_employee_id AND e.employee_status = 'active' AND e.workspace_revision IS NOT DISTINCT FROM p_workspace_revision) THEN RAISE EXCEPTION 'MANAGED_IDENTITY_REVISION_CONFLICT'; END IF;
  SELECT * INTO v_assignment FROM orgmaster_core.employee_number_assignments a WHERE a.employee_id = p_employee_id FOR UPDATE;
  IF NOT FOUND OR v_assignment.employee_number <> upper(trim(p_employee_number)) OR v_assignment.revision::text <> p_registry_revision THEN RAISE EXCEPTION 'MANAGED_IDENTITY_REVISION_CONFLICT'; END IF;
  IF lower(trim(p_primary_email)) <> lower(trim(p_expected_primary_email)) OR p_customer_id = '' OR p_directory_user_id = '' THEN RAISE EXCEPTION 'DIRECTORY_CANDIDATE_MISMATCH'; END IF;
  IF EXISTS (SELECT 1 FROM orgmaster_core.managed_daily_identities d WHERE d.employee_id = p_employee_id OR (d.directory_customer_id = p_customer_id AND d.directory_user_id = p_directory_user_id)) THEN RAISE EXCEPTION 'MANAGED_IDENTITY_IDENTITY_CONFLICT'; END IF;
  UPDATE orgmaster_core.managed_identity_candidate_leases
     SET invalidated_at = clock_timestamp()
   WHERE employee_id = p_employee_id
     AND actor_binding_sha256 = v_actor_hash
     AND invalidated_at IS NULL
     AND consumed_at IS NULL;
  INSERT INTO orgmaster_core.managed_identity_candidate_leases(lease_id, token_hash_sha256, actor_binding_sha256, employee_id, employee_number, expected_primary_email, directory_customer_id, directory_user_id, primary_email, source_etag, workspace_revision, registry_revision, expires_at)
  VALUES (v_id, encode(public.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'), v_actor_hash, p_employee_id, v_assignment.employee_number, lower(trim(p_expected_primary_email)), p_customer_id, p_directory_user_id, lower(trim(p_primary_email)), p_source_etag, p_workspace_revision, p_registry_revision, v_expires);
  RETURN QUERY SELECT v_id, v_token, v_expires, p_customer_id, p_directory_user_id, lower(trim(p_primary_email)), p_source_etag;
END;
$fn$;

CREATE OR REPLACE FUNCTION orgmaster_core.read_managed_identity_candidate_v1(p_command_id text, p_employee_id text, p_candidate_token text, p_expected_workspace_revision text, p_expected_registry_revision text, p_actor text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE
  v_fingerprint text;
  v_receipt orgmaster_core.managed_identity_command_receipts%ROWTYPE;
  v_lease orgmaster_core.managed_identity_candidate_leases%ROWTYPE;
  v_assignment orgmaster_core.employee_number_assignments%ROWTYPE;
BEGIN
  v_fingerprint := encode(public.digest(convert_to(array_to_string(ARRAY[
    encode(convert_to('dev049.confirm.v1', 'UTF8'), 'hex'),
    encode(convert_to(p_actor, 'UTF8'), 'hex'),
    encode(convert_to(p_employee_id, 'UTF8'), 'hex'),
    encode(convert_to(encode(public.digest(convert_to(p_candidate_token, 'UTF8'), 'sha256'), 'hex'), 'UTF8'), 'hex'),
    CASE WHEN p_expected_workspace_revision IS NULL THEN '-' ELSE encode(convert_to(p_expected_workspace_revision, 'UTF8'), 'hex') END,
    encode(convert_to(p_expected_registry_revision, 'UTF8'), 'hex')
  ], '|'), 'UTF8'), 'sha256'), 'hex');
  SELECT * INTO v_receipt FROM orgmaster_core.managed_identity_command_receipts WHERE command_id = p_command_id;
  IF FOUND THEN
    IF v_receipt.action <> 'confirm_managed_identity_link_v1' OR v_receipt.request_hash_sha256 <> v_fingerprint OR v_receipt.employee_id <> p_employee_id OR v_receipt.response_payload->>'contractVersion' <> 'dev049.confirm.v1' OR v_receipt.identity_record_id::text IS DISTINCT FROM v_receipt.response_payload->>'identityRecordId' THEN RAISE EXCEPTION 'MANAGED_IDENTITY_IDEMPOTENCY_CONFLICT'; END IF;
    RETURN jsonb_build_object('kind','replayed','identityRecordId',v_receipt.identity_record_id::text);
  END IF;
  SELECT * INTO v_lease FROM orgmaster_core.managed_identity_candidate_leases l WHERE l.employee_id = p_employee_id AND l.token_hash_sha256 = encode(public.digest(convert_to(p_candidate_token, 'UTF8'), 'sha256'), 'hex');
  IF NOT FOUND OR v_lease.actor_binding_sha256 <> encode(public.digest(convert_to(p_actor, 'UTF8'), 'sha256'), 'hex') OR v_lease.consumed_at IS NOT NULL OR v_lease.invalidated_at IS NOT NULL OR v_lease.expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'MANAGED_IDENTITY_CANDIDATE_INVALID'; END IF;
  IF v_lease.workspace_revision IS DISTINCT FROM p_expected_workspace_revision OR v_lease.registry_revision IS DISTINCT FROM p_expected_registry_revision THEN RAISE EXCEPTION 'MANAGED_IDENTITY_REVISION_CONFLICT'; END IF;
  IF NOT EXISTS (SELECT 1 FROM orgmaster_core.v_current_workspace_employees_v1 e WHERE e.employee_id = p_employee_id AND e.employee_status = 'active' AND e.workspace_revision IS NOT DISTINCT FROM p_expected_workspace_revision) THEN RAISE EXCEPTION 'MANAGED_IDENTITY_REVISION_CONFLICT'; END IF;
  SELECT * INTO v_assignment FROM orgmaster_core.employee_number_assignments a WHERE a.employee_id = p_employee_id;
  IF NOT FOUND OR v_assignment.employee_number <> v_lease.employee_number OR v_assignment.revision::text <> p_expected_registry_revision THEN RAISE EXCEPTION 'MANAGED_IDENTITY_REVISION_CONFLICT'; END IF;
  IF EXISTS (SELECT 1 FROM orgmaster_core.managed_daily_identities d WHERE d.employee_id = p_employee_id) THEN RAISE EXCEPTION 'MANAGED_IDENTITY_IDENTITY_CONFLICT'; END IF;
  RETURN jsonb_build_object('kind','candidate','snapshot',jsonb_build_object(
    'employeeId',p_employee_id,'employeeNumber',v_lease.employee_number,'workspaceRevision',v_lease.workspace_revision,'registryRevision',v_lease.registry_revision,
    'directoryCustomerId',v_lease.directory_customer_id,'directoryUserId',v_lease.directory_user_id,'primaryEmail',v_lease.primary_email,'sourceEtag',v_lease.source_etag,'expiresAt',v_lease.expires_at
  ));
END;
$fn$;

CREATE OR REPLACE FUNCTION orgmaster_core.confirm_managed_identity_link_v1(p_command_id text, p_employee_id text, p_candidate_token text, p_expected_workspace_revision text, p_expected_registry_revision text, p_actor text)
RETURNS TABLE(identity_record_id uuid, employee_id text, principal_id text, link_state text, revision text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE
  v_fingerprint text;
  v_receipt orgmaster_core.managed_identity_command_receipts%ROWTYPE;
  v_lease orgmaster_core.managed_identity_candidate_leases%ROWTYPE;
  v_assignment orgmaster_core.employee_number_assignments%ROWTYPE;
  v_id uuid;
  v_principal text;
BEGIN
  PERFORM 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton = true FOR UPDATE;
  v_fingerprint := encode(public.digest(convert_to(array_to_string(ARRAY[
    encode(convert_to('dev049.confirm.v1', 'UTF8'), 'hex'), encode(convert_to(p_actor, 'UTF8'), 'hex'), encode(convert_to(p_employee_id, 'UTF8'), 'hex'),
    encode(convert_to(encode(public.digest(convert_to(p_candidate_token, 'UTF8'), 'sha256'), 'hex'), 'UTF8'), 'hex'),
    CASE WHEN p_expected_workspace_revision IS NULL THEN '-' ELSE encode(convert_to(p_expected_workspace_revision, 'UTF8'), 'hex') END,
    encode(convert_to(p_expected_registry_revision, 'UTF8'), 'hex')
  ], '|'), 'UTF8'), 'sha256'), 'hex');
  SELECT * INTO v_receipt FROM orgmaster_core.managed_identity_command_receipts WHERE command_id = p_command_id FOR UPDATE;
  IF FOUND THEN
    IF v_receipt.action <> 'confirm_managed_identity_link_v1' OR v_receipt.request_hash_sha256 <> v_fingerprint OR v_receipt.employee_id <> p_employee_id OR v_receipt.response_payload->>'contractVersion' <> 'dev049.confirm.v1' OR v_receipt.identity_record_id::text IS DISTINCT FROM v_receipt.response_payload->>'identityRecordId' THEN RAISE EXCEPTION 'MANAGED_IDENTITY_IDEMPOTENCY_CONFLICT'; END IF;
    RETURN QUERY SELECT d.identity_record_id, d.employee_id, d.principal_id, d.link_state, a.revision::text FROM orgmaster_core.managed_daily_identities d JOIN orgmaster_core.employee_number_assignments a ON a.employee_id = d.employee_id WHERE d.identity_record_id = v_receipt.identity_record_id AND d.employee_id = p_employee_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'MANAGED_IDENTITY_IDEMPOTENCY_CONFLICT'; END IF;
    RETURN;
  END IF;
  SELECT * INTO v_lease FROM orgmaster_core.managed_identity_candidate_leases l WHERE l.employee_id = p_employee_id AND l.token_hash_sha256 = encode(public.digest(convert_to(p_candidate_token, 'UTF8'), 'sha256'), 'hex') FOR UPDATE;
  IF NOT FOUND OR v_lease.actor_binding_sha256 <> encode(public.digest(convert_to(p_actor, 'UTF8'), 'sha256'), 'hex') OR v_lease.consumed_at IS NOT NULL OR v_lease.invalidated_at IS NOT NULL OR v_lease.expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'MANAGED_IDENTITY_CANDIDATE_INVALID'; END IF;
  IF v_lease.workspace_revision IS DISTINCT FROM p_expected_workspace_revision OR v_lease.registry_revision IS DISTINCT FROM p_expected_registry_revision THEN RAISE EXCEPTION 'MANAGED_IDENTITY_REVISION_CONFLICT'; END IF;
  IF NOT EXISTS (SELECT 1 FROM orgmaster_core.v_current_workspace_employees_v1 e WHERE e.employee_id = p_employee_id AND e.employee_status = 'active' AND e.workspace_revision IS NOT DISTINCT FROM p_expected_workspace_revision) THEN RAISE EXCEPTION 'MANAGED_IDENTITY_REVISION_CONFLICT'; END IF;
  SELECT * INTO v_assignment FROM orgmaster_core.employee_number_assignments a WHERE a.employee_id = p_employee_id FOR UPDATE;
  IF NOT FOUND OR v_assignment.employee_number <> v_lease.employee_number OR v_assignment.revision::text <> p_expected_registry_revision THEN RAISE EXCEPTION 'MANAGED_IDENTITY_REVISION_CONFLICT'; END IF;
  IF EXISTS (SELECT 1 FROM orgmaster_core.managed_daily_identities d WHERE d.employee_id = p_employee_id OR (d.directory_customer_id = v_lease.directory_customer_id AND d.directory_user_id = v_lease.directory_user_id)) THEN RAISE EXCEPTION 'MANAGED_IDENTITY_IDENTITY_CONFLICT'; END IF;
  v_id := public.gen_random_uuid();
  v_principal := 'principal-managed:' || v_id::text;
  INSERT INTO orgmaster_core.managed_daily_identities(identity_record_id, employee_id, principal_id, directory_customer_id, directory_user_id, last_verified_primary_email, link_state, created_by, updated_by)
  VALUES (v_id, p_employee_id, v_principal, v_lease.directory_customer_id, v_lease.directory_user_id, v_lease.primary_email, 'directory_linked_pending_auth', p_actor, p_actor);
  INSERT INTO orgmaster_core.managed_identity_observations(identity_record_id, primary_email, directory_state, source_etag, adapter_outcome, trusted_observed_at, last_attempt_at, freshness)
  VALUES (v_id, v_lease.primary_email, 'present', v_lease.source_etag, 'success', clock_timestamp(), clock_timestamp(), 'fresh');
  UPDATE orgmaster_core.managed_identity_candidate_leases SET consumed_at = clock_timestamp() WHERE lease_id = v_lease.lease_id;
  INSERT INTO orgmaster_core.managed_identity_command_receipts(command_id, request_hash_sha256, action, employee_id, identity_record_id, response_payload)
  VALUES (p_command_id, v_fingerprint, 'confirm_managed_identity_link_v1', p_employee_id, v_id, jsonb_build_object('contractVersion','dev049.confirm.v1','identityRecordId',v_id::text,'employeeId',p_employee_id));
  INSERT INTO orgmaster_core.managed_identity_audit_events(command_id, action, actor, employee_id, identity_record_id, result, reason_code, details)
  VALUES (p_command_id, 'managed_identity_link_confirmed', p_actor, p_employee_id, v_id, 'applied', 'directory_candidate_confirmed', jsonb_build_object('directoryKeySha256', encode(public.digest(convert_to(v_lease.directory_customer_id, 'UTF8') || decode('00', 'hex') || convert_to(v_lease.directory_user_id, 'UTF8'), 'sha256'), 'hex')));
  RETURN QUERY SELECT v_id, p_employee_id, v_principal, 'directory_linked_pending_auth', v_assignment.revision::text;
END;
$fn$;

CREATE OR REPLACE FUNCTION orgmaster_core.resolve_managed_identity_alias_v1(p_employee_number text)
RETURNS TABLE(employee_id text, principal_id text, login_hint text, identity_record_id uuid, directory_customer_id text, directory_user_id text, link_state text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
  SELECT a.employee_id, i.principal_id, i.last_verified_primary_email, i.identity_record_id, i.directory_customer_id, i.directory_user_id, i.link_state
    FROM orgmaster_core.employee_number_assignments a
    JOIN orgmaster_core.managed_daily_identities i ON i.employee_id = a.employee_id
    JOIN orgmaster_core.managed_identity_observations o ON o.identity_record_id = i.identity_record_id AND o.directory_state = 'present' AND lower(o.primary_email) = lower(i.last_verified_primary_email)
    JOIN orgmaster_core.managed_identity_admission_authority aa ON aa.singleton = true AND aa.admission_enabled
    JOIN orgmaster_core.v_current_workspace_employees_v1 e ON e.employee_id = a.employee_id AND e.employee_status = 'active'
   WHERE a.employee_number = upper(trim(p_employee_number))
     AND i.link_state IN ('directory_linked_pending_auth','active')
     AND NOT EXISTS (SELECT 1 FROM orgmaster_core.managed_identity_lifecycle_outbox l WHERE l.employee_id = a.employee_id AND l.status <> 'completed');
$fn$;

CREATE OR REPLACE FUNCTION orgmaster_core.bind_managed_identity_auth_v1(p_employee_id text, p_issuer text, p_subject text, p_email text, p_command_id text DEFAULT NULL)
RETURNS TABLE(identity_record_id uuid, principal_id text, employee_id text, link_state text, admission_revision bigint)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE
  v_identity orgmaster_core.managed_daily_identities%ROWTYPE;
  v_admission bigint;
BEGIN
  PERFORM 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton = true FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton = true AND admission_enabled) THEN RAISE EXCEPTION 'MANAGED_IDENTITY_ADMISSION_DISABLED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM orgmaster_core.v_current_workspace_employees_v1 e WHERE e.employee_id = p_employee_id AND e.employee_status = 'active') THEN RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND'; END IF;
  SELECT * INTO v_identity FROM orgmaster_core.managed_daily_identities d WHERE d.employee_id = p_employee_id FOR UPDATE;
  IF NOT FOUND OR v_identity.link_state = 'conflict' THEN RAISE EXCEPTION 'MANAGED_IDENTITY_CANDIDATE_INVALID'; END IF;
  IF lower(trim(p_email)) <> lower(v_identity.last_verified_primary_email) THEN RAISE EXCEPTION 'MANAGED_IDENTITY_IDENTITY_CONFLICT'; END IF;
  IF NOT EXISTS (SELECT 1 FROM orgmaster_core.managed_identity_observations o WHERE o.identity_record_id = v_identity.identity_record_id AND o.directory_state = 'present' AND lower(o.primary_email) = lower(trim(p_email))) THEN RAISE EXCEPTION 'MANAGED_IDENTITY_IDENTITY_CONFLICT'; END IF;
  IF EXISTS (SELECT 1 FROM orgmaster_core.managed_identity_lifecycle_outbox o WHERE o.employee_id = p_employee_id AND o.status <> 'completed') THEN RAISE EXCEPTION 'INVALIDATION_PENDING'; END IF;
  IF v_identity.link_state = 'active' AND v_identity.auth_issuer = p_issuer AND v_identity.auth_subject = p_subject THEN
    RETURN QUERY SELECT v_identity.identity_record_id, v_identity.principal_id, v_identity.employee_id, v_identity.link_state, v_identity.admission_revision;
    RETURN;
  END IF;
  IF v_identity.auth_issuer IS NOT NULL OR v_identity.auth_subject IS NOT NULL THEN RAISE EXCEPTION 'MANAGED_IDENTITY_IDENTITY_CONFLICT'; END IF;
  IF EXISTS (SELECT 1 FROM orgmaster_core.principal_identity_reservations r WHERE r.principal_issuer = p_issuer AND r.principal_subject = p_subject)
     OR EXISTS (SELECT 1 FROM orgmaster_core.managed_daily_identities d WHERE d.auth_issuer = p_issuer AND d.auth_subject = p_subject)
     OR EXISTS (SELECT 1 FROM orgmaster_contract.v_active_principal_mappings_v1 m WHERE m.principal_issuer = p_issuer AND m.principal_subject = p_subject)
  THEN RAISE EXCEPTION 'MANAGED_IDENTITY_IDENTITY_CONFLICT'; END IF;
  v_admission := nextval('orgmaster_core.managed_identity_mapping_version_seq');
  UPDATE orgmaster_core.managed_daily_identities d
     SET auth_issuer = p_issuer, auth_subject = p_subject, bound_at = clock_timestamp(), link_state = 'active', revision = d.revision + 1,
         admission_revision = v_admission, admission_changed_at = clock_timestamp(), updated_at = clock_timestamp(), updated_by = p_issuer || ':' || p_subject
   WHERE d.identity_record_id = v_identity.identity_record_id;
  INSERT INTO orgmaster_core.principal_identity_reservations(principal_issuer, principal_subject, employee_id, first_seen_at, source_kind, source_revision)
  VALUES (p_issuer, p_subject, p_employee_id, clock_timestamp(), 'managed', 'managed-bind');
  INSERT INTO orgmaster_core.managed_identity_audit_events(command_id, action, actor, employee_id, identity_record_id, result, reason_code)
  VALUES (p_command_id, 'managed_identity_auth_bound', p_issuer || ':' || p_subject, p_employee_id, v_identity.identity_record_id, 'applied', 'first_login_bridge');
  RETURN QUERY SELECT d.identity_record_id, d.principal_id, d.employee_id, d.link_state, d.admission_revision FROM orgmaster_core.managed_daily_identities d WHERE d.identity_record_id = v_identity.identity_record_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION orgmaster_core.resolve_managed_login_alias_v1(p_employee_number text)
RETURNS TABLE(employee_id text, principal_id text, employee_number text, directory_customer_id text, directory_user_id text, identity_record_id uuid, identity_revision text, registry_revision text, link_state text, auth_issuer text, auth_subject text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
  SELECT i.employee_id, i.principal_id, a.employee_number, i.directory_customer_id, i.directory_user_id,
         i.identity_record_id, i.revision::text, a.revision::text, i.link_state, i.auth_issuer, i.auth_subject
    FROM orgmaster_core.employee_number_assignments a
    JOIN orgmaster_core.managed_daily_identities i ON i.employee_id = a.employee_id
    JOIN orgmaster_core.managed_identity_observations o ON o.identity_record_id = i.identity_record_id
    JOIN orgmaster_core.v_current_workspace_employees_v1 e ON e.employee_id = i.employee_id AND e.employee_status = 'active'
    JOIN orgmaster_core.managed_identity_admission_authority aa ON aa.singleton = true AND aa.admission_enabled
   WHERE a.employee_number = upper(trim(p_employee_number))
     AND p_employee_number ~* '^JFS[0-9]{4}$'
     AND upper(trim(p_employee_number)) <> 'JFS0000'
     AND i.link_state IN ('directory_linked_pending_auth','active')
     AND ((i.link_state = 'directory_linked_pending_auth' AND i.auth_issuer IS NULL AND i.auth_subject IS NULL)
       OR (i.link_state = 'active' AND i.auth_issuer IS NOT NULL AND i.auth_subject IS NOT NULL AND i.admission_revision IS NOT NULL))
     AND o.directory_state = 'present'
     AND lower(o.primary_email) = lower(i.last_verified_primary_email)
     AND NOT EXISTS (SELECT 1 FROM orgmaster_core.managed_identity_lifecycle_outbox l WHERE l.employee_id = i.employee_id AND l.status <> 'completed');
$fn$;

CREATE OR REPLACE FUNCTION orgmaster_core.read_managed_login_identity_v1(p_directory_customer_id text, p_directory_user_id text)
RETURNS TABLE(employee_id text, principal_id text, employee_number text, directory_customer_id text, directory_user_id text, identity_record_id uuid, identity_revision text, registry_revision text, link_state text, auth_issuer text, auth_subject text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
  SELECT i.employee_id, i.principal_id, a.employee_number, i.directory_customer_id, i.directory_user_id,
         i.identity_record_id, i.revision::text, a.revision::text, i.link_state, i.auth_issuer, i.auth_subject
    FROM orgmaster_core.managed_daily_identities i
    JOIN orgmaster_core.employee_number_assignments a ON a.employee_id = i.employee_id
    JOIN orgmaster_core.managed_identity_observations o ON o.identity_record_id = i.identity_record_id
    JOIN orgmaster_core.v_current_workspace_employees_v1 e ON e.employee_id = i.employee_id AND e.employee_status = 'active'
    JOIN orgmaster_core.managed_identity_admission_authority aa ON aa.singleton = true AND aa.admission_enabled
   WHERE i.directory_customer_id = p_directory_customer_id
     AND i.directory_user_id = p_directory_user_id
     AND i.link_state IN ('directory_linked_pending_auth','active')
     AND ((i.link_state = 'directory_linked_pending_auth' AND i.auth_issuer IS NULL AND i.auth_subject IS NULL)
       OR (i.link_state = 'active' AND i.auth_issuer IS NOT NULL AND i.auth_subject IS NOT NULL AND i.admission_revision IS NOT NULL))
     AND o.directory_state = 'present'
     AND lower(o.primary_email) = lower(i.last_verified_primary_email)
     AND NOT EXISTS (SELECT 1 FROM orgmaster_core.managed_identity_lifecycle_outbox l WHERE l.employee_id = i.employee_id AND l.status <> 'completed');
$fn$;

CREATE OR REPLACE FUNCTION orgmaster_core.verify_managed_login_identity_v1(
  p_command_id text, p_request_hash text, p_directory_customer_id text, p_directory_user_id text,
  p_issuer text, p_subject text, p_expected_employee_id text, p_expected_identity_record_id uuid,
  p_expected_identity_revision bigint, p_expected_registry_revision bigint, p_expected_link_state text,
  p_expected_issuer text, p_expected_subject text, p_actor text
)
RETURNS TABLE(employee_id text, principal_id text, employee_number text, directory_customer_id text, directory_user_id text, identity_record_id uuid, identity_revision text, registry_revision text, link_state text, auth_issuer text, auth_subject text, mapping_version text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE
  v_identity orgmaster_core.managed_daily_identities%ROWTYPE;
  v_assignment orgmaster_core.employee_number_assignments%ROWTYPE;
  v_receipt orgmaster_core.managed_identity_command_receipts%ROWTYPE;
  v_mapping bigint;
  v_result text := 'noop';
BEGIN
  IF p_command_id IS NULL OR char_length(p_command_id) NOT BETWEEN 1 AND 255
     OR p_request_hash !~ '^[0-9a-f]{64}$'
     OR p_issuer IS NULL OR p_subject IS NULL OR p_actor IS NULL
     OR p_expected_link_state NOT IN ('directory_linked_pending_auth','active')
     OR (p_expected_link_state = 'directory_linked_pending_auth' AND (p_expected_issuer IS NOT NULL OR p_expected_subject IS NOT NULL))
     OR (p_expected_link_state = 'active' AND (p_expected_issuer IS NULL OR p_expected_subject IS NULL))
  THEN RAISE EXCEPTION 'MANAGED_IDENTITY_REQUEST_INVALID'; END IF;

  PERFORM 1 FROM orgmaster_core.managed_identity_admission_authority aa WHERE aa.singleton = true AND aa.admission_enabled FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MANAGED_IDENTITY_ADMISSION_DISABLED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM orgmaster_core.v_current_workspace_employees_v1 e WHERE e.employee_id = p_expected_employee_id AND e.employee_status = 'active') THEN RAISE EXCEPTION 'MANAGED_IDENTITY_IDENTITY_CONFLICT'; END IF;
  IF EXISTS (SELECT 1 FROM orgmaster_core.managed_identity_lifecycle_outbox l WHERE l.employee_id = p_expected_employee_id AND l.status <> 'completed') THEN RAISE EXCEPTION 'INVALIDATION_PENDING'; END IF;

  SELECT * INTO v_identity
    FROM orgmaster_core.managed_daily_identities i
   WHERE i.directory_customer_id = p_directory_customer_id AND i.directory_user_id = p_directory_user_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MANAGED_IDENTITY_IDENTITY_CONFLICT'; END IF;
  SELECT * INTO v_assignment FROM orgmaster_core.employee_number_assignments a WHERE a.employee_id = v_identity.employee_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MANAGED_IDENTITY_IDENTITY_CONFLICT'; END IF;
  IF NOT EXISTS (SELECT 1 FROM orgmaster_core.managed_identity_observations o WHERE o.identity_record_id = v_identity.identity_record_id AND o.directory_state = 'present' AND lower(o.primary_email) = lower(v_identity.last_verified_primary_email)) THEN RAISE EXCEPTION 'MANAGED_IDENTITY_IDENTITY_CONFLICT'; END IF;

  IF v_identity.employee_id <> p_expected_employee_id
     OR v_identity.identity_record_id <> p_expected_identity_record_id
     OR v_identity.revision <> p_expected_identity_revision
     OR v_assignment.revision <> p_expected_registry_revision
     OR v_identity.link_state <> p_expected_link_state
     OR v_identity.auth_issuer IS DISTINCT FROM p_expected_issuer
     OR v_identity.auth_subject IS DISTINCT FROM p_expected_subject
  THEN RAISE EXCEPTION 'MANAGED_IDENTITY_REVISION_CONFLICT'; END IF;

  SELECT * INTO v_receipt FROM orgmaster_core.managed_identity_command_receipts r WHERE r.command_id = p_command_id FOR UPDATE;
  IF FOUND THEN
    IF v_receipt.action <> 'verify_managed_login_identity_v1' OR v_receipt.request_hash_sha256 <> p_request_hash OR v_receipt.identity_record_id <> v_identity.identity_record_id
       OR v_identity.link_state <> 'active' OR v_identity.auth_issuer <> p_issuer OR v_identity.auth_subject <> p_subject OR v_identity.admission_revision IS NULL
    THEN RAISE EXCEPTION 'MANAGED_IDENTITY_IDEMPOTENCY_CONFLICT'; END IF;
    RETURN QUERY SELECT v_identity.employee_id, v_identity.principal_id, v_assignment.employee_number, v_identity.directory_customer_id, v_identity.directory_user_id,
      v_identity.identity_record_id, v_identity.revision::text, v_assignment.revision::text, v_identity.link_state, v_identity.auth_issuer, v_identity.auth_subject, v_identity.admission_revision::text;
    RETURN;
  END IF;

  IF v_identity.link_state = 'active' THEN
    IF v_identity.auth_issuer <> p_issuer OR v_identity.auth_subject <> p_subject OR v_identity.admission_revision IS NULL THEN RAISE EXCEPTION 'MANAGED_IDENTITY_IDENTITY_CONFLICT'; END IF;
    v_mapping := v_identity.admission_revision;
  ELSE
    IF EXISTS (SELECT 1 FROM orgmaster_core.principal_identity_reservations r WHERE r.principal_issuer = p_issuer AND r.principal_subject = p_subject)
       OR EXISTS (SELECT 1 FROM orgmaster_core.managed_daily_identities i WHERE i.identity_record_id <> v_identity.identity_record_id AND i.auth_issuer = p_issuer AND i.auth_subject = p_subject)
       OR EXISTS (SELECT 1 FROM orgmaster_contract.v_active_principal_mappings_v1 m WHERE m.principal_issuer = p_issuer AND m.principal_subject = p_subject)
    THEN RAISE EXCEPTION 'MANAGED_IDENTITY_IDENTITY_CONFLICT'; END IF;
    v_mapping := nextval('orgmaster_core.managed_identity_mapping_version_seq');
    UPDATE orgmaster_core.managed_daily_identities i
       SET auth_issuer = p_issuer, auth_subject = p_subject, bound_at = clock_timestamp(), link_state = 'active', revision = i.revision + 1,
           admission_revision = v_mapping, admission_changed_at = clock_timestamp(), updated_at = clock_timestamp(), updated_by = p_actor
     WHERE i.identity_record_id = v_identity.identity_record_id
     RETURNING * INTO v_identity;
    INSERT INTO orgmaster_core.principal_identity_reservations(principal_issuer, principal_subject, employee_id, first_seen_at, source_kind, source_revision)
    VALUES (p_issuer, p_subject, v_identity.employee_id, clock_timestamp(), 'managed', 'managed-login:' || p_command_id);
    v_result := 'applied';
  END IF;

  INSERT INTO orgmaster_core.managed_identity_command_receipts(command_id, request_hash_sha256, action, employee_id, identity_record_id, response_payload)
  VALUES (p_command_id, p_request_hash, 'verify_managed_login_identity_v1', v_identity.employee_id, v_identity.identity_record_id,
    jsonb_build_object('contractVersion','jenfu.managed-login.v1','identityRecordId',v_identity.identity_record_id::text,'mappingVersion',v_mapping::text));
  INSERT INTO orgmaster_core.managed_identity_audit_events(command_id, action, actor, employee_id, identity_record_id, result, reason_code, details)
  VALUES (p_command_id, 'managed_login_identity_verified', p_actor, v_identity.employee_id, v_identity.identity_record_id, v_result,
    CASE WHEN v_result = 'applied' THEN 'first_login_bridge' ELSE 'active_pair_verified' END,
    jsonb_build_object('directoryKeySha256', encode(public.digest(convert_to(p_directory_customer_id, 'UTF8') || decode('00', 'hex') || convert_to(p_directory_user_id, 'UTF8'), 'sha256'), 'hex')));

  RETURN QUERY SELECT v_identity.employee_id, v_identity.principal_id, v_assignment.employee_number, v_identity.directory_customer_id, v_identity.directory_user_id,
    v_identity.identity_record_id, v_identity.revision::text, v_assignment.revision::text, v_identity.link_state, v_identity.auth_issuer, v_identity.auth_subject, v_mapping::text;
END;
$fn$;

CREATE OR REPLACE VIEW orgmaster_contract.v_active_principal_mappings_v1
WITH (security_barrier = true) AS
WITH active_governance AS (
  SELECT artifact.payload
  FROM orgmaster_core.persistence_authority authority
  JOIN orgmaster_core.persistence_batches batch ON batch.id = authority.active_batch_id AND batch.status = 'active'
  JOIN orgmaster_core.persistence_artifacts artifact ON artifact.batch_id = batch.id AND artifact.artifact_key = 'orgmaster-governance.v3.json' AND artifact.artifact_kind = 'governance'
  WHERE authority.singleton = true
), active_version AS (
  SELECT version.value AS payload
  FROM active_governance governance
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(governance.payload->'publishedVersions') = 'array' THEN governance.payload->'publishedVersions' ELSE '[]'::jsonb END) version(value)
  WHERE version.value->>'id' = governance.payload->>'activePolicyVersionId' AND version.value->>'kind' = 'assignment-governance-v3'
), legacy_candidates AS (
  SELECT version.payload AS version_payload, identity.value AS identity_payload, employee.employee_id, employee.employee_status
  FROM active_version version
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(version.payload#>'{policy,identityLinks}') = 'array' THEN version.payload#>'{policy,identityLinks}' ELSE '[]'::jsonb END) identity(value)
  JOIN orgmaster_core.v_current_workspace_employees_v1 employee ON employee.employee_id = identity.value->>'employeeId' AND employee.employee_status = 'active'
  WHERE identity.value->>'status' = 'active' AND NULLIF(identity.value->>'issuer', '') IS NOT NULL AND NULLIF(identity.value->>'subject', '') IS NOT NULL AND NULLIF(identity.value->>'principalId', '') IS NOT NULL
    AND (identity.value->>'validFrom')::timestamptz <= CURRENT_TIMESTAMP AND (identity.value->>'validTo' IS NULL OR (identity.value->>'validTo')::timestamptz > CURRENT_TIMESTAMP)
    AND NOT EXISTS (SELECT 1 FROM orgmaster_core.managed_identity_lifecycle_outbox l WHERE l.employee_id = identity.value->>'employeeId' AND l.status <> 'completed')
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(version.payload#>'{policy,roleAssignments}') = 'array' THEN version.payload#>'{policy,roleAssignments}' ELSE '[]'::jsonb END) assignment(value)
      WHERE assignment.value->>'employeeId' = identity.value->>'employeeId' AND assignment.value->>'applicationId' = 'orgmaster' AND assignment.value->>'status' = 'active' AND assignment.value#>>'{scope,kind}' = 'global'
        AND (assignment.value->>'validFrom' IS NULL OR (assignment.value->>'validFrom')::timestamptz <= CURRENT_TIMESTAMP)
        AND (assignment.value->>'validTo' IS NULL OR (assignment.value->>'validTo')::timestamptz > CURRENT_TIMESTAMP)
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(version.payload#>'{policy,applicationRoles}') = 'array' THEN version.payload#>'{policy,applicationRoles}' ELSE '[]'::jsonb END) role(value) WHERE role.value->>'id' = assignment.value->>'roleId' AND role.value->>'applicationId' = 'orgmaster' AND role.value->>'status' = 'active')
    )
)
SELECT 'organization.active-principal.v1'::text AS contract_version, identity_payload->>'issuer' AS principal_issuer,
       identity_payload->>'subject' AS principal_subject, identity_payload->>'principalId' AS principal_id, employee_id, employee_status,
       (version_payload->>'versionNumber')::bigint AS mapping_version, (version_payload->>'publishedAt')::timestamptz AS published_at
FROM legacy_candidates
UNION ALL
SELECT 'organization.active-principal.v1', i.auth_issuer, i.auth_subject, i.principal_id, i.employee_id, e.employee_status, i.admission_revision, i.admission_changed_at
FROM orgmaster_core.managed_daily_identities i
JOIN orgmaster_core.v_current_workspace_employees_v1 e ON e.employee_id = i.employee_id AND e.employee_status = 'active'
JOIN orgmaster_core.managed_identity_admission_authority aa ON aa.singleton = true AND aa.admission_enabled
WHERE i.link_state = 'active' AND i.auth_issuer IS NOT NULL AND i.auth_subject IS NOT NULL AND i.admission_revision IS NOT NULL AND i.admission_changed_at IS NOT NULL
  AND EXISTS (SELECT 1 FROM orgmaster_core.managed_identity_observations o WHERE o.identity_record_id = i.identity_record_id AND o.directory_state = 'present')
  AND NOT EXISTS (SELECT 1 FROM orgmaster_core.managed_identity_lifecycle_outbox l WHERE l.employee_id = i.employee_id AND l.status <> 'completed');

ALTER FUNCTION orgmaster_core.read_employee_managed_identity_v1(text) OWNER TO jenfu_orgmaster_migrator;
ALTER FUNCTION orgmaster_core.assign_employee_number_v1(text,text,text,text,text,timestamptz) OWNER TO jenfu_orgmaster_migrator;
ALTER FUNCTION orgmaster_core.lease_managed_identity_candidate_v1(text,text,text,text,text,text,text,text,text,text) OWNER TO jenfu_orgmaster_migrator;
ALTER FUNCTION orgmaster_core.read_managed_identity_candidate_v1(text,text,text,text,text,text) OWNER TO jenfu_orgmaster_migrator;
ALTER FUNCTION orgmaster_core.confirm_managed_identity_link_v1(text,text,text,text,text,text) OWNER TO jenfu_orgmaster_migrator;
ALTER FUNCTION orgmaster_core.resolve_managed_identity_alias_v1(text) OWNER TO jenfu_orgmaster_migrator;
ALTER FUNCTION orgmaster_core.bind_managed_identity_auth_v1(text,text,text,text,text) OWNER TO jenfu_orgmaster_migrator;
ALTER FUNCTION orgmaster_core.resolve_managed_login_alias_v1(text) OWNER TO jenfu_orgmaster_migrator;
ALTER FUNCTION orgmaster_core.read_managed_login_identity_v1(text,text) OWNER TO jenfu_orgmaster_migrator;
ALTER FUNCTION orgmaster_core.verify_managed_login_identity_v1(text,text,text,text,text,text,text,uuid,bigint,bigint,text,text,text,text) OWNER TO jenfu_orgmaster_migrator;
ALTER VIEW orgmaster_contract.v_active_principal_mappings_v1 OWNER TO jenfu_orgmaster_migrator;

REVOKE ALL ON FUNCTION orgmaster_core.read_employee_managed_identity_v1(text), orgmaster_core.assign_employee_number_v1(text,text,text,text,text,timestamptz), orgmaster_core.lease_managed_identity_candidate_v1(text,text,text,text,text,text,text,text,text,text), orgmaster_core.read_managed_identity_candidate_v1(text,text,text,text,text,text), orgmaster_core.confirm_managed_identity_link_v1(text,text,text,text,text,text), orgmaster_core.resolve_managed_identity_alias_v1(text), orgmaster_core.bind_managed_identity_auth_v1(text,text,text,text,text), orgmaster_core.resolve_managed_login_alias_v1(text), orgmaster_core.read_managed_login_identity_v1(text,text), orgmaster_core.verify_managed_login_identity_v1(text,text,text,text,text,text,text,uuid,bigint,bigint,text,text,text,text) FROM PUBLIC, jenfu_platform_runtime, jenfu_ai_pdm_runtime;
GRANT EXECUTE ON FUNCTION orgmaster_core.read_employee_managed_identity_v1(text), orgmaster_core.assign_employee_number_v1(text,text,text,text,text,timestamptz), orgmaster_core.lease_managed_identity_candidate_v1(text,text,text,text,text,text,text,text,text,text), orgmaster_core.read_managed_identity_candidate_v1(text,text,text,text,text,text), orgmaster_core.confirm_managed_identity_link_v1(text,text,text,text,text,text), orgmaster_core.resolve_managed_identity_alias_v1(text), orgmaster_core.bind_managed_identity_auth_v1(text,text,text,text,text), orgmaster_core.resolve_managed_login_alias_v1(text), orgmaster_core.read_managed_login_identity_v1(text,text), orgmaster_core.verify_managed_login_identity_v1(text,text,text,text,text,text,text,uuid,bigint,bigint,text,text,text,text) TO jenfu_orgmaster_runtime;

COMMIT;
