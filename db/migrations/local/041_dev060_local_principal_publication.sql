-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: orgmaster.local-principal-publication.v1
-- compatibility: additive
-- governance-review: ORGMASTER/DEV-060, JENFU/DEV-021
-- Local-only read wrapper over native published data. No shadow grant store.
-- Excluded from the ordinary production migration profile.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $local_target$
BEGIN
  IF current_database() !~ '^jenfu_local_[a-z0-9_]{3,51}$'
     OR COALESCE(host(inet_server_addr()), '') NOT IN ('127.0.0.1', '::1') THEN
    RAISE EXCEPTION 'LOCAL_SANDBOX_TARGET_REQUIRED';
  END IF;
END
$local_target$;
SET LOCAL ROLE jenfu_orgmaster_migrator;

CREATE VIEW orgmaster_contract.v_local_principal_publications_v1
WITH (security_barrier = true)
AS
WITH active_version AS (
  SELECT version.value AS payload
    FROM orgmaster_core.persistence_authority authority
    JOIN orgmaster_core.persistence_batches batch
      ON batch.id = authority.active_batch_id AND batch.status = 'active'
    JOIN orgmaster_core.persistence_artifacts artifact
      ON artifact.batch_id = batch.id
     AND artifact.artifact_kind = 'governance'
     AND artifact.artifact_key = 'orgmaster-governance.v3.json'
   CROSS JOIN LATERAL jsonb_array_elements(
     CASE WHEN jsonb_typeof(artifact.payload->'publishedVersions') = 'array'
       THEN artifact.payload->'publishedVersions' ELSE '[]'::jsonb END
   ) version(value)
   WHERE authority.singleton = true
     AND version.value->>'id' = artifact.payload->>'activePolicyVersionId'
     AND version.value->>'kind' = 'assignment-governance-v3'
     AND version.value->>'hashFormat' = 'orgmaster.sorted-json.v1'
     AND version.value->>'snapshotHash' ~ '^[a-f0-9]{64}$'
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(
         CASE WHEN jsonb_typeof(version.value#>'{policy,identityLinks}') = 'array'
           THEN version.value#>'{policy,identityLinks}' ELSE '[]'::jsonb END
       ) identity_link(value)
       WHERE identity_link.value->>'issuer' IS DISTINCT FROM 'urn:jenfu:local-principal-sandbox'
          OR COALESCE(identity_link.value->>'subject', '') !~ '^local-[a-z0-9-]+$'
          OR COALESCE(identity_link.value->>'principalId', '') !~ '^local-[a-z0-9-]+$'
          OR COALESCE(identity_link.value->>'employeeId', '') !~ '^employee-local-[a-z0-9-]+$'
     )
)
SELECT 'orgmaster.local-principal-publication.v1'::text AS contract_version,
       account.principal_issuer, account.principal_subject,
       account.principal_id, account.employee_id, account.account_type,
       account.employee_status, account.mapping_version, account.published_at,
       version.payload AS published_version,
       COALESCE((SELECT jsonb_agg(to_jsonb(pdm) ORDER BY pdm.assignment_id)
         FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v4 pdm
         WHERE pdm.principal_id = account.principal_id AND pdm.employee_id = account.employee_id), '[]'::jsonb) AS pdm_grants,
       COALESCE((SELECT jsonb_agg(to_jsonb(catalog) ORDER BY catalog.display_order)
         FROM ai_pdm_contract.v_application_role_catalog_v2 catalog
         WHERE catalog.application_id = 'ai-pdm' AND catalog.catalog_version = (
           SELECT snapshot.value->>'catalogVersion' FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(version.payload->'externalRoleCatalogs') = 'array'
               THEN version.payload->'externalRoleCatalogs' ELSE '[]'::jsonb END
           ) snapshot(value) WHERE snapshot.value->>'applicationId' = 'ai-pdm'
         )), '[]'::jsonb) AS pdm_catalog,
       (SELECT to_jsonb(fms) FROM orgmaster_contract.v_fms_authority_v2 fms
         WHERE fms.principal_id = account.principal_id AND fms.employee_id = account.employee_id) AS fms_authority
  FROM orgmaster_contract.v_active_principal_accounts_v1 account
 CROSS JOIN active_version version
 WHERE account.principal_issuer = 'urn:jenfu:local-principal-sandbox'
   AND account.principal_id ~ '^local-[a-z0-9-]+$'
   AND account.principal_subject ~ '^local-[a-z0-9-]+$'
   AND account.employee_id ~ '^employee-local-[a-z0-9-]+$'
   AND account.account_type IN ('human_personal', 'human_privileged')
   AND current_database() ~ '^jenfu_local_[a-z0-9_]{3,51}$'
   AND COALESCE(host(inet_server_addr()), '') IN ('127.0.0.1', '::1');

ALTER VIEW orgmaster_contract.v_local_principal_publications_v1 OWNER TO jenfu_orgmaster_migrator;
REVOKE ALL ON orgmaster_contract.v_local_principal_publications_v1 FROM PUBLIC;
GRANT SELECT ON orgmaster_contract.v_local_principal_publications_v1
  TO jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;

COMMENT ON VIEW orgmaster_contract.v_local_principal_publications_v1 IS
  'Local synthetic-only wrapper over current native typed admission, published V3 governance, PDM v4 grants and FMS v2 authority. No draft, file fixture or shadow assignment is authoritative.';
COMMIT;
