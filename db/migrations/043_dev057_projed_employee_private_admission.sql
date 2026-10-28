-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: orgmaster.projed-principal.v1 Employee private-admission continuity
-- compatibility: backward-compatible
-- governance-review: DEV-057
-- Preserve private ProJED access for a verified immutable Employee identity after company status changes.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';

SET LOCAL ROLE jenfu_orgmaster_migrator;

CREATE OR REPLACE VIEW orgmaster_contract.v_projed_principal_admissions_v1 WITH(security_barrier=true) AS
SELECT 'orgmaster.projed-principal.v1'::text AS contract_version,
  pair.principal_issuer,pair.principal_subject,owner.principal_id,owner.principal_kind,
  owner.employee_id,admission.google_subject,admission.mapping_revision,admission.published_at
FROM orgmaster_core.projed_principal_admissions admission
JOIN orgmaster_core.principal_owners_v2 owner ON owner.principal_id=admission.principal_id
JOIN orgmaster_core.principal_subjects_v2 pair ON pair.principal_id=owner.principal_id
WHERE admission.status='active' AND (
  owner.principal_kind='personal'
  OR EXISTS(
    SELECT 1 FROM orgmaster_contract.v_active_principal_mappings_v1 active
    WHERE active.principal_id=owner.principal_id AND active.employee_id=owner.employee_id
      AND active.principal_issuer=pair.principal_issuer AND active.principal_subject=pair.principal_subject
      AND active.employee_status='active'
  )
  OR (
    owner.principal_kind='employee'
    AND pair.principal_issuer<>'https://accounts.google.com'
    AND EXISTS(
      SELECT 1 FROM orgmaster_core.principal_subjects_v2 google_pair
      WHERE google_pair.principal_issuer='https://accounts.google.com'
        AND google_pair.principal_subject=admission.google_subject
        AND google_pair.principal_id=owner.principal_id
        AND google_pair.principal_kind='employee'
        AND google_pair.employee_id=owner.employee_id
    )
    AND EXISTS(
      SELECT 1 FROM orgmaster_core.projed_principal_publication_receipts receipt
      WHERE receipt.principal_id=owner.principal_id
        AND receipt.request_fingerprint->>'issuer'=pair.principal_issuer
        AND receipt.request_fingerprint->>'subject'=pair.principal_subject
        AND receipt.request_fingerprint->>'googleSubject'=admission.google_subject
    )
  )
);

CREATE OR REPLACE FUNCTION orgmaster_core.enroll_projed_principal_v1(
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
      WHERE active.principal_id=candidate_id AND active.employee_id=owner_row.employee_id
        AND active.principal_issuer=p_issuer AND active.principal_subject=p_subject
        AND active.employee_status='active'
    ) AND (
      google_pair.principal_id IS DISTINCT FROM candidate_id
      OR google_pair.principal_kind IS DISTINCT FROM 'employee'
      OR google_pair.employee_id IS DISTINCT FROM owner_row.employee_id
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
  IF prior.request_id IS NULL THEN
    INSERT INTO orgmaster_core.projed_principal_publication_receipts
      (request_id,request_fingerprint,principal_id,mapping_revision,executor_principal_id)
      VALUES(p_request_id,fingerprint,candidate_id,admitted.mapping_revision,executor_id);
  END IF;
  SELECT * INTO result_row FROM orgmaster_contract.v_projed_principal_admissions_v1
    WHERE principal_issuer=p_issuer AND principal_subject=p_subject AND principal_id=candidate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROJED_PRINCIPAL_INACTIVE'; END IF;
  RETURN jsonb_build_object('contractVersion',result_row.contract_version,
    'principalId',result_row.principal_id,'principalKind',result_row.principal_kind,'employeeId',result_row.employee_id,
    'identityIssuer',result_row.principal_issuer,'identitySubject',result_row.principal_subject,
    'googleSubject',result_row.google_subject,'mappingRevision',result_row.mapping_revision::text,
    'publishedAt',to_char(result_row.published_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
END;
$fn$;

COMMIT;
