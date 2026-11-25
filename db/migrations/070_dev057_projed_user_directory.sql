-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: ProJED account metadata/activation v1 consumer
-- compatibility: additive
-- governance-review: DEV-057 ProJED user directory
BEGIN;
SET LOCAL ROLE jenfu_orgmaster_migrator;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE TABLE orgmaster_core.projed_user_commands_v1 (
  command_id uuid PRIMARY KEY,actor_id text NOT NULL,request jsonb NOT NULL,result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION orgmaster_core.projed_user_directory_v1() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 RETURN (WITH accounts AS (SELECT * FROM projed_contract.read_user_directory_v1()),
 users AS (
  SELECT COALESCE(account.google_subject,admission.google_subject) AS subject,
   account.account_id,account.email,account.display_name,admission.principal_id,
   COALESCE(account.active,true) AND COALESCE(admission.status='active',true) AS enabled,
   COALESCE(account.revision,0)::text||':'||COALESCE(admission.mapping_revision,0)::text AS revision,
   CASE WHEN admission.principal_id IS NULL THEN 'UNREGISTERED' WHEN EXISTS(SELECT 1 FROM orgmaster_contract.v_projed_principal_admissions_v1 published WHERE published.principal_id=admission.principal_id) THEN 'ACTIVE' ELSE 'INACTIVE' END AS identity_status,
   COALESCE(external.status,'NONE') AS external_status
  FROM accounts account FULL JOIN orgmaster_core.projed_principal_admissions admission USING(google_subject)
  LEFT JOIN LATERAL (
   SELECT request.status FROM orgmaster_core.projed_external_requests_v1 request
    WHERE request.google_subject=COALESCE(account.google_subject,admission.google_subject)
    ORDER BY CASE request.status WHEN 'ACTIVE' THEN 0 WHEN 'INACTIVE' THEN 1 WHEN 'PENDING' THEN 2 ELSE 3 END,request.created_at DESC LIMIT 1
  ) external ON true
 ) SELECT jsonb_build_object('contractVersion','orgmaster.projed-users.v1','users',COALESCE(jsonb_agg(jsonb_build_object(
   'googleSubject',subject,'accountId',account_id,'principalId',principal_id,'email',email,'displayName',display_name,
   'kind',CASE WHEN external_status='NONE' THEN 'personal' ELSE 'external' END,
   'enabled',enabled,'loginEligible',enabled AND identity_status<>'INACTIVE','revision',revision,'identityStatus',identity_status,'externalStatus',external_status
 ) ORDER BY lower(COALESCE(email,subject))),'[]'::jsonb)) FROM users);
END; $$;

CREATE FUNCTION orgmaster_core.manage_projed_user_v1(p_actor jsonb,p_command jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor_id text:=p_actor->>'principalId'; prior orgmaster_core.projed_user_commands_v1%ROWTYPE;
 target jsonb; current_list jsonb; result jsonb; admission orgmaster_core.projed_principal_admissions%ROWTYPE;
 subject text:=p_command->>'googleSubject'; action text:=p_command->>'action';
BEGIN
 PERFORM 1 FROM orgmaster_core.persistence_authority WHERE singleton FOR SHARE;
 IF actor_id IS NULL OR actor_id='' THEN RAISE EXCEPTION 'IDENTITY_CONTEXT_REQUIRED'; END IF;
 BEGIN
  PERFORM orgmaster_core.assert_administration_session_v1(p_actor,actor_id,false);
 EXCEPTION WHEN NO_DATA_FOUND THEN RAISE EXCEPTION 'IDENTITY_CONTEXT_REQUIRED';
 END;
 IF NOT EXISTS(SELECT 1 FROM orgmaster_contract.v_application_administrator_grants_v1 grant_row
  WHERE grant_row.principal_id=actor_id AND grant_row.application_id='orgmaster') THEN RAISE EXCEPTION 'PROJED_USER_ADMIN_REQUIRED'; END IF;
 IF p_command IS NULL THEN RETURN orgmaster_core.projed_user_directory_v1(); END IF;
 IF jsonb_typeof(p_command)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(p_command))<>4
  OR NOT p_command ?& ARRAY['commandId','googleSubject','expectedRevision','action']
  OR EXISTS(SELECT 1 FROM jsonb_each(p_command) WHERE jsonb_typeof(value)<>'string')
  OR COALESCE(p_command->>'commandId','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  OR subject IS NULL OR subject<>btrim(subject) OR length(subject) NOT BETWEEN 1 AND 255 OR subject~'[[:cntrl:]]'
  OR COALESCE(p_command->>'expectedRevision','')!~'^[0-9]{1,19}:[0-9]{1,19}$'
  OR action IS NULL OR action NOT IN('disable','restore') THEN RAISE EXCEPTION 'PROJED_USER_REQUEST_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('projed-user-command:'||(p_command->>'commandId'),0));
 SELECT * INTO prior FROM orgmaster_core.projed_user_commands_v1 WHERE command_id=(p_command->>'commandId')::uuid;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM actor_id OR prior.request IS DISTINCT FROM p_command THEN RAISE EXCEPTION 'PROJED_USER_CONFLICT'; END IF;
  RETURN orgmaster_core.projed_user_directory_v1();
 END IF;
 -- Share the enrollment subject lock even when no admission row exists yet.
 PERFORM pg_advisory_xact_lock(hashtextextended('projed-google-subject:'||subject,0));
 -- Admission lock precedes ProJED revocation locks, as in external management.
 SELECT * INTO admission FROM orgmaster_core.projed_principal_admissions WHERE google_subject=subject FOR UPDATE;
 current_list:=orgmaster_core.projed_user_directory_v1();
 SELECT value INTO target FROM jsonb_array_elements(current_list->'users') WHERE value->>'googleSubject'=subject;
 IF target IS NULL THEN RAISE EXCEPTION 'PROJED_USER_NOT_FOUND'; END IF;
 IF target->>'revision' IS DISTINCT FROM p_command->>'expectedRevision'
  OR (target->>'enabled')::boolean=(action='restore') THEN RAISE EXCEPTION 'PROJED_USER_CONFLICT'; END IF;
 IF target->>'accountId' IS NOT NULL THEN
  PERFORM projed_contract.set_user_active_v1((target->>'accountId')::uuid,split_part(target->>'revision',':',1)::bigint,action='restore');
 END IF;
 IF action='restore' AND admission.status='inactive' THEN
  -- Do not revive inactive/withdrawn external invitations or any old Session.
  UPDATE orgmaster_core.projed_principal_admissions SET status='active' WHERE principal_id=admission.principal_id;
 ELSIF action='disable' AND target->>'accountId' IS NULL THEN
  UPDATE orgmaster_core.projed_principal_admissions SET status='inactive' WHERE principal_id=admission.principal_id;
 END IF;
 result:=orgmaster_core.projed_user_directory_v1();
 INSERT INTO orgmaster_core.projed_user_commands_v1(command_id,actor_id,request,result)
  VALUES((p_command->>'commandId')::uuid,actor_id,p_command,result);
 RETURN result;
END; $$;
REVOKE ALL ON orgmaster_core.projed_user_commands_v1 FROM PUBLIC,jenfu_orgmaster_runtime,jenfu_platform_runtime,jenfu_ai_pdm_runtime;
REVOKE ALL ON FUNCTION orgmaster_core.projed_user_directory_v1(),orgmaster_core.manage_projed_user_v1(jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orgmaster_core.manage_projed_user_v1(jsonb,jsonb) TO jenfu_orgmaster_runtime;
COMMIT;
