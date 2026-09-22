-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core
-- contract-impact: corrective employee activation eligibility routine
-- compatibility: additive
-- governance-review: DEV-014 / OrgMaster DEV-054

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SELECT pg_advisory_xact_lock(
  hashtext('dev014-employee-activation-contract'),
  hashtext(current_database())
);
SET LOCAL ROLE jenfu_orgmaster_migrator;

CREATE OR REPLACE FUNCTION orgmaster_core.assert_employee_activation_v1(
  p_employee_id text,
  p_expected_workspace_revision text
)
RETURNS TABLE(allowed boolean, correction_required boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  WITH target AS (
    SELECT e.employee_id
      FROM orgmaster_core.v_current_workspace_employees_v1 e
     WHERE e.employee_id = p_employee_id
       AND e.workspace_revision = p_expected_workspace_revision
       AND e.employee_status IN ('active', 'inactive')
  ), eligibility AS (
    SELECT EXISTS (
      SELECT 1
        FROM orgmaster_core.employee_number_assignments a
        JOIN target t ON t.employee_id = a.employee_id
    ) AS has_assignment,
    EXISTS (
      SELECT 1
        FROM orgmaster_core.employee_number_legacy_exemptions e
        JOIN target t ON t.employee_id = e.employee_id
       WHERE e.resolved_at IS NULL
    ) AS has_legacy_exemption
  )
  SELECT EXISTS (SELECT 1 FROM target)
           AND (eligibility.has_assignment OR eligibility.has_legacy_exemption),
         EXISTS (SELECT 1 FROM target)
           AND NOT eligibility.has_assignment
    FROM eligibility;
$fn$;

ALTER FUNCTION orgmaster_core.assert_employee_activation_v1(text, text) OWNER TO jenfu_orgmaster_migrator;

REVOKE ALL ON FUNCTION orgmaster_core.assert_employee_activation_v1(text, text)
  FROM PUBLIC, jenfu_platform_runtime, jenfu_ai_pdm_runtime;
GRANT EXECUTE ON FUNCTION orgmaster_core.assert_employee_activation_v1(text, text)
  TO jenfu_orgmaster_runtime;

COMMIT;
