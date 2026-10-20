-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: additive read ACL and ai-pdm.role-policy-manager.v1
-- compatibility: backward-compatible
-- governance-review: ORGMASTER/DEV-058 / AIPDM/DEV-123
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_orgmaster_migrator;
GRANT USAGE ON SCHEMA orgmaster_contract TO jenfu_ai_pdm_migrator;
GRANT SELECT ON orgmaster_contract.v_ai_pdm_role_policy_compatibility_v2 TO jenfu_ai_pdm_migrator;

-- Keep the existing writer order. This function exposes locks, never core rows.
-- A separate statement after this call obtains a post-wait READ COMMITTED view.
CREATE FUNCTION orgmaster_contract.lock_ai_pdm_role_policy_authority_v1()
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog AS $fence$
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed'
     OR current_setting('transaction_read_only') <> 'off' THEN
    RAISE EXCEPTION 'ROLE_POLICY_FENCE_TRANSACTION_REQUIRED' USING ERRCODE='25000';
  END IF;
  PERFORM 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROLE_POLICY_AUTHORITY_UNAVAILABLE' USING ERRCODE='55000'; END IF;
  PERFORM 1 FROM orgmaster_core.persistence_authority WHERE singleton FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROLE_POLICY_AUTHORITY_UNAVAILABLE' USING ERRCODE='55000'; END IF;
END;
$fence$;

-- This narrow management contract adds wall-clock eligibility to v4. Existing
-- grants/views retain their version and behavior. Privileged managers require
-- one explicit, currently valid governed identity for the verified provider pair.
CREATE FUNCTION orgmaster_contract.ai_pdm_role_policy_manager_eligible_v1(
  p_principal_id text, p_employee_id text, p_issuer text, p_subject text
) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog AS $eligible$
  WITH checked AS MATERIALIZED (SELECT clock_timestamp() AS at),
  governance AS (
    SELECT artifact.payload
    FROM orgmaster_core.persistence_authority authority
    JOIN orgmaster_core.persistence_batches batch
      ON batch.id=authority.active_batch_id AND batch.status='active'
    JOIN orgmaster_core.persistence_artifacts artifact
      ON artifact.batch_id=batch.id AND artifact.artifact_kind='governance'
     AND artifact.artifact_key='orgmaster-governance.v3.json'
    WHERE authority.singleton
  ), versions AS (
    SELECT version.value AS payload FROM governance
    CROSS JOIN LATERAL jsonb_array_elements(governance.payload->'publishedVersions') version(value)
    WHERE version.value->>'id'=governance.payload->>'activePolicyVersionId'
      AND version.value->>'kind'='assignment-governance-v3'
  ), pair_links AS (
    SELECT link.value AS payload, versions.payload AS version_payload
    FROM versions
    CROSS JOIN LATERAL jsonb_array_elements(versions.payload#>'{policy,identityLinks}') link(value)
    CROSS JOIN checked
    WHERE link.value->>'issuer'=p_issuer AND link.value->>'subject'=p_subject
      AND link.value->>'status'='active'
      AND (link.value->>'validFrom')::timestamptz <= checked.at
      AND (link.value->>'validTo' IS NULL OR (link.value->>'validTo')::timestamptz > checked.at)
  )
  SELECT (SELECT count(*)=1 FROM pair_links)
    AND (SELECT count(*)=1 FROM pair_links
      CROSS JOIN LATERAL jsonb_array_elements(pair_links.version_payload#>'{policy,principalAdmissions}') admission(value)
      WHERE pair_links.payload->>'principalId'=p_principal_id
        AND pair_links.payload->>'employeeId'=p_employee_id
        AND admission.value->>'identityLinkId'=pair_links.payload->>'id'
        AND admission.value->>'status'='active' AND admission.value->>'accountType'='human_privileged')
    AND (SELECT count(*)=1 FROM orgmaster_contract.v_active_principal_accounts_v1
      WHERE principal_id=p_principal_id AND employee_id=p_employee_id
        AND principal_issuer=p_issuer AND principal_subject=p_subject
        AND employee_status='active' AND account_type='human_privileged')
    AND (SELECT count(*)=1 FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v4 grant_row
      CROSS JOIN checked
      WHERE grant_row.application_id='ai-pdm'
        AND grant_row.principal_id=p_principal_id AND grant_row.employee_id=p_employee_id
        AND grant_row.stable_role_id='role-system-admin' AND grant_row.role_code='system_admin'
        AND grant_row.subject_kind='principal' AND grant_row.target_principal_id=p_principal_id
        AND grant_row.grant_kind='direct' AND grant_row.delegation_id IS NULL
        AND grant_row.scope_kind='global' AND grant_row.scope_key IS NULL
        AND grant_row.valid_from <= checked.at
        AND (grant_row.valid_until IS NULL OR grant_row.valid_until > checked.at));
$eligible$;

REVOKE ALL ON FUNCTION orgmaster_contract.lock_ai_pdm_role_policy_authority_v1(),
  orgmaster_contract.ai_pdm_role_policy_manager_eligible_v1(text,text,text,text)
  FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime,
    jenfu_platform_migrator, jenfu_ai_pdm_migrator;
GRANT EXECUTE ON FUNCTION orgmaster_contract.lock_ai_pdm_role_policy_authority_v1(),
  orgmaster_contract.ai_pdm_role_policy_manager_eligible_v1(text,text,text,text)
  TO jenfu_ai_pdm_runtime, jenfu_ai_pdm_migrator;

INSERT INTO orgmaster_core.contract_manifest(contract_id,contract_version,signature_sha256,payload_sha256)
VALUES ('orgmaster.ai-pdm-role-policy-manager-v1','ai-pdm.role-policy-manager.v1',
  '9f9e661f1d410ff93f46239f3bbc1477781bfd955a952df313bf620d9406d22a',NULL);
COMMIT;
