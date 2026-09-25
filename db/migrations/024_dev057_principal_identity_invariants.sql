-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: orgmaster.principal-alias-history.v1, orgmaster.employee-authority-switch.v2,
--   orgmaster.ai-pdm-effective-role-assignments.v1, orgmaster.portal-app-visibility.v1
-- compatibility: additive
-- v1 grants and Portal now require the existing typed admission; no public columns change.
-- governance-review: DEV-057

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SELECT pg_advisory_xact_lock(
  hashtext('dev057-principal-identity-invariants'),
  hashtext(current_database())
);
SET LOCAL ROLE jenfu_orgmaster_migrator;

-- Both existing producer paths lock admission before persistence. Keep the
-- migration on the same side of that fence while historical evidence is read.
SELECT admission_enabled
  FROM orgmaster_core.managed_identity_admission_authority
 WHERE singleton = true
 FOR UPDATE;
SELECT authority_version
  FROM orgmaster_core.persistence_authority
 WHERE singleton = true
 FOR UPDATE;

CREATE TABLE orgmaster_core.principal_ownership_reservations (
  principal_id text PRIMARY KEY CHECK (char_length(principal_id) BETWEEN 1 AND 255),
  employee_id text NOT NULL CHECK (char_length(employee_id) BETWEEN 1 AND 255),
  account_type text NOT NULL CHECK (account_type IN ('human_personal', 'human_privileged')),
  first_seen_at timestamptz NOT NULL,
  source_revision text NOT NULL CHECK (char_length(source_revision) BETWEEN 1 AND 255)
);
ALTER TABLE orgmaster_core.principal_ownership_reservations
  OWNER TO jenfu_orgmaster_migrator;
CREATE INDEX principal_ownership_employee_idx
  ON orgmaster_core.principal_ownership_reservations(employee_id, principal_id);
REVOKE ALL ON orgmaster_core.principal_ownership_reservations
  FROM PUBLIC, jenfu_orgmaster_runtime, jenfu_platform_runtime, jenfu_ai_pdm_runtime;

ALTER TABLE orgmaster_core.principal_identity_reservations
  ADD COLUMN principal_id text NULL
    REFERENCES orgmaster_core.principal_ownership_reservations(principal_id)
    ON DELETE RESTRICT;

-- Read only explicit provider-pair/principal/employee/type evidence. The
-- historical governance version must contain an active typed admission for
-- that exact identity link; a shared employee or email is never enough.
DO $backfill$
DECLARE
  candidate record;
  reserved_pair record;
  reserved_principal record;
BEGIN
  FOR candidate IN
    WITH governance AS (
      SELECT artifact.payload
        FROM orgmaster_core.persistence_authority authority
        JOIN orgmaster_core.persistence_batches batch
          ON batch.id = authority.active_batch_id AND batch.status = 'active'
        JOIN orgmaster_core.persistence_artifacts artifact
          ON artifact.batch_id = batch.id
         AND artifact.artifact_key = 'orgmaster-governance.v3.json'
         AND artifact.artifact_kind = 'governance'
       WHERE authority.singleton = true
    ), versions AS (
      SELECT version.value AS payload
        FROM governance
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(governance.payload->'publishedVersions') = 'array'
            THEN governance.payload->'publishedVersions' ELSE '[]'::jsonb END
        ) version(value)
       WHERE version.value->>'kind' = 'assignment-governance-v3'
    ), legacy_evidence AS (
      SELECT link.value->>'issuer' AS principal_issuer,
             link.value->>'subject' AS principal_subject,
             link.value->>'principalId' AS principal_id,
             link.value->>'employeeId' AS employee_id,
             admission.value->>'accountType' AS account_type,
             (version.payload->>'publishedAt')::timestamptz AS first_seen_at,
             version.payload->>'id' AS source_revision,
             'legacy'::text AS source_kind
        FROM versions version
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
    ), managed_evidence AS (
      SELECT identity.auth_issuer AS principal_issuer,
             identity.auth_subject AS principal_subject,
             identity.principal_id,
             identity.employee_id,
             'human_personal'::text AS account_type,
             COALESCE(identity.bound_at, identity.created_at) AS first_seen_at,
             'managed:' || identity.identity_record_id::text AS source_revision,
             'managed'::text AS source_kind
        FROM orgmaster_core.managed_daily_identities identity
       WHERE identity.auth_issuer IS NOT NULL
         AND identity.auth_subject IS NOT NULL
    )
    SELECT * FROM legacy_evidence
    UNION ALL
    SELECT * FROM managed_evidence
    ORDER BY principal_issuer, principal_subject, principal_id, source_revision
  LOOP
    IF nullif(candidate.principal_issuer, '') IS NULL
       OR nullif(candidate.principal_subject, '') IS NULL
       OR nullif(candidate.principal_id, '') IS NULL
       OR nullif(candidate.employee_id, '') IS NULL
       OR nullif(candidate.source_revision, '') IS NULL
       OR candidate.first_seen_at IS NULL THEN
      RAISE EXCEPTION 'PRINCIPAL_HISTORY_EVIDENCE_INCOMPLETE';
    END IF;

    INSERT INTO orgmaster_core.principal_identity_reservations(
      principal_issuer, principal_subject, employee_id, first_seen_at,
      source_kind, source_revision
    ) VALUES (
      candidate.principal_issuer, candidate.principal_subject,
      candidate.employee_id, candidate.first_seen_at,
      candidate.source_kind, candidate.source_revision
    ) ON CONFLICT (principal_issuer, principal_subject) DO NOTHING;

    SELECT employee_id, source_kind, principal_id
      INTO reserved_pair
      FROM orgmaster_core.principal_identity_reservations
     WHERE principal_issuer = candidate.principal_issuer
       AND principal_subject = candidate.principal_subject
     FOR UPDATE;
    IF reserved_pair.employee_id IS DISTINCT FROM candidate.employee_id
       OR reserved_pair.source_kind IS DISTINCT FROM candidate.source_kind
       OR (reserved_pair.principal_id IS NOT NULL
           AND reserved_pair.principal_id <> candidate.principal_id) THEN
      RAISE EXCEPTION 'PRINCIPAL_HISTORY_PAIR_CONFLICT';
    END IF;

    INSERT INTO orgmaster_core.principal_ownership_reservations(
      principal_id, employee_id, account_type, first_seen_at, source_revision
    ) VALUES (
      candidate.principal_id, candidate.employee_id, candidate.account_type,
      candidate.first_seen_at, candidate.source_revision
    ) ON CONFLICT (principal_id) DO NOTHING;

    SELECT employee_id, account_type
      INTO reserved_principal
      FROM orgmaster_core.principal_ownership_reservations
     WHERE principal_id = candidate.principal_id
     FOR UPDATE;
    IF reserved_principal.employee_id IS DISTINCT FROM candidate.employee_id
       OR reserved_principal.account_type IS DISTINCT FROM candidate.account_type THEN
      RAISE EXCEPTION 'PRINCIPAL_HISTORY_OWNER_CONFLICT';
    END IF;

    UPDATE orgmaster_core.principal_identity_reservations
       SET principal_id = candidate.principal_id
     WHERE principal_issuer = candidate.principal_issuer
       AND principal_subject = candidate.principal_subject
       AND principal_id IS NULL;
  END LOOP;
END;
$backfill$;

-- One row per permanently reserved provider pair, including unresolved and
-- inactive history. Consumers must not drop unresolved rows when proving that
-- the alias set is complete.
CREATE VIEW orgmaster_contract.v_principal_alias_history_v1
WITH (security_barrier = true) AS
SELECT 'orgmaster.principal-alias-history.v1'::text AS contract_version,
       pair.principal_issuer,
       pair.principal_subject,
       pair.principal_id,
       pair.employee_id,
       owner.account_type,
       pair.first_seen_at,
       pair.source_revision,
       CASE WHEN pair.principal_id IS NULL
         THEN 'unresolved'::text ELSE 'resolved'::text END AS resolution_status,
       pair.principal_id IS NOT NULL AND EXISTS (
         SELECT 1
           FROM orgmaster_contract.v_active_principal_mappings_v1 mapping
           JOIN orgmaster_contract.v_active_principal_accounts_v1 account
             ON account.principal_issuer = mapping.principal_issuer
            AND account.principal_subject = mapping.principal_subject
            AND account.principal_id = mapping.principal_id
            AND account.employee_id = mapping.employee_id
          WHERE mapping.principal_issuer = pair.principal_issuer
            AND mapping.principal_subject = pair.principal_subject
            AND mapping.principal_id = pair.principal_id
            AND mapping.employee_id = pair.employee_id
            AND account.account_type = owner.account_type
       ) AS active
  FROM orgmaster_core.principal_identity_reservations pair
  LEFT JOIN orgmaster_core.principal_ownership_reservations owner
    ON owner.principal_id = pair.principal_id
   AND owner.employee_id = pair.employee_id;
ALTER VIEW orgmaster_contract.v_principal_alias_history_v1
  OWNER TO jenfu_orgmaster_migrator;
REVOKE ALL ON orgmaster_contract.v_principal_alias_history_v1
  FROM PUBLIC, jenfu_ai_pdm_runtime, jenfu_platform_runtime, jenfu_orgmaster_runtime;
GRANT SELECT ON orgmaster_contract.v_principal_alias_history_v1
  TO jenfu_platform_runtime, jenfu_platform_migrator, jenfu_orgmaster_runtime;

-- Existing opaque sessions remain schema 1. Schema 2 records a principal
-- epoch without overwriting the original provider-pair epoch or auth time.
ALTER TABLE orgmaster_core.app_sessions
  ADD COLUMN session_schema_version smallint NOT NULL DEFAULT 1,
  ADD COLUMN epoch_kind text NOT NULL DEFAULT 'provider_pair',
  ADD COLUMN principal_auth_epoch bigint NULL,
  ADD CONSTRAINT orgmaster_session_epoch_contract CHECK (
    (session_schema_version = 1
      AND epoch_kind = 'provider_pair'
      AND principal_auth_epoch IS NULL)
    OR
    (session_schema_version = 2
      AND epoch_kind = 'principal'
      AND principal_auth_epoch BETWEEN 0 AND 9007199254740991)
  );

-- Runtime may refresh last-seen or revoke a session, but cannot turn a
-- previously issued pair session into a principal session (or rebind either).
CREATE FUNCTION orgmaster_core.guard_app_session_identity_binding_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  IF ROW(NEW.id, NEW.session_id_hash, NEW.identity_issuer,
         NEW.identity_subject, NEW.principal_id, NEW.employee_id,
         NEW.app_id, NEW.auth_epoch, NEW.session_schema_version,
         NEW.epoch_kind, NEW.principal_auth_epoch, NEW.issued_at,
         NEW.authenticated_at, NEW.expires_at, NEW.assurance_level)
     IS DISTINCT FROM
     ROW(OLD.id, OLD.session_id_hash, OLD.identity_issuer,
         OLD.identity_subject, OLD.principal_id, OLD.employee_id,
         OLD.app_id, OLD.auth_epoch, OLD.session_schema_version,
         OLD.epoch_kind, OLD.principal_auth_epoch, OLD.issued_at,
         OLD.authenticated_at, OLD.expires_at, OLD.assurance_level)
  THEN
    RAISE EXCEPTION 'ORGMASTER_SESSION_BINDING_IMMUTABLE'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION orgmaster_core.guard_app_session_identity_binding_v1()
  OWNER TO jenfu_orgmaster_migrator;
REVOKE ALL ON FUNCTION orgmaster_core.guard_app_session_identity_binding_v1()
  FROM PUBLIC, jenfu_orgmaster_runtime;
CREATE TRIGGER guard_app_session_identity_binding_v1
  BEFORE UPDATE ON orgmaster_core.app_sessions
  FOR EACH ROW
  EXECUTE FUNCTION orgmaster_core.guard_app_session_identity_binding_v1();

-- The AI-PDM migrator needs only producer contracts for principal-local data
-- conversion, not OrgMaster private tables or the full alias-history view.
GRANT USAGE ON SCHEMA orgmaster_contract TO jenfu_ai_pdm_migrator;
GRANT SELECT ON
  orgmaster_contract.v_active_principal_mappings_v1,
  orgmaster_contract.v_active_principal_accounts_v1,
  orgmaster_contract.v_ai_pdm_entitlement_authority_v1,
  orgmaster_contract.v_ai_pdm_effective_role_assignments_v1
TO jenfu_ai_pdm_migrator;

-- This is the sole owner-side reservation rule used by both publication and
-- managed binding. It never reassigns a principal, even after deactivation.
CREATE FUNCTION orgmaster_core.reserve_principal_ownership_v1(
  p_principal_id text,
  p_employee_id text,
  p_account_type text,
  p_first_seen_at timestamptz,
  p_source_revision text
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $reserve$
DECLARE
  previous record;
BEGIN
  IF nullif(p_principal_id, '') IS NULL
     OR nullif(p_employee_id, '') IS NULL
     OR p_account_type NOT IN ('human_personal', 'human_privileged')
     OR p_first_seen_at IS NULL
     OR nullif(p_source_revision, '') IS NULL THEN
    RAISE EXCEPTION 'PRINCIPAL_OWNERSHIP_EVIDENCE_INVALID';
  END IF;
  INSERT INTO orgmaster_core.principal_ownership_reservations(
    principal_id, employee_id, account_type, first_seen_at, source_revision
  ) VALUES (
    p_principal_id, p_employee_id, p_account_type, p_first_seen_at,
    p_source_revision
  ) ON CONFLICT (principal_id) DO NOTHING;
  SELECT employee_id, account_type
    INTO previous
    FROM orgmaster_core.principal_ownership_reservations
   WHERE principal_id = p_principal_id
   FOR UPDATE;
  IF previous.employee_id IS DISTINCT FROM p_employee_id
     OR previous.account_type IS DISTINCT FROM p_account_type THEN
    RAISE EXCEPTION 'PRINCIPAL_OWNERSHIP_CONFLICT';
  END IF;
END;
$reserve$;
ALTER FUNCTION orgmaster_core.reserve_principal_ownership_v1(text,text,text,timestamptz,text)
  OWNER TO jenfu_orgmaster_migrator;
REVOKE ALL ON FUNCTION orgmaster_core.reserve_principal_ownership_v1(text,text,text,timestamptz,text)
  FROM PUBLIC, jenfu_orgmaster_runtime, jenfu_platform_runtime, jenfu_ai_pdm_runtime;

CREATE FUNCTION orgmaster_core.reject_principal_ownership_mutation_v1()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $immutable$
BEGIN
  RAISE EXCEPTION 'PRINCIPAL_OWNERSHIP_IMMUTABLE';
END;
$immutable$;
ALTER FUNCTION orgmaster_core.reject_principal_ownership_mutation_v1()
  OWNER TO jenfu_orgmaster_migrator;
REVOKE ALL ON FUNCTION orgmaster_core.reject_principal_ownership_mutation_v1()
  FROM PUBLIC, jenfu_orgmaster_runtime, jenfu_platform_runtime, jenfu_ai_pdm_runtime;
CREATE TRIGGER reject_principal_ownership_mutation_v1
BEFORE UPDATE OR DELETE ON orgmaster_core.principal_ownership_reservations
FOR EACH ROW EXECUTE FUNCTION orgmaster_core.reject_principal_ownership_mutation_v1();

-- Existing managed bind/verify routines insert the permanent pair only after
-- updating the managed record. The pair insert trigger fills the principal
-- from that exact managed record and enforces the same immutable ownership.
CREATE FUNCTION orgmaster_core.guard_principal_identity_reservation_v1()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $guard$
DECLARE
  managed record;
  owner record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PRINCIPAL_IDENTITY_RESERVATION_IMMUTABLE';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.principal_issuer IS DISTINCT FROM OLD.principal_issuer
       OR NEW.principal_subject IS DISTINCT FROM OLD.principal_subject
       OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
       OR NEW.source_kind IS DISTINCT FROM OLD.source_kind
       OR NEW.first_seen_at IS DISTINCT FROM OLD.first_seen_at
       OR NEW.source_revision IS DISTINCT FROM OLD.source_revision
       OR (OLD.principal_id IS NOT NULL
           AND NEW.principal_id IS DISTINCT FROM OLD.principal_id) THEN
      RAISE EXCEPTION 'PRINCIPAL_IDENTITY_RESERVATION_IMMUTABLE';
    END IF;
    IF OLD.principal_id IS NULL AND NEW.principal_id IS NOT NULL THEN
      SELECT employee_id
        INTO owner
        FROM orgmaster_core.principal_ownership_reservations
       WHERE principal_id = NEW.principal_id;
      IF NOT FOUND OR owner.employee_id <> NEW.employee_id THEN
        RAISE EXCEPTION 'PRINCIPAL_IDENTITY_RESERVATION_CONFLICT';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.source_kind = 'managed' THEN
    SELECT identity.principal_id, identity.employee_id,
           COALESCE(identity.bound_at, identity.created_at) AS first_seen_at
      INTO managed
      FROM orgmaster_core.managed_daily_identities identity
     WHERE identity.auth_issuer = NEW.principal_issuer
       AND identity.auth_subject = NEW.principal_subject
       AND identity.employee_id = NEW.employee_id;
    IF NOT FOUND OR (NEW.principal_id IS NOT NULL
                     AND NEW.principal_id <> managed.principal_id) THEN
      RAISE EXCEPTION 'MANAGED_PRINCIPAL_RESERVATION_CONFLICT';
    END IF;
    PERFORM orgmaster_core.reserve_principal_ownership_v1(
      managed.principal_id, managed.employee_id, 'human_personal',
      managed.first_seen_at, NEW.source_revision
    );
    NEW.principal_id := managed.principal_id;
  ELSIF NEW.principal_id IS NOT NULL THEN
    SELECT employee_id
      INTO owner
      FROM orgmaster_core.principal_ownership_reservations
     WHERE principal_id = NEW.principal_id;
    IF NOT FOUND OR owner.employee_id <> NEW.employee_id THEN
      RAISE EXCEPTION 'PRINCIPAL_IDENTITY_RESERVATION_CONFLICT';
    END IF;
  END IF;
  RETURN NEW;
END;
$guard$;
ALTER FUNCTION orgmaster_core.guard_principal_identity_reservation_v1()
  OWNER TO jenfu_orgmaster_migrator;
REVOKE ALL ON FUNCTION orgmaster_core.guard_principal_identity_reservation_v1()
  FROM PUBLIC, jenfu_orgmaster_runtime, jenfu_platform_runtime, jenfu_ai_pdm_runtime;
CREATE TRIGGER guard_principal_identity_reservation_v1
BEFORE INSERT OR UPDATE OR DELETE ON orgmaster_core.principal_identity_reservations
FOR EACH ROW EXECUTE FUNCTION orgmaster_core.guard_principal_identity_reservation_v1();

-- Keep the historical writer body as a private implementation, then wrap its
-- original signature. The wrapper holds the same owner locks and reserves
-- typed principal evidence before the historical publication runs.
ALTER FUNCTION orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v1(jsonb,text,text,text,text,jsonb)
  RENAME TO write_active_persistence_artifacts_with_identity_fence_base_v1;
REVOKE ALL ON FUNCTION orgmaster_core.write_active_persistence_artifacts_with_identity_fence_base_v1(jsonb,text,text,text,text,jsonb)
  FROM PUBLIC, jenfu_orgmaster_runtime, jenfu_platform_runtime, jenfu_ai_pdm_runtime;

CREATE FUNCTION orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v1(
  p_changes jsonb,
  p_source_revision text,
  p_updated_by text,
  p_reason_code text,
  p_operation_id text,
  p_entitlement_changes jsonb DEFAULT '[]'::jsonb
) RETURNS TABLE(authority_version bigint, source_revision text, outbox_count integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $writer$
DECLARE
  governance_payload jsonb;
  candidate record;
  reserved_pair record;
  result record;
BEGIN
  IF jsonb_typeof(p_changes) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'PERSISTENCE_CHANGE_INVALID';
  END IF;
  PERFORM 1
    FROM orgmaster_core.managed_identity_admission_authority
   WHERE singleton = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MANAGED_IDENTITY_ADMISSION_AUTHORITY_MISSING'; END IF;
  PERFORM 1
    FROM orgmaster_core.persistence_authority
   WHERE singleton = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PERSISTENCE_AUTHORITY_MISSING'; END IF;

  SELECT change.value->'payload'
    INTO governance_payload
    FROM jsonb_array_elements(p_changes) change(value)
   WHERE change.value->>'artifactKey' = 'orgmaster-governance.v3.json'
     AND change.value->>'artifactKind' = 'governance';
  IF governance_payload IS NOT NULL THEN
    FOR candidate IN
      WITH versions AS (
        SELECT version.value AS payload
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(governance_payload->'publishedVersions') = 'array'
              THEN governance_payload->'publishedVersions' ELSE '[]'::jsonb END
          ) version(value)
         WHERE version.value->>'kind' = 'assignment-governance-v3'
      )
      SELECT link.value->>'issuer' AS principal_issuer,
             link.value->>'subject' AS principal_subject,
             link.value->>'principalId' AS principal_id,
             link.value->>'employeeId' AS employee_id,
             admission.value->>'accountType' AS account_type,
             (version.payload->>'publishedAt')::timestamptz AS first_seen_at,
             version.payload->>'id' AS source_revision
        FROM versions version
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
       ORDER BY principal_issuer, principal_subject, principal_id, source_revision
    LOOP
      IF nullif(candidate.principal_issuer, '') IS NULL
         OR nullif(candidate.principal_subject, '') IS NULL
         OR nullif(candidate.principal_id, '') IS NULL
         OR nullif(candidate.employee_id, '') IS NULL
         OR nullif(candidate.source_revision, '') IS NULL
         OR candidate.first_seen_at IS NULL THEN
        RAISE EXCEPTION 'PRINCIPAL_HISTORY_EVIDENCE_INCOMPLETE';
      END IF;

      SELECT employee_id, source_kind, principal_id
        INTO reserved_pair
        FROM orgmaster_core.principal_identity_reservations
       WHERE principal_issuer = candidate.principal_issuer
         AND principal_subject = candidate.principal_subject
       FOR UPDATE;
      IF FOUND AND (
        reserved_pair.employee_id IS DISTINCT FROM candidate.employee_id
        OR reserved_pair.source_kind IS DISTINCT FROM 'legacy'
        OR reserved_pair.principal_id IS NULL
        OR reserved_pair.principal_id <> candidate.principal_id
      ) THEN
        RAISE EXCEPTION 'PRINCIPAL_IDENTITY_RESERVATION_CONFLICT';
      END IF;

      PERFORM orgmaster_core.reserve_principal_ownership_v1(
        candidate.principal_id, candidate.employee_id, candidate.account_type,
        candidate.first_seen_at, candidate.source_revision
      );
      INSERT INTO orgmaster_core.principal_identity_reservations(
        principal_issuer, principal_subject, employee_id, first_seen_at,
        source_kind, source_revision, principal_id
      ) VALUES (
        candidate.principal_issuer, candidate.principal_subject,
        candidate.employee_id, candidate.first_seen_at, 'legacy',
        candidate.source_revision, candidate.principal_id
      ) ON CONFLICT (principal_issuer, principal_subject) DO NOTHING;
    END LOOP;
  END IF;

  SELECT * INTO result
    FROM orgmaster_core.write_active_persistence_artifacts_with_identity_fence_base_v1(
      p_changes, p_source_revision, p_updated_by, p_reason_code,
      p_operation_id, p_entitlement_changes
    );
  RETURN QUERY SELECT result.authority_version, result.source_revision,
                      result.outbox_count;
END;
$writer$;
ALTER FUNCTION orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v1(jsonb,text,text,text,text,jsonb)
  OWNER TO jenfu_orgmaster_migrator;
REVOKE ALL ON FUNCTION orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v1(jsonb,text,text,text,text,jsonb)
  FROM PUBLIC, jenfu_platform_runtime, jenfu_ai_pdm_runtime;
GRANT EXECUTE ON FUNCTION orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v1(jsonb,text,text,text,text,jsonb)
  TO jenfu_orgmaster_runtime;

-- Historical receipts remain intact and unbound. Only new v2 operations carry
-- the exact request and target identity, so replay cannot silently adopt a
-- different principal after a later governance change.
ALTER TABLE orgmaster_core.authority_switch_receipts
  ADD COLUMN request_contract_version text NULL,
  ADD COLUMN request_hash char(64) NULL,
  ADD COLUMN target_principal_id text NULL,
  ADD COLUMN target_identity_issuer text NULL,
  ADD COLUMN target_identity_subject text NULL,
  ADD CONSTRAINT authority_switch_receipt_v2_binding CHECK (
    (request_contract_version IS NULL
      AND request_hash IS NULL
      AND target_principal_id IS NULL
      AND target_identity_issuer IS NULL
      AND target_identity_subject IS NULL)
    OR
    (request_contract_version = 'orgmaster.employee-authority-switch.v2'
      AND request_hash ~ '^[a-f0-9]{64}$'
      AND char_length(target_principal_id) BETWEEN 1 AND 255
      AND char_length(target_identity_issuer) BETWEEN 1 AND 255
      AND char_length(target_identity_subject) BETWEEN 1 AND 255)
  );

CREATE FUNCTION orgmaster_contract.read_employee_authority_operation_v1(
  p_application_id text,
  p_employee_id text,
  p_operation_id text
) RETURNS TABLE(receipt jsonb, outbox jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $readback$
  SELECT jsonb_build_object(
      'receiptId', r.receipt_id, 'operationId', r.operation_id,
      'applicationId', r.application_id, 'employeeId', r.employee_id,
      'batchId', r.batch_id,
      'fromAuthoritySource', r.from_authority_source,
      'toAuthoritySource', r.to_authority_source,
      'authorityVersion', r.authority_version,
      'assignmentVersionId', r.assignment_version_id,
      'actor', r.actor, 'reason', r.reason, 'switchedAt', r.switched_at,
      'requestContractVersion', r.request_contract_version,
      'requestHash', r.request_hash,
      'targetPrincipalId', r.target_principal_id,
      'targetIdentityIssuer', r.target_identity_issuer,
      'targetIdentitySubject', r.target_identity_subject,
      'sessionRefreshState', r.session_refresh_state,
      'platformReceiptId', r.platform_receipt_id
    ) AS receipt,
    CASE WHEN event.event_id IS NULL THEN NULL::jsonb ELSE jsonb_build_object(
      'eventId', event.event_id, 'operationId', event.operation_id,
      'employeeId', event.employee_id, 'applicationId', event.application_id,
      'eventKind', event.event_kind, 'actor', event.actor,
      'reasonCode', event.reason_code, 'createdAt', event.created_at,
      'completedAt', event.completed_at,
      'status', event.status, 'attemptCount', event.attempt_count,
      'platformReceiptId', event.platform_receipt_id
    ) END AS outbox
  FROM orgmaster_core.authority_switch_receipts r
  LEFT JOIN orgmaster_core.entitlement_change_outbox event
    ON event.operation_id = r.operation_id
   AND event.application_id = r.application_id
   AND event.employee_id = r.employee_id
 WHERE r.operation_id = p_operation_id
   AND r.application_id = p_application_id
   AND r.employee_id = p_employee_id;
$readback$;
ALTER FUNCTION orgmaster_contract.read_employee_authority_operation_v1(text,text,text)
  OWNER TO jenfu_orgmaster_migrator;
REVOKE ALL ON FUNCTION orgmaster_contract.read_employee_authority_operation_v1(text,text,text)
  FROM PUBLIC, jenfu_platform_runtime, jenfu_ai_pdm_runtime;
GRANT EXECUTE ON FUNCTION orgmaster_contract.read_employee_authority_operation_v1(text,text,text)
  TO jenfu_orgmaster_runtime, jenfu_platform_migrator;

CREATE FUNCTION orgmaster_contract.switch_employee_entitlement_authority_v2(
  p_application_id text,
  p_employee_id text,
  p_to_authority_source text,
  p_expected_authority_version bigint,
  p_operation_id text,
  p_batch_id text,
  p_assignment_version_id text,
  p_actor text,
  p_reason text,
  p_principal_id text,
  p_identity_issuer text,
  p_identity_subject text
) RETURNS TABLE(
  receipt_id uuid,
  authority_version bigint,
  outbox_event_id uuid,
  session_refresh_state text,
  replayed boolean
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $switch$
DECLARE
  v_hash char(64);
  v_existing orgmaster_core.authority_switch_receipts%ROWTYPE;
  v_app orgmaster_core.application_authority_state%ROWTYPE;
  v_override orgmaster_core.employee_authority_overrides%ROWTYPE;
  v_from text;
  v_current_version bigint;
  v_next_version bigint;
  v_mapping_count integer;
  v_account_count integer;
  v_portal_count integer;
  v_active_version_id text;
  v_receipt_id uuid := public.gen_random_uuid();
  v_event_id uuid := public.gen_random_uuid();
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_application_id IS DISTINCT FROM 'ai-pdm'
     OR p_employee_id IS NULL OR char_length(p_employee_id) NOT BETWEEN 1 AND 255
     OR p_employee_id <> btrim(p_employee_id)
     OR p_to_authority_source NOT IN ('legacy_authority', 'orgmaster_authority')
     OR p_expected_authority_version NOT BETWEEN 1 AND 9007199254740990
     OR p_operation_id IS NULL OR char_length(p_operation_id) NOT BETWEEN 1 AND 255
     OR p_operation_id <> btrim(p_operation_id)
     OR (p_batch_id IS NOT NULL AND
         (char_length(p_batch_id) NOT BETWEEN 1 AND 255 OR p_batch_id <> btrim(p_batch_id)))
     OR p_assignment_version_id IS NULL
     OR char_length(p_assignment_version_id) NOT BETWEEN 1 AND 255
     OR p_actor IS NULL OR char_length(p_actor) NOT BETWEEN 1 AND 128
     OR p_actor <> btrim(p_actor)
     OR p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 240
     OR p_reason <> btrim(p_reason)
     OR p_principal_id IS NULL OR char_length(p_principal_id) NOT BETWEEN 1 AND 255
     OR p_identity_issuer IS NULL OR char_length(p_identity_issuer) NOT BETWEEN 1 AND 255
     OR p_identity_subject IS NULL OR char_length(p_identity_subject) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'ENTITLEMENT_AUTHORITY_SWITCH_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;
  IF current_setting('transaction_isolation') <> 'read committed'
     OR current_setting('transaction_read_only') <> 'off' THEN
    RAISE EXCEPTION 'authority_transaction_mode_invalid' USING ERRCODE = '25001';
  END IF;

  v_hash := encode(public.digest(convert_to(
    jsonb_build_array(
      'orgmaster.employee-authority-switch.v2',
      p_application_id, p_employee_id, p_to_authority_source,
      p_expected_authority_version, p_operation_id, p_batch_id,
      p_assignment_version_id, p_actor, p_reason,
      p_principal_id, p_identity_issuer, p_identity_subject
    )::text, 'UTF8'
  ), 'sha256'), 'hex');

  -- The operation lock serializes identical keys even when no receipt exists.
  -- READ COMMITTED gives each following SQL statement a fresh snapshot.
  PERFORM pg_advisory_xact_lock(
    hashtext('orgmaster-authority-switch-v2'),
    hashtext(jsonb_build_array(p_application_id,p_employee_id,p_operation_id)::text)
  );
  SELECT * INTO v_existing
    FROM orgmaster_core.authority_switch_receipts receipt
   WHERE receipt.operation_id = p_operation_id
     AND receipt.application_id = p_application_id
     AND receipt.employee_id = p_employee_id
   FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_contract_version IS NULL
       OR v_existing.request_hash IS NULL THEN
      RAISE EXCEPTION 'legacy_receipt_unbound' USING ERRCODE = '23505';
    END IF;
    IF v_existing.request_contract_version <> 'orgmaster.employee-authority-switch.v2'
       OR v_existing.request_hash <> v_hash THEN
      RAISE EXCEPTION 'ENTITLEMENT_AUTHORITY_OPERATION_REUSED' USING ERRCODE = '23505';
    END IF;
    SELECT event.event_id INTO v_event_id
      FROM orgmaster_core.entitlement_change_outbox event
     WHERE event.operation_id = v_existing.operation_id
       AND event.application_id = v_existing.application_id
       AND event.employee_id = v_existing.employee_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'AUTHORITY_RECEIPT_OUTBOX_MISSING';
    END IF;
    RETURN QUERY SELECT v_existing.receipt_id, v_existing.authority_version,
      v_event_id, v_existing.session_refresh_state, true;
    RETURN;
  END IF;

  PERFORM 1 FROM orgmaster_core.managed_identity_admission_authority
   WHERE singleton = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MANAGED_IDENTITY_ADMISSION_AUTHORITY_MISSING'; END IF;
  PERFORM 1 FROM orgmaster_core.persistence_authority
   WHERE singleton = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PERSISTENCE_AUTHORITY_MISSING'; END IF;
  SELECT * INTO v_app
    FROM orgmaster_core.application_authority_state app
   WHERE app.application_id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ENTITLEMENT_AUTHORITY_STATE_NOT_FOUND' USING ERRCODE = '23503';
  END IF;
  SELECT * INTO v_override
    FROM orgmaster_core.employee_authority_overrides override
   WHERE override.application_id = p_application_id
     AND override.employee_id = p_employee_id FOR UPDATE;
  IF FOUND THEN
    v_from := v_override.authority_source;
    v_current_version := v_override.authority_version;
  ELSE
    v_from := v_app.authority_source;
    v_current_version := v_app.authority_version;
  END IF;

  -- All target facts are read in one post-lock statement. This guards exact
  -- pair/principal/Employee/type and the currently published assignment.
  WITH mappings AS (
    SELECT 1 FROM orgmaster_contract.v_active_principal_mappings_v1 mapping
     WHERE mapping.principal_issuer = p_identity_issuer
       AND mapping.principal_subject = p_identity_subject
       AND mapping.principal_id = p_principal_id
       AND mapping.employee_id = p_employee_id
       AND mapping.employee_status = 'active'
  ), accounts AS (
    SELECT 1 FROM orgmaster_contract.v_active_principal_accounts_v1 account
     WHERE account.principal_issuer = p_identity_issuer
       AND account.principal_subject = p_identity_subject
       AND account.principal_id = p_principal_id
       AND account.employee_id = p_employee_id
       AND account.account_type = 'human_personal'
       AND account.employee_status = 'active'
  ), visibility AS (
    SELECT 1 FROM orgmaster_contract.v_portal_app_visibility_v1 portal
     WHERE portal.application_id = 'ai-pdm'
       AND portal.principal_issuer = p_identity_issuer
       AND portal.principal_subject = p_identity_subject
       AND portal.visibility_state = 'visible'
  ), governance AS (
    SELECT artifact.payload->>'activePolicyVersionId' AS version_id
      FROM orgmaster_core.persistence_authority authority
      JOIN orgmaster_core.persistence_batches batch
        ON batch.id = authority.active_batch_id AND batch.status = 'active'
      JOIN orgmaster_core.persistence_artifacts artifact
        ON artifact.batch_id = batch.id
       AND artifact.artifact_key = 'orgmaster-governance.v3.json'
       AND artifact.artifact_kind = 'governance'
     WHERE authority.singleton = true
  )
  SELECT (SELECT count(*)::integer FROM mappings),
         (SELECT count(*)::integer FROM accounts),
         (SELECT count(*)::integer FROM visibility),
         (SELECT version_id FROM governance)
    INTO v_mapping_count, v_account_count, v_portal_count, v_active_version_id;
  IF v_mapping_count <> 1 OR v_account_count <> 1 THEN
    RAISE EXCEPTION 'ENTITLEMENT_AUTHORITY_TARGET_IDENTITY_INVALID' USING ERRCODE = '23503';
  END IF;
  IF v_active_version_id IS DISTINCT FROM p_assignment_version_id
     OR (p_to_authority_source = 'orgmaster_authority' AND v_portal_count <> 1) THEN
    RAISE EXCEPTION 'ENTITLEMENT_AUTHORITY_ASSIGNMENT_INVALID' USING ERRCODE = '23503';
  END IF;
  IF v_current_version <> p_expected_authority_version THEN
    RAISE EXCEPTION 'ENTITLEMENT_AUTHORITY_VERSION_CONFLICT' USING ERRCODE = '40001';
  END IF;
  IF v_from = p_to_authority_source THEN
    RAISE EXCEPTION 'ENTITLEMENT_AUTHORITY_SOURCE_UNCHANGED' USING ERRCODE = '22023';
  END IF;
  v_next_version := v_current_version + 1;

  INSERT INTO orgmaster_core.employee_authority_overrides(
    application_id, employee_id, authority_source, authority_version,
    updated_at, operation_id, actor, reason
  ) VALUES (
    p_application_id, p_employee_id, p_to_authority_source, v_next_version,
    v_now, p_operation_id, p_actor, p_reason
  ) ON CONFLICT (application_id,employee_id) DO UPDATE SET
    authority_source = EXCLUDED.authority_source,
    authority_version = EXCLUDED.authority_version,
    updated_at = EXCLUDED.updated_at,
    operation_id = EXCLUDED.operation_id,
    actor = EXCLUDED.actor,
    reason = EXCLUDED.reason;
  INSERT INTO orgmaster_core.authority_switch_receipts(
    receipt_id, operation_id, batch_id, application_id, employee_id,
    employee_set_hash, from_authority_source, to_authority_source,
    authority_version, assignment_version_id, session_refresh_state,
    actor, reason, switched_at, request_contract_version, request_hash,
    target_principal_id, target_identity_issuer, target_identity_subject
  ) VALUES (
    v_receipt_id, p_operation_id, p_batch_id, p_application_id, p_employee_id,
    md5(p_employee_id) || md5('employee-set:' || p_employee_id),
    v_from, p_to_authority_source, v_next_version, p_assignment_version_id,
    'pending', p_actor, p_reason, v_now,
    'orgmaster.employee-authority-switch.v2', v_hash,
    p_principal_id, p_identity_issuer, p_identity_subject
  );
  INSERT INTO orgmaster_core.entitlement_change_outbox(
    event_id, operation_id, employee_id, application_id, event_kind,
    actor, reason_code, status, next_attempt_at, created_at
  ) VALUES (
    v_event_id, p_operation_id, p_employee_id, p_application_id,
    'authority_switch', p_actor, 'entitlement_authority_switch',
    'pending', v_now, v_now
  );
  RETURN QUERY SELECT v_receipt_id, v_next_version, v_event_id,
                      'pending'::text, false;
END;
$switch$;
ALTER FUNCTION orgmaster_contract.switch_employee_entitlement_authority_v2(text,text,text,bigint,text,text,text,text,text,text,text,text)
  OWNER TO jenfu_orgmaster_migrator;
REVOKE ALL ON FUNCTION orgmaster_contract.switch_employee_entitlement_authority_v2(text,text,text,bigint,text,text,text,text,text,text,text,text)
  FROM PUBLIC, jenfu_platform_runtime, jenfu_ai_pdm_runtime;
GRANT EXECUTE ON FUNCTION orgmaster_contract.switch_employee_entitlement_authority_v2(text,text,text,bigint,text,text,text,text,text,text,text,text)
  TO jenfu_orgmaster_runtime, jenfu_platform_migrator;


-- Reuse the one typed principal adapter for both authorization and Portal
-- visibility; preserve the public v1 columns and independent role predicates.
CREATE OR REPLACE VIEW orgmaster_contract.v_ai_pdm_effective_role_assignments_v1
WITH (security_barrier = true)
AS
WITH active_batch AS (
  SELECT batch.id
    FROM orgmaster_core.persistence_authority authority
    JOIN orgmaster_core.persistence_batches batch
      ON batch.id = authority.active_batch_id
     AND batch.status = 'active'
   WHERE authority.singleton = true
), active_version AS (
  SELECT version.value AS version_payload
    FROM active_batch
    JOIN orgmaster_core.persistence_artifacts governance
      ON governance.batch_id = active_batch.id
     AND governance.artifact_kind = 'governance'
     AND governance.artifact_key = 'orgmaster-governance.v3.json'
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
    FROM active_version
   CROSS JOIN current_workspace
), active_principals AS (
  SELECT account.principal_issuer,
         account.principal_subject,
         account.principal_id,
         account.employee_id,
         account.account_type
    FROM (
      SELECT typed.*,
             count(*) OVER (PARTITION BY typed.principal_issuer, typed.principal_subject) AS pair_row_count
        FROM orgmaster_contract.v_active_principal_accounts_v1 typed
    ) account
   WHERE account.pair_row_count = 1
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
       (
         assignment_payload->>'basis' = 'manual'
         AND jsonb_array_length(CASE WHEN jsonb_typeof(assignment_payload->'sources') = 'array' THEN assignment_payload->'sources' ELSE '[]'::jsonb END) = 0
       )
       OR (
         assignment_payload->>'basis' = 'position_adoption'
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
         )
       )
     )
), catalog_valid AS (
  SELECT valid_grants.*,
         catalog.stable_role_id,
         catalog.role_code,
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
         principal.employee_id,
         authority.authority_version
    FROM catalog_valid
    JOIN active_principals principal
      ON principal.employee_id = catalog_valid.recipient_employee_id
     AND (
       (catalog_valid.grant_kind = 'delegated' AND catalog_valid.catalog_subject_kind = 'employee' AND principal.account_type = 'human_personal')
       OR (
         catalog_valid.grant_kind = 'direct'
         AND catalog_valid.assignment_payload->>'subjectKind' = 'employee'
         AND catalog_valid.assignment_payload->'targetPrincipalId' = 'null'::jsonb
         AND catalog_valid.catalog_subject_kind = 'employee'
         AND principal.account_type = 'human_personal'
       )
       OR (
         catalog_valid.grant_kind = 'direct'
         AND catalog_valid.assignment_payload->>'subjectKind' = 'principal'
         AND catalog_valid.assignment_payload->>'targetPrincipalId' = principal.principal_id
         AND catalog_valid.catalog_subject_kind = 'principal'
         AND principal.account_type = 'human_privileged'
       )
     )
    JOIN orgmaster_contract.v_ai_pdm_entitlement_authority_v1 authority
      ON authority.application_id = 'ai-pdm'
     AND authority.employee_id = catalog_valid.recipient_employee_id
     AND authority.authority_source = 'orgmaster_authority'
)
SELECT 'jenfu.platform-entitlement.v1'::text AS contract_version,
       version_payload->>'id' AS assignment_version_id,
       (version_payload->>'versionNumber')::bigint AS assignment_version,
       projected_assignment_id AS assignment_id,
       grant_kind,
       delegation_id,
       'ai-pdm'::text AS application_id,
       principal_issuer AS identity_issuer,
       principal_subject AS identity_subject,
       principal_id,
       employee_id,
       CASE WHEN grant_kind = 'delegated' THEN 'employee' ELSE assignment_payload->>'subjectKind' END AS subject_kind,
       CASE WHEN grant_kind = 'delegated' THEN NULL ELSE assignment_payload->>'targetPrincipalId' END AS target_principal_id,
       stable_role_id,
       role_code,
       assignment_payload->>'catalogVersion' AS catalog_version,
       assignment_payload#>>'{scope,kind}' AS scope_kind,
       assignment_payload#>>'{scope,value}' AS scope_key,
       (projected_valid_from)::timestamptz AS valid_from,
       (projected_valid_until)::timestamptz AS valid_until,
       (version_payload->>'publishedAt')::timestamptz AS published_at,
       authority_version
  FROM resolved;

ALTER VIEW orgmaster_contract.v_ai_pdm_effective_role_assignments_v1 OWNER TO jenfu_orgmaster_migrator;

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
), active_principals AS (
  SELECT account.principal_issuer,
         account.principal_subject,
         account.principal_id,
         account.employee_id,
         account.account_type
    FROM (
      SELECT typed.*,
             count(*) OVER (PARTITION BY typed.principal_issuer, typed.principal_subject) AS pair_row_count
        FROM orgmaster_contract.v_active_principal_accounts_v1 typed
    ) account
   WHERE account.pair_row_count = 1
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
    JOIN active_principals principal
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
