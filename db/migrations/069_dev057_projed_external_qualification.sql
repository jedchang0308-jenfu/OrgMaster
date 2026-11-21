-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: orgmaster.projed-external-qualification.v1
-- compatibility: additive
-- governance-review: DEV-057 / ProJED DEV-139
BEGIN;
SET LOCAL ROLE jenfu_orgmaster_migrator;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE SEQUENCE orgmaster_core.projed_external_revision_seq;
CREATE TABLE orgmaster_core.projed_external_requests_v1 (
 request_id uuid PRIMARY KEY, invitation_id text UNIQUE NOT NULL,
 inviter_principal_id text NOT NULL, board_id text NOT NULL, role text NOT NULL,
 expires_at timestamptz NOT NULL, contact_email text NOT NULL, company text NOT NULL, note text NOT NULL,
 principal_id text REFERENCES orgmaster_core.principal_owners_v2(principal_id), google_subject text,
 decision text NOT NULL DEFAULT 'PENDING' CHECK(decision IN('PENDING','APPROVED','REJECTED')),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','ACTIVE','INACTIVE','REJECTED','WITHDRAWN')),
 approved_by text, approved_at timestamptz, last_login_at timestamptz,
 revision bigint NOT NULL DEFAULT nextval('orgmaster_core.projed_external_revision_seq'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), original_request jsonb NOT NULL,
 CHECK((principal_id IS NULL)=(google_subject IS NULL)),
 CHECK(status<>'ACTIVE' OR (principal_id IS NOT NULL AND decision='APPROVED'))
);
CREATE TABLE orgmaster_core.projed_external_commands_v1 (
 command_id uuid PRIMARY KEY, actor_id text NOT NULL, request jsonb NOT NULL,
 result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION orgmaster_core.projed_external_json_v1(p_row orgmaster_core.projed_external_requests_v1)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('contractVersion','orgmaster.projed-external-qualification.v1',
 'requestId',p_row.request_id,'invitationId',p_row.invitation_id,'inviterPrincipalId',p_row.inviter_principal_id,
 'boardId',p_row.board_id,'role',p_row.role,'expiresAt',p_row.expires_at,'contactEmail',p_row.contact_email,
 'company',p_row.company,'note',p_row.note,'principalId',p_row.principal_id,'googleSubject',p_row.google_subject,
 'decision',p_row.decision,'status',p_row.status,'revision',p_row.revision::text,
 'approvedBy',p_row.approved_by,'approvedAt',p_row.approved_at,'lastLoginAt',
 greatest(p_row.last_login_at,(SELECT max((receipt.request_fingerprint->>'authenticatedAt')::timestamptz)
 FROM orgmaster_core.projed_principal_publication_receipts receipt WHERE receipt.principal_id=p_row.principal_id)),
 'createdAt',p_row.created_at)
$$;

-- Only the OrgMaster owner runtime receives EXECUTE. Its HTTP adapter verifies
-- the exact ProJED workload; browser claims never enter this boundary directly.
CREATE FUNCTION orgmaster_core.notify_projed_external_request_v1(p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE row orgmaster_core.projed_external_requests_v1%ROWTYPE; action text:=p_request->>'action';
BEGIN
 IF NOT EXISTS(SELECT 1 FROM orgmaster_core.workload_principal_bindings binding
  JOIN orgmaster_core.principal_publication_permissions permission ON permission.principal_id=binding.principal_id
  WHERE binding.db_session_user=SESSION_USER::text AND binding.owner='orgmaster' AND binding.enabled
  AND binding.provider_issuer='https://accounts.google.com' AND length(binding.provider_subject)>0
  AND permission.enabled AND permission.purpose='projed-principal-publication')
 THEN RAISE EXCEPTION 'EXTERNAL_EXECUTOR_INVALID'; END IF;
 IF p_request->>'contractVersion' IS DISTINCT FROM 'orgmaster.projed-external-qualification.v1'
  OR action IS NULL OR action NOT IN('submit','bind','withdraw') THEN RAISE EXCEPTION 'EXTERNAL_REQUEST_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('projed-external:'||(p_request->>'requestId'),0));
 SELECT * INTO row FROM orgmaster_core.projed_external_requests_v1 WHERE request_id=(p_request->>'requestId')::uuid FOR UPDATE;
 IF action='submit' THEN
  IF row.request_id IS NOT NULL THEN
   IF row.original_request IS DISTINCT FROM p_request THEN RAISE EXCEPTION 'EXTERNAL_CONFLICT'; END IF;
   RETURN orgmaster_core.projed_external_json_v1(row);
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each_text(p_request) item WHERE item.key IN('invitationId','inviterPrincipalId','boardId','role') AND (length(item.value) NOT BETWEEN 1 AND 255 OR item.value<>btrim(item.value)))
   OR NOT(p_request ?& ARRAY['invitationId','inviterPrincipalId','boardId','role','expiresAt','contactEmail','company','note'])
   OR (p_request->>'expiresAt')::timestamptz<=clock_timestamp() THEN RAISE EXCEPTION 'EXTERNAL_REQUEST_INVALID'; END IF;
  INSERT INTO orgmaster_core.projed_external_requests_v1(request_id,invitation_id,inviter_principal_id,board_id,role,expires_at,contact_email,company,note,original_request)
  VALUES((p_request->>'requestId')::uuid,p_request->>'invitationId',p_request->>'inviterPrincipalId',p_request->>'boardId',p_request->>'role',(p_request->>'expiresAt')::timestamptz,p_request->>'contactEmail',p_request->>'company',p_request->>'note',p_request) RETURNING * INTO row;
 ELSE
  IF row.request_id IS NULL THEN RAISE EXCEPTION 'EXTERNAL_NOT_FOUND'; END IF;
  IF action='withdraw' THEN
   IF row.status<>'WITHDRAWN' THEN UPDATE orgmaster_core.projed_external_requests_v1 SET status='WITHDRAWN',revision=nextval('orgmaster_core.projed_external_revision_seq') WHERE request_id=row.request_id RETURNING * INTO row; END IF;
  ELSE
   IF row.status IN('REJECTED','WITHDRAWN','INACTIVE') OR row.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'EXTERNAL_CONFLICT'; END IF;
   IF NOT EXISTS(SELECT 1 FROM orgmaster_contract.v_projed_principal_admissions_v1 admitted
    JOIN orgmaster_core.principal_subjects_v2 pair ON pair.principal_id=admitted.principal_id
     AND pair.principal_issuer='https://accounts.google.com' AND pair.principal_subject=admitted.google_subject
    WHERE admitted.principal_id=p_request->>'principalId' AND admitted.google_subject=p_request->>'googleSubject')
    OR row.principal_id IS NOT NULL AND (row.principal_id IS DISTINCT FROM p_request->>'principalId' OR row.google_subject IS DISTINCT FROM p_request->>'googleSubject')
   THEN RAISE EXCEPTION 'EXTERNAL_IDENTITY_CONFLICT'; END IF;
   IF row.principal_id IS NULL THEN
    UPDATE orgmaster_core.projed_external_requests_v1 SET principal_id=p_request->>'principalId',google_subject=p_request->>'googleSubject',
      status=CASE WHEN decision='APPROVED' THEN 'ACTIVE' ELSE 'PENDING' END,
      last_login_at=clock_timestamp(),revision=nextval('orgmaster_core.projed_external_revision_seq') WHERE request_id=row.request_id RETURNING * INTO row;
   END IF;
  END IF;
 END IF;
 RETURN orgmaster_core.projed_external_json_v1(row);
END; $$;

CREATE FUNCTION orgmaster_core.manage_projed_external_request_v1(p_actor jsonb,p_command jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor_id text:=p_actor->>'principalId'; row orgmaster_core.projed_external_requests_v1%ROWTYPE;
 prior orgmaster_core.projed_external_commands_v1%ROWTYPE; result jsonb; action text:=p_command->>'action';
BEGIN
 -- Same session/epoch fence as the existing v3 human writer, and an effective
 -- exact Principal OrgMaster app-administrator grant (no Employee inheritance).
 PERFORM 1 FROM orgmaster_core.persistence_authority WHERE singleton FOR SHARE;
 PERFORM orgmaster_core.assert_administration_session_v1(p_actor,actor_id,false);
 IF NOT EXISTS(SELECT 1 FROM orgmaster_contract.v_application_administrator_grants_v1 grant_row
  WHERE grant_row.principal_id=actor_id AND grant_row.application_id='orgmaster') THEN RAISE EXCEPTION 'EXTERNAL_ADMIN_REQUIRED'; END IF;
 IF p_command IS NULL THEN
  SELECT COALESCE(jsonb_agg(orgmaster_core.projed_external_json_v1(entry) ORDER BY entry.created_at DESC),'[]'::jsonb) INTO result FROM orgmaster_core.projed_external_requests_v1 entry;
  RETURN jsonb_build_object('contractVersion','orgmaster.projed-external-qualification.v1','requests',result);
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('projed-external-command:'||(p_command->>'commandId'),0));
 SELECT * INTO prior FROM orgmaster_core.projed_external_commands_v1 WHERE command_id=(p_command->>'commandId')::uuid;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM actor_id OR prior.request IS DISTINCT FROM p_command THEN RAISE EXCEPTION 'EXTERNAL_CONFLICT'; END IF;
  RETURN prior.result;
 END IF;
 SELECT * INTO row FROM orgmaster_core.projed_external_requests_v1 WHERE request_id=(p_command->>'requestId')::uuid FOR UPDATE;
 IF row.request_id IS NULL THEN RAISE EXCEPTION 'EXTERNAL_NOT_FOUND'; END IF;
 IF row.revision::text IS DISTINCT FROM p_command->>'expectedRevision' OR row.status IN('REJECTED','WITHDRAWN')
  OR action IS NULL OR action NOT IN('approve','reject','disable','restore') THEN RAISE EXCEPTION 'EXTERNAL_CONFLICT'; END IF;
 IF action='approve' AND row.expires_at<=clock_timestamp()
  OR action='restore' AND row.status<>'INACTIVE'
  OR action IN('approve','reject') AND row.decision<>'PENDING'
  OR action='disable' AND row.status<>'ACTIVE' THEN RAISE EXCEPTION 'EXTERNAL_CONFLICT'; END IF;
 IF action='disable' THEN
  -- Global external disable deliberately fences all ProJED origins, including
  -- personal entry. Existing admission trigger provides atomic invalidation.
  UPDATE orgmaster_core.projed_principal_admissions SET status='inactive' WHERE principal_id=row.principal_id;
  UPDATE orgmaster_core.projed_external_requests_v1 SET status='INACTIVE',revision=nextval('orgmaster_core.projed_external_revision_seq') WHERE principal_id=row.principal_id AND status='ACTIVE';
 ELSIF action='restore' THEN
  UPDATE orgmaster_core.projed_principal_admissions SET status='active' WHERE principal_id=row.principal_id;
  UPDATE orgmaster_core.projed_external_requests_v1 SET status='ACTIVE',revision=nextval('orgmaster_core.projed_external_revision_seq') WHERE principal_id=row.principal_id AND status='INACTIVE';
 ELSE
  UPDATE orgmaster_core.projed_external_requests_v1 SET decision=CASE WHEN action='approve' THEN 'APPROVED' ELSE 'REJECTED' END,
   status=CASE WHEN action='reject' THEN 'REJECTED' WHEN principal_id IS NULL THEN 'PENDING' ELSE 'ACTIVE' END,
   approved_by=actor_id,approved_at=clock_timestamp(),note=p_command->>'note',revision=nextval('orgmaster_core.projed_external_revision_seq') WHERE request_id=row.request_id;
 END IF;
 SELECT * INTO row FROM orgmaster_core.projed_external_requests_v1 WHERE request_id=row.request_id;
 result:=orgmaster_core.projed_external_json_v1(row);
 INSERT INTO orgmaster_core.projed_external_commands_v1(command_id,actor_id,request,result) VALUES((p_command->>'commandId')::uuid,actor_id,p_command,result);
 RETURN result;
END; $$;

-- Absence is unknown, never implicit approval. Expiry gates initial acceptance;
-- after acceptance the ProJED receipt/membership owns invitation token expiry.
CREATE FUNCTION orgmaster_contract.read_projed_external_qualification_v1(p_invitation_id text,p_principal_id text)
RETURNS TABLE(contract_version text,request_id uuid,invitation_id text,principal_id text,google_subject text,
 board_id text,role text,status text,revision bigint,expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT 'orgmaster.projed-external-qualification.v1',request.request_id,request.invitation_id,request.principal_id,request.google_subject,
 request.board_id,request.role,CASE WHEN admission.status='active' THEN request.status ELSE 'INACTIVE' END,request.revision,request.expires_at
 FROM orgmaster_core.projed_external_requests_v1 request
 JOIN orgmaster_core.projed_principal_admissions admission ON admission.principal_id=request.principal_id
 WHERE request.invitation_id=p_invitation_id AND request.principal_id=p_principal_id
$$;
REVOKE ALL ON orgmaster_core.projed_external_requests_v1,orgmaster_core.projed_external_commands_v1,orgmaster_core.projed_external_revision_seq FROM PUBLIC,jenfu_orgmaster_runtime,jenfu_platform_runtime,jenfu_ai_pdm_runtime;
REVOKE ALL ON FUNCTION orgmaster_core.projed_external_json_v1(orgmaster_core.projed_external_requests_v1),orgmaster_core.notify_projed_external_request_v1(jsonb),orgmaster_core.manage_projed_external_request_v1(jsonb,jsonb),orgmaster_contract.read_projed_external_qualification_v1(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orgmaster_core.notify_projed_external_request_v1(jsonb),orgmaster_core.manage_projed_external_request_v1(jsonb,jsonb) TO jenfu_orgmaster_runtime;
GRANT EXECUTE ON FUNCTION orgmaster_contract.read_projed_external_qualification_v1(text,text) TO jenfu_orgmaster_runtime,jenfu_platform_runtime,jenfu_platform_migrator;

-- A machine Calendar bearer has no human Session. Point-read the immutable
-- Google owner and current app admission without enumerating identities or
-- inventing a Principal for a legacy feed that has never enrolled.
CREATE FUNCTION orgmaster_contract.read_projed_calendar_principal_v1(p_google_subject text)
RETURNS TABLE(contract_version text,google_subject text,principal_id text,principal_kind text,status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE pair orgmaster_core.principal_subjects_v2%ROWTYPE;
 admitted orgmaster_core.projed_principal_admissions%ROWTYPE;
BEGIN
 IF p_google_subject IS NULL OR p_google_subject<>btrim(p_google_subject)
  OR length(p_google_subject) NOT BETWEEN 1 AND 255 OR p_google_subject~'[[:cntrl:]]'
 THEN RAISE EXCEPTION 'PROJED_IDENTITY_INVALID'; END IF;
 contract_version:='orgmaster.projed-calendar-principal.v1'; google_subject:=p_google_subject;
 SELECT * INTO pair FROM orgmaster_core.principal_subjects_v2 source
  WHERE source.principal_issuer='https://accounts.google.com' AND source.principal_subject=p_google_subject;
 IF NOT FOUND THEN status:='UNREGISTERED'; RETURN NEXT; RETURN; END IF;
 principal_id:=pair.principal_id; principal_kind:=pair.principal_kind;
 IF pair.principal_id IS NULL THEN status:='UNAVAILABLE'; RETURN NEXT; RETURN; END IF;
 SELECT * INTO admitted FROM orgmaster_core.projed_principal_admissions source WHERE source.principal_id=pair.principal_id;
 IF NOT FOUND THEN status:='UNREGISTERED'; RETURN NEXT; RETURN; END IF;
 IF admitted.google_subject IS DISTINCT FROM p_google_subject THEN status:='UNAVAILABLE'; RETURN NEXT; RETURN; END IF;
 IF admitted.status<>'active' OR NOT EXISTS(SELECT 1 FROM orgmaster_contract.v_projed_principal_admissions_v1 active
  WHERE active.principal_id=pair.principal_id AND active.google_subject=p_google_subject)
 THEN status:='INACTIVE'; ELSE status:='ACTIVE'; END IF;
 RETURN NEXT;
END; $$;
REVOKE ALL ON FUNCTION orgmaster_contract.read_projed_calendar_principal_v1(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orgmaster_contract.read_projed_calendar_principal_v1(text) TO jenfu_orgmaster_runtime;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='projed_runtime_disposable') THEN
  GRANT USAGE ON SCHEMA orgmaster_contract TO projed_runtime_disposable;
  GRANT EXECUTE ON FUNCTION orgmaster_contract.read_projed_external_qualification_v1(text,text) TO projed_runtime_disposable;
  GRANT EXECUTE ON FUNCTION orgmaster_contract.read_projed_calendar_principal_v1(text) TO projed_runtime_disposable;
 END IF;
END; $$;
COMMIT;
