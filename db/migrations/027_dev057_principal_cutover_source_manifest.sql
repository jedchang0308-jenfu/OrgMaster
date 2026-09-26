-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: orgmaster.principal-cutover-source.v1
-- compatibility: backward-compatible
-- governance-review: DEV-057 / DEV-121

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SELECT pg_advisory_xact_lock(
  hashtext('dev057-principal-cutover-source-manifest'),
  hashtext(current_database())
);
SET LOCAL ROLE jenfu_orgmaster_migrator;

-- The AI-PDM owner reads only versioned OrgMaster contracts.  The existing
-- grants in 024/025 cover data views, but not the manifest needed to attest
-- the producer contract versions before a principal cutover.
DO $required_contracts$
BEGIN
  IF to_regclass('orgmaster_contract.v_active_principal_mappings_v1') IS NULL
     OR to_regclass('orgmaster_contract.v_active_principal_accounts_v1') IS NULL
     OR to_regclass('orgmaster_contract.v_ai_pdm_entitlement_authority_v1') IS NULL
     OR to_regclass('orgmaster_contract.v_ai_pdm_principal_effective_grants_v2') IS NULL
     OR to_regclass('orgmaster_contract.v_contract_manifest_v1') IS NULL THEN
    RAISE EXCEPTION 'DEV057_CUTOVER_SOURCE_CONTRACT_MISSING' USING ERRCODE = '55000';
  END IF;
END;
$required_contracts$;

INSERT INTO orgmaster_core.contract_manifest (
  contract_id, contract_version, signature_sha256, payload_sha256
) VALUES (
  'orgmaster.principal-cutover-source',
  'jenfu.orgmaster.principal-cutover-source.v1',
  -- SHA-256 of the fixed interface declaration documented in DEV-057:
  -- orgmaster.principal-cutover-source.v1|v_active_principal_mappings_v1|
  -- v_active_principal_accounts_v1|v_ai_pdm_entitlement_authority_v1|
  -- v_ai_pdm_principal_effective_grants_v2|principal_id,employee_id,
  -- account_type,authority_version,assignment_version
  'ff36f90ac9b42d740d44cd049f45e27e5d08db0226dc9510041bd5bad9b51531',
  NULL
)
ON CONFLICT (contract_id) DO NOTHING;

DO $manifest_readback$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM orgmaster_core.contract_manifest
    WHERE contract_id = 'orgmaster.principal-cutover-source'
      AND contract_version = 'jenfu.orgmaster.principal-cutover-source.v1'
      AND signature_sha256 = 'ff36f90ac9b42d740d44cd049f45e27e5d08db0226dc9510041bd5bad9b51531'
      AND payload_sha256 IS NULL
  ) THEN
    RAISE EXCEPTION 'DEV057_CUTOVER_SOURCE_MANIFEST_DRIFT' USING ERRCODE = '55000';
  END IF;
END;
$manifest_readback$;

GRANT SELECT ON orgmaster_contract.v_contract_manifest_v1
  TO jenfu_ai_pdm_migrator;

COMMIT;
