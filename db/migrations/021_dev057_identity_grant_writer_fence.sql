-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: identity-visibility.v1 shared writer fence and authority-independent AI-PDM portal visibility
-- compatibility: backward-compatible
-- governance-review: DEV-057 / Platform DEV-015

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SELECT pg_advisory_xact_lock(
  hashtext('dev057-identity-grant-writer-fence'),
  hashtext(current_database())
);
SET LOCAL ROLE jenfu_orgmaster_migrator;

-- Managed identity bind/verify already locks this singleton. Lock it first,
-- then the persistence authority row used by the governance publisher, so the
-- migration preflight cannot race either producer path.
SELECT admission_enabled
  FROM orgmaster_core.managed_identity_admission_authority
 WHERE singleton = true
 FOR UPDATE;

SELECT authority_version
  FROM orgmaster_core.persistence_authority
 WHERE singleton = true
 FOR UPDATE;

DO $preflight$
DECLARE
  v_ambiguous boolean;
BEGIN
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
  ), legacy_candidates AS (
    SELECT identity.value->>'issuer' AS principal_issuer,
           identity.value->>'subject' AS principal_subject,
           identity.value->>'principalId' AS principal_id,
           employee.employee_id
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
         SELECT 1
           FROM orgmaster_core.managed_identity_lifecycle_outbox lifecycle
          WHERE lifecycle.employee_id = identity.value->>'employeeId'
            AND lifecycle.status <> 'completed'
       )
  ), managed_candidates AS (
    SELECT identity.auth_issuer AS principal_issuer,
           identity.auth_subject AS principal_subject,
           identity.principal_id,
           identity.employee_id
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
         SELECT 1
           FROM orgmaster_core.managed_identity_observations observation
          WHERE observation.identity_record_id = identity.identity_record_id
            AND observation.directory_state = 'present'
       )
       AND NOT EXISTS (
         SELECT 1
           FROM orgmaster_core.managed_identity_lifecycle_outbox lifecycle
          WHERE lifecycle.employee_id = identity.employee_id
            AND lifecycle.status <> 'completed'
       )
  ), candidates AS (
    SELECT * FROM legacy_candidates
    UNION ALL
    SELECT * FROM managed_candidates
  )
  SELECT EXISTS (
    SELECT 1
      FROM candidates
     GROUP BY principal_issuer, principal_subject
    HAVING count(*) > 1
        OR count(DISTINCT employee_id) > 1
        OR count(DISTINCT principal_id) > 1
  ) INTO v_ambiguous;

  IF v_ambiguous THEN
    RAISE EXCEPTION 'ACTIVE_PRINCIPAL_MAPPING_AMBIGUOUS';
  END IF;
END;
$preflight$;

-- The same admission row lock serializes legacy identity publication with the
-- existing managed bind/verify routines. Legacy pairs remain reserved after a
-- later governance version removes them, preventing reassignment to another
-- Employee.
CREATE OR REPLACE FUNCTION orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v1(
  p_changes jsonb,
  p_source_revision text,
  p_updated_by text,
  p_reason_code text,
  p_operation_id text,
  p_entitlement_changes jsonb DEFAULT '[]'::jsonb
)
RETURNS TABLE(authority_version bigint, source_revision text, outbox_count integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_write record;
  v_admission_enabled boolean;
  v_governance_change_count integer;
  v_governance_payload jsonb;
  v_active_version_count integer;
  v_active_version jsonb;
BEGIN
  IF jsonb_typeof(p_changes) <> 'array'
    OR char_length(p_operation_id) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'PERSISTENCE_CHANGE_INVALID';
  END IF;

  SELECT authority.admission_enabled
    INTO v_admission_enabled
    FROM orgmaster_core.managed_identity_admission_authority authority
   WHERE authority.singleton = true
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MANAGED_IDENTITY_ADMISSION_AUTHORITY_MISSING';
  END IF;

  SELECT count(*)::integer
    INTO v_governance_change_count
    FROM jsonb_array_elements(p_changes) change(value)
   WHERE change.value->>'artifactKey' = 'orgmaster-governance.v3.json'
     AND change.value->>'artifactKind' = 'governance';

  IF v_governance_change_count > 1 THEN
    RAISE EXCEPTION 'PERSISTENCE_CHANGE_KEY_DUPLICATE';
  END IF;

  IF v_governance_change_count = 1 THEN
    SELECT change.value->'payload'
      INTO v_governance_payload
      FROM jsonb_array_elements(p_changes) change(value)
     WHERE change.value->>'artifactKey' = 'orgmaster-governance.v3.json'
       AND change.value->>'artifactKind' = 'governance';

    SELECT count(*)::integer
      INTO v_active_version_count
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(v_governance_payload->'publishedVersions') = 'array'
          THEN v_governance_payload->'publishedVersions' ELSE '[]'::jsonb END
      ) version(value)
     WHERE version.value->>'id' = v_governance_payload->>'activePolicyVersionId'
       AND version.value->>'kind' = 'assignment-governance-v3';

    IF v_active_version_count <> 1 THEN
      RAISE EXCEPTION 'ACTIVE_GOVERNANCE_VERSION_INVALID';
    END IF;

    SELECT version.value
      INTO v_active_version
      FROM jsonb_array_elements(v_governance_payload->'publishedVersions') version(value)
     WHERE version.value->>'id' = v_governance_payload->>'activePolicyVersionId'
       AND version.value->>'kind' = 'assignment-governance-v3';

    IF EXISTS (
      SELECT 1
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(v_active_version#>'{policy,identityLinks}') = 'array'
            THEN v_active_version#>'{policy,identityLinks}' ELSE '[]'::jsonb END
        ) identity(value)
       WHERE identity.value->>'status' = 'active'
         AND NULLIF(identity.value->>'issuer', '') IS NOT NULL
         AND NULLIF(identity.value->>'subject', '') IS NOT NULL
      GROUP BY identity.value->>'issuer', identity.value->>'subject'
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'ACTIVE_PRINCIPAL_MAPPING_AMBIGUOUS';
    END IF;

    -- A historical pair cannot change Employee. A managed reservation cannot
    -- also be published as a legacy mapping, even for the same Employee.
    IF EXISTS (
      WITH all_versions AS (
        SELECT version.value AS payload
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(v_governance_payload->'publishedVersions') = 'array'
              THEN v_governance_payload->'publishedVersions' ELSE '[]'::jsonb END
          ) version(value)
         WHERE version.value->>'kind' = 'assignment-governance-v3'
      ), identity_pairs AS (
        SELECT identity.value->>'issuer' AS principal_issuer,
               identity.value->>'subject' AS principal_subject,
               identity.value->>'employeeId' AS employee_id
          FROM all_versions version
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(version.payload#>'{policy,identityLinks}') = 'array'
              THEN version.payload#>'{policy,identityLinks}' ELSE '[]'::jsonb END
          ) identity(value)
         WHERE NULLIF(identity.value->>'issuer', '') IS NOT NULL
           AND NULLIF(identity.value->>'subject', '') IS NOT NULL
           AND NULLIF(identity.value->>'employeeId', '') IS NOT NULL
      )
      SELECT 1
        FROM identity_pairs pair
        JOIN orgmaster_core.principal_identity_reservations reservation
          ON reservation.principal_issuer = pair.principal_issuer
         AND reservation.principal_subject = pair.principal_subject
       WHERE reservation.employee_id <> pair.employee_id
          OR reservation.source_kind = 'managed'
    ) THEN
      RAISE EXCEPTION 'PRINCIPAL_IDENTITY_RESERVATION_CONFLICT';
    END IF;

    -- Include a defensive read of the managed rows as well as their permanent
    -- reservations; this also protects recovery from older incomplete rows.
    IF EXISTS (
      SELECT 1
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(v_active_version#>'{policy,identityLinks}') = 'array'
            THEN v_active_version#>'{policy,identityLinks}' ELSE '[]'::jsonb END
        ) identity(value)
        JOIN orgmaster_core.managed_daily_identities managed
          ON managed.auth_issuer = identity.value->>'issuer'
         AND managed.auth_subject = identity.value->>'subject'
       WHERE identity.value->>'status' = 'active'
    ) THEN
      RAISE EXCEPTION 'PRINCIPAL_IDENTITY_RESERVATION_CONFLICT';
    END IF;

    -- Historical versions are included: removing a link from the current
    -- policy must not make its issuer/subject reusable by another Employee.
    IF EXISTS (
      WITH all_versions AS (
        SELECT version.value AS payload
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(v_governance_payload->'publishedVersions') = 'array'
              THEN v_governance_payload->'publishedVersions' ELSE '[]'::jsonb END
          ) version(value)
         WHERE version.value->>'kind' = 'assignment-governance-v3'
      ), identity_pairs AS (
        SELECT identity.value->>'issuer' AS principal_issuer,
               identity.value->>'subject' AS principal_subject,
               identity.value->>'employeeId' AS employee_id
          FROM all_versions version
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(version.payload#>'{policy,identityLinks}') = 'array'
              THEN version.payload#>'{policy,identityLinks}' ELSE '[]'::jsonb END
          ) identity(value)
         WHERE NULLIF(identity.value->>'issuer', '') IS NOT NULL
           AND NULLIF(identity.value->>'subject', '') IS NOT NULL
           AND NULLIF(identity.value->>'employeeId', '') IS NOT NULL
      )
      SELECT 1
        FROM identity_pairs
       GROUP BY principal_issuer, principal_subject
      HAVING count(DISTINCT employee_id) > 1
    ) THEN
      RAISE EXCEPTION 'PRINCIPAL_IDENTITY_HISTORICAL_OWNER_CONFLICT';
    END IF;

    WITH all_versions AS (
      SELECT version.value AS payload
        FROM jsonb_array_elements(v_governance_payload->'publishedVersions') version(value)
       WHERE version.value->>'kind' = 'assignment-governance-v3'
    ), identity_pairs AS (
      SELECT identity.value->>'issuer' AS principal_issuer,
             identity.value->>'subject' AS principal_subject,
             identity.value->>'employeeId' AS employee_id
        FROM all_versions version
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(version.payload#>'{policy,identityLinks}') = 'array'
            THEN version.payload#>'{policy,identityLinks}' ELSE '[]'::jsonb END
        ) identity(value)
       WHERE NULLIF(identity.value->>'issuer', '') IS NOT NULL
         AND NULLIF(identity.value->>'subject', '') IS NOT NULL
         AND NULLIF(identity.value->>'employeeId', '') IS NOT NULL
    )
    INSERT INTO orgmaster_core.principal_identity_reservations(
      principal_issuer, principal_subject, employee_id, first_seen_at, source_kind, source_revision
    )
    SELECT pair.principal_issuer,
           pair.principal_subject,
           min(pair.employee_id),
           clock_timestamp(),
           'legacy',
           v_governance_payload->>'activePolicyVersionId'
      FROM identity_pairs pair
     GROUP BY pair.principal_issuer, pair.principal_subject
    ON CONFLICT (principal_issuer, principal_subject) DO NOTHING;
  END IF;

  SELECT * INTO v_write
    FROM orgmaster_core.write_active_persistence_artifacts_v1(
      p_changes, p_source_revision, p_updated_by, p_reason_code
    );

  PERFORM *
    FROM orgmaster_core.synchronize_managed_identity_invalidation_applications_v1(p_updated_by);

  RETURN QUERY SELECT v_write.authority_version, v_write.source_revision, 0;
END;
$function$;

ALTER FUNCTION orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v1(jsonb,text,text,text,text,jsonb)
  OWNER TO jenfu_orgmaster_migrator;

CREATE OR REPLACE VIEW orgmaster_contract.v_active_principal_mappings_v1
WITH (security_barrier = true) AS
WITH active_governance AS (
  SELECT artifact.payload
    FROM orgmaster_core.persistence_authority authority
    JOIN orgmaster_core.persistence_batches batch
      ON batch.id = authority.active_batch_id AND batch.status = 'active'
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
   );

ALTER VIEW orgmaster_contract.v_active_principal_mappings_v1 OWNER TO jenfu_orgmaster_migrator;

CREATE OR REPLACE VIEW orgmaster_contract.v_portal_app_visibility_v1
WITH (security_barrier = true)
AS
WITH active_batch AS (
  SELECT batch.id
    FROM orgmaster_core.persistence_authority authority
    JOIN orgmaster_core.persistence_batches batch
      ON batch.id = authority.active_batch_id AND batch.status = 'active'
   WHERE authority.singleton = true
), active_governance AS (
  SELECT governance.payload
    FROM active_batch
    JOIN orgmaster_core.persistence_artifacts governance
      ON governance.batch_id = active_batch.id
     AND governance.artifact_kind = 'governance'
     AND governance.artifact_key = 'orgmaster-governance.v3.json'
), active_version AS (
  SELECT version.value AS version_payload
    FROM active_governance governance
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(governance.payload->'publishedVersions') = 'array'
        THEN governance.payload->'publishedVersions' ELSE '[]'::jsonb END
    ) version(value)
   WHERE version.value->>'id' = governance.payload->>'activePolicyVersionId'
     AND version.value->>'kind' = 'assignment-governance-v3'
), current_workspace AS (
  SELECT workspace.payload AS workspace_payload
    FROM active_batch
    JOIN orgmaster_core.persistence_artifacts manifest
      ON manifest.batch_id = active_batch.id
     AND manifest.artifact_kind = 'workspace-manifest'
     AND manifest.artifact_key = 'orgmaster-workspace.v1.json'
    JOIN orgmaster_core.persistence_artifacts workspace
      ON workspace.batch_id = active_batch.id
     AND workspace.artifact_kind = 'workspace-version'
     AND workspace.artifact_key = 'orgmaster-versions/' || (manifest.payload->>'currentVersionId') || '.json'
   WHERE workspace.payload->>'kind' = 'document'
     AND trim(workspace.canonical_sha256) ~ '^[a-f0-9]{64}$'
), version_workspace AS (
  SELECT active_version.version_payload, current_workspace.workspace_payload
    FROM active_version CROSS JOIN current_workspace
), governance_account_types AS (
  SELECT link.value->>'issuer' AS principal_issuer,
         link.value->>'subject' AS principal_subject,
         link.value->>'principalId' AS principal_id,
         link.value->>'employeeId' AS employee_id,
         admission.value->>'accountType' AS account_type
    FROM active_version version
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(version.version_payload#>'{policy,identityLinks}') = 'array'
        THEN version.version_payload#>'{policy,identityLinks}' ELSE '[]'::jsonb END
    ) link(value)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(version.version_payload#>'{policy,principalAdmissions}') = 'array'
        THEN version.version_payload#>'{policy,principalAdmissions}' ELSE '[]'::jsonb END
    ) admission(value)
   WHERE link.value->>'status' = 'active'
     AND admission.value->>'identityLinkId' = link.value->>'id'
     AND admission.value->>'status' = 'active'
     AND admission.value->>'accountType' IN ('human_personal', 'human_privileged')
), active_principals AS (
  SELECT mapping.principal_issuer,
         mapping.principal_subject,
         mapping.principal_id,
         mapping.employee_id,
         COALESCE(
           CASE WHEN managed.identity_record_id IS NOT NULL THEN 'human_personal'::text END,
           governed.account_type
         ) AS account_type
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
     AND governed.principal_subject = mapping.principal_subject
), direct_grants AS (
  SELECT version_workspace.version_payload,
         version_workspace.workspace_payload,
         assignment.value AS assignment_payload,
         assignment.value->>'employeeId' AS source_employee_id,
         assignment.value->>'employeeId' AS recipient_employee_id,
         'direct'::text AS grant_kind,
         NULL::text AS delegation_id,
         assignment.value->>'id' AS projected_assignment_id,
         assignment.value->>'validFrom' AS projected_valid_from,
         assignment.value->>'validTo' AS projected_valid_until
    FROM version_workspace
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(version_workspace.version_payload#>'{policy,roleAssignments}') = 'array'
        THEN version_workspace.version_payload#>'{policy,roleAssignments}' ELSE '[]'::jsonb END
    ) assignment(value)
), delegated_grants AS (
  SELECT version_workspace.version_payload,
         version_workspace.workspace_payload,
         source.value AS assignment_payload,
         source.value->>'employeeId' AS source_employee_id,
         delegation.value->>'toEmployeeId' AS recipient_employee_id,
         'delegated'::text AS grant_kind,
         delegation.value->>'id' AS delegation_id,
         delegation.value->>'id' AS projected_assignment_id,
         delegation.value->>'validFrom' AS projected_valid_from,
         delegation.value->>'validTo' AS projected_valid_until
    FROM version_workspace
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(version_workspace.version_payload#>'{policy,roleDelegations}') = 'array'
        THEN version_workspace.version_payload#>'{policy,roleDelegations}' ELSE '[]'::jsonb END
    ) delegation(value)
    JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(version_workspace.version_payload#>'{policy,roleAssignments}') = 'array'
        THEN version_workspace.version_payload#>'{policy,roleAssignments}' ELSE '[]'::jsonb END
    ) source(value)
      ON source.value->>'id' = delegation.value->>'sourceAssignmentId'
     AND source.value->>'employeeId' = delegation.value->>'fromEmployeeId'
     AND source.value->>'roleId' = delegation.value->>'roleId'
     AND source.value->>'catalogVersion' = delegation.value->>'catalogVersion'
     AND source.value->'scope' = delegation.value->'scope'
   WHERE delegation.value->>'status' = 'active'
     AND NULLIF(delegation.value->>'validFrom', '') IS NOT NULL
     AND NULLIF(delegation.value->>'validTo', '') IS NOT NULL
     AND (delegation.value->>'validFrom')::timestamptz <= CURRENT_TIMESTAMP
     AND (delegation.value->>'validTo')::timestamptz > CURRENT_TIMESTAMP
), grants AS (
  SELECT * FROM direct_grants
  UNION ALL
  SELECT * FROM delegated_grants
), valid_grants AS (
  SELECT grants.*
    FROM grants
   WHERE assignment_payload->>'applicationId' = 'ai-pdm'
     AND assignment_payload->>'status' = 'active'
     AND NULLIF(assignment_payload->>'id', '') IS NOT NULL
     AND NULLIF(assignment_payload->>'employeeId', '') IS NOT NULL
     AND NULLIF(assignment_payload->>'roleId', '') IS NOT NULL
     AND NULLIF(assignment_payload->>'roleCodeSnapshot', '') IS NOT NULL
     AND NULLIF(assignment_payload->>'catalogVersion', '') IS NOT NULL
     AND NULLIF(assignment_payload->>'validFrom', '') IS NOT NULL
     AND (assignment_payload->>'validFrom')::timestamptz <= CURRENT_TIMESTAMP
     AND (assignment_payload->>'validTo' IS NULL OR (assignment_payload->>'validTo')::timestamptz > CURRENT_TIMESTAMP)
     AND NULLIF(projected_assignment_id, '') IS NOT NULL
     AND NULLIF(projected_valid_from, '') IS NOT NULL
     AND (projected_valid_from)::timestamptz <= CURRENT_TIMESTAMP
     AND (projected_valid_until IS NULL OR (projected_valid_until)::timestamptz > CURRENT_TIMESTAMP)
     AND (
       (assignment_payload->>'basis' = 'manual'
        AND jsonb_array_length(CASE WHEN jsonb_typeof(assignment_payload->'sources') = 'array' THEN assignment_payload->'sources' ELSE '[]'::jsonb END) = 0)
       OR
       (assignment_payload->>'basis' = 'position_adoption'
        AND EXISTS (
          SELECT 1
            FROM jsonb_array_elements(CASE WHEN jsonb_typeof(assignment_payload->'sources') = 'array' THEN assignment_payload->'sources' ELSE '[]'::jsonb END) source(value)
            JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(workspace_payload#>'{state,positions}') = 'array' THEN workspace_payload#>'{state,positions}' ELSE '[]'::jsonb END) position(value)
              ON position.value->>'id' = source.value->>'positionId'
             AND position.value->>'status' = 'active'
            JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(workspace_payload#>'{state,assignments}') = 'array' THEN workspace_payload#>'{state,assignments}' ELSE '[]'::jsonb END) position_assignment(value)
              ON position_assignment.value->>'id' = source.value->>'positionAssignmentId'
             AND position_assignment.value->>'positionId' = source.value->>'positionId'
             AND position_assignment.value->>'employeeId' = source_employee_id
           WHERE NULLIF(position_assignment.value->>'validFrom', '') IS NOT NULL
             AND (position_assignment.value->>'validFrom')::timestamptz <= CURRENT_TIMESTAMP
             AND (position_assignment.value->>'validTo' IS NULL OR (position_assignment.value->>'validTo')::timestamptz > CURRENT_TIMESTAMP)
             AND source.value->>'scopeKeySnapshot' = assignment_payload#>>'{scope,value}'
             AND (
               (source.value->>'scopeSource' = 'jenfu_workspace' AND assignment_payload#>>'{scope,kind}' = 'workspace' AND assignment_payload#>>'{scope,value}' = 'company-jenfu')
               OR (source.value->>'scopeSource' = 'fixed_project' AND assignment_payload#>>'{scope,kind}' = 'project' AND NULLIF(assignment_payload#>>'{scope,value}', '') IS NOT NULL)
             )
        ))
     )
), catalog_valid AS (
  SELECT valid_grants.*,
         catalog.subject_kind AS catalog_subject_kind
    FROM valid_grants
    JOIN ai_pdm_contract.v_application_role_catalog_v1 catalog
      ON catalog.application_id = 'ai-pdm'
     AND catalog.stable_role_id = valid_grants.assignment_payload->>'roleId'
     AND catalog.role_code = valid_grants.assignment_payload->>'roleCodeSnapshot'
     AND catalog.assignable = true
     AND catalog.allowed_scope_kinds ? (valid_grants.assignment_payload#>>'{scope,kind}')
     AND (valid_grants.grant_kind = 'direct' OR catalog.delegation_allowed = true)
   WHERE valid_grants.assignment_payload#>>'{scope,kind}' IN ('workspace', 'project', 'global')
     AND (
       (valid_grants.assignment_payload#>>'{scope,kind}' = 'global' AND valid_grants.assignment_payload#>'{scope,value}' IS NULL)
       OR (valid_grants.assignment_payload#>>'{scope,kind}' <> 'global' AND NULLIF(valid_grants.assignment_payload#>>'{scope,value}', '') IS NOT NULL)
     )
     AND (
       valid_grants.assignment_payload->>'roleId' <> 'role-external-specialist'
       OR (
         valid_grants.assignment_payload#>>'{scope,kind}' = 'project'
         AND valid_grants.assignment_payload->>'validTo' IS NOT NULL
         AND NULLIF(valid_grants.assignment_payload#>>'{metadata,sponsorEmployeeId}', '') IS NOT NULL
         AND NULLIF(valid_grants.assignment_payload#>>'{metadata,reviewDueAt}', '') IS NOT NULL
       )
     )
), resolved AS (
  SELECT catalog_valid.*,
         principal.principal_issuer,
         principal.principal_subject,
         principal.principal_id,
         principal.employee_id
    FROM catalog_valid
    JOIN active_principals principal
      ON principal.employee_id = catalog_valid.recipient_employee_id
     AND (
       (catalog_valid.grant_kind = 'delegated' AND catalog_valid.catalog_subject_kind = 'employee' AND principal.account_type = 'human_personal')
       OR (catalog_valid.grant_kind = 'direct'
           AND catalog_valid.assignment_payload->>'subjectKind' = 'employee'
           AND catalog_valid.assignment_payload->'targetPrincipalId' = 'null'::jsonb
           AND catalog_valid.catalog_subject_kind = 'employee'
           AND principal.account_type = 'human_personal')
       OR (catalog_valid.grant_kind = 'direct'
           AND catalog_valid.assignment_payload->>'subjectKind' = 'principal'
           AND catalog_valid.assignment_payload->>'targetPrincipalId' = principal.principal_id
           AND catalog_valid.catalog_subject_kind = 'principal'
           AND principal.account_type = 'human_privileged')
     )
), orgmaster_assignments AS (
  SELECT (active_version.version_payload->>'versionNumber')::bigint AS assignment_version,
         assignment.value AS assignment_payload
    FROM active_version
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(active_version.version_payload#>'{policy,roleAssignments}') = 'array'
        THEN active_version.version_payload#>'{policy,roleAssignments}' ELSE '[]'::jsonb END
    ) assignment(value)
   WHERE assignment.value->>'applicationId' = 'orgmaster'
     AND assignment.value->>'status' = 'active'
     AND NULLIF(assignment.value->>'employeeId', '') IS NOT NULL
     AND NULLIF(assignment.value->>'roleId', '') IS NOT NULL
     AND NULLIF(assignment.value->>'validFrom', '') IS NOT NULL
     AND (assignment.value->>'validFrom')::timestamptz <= CURRENT_TIMESTAMP
     AND (assignment.value->>'validTo' IS NULL OR (assignment.value->>'validTo')::timestamptz > CURRENT_TIMESTAMP)
     AND EXISTS (
       SELECT 1
         FROM jsonb_array_elements(CASE WHEN jsonb_typeof(active_version.version_payload#>'{policy,applicationRoles}') = 'array' THEN active_version.version_payload#>'{policy,applicationRoles}' ELSE '[]'::jsonb END) role(value)
        WHERE role.value->>'id' = assignment.value->>'roleId'
          AND role.value->>'applicationId' = 'orgmaster'
          AND role.value->>'status' = 'active'
     )
), orgmaster_visible AS (
  SELECT 'orgmaster'::text AS application_id,
         principal.principal_issuer,
         principal.principal_subject,
         assignment.assignment_version
    FROM orgmaster_assignments assignment
    JOIN orgmaster_contract.v_active_principal_mappings_v1 principal
      ON principal.employee_id = assignment.assignment_payload->>'employeeId'
     AND (
       (assignment.assignment_payload->>'subjectKind' = 'employee' AND assignment.assignment_payload->'targetPrincipalId' = 'null'::jsonb)
       OR (assignment.assignment_payload->>'subjectKind' = 'principal' AND assignment.assignment_payload->>'targetPrincipalId' = principal.principal_id)
     )
), ai_pdm_visible AS (
  SELECT 'ai-pdm'::text AS application_id,
         resolved.principal_issuer,
         resolved.principal_subject,
         (resolved.version_payload->>'versionNumber')::bigint AS assignment_version
    FROM resolved
)
SELECT visible.application_id,
       visible.principal_issuer,
       visible.principal_subject,
       MAX(visible.assignment_version) AS assignment_version,
       'visible'::text AS visibility_state
  FROM (
    SELECT * FROM orgmaster_visible
    UNION ALL
    SELECT * FROM ai_pdm_visible
  ) visible
 WHERE NULLIF(visible.principal_issuer, '') IS NOT NULL
   AND NULLIF(visible.principal_subject, '') IS NOT NULL
 GROUP BY visible.application_id, visible.principal_issuer, visible.principal_subject;

ALTER VIEW orgmaster_contract.v_portal_app_visibility_v1 OWNER TO jenfu_orgmaster_migrator;

COMMIT;
