-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: orgmaster.projed-principal.v1
-- compatibility: additive
-- governance-review: DEV-057
-- Additive to the current 001-040 source baseline; no applied bytes change.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_orgmaster_migrator;
LOCK TABLE orgmaster_core.principal_identity_reservations,
  orgmaster_core.principal_ownership_reservations IN SHARE ROW EXCLUSIVE MODE;

-- One global ownership fence for old employee writers and new personal users.
-- V1 tables/contracts stay Employee-only and retain all historical rows.
CREATE TABLE orgmaster_core.principal_owners_v2 (
  principal_id text PRIMARY KEY CHECK (length(principal_id) BETWEEN 1 AND 255),
  principal_kind text NOT NULL CHECK (principal_kind IN ('employee','personal')),
  employee_id text NULL,
  account_type text NOT NULL CHECK (account_type IN ('human_personal','human_privileged')),
  first_seen_at timestamptz NOT NULL,
  source_revision text NOT NULL,
  CHECK ((principal_kind='employee' AND employee_id IS NOT NULL AND length(employee_id) BETWEEN 1 AND 255)
    OR (principal_kind='personal' AND employee_id IS NULL AND account_type='human_personal'))
);
CREATE TABLE orgmaster_core.principal_subjects_v2 (
  principal_issuer text NOT NULL CHECK (length(principal_issuer) BETWEEN 1 AND 255),
  principal_subject text NOT NULL CHECK (length(principal_subject) BETWEEN 1 AND 255),
  principal_id text NULL REFERENCES orgmaster_core.principal_owners_v2(principal_id) ON DELETE RESTRICT,
  principal_kind text NOT NULL CHECK (principal_kind IN ('employee','personal')),
  employee_id text NULL,
  first_seen_at timestamptz NOT NULL,
  source_revision text NOT NULL,
  PRIMARY KEY (principal_issuer,principal_subject),
  CHECK ((principal_kind='employee' AND employee_id IS NOT NULL AND length(employee_id) BETWEEN 1 AND 255)
    OR (principal_kind='personal' AND employee_id IS NULL AND principal_id IS NOT NULL))
);
CREATE INDEX principal_subjects_v2_principal_idx ON orgmaster_core.principal_subjects_v2(principal_id);
INSERT INTO orgmaster_core.principal_owners_v2
SELECT principal_id,'employee',employee_id,account_type,first_seen_at,source_revision
FROM orgmaster_core.principal_ownership_reservations;
INSERT INTO orgmaster_core.principal_subjects_v2
SELECT principal_issuer,principal_subject,principal_id,'employee',employee_id,first_seen_at,source_revision
FROM orgmaster_core.principal_identity_reservations;

CREATE FUNCTION orgmaster_core.guard_principal_owner_v2() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  RAISE EXCEPTION 'PRINCIPAL_OWNERSHIP_IMMUTABLE';
END;
$fn$;
CREATE TRIGGER principal_owner_v2_immutable BEFORE UPDATE OR DELETE
ON orgmaster_core.principal_owners_v2 FOR EACH ROW
EXECUTE FUNCTION orgmaster_core.guard_principal_owner_v2();

CREATE FUNCTION orgmaster_core.guard_principal_subject_v2() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE owner_row orgmaster_core.principal_owners_v2%ROWTYPE;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'PRINCIPAL_IDENTITY_RESERVATION_IMMUTABLE'; END IF;
  IF TG_OP='UPDATE' AND (
    NEW.principal_issuer IS DISTINCT FROM OLD.principal_issuer
    OR NEW.principal_subject IS DISTINCT FROM OLD.principal_subject
    OR NEW.principal_kind IS DISTINCT FROM OLD.principal_kind
    OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
    OR NEW.first_seen_at IS DISTINCT FROM OLD.first_seen_at
    OR NEW.source_revision IS DISTINCT FROM OLD.source_revision
    OR (OLD.principal_id IS NOT NULL AND NEW.principal_id IS DISTINCT FROM OLD.principal_id)
  ) THEN RAISE EXCEPTION 'PRINCIPAL_IDENTITY_RESERVATION_IMMUTABLE'; END IF;
  IF NEW.principal_id IS NOT NULL THEN
    SELECT * INTO owner_row FROM orgmaster_core.principal_owners_v2 WHERE principal_id=NEW.principal_id;
    IF NOT FOUND OR owner_row.principal_kind IS DISTINCT FROM NEW.principal_kind
      OR owner_row.employee_id IS DISTINCT FROM NEW.employee_id THEN
      RAISE EXCEPTION 'PRINCIPAL_OWNERSHIP_CONFLICT';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER principal_subject_v2_guard BEFORE INSERT OR UPDATE OR DELETE
ON orgmaster_core.principal_subjects_v2 FOR EACH ROW
EXECUTE FUNCTION orgmaster_core.guard_principal_subject_v2();

-- These triggers run before ON CONFLICT as well: a legacy writer cannot claim
-- a personal provider pair through its former Employee-only assumptions.
CREATE FUNCTION orgmaster_core.mirror_employee_reservation_v2() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE owner_row orgmaster_core.principal_owners_v2%ROWTYPE;
        pair_row orgmaster_core.principal_subjects_v2%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='principal_ownership_reservations' THEN
    INSERT INTO orgmaster_core.principal_owners_v2
      VALUES(NEW.principal_id,'employee',NEW.employee_id,NEW.account_type,NEW.first_seen_at,NEW.source_revision)
      ON CONFLICT(principal_id) DO NOTHING;
    SELECT * INTO owner_row FROM orgmaster_core.principal_owners_v2 WHERE principal_id=NEW.principal_id FOR UPDATE;
    IF owner_row.principal_kind<>'employee' OR owner_row.employee_id IS DISTINCT FROM NEW.employee_id
      OR owner_row.account_type IS DISTINCT FROM NEW.account_type THEN
      RAISE EXCEPTION 'PRINCIPAL_OWNERSHIP_CONFLICT';
    END IF;
  ELSE
    INSERT INTO orgmaster_core.principal_subjects_v2
      VALUES(NEW.principal_issuer,NEW.principal_subject,NEW.principal_id,'employee',NEW.employee_id,NEW.first_seen_at,NEW.source_revision)
      ON CONFLICT(principal_issuer,principal_subject) DO NOTHING;
    SELECT * INTO pair_row FROM orgmaster_core.principal_subjects_v2
      WHERE principal_issuer=NEW.principal_issuer AND principal_subject=NEW.principal_subject FOR UPDATE;
    IF pair_row.principal_kind<>'employee' OR pair_row.employee_id IS DISTINCT FROM NEW.employee_id
      OR (pair_row.principal_id IS NOT NULL AND NEW.principal_id IS NOT NULL
        AND pair_row.principal_id IS DISTINCT FROM NEW.principal_id) THEN
      RAISE EXCEPTION 'PRINCIPAL_OWNERSHIP_CONFLICT';
    END IF;
    IF pair_row.principal_id IS NULL AND NEW.principal_id IS NOT NULL THEN
      UPDATE orgmaster_core.principal_subjects_v2 SET principal_id=NEW.principal_id
       WHERE principal_issuer=NEW.principal_issuer AND principal_subject=NEW.principal_subject;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER employee_owner_global_fence_v2 BEFORE INSERT
ON orgmaster_core.principal_ownership_reservations FOR EACH ROW
EXECUTE FUNCTION orgmaster_core.mirror_employee_reservation_v2();
-- V1's managed guard fills NEW.principal_id. Run after that guard, while still
-- running BEFORE INSERT/ON CONFLICT so old writers cannot bypass the fence.
CREATE TRIGGER zz_employee_subject_global_fence_v2 BEFORE INSERT OR UPDATE
ON orgmaster_core.principal_identity_reservations FOR EACH ROW
EXECUTE FUNCTION orgmaster_core.mirror_employee_reservation_v2();

CREATE SEQUENCE orgmaster_core.projed_principal_revision_seq;
CREATE TABLE orgmaster_core.projed_principal_admissions (
  principal_id text PRIMARY KEY REFERENCES orgmaster_core.principal_owners_v2(principal_id) ON DELETE RESTRICT,
  google_subject text NOT NULL UNIQUE CHECK (length(google_subject) BETWEEN 1 AND 255),
  status text NOT NULL CHECK (status IN ('active','inactive')),
  mapping_revision bigint NOT NULL DEFAULT nextval('orgmaster_core.projed_principal_revision_seq') CHECK(mapping_revision>0),
  published_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION orgmaster_core.guard_projed_admission_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'PRINCIPAL_ADMISSION_IMMUTABLE'; END IF;
  IF NEW.principal_id IS DISTINCT FROM OLD.principal_id OR NEW.google_subject IS DISTINCT FROM OLD.google_subject THEN
    RAISE EXCEPTION 'PRINCIPAL_OWNERSHIP_IMMUTABLE';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.mapping_revision:=nextval('orgmaster_core.projed_principal_revision_seq');
    NEW.published_at:=clock_timestamp();
  ELSIF NEW.mapping_revision IS DISTINCT FROM OLD.mapping_revision OR NEW.published_at IS DISTINCT FROM OLD.published_at THEN
    RAISE EXCEPTION 'PRINCIPAL_ADMISSION_REVISION_INVALID';
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER projed_admission_guard_v1 BEFORE UPDATE OR DELETE
ON orgmaster_core.projed_principal_admissions FOR EACH ROW
EXECUTE FUNCTION orgmaster_core.guard_projed_admission_v1();

-- A new purpose capability for the existing verified OrgMaster workload;
-- SESSION_USER/provider still identify the executor, never a request actor label.
CREATE TABLE orgmaster_core.principal_publication_permissions (
  principal_id text PRIMARY KEY REFERENCES orgmaster_core.workload_principal_bindings(principal_id) ON DELETE RESTRICT,
  purpose text NOT NULL CHECK(purpose='projed-principal-publication'),
  enabled boolean NOT NULL
);
INSERT INTO orgmaster_core.principal_publication_permissions
SELECT principal_id,'projed-principal-publication',true FROM orgmaster_core.workload_principal_bindings
 WHERE owner='orgmaster' AND purpose='managed-identity-lifecycle';
CREATE TABLE orgmaster_core.projed_principal_publication_receipts (
  request_id uuid PRIMARY KEY,
  request_fingerprint jsonb NOT NULL,
  principal_id text NOT NULL REFERENCES orgmaster_core.principal_owners_v2(principal_id) ON DELETE RESTRICT,
  mapping_revision bigint NOT NULL,
  executor_principal_id text NOT NULL REFERENCES orgmaster_core.workload_principal_bindings(principal_id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX projed_publication_principal_idx ON orgmaster_core.projed_principal_publication_receipts(principal_id,occurred_at);

CREATE VIEW orgmaster_contract.v_projed_principal_admissions_v1 WITH(security_barrier=true) AS
SELECT 'orgmaster.projed-principal.v1'::text AS contract_version,
  pair.principal_issuer,pair.principal_subject,owner.principal_id,owner.principal_kind,
  owner.employee_id,admission.google_subject,admission.mapping_revision,admission.published_at
FROM orgmaster_core.projed_principal_admissions admission
JOIN orgmaster_core.principal_owners_v2 owner ON owner.principal_id=admission.principal_id
JOIN orgmaster_core.principal_subjects_v2 pair ON pair.principal_id=owner.principal_id
WHERE admission.status='active' AND (owner.principal_kind='personal' OR EXISTS(
  SELECT 1 FROM orgmaster_contract.v_active_principal_mappings_v1 active
  WHERE active.principal_id=owner.principal_id AND active.employee_id=owner.employee_id
    AND active.principal_issuer=pair.principal_issuer AND active.principal_subject=pair.principal_subject
    AND active.employee_status='active'
));

CREATE FUNCTION orgmaster_core.enroll_projed_principal_v1(
  p_request_id uuid,p_issuer text,p_subject text,p_google_subject text,p_authenticated_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE executor_id text; fingerprint jsonb; prior orgmaster_core.projed_principal_publication_receipts%ROWTYPE;
  login_pair orgmaster_core.principal_subjects_v2%ROWTYPE; google_pair orgmaster_core.principal_subjects_v2%ROWTYPE;
  owner_row orgmaster_core.principal_owners_v2%ROWTYPE; admitted orgmaster_core.projed_principal_admissions%ROWTYPE;
  pair_row record; result_row record; candidate_id text; stamp timestamptz:=clock_timestamp();
BEGIN
  SELECT binding.principal_id INTO executor_id
  FROM orgmaster_core.workload_principal_bindings binding
  JOIN orgmaster_core.principal_publication_permissions permission ON permission.principal_id=binding.principal_id
  WHERE binding.db_session_user=SESSION_USER::text AND binding.owner='orgmaster' AND binding.enabled
    AND binding.provider_issuer='https://accounts.google.com' AND length(binding.provider_subject)>0
    AND permission.enabled AND permission.purpose='projed-principal-publication';
  IF executor_id IS NULL THEN RAISE EXCEPTION 'PROJED_PUBLISHER_EXECUTOR_INVALID'; END IF;
  IF p_request_id IS NULL OR p_issuer IS NULL OR p_issuer<>btrim(p_issuer) OR length(p_issuer) NOT BETWEEN 1 AND 255
    OR p_subject IS NULL OR p_subject<>btrim(p_subject) OR length(p_subject) NOT BETWEEN 1 AND 255
    OR p_google_subject IS NULL OR p_google_subject<>btrim(p_google_subject) OR length(p_google_subject) NOT BETWEEN 1 AND 255
    OR p_authenticated_at IS NULL OR p_authenticated_at>stamp+interval '5 minutes'
    OR p_authenticated_at<='1970-01-01'::timestamptz THEN RAISE EXCEPTION 'PROJED_IDENTITY_INVALID'; END IF;
  fingerprint:=jsonb_build_object('issuer',p_issuer,'subject',p_subject,'googleSubject',p_google_subject,
    'authenticatedAt',to_char(p_authenticated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
  PERFORM pg_advisory_xact_lock(hashtextextended('projed-publication-request:'||p_request_id::text,0));
  SELECT * INTO prior FROM orgmaster_core.projed_principal_publication_receipts WHERE request_id=p_request_id;
  IF FOUND THEN
    IF prior.request_fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'PROJED_PUBLICATION_REPLAY_CONFLICT'; END IF;
    candidate_id:=prior.principal_id;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended('projed-google-subject:'||p_google_subject,0));
    SELECT * INTO login_pair FROM orgmaster_core.principal_subjects_v2
      WHERE principal_issuer=p_issuer AND principal_subject=p_subject FOR UPDATE;
    IF FOUND AND login_pair.principal_id IS NULL THEN RAISE EXCEPTION 'PROJED_PRINCIPAL_CONFLICT'; END IF;
    SELECT * INTO google_pair FROM orgmaster_core.principal_subjects_v2
      WHERE principal_issuer='https://accounts.google.com' AND principal_subject=p_google_subject FOR UPDATE;
    IF FOUND AND google_pair.principal_id IS NULL THEN RAISE EXCEPTION 'PROJED_PRINCIPAL_CONFLICT'; END IF;
    IF login_pair.principal_id IS NOT NULL AND google_pair.principal_id IS NOT NULL
      AND login_pair.principal_id<>google_pair.principal_id THEN RAISE EXCEPTION 'PROJED_PRINCIPAL_CONFLICT'; END IF;
    candidate_id:=COALESCE(login_pair.principal_id,google_pair.principal_id);
    IF candidate_id IS NULL THEN
      candidate_id:='principal-personal:'||gen_random_uuid()::text;
      INSERT INTO orgmaster_core.principal_owners_v2 VALUES(candidate_id,'personal',NULL,'human_personal',stamp,'projed:'||p_request_id::text);
    END IF;
    SELECT * INTO owner_row FROM orgmaster_core.principal_owners_v2 WHERE principal_id=candidate_id FOR UPDATE;
    IF owner_row.principal_kind='employee' AND NOT EXISTS(
      SELECT 1 FROM orgmaster_contract.v_active_principal_mappings_v1 active
       WHERE active.principal_id=candidate_id AND active.employee_id=owner_row.employee_id AND active.employee_status='active'
    ) THEN RAISE EXCEPTION 'PROJED_PRINCIPAL_INACTIVE'; END IF;
    INSERT INTO orgmaster_core.principal_subjects_v2 VALUES
      (p_issuer,p_subject,candidate_id,owner_row.principal_kind,owner_row.employee_id,stamp,'projed:'||p_request_id::text),
      ('https://accounts.google.com',p_google_subject,candidate_id,owner_row.principal_kind,owner_row.employee_id,stamp,'projed:'||p_request_id::text)
      ON CONFLICT(principal_issuer,principal_subject) DO NOTHING;
    FOR pair_row IN SELECT * FROM orgmaster_core.principal_subjects_v2
      WHERE (principal_issuer=p_issuer AND principal_subject=p_subject)
         OR (principal_issuer='https://accounts.google.com' AND principal_subject=p_google_subject)
    LOOP
      IF pair_row.principal_id IS DISTINCT FROM candidate_id THEN RAISE EXCEPTION 'PROJED_PRINCIPAL_CONFLICT'; END IF;
    END LOOP;
    INSERT INTO orgmaster_core.projed_principal_admissions(principal_id,google_subject,status)
      VALUES(candidate_id,p_google_subject,'active') ON CONFLICT DO NOTHING;
  END IF;
  SELECT * INTO admitted FROM orgmaster_core.projed_principal_admissions WHERE principal_id=candidate_id FOR UPDATE;
  IF NOT FOUND OR admitted.google_subject IS DISTINCT FROM p_google_subject THEN RAISE EXCEPTION 'PROJED_PRINCIPAL_CONFLICT'; END IF;
  IF admitted.status<>'active' THEN RAISE EXCEPTION 'PROJED_PRINCIPAL_INACTIVE'; END IF;
  IF prior.request_id IS NOT NULL AND prior.mapping_revision<>admitted.mapping_revision THEN RAISE EXCEPTION 'PROJED_PUBLICATION_REPLAY_CONFLICT'; END IF;
  SELECT * INTO result_row FROM orgmaster_contract.v_projed_principal_admissions_v1
    WHERE principal_issuer=p_issuer AND principal_subject=p_subject AND principal_id=candidate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROJED_PRINCIPAL_INACTIVE'; END IF;
  IF prior.request_id IS NULL THEN
    INSERT INTO orgmaster_core.projed_principal_publication_receipts
      (request_id,request_fingerprint,principal_id,mapping_revision,executor_principal_id)
      VALUES(p_request_id,fingerprint,candidate_id,admitted.mapping_revision,executor_id);
  END IF;
  RETURN jsonb_build_object('contractVersion',result_row.contract_version,
    'principalId',result_row.principal_id,'principalKind',result_row.principal_kind,'employeeId',result_row.employee_id,
    'identityIssuer',result_row.principal_issuer,'identitySubject',result_row.principal_subject,
    'googleSubject',result_row.google_subject,'mappingRevision',result_row.mapping_revision::text,
    'publishedAt',to_char(result_row.published_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
END;
$fn$;

REVOKE ALL ON orgmaster_core.principal_owners_v2,orgmaster_core.principal_subjects_v2,
  orgmaster_core.projed_principal_admissions,orgmaster_core.principal_publication_permissions,
  orgmaster_core.projed_principal_publication_receipts,orgmaster_core.projed_principal_revision_seq
  FROM PUBLIC,jenfu_orgmaster_runtime,jenfu_platform_runtime,jenfu_ai_pdm_runtime;
REVOKE ALL ON FUNCTION orgmaster_core.guard_principal_owner_v2(),orgmaster_core.guard_principal_subject_v2(),
  orgmaster_core.mirror_employee_reservation_v2(),orgmaster_core.guard_projed_admission_v1(),
  orgmaster_core.enroll_projed_principal_v1(uuid,text,text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orgmaster_core.enroll_projed_principal_v1(uuid,text,text,text,timestamptz)
  TO jenfu_orgmaster_runtime;
REVOKE ALL ON orgmaster_contract.v_projed_principal_admissions_v1 FROM PUBLIC;
GRANT SELECT ON orgmaster_contract.v_projed_principal_admissions_v1 TO jenfu_orgmaster_runtime,jenfu_platform_runtime;
COMMIT;
