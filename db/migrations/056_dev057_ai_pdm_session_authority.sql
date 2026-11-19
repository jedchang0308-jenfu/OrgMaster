-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: additive orgmaster_contract.read_ai_pdm_session_authority_v1(text,text)
-- compatibility: backward-compatible
-- governance-review: DEV-057
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_orgmaster_migrator;

CREATE FUNCTION orgmaster_core.read_ai_pdm_next_session_boundary_v1(
  p_principal_id text, p_employee_id text, p_publication jsonb, p_workspace jsonb
)
RETURNS timestamptz LANGUAGE sql STABLE SET search_path = pg_catalog AS $boundary$
  WITH assignments AS MATERIALIZED (
    SELECT assignment.value AS payload
    FROM jsonb_array_elements(COALESCE(p_publication#>'{policy,roleAssignments}', '[]')) assignment
    WHERE assignment.value->>'applicationId' = 'ai-pdm'
      AND assignment.value->>'status' = 'active'
  ), delegations AS MATERIALIZED (
    SELECT delegation.value AS payload, source.payload AS source_payload
    FROM jsonb_array_elements(COALESCE(p_publication#>'{policy,roleDelegations}', '[]')) delegation
    JOIN assignments source
      ON source.payload->>'id' = delegation.value->>'sourceAssignmentId'
     AND source.payload->>'employeeId' = delegation.value->>'fromEmployeeId'
     AND source.payload->>'roleId' = delegation.value->>'roleId'
     AND source.payload->>'catalogVersion' = delegation.value->>'catalogVersion'
     AND source.payload->'scope' = delegation.value->'scope'
    WHERE delegation.value->>'status' = 'active'
      AND delegation.value->>'toEmployeeId' = p_employee_id
  ), relevant_assignments AS MATERIALIZED (
    SELECT payload
    FROM assignments
    WHERE payload->>'employeeId' = p_employee_id
      AND (payload->>'subjectKind' = 'employee' OR payload->>'targetPrincipalId' = p_principal_id)
    UNION
    SELECT source_payload FROM delegations
  ), timed_sources AS (
    SELECT payload FROM relevant_assignments
    UNION ALL
    SELECT payload FROM delegations
    UNION ALL
    SELECT appointment.value
    FROM relevant_assignments assignment
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(assignment.payload->'sources', '[]')) source
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p_workspace#>'{state,assignments}', '[]')) appointment
    WHERE assignment.payload->>'basis' = 'position_adoption'
      AND appointment.value->>'id' = source.value->>'positionAssignmentId'
      AND appointment.value->>'positionId' = source.value->>'positionId'
      AND appointment.value->>'employeeId' = assignment.payload->>'employeeId'
    UNION ALL
    SELECT admin.value
    FROM jsonb_array_elements(COALESCE(p_publication#>'{policy,administration,grants}', '[]')) admin
    WHERE admin.value->>'applicationId' = 'ai-pdm'
      AND admin.value->>'principalId' = p_principal_id
      AND admin.value->>'employeeId' = p_employee_id
      AND admin.value->>'status' = 'active'
    UNION ALL
    SELECT identity.value
    FROM jsonb_array_elements(COALESCE(p_publication#>'{policy,identityLinks}', '[]')) identity
    WHERE identity.value->>'status' = 'active'
      AND (
        identity.value->>'principalId' = p_principal_id
        OR EXISTS (
          SELECT 1 FROM delegations
          WHERE source_payload->>'employeeId' = identity.value->>'employeeId'
        )
      )
  ), future_boundary AS (
    SELECT min(boundary.at) AS next_at
    FROM timed_sources
    CROSS JOIN LATERAL (VALUES
      (NULLIF(payload->>'validFrom', '')::timestamptz),
      (NULLIF(payload->>'validTo', '')::timestamptz)
    ) boundary(at)
    WHERE boundary.at > CURRENT_TIMESTAMP
  )
  SELECT next_at FROM future_boundary;
$boundary$;
REVOKE ALL ON FUNCTION orgmaster_core.read_ai_pdm_next_session_boundary_v1(text,text,jsonb,jsonb) FROM PUBLIC;

-- Read the same live V6 grants and active account rows under one MVCC snapshot.
-- Include scheduled and inherited validity bounds even when V6 returns no
-- grant yet, or when a source expires before the grant row's own valid_until.
CREATE FUNCTION orgmaster_contract.read_ai_pdm_session_authority_v1(
  p_principal_id text, p_employee_id text
)
RETURNS TABLE(
  contract_version text, source_version text, evaluated_at timestamptz,
  next_boundary timestamptz, accounts jsonb, grants jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $reader$
  WITH authority AS MATERIALIZED (
    SELECT owner.authority_version, owner.active_batch_id
    FROM orgmaster_core.persistence_authority owner
    JOIN orgmaster_core.persistence_batches batch
      ON batch.id = owner.active_batch_id AND batch.status = 'active'
    WHERE owner.singleton
  ), publication AS MATERIALIZED (
    SELECT orgmaster_core.read_administration_publication_v1() AS payload
  ), workspace AS MATERIALIZED (
    SELECT document.payload
    FROM authority
    JOIN orgmaster_core.persistence_artifacts manifest
      ON manifest.batch_id = authority.active_batch_id
     AND manifest.artifact_key = 'orgmaster-workspace.v1.json'
     AND manifest.artifact_kind = 'workspace-manifest'
    JOIN orgmaster_core.persistence_artifacts document
      ON document.batch_id = authority.active_batch_id
     AND document.artifact_key = 'orgmaster-versions/' || (manifest.payload->>'currentVersionId') || '.json'
     AND document.artifact_kind = 'workspace-version'
     AND document.payload->>'kind' = 'document'

  )
  SELECT 'orgmaster.ai-pdm-session-authority.v1', authority.authority_version::text,
         CURRENT_TIMESTAMP, orgmaster_core.read_ai_pdm_next_session_boundary_v1(p_principal_id, p_employee_id,
           (SELECT payload FROM publication), (SELECT payload FROM workspace)),
         COALESCE((
           SELECT jsonb_agg(to_jsonb(account) ORDER BY account.principal_issuer, account.principal_subject)
           FROM (
             SELECT * FROM orgmaster_core.read_ai_pdm_principal_accounts_v1(p_principal_id, NULL, NULL)
             LIMIT 3
           ) account
         ), '[]'::jsonb),
         COALESCE((
           SELECT jsonb_agg(to_jsonb(grant_row) ORDER BY grant_row.stable_role_id, grant_row.assignment_id)
           FROM (
             SELECT * FROM orgmaster_contract.read_ai_pdm_principal_effective_grants_v6(p_principal_id, p_employee_id)
             LIMIT 33
           ) grant_row
         ), '[]'::jsonb)
  FROM authority
  WHERE NULLIF(p_principal_id, '') IS NOT NULL AND NULLIF(p_employee_id, '') IS NOT NULL;
$reader$;

REVOKE ALL ON FUNCTION orgmaster_contract.read_ai_pdm_session_authority_v1(text,text) FROM PUBLIC;
-- PDM's first-login SECURITY DEFINER is owned by its existing migration role.
GRANT EXECUTE ON FUNCTION orgmaster_contract.read_ai_pdm_session_authority_v1(text,text)
  TO jenfu_ai_pdm_runtime, jenfu_ai_pdm_migrator;
COMMENT ON FUNCTION orgmaster_contract.read_ai_pdm_session_authority_v1(text,text) IS
  'Scoped consistent V6 login source and conservative next source validity boundary. Empty grant sets retain version and boundary metadata.';
COMMIT;
