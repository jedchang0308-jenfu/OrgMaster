-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: organization.active-principal.v1 compatibility projection
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

-- The published identity mapping is the producer contract for both legacy and
-- managed principals.  The former access_governance view only projected
-- governance identityLinks, so a managed identity could be active in
-- orgmaster_contract.v_active_principal_mappings_v1 while the authority
-- switch preflight still observed zero principals.  Keep the old view name
-- and columns for existing callers, but source it from the published mapping
-- contract and derive account_type from the published admission data.
CREATE OR REPLACE VIEW orgmaster_contract.v_active_principal_links_v1
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
  COALESCE(
    CASE WHEN managed.identity_record_id IS NOT NULL THEN 'human_personal'::text END,
    governed.account_type,
    'human_personal'::text
  ) AS account_type,
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
LEFT JOIN governance_account_types governed
  ON governed.employee_id = mapping.employee_id
 AND governed.principal_id = mapping.principal_id
 AND governed.principal_issuer = mapping.principal_issuer
 AND governed.principal_subject = mapping.principal_subject;

ALTER VIEW orgmaster_contract.v_active_principal_links_v1 OWNER TO jenfu_orgmaster_migrator;
REVOKE ALL ON orgmaster_contract.v_active_principal_links_v1
  FROM PUBLIC, jenfu_platform_runtime, jenfu_ai_pdm_runtime;
GRANT SELECT ON orgmaster_contract.v_active_principal_links_v1
  TO jenfu_orgmaster_runtime, jenfu_platform_runtime, jenfu_ai_pdm_runtime;

-- Compatibility adapter: the authority switch function, outbox projection and
-- existing runner retain their stable access_governance name while observing
-- the same published mapping contract as Platform and AI-PDM.
CREATE OR REPLACE VIEW access_governance.v_active_principal_links_v1
WITH (security_barrier = true)
AS
SELECT
  contract_version,
  principal_issuer,
  principal_subject,
  principal_id,
  employee_id,
  account_type,
  employee_status,
  mapping_version,
  published_at
FROM orgmaster_contract.v_active_principal_links_v1;

ALTER VIEW access_governance.v_active_principal_links_v1 OWNER TO jenfu_orgmaster_migrator;
REVOKE ALL ON access_governance.v_active_principal_links_v1
  FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;

COMMENT ON VIEW orgmaster_contract.v_active_principal_links_v1 IS
  'Compatibility projection of the published active principal mapping. Managed rows are admitted from orgmaster_contract.v_active_principal_mappings_v1; account_type is derived from governance admission or managed identity state.';

COMMIT;
