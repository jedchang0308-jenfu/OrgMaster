-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: orgmaster.active-principal-account.v1 adapter
-- compatibility: backward-compatible
-- governance-review: DEV-014

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SELECT pg_advisory_xact_lock(
  hashtext('dev014-authority-principal-projection-contract'),
  hashtext(current_database())
);
SET LOCAL ROLE jenfu_orgmaster_migrator;

-- The published identity mapping is the role-neutral producer contract for
-- both legacy and managed principals. The Platform-owned
-- access_governance.v_active_principal_links_v1 remains a legacy projection
-- over governance identityLinks; it is intentionally not changed here.
-- Publish an OrgMaster-owned account-typed adapter over the canonical mapping
-- so consumers that need account classification can verify an exact active
-- managed identity or an explicit governance admission. A role-neutral
-- mapping without either classification stays out of this adapter.
CREATE OR REPLACE VIEW orgmaster_contract.v_active_principal_accounts_v1
WITH (security_barrier = true)
AS
WITH active_governance AS (
  SELECT artifact.payload
  FROM orgmaster_core.persistence_authority authority
  JOIN orgmaster_core.persistence_batches batch
    ON batch.id = authority.active_batch_id
   AND batch.status = 'active'
  JOIN orgmaster_core.persistence_artifacts artifact
    ON artifact.batch_id = batch.id
   AND artifact.artifact_key = 'orgmaster-governance.v3.json'
   AND artifact.artifact_kind = 'governance'
  WHERE authority.singleton = true
), active_version AS (
  SELECT version.value AS payload
  FROM active_governance governance
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(governance.payload->'publishedVersions') = 'array'
      THEN governance.payload->'publishedVersions' ELSE '[]'::jsonb END
  ) version(value)
  WHERE version.value->>'id' = governance.payload->>'activePolicyVersionId'
    AND version.value->>'kind' = 'assignment-governance-v3'
), governance_account_types AS (
  SELECT
    link.value->>'issuer' AS principal_issuer,
    link.value->>'subject' AS principal_subject,
    link.value->>'principalId' AS principal_id,
    link.value->>'employeeId' AS employee_id,
    admission.value->>'accountType' AS account_type
  FROM active_version version
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(version.payload#>'{policy,identityLinks}') = 'array'
      THEN version.payload#>'{policy,identityLinks}' ELSE '[]'::jsonb END
  ) link(value)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(version.payload#>'{policy,principalAdmissions}') = 'array'
      THEN version.payload#>'{policy,principalAdmissions}' ELSE '[]'::jsonb END
  ) admission(value)
  WHERE link.value->>'status' = 'active'
    AND admission.value->>'identityLinkId' = link.value->>'id'
    AND admission.value->>'status' = 'active'
    AND admission.value->>'accountType' IN ('human_personal', 'human_privileged')
)
SELECT
  mapping.contract_version,
  mapping.principal_issuer,
  mapping.principal_subject,
  mapping.principal_id,
  mapping.employee_id,
  COALESCE(CASE WHEN managed.identity_record_id IS NOT NULL THEN 'human_personal'::text END,
           governed.account_type) AS account_type,
  mapping.employee_status,
  mapping.mapping_version,
  mapping.published_at
FROM orgmaster_contract.v_active_principal_mappings_v1 mapping
LEFT JOIN orgmaster_core.managed_daily_identities managed
  ON managed.employee_id = mapping.employee_id
 AND managed.principal_id = mapping.principal_id
 AND managed.auth_issuer = mapping.principal_issuer
 AND managed.auth_subject = mapping.principal_subject
 AND managed.link_state = 'active'
 AND managed.admission_revision = mapping.mapping_version
 AND managed.admission_changed_at = mapping.published_at
 AND EXISTS (
   SELECT 1 FROM orgmaster_core.managed_identity_admission_authority authority
    WHERE authority.singleton = true AND authority.admission_enabled
 )
 AND EXISTS (
   SELECT 1 FROM orgmaster_core.managed_identity_observations observation
    WHERE observation.identity_record_id = managed.identity_record_id
      AND observation.directory_state = 'present'
 )
 AND NOT EXISTS (
   SELECT 1 FROM orgmaster_core.managed_identity_lifecycle_outbox lifecycle
    WHERE lifecycle.employee_id = managed.employee_id
      AND lifecycle.status <> 'completed'
 )
LEFT JOIN governance_account_types governed
  ON governed.employee_id = mapping.employee_id
 AND governed.principal_id = mapping.principal_id
 AND governed.principal_issuer = mapping.principal_issuer
 AND governed.principal_subject = mapping.principal_subject
WHERE managed.identity_record_id IS NOT NULL
   OR governed.account_type IS NOT NULL;

ALTER VIEW orgmaster_contract.v_active_principal_accounts_v1 OWNER TO jenfu_orgmaster_migrator;
REVOKE ALL ON orgmaster_contract.v_active_principal_accounts_v1
  FROM PUBLIC, jenfu_platform_runtime, jenfu_ai_pdm_runtime,
    jenfu_platform_migrator, jenfu_orgmaster_migrator;
GRANT SELECT ON orgmaster_contract.v_active_principal_accounts_v1
  TO jenfu_orgmaster_runtime, jenfu_platform_runtime, jenfu_ai_pdm_runtime,
    jenfu_platform_migrator, jenfu_orgmaster_migrator;
GRANT USAGE ON SCHEMA orgmaster_contract TO jenfu_platform_migrator;

COMMENT ON VIEW orgmaster_contract.v_active_principal_accounts_v1 IS
  'OrgMaster-owned account-typed adapter over v_active_principal_mappings_v1. Managed rows require an exact active identity/admission match; legacy rows require explicit governance admission. The Platform-owned access_governance projection is unchanged.';

COMMIT;
