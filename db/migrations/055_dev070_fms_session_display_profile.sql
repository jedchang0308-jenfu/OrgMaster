-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: separate FMS self-display reader
-- compatibility: additive
-- governance-review: DEV-070
BEGIN;
SET LOCAL ROLE jenfu_orgmaster_migrator;

CREATE FUNCTION orgmaster_contract.read_fms_session_display_profile_v1(
  p_principal_id text, p_employee_id text, p_issuer text, p_subject text
) RETURNS SETOF orgmaster_contract.v_fms_principal_display_profiles_v1
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $display$
WITH admission AS MATERIALIZED (
  SELECT principal_id, employee_id
  FROM orgmaster_contract.read_fms_principal_admission_v2(p_issuer,p_subject)
), employee AS (
  SELECT min(NULLIF(btrim(projected.fact->>'name'),'')) AS employee_name
  FROM orgmaster_core.v_fms_fact_source_v1 source
  JOIN orgmaster_core.fms_artifact_facts projected ON projected.batch_id=source.batch_id
    AND projected.artifact_key=source.workspace_artifact_key AND projected.kind='employee'
    AND projected.lookup_key=p_employee_id
  HAVING count(*)=1 AND bool_and(projected.fact->>'status'='active')
)
SELECT p_principal_id,p_employee_id,employee.employee_name FROM employee
WHERE (SELECT count(*) FROM admission)=1
  AND EXISTS (SELECT 1 FROM admission WHERE principal_id=p_principal_id AND employee_id=p_employee_id);
$display$;

REVOKE ALL ON FUNCTION orgmaster_contract.read_fms_session_display_profile_v1(text,text,text,text) FROM PUBLIC;
DO $fms_acl$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fms_runtime') THEN
    GRANT EXECUTE ON FUNCTION orgmaster_contract.read_fms_session_display_profile_v1(text,text,text,text) TO fms_runtime;
  END IF;
END; $fms_acl$;

COMMENT ON FUNCTION orgmaster_contract.read_fms_session_display_profile_v1(text,text,text,text) IS
  'Optional name for the unique current issuer/subject and exact Principal/Employee binding. The consumer authenticates the session; this function grants no financial authority.';
COMMIT;
