-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: orgmaster.identity-visibility / organization.active-principal.v1 managed-row expansion and current-employee enforcement
-- compatibility: additive
-- governance-review: DEV-047

BEGIN;
SET LOCAL ROLE jenfu_orgmaster_migrator;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE SEQUENCE orgmaster_core.managed_identity_mapping_version_seq AS bigint MINVALUE 1 MAXVALUE 9007199254740991 NO CYCLE;
CREATE SEQUENCE orgmaster_core.managed_identity_refresh_request_seq AS bigint MINVALUE 1 MAXVALUE 9007199254740991 NO CYCLE;

CREATE TABLE orgmaster_core.employee_number_assignments (
  employee_id text PRIMARY KEY CHECK (char_length(employee_id) BETWEEN 1 AND 255),
  employee_number text NOT NULL UNIQUE CHECK (employee_number ~ '^JFS[0-9]{4}$' AND employee_number <> 'JFS0000'),
  revision bigint NOT NULL CHECK (revision >= 1),
  assigned_at timestamptz NOT NULL,
  assigned_by text NOT NULL CHECK (char_length(assigned_by) BETWEEN 1 AND 255),
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL CHECK (char_length(updated_by) BETWEEN 1 AND 255)
);

CREATE TABLE orgmaster_core.employee_number_tombstones (
  employee_number text PRIMARY KEY CHECK (employee_number ~ '^JFS[0-9]{4}$' AND employee_number <> 'JFS0000'),
  first_employee_id text NOT NULL CHECK (char_length(first_employee_id) BETWEEN 1 AND 255),
  first_assigned_at timestamptz NOT NULL,
  retired_at timestamptz NULL
);

CREATE TABLE orgmaster_core.employee_number_legacy_exemptions (
  employee_id text PRIMARY KEY CHECK (char_length(employee_id) BETWEEN 1 AND 255),
  source_workspace_revision text NOT NULL CHECK (char_length(source_workspace_revision) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_at timestamptz NULL
);

CREATE TABLE orgmaster_core.managed_identity_directory_read_budget (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  granted_at timestamptz[] NOT NULL DEFAULT '{}'::timestamptz[],
  CHECK (cardinality(granted_at) <= 60)
);
INSERT INTO orgmaster_core.managed_identity_directory_read_budget(singleton) VALUES (true);

CREATE TABLE orgmaster_core.managed_identity_admission_authority (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  admission_enabled boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision >= 1),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by text NOT NULL CHECK (char_length(updated_by) BETWEEN 1 AND 255),
  reason_code text NOT NULL CHECK (char_length(reason_code) BETWEEN 1 AND 255)
);
INSERT INTO orgmaster_core.managed_identity_admission_authority(singleton, updated_by, reason_code) VALUES (true, 'migration', 'migration_default_off');

CREATE TABLE orgmaster_core.managed_identity_invalidation_applications (
  application_id text PRIMARY KEY CHECK (char_length(application_id) BETWEEN 1 AND 128),
  status text NOT NULL CHECK (status IN ('active','inactive')),
  support_state text NOT NULL CHECK (support_state IN ('pending','verified')),
  support_revision bigint NOT NULL DEFAULT 1 CHECK (support_revision >= 1),
  support_evidence_ref text NULL,
  support_verified_at timestamptz NULL,
  support_verified_by text NULL,
  source_governance_version_id text NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (status <> 'active' OR source_governance_version_id IS NOT NULL),
  CHECK (support_state <> 'verified' OR (support_evidence_ref IS NOT NULL AND support_verified_at IS NOT NULL AND support_verified_by IS NOT NULL))
);
INSERT INTO orgmaster_core.managed_identity_invalidation_applications(application_id, status, support_state, source_governance_version_id, updated_at)
VALUES ('orgmaster', 'inactive', 'pending', NULL, clock_timestamp());

-- Existing active V3 policy applications are copied as pending support rows.
-- The source version is evidence only; support must still be release-attested
-- before an application can receive an invalidation event.
INSERT INTO orgmaster_core.managed_identity_invalidation_applications(application_id, status, support_state, source_governance_version_id, updated_at)
SELECT DISTINCT app.value->>'applicationId', 'active', 'pending', governance.payload->>'activePolicyVersionId', clock_timestamp()
FROM orgmaster_core.persistence_authority authority
JOIN orgmaster_core.persistence_batches batch ON batch.id = authority.active_batch_id AND batch.status = 'active'
JOIN orgmaster_core.persistence_artifacts governance ON governance.batch_id = batch.id AND governance.artifact_key = 'orgmaster-governance.v3.json' AND governance.artifact_kind = 'governance'
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(governance.payload#>'{publishedVersions}') = 'array' THEN governance.payload#>'{publishedVersions}' ELSE '[]'::jsonb END) version(value)
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(version.value#>'{policy,applications}') = 'array' THEN version.value#>'{policy,applications}' ELSE '[]'::jsonb END) app(value)
WHERE authority.singleton = true AND version.value->>'id' = governance.payload->>'activePolicyVersionId' AND version.value->>'kind' = 'assignment-governance-v3' AND app.value->>'status' = 'active' AND NULLIF(app.value->>'applicationId', '') IS NOT NULL
ON CONFLICT (application_id) DO UPDATE SET status = EXCLUDED.status, source_governance_version_id = EXCLUDED.source_governance_version_id, updated_at = EXCLUDED.updated_at;

CREATE TABLE orgmaster_core.managed_daily_identities (
  identity_record_id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  employee_id text NOT NULL UNIQUE CHECK (char_length(employee_id) BETWEEN 1 AND 255),
  principal_id text NOT NULL UNIQUE CHECK (principal_id = 'principal-managed:' || identity_record_id::text),
  directory_customer_id text NOT NULL CHECK (char_length(directory_customer_id) BETWEEN 1 AND 255),
  directory_user_id text NOT NULL CHECK (char_length(directory_user_id) BETWEEN 1 AND 255),
  last_verified_primary_email text NOT NULL CHECK (char_length(last_verified_primary_email) BETWEEN 3 AND 255),
  auth_issuer text NULL,
  auth_subject text NULL,
  bound_at timestamptz NULL,
  link_state text NOT NULL CHECK (link_state IN ('directory_linked_pending_auth','active','conflict')),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision >= 1),
  admission_revision bigint NULL CHECK (admission_revision IS NULL OR admission_revision >= 1),
  admission_changed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by text NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 255),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by text NOT NULL CHECK (char_length(updated_by) BETWEEN 1 AND 255),
  UNIQUE (directory_customer_id, directory_user_id),
  CHECK ((auth_issuer IS NULL) = (auth_subject IS NULL)),
  CHECK ((admission_revision IS NULL) = (admission_changed_at IS NULL))
);
CREATE UNIQUE INDEX managed_daily_identities_auth_pair_uq ON orgmaster_core.managed_daily_identities(auth_issuer, auth_subject) WHERE auth_issuer IS NOT NULL AND auth_subject IS NOT NULL;

CREATE TABLE orgmaster_core.managed_identity_observations (
  identity_record_id uuid PRIMARY KEY REFERENCES orgmaster_core.managed_daily_identities(identity_record_id) ON DELETE RESTRICT,
  primary_email text NULL,
  directory_state text NOT NULL CHECK (directory_state IN ('missing','present','suspended','archived','unknown')),
  source_etag text NULL,
  last_applied_request_sequence bigint NOT NULL DEFAULT 0 CHECK (last_applied_request_sequence >= 0),
  adapter_outcome text NOT NULL CHECK (adapter_outcome IN ('success','not_found','retryable_error','permanent_error','candidate_miss','parse_error')),
  error_code text NULL,
  trusted_observed_at timestamptz NULL,
  last_attempt_at timestamptz NULL,
  freshness text NOT NULL DEFAULT 'unknown' CHECK (freshness IN ('fresh','stale','unknown'))
);

CREATE TABLE orgmaster_core.managed_identity_candidate_leases (
  lease_id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  token_hash_sha256 char(64) NOT NULL UNIQUE CHECK (token_hash_sha256 ~ '^[0-9a-f]{64}$'),
  actor_binding_sha256 char(64) NOT NULL CHECK (actor_binding_sha256 ~ '^[0-9a-f]{64}$'),
  employee_id text NOT NULL,
  employee_number text NOT NULL CHECK (employee_number ~ '^JFS[0-9]{4}$'),
  expected_primary_email text NOT NULL,
  directory_customer_id text NOT NULL,
  directory_user_id text NOT NULL,
  primary_email text NOT NULL,
  source_etag text NULL,
  workspace_revision text NULL,
  registry_revision text NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  invalidated_at timestamptz NULL,
  consumed_at timestamptz NULL,
  CHECK (expires_at <= created_at + interval '5 minutes')
);
CREATE UNIQUE INDEX managed_identity_candidate_latest_uq ON orgmaster_core.managed_identity_candidate_leases(employee_id, actor_binding_sha256) WHERE invalidated_at IS NULL AND consumed_at IS NULL;

CREATE TABLE orgmaster_core.managed_identity_command_receipts (
  command_id text PRIMARY KEY CHECK (char_length(command_id) BETWEEN 1 AND 255),
  request_hash_sha256 char(64) NOT NULL CHECK (request_hash_sha256 ~ '^[0-9a-f]{64}$'),
  action text NOT NULL,
  employee_id text NOT NULL,
  identity_record_id uuid NULL,
  response_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE orgmaster_core.managed_identity_refresh_outbox (
  request_id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  identity_record_id uuid NOT NULL REFERENCES orgmaster_core.managed_daily_identities(identity_record_id) ON DELETE RESTRICT,
  trigger text NOT NULL CHECK (trigger IN ('manual','periodic','domain')),
  state text NOT NULL CHECK (state IN ('queued','leased','completed','retry','dead')),
  request_sequence bigint NOT NULL UNIQUE CHECK (request_sequence >= 1),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  available_at timestamptz NOT NULL,
  lease_version bigint NOT NULL DEFAULT 0 CHECK (lease_version >= 0),
  lease_worker_id text NULL,
  lease_until timestamptz NULL,
  rerun_requested boolean NOT NULL DEFAULT false,
  completion_disposition text NULL CHECK (completion_disposition IS NULL OR completion_disposition IN ('applied','superseded','terminal')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz NULL,
  last_error_code text NULL
);
CREATE UNIQUE INDEX managed_identity_refresh_inflight_uq ON orgmaster_core.managed_identity_refresh_outbox(identity_record_id) WHERE state IN ('queued','leased','retry');

CREATE TABLE orgmaster_core.principal_identity_reservations (
  principal_issuer text NOT NULL CHECK (char_length(principal_issuer) BETWEEN 1 AND 255),
  principal_subject text NOT NULL CHECK (char_length(principal_subject) BETWEEN 1 AND 255),
  employee_id text NOT NULL CHECK (char_length(employee_id) BETWEEN 1 AND 255),
  first_seen_at timestamptz NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('legacy','managed')),
  source_revision text NOT NULL,
  PRIMARY KEY (principal_issuer, principal_subject)
);

CREATE TABLE orgmaster_core.managed_identity_audit_events (
  event_id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  command_id text NULL,
  action text NOT NULL,
  actor text NOT NULL,
  employee_id text NOT NULL,
  identity_record_id uuid NULL,
  result text NOT NULL CHECK (result IN ('applied','noop','rejected','queued','superseded','conflict')),
  reason_code text NOT NULL,
  before_hash char(64) NULL,
  after_hash char(64) NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_event_hash char(64) NULL,
  event_hash char(64) NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Preserve every historically observed legacy issuer/subject pair.  This is
-- a reservation, not an admission row, and therefore cannot make an old
-- snapshot active again.
INSERT INTO orgmaster_core.principal_identity_reservations(principal_issuer, principal_subject, employee_id, first_seen_at, source_kind, source_revision)
SELECT DISTINCT NULLIF(identity.value->>'issuer',''), NULLIF(identity.value->>'subject',''), NULLIF(identity.value->>'employeeId',''), clock_timestamp(), 'legacy', version.value->>'id'
FROM orgmaster_core.persistence_authority authority
JOIN orgmaster_core.persistence_batches batch ON batch.id=authority.active_batch_id AND batch.status='active'
JOIN orgmaster_core.persistence_artifacts governance ON governance.batch_id=batch.id AND governance.artifact_key='orgmaster-governance.v3.json' AND governance.artifact_kind='governance'
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(governance.payload#>'{publishedVersions}')='array' THEN governance.payload#>'{publishedVersions}' ELSE '[]'::jsonb END) version(value)
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(version.value#>'{policy,identityLinks}')='array' THEN version.value#>'{policy,identityLinks}' ELSE '[]'::jsonb END) identity(value)
WHERE authority.singleton=true AND NULLIF(identity.value->>'issuer','') IS NOT NULL AND NULLIF(identity.value->>'subject','') IS NOT NULL AND NULLIF(identity.value->>'employeeId','') IS NOT NULL
ON CONFLICT (principal_issuer, principal_subject) DO NOTHING;

CREATE TABLE orgmaster_core.managed_identity_lifecycle_outbox (
  event_id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  operation_id text NOT NULL CHECK (char_length(operation_id) BETWEEN 1 AND 255),
  employee_id text NOT NULL CHECK (char_length(employee_id) BETWEEN 1 AND 255),
  application_id text NOT NULL CHECK (char_length(application_id) BETWEEN 1 AND 128),
  event_kind text NOT NULL CHECK (event_kind = 'managed_identity_lifecycle_changed'),
  actor text NOT NULL CHECK (char_length(actor) BETWEEN 1 AND 255),
  reason_code text NOT NULL CHECK (char_length(reason_code) BETWEEN 1 AND 255),
  status text NOT NULL CHECK (status IN ('pending','processing','completed','failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL,
  lease_until timestamptz NULL,
  worker_id text NULL,
  platform_receipt_id uuid NULL,
  last_error_code text NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz NULL,
  UNIQUE(operation_id, employee_id, application_id)
);

-- The current-workspace authority is deliberately derived from one active
-- persistence batch; drafts and old snapshots never participate.
CREATE OR REPLACE VIEW orgmaster_core.v_current_workspace_employees_v1
WITH (security_barrier = true) AS
WITH active_batch AS (
  SELECT b.id, trim(b.source_revision) AS workspace_revision
  FROM orgmaster_core.persistence_authority a
  JOIN orgmaster_core.persistence_batches b ON b.id = a.active_batch_id AND b.status = 'active'
  WHERE a.singleton = true
), manifest AS (
  SELECT ab.workspace_revision, p.payload, p.payload->>'currentVersionId' AS current_version_id
  FROM active_batch ab
  JOIN orgmaster_core.persistence_artifacts p ON p.batch_id = ab.id
  WHERE p.artifact_key = 'orgmaster-workspace.v1.json' AND p.artifact_kind = 'workspace-manifest'
), current_document AS (
  SELECT m.workspace_revision, m.current_version_id, p.payload
  FROM manifest m
  JOIN orgmaster_core.persistence_artifacts p ON p.artifact_key = 'orgmaster-versions/' || m.current_version_id || '.json'
  JOIN orgmaster_core.persistence_batches b ON b.id = p.batch_id AND b.status = 'active'
  WHERE p.artifact_kind = 'workspace-version' AND p.payload->>'kind' = 'document'
)
SELECT m.current_version_id AS workspace_version_id,
       m.workspace_revision,
       employee.value->>'id' AS employee_id,
       CASE WHEN employee.value->>'status' IN ('active','inactive') THEN employee.value->>'status' ELSE 'inactive' END AS employee_status
FROM current_document m
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(m.payload#>'{state,employees}') = 'array' THEN m.payload#>'{state,employees}' ELSE '[]'::jsonb END) employee(value);

-- Seed only the safely observable legacy no-number exception set.
INSERT INTO orgmaster_core.employee_number_legacy_exemptions(employee_id, source_workspace_revision)
SELECT v.employee_id, v.workspace_revision
FROM orgmaster_core.v_current_workspace_employees_v1 v
LEFT JOIN orgmaster_core.employee_number_assignments a ON a.employee_id = v.employee_id
WHERE v.employee_status = 'active' AND a.employee_id IS NULL
ON CONFLICT (employee_id) DO NOTHING;

CREATE OR REPLACE FUNCTION orgmaster_core.read_employee_managed_identity_v1(p_employee_id text)
RETURNS TABLE(employee_id text, employee_status text, employee_number text, identity_record_id uuid, identity_state text, primary_email text, directory_state text, freshness text, registry_revision bigint, admission_enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
  SELECT e.employee_id, e.employee_status, a.employee_number, i.identity_record_id,
         COALESCE(i.link_state, 'not_linked'), i.last_verified_primary_email, o.directory_state, o.freshness,
         COALESCE((SELECT max(revision) FROM orgmaster_core.employee_number_assignments), 0),
         aa.admission_enabled
  FROM orgmaster_core.v_current_workspace_employees_v1 e
  LEFT JOIN orgmaster_core.employee_number_assignments a ON a.employee_id = e.employee_id
  LEFT JOIN orgmaster_core.managed_daily_identities i ON i.employee_id = e.employee_id
  LEFT JOIN orgmaster_core.managed_identity_observations o ON o.identity_record_id = i.identity_record_id
  CROSS JOIN orgmaster_core.managed_identity_admission_authority aa
  WHERE e.employee_id = p_employee_id AND aa.singleton = true;
$fn$;

CREATE OR REPLACE FUNCTION orgmaster_core.resolve_managed_identity_auth_v1(p_primary_email text)
RETURNS TABLE(employee_id text, principal_id text, identity_record_id uuid, primary_email text, auth_issuer text, auth_subject text, link_state text, revision bigint, admission_revision bigint, directory_customer_id text, directory_user_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
  SELECT i.employee_id, i.principal_id, i.identity_record_id, i.last_verified_primary_email,
         i.auth_issuer, i.auth_subject, i.link_state, i.revision, i.admission_revision,
         i.directory_customer_id, i.directory_user_id
    FROM orgmaster_core.managed_daily_identities i
    JOIN orgmaster_core.v_current_workspace_employees_v1 e ON e.employee_id = i.employee_id AND e.employee_status = 'active'
    JOIN orgmaster_core.managed_identity_admission_authority aa ON aa.singleton = true AND aa.admission_enabled
   WHERE lower(i.last_verified_primary_email) = lower(trim(p_primary_email))
     AND i.link_state IN ('directory_linked_pending_auth','active');
$fn$;

CREATE OR REPLACE FUNCTION orgmaster_core.assign_employee_number_v1(p_employee_id text, p_employee_number text, p_actor text, p_expected_workspace_revision text DEFAULT NULL, p_expected_registry_revision text DEFAULT NULL, p_now timestamptz DEFAULT clock_timestamp())
RETURNS TABLE(disposition text, assignment jsonb, document jsonb, revision text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE v_employee text; v_current orgmaster_core.employee_number_assignments%ROWTYPE; v_number text := upper(trim(p_employee_number)); v_revision bigint; v_hash text;
BEGIN
  SELECT employee_id INTO v_employee FROM orgmaster_core.v_current_workspace_employees_v1 WHERE employee_id = p_employee_id AND employee_status IN ('active','inactive');
  IF v_employee IS NULL THEN RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND'; END IF;
  IF v_number !~ '^JFS[0-9]{4}$' OR v_number = 'JFS0000' THEN RAISE EXCEPTION 'EMPLOYEE_NUMBER_INVALID'; END IF;
  IF p_expected_workspace_revision IS NOT NULL AND NOT EXISTS (SELECT 1 FROM orgmaster_core.v_current_workspace_employees_v1 WHERE workspace_revision = p_expected_workspace_revision) THEN RAISE EXCEPTION 'MANAGED_IDENTITY_REVISION_CONFLICT'; END IF;
  SELECT * INTO v_current FROM orgmaster_core.employee_number_assignments WHERE employee_id = p_employee_id FOR UPDATE;
  IF FOUND AND v_current.employee_number = v_number THEN
    RETURN QUERY SELECT 'noop', to_jsonb(v_current), '{}'::jsonb, COALESCE(p_expected_registry_revision, ''); RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM orgmaster_core.employee_number_assignments WHERE employee_number = v_number AND employee_id <> p_employee_id) OR EXISTS (SELECT 1 FROM orgmaster_core.employee_number_tombstones WHERE employee_number = v_number AND first_employee_id <> p_employee_id) THEN RAISE EXCEPTION 'EMPLOYEE_NUMBER_CONFLICT'; END IF;
  IF EXISTS (SELECT 1 FROM orgmaster_core.employee_number_tombstones WHERE employee_number = v_number AND retired_at IS NOT NULL AND first_employee_id = p_employee_id) THEN RAISE EXCEPTION 'EMPLOYEE_NUMBER_RETIRED'; END IF;
  v_revision := COALESCE(v_current.revision, 0) + 1;
  INSERT INTO orgmaster_core.employee_number_tombstones(employee_number, first_employee_id, first_assigned_at) VALUES (v_number, p_employee_id, p_now) ON CONFLICT (employee_number) DO NOTHING;
  IF v_current.employee_number IS NOT NULL AND v_current.employee_number <> v_number THEN UPDATE orgmaster_core.employee_number_tombstones SET retired_at = p_now WHERE employee_number = v_current.employee_number AND first_employee_id = p_employee_id; END IF;
  INSERT INTO orgmaster_core.employee_number_assignments(employee_id, employee_number, revision, assigned_at, assigned_by, updated_at, updated_by) VALUES (p_employee_id, v_number, v_revision, p_now, p_actor, p_now, p_actor)
  ON CONFLICT (employee_id) DO UPDATE SET employee_number = EXCLUDED.employee_number, revision = EXCLUDED.revision, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
  SELECT encode(public.digest(p_employee_id || chr(0) || v_number || chr(0) || p_actor, 'sha256'), 'hex') INTO v_hash;
  INSERT INTO orgmaster_core.managed_identity_audit_events(action, actor, employee_id, result, reason_code, after_hash, occurred_at) VALUES ('employee_number_assigned', p_actor, p_employee_id, 'applied', 'employee_number_assignment', v_hash, p_now);
  RETURN QUERY SELECT 'applied', to_jsonb(a), '{}'::jsonb, v_hash FROM orgmaster_core.employee_number_assignments a WHERE a.employee_id = p_employee_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION orgmaster_core.lease_managed_identity_candidate_v1(p_employee_id text, p_employee_number text, p_expected_primary_email text, p_customer_id text, p_directory_user_id text, p_primary_email text, p_source_etag text, p_workspace_revision text, p_registry_revision text, p_actor text)
RETURNS TABLE(lease_id uuid, candidate_token text, expires_at timestamptz, directory_customer_id text, directory_user_id text, primary_email text, source_etag text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE v_token text := encode(public.gen_random_bytes(32), 'hex'); v_id uuid := public.gen_random_uuid(); v_expires timestamptz := clock_timestamp() + interval '5 minutes';
BEGIN
  IF p_primary_email <> lower(trim(p_expected_primary_email)) OR p_customer_id = '' OR p_directory_user_id = '' THEN RAISE EXCEPTION 'DIRECTORY_CANDIDATE_MISMATCH'; END IF;
  UPDATE orgmaster_core.managed_identity_candidate_leases SET invalidated_at = clock_timestamp() WHERE employee_id = p_employee_id AND invalidated_at IS NULL AND consumed_at IS NULL;
  INSERT INTO orgmaster_core.managed_identity_candidate_leases(lease_id, token_hash_sha256, actor_binding_sha256, employee_id, employee_number, expected_primary_email, directory_customer_id, directory_user_id, primary_email, source_etag, workspace_revision, registry_revision, expires_at)
  VALUES(v_id, encode(public.digest(v_token, 'sha256'),'hex'), encode(public.digest(p_actor, 'sha256'),'hex'), p_employee_id, upper(p_employee_number), lower(trim(p_expected_primary_email)), p_customer_id, p_directory_user_id, lower(p_primary_email), p_source_etag, p_workspace_revision, p_registry_revision, v_expires);
  RETURN QUERY SELECT v_id, v_token, v_expires, p_customer_id, p_directory_user_id, lower(p_primary_email), p_source_etag;
END;
$fn$;

CREATE OR REPLACE FUNCTION orgmaster_core.confirm_managed_identity_link_v1(p_command_id text, p_employee_id text, p_candidate_token text, p_expected_workspace_revision text, p_expected_registry_revision text, p_actor text)
RETURNS TABLE(identity_record_id uuid, employee_id text, principal_id text, link_state text, revision text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE v_lease orgmaster_core.managed_identity_candidate_leases%ROWTYPE; v_id uuid; v_principal text;
BEGIN
  SELECT * INTO v_lease FROM orgmaster_core.managed_identity_candidate_leases WHERE employee_id = p_employee_id AND token_hash_sha256 = encode(public.digest(p_candidate_token, 'sha256'),'hex') FOR UPDATE;
  IF NOT FOUND OR v_lease.consumed_at IS NOT NULL THEN RAISE EXCEPTION 'MANAGED_IDENTITY_CANDIDATE_INVALID'; END IF;
  IF v_lease.invalidated_at IS NOT NULL OR v_lease.expires_at <= clock_timestamp() OR v_lease.workspace_revision IS DISTINCT FROM p_expected_workspace_revision OR v_lease.registry_revision IS DISTINCT FROM p_expected_registry_revision THEN RAISE EXCEPTION 'MANAGED_IDENTITY_CANDIDATE_EXPIRED'; END IF;
  IF EXISTS (SELECT 1 FROM orgmaster_core.managed_daily_identities WHERE directory_customer_id = v_lease.directory_customer_id AND directory_user_id = v_lease.directory_user_id AND employee_id <> p_employee_id) THEN RAISE EXCEPTION 'MANAGED_IDENTITY_IDENTITY_CONFLICT'; END IF;
  SELECT identity_record_id INTO v_id FROM orgmaster_core.managed_daily_identities WHERE employee_id = p_employee_id;
  IF v_id IS NULL THEN
    INSERT INTO orgmaster_core.managed_daily_identities(employee_id, principal_id, directory_customer_id, directory_user_id, last_verified_primary_email, link_state, created_by, updated_by)
    VALUES(p_employee_id, 'principal-managed:' || public.gen_random_uuid()::text, v_lease.directory_customer_id, v_lease.directory_user_id, v_lease.primary_email, 'directory_linked_pending_auth', p_actor, p_actor) RETURNING identity_record_id, principal_id INTO v_id, v_principal;
    INSERT INTO orgmaster_core.managed_identity_observations(identity_record_id, primary_email, directory_state, source_etag, adapter_outcome, trusted_observed_at, last_attempt_at, freshness) VALUES(v_id, v_lease.primary_email, 'present', v_lease.source_etag, 'success', clock_timestamp(), clock_timestamp(), 'fresh');
  ELSE SELECT principal_id INTO v_principal FROM orgmaster_core.managed_daily_identities WHERE identity_record_id = v_id; END IF;
  UPDATE orgmaster_core.managed_identity_candidate_leases SET consumed_at = clock_timestamp() WHERE lease_id = v_lease.lease_id;
  INSERT INTO orgmaster_core.managed_identity_command_receipts(command_id, request_hash_sha256, action, employee_id, identity_record_id, response_payload) VALUES(p_command_id, encode(public.digest(p_employee_id || p_candidate_token, 'sha256'),'hex'), 'confirm_managed_identity_link_v1', p_employee_id, v_id, jsonb_build_object('state','directory_linked_pending_auth')) ON CONFLICT (command_id) DO NOTHING;
  RETURN QUERY SELECT v_id, p_employee_id, v_principal, 'directory_linked_pending_auth', v_lease.registry_revision;
END;
$fn$;

CREATE OR REPLACE FUNCTION orgmaster_core.bind_managed_identity_auth_v1(p_employee_id text, p_issuer text, p_subject text, p_email text, p_command_id text DEFAULT NULL)
RETURNS TABLE(identity_record_id uuid, principal_id text, employee_id text, link_state text, admission_revision bigint)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE v_identity orgmaster_core.managed_daily_identities%ROWTYPE; v_admission bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton = true AND admission_enabled) THEN RAISE EXCEPTION 'MANAGED_IDENTITY_ADMISSION_DISABLED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM orgmaster_core.v_current_workspace_employees_v1 WHERE employee_id = p_employee_id AND employee_status = 'active') THEN RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND'; END IF;
  SELECT * INTO v_identity FROM orgmaster_core.managed_daily_identities WHERE employee_id = p_employee_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MANAGED_IDENTITY_CANDIDATE_INVALID'; END IF;
  IF EXISTS (SELECT 1 FROM orgmaster_core.managed_identity_lifecycle_outbox WHERE employee_id = p_employee_id AND status <> 'completed') THEN RAISE EXCEPTION 'INVALIDATION_PENDING'; END IF;
  IF lower(trim(p_email)) <> lower(v_identity.last_verified_primary_email) THEN RAISE EXCEPTION 'MANAGED_IDENTITY_IDENTITY_CONFLICT'; END IF;
  IF EXISTS (SELECT 1 FROM orgmaster_core.principal_identity_reservations WHERE principal_issuer = p_issuer AND principal_subject = p_subject AND employee_id <> p_employee_id) THEN RAISE EXCEPTION 'MANAGED_IDENTITY_IDENTITY_CONFLICT'; END IF;
  IF v_identity.auth_issuer IS NOT NULL AND (v_identity.auth_issuer <> p_issuer OR v_identity.auth_subject <> p_subject) THEN RAISE EXCEPTION 'MANAGED_IDENTITY_IDENTITY_CONFLICT'; END IF;
  IF EXISTS (SELECT 1 FROM orgmaster_contract.v_active_principal_mappings_v1 WHERE principal_issuer = p_issuer AND principal_subject = p_subject AND employee_id <> p_employee_id) THEN RAISE EXCEPTION 'MANAGED_IDENTITY_IDENTITY_CONFLICT'; END IF;
  SELECT CASE WHEN admission_enabled THEN nextval('orgmaster_core.managed_identity_mapping_version_seq') ELSE NULL END INTO v_admission FROM orgmaster_core.managed_identity_admission_authority WHERE singleton = true;
  UPDATE orgmaster_core.managed_daily_identities SET auth_issuer = p_issuer, auth_subject = p_subject, bound_at = COALESCE(bound_at, clock_timestamp()), link_state = 'active', revision = revision + 1, admission_revision = v_admission, admission_changed_at = CASE WHEN v_admission IS NULL THEN NULL ELSE clock_timestamp() END, last_verified_primary_email = lower(trim(p_email)), updated_at = clock_timestamp(), updated_by = p_issuer || ':' || p_subject WHERE identity_record_id = v_identity.identity_record_id;
  INSERT INTO orgmaster_core.principal_identity_reservations(principal_issuer, principal_subject, employee_id, first_seen_at, source_kind, source_revision) VALUES(p_issuer, p_subject, p_employee_id, clock_timestamp(), 'managed', 'managed-bind') ON CONFLICT (principal_issuer, principal_subject) DO NOTHING;
  RETURN QUERY SELECT identity_record_id, principal_id, employee_id, link_state, admission_revision FROM orgmaster_core.managed_daily_identities WHERE identity_record_id = v_identity.identity_record_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION orgmaster_core.resolve_managed_identity_alias_v1(p_employee_number text)
RETURNS TABLE(employee_id text, principal_id text, login_hint text, identity_record_id uuid, directory_customer_id text, directory_user_id text, link_state text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
  SELECT a.employee_id, i.principal_id, i.last_verified_primary_email, i.identity_record_id, i.directory_customer_id, i.directory_user_id, i.link_state
  FROM orgmaster_core.employee_number_assignments a JOIN orgmaster_core.managed_daily_identities i ON i.employee_id = a.employee_id
  JOIN orgmaster_core.managed_identity_admission_authority aa ON aa.singleton = true AND aa.admission_enabled
  JOIN orgmaster_core.v_current_workspace_employees_v1 e ON e.employee_id = a.employee_id AND e.employee_status = 'active'
  WHERE a.employee_number = upper(trim(p_employee_number)) AND i.link_state = 'active';
$fn$;

CREATE OR REPLACE FUNCTION orgmaster_core.reserve_managed_directory_read_v1()
RETURNS TABLE(allowed boolean, retry_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE v_grants timestamptz[]; v_now timestamptz := clock_timestamp(); v_oldest timestamptz;
BEGIN
  SELECT granted_at INTO v_grants
    FROM orgmaster_core.managed_identity_directory_read_budget
   WHERE singleton = true
   FOR UPDATE;
  SELECT array_agg(t ORDER BY t) INTO v_grants
    FROM unnest(COALESCE(v_grants, '{}'::timestamptz[])) t
   WHERE t > v_now - interval '60 seconds';
  v_grants := COALESCE(v_grants, '{}'::timestamptz[]);
  IF cardinality(v_grants) >= 60 THEN SELECT min(t) INTO v_oldest FROM unnest(v_grants) t; UPDATE orgmaster_core.managed_identity_directory_read_budget SET granted_at = v_grants WHERE singleton = true; RETURN QUERY SELECT false, v_oldest + interval '60 seconds'; RETURN; END IF;
  v_grants := array_append(v_grants, v_now); UPDATE orgmaster_core.managed_identity_directory_read_budget SET granted_at = v_grants WHERE singleton = true; RETURN QUERY SELECT true, NULL::timestamptz;
END;
$fn$;

CREATE OR REPLACE FUNCTION orgmaster_core.enqueue_managed_identity_refresh_v1(p_employee_id text, p_trigger text, p_command_id text, p_actor text)
RETURNS TABLE(disposition text, request_id uuid, request_sequence bigint)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE v_identity uuid; v_existing uuid; v_id uuid := public.gen_random_uuid(); v_seq bigint;
BEGIN
  SELECT identity_record_id INTO v_identity FROM orgmaster_core.managed_daily_identities WHERE employee_id = p_employee_id;
  IF v_identity IS NULL THEN RAISE EXCEPTION 'MANAGED_IDENTITY_CANDIDATE_INVALID'; END IF;
  SELECT request_id INTO v_existing FROM orgmaster_core.managed_identity_refresh_outbox WHERE identity_record_id = v_identity AND state IN ('queued','leased','retry') FOR UPDATE;
  IF v_existing IS NOT NULL AND p_trigger <> 'domain' THEN RETURN QUERY SELECT 'deduplicated', v_existing, NULL::bigint; RETURN; END IF;
  IF v_existing IS NOT NULL THEN UPDATE orgmaster_core.managed_identity_refresh_outbox SET rerun_requested = true, updated_at = clock_timestamp() WHERE request_id = v_existing; RETURN QUERY SELECT 'deduplicated', v_existing, NULL::bigint; RETURN; END IF;
  SELECT nextval('orgmaster_core.managed_identity_refresh_request_seq') INTO v_seq;
  INSERT INTO orgmaster_core.managed_identity_refresh_outbox(request_id, identity_record_id, trigger, state, request_sequence, available_at) VALUES(v_id, v_identity, p_trigger, 'queued', v_seq, clock_timestamp());
  RETURN QUERY SELECT 'queued', v_id, v_seq;
END;
$fn$;

CREATE OR REPLACE FUNCTION orgmaster_core.claim_managed_identity_refresh_v1(p_worker_id text, p_limit integer DEFAULT 2, p_lease_seconds integer DEFAULT 30)
RETURNS TABLE(claim_kind text, request_id uuid, identity_record_id uuid, employee_id text, directory_customer_id text, directory_user_id text, request_sequence bigint, attempt_count integer, lease_version bigint, lease_until timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
BEGIN
  RETURN QUERY WITH candidates AS (SELECT o.request_id FROM orgmaster_core.managed_identity_refresh_outbox o WHERE (o.state IN ('queued','retry') OR (o.state = 'leased' AND o.lease_until <= clock_timestamp())) AND o.available_at <= clock_timestamp() AND o.attempt_count < 5 ORDER BY o.request_sequence FOR UPDATE SKIP LOCKED LIMIT LEAST(GREATEST(p_limit,1),2)), changed AS (UPDATE orgmaster_core.managed_identity_refresh_outbox o SET state='leased', attempt_count=o.attempt_count+1, lease_version=o.lease_version+1, lease_worker_id=p_worker_id, lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds), updated_at=clock_timestamp() FROM candidates c WHERE o.request_id=c.request_id RETURNING o.*) SELECT 'leased', c.request_id, c.identity_record_id, i.employee_id, i.directory_customer_id, i.directory_user_id, c.request_sequence, c.attempt_count, c.lease_version, c.lease_until FROM changed c JOIN orgmaster_core.managed_daily_identities i ON i.identity_record_id=c.identity_record_id;
  RETURN QUERY SELECT 'terminal_due', o.request_id, o.identity_record_id, i.employee_id, i.directory_customer_id, i.directory_user_id, o.request_sequence, o.attempt_count, o.lease_version, o.lease_until FROM orgmaster_core.managed_identity_refresh_outbox o JOIN orgmaster_core.managed_daily_identities i ON i.identity_record_id=o.identity_record_id WHERE o.state='leased' AND o.lease_until <= clock_timestamp() AND o.attempt_count >= 5 LIMIT LEAST(GREATEST(p_limit,1),2);
END;
$fn$;

CREATE OR REPLACE FUNCTION orgmaster_core.complete_managed_identity_refresh_v1(p_request_id uuid, p_worker_id text, p_lease_version bigint, p_directory_customer_id text, p_directory_user_id text, p_directory_state text, p_primary_email text, p_source_etag text, p_adapter_outcome text)
RETURNS TABLE(disposition text, request_id uuid, identity_record_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE v_row orgmaster_core.managed_identity_refresh_outbox%ROWTYPE; v_identity orgmaster_core.managed_daily_identities%ROWTYPE;
BEGIN
  PERFORM 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton=true FOR UPDATE;
  SELECT * INTO v_row FROM orgmaster_core.managed_identity_refresh_outbox WHERE request_id=p_request_id AND state='leased' AND lease_worker_id=p_worker_id AND lease_version=p_lease_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MANAGED_IDENTITY_REFRESH_LEASE_CONFLICT'; END IF;
  SELECT * INTO v_identity FROM orgmaster_core.managed_daily_identities WHERE identity_record_id=v_row.identity_record_id FOR UPDATE;
  IF v_identity.directory_customer_id <> p_directory_customer_id OR v_identity.directory_user_id <> p_directory_user_id THEN RAISE EXCEPTION 'MANAGED_IDENTITY_REFRESH_LEASE_CONFLICT'; END IF;
  IF p_directory_state IN ('missing','suspended','archived') AND v_identity.link_state <> 'conflict' THEN
    IF EXISTS (SELECT 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton=true AND admission_enabled) THEN PERFORM orgmaster_core.enqueue_managed_identity_lifecycle_invalidations_v1(v_identity.employee_id, 'managed-refresh:' || p_request_id::text, p_worker_id, 'managed_directory_known_negative'); END IF;
    UPDATE orgmaster_core.managed_daily_identities SET link_state='conflict', revision=revision+1, admission_revision=nextval('orgmaster_core.managed_identity_mapping_version_seq'), admission_changed_at=clock_timestamp(), updated_at=clock_timestamp(), updated_by=p_worker_id WHERE identity_record_id=v_identity.identity_record_id;
  END IF;
  INSERT INTO orgmaster_core.managed_identity_observations(identity_record_id, primary_email, directory_state, source_etag, last_applied_request_sequence, adapter_outcome, trusted_observed_at, last_attempt_at, freshness) VALUES(v_row.identity_record_id, p_primary_email, p_directory_state, p_source_etag, v_row.request_sequence, p_adapter_outcome, clock_timestamp(), clock_timestamp(), 'fresh') ON CONFLICT(identity_record_id) DO UPDATE SET primary_email=EXCLUDED.primary_email, directory_state=EXCLUDED.directory_state, source_etag=EXCLUDED.source_etag, last_applied_request_sequence=EXCLUDED.last_applied_request_sequence, adapter_outcome=EXCLUDED.adapter_outcome, trusted_observed_at=EXCLUDED.trusted_observed_at, last_attempt_at=EXCLUDED.last_attempt_at, freshness='fresh';
  UPDATE orgmaster_core.managed_identity_refresh_outbox SET state='completed', completion_disposition=CASE WHEN rerun_requested THEN 'superseded' ELSE 'applied' END, lease_worker_id=NULL, lease_until=NULL, completed_at=clock_timestamp(), updated_at=clock_timestamp() WHERE request_id=p_request_id;
  IF v_row.rerun_requested THEN INSERT INTO orgmaster_core.managed_identity_refresh_outbox(identity_record_id, trigger, state, request_sequence, available_at) VALUES(v_row.identity_record_id, 'domain', 'queued', nextval('orgmaster_core.managed_identity_refresh_request_seq'), clock_timestamp()); END IF;
  RETURN QUERY SELECT CASE WHEN v_row.rerun_requested THEN 'superseded' ELSE 'applied' END, p_request_id, v_row.identity_record_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION orgmaster_core.retry_managed_identity_refresh_v1(p_request_id uuid, p_worker_id text, p_lease_version bigint, p_error_code text)
RETURNS TABLE(disposition text, request_id uuid, identity_record_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE v_row orgmaster_core.managed_identity_refresh_outbox%ROWTYPE; v_state text;
BEGIN
  SELECT * INTO v_row FROM orgmaster_core.managed_identity_refresh_outbox WHERE request_id=p_request_id AND state='leased' AND lease_worker_id=p_worker_id AND lease_version=p_lease_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MANAGED_IDENTITY_REFRESH_LEASE_CONFLICT'; END IF;
  v_state := CASE WHEN v_row.attempt_count >= 5 OR p_error_code NOT IN ('TIMEOUT','RATE_LIMITED','DIRECTORY_READ_UNAVAILABLE') THEN 'dead' ELSE 'retry' END;
  UPDATE orgmaster_core.managed_identity_refresh_outbox SET state=v_state, last_error_code=left(p_error_code,255), lease_worker_id=NULL, lease_until=NULL, completion_disposition=CASE WHEN v_state='dead' THEN 'terminal' ELSE NULL END, available_at=clock_timestamp()+CASE WHEN v_state='retry' THEN make_interval(secs=>power(2,v_row.attempt_count-1)::integer) ELSE interval '0' END, completed_at=CASE WHEN v_state='dead' THEN clock_timestamp() ELSE NULL END, updated_at=clock_timestamp() WHERE request_id=p_request_id;
  RETURN QUERY SELECT CASE WHEN v_state='dead' THEN 'terminal' ELSE 'superseded' END, p_request_id, v_row.identity_record_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION orgmaster_core.prune_managed_identity_ephemera_v1(p_limit integer)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE v_count integer;
BEGIN
  WITH doomed AS (SELECT lease_id FROM orgmaster_core.managed_identity_candidate_leases WHERE expires_at < clock_timestamp()-interval '7 days' OR consumed_at < clock_timestamp()-interval '7 days' LIMIT LEAST(GREATEST(p_limit,1),500)) DELETE FROM orgmaster_core.managed_identity_candidate_leases l USING doomed d WHERE l.lease_id=d.lease_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; RETURN v_count;
END;
$fn$;

CREATE OR REPLACE FUNCTION orgmaster_core.read_managed_identity_activation_preflight_v1()
RETURNS TABLE(active_application_count integer, verified_application_count integer, eligible_identity_count integer, pending_invalidation_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
 SELECT count(*) FILTER (WHERE status='active')::integer, count(*) FILTER (WHERE support_state='verified')::integer, (SELECT count(*)::integer FROM orgmaster_core.managed_daily_identities i JOIN orgmaster_core.v_current_workspace_employees_v1 e ON e.employee_id=i.employee_id AND e.employee_status='active' JOIN orgmaster_core.managed_identity_observations o ON o.identity_record_id=i.identity_record_id AND o.directory_state='present' WHERE i.link_state='active' AND i.auth_issuer IS NOT NULL AND i.auth_subject IS NOT NULL), (SELECT count(*)::integer FROM orgmaster_core.managed_identity_lifecycle_outbox WHERE status <> 'completed') FROM orgmaster_core.managed_identity_invalidation_applications;
$fn$;

CREATE OR REPLACE FUNCTION orgmaster_core.attest_managed_identity_invalidation_support_v1(p_application_id text, p_expected_support_revision bigint, p_evidence_ref text, p_actor text)
RETURNS TABLE(application_id text, support_revision bigint, support_state text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE v_row orgmaster_core.managed_identity_invalidation_applications%ROWTYPE;
BEGIN
  IF char_length(trim(p_application_id)) < 1 OR char_length(trim(p_evidence_ref)) < 1 OR char_length(trim(p_actor)) < 1 THEN RAISE EXCEPTION 'SUPPORT_ATTESTATION_INVALID'; END IF;
  SELECT * INTO v_row FROM orgmaster_core.managed_identity_invalidation_applications WHERE application_id=trim(p_application_id) FOR UPDATE;
  IF NOT FOUND THEN
    IF p_expected_support_revision <> 0 THEN RAISE EXCEPTION 'REVISION_CONFLICT'; END IF;
    INSERT INTO orgmaster_core.managed_identity_invalidation_applications(application_id,status,support_state,support_revision,support_evidence_ref,support_verified_at,support_verified_by,updated_at) VALUES(trim(p_application_id),'inactive','verified',1,trim(p_evidence_ref),clock_timestamp(),trim(p_actor),clock_timestamp()) RETURNING * INTO v_row;
  ELSIF v_row.support_revision <> p_expected_support_revision THEN
    RAISE EXCEPTION 'REVISION_CONFLICT';
  ELSIF v_row.support_state = 'verified' AND v_row.support_evidence_ref = trim(p_evidence_ref) THEN
    NULL;
  ELSE
    UPDATE orgmaster_core.managed_identity_invalidation_applications SET support_revision=support_revision+1,support_state='verified',support_evidence_ref=trim(p_evidence_ref),support_verified_at=clock_timestamp(),support_verified_by=trim(p_actor),updated_at=clock_timestamp() WHERE application_id=v_row.application_id RETURNING * INTO v_row;
  END IF;
  RETURN QUERY SELECT a.application_id,a.support_revision,a.support_state FROM orgmaster_core.managed_identity_invalidation_applications a WHERE a.application_id=trim(p_application_id);
END;
$fn$;

CREATE OR REPLACE FUNCTION orgmaster_core.quarantine_managed_identity_v1(p_identity_record_id uuid, p_expected_revision bigint, p_incident_ref text, p_actor text, p_reason_code text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE v_identity orgmaster_core.managed_daily_identities%ROWTYPE; v_authority orgmaster_core.managed_identity_admission_authority%ROWTYPE; v_admission bigint;
BEGIN
  IF char_length(trim(p_incident_ref)) < 1 THEN RAISE EXCEPTION 'INCIDENT_REFERENCE_REQUIRED'; END IF;
  SELECT * INTO v_authority FROM orgmaster_core.managed_identity_admission_authority WHERE singleton=true FOR UPDATE;
  SELECT * INTO v_identity FROM orgmaster_core.managed_daily_identities WHERE identity_record_id=p_identity_record_id FOR UPDATE;
  IF NOT FOUND OR v_identity.revision <> p_expected_revision THEN RAISE EXCEPTION 'REVISION_CONFLICT'; END IF;
  IF v_identity.link_state = 'active' THEN
    IF v_authority.admission_enabled THEN PERFORM orgmaster_core.enqueue_managed_identity_lifecycle_invalidations_v1(v_identity.employee_id, 'managed-quarantine:' || p_identity_record_id::text, p_actor, p_reason_code); END IF;
    v_admission := nextval('orgmaster_core.managed_identity_mapping_version_seq');
  END IF;
  UPDATE orgmaster_core.managed_daily_identities SET link_state='conflict', revision=revision+1, admission_revision=COALESCE(v_admission, admission_revision), admission_changed_at=CASE WHEN v_admission IS NULL THEN admission_changed_at ELSE clock_timestamp() END, updated_at=clock_timestamp(), updated_by=p_actor WHERE identity_record_id=p_identity_record_id;
  INSERT INTO orgmaster_core.managed_identity_audit_events(action, actor, employee_id, identity_record_id, result, reason_code, details, occurred_at) VALUES ('managed_identity_quarantined', p_actor, v_identity.employee_id, v_identity.identity_record_id, 'applied', trim(p_reason_code), jsonb_build_object('incidentRef', trim(p_incident_ref)), clock_timestamp());
  RETURN true;
END;
$fn$;

CREATE OR REPLACE FUNCTION orgmaster_core.enqueue_managed_identity_lifecycle_invalidations_v1(p_employee_id text, p_operation_id text, p_actor text, p_reason_code text)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE v_count integer := 0; v_application record;
BEGIN
  FOR v_application IN SELECT application_id, support_state FROM orgmaster_core.managed_identity_invalidation_applications WHERE status = 'active' ORDER BY application_id FOR UPDATE LOOP
    IF v_application.support_state <> 'verified' THEN RAISE EXCEPTION 'INVALIDATION_APPLICATION_UNREADY'; END IF;
    INSERT INTO orgmaster_core.managed_identity_lifecycle_outbox(operation_id, employee_id, application_id, event_kind, actor, reason_code, status, next_attempt_at)
    VALUES (trim(p_operation_id), trim(p_employee_id), v_application.application_id, 'managed_identity_lifecycle_changed', trim(p_actor), trim(p_reason_code), 'pending', clock_timestamp())
    ON CONFLICT (operation_id, employee_id, application_id) DO NOTHING;
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;
  RETURN v_count;
END;
$fn$;

CREATE OR REPLACE FUNCTION orgmaster_core.claim_managed_identity_lifecycle_invalidations_v1(p_worker_id text, p_limit integer DEFAULT 16, p_lease_seconds integer DEFAULT 30)
RETURNS TABLE(event_id uuid, operation_id text, employee_id text, application_id text, event_kind text, actor text, reason_code text, attempt_count integer, lease_until timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
BEGIN
  RETURN QUERY WITH candidates AS (
    SELECT o.event_id FROM orgmaster_core.managed_identity_lifecycle_outbox o
    WHERE (o.status IN ('pending','failed') OR (o.status = 'processing' AND o.lease_until <= clock_timestamp())) AND o.next_attempt_at <= clock_timestamp()
    ORDER BY o.created_at, o.event_id FOR UPDATE SKIP LOCKED LIMIT LEAST(GREATEST(p_limit,1),64)
  ), claimed AS (
    UPDATE orgmaster_core.managed_identity_lifecycle_outbox o SET status='processing', attempt_count=o.attempt_count+1, worker_id=p_worker_id, lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds)
    FROM candidates c WHERE o.event_id=c.event_id RETURNING o.*
  ) SELECT event_id, operation_id, employee_id, application_id, event_kind, actor, reason_code, attempt_count, lease_until FROM claimed;
END;
$fn$;

CREATE OR REPLACE FUNCTION orgmaster_core.complete_managed_identity_lifecycle_invalidation_v1(p_event_id uuid, p_worker_id text, p_platform_receipt_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
BEGIN
  UPDATE orgmaster_core.managed_identity_lifecycle_outbox SET status='completed', worker_id=NULL, lease_until=NULL, platform_receipt_id=p_platform_receipt_id, completed_at=clock_timestamp() WHERE event_id=p_event_id AND status='processing' AND worker_id=p_worker_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'MANAGED_IDENTITY_LIFECYCLE_LEASE_CONFLICT'; END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION orgmaster_core.retry_managed_identity_lifecycle_invalidation_v1(p_event_id uuid, p_worker_id text, p_error_code text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
BEGIN
  UPDATE orgmaster_core.managed_identity_lifecycle_outbox SET status=CASE WHEN attempt_count >= 5 THEN 'failed' ELSE 'failed' END, worker_id=NULL, lease_until=NULL, last_error_code=left(p_error_code,255), next_attempt_at=clock_timestamp()+CASE WHEN attempt_count >= 5 THEN interval '1 hour' ELSE make_interval(secs=>power(2, greatest(attempt_count-1,0))::integer) END WHERE event_id=p_event_id AND status='processing' AND worker_id=p_worker_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'MANAGED_IDENTITY_LIFECYCLE_LEASE_CONFLICT'; END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION orgmaster_core.set_managed_identity_admission_v1(p_expected_revision bigint, p_enabled boolean, p_actor text, p_reason_code text)
RETURNS TABLE(revision bigint, admission_enabled boolean, affected_identity_count integer, outbox_count integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE v_authority orgmaster_core.managed_identity_admission_authority%ROWTYPE; v_revision bigint; v_outbox_count integer := 0; v_identity record;
BEGIN
  SELECT * INTO v_authority FROM orgmaster_core.managed_identity_admission_authority WHERE singleton=true FOR UPDATE;
  IF v_authority.revision <> p_expected_revision THEN RAISE EXCEPTION 'REVISION_CONFLICT'; END IF;
  IF v_authority.admission_enabled = p_enabled THEN RETURN QUERY SELECT v_authority.revision,p_enabled,0,0; RETURN; END IF;
  IF p_enabled AND NOT EXISTS (SELECT 1 FROM orgmaster_core.managed_identity_invalidation_applications WHERE application_id='orgmaster' AND status='active') THEN RAISE EXCEPTION 'ORGMASTER_APPLICATION_UNREADY'; END IF;
  IF p_enabled AND EXISTS (SELECT 1 FROM orgmaster_core.managed_identity_invalidation_applications WHERE status='active' AND support_state <> 'verified') THEN RAISE EXCEPTION 'INVALIDATION_APPLICATION_UNREADY'; END IF;
  IF p_enabled AND EXISTS (SELECT 1 FROM orgmaster_core.managed_identity_lifecycle_outbox WHERE status <> 'completed') THEN RAISE EXCEPTION 'INVALIDATION_PENDING'; END IF;
  v_revision := nextval('orgmaster_core.managed_identity_mapping_version_seq');
  IF NOT p_enabled THEN
    FOR v_identity IN SELECT employee_id FROM orgmaster_core.managed_daily_identities WHERE link_state = 'active' FOR UPDATE LOOP
      v_outbox_count := v_outbox_count + orgmaster_core.enqueue_managed_identity_lifecycle_invalidations_v1(v_identity.employee_id, 'managed-admission:' || v_revision::text, p_actor, p_reason_code);
    END LOOP;
    UPDATE orgmaster_core.managed_daily_identities SET admission_revision = v_revision, admission_changed_at = clock_timestamp(), revision = revision + 1, updated_at = clock_timestamp(), updated_by = p_actor WHERE link_state = 'active';
  END IF;
  UPDATE orgmaster_core.managed_identity_admission_authority SET admission_enabled=p_enabled, revision=v_revision, updated_at=clock_timestamp(), updated_by=p_actor, reason_code=p_reason_code WHERE singleton=true;
  RETURN QUERY SELECT v_revision,p_enabled,(SELECT count(*)::integer FROM orgmaster_core.managed_daily_identities WHERE link_state='active'),v_outbox_count;
END;
$fn$;

CREATE OR REPLACE FUNCTION orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v1(p_changes jsonb, p_source_revision text, p_updated_by text, p_reason_code text, p_operation_id text, p_entitlement_changes jsonb DEFAULT '[]'::jsonb)
RETURNS TABLE(authority_version bigint, source_revision text, outbox_count integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
BEGIN
  IF jsonb_typeof(p_changes) <> 'array' OR char_length(p_operation_id) NOT BETWEEN 1 AND 255 THEN RAISE EXCEPTION 'PERSISTENCE_CHANGE_INVALID'; END IF;
  RETURN QUERY SELECT w.authority_version, w.source_revision, 0 FROM orgmaster_core.write_active_persistence_artifacts_v1(p_changes,p_source_revision,p_updated_by,p_reason_code) w;
END;
$fn$;

-- Additive managed rows to the existing active-principal contract.  The old
-- contract remains readable and the managed branch is still admission-gated.
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
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(version.payload#>'{policy,roleAssignments}') = 'array' THEN version.payload#>'{policy,roleAssignments}' ELSE '[]'::jsonb END) assignment(value)
      WHERE assignment.value->>'employeeId' = identity.value->>'employeeId' AND assignment.value->>'applicationId' = 'orgmaster' AND assignment.value->>'status' = 'active' AND assignment.value#>>'{scope,kind}' = 'global'
        AND (assignment.value->>'validFrom' IS NULL OR (assignment.value->>'validFrom')::timestamptz <= CURRENT_TIMESTAMP)
        AND (assignment.value->>'validTo' IS NULL OR (assignment.value->>'validTo')::timestamptz > CURRENT_TIMESTAMP)
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(version.payload#>'{policy,applicationRoles}') = 'array' THEN version.payload#>'{policy,applicationRoles}' ELSE '[]'::jsonb END) role(value) WHERE role.value->>'id' = assignment.value->>'roleId' AND role.value->>'applicationId' = 'orgmaster' AND role.value->>'status' = 'active')
    )
)
SELECT 'organization.active-principal.v1'::text, identity_payload->>'issuer', identity_payload->>'subject', identity_payload->>'principalId', employee_id, employee_status, (version_payload->>'versionNumber')::bigint, (version_payload->>'publishedAt')::timestamptz
FROM legacy_candidates
UNION ALL
SELECT 'organization.active-principal.v1', i.auth_issuer, i.auth_subject, i.principal_id, i.employee_id, e.employee_status, i.admission_revision, i.admission_changed_at
FROM orgmaster_core.managed_daily_identities i
JOIN orgmaster_core.v_current_workspace_employees_v1 e ON e.employee_id=i.employee_id AND e.employee_status='active'
JOIN orgmaster_core.managed_identity_admission_authority aa ON aa.singleton=true AND aa.admission_enabled
WHERE i.link_state='active' AND i.auth_issuer IS NOT NULL AND i.auth_subject IS NOT NULL AND i.admission_revision IS NOT NULL AND i.admission_changed_at IS NOT NULL
  AND EXISTS (SELECT 1 FROM orgmaster_core.managed_identity_observations o WHERE o.identity_record_id=i.identity_record_id AND o.directory_state='present');

ALTER SEQUENCE orgmaster_core.managed_identity_mapping_version_seq OWNER TO jenfu_orgmaster_migrator;
ALTER SEQUENCE orgmaster_core.managed_identity_refresh_request_seq OWNER TO jenfu_orgmaster_migrator;
DO $owner$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.relname, c.relkind FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='orgmaster_core' AND c.relname IN ('employee_number_assignments','employee_number_tombstones','employee_number_legacy_exemptions','managed_identity_directory_read_budget','managed_identity_admission_authority','managed_identity_invalidation_applications','managed_daily_identities','managed_identity_observations','managed_identity_candidate_leases','managed_identity_command_receipts','managed_identity_refresh_outbox','principal_identity_reservations','managed_identity_audit_events','managed_identity_lifecycle_outbox','v_current_workspace_employees_v1') LOOP EXECUTE format('ALTER %s orgmaster_core.%I OWNER TO jenfu_orgmaster_migrator', CASE WHEN r.relkind='v' THEN 'VIEW' ELSE 'TABLE' END, r.relname); END LOOP;
END;
$owner$;

REVOKE ALL ON ALL TABLES IN SCHEMA orgmaster_core FROM PUBLIC, jenfu_orgmaster_runtime, jenfu_platform_runtime, jenfu_ai_pdm_runtime;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA orgmaster_core FROM PUBLIC, jenfu_orgmaster_runtime, jenfu_platform_runtime, jenfu_ai_pdm_runtime;
REVOKE ALL ON FUNCTION orgmaster_core.write_active_persistence_artifacts_v1(jsonb,text,text,text) FROM jenfu_orgmaster_runtime;
REVOKE ALL ON FUNCTION orgmaster_core.write_active_persistence_artifacts_with_entitlement_outbox_v1(jsonb,text,text,text,jsonb) FROM jenfu_orgmaster_runtime;
GRANT USAGE ON SCHEMA orgmaster_core, orgmaster_contract TO jenfu_orgmaster_runtime;
GRANT EXECUTE ON FUNCTION orgmaster_core.read_employee_managed_identity_v1(text), orgmaster_core.resolve_managed_identity_auth_v1(text), orgmaster_core.assign_employee_number_v1(text,text,text,text,text,timestamptz), orgmaster_core.lease_managed_identity_candidate_v1(text,text,text,text,text,text,text,text,text,text), orgmaster_core.confirm_managed_identity_link_v1(text,text,text,text,text,text), orgmaster_core.bind_managed_identity_auth_v1(text,text,text,text,text), orgmaster_core.resolve_managed_identity_alias_v1(text), orgmaster_core.reserve_managed_directory_read_v1(), orgmaster_core.enqueue_managed_identity_refresh_v1(text,text,text,text), orgmaster_core.claim_managed_identity_refresh_v1(text,integer,integer), orgmaster_core.complete_managed_identity_refresh_v1(uuid,text,bigint,text,text,text,text,text,text,text), orgmaster_core.retry_managed_identity_refresh_v1(uuid,text,bigint,text), orgmaster_core.prune_managed_identity_ephemera_v1(integer), orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v1(jsonb,text,text,text,text,jsonb) TO jenfu_orgmaster_runtime;
GRANT SELECT ON orgmaster_contract.v_active_principal_mappings_v1 TO jenfu_orgmaster_runtime, jenfu_platform_runtime, jenfu_ai_pdm_runtime;
GRANT EXECUTE ON FUNCTION orgmaster_core.read_managed_identity_activation_preflight_v1(), orgmaster_core.attest_managed_identity_invalidation_support_v1(text,bigint,text,text), orgmaster_core.quarantine_managed_identity_v1(uuid,bigint,text,text,text), orgmaster_core.enqueue_managed_identity_lifecycle_invalidations_v1(text,text,text,text), orgmaster_core.claim_managed_identity_lifecycle_invalidations_v1(text,integer,integer), orgmaster_core.complete_managed_identity_lifecycle_invalidation_v1(uuid,text,uuid), orgmaster_core.retry_managed_identity_lifecycle_invalidation_v1(uuid,text,text), orgmaster_core.set_managed_identity_admission_v1(bigint,boolean,text,text) TO jenfu_orgmaster_migrator;

COMMIT;
