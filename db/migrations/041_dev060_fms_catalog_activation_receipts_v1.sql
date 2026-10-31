-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: orgmaster.fms-catalog-activation.v1
-- compatibility: additive
-- governance-review: DEV-060
-- Manifest: config/contracts/orgmaster-fms-catalog-activation.v1.json
-- The manifest hash pins the complete UTF-8 file, including its final newline.
-- Receipts retain their original Principal, command and checkpoint. Historical
-- publications remain readable after a later activation; no intent is inferred.
-- The FMS adapter verifies the sorted-JSON audit afterHash over the complete
-- proof. SQL exposes the stored hash and never defines another hash helper.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtext('dev060-fms-catalog-activation-v1'), hashtext(current_database()));
SET LOCAL ROLE jenfu_orgmaster_migrator;

CREATE VIEW orgmaster_contract.v_fms_catalog_activation_receipts_v1 (
  contract_version, manifest_hash, source, principal_id, operation_id, intent_id,
  input_hash, org_command_id, org_request_hash, preview_hash, proof,
  audit_after_hash, assignment_version_after, published_snapshot_hash,
  published_by_principal_id, published_at, accepted_at, terminal_at,
  governance_revision_after
)
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
     AND artifact.artifact_kind = 'governance'
     AND artifact.artifact_key = 'orgmaster-governance.v3.json'
   WHERE authority.singleton = true
), receipt_rows AS (
  SELECT governance.payload,
         entry.value AS receipt,
         entry.value->'financialCatalogActivation' AS proof,
         entry.value#>'{financialCatalogActivation,fmsCheckpoint}' AS checkpoint,
         entry.value#>'{financialCatalogActivation,fmsCheckpoint,intent}' AS intent
    FROM active_governance governance
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(governance.payload->'commandReceipts') = 'array'
        THEN governance.payload->'commandReceipts' ELSE '[]'::jsonb END
    ) entry(value)
), joined_receipts AS (
  SELECT receipt_rows.*,
         audit.value AS event,
         version.value AS publication
    FROM receipt_rows
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(payload->'auditEvents') = 'array'
        THEN payload->'auditEvents' ELSE '[]'::jsonb END
    ) audit(value)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(payload->'publishedVersions') = 'array'
        THEN payload->'publishedVersions' ELSE '[]'::jsonb END
    ) version(value)
)
SELECT 'orgmaster.fms-catalog-activation.v1'::text AS contract_version,
       '24cbdf33cfa427278f9acb22695bfebfdf941a1a19439b486fa52f58d6544c80'::text AS manifest_hash,
       checkpoint->>'source' AS source,
       proof->>'principalId' AS principal_id,
       intent->>'operationId' AS operation_id,
       intent->>'intentId' AS intent_id,
       intent->>'inputHash' AS input_hash,
       receipt->>'commandId' AS org_command_id,
       receipt->>'requestHash' AS org_request_hash,
       receipt->>'previewHash' AS preview_hash,
       proof AS proof,
       event->>'afterHash' AS audit_after_hash,
       proof->>'assignmentVersionAfter' AS assignment_version_after,
       proof->>'publishedSnapshotHash' AS published_snapshot_hash,
       publication->>'publishedByPrincipalId' AS published_by_principal_id,
       publication->>'publishedAt' AS published_at,
       receipt->>'acceptedAt' AS accepted_at,
       receipt->>'terminalAt' AS terminal_at,
       receipt->>'governanceRevision' AS governance_revision_after
  FROM joined_receipts
 WHERE receipt->>'contractVersion' = 'orgmaster.governance-command-receipt.v2'
   AND receipt->>'receiptStatus' = 'applied'
   AND NULLIF(receipt->>'commandId', '') IS NOT NULL
   AND receipt->>'requestHash' ~ '^[a-f0-9]{64}$'
   AND receipt->>'previewHash' ~ '^[a-f0-9]{64}$'
   AND jsonb_typeof(proof) = 'object'
   AND proof->>'contractVersion' = 'orgmaster.fms-catalog-activation-record.v1'
   AND NULLIF(proof->>'principalId', '') IS NOT NULL
   AND NULLIF(proof->>'employeeId', '') IS NOT NULL
   AND NULLIF(proof->>'catalogVersion', '') IS NOT NULL
   AND proof->>'contentSha256' ~ '^[a-f0-9]{64}$'
   AND proof->>'artifactSha256' ~ '^[a-f0-9]{64}$'
   AND NULLIF(proof->>'governanceRevisionBefore', '') IS NOT NULL
   AND NULLIF(proof->>'assignmentVersionBefore', '') IS NOT NULL
   AND NULLIF(proof->>'catalogBindingRevisionBefore', '') IS NOT NULL
   AND NULLIF(proof->>'grantRevisionBefore', '') IS NOT NULL
   AND NULLIF(proof->>'authorityReadAt', '') IS NOT NULL
   AND jsonb_typeof(checkpoint) = 'object'
   AND checkpoint->>'schemaVersion' = 'fms.governance-checkpoint.v1'
   AND checkpoint->>'source' IN ('formal', 'local_test')
   AND checkpoint->>'employeeId' = proof->>'employeeId'
   AND checkpoint->'receipt' = 'null'::jsonb
   AND jsonb_typeof(intent) = 'object'
   AND intent->>'schemaVersion' = 'fms.governance-intent.v1'
   AND intent->>'applicationId' = 'financial-management-system'
   AND intent->>'companyId' = 'jenfu-machinery'
   AND NULLIF(intent->>'intentId', '') IS NOT NULL
   AND intent->>'inputHash' ~ '^[a-f0-9]{64}$'
   AND intent->>'operationId' = receipt->>'commandId'
   AND intent->>'principalId' = proof->>'principalId'
   AND intent->>'catalogVersion' = proof->>'catalogVersion'
   AND intent->>'contentSha256' = proof->>'contentSha256'
   AND intent->>'artifactSha256' = proof->>'artifactSha256'
   AND intent->>'previewHash' = receipt->>'previewHash'
   AND intent->>'expectedGovernanceRevision' = proof->>'governanceRevisionBefore'
   AND intent->>'expectedAssignmentVersion' = proof->>'assignmentVersionBefore'
   AND intent->>'expectedCatalogBindingRevision' = proof->>'catalogBindingRevisionBefore'
   AND intent->>'expectedGrantRevision' = proof->>'grantRevisionBefore'
   AND event->>'id' = receipt->>'auditReference'
   AND event->>'commandId' = receipt->>'commandId'
   AND event->>'action' = 'financial_catalog_activate'
   AND event->>'entityType' = 'financialCatalogRelease'
   AND event->>'actorPrincipalId' = proof->>'principalId'
   AND event->>'entityId' = proof->>'catalogVersion'
   AND event->>'afterHash' ~ '^[a-f0-9]{64}$'
   AND publication->>'kind' = 'assignment-governance-v3'
   AND publication->>'id' = proof->>'assignmentVersionAfter'
   AND publication->>'snapshotHash' = proof->>'publishedSnapshotHash'
   AND proof->>'publishedSnapshotHash' ~ '^[a-f0-9]{64}$'
   AND publication->>'publishedByPrincipalId' = proof->>'principalId'
   AND receipt->>'governanceRevision' = publication->>'id'
   AND NULLIF(publication->>'publishedAt', '') IS NOT NULL
   AND receipt->>'acceptedAt' = publication->>'publishedAt'
   AND receipt->>'terminalAt' = publication->>'publishedAt'
   AND EXISTS (
     SELECT 1
       FROM jsonb_array_elements(
         CASE WHEN jsonb_typeof(publication->'externalRoleCatalogs') = 'array'
           THEN publication->'externalRoleCatalogs' ELSE '[]'::jsonb END
       ) catalog(value)
      WHERE catalog.value->>'applicationId' = 'financial-management-system'
        AND catalog.value->>'catalogVersion' = proof->>'catalogVersion'
        AND catalog.value->>'contentSha256' = proof->>'contentSha256'
        AND catalog.value->>'artifactSha256' = proof->>'artifactSha256'
   );

ALTER VIEW orgmaster_contract.v_fms_catalog_activation_receipts_v1 OWNER TO jenfu_orgmaster_migrator;
REVOKE ALL ON orgmaster_contract.v_fms_catalog_activation_receipts_v1
  FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime,
    jenfu_platform_migrator, jenfu_ai_pdm_migrator;

CREATE VIEW orgmaster_contract.v_fms_catalog_binding_v1 (
  contract_version, manifest_hash, application_id, company_id, catalog_version,
  content_sha256, artifact_sha256, catalog_binding_revision, assignment_version,
  governance_revision
)
WITH (security_barrier = true)
AS
WITH active_governance AS (
  SELECT artifact.payload,
         trim(artifact.canonical_sha256) AS governance_revision
    FROM orgmaster_core.persistence_authority authority
    JOIN orgmaster_core.persistence_batches batch
      ON batch.id = authority.active_batch_id
     AND batch.status = 'active'
    JOIN orgmaster_core.persistence_artifacts artifact
      ON artifact.batch_id = batch.id
     AND artifact.artifact_kind = 'governance'
     AND artifact.artifact_key = 'orgmaster-governance.v3.json'
   WHERE authority.singleton = true
     AND trim(artifact.canonical_sha256) ~ '^[a-f0-9]{64}$'
), active_version AS (
  SELECT version.value AS payload,
         governance.governance_revision
    FROM active_governance governance
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(governance.payload->'publishedVersions') = 'array'
        THEN governance.payload->'publishedVersions' ELSE '[]'::jsonb END
    ) version(value)
   WHERE version.value->>'id' = governance.payload->>'activePolicyVersionId'
     AND version.value->>'kind' = 'assignment-governance-v3'
)
SELECT 'orgmaster.fms-catalog-activation.v1'::text AS contract_version,
       '24cbdf33cfa427278f9acb22695bfebfdf941a1a19439b486fa52f58d6544c80'::text AS manifest_hash,
       'financial-management-system'::text AS application_id,
       'jenfu-machinery'::text AS company_id,
       catalog.value->>'catalogVersion' AS catalog_version,
       catalog.value->>'contentSha256' AS content_sha256,
       catalog.value->>'artifactSha256' AS artifact_sha256,
       catalog.value->>'contentSha256' AS catalog_binding_revision,
       active_version.payload->>'id' AS assignment_version,
       active_version.governance_revision AS governance_revision
  FROM active_version
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(active_version.payload->'externalRoleCatalogs') = 'array'
      THEN active_version.payload->'externalRoleCatalogs' ELSE '[]'::jsonb END
  ) catalog(value)
 WHERE catalog.value->>'applicationId' = 'financial-management-system'
   AND catalog.value->>'sourceKind' = 'application-contract'
   AND catalog.value->>'validationState' = 'valid'
   AND catalog.value->>'effectState' = 'not-synchronized'
   AND NULLIF(catalog.value->>'catalogVersion', '') IS NOT NULL
   AND catalog.value->>'contentSha256' ~ '^[a-f0-9]{64}$'
   AND catalog.value->>'artifactSha256' ~ '^[a-f0-9]{64}$'
   AND NULLIF(catalog.value->>'publishedByPrincipalId', '') IS NOT NULL
   AND NULLIF(catalog.value->>'publishedByEmployeeId', '') IS NOT NULL;

ALTER VIEW orgmaster_contract.v_fms_catalog_binding_v1 OWNER TO jenfu_orgmaster_migrator;
REVOKE ALL ON orgmaster_contract.v_fms_catalog_binding_v1
  FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime,
    jenfu_platform_migrator, jenfu_ai_pdm_migrator;

DO $fms_reader$
DECLARE
  existing_role text;
BEGIN
  FOR existing_role IN
    SELECT rolname FROM pg_catalog.pg_roles
     WHERE rolname IN ('fms_runtime', 'fms_migrator', 'fms_import_admin')
  LOOP
    EXECUTE format('REVOKE ALL ON orgmaster_contract.v_fms_catalog_activation_receipts_v1, orgmaster_contract.v_fms_catalog_binding_v1 FROM %I', existing_role);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'fms_runtime') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA orgmaster_contract TO fms_runtime';
    EXECUTE 'GRANT SELECT ON orgmaster_contract.v_fms_catalog_activation_receipts_v1 TO fms_runtime';
    EXECUTE 'GRANT SELECT ON orgmaster_contract.v_fms_catalog_binding_v1 TO fms_runtime';
  END IF;
END;
$fms_reader$;

COMMENT ON VIEW orgmaster_contract.v_fms_catalog_activation_receipts_v1 IS
  'Original Principal and operation receipts with a persisted FMS checkpoint, exact activation audit and publication evidence; the adapter verifies audit_after_hash using sorted JSON.';
COMMENT ON VIEW orgmaster_contract.v_fms_catalog_binding_v1 IS
  'Minimal current FMS catalog binding from the active governance publication; source is selected by the server adapter.';

INSERT INTO orgmaster_core.contract_manifest (contract_id, contract_version, signature_sha256, payload_sha256)
VALUES ('orgmaster.fms-catalog-activation-v1', 'orgmaster.fms-catalog-activation.v1', '24cbdf33cfa427278f9acb22695bfebfdf941a1a19439b486fa52f58d6544c80', NULL);

COMMIT;
