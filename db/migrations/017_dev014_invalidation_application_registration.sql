-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core
-- contract-impact: corrective managed identity invalidation application registration
-- compatibility: backward-compatible
-- governance-review: DEV-014 / OrgMaster DEV-053

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SELECT pg_advisory_xact_lock(
  hashtext('dev014-invalidation-application-registration'),
  hashtext(current_database())
);
SET LOCAL ROLE jenfu_orgmaster_migrator;

-- Keep the invalidation registry aligned with the currently active governance
-- policy.  Historical documents use both `applicationId` and `id`; accepting
-- either is required, while a conflicting pair remains invalid.  Platform and
-- OrgMaster are infrastructure consumers and therefore remain mandatory even
-- when they are not listed as business applications in the policy document.
CREATE OR REPLACE FUNCTION orgmaster_core.synchronize_managed_identity_invalidation_applications_v1(
  p_actor text
)
RETURNS TABLE (
  application_id text,
  status text,
  support_state text,
  support_revision bigint
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_source_governance_version_id text;
  v_candidate_count integer;
  v_admission_enabled boolean;
  v_desired text[];
  v_current text[];
BEGIN
  IF btrim(p_actor) IS NULL OR char_length(btrim(p_actor)) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'INVALIDATION_APPLICATION_SYNC_ACTOR_INVALID';
  END IF;

  SELECT count(*), min(candidate.version_id)
  INTO v_candidate_count, v_source_governance_version_id
  FROM (
    SELECT version.value->>'id' AS version_id
    FROM orgmaster_core.persistence_authority AS authority
    JOIN orgmaster_core.persistence_batches AS batch
      ON batch.id = authority.active_batch_id AND batch.status = 'active'
    JOIN orgmaster_core.persistence_artifacts AS governance
      ON governance.batch_id = batch.id
      AND governance.artifact_key = 'orgmaster-governance.v3.json'
      AND governance.artifact_kind = 'governance'
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(governance.payload->'publishedVersions') = 'array'
        THEN governance.payload->'publishedVersions' ELSE '[]'::jsonb END
    ) AS version(value)
    WHERE authority.singleton = true
      AND version.value->>'id' = governance.payload->>'activePolicyVersionId'
      AND version.value->>'kind' = 'assignment-governance-v3'
  ) AS candidate;

  IF v_candidate_count <> 1 OR NULLIF(v_source_governance_version_id, '') IS NULL THEN
    RAISE EXCEPTION 'ACTIVE_GOVERNANCE_VERSION_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM orgmaster_core.persistence_authority AS authority
    JOIN orgmaster_core.persistence_batches AS batch
      ON batch.id = authority.active_batch_id AND batch.status = 'active'
    JOIN orgmaster_core.persistence_artifacts AS governance
      ON governance.batch_id = batch.id
      AND governance.artifact_key = 'orgmaster-governance.v3.json'
      AND governance.artifact_kind = 'governance'
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(governance.payload->'publishedVersions') = 'array'
        THEN governance.payload->'publishedVersions' ELSE '[]'::jsonb END
    ) AS version(value)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(version.value#>'{policy,applications}') = 'array'
        THEN version.value#>'{policy,applications}' ELSE '[]'::jsonb END
    ) AS app(value)
    WHERE authority.singleton = true
      AND version.value->>'id' = v_source_governance_version_id
      AND version.value->>'kind' = 'assignment-governance-v3'
      AND app.value->>'status' = 'active'
      AND (
        COALESCE(NULLIF(btrim(app.value->>'applicationId'), ''), NULLIF(btrim(app.value->>'id'), '')) IS NULL
        OR COALESCE(NULLIF(btrim(app.value->>'applicationId'), ''), NULLIF(btrim(app.value->>'id'), '')) !~ '^[a-z0-9][a-z0-9-]{0,127}$'
        OR (
          NULLIF(btrim(app.value->>'applicationId'), '') IS NOT NULL
          AND NULLIF(btrim(app.value->>'id'), '') IS NOT NULL
          AND btrim(app.value->>'applicationId') <> btrim(app.value->>'id')
        )
      )
  ) THEN
    RAISE EXCEPTION 'ACTIVE_GOVERNANCE_APPLICATION_ID_INVALID';
  END IF;

  SELECT array_agg(desired.application_id ORDER BY desired.application_id)
  INTO v_desired
  FROM (
    SELECT DISTINCT COALESCE(
      NULLIF(btrim(app.value->>'applicationId'), ''),
      NULLIF(btrim(app.value->>'id'), '')
    ) AS application_id
    FROM orgmaster_core.persistence_authority AS authority
    JOIN orgmaster_core.persistence_batches AS batch
      ON batch.id = authority.active_batch_id AND batch.status = 'active'
    JOIN orgmaster_core.persistence_artifacts AS governance
      ON governance.batch_id = batch.id
      AND governance.artifact_key = 'orgmaster-governance.v3.json'
      AND governance.artifact_kind = 'governance'
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(governance.payload->'publishedVersions') = 'array'
        THEN governance.payload->'publishedVersions' ELSE '[]'::jsonb END
    ) AS version(value)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(version.value#>'{policy,applications}') = 'array'
        THEN version.value#>'{policy,applications}' ELSE '[]'::jsonb END
    ) AS app(value)
    WHERE authority.singleton = true
      AND version.value->>'id' = v_source_governance_version_id
      AND version.value->>'kind' = 'assignment-governance-v3'
      AND app.value->>'status' = 'active'
    UNION
    SELECT 'orgmaster'
    UNION
    SELECT 'platform'
  ) AS desired;

  SELECT authority.admission_enabled
  INTO v_admission_enabled
  FROM orgmaster_core.managed_identity_admission_authority AS authority
  WHERE authority.singleton = true
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MANAGED_IDENTITY_ADMISSION_AUTHORITY_MISSING'; END IF;

  LOCK TABLE orgmaster_core.managed_identity_invalidation_applications IN ROW EXCLUSIVE MODE;
  SELECT COALESCE(array_agg(app.application_id ORDER BY app.application_id), ARRAY[]::text[])
  INTO v_current
  FROM orgmaster_core.managed_identity_invalidation_applications AS app
  WHERE app.status = 'active';

  IF v_admission_enabled AND v_current IS DISTINCT FROM v_desired THEN
    RAISE EXCEPTION 'INVALIDATION_APPLICATION_SET_CHANGE_REQUIRES_ADMISSION_OFF';
  END IF;

  INSERT INTO orgmaster_core.managed_identity_invalidation_applications (
    application_id,
    status,
    support_state,
    support_revision,
    source_governance_version_id,
    updated_at
  )
  SELECT desired.application_id, 'active', 'pending', 1,
    v_source_governance_version_id, clock_timestamp()
  FROM unnest(v_desired) AS desired(application_id)
  ON CONFLICT ON CONSTRAINT managed_identity_invalidation_applications_pkey DO UPDATE SET
    status = 'active',
    source_governance_version_id = EXCLUDED.source_governance_version_id,
    updated_at = EXCLUDED.updated_at;

  UPDATE orgmaster_core.managed_identity_invalidation_applications AS app
  SET status = 'inactive', updated_at = clock_timestamp()
  WHERE NOT (app.application_id = ANY(v_desired))
    AND app.status <> 'inactive';

  RETURN QUERY
  SELECT app.application_id, app.status, app.support_state, app.support_revision
  FROM orgmaster_core.managed_identity_invalidation_applications AS app
  ORDER BY app.application_id;
END;
$function$;

-- Backfill the production registry from the current policy before admission is
-- enabled.  Existing support evidence and revisions are preserved by the
-- conflict branch; newly discovered consumers start pending at revision 1.
SELECT count(*)
FROM orgmaster_core.synchronize_managed_identity_invalidation_applications_v1(
  'migration-dev014-017'
);

-- Migration 012's disable path referenced the table column `revision` without
-- an alias while the function also exposes an output column named `revision`.
-- Qualify that existing CAS update so disabling admission can enqueue and
-- advance managed identities atomically.
CREATE OR REPLACE FUNCTION orgmaster_core.set_managed_identity_admission_v1(
  p_expected_revision bigint,
  p_enabled boolean,
  p_actor text,
  p_reason_code text
)
RETURNS TABLE(revision bigint, admission_enabled boolean, affected_identity_count integer, outbox_count integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_authority orgmaster_core.managed_identity_admission_authority%ROWTYPE;
  v_revision bigint;
  v_outbox_count integer := 0;
  v_identity record;
BEGIN
  SELECT authority.* INTO v_authority
  FROM orgmaster_core.managed_identity_admission_authority AS authority
  WHERE authority.singleton = true
  FOR UPDATE;
  IF v_authority.revision <> p_expected_revision THEN RAISE EXCEPTION 'REVISION_CONFLICT'; END IF;
  IF v_authority.admission_enabled = p_enabled THEN
    RETURN QUERY SELECT v_authority.revision, p_enabled, 0, 0;
    RETURN;
  END IF;
  IF p_enabled AND NOT EXISTS (
    SELECT 1 FROM orgmaster_core.managed_identity_invalidation_applications AS app
    WHERE app.application_id = 'orgmaster' AND app.status = 'active'
  ) THEN RAISE EXCEPTION 'ORGMASTER_APPLICATION_UNREADY'; END IF;
  IF p_enabled AND EXISTS (
    SELECT 1 FROM orgmaster_core.managed_identity_invalidation_applications AS app
    WHERE app.status = 'active' AND app.support_state <> 'verified'
  ) THEN RAISE EXCEPTION 'INVALIDATION_APPLICATION_UNREADY'; END IF;
  IF p_enabled AND EXISTS (
    SELECT 1 FROM orgmaster_core.managed_identity_lifecycle_outbox AS outbox
    WHERE outbox.status <> 'completed'
  ) THEN RAISE EXCEPTION 'INVALIDATION_PENDING'; END IF;

  v_revision := nextval('orgmaster_core.managed_identity_mapping_version_seq');
  IF NOT p_enabled THEN
    FOR v_identity IN
      SELECT identity.employee_id
      FROM orgmaster_core.managed_daily_identities AS identity
      WHERE identity.link_state = 'active'
      FOR UPDATE
    LOOP
      v_outbox_count := v_outbox_count + orgmaster_core.enqueue_managed_identity_lifecycle_invalidations_v1(
        v_identity.employee_id,
        'managed-admission:' || v_revision::text,
        p_actor,
        p_reason_code
      );
    END LOOP;
    UPDATE orgmaster_core.managed_daily_identities AS identity
    SET admission_revision = v_revision,
        admission_changed_at = clock_timestamp(),
        revision = identity.revision + 1,
        updated_at = clock_timestamp(),
        updated_by = p_actor
    WHERE identity.link_state = 'active';
  END IF;

  UPDATE orgmaster_core.managed_identity_admission_authority AS authority
  SET admission_enabled = p_enabled,
      revision = v_revision,
      updated_at = clock_timestamp(),
      updated_by = p_actor,
      reason_code = p_reason_code
  WHERE authority.singleton = true;

  RETURN QUERY SELECT v_revision, p_enabled,
    (SELECT count(*)::integer FROM orgmaster_core.managed_daily_identities AS identity WHERE identity.link_state = 'active'),
    v_outbox_count;
END;
$function$;

-- Every future governance write synchronizes the registry in the same
-- transaction.  A live admission gate rejects only an application-set change;
-- unrelated governance updates with an unchanged set remain available.
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
BEGIN
  IF jsonb_typeof(p_changes) <> 'array'
    OR char_length(p_operation_id) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'PERSISTENCE_CHANGE_INVALID';
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

ALTER FUNCTION orgmaster_core.synchronize_managed_identity_invalidation_applications_v1(text)
  OWNER TO jenfu_orgmaster_migrator;
ALTER FUNCTION orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v1(jsonb,text,text,text,text,jsonb)
  OWNER TO jenfu_orgmaster_migrator;

REVOKE ALL ON FUNCTION orgmaster_core.synchronize_managed_identity_invalidation_applications_v1(text)
  FROM PUBLIC, jenfu_platform_migrator, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;
REVOKE ALL ON FUNCTION orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v1(jsonb,text,text,text,text,jsonb)
  FROM PUBLIC, jenfu_platform_runtime, jenfu_ai_pdm_runtime;
GRANT EXECUTE ON FUNCTION orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v1(jsonb,text,text,text,text,jsonb)
  TO jenfu_orgmaster_runtime;

COMMIT;
