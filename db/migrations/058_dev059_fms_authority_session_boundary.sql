-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: versioned FMS sign-in validity reader
-- compatibility: additive
-- governance-review: DEV-059
BEGIN;
SET LOCAL ROLE jenfu_orgmaster_migrator;

-- A null boundary is returned only for a matching live, readable
-- publication. No row means that the authority snapshot must not be used.
CREATE FUNCTION orgmaster_contract.read_fms_authority_session_boundary_v1(
  p_principal_id text, p_employee_id text, p_principal_binding_version text,
  p_governance_revision text, p_authority_read_at timestamptz
)
RETURNS TABLE(contract_version text, governance_revision text, next_transition_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $boundary$
WITH source AS MATERIALIZED (
  SELECT *
  FROM orgmaster_core.v_fms_fact_source_v1 publication
  WHERE publication.governance_revision = p_governance_revision
    AND p_authority_read_at <= CURRENT_TIMESTAMP
    AND p_authority_read_at > CURRENT_TIMESTAMP - interval '10 seconds'
    AND orgmaster_contract.is_fms_authority_publication_ready_v1()
), account AS MATERIALIZED (
  SELECT found.principal_id, found.employee_id, found.mapping_version::text AS binding_version
  FROM orgmaster_core.read_fms_fact_accounts_v1(p_principal_id, NULL, NULL) found
  WHERE NULLIF(p_principal_id, '') IS NOT NULL
    AND found.principal_id = p_principal_id
    AND found.account_type IN ('human_personal','human_privileged')
    AND found.employee_status = 'active'
), matched AS MATERIALIZED (
  SELECT source.batch_id, source.governance_revision, account.principal_id, account.employee_id
  FROM source CROSS JOIN account
  WHERE (SELECT count(*) FROM account) = 1
    AND account.employee_id = p_employee_id
    AND account.binding_version = p_principal_binding_version
)
SELECT 'jenfu.orgmaster.fms-authority-session-boundary.v1'::text,
       matched.governance_revision,
       boundary.next_transition_at
FROM matched
CROSS JOIN LATERAL (
  SELECT min(instant.value) AS next_transition_at
  FROM (
    -- Indexed principal/employee lookups include future eligible facts.
    -- A conservative earlier expiry for an active fact is safe; this
    -- contract does not confer any permissions.
    SELECT assignment.fact
    FROM orgmaster_core.fms_artifact_facts assignment
    WHERE assignment.batch_id = matched.batch_id
      AND assignment.artifact_key = 'orgmaster-governance.v3.json'
      AND assignment.kind = 'assignment'
      AND assignment.lookup_key = matched.employee_id
      AND assignment.fact->>'subjectKind' = 'employee'
      AND assignment.fact->>'targetPrincipalId' IS NULL
      AND assignment.fact#>>'{scope,kind}' = 'workspace'
      AND assignment.fact#>>'{scope,value}' = 'company-jenfu'
    UNION ALL
    SELECT grant_row.fact
    FROM orgmaster_core.fms_artifact_facts grant_row
    WHERE grant_row.batch_id = matched.batch_id
      AND grant_row.artifact_key = 'orgmaster-governance.v3.json'
      AND grant_row.kind IN ('management_grant','admin_grant','principal_link')
      AND grant_row.lookup_key = matched.principal_id
      AND grant_row.fact->>'employeeId' = matched.employee_id
  ) relevant
  CROSS JOIN LATERAL (VALUES
    (NULLIF(relevant.fact->>'validFrom', '')::timestamptz),
    (NULLIF(relevant.fact->>'validTo', '')::timestamptz)
  ) instant(value)
  WHERE relevant.fact->>'status' = 'active' AND instant.value > p_authority_read_at
) boundary;
$boundary$;

REVOKE ALL ON FUNCTION orgmaster_contract.read_fms_authority_session_boundary_v1(text,text,text,text,timestamptz) FROM PUBLIC;
DO $fms_acl$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fms_runtime') THEN
    GRANT EXECUTE ON FUNCTION orgmaster_contract.read_fms_authority_session_boundary_v1(text,text,text,text,timestamptz) TO fms_runtime;
  END IF;
END; $fms_acl$;

COMMENT ON FUNCTION orgmaster_contract.read_fms_authority_session_boundary_v1(text,text,text,text,timestamptz) IS
  'Login-only validity limit for the exact FMS authority snapshot and Principal binding. Includes scheduled starts and expirations; zero rows on drift.';
COMMIT;
