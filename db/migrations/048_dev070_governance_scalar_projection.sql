-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: equivalent scalar/array projection in existing governance readers; public ABI unchanged
-- compatibility: backward-compatible
-- governance-review: DEV-070
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SET LOCAL ROLE jenfu_orgmaster_migrator;
SELECT pg_advisory_xact_lock(hashtext('dev070-governance-scalar-projection'),hashtext(current_database()));

-- Preserve complete policy/catalog validation and existing errors. Compute the
-- active identifier once; the existing MATERIALIZED CTE projects its array once.
CREATE OR REPLACE FUNCTION orgmaster_core.read_administration_publication_v1()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE document jsonb; publication jsonb; active_policy_id text;
BEGIN
  SELECT artifact.payload INTO STRICT document
    FROM orgmaster_core.persistence_authority authority
    JOIN orgmaster_core.persistence_batches batch ON batch.id=authority.active_batch_id AND batch.status='active'
    JOIN orgmaster_core.persistence_artifacts artifact ON artifact.batch_id=batch.id AND artifact.artifact_key='orgmaster-governance.v3.json' AND artifact.artifact_kind='governance'
   WHERE authority.singleton;
  IF document->>'schemaVersion'<>'3' OR jsonb_typeof(document->'publishedVersions')<>'array' THEN RAISE EXCEPTION 'ADMINISTRATION_DEPENDENCY_UNAVAILABLE'; END IF;
  active_policy_id := document->>'activePolicyVersionId';
  IF active_policy_id IS NULL THEN RETURN NULL; END IF;
  SELECT value INTO STRICT publication FROM jsonb_array_elements(document->'publishedVersions')
   WHERE value->>'id'=active_policy_id AND value->>'kind'='assignment-governance-v3';
  IF publication#>'{policy,administration}' IS NOT NULL AND (
    publication#>>'{policy,administration,contractVersion}'<>'orgmaster.administration-policy.v1'
    OR jsonb_typeof(publication#>'{policy,administration,grants}')<>'array'
    OR (publication#>>'{policy,administration,version}')::numeric NOT BETWEEN 1 AND 9007199254740991
  ) THEN RAISE EXCEPTION 'ADMINISTRATION_DEPENDENCY_UNAVAILABLE'; END IF;
  IF to_regprocedure('orgmaster_core.assert_administration_policy_v1(jsonb)') IS NOT NULL THEN
   BEGIN EXECUTE 'SELECT orgmaster_core.assert_administration_policy_v1($1)' USING publication#>'{policy,administration}';
   EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'ADMINISTRATION_DEPENDENCY_UNAVAILABLE'; END;
  END IF;
  RETURN publication;
EXCEPTION WHEN no_data_found OR too_many_rows OR invalid_text_representation THEN
  RAISE EXCEPTION 'ADMINISTRATION_DEPENDENCY_UNAVAILABLE';
END;
$fn$;

CREATE OR REPLACE FUNCTION orgmaster_core.read_ai_pdm_principal_accounts_v1(p_principal_id text,p_issuer text,p_subject text,p_all boolean DEFAULT false)
RETURNS SETOF orgmaster_contract.v_active_principal_accounts_v1
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $accounts$
WITH active_governance AS MATERIALIZED (
  SELECT artifact.payload, artifact.payload->>'activePolicyVersionId' AS active_policy_id, artifact.payload->'publishedVersions' AS published_versions
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
), workspace_employees AS MATERIALIZED (
  SELECT * FROM orgmaster_core.v_current_workspace_employees_v1
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
    JOIN workspace_employees employee
      ON employee.employee_id = identity.value->>'employeeId'
     AND employee.employee_status = 'active'
   WHERE (p_all OR ((p_principal_id IS NOT NULL AND identity.value->>'principalId' = p_principal_id)
      OR (p_principal_id IS NULL AND p_issuer IS NOT NULL AND p_subject IS NOT NULL
          AND identity.value->>'issuer' = p_issuer AND identity.value->>'subject' = p_subject)))
     AND identity.value->>'status' = 'active'
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
), mappings AS MATERIALIZED (
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
  JOIN workspace_employees employee
    ON employee.employee_id = identity.employee_id
   AND employee.employee_status = 'active'
 WHERE (p_all OR ((p_principal_id IS NOT NULL AND identity.principal_id = p_principal_id)
      OR (p_principal_id IS NULL AND p_issuer IS NOT NULL AND p_subject IS NOT NULL
          AND identity.auth_issuer = p_issuer AND identity.auth_subject = p_subject)))
   AND identity.link_state = 'active'
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
   )
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
  WHERE (p_all OR ((p_principal_id IS NOT NULL AND link.value->>'principalId' = p_principal_id)
      OR (p_principal_id IS NULL AND p_issuer IS NOT NULL AND p_subject IS NOT NULL
          AND link.value->>'issuer' = p_issuer AND link.value->>'subject' = p_subject)))
    AND link.value->>'status' = 'active'
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
FROM mappings mapping
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
$accounts$;

COMMIT;
