-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_contract
-- contract-impact: target-scoped AI-PDM manager grant lookup; public ABI unchanged
-- compatibility: backward-compatible
-- governance-review: DEV-070
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SET LOCAL ROLE jenfu_orgmaster_migrator;
SELECT pg_advisory_xact_lock(hashtext('dev070-scoped-pdm-role-policy-manager'),hashtext(current_database()));

-- The typed reader retains the shared publication and catalog checks before
-- filtering the grant projection to this Principal and Employee.
CREATE OR REPLACE FUNCTION orgmaster_contract.ai_pdm_role_policy_manager_eligible_v2(p_principal text,p_employee text,p_issuer text,p_subject text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
SELECT EXISTS(SELECT 1 FROM orgmaster_contract.v_active_principal_accounts_v1 typed
 WHERE typed.principal_id=p_principal AND typed.employee_id=p_employee AND typed.principal_issuer=p_issuer AND typed.principal_subject=p_subject
 AND typed.employee_status='active' AND typed.account_type IN ('human_personal','human_privileged')
 AND EXISTS(SELECT 1 FROM orgmaster_contract.read_ai_pdm_principal_effective_grants_v5(p_principal,p_employee) effective
 WHERE effective.principal_id=p_principal AND effective.employee_id=p_employee AND effective.grant_kind='direct' AND effective.delegation_id IS NULL
 AND effective.subject_kind='principal' AND effective.target_principal_id=p_principal AND effective.scope_kind='global'
 AND (effective.stable_role_id='role-application-system-admin' AND effective.source_grant_id IS NOT NULL
   OR effective.stable_role_id='role-system-admin' AND effective.role_code='system_admin' AND typed.account_type='human_privileged')));
$fn$;

COMMIT;
