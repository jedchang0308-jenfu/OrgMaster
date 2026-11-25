-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: equivalent active Principal mapping for existing consumers
-- compatibility: backward-compatible
-- governance-review: DEV-057 all-user directory
BEGIN;
SET LOCAL ROLE jenfu_orgmaster_migrator;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- The persisted governance document includes inactive publication history.
-- Project the selected ID and version array once, keeping all original
-- eligibility predicates, live snapshot reads, owner, and view ACL.
CREATE OR REPLACE VIEW orgmaster_contract.v_active_principal_mappings_v1
WITH (security_barrier = true) AS
WITH active_governance AS MATERIALIZED (
  SELECT artifact.payload->>'activePolicyVersionId' AS active_policy_id,
         artifact.payload->'publishedVersions' AS published_versions
    FROM orgmaster_core.persistence_authority authority
    JOIN orgmaster_core.persistence_batches batch
      ON batch.id = authority.active_batch_id AND batch.status = 'active'
    JOIN orgmaster_core.persistence_artifacts artifact
      ON artifact.batch_id = batch.id
     AND artifact.artifact_key = 'orgmaster-governance.v3.json'
     AND artifact.artifact_kind = 'governance'
   WHERE authority.singleton = true
), active_version AS MATERIALIZED (
  SELECT version.value AS payload
    FROM active_governance governance
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(governance.published_versions) = 'array'
        THEN governance.published_versions ELSE '[]'::jsonb END
    ) version(value)
   WHERE version.value->>'id' = governance.active_policy_id
     AND version.value->>'kind' = 'assignment-governance-v3'
), legacy_candidates AS (
  SELECT version.payload AS version_payload,
         identity.value AS identity_payload,
         employee.employee_id,
         employee.employee_status
    FROM active_version version
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(version.payload#>'{policy,identityLinks}') = 'array'
        THEN version.payload#>'{policy,identityLinks}' ELSE '[]'::jsonb END
    ) identity(value)
    JOIN orgmaster_core.v_current_workspace_employees_v1 employee
      ON employee.employee_id = identity.value->>'employeeId'
     AND employee.employee_status = 'active'
   WHERE identity.value->>'status' = 'active'
     AND NULLIF(identity.value->>'issuer', '') IS NOT NULL
     AND NULLIF(identity.value->>'subject', '') IS NOT NULL
     AND NULLIF(identity.value->>'principalId', '') IS NOT NULL
     AND (identity.value->>'validFrom')::timestamptz <= CURRENT_TIMESTAMP
     AND (identity.value->>'validTo' IS NULL OR (identity.value->>'validTo')::timestamptz > CURRENT_TIMESTAMP)
     AND NOT EXISTS (
       SELECT 1 FROM orgmaster_core.managed_identity_lifecycle_outbox lifecycle
        WHERE lifecycle.employee_id = identity.value->>'employeeId'
          AND lifecycle.status <> 'completed'
     )
     AND NOT EXISTS (
       SELECT 1 FROM orgmaster_contract.v_principal_lifecycle_targets_v2 target
       JOIN orgmaster_core.principal_lifecycle_delivery_v2 delivery ON delivery.event_id=target.event_id::uuid
       WHERE target.principal_id=identity.value->>'principalId' AND delivery.status<>'completed'
     )
)
SELECT 'organization.active-principal.v1'::text AS contract_version,
       identity_payload->>'issuer' AS principal_issuer,
       identity_payload->>'subject' AS principal_subject,
       identity_payload->>'principalId' AS principal_id,
       employee_id,
       employee_status,
       (version_payload->>'versionNumber')::bigint AS mapping_version,
       (version_payload->>'publishedAt')::timestamptz AS published_at
  FROM legacy_candidates
UNION ALL
SELECT 'organization.active-principal.v1', identity.auth_issuer, identity.auth_subject,
       identity.principal_id, identity.employee_id, employee.employee_status,
       identity.admission_revision, identity.admission_changed_at
  FROM orgmaster_core.managed_daily_identities identity
  JOIN orgmaster_core.v_current_workspace_employees_v1 employee
    ON employee.employee_id = identity.employee_id
   AND employee.employee_status = 'active'
 WHERE identity.link_state = 'active'
   AND identity.auth_issuer IS NOT NULL
   AND identity.auth_subject IS NOT NULL
   AND identity.admission_revision IS NOT NULL
   AND identity.admission_changed_at IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM orgmaster_core.managed_identity_admission_authority authority
      WHERE authority.singleton = true AND authority.admission_enabled
   )
   AND EXISTS (
     SELECT 1 FROM orgmaster_core.managed_identity_observations observation
      WHERE observation.identity_record_id = identity.identity_record_id
        AND observation.directory_state = 'present'
   )
   AND NOT EXISTS (
     SELECT 1 FROM orgmaster_core.managed_identity_lifecycle_outbox lifecycle
      WHERE lifecycle.employee_id = identity.employee_id
        AND lifecycle.status <> 'completed'
   )
   AND NOT EXISTS (
     SELECT 1 FROM orgmaster_contract.v_principal_lifecycle_targets_v2 target
     JOIN orgmaster_core.principal_lifecycle_delivery_v2 delivery ON delivery.event_id=target.event_id::uuid
     WHERE target.principal_id=identity.principal_id AND delivery.status<>'completed'
   );

COMMIT;
