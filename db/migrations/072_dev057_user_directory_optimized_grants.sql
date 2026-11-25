-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: orgmaster.users.v1 (administrator metadata only)
-- compatibility: additive
-- Reuses the 047 optimized reader; v6() only relabels the legacy v5 view.
-- Metadata membership is unchanged; no private content, cache, or admission change.
-- governance-review: DEV-057 all-user directory
BEGIN;
SET LOCAL ROLE jenfu_orgmaster_migrator;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE OR REPLACE FUNCTION orgmaster_core.read_user_directory_v1(p_actor jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor_id text:=p_actor->>'principalId'; projed jsonb:='[]';
 systems jsonb:='[]'; entries jsonb:='[]'; app text; qualified text[]; item record;
BEGIN
 PERFORM 1 FROM orgmaster_core.persistence_authority WHERE singleton FOR SHARE;
 IF actor_id IS NULL OR actor_id='' THEN RAISE EXCEPTION 'IDENTITY_CONTEXT_REQUIRED'; END IF;
 BEGIN
  PERFORM orgmaster_core.assert_administration_session_v1(p_actor,actor_id,false);
 EXCEPTION WHEN NO_DATA_FOUND THEN RAISE EXCEPTION 'IDENTITY_CONTEXT_REQUIRED'; END;
 IF NOT EXISTS(SELECT 1 FROM orgmaster_contract.v_application_administrator_grants_v1 grant_row
  WHERE grant_row.principal_id=actor_id AND grant_row.application_id='orgmaster') THEN RAISE EXCEPTION 'USER_DIRECTORY_ADMIN_REQUIRED'; END IF;

 -- Only OrgMaster-owned, published identity metadata. No email-based linking.
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'id','principal:'||owner.principal_id,'principalId',owner.principal_id,
  'displayName',display.employee_name,'email',NULL,
  'kind',CASE WHEN owner.principal_kind='employee' AND EXISTS(
   SELECT 1 FROM orgmaster_core.v_current_workspace_employees_v1 employee
   WHERE employee.employee_id=owner.employee_id AND employee.employee_status='active'
  ) THEN 'employee' ELSE 'nonemployee' END,'systems','[]'::jsonb
 ) ORDER BY owner.principal_id),'[]'::jsonb) INTO entries
 FROM orgmaster_core.principal_owners_v2 owner
 LEFT JOIN orgmaster_contract.v_principal_display_profiles_v1 display USING(principal_id)
 WHERE owner.account_type<>'service';

 -- A failed subsystem reader is unknown, never interpreted as disabled/denied.
 FOREACH app IN ARRAY ARRAY['orgmaster','ai-pdm','financial-management-system'] LOOP
  BEGIN
   IF app='orgmaster' THEN
    SELECT array_agg(DISTINCT principal_id) INTO qualified FROM orgmaster_contract.v_orgmaster_session_principals_v2;
   ELSIF app='ai-pdm' THEN
    SELECT array_agg(DISTINCT principal_id) INTO qualified FROM orgmaster_contract.read_ai_pdm_principal_effective_grants_v5();
   ELSE
    SELECT array_agg(DISTINCT admission.principal_id) INTO qualified
    FROM orgmaster_contract.v_fms_principal_admissions_v2 admission
    JOIN orgmaster_contract.v_fms_authority_v4 authority USING(principal_id,employee_id);
   END IF;
   SELECT COALESCE(jsonb_agg(value||jsonb_build_object('systems',value->'systems'||jsonb_build_array(jsonb_build_object(
    'applicationId',app,'status',CASE WHEN value->>'principalId'=ANY(COALESCE(qualified,ARRAY[]::text[])) THEN 'ELIGIBLE' ELSE 'INELIGIBLE' END
   )))),'[]'::jsonb) INTO entries FROM jsonb_array_elements(entries);
   systems:=systems||jsonb_build_array(jsonb_build_object('applicationId',app,'state','READY'));
  EXCEPTION WHEN undefined_table OR undefined_function OR insufficient_privilege THEN
   systems:=systems||jsonb_build_array(jsonb_build_object('applicationId',app,'state','UNAVAILABLE'));
  END;
 END LOOP;
 BEGIN
  projed:=orgmaster_core.projed_user_directory_v1()->'users';
  FOR item IN SELECT value AS account FROM jsonb_array_elements(projed) LOOP
   IF item.account->>'principalId' IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(entries) WHERE value->>'principalId'=item.account->>'principalId') THEN
    SELECT jsonb_agg(CASE WHEN value->>'principalId'=item.account->>'principalId' THEN
     value||jsonb_build_object('email',COALESCE(value->>'email',item.account->>'email'),
      'displayName',COALESCE(value->>'displayName',item.account->>'displayName'),
      'systems',value->'systems'||jsonb_build_array(jsonb_build_object('applicationId','projed',
       'status',CASE WHEN NOT (item.account->>'enabled')::boolean THEN 'DISABLED' WHEN (item.account->>'loginEligible')::boolean THEN 'ELIGIBLE' ELSE 'INELIGIBLE' END,'projed',item.account)))
     ELSE value END) INTO entries FROM jsonb_array_elements(entries);
   ELSE
    entries:=entries||jsonb_build_array(jsonb_build_object('id',CASE WHEN item.account->>'principalId' IS NULL THEN 'projed:'||(item.account->>'googleSubject') ELSE 'principal:'||(item.account->>'principalId') END,
     'principalId',item.account->>'principalId','displayName',item.account->>'displayName','email',item.account->>'email','kind','nonemployee',
     'systems',jsonb_build_array(jsonb_build_object('applicationId','projed',
      'status',CASE WHEN NOT (item.account->>'enabled')::boolean THEN 'DISABLED' WHEN (item.account->>'loginEligible')::boolean THEN 'ELIGIBLE' ELSE 'INELIGIBLE' END,'projed',item.account))));
   END IF;
  END LOOP;
  systems:=systems||jsonb_build_array(jsonb_build_object('applicationId','projed','state','READY'));
 EXCEPTION WHEN undefined_table OR undefined_function OR insufficient_privilege THEN
  systems:=systems||jsonb_build_array(jsonb_build_object('applicationId','projed','state','UNAVAILABLE'));
 END;
 RETURN jsonb_build_object('contractVersion','orgmaster.users.v1','systems',systems,'users',entries);
END; $$;
REVOKE ALL ON FUNCTION orgmaster_core.read_user_directory_v1(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orgmaster_core.read_user_directory_v1(jsonb) TO jenfu_orgmaster_runtime;
COMMIT;
