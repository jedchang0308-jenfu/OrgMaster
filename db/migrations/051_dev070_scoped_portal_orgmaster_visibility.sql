-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: additive exact-identity OrgMaster Portal visibility reader
-- compatibility: backward-compatible
-- governance-review: DEV-070
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_orgmaster_migrator;
SELECT pg_advisory_xact_lock(hashtext('dev070-scoped-portal-orgmaster-visibility'), hashtext(current_database()));

CREATE FUNCTION orgmaster_contract.read_portal_orgmaster_visibility_v1(p_issuer text, p_subject text)
RETURNS TABLE(application_id text, assignment_version bigint, visibility_state text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $reader$
DECLARE
  publication jsonb;
BEGIN
  IF NULLIF(p_issuer, '') IS NULL OR NULLIF(p_subject, '') IS NULL THEN
    RETURN;
  END IF;

  publication := orgmaster_core.read_administration_publication_v1();
  IF publication IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH exact_accounts AS MATERIALIZED (
    SELECT account.principal_id, account.employee_id, count(*) OVER () AS pair_row_count
      FROM orgmaster_core.read_ai_pdm_principal_accounts_v1(NULL, p_issuer, p_subject) account
  ), ordinary_visibility AS (
    SELECT 1
      FROM exact_accounts account
      JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(publication#>'{policy,roleAssignments}') = 'array'
          THEN publication#>'{policy,roleAssignments}' ELSE '[]'::jsonb END
      ) assignment(value) ON assignment.value->>'employeeId' = account.employee_id
     WHERE account.pair_row_count = 1
       AND assignment.value->>'applicationId' = 'orgmaster'
       AND assignment.value->>'status' = 'active'
       AND NULLIF(assignment.value->>'employeeId', '') IS NOT NULL
       AND NULLIF(assignment.value->>'roleId', '') IS NOT NULL
       AND NULLIF(assignment.value->>'validFrom', '') IS NOT NULL
       AND (assignment.value->>'validFrom')::timestamptz <= CURRENT_TIMESTAMP
       AND (assignment.value->>'validTo' IS NULL OR (assignment.value->>'validTo')::timestamptz > CURRENT_TIMESTAMP)
       AND (
         (assignment.value->>'subjectKind' = 'employee' AND assignment.value->'targetPrincipalId' = 'null'::jsonb)
         OR (assignment.value->>'subjectKind' = 'principal' AND assignment.value->>'targetPrincipalId' = account.principal_id)
       )
       AND EXISTS (
         SELECT 1 FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(publication#>'{policy,applicationRoles}') = 'array'
             THEN publication#>'{policy,applicationRoles}' ELSE '[]'::jsonb END
         ) role(value)
          WHERE role.value->>'id' = assignment.value->>'roleId'
            AND role.value->>'applicationId' = 'orgmaster'
            AND role.value->>'status' = 'active'
       )
  ), native_administrators AS (
    -- The administrative projection checks every account of the selected
    -- Principal for ambiguity, even if only one issuer/subject was supplied.
    SELECT account.principal_id, min(account.employee_id) AS employee_id
      FROM (SELECT DISTINCT principal_id FROM exact_accounts) target
      CROSS JOIN LATERAL orgmaster_core.read_ai_pdm_principal_accounts_v1(target.principal_id, NULL, NULL) account
     WHERE account.employee_status = 'active' AND account.account_type IN ('human_personal', 'human_privileged')
     GROUP BY account.principal_id
    HAVING count(DISTINCT account.employee_id) = 1 AND count(DISTINCT account.account_type) = 1
  ), administrative_visibility AS (
    SELECT 1
      FROM exact_accounts account
      JOIN native_administrators native USING (principal_id, employee_id)
      JOIN orgmaster_core.v_current_workspace_employees_v1 employee
        ON employee.employee_id = native.employee_id AND employee.employee_status = 'active'
      JOIN LATERAL jsonb_array_elements(COALESCE(publication#>'{policy,administration,grants}', '[]'::jsonb)) grant_row(value)
        ON grant_row.value->>'principalId' = native.principal_id AND grant_row.value->>'employeeId' = native.employee_id
     WHERE grant_row.value->>'applicationId' = 'orgmaster'
       AND grant_row.value->>'status' = 'active'
       AND grant_row.value->>'subjectKind' = 'principal'
       AND grant_row.value->>'basis' = 'manual'
       AND grant_row.value->>'roleCode' = 'application_system_admin'
       AND grant_row.value#>>'{scope,kind}' = 'global'
       AND (grant_row.value->>'validFrom')::timestamptz <= CURRENT_TIMESTAMP
       AND (grant_row.value->>'validTo' IS NULL OR (grant_row.value->>'validTo')::timestamptz > CURRENT_TIMESTAMP)
       -- Migration 050 renamed this function. The legacy administration view
       -- remains bound to that same function OID, so keep its catalog rule.
       AND orgmaster_core.administrative_catalog_current_legacy_v1('orgmaster', grant_row.value->'catalogBinding')
  )
  SELECT 'orgmaster'::text, (publication->>'versionNumber')::bigint, 'visible'::text
   WHERE EXISTS (SELECT 1 FROM ordinary_visibility) OR EXISTS (SELECT 1 FROM administrative_visibility);
END;
$reader$;

REVOKE ALL ON FUNCTION orgmaster_contract.read_portal_orgmaster_visibility_v1(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orgmaster_contract.read_portal_orgmaster_visibility_v1(text, text) TO jenfu_platform_runtime;

COMMIT;
