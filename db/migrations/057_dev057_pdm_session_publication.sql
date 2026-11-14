-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: additive orgmaster_contract.read_ai_pdm_session_publication_v1(uuid,text)
-- compatibility: backward-compatible
-- governance-review: DEV-057
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_orgmaster_migrator;

CREATE TABLE orgmaster_core.pdm_session_publication_control_v1 (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 0,
  operation_sha256 text,
  changed_at timestamptz
);
INSERT INTO orgmaster_core.pdm_session_publication_control_v1 DEFAULT VALUES;
REVOKE ALL ON orgmaster_core.pdm_session_publication_control_v1 FROM PUBLIC;

CREATE FUNCTION orgmaster_core.pdm_session_publication_enabled_v1()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $enabled$
  SELECT enabled FROM orgmaster_core.pdm_session_publication_control_v1 WHERE singleton;
$enabled$;
REVOKE ALL ON FUNCTION orgmaster_core.pdm_session_publication_enabled_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orgmaster_core.pdm_session_publication_enabled_v1() TO jenfu_orgmaster_runtime;

CREATE TABLE orgmaster_core.pdm_session_publication_v1 (
  operation_id uuid PRIMARY KEY,
  actor_principal_id text NOT NULL,
  command_key text NOT NULL CHECK (length(command_key) BETWEEN 1 AND 255),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  baseline_version bigint NOT NULL,
  publication_version bigint NOT NULL CHECK (publication_version = baseline_version + 1),
  principal_ids text[] NOT NULL CHECK (cardinality(principal_ids) BETWEEN 1 AND 4096),
  impact_hash text NOT NULL CHECK (impact_hash ~ '^[a-f0-9]{64}$'),
  prepare_event_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  terminal_event_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  prepared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  owner_delivery boolean NOT NULL DEFAULT false,
  prepare_receipt jsonb,
  decision text CHECK (decision IN ('published', 'cancelled')),
  decided_at timestamptz,
  terminal_receipt jsonb,
  CHECK (expires_at > prepared_at),
  CHECK ((decision IS NULL) = (decided_at IS NULL)),
  CHECK (decision IS DISTINCT FROM 'published' OR prepare_receipt IS NOT NULL),
  CHECK (terminal_receipt IS NULL OR decision IS NOT NULL),
  UNIQUE (actor_principal_id, command_key)
);

-- The source version in the wire identifies the exact committed publication.
-- Newer unrelated publications must not erase proof needed by the PDM relay.
CREATE FUNCTION orgmaster_contract.read_ai_pdm_session_publication_v1(
  p_operation_id uuid, p_publication_version text
)
RETURNS TABLE(publication_version text, published_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $publication$
  SELECT pending.publication_version::text, pending.decided_at
  FROM orgmaster_core.pdm_session_publication_v1 pending
  JOIN orgmaster_core.persistence_authority owner
    ON owner.singleton AND owner.authority_version >= pending.publication_version
  WHERE pending.operation_id = p_operation_id
    AND pending.publication_version::text = p_publication_version
    AND pending.decision = 'published';
$publication$;

REVOKE ALL ON orgmaster_core.pdm_session_publication_v1 FROM PUBLIC;
REVOKE ALL ON FUNCTION orgmaster_contract.read_ai_pdm_session_publication_v1(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orgmaster_contract.read_ai_pdm_session_publication_v1(uuid,text) TO jenfu_ai_pdm_runtime;
-- Use the same order as the identity-fenced artifact writer.
CREATE FUNCTION orgmaster_core.lock_pdm_session_publication_v1()
RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $lock$
DECLARE version bigint;
BEGIN
  PERFORM 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton FOR UPDATE;
  SELECT authority_version INTO STRICT version FROM orgmaster_core.persistence_authority WHERE singleton FOR UPDATE;
  RETURN version;
END;
$lock$;

-- A managed Directory observation can change effective PDM authority without
-- replacing an artifact batch. Keep the same active payload and advance its
-- monotonic authority version under the existing owner workload and CAS.
CREATE FUNCTION orgmaster_core.advance_pdm_lifecycle_publication_v1(p_expected bigint)
RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $advance$
DECLARE published bigint;
BEGIN
  PERFORM orgmaster_core.assert_lifecycle_executor_v2(NULL);
  IF orgmaster_core.lock_pdm_session_publication_v1() <> p_expected THEN
    RAISE EXCEPTION 'PDM_PUBLICATION_CONFLICT';
  END IF;
  UPDATE orgmaster_core.persistence_authority
    SET authority_version=p_expected+1, updated_at=clock_timestamp()
    WHERE singleton RETURNING authority_version INTO STRICT published;
  RETURN published;
END;
$advance$;

REVOKE ALL ON FUNCTION orgmaster_core.advance_pdm_lifecycle_publication_v1(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orgmaster_core.advance_pdm_lifecycle_publication_v1(bigint) TO jenfu_orgmaster_runtime;

-- Serialize mode changes with the same locks as effective permission writes.
-- Credentials, evidence and provider checks are handled by the owner operator.
CREATE FUNCTION orgmaster_core.transition_pdm_session_publication_v1(
  p_expected bigint, p_enabled boolean, p_operation_sha256 text, p_deadline timestamptz
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog AS $transition$
DECLARE state orgmaster_core.pdm_session_publication_control_v1%ROWTYPE;
BEGIN
  PERFORM orgmaster_core.lock_pdm_session_publication_v1();
  IF p_expected IS NULL OR p_enabled IS NULL OR p_deadline IS NULL OR p_deadline <= clock_timestamp()
     OR p_operation_sha256 IS NULL OR p_operation_sha256 !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'PDM_PUBLICATION_CONTROL_INPUT_INVALID';
  END IF;
  SELECT * INTO STRICT state FROM orgmaster_core.pdm_session_publication_control_v1 WHERE singleton FOR UPDATE;
  IF state.operation_sha256 IS DISTINCT FROM p_operation_sha256 THEN
    IF state.revision <> p_expected OR state.enabled = p_enabled THEN
      RAISE EXCEPTION 'PDM_PUBLICATION_CONTROL_CONFLICT';
    END IF;
    IF EXISTS (SELECT 1 FROM orgmaster_core.pdm_session_publication_v1 WHERE terminal_receipt IS NULL) THEN
      RAISE EXCEPTION 'PDM_PUBLICATION_CONTROL_PENDING_DELIVERY';
    END IF;
    UPDATE orgmaster_core.pdm_session_publication_control_v1 SET enabled=p_enabled,
      revision=state.revision+1, operation_sha256=p_operation_sha256, changed_at=clock_timestamp()
      WHERE singleton RETURNING * INTO STRICT state;
  ELSIF state.revision <> p_expected+1 OR state.enabled <> p_enabled THEN
    RAISE EXCEPTION 'PDM_PUBLICATION_CONTROL_CONFLICT';
  END IF;
  RETURN jsonb_build_object('enabled',state.enabled,'revision',state.revision::text,
    'operationSha256',state.operation_sha256,'changedAt',state.changed_at);
END;
$transition$;
REVOKE ALL ON FUNCTION orgmaster_core.transition_pdm_session_publication_v1(bigint,boolean,text,timestamptz) FROM PUBLIC;

-- Direct maintenance entrypoints retain their original signatures. Once
-- enabled, keep the older runner and ad-hoc calls out of the publication path.
DO $maintenance$
DECLARE entry regprocedure; definition text; guard text;
BEGIN
  guard := E'\n IF orgmaster_core.pdm_session_publication_enabled_v1() AND '
    || E'current_setting(''orgmaster.pdm_owner_maintenance'',true) IS DISTINCT FROM ''coordinated'' THEN '
    || E'RAISE EXCEPTION ''PDM_OWNER_PUBLICATION_REQUIRED''; END IF;';
  FOREACH entry IN ARRAY ARRAY[
    'orgmaster_core.set_managed_identity_admission_v1(bigint,boolean,text,text)'::regprocedure,
    'orgmaster_core.quarantine_managed_identity_v1(uuid,bigint,text,text,text)'::regprocedure
  ] LOOP
    definition := pg_get_functiondef(entry);
    IF strpos(definition,E'BEGIN\n PERFORM 1 FROM orgmaster_core.managed_identity_admission_authority') = 0 THEN
      RAISE EXCEPTION 'PDM_OWNER_MAINTENANCE_PREDECESSOR_DRIFT';
    END IF;
    -- Read the activation control after the same admission lock as the writer.
    definition := replace(definition,
      E'BEGIN\n PERFORM 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton FOR UPDATE;',
      E'BEGIN\n PERFORM 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton FOR UPDATE;'
       || guard);
    EXECUTE definition;
  END LOOP;
END;
$maintenance$;

-- Older revisions must fail closed if they start an effective writer after
-- the activation fence. Draft workspace writes and other artifacts may proceed.
DO $writers$
DECLARE entry regprocedure; definition text; condition text; marker text;
BEGIN
  FOREACH entry IN ARRAY ARRAY[
    'orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v3(jsonb,text,text,text,text,jsonb,jsonb)'::regprocedure,
    'orgmaster_core.apply_administration_command_v1(jsonb,jsonb)'::regprocedure,
    'orgmaster_core.initialize_administration_private_v1(jsonb,text)'::regprocedure,
    'orgmaster_core.complete_managed_identity_refresh_v2(text,uuid,uuid,bigint,text,text,text)'::regprocedure
  ] LOOP
    definition := pg_get_functiondef(entry);
    marker := 'PERFORM 1 FROM orgmaster_core.persistence_authority WHERE singleton FOR UPDATE;';
    IF strpos(definition,marker) = 0 THEN RAISE EXCEPTION 'PDM_WRITER_PREDECESSOR_DRIFT: %', entry; END IF;
    condition := CASE entry::oid
      WHEN 'orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v3(jsonb,text,text,text,text,jsonb,jsonb)'::regprocedure::oid
        THEN 'EXISTS (SELECT 1 FROM jsonb_array_elements(p_changes) artifact
          WHERE (artifact->>''artifactKind'' = ''workspace-version'' AND artifact#>>''{payload,kind}'' = ''document'')
             OR (artifact->>''artifactKey'' = ''orgmaster-governance.v3.json'' AND NOT EXISTS (
               SELECT 1 FROM orgmaster_core.persistence_authority authority
               JOIN orgmaster_core.persistence_artifacts previous ON previous.batch_id=authority.active_batch_id
               WHERE authority.singleton AND previous.artifact_key=artifact->>''artifactKey''
                 AND previous.payload->''activePolicyVersionId'' = artifact#>''{payload,activePolicyVersionId}''
                 AND previous.payload->''publishedVersions'' = artifact#>''{payload,publishedVersions}'')))'
      WHEN 'orgmaster_core.initialize_administration_private_v1(jsonb,text)'::regprocedure::oid
        THEN 'EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_package#>''{command,grants}'',''[]''::jsonb)) grant_row WHERE grant_row->>''applicationId'' = ''ai-pdm'')'
      ELSE 'true' END;
    EXECUTE replace(definition, marker, marker || E'\n IF ' || condition
      || ' AND orgmaster_core.pdm_session_publication_enabled_v1() AND '
      || 'current_setting(''orgmaster.pdm_publication_writer'',true) IS DISTINCT FROM ''coordinated'' '
      || 'THEN RAISE EXCEPTION ''PDM_PUBLICATION_WRITER_REQUIRED''; END IF;');
  END LOOP;
END;
$writers$;

-- Effective PDM grants, including exact administrative bindings, plus the
-- admitted provider pairs. Publication/assignment audit identifiers do not
-- change access. Multiplicity is retained because V6 rejects duplicate grants.
CREATE FUNCTION orgmaster_core.read_pdm_session_impact_v1()
RETURNS TABLE(principal_id text, effect jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $impact$
  WITH publication AS MATERIALIZED (
    SELECT orgmaster_core.read_administration_publication_v1() AS payload
  ), workspace AS MATERIALIZED (
    SELECT document.payload
    FROM orgmaster_core.persistence_authority owner
    JOIN orgmaster_core.persistence_artifacts manifest
      ON manifest.batch_id = owner.active_batch_id AND manifest.artifact_key = 'orgmaster-workspace.v1.json'
    JOIN orgmaster_core.persistence_artifacts document
      ON document.batch_id = owner.active_batch_id
     AND document.artifact_key = 'orgmaster-versions/' || (manifest.payload->>'currentVersionId') || '.json'
     AND document.payload->>'kind' = 'document'
    WHERE owner.singleton
  ), accounts AS MATERIALIZED (
    SELECT account.principal_id, min(account.employee_id) AS employee_id, jsonb_agg(jsonb_build_array(
      account.employee_id, account.account_type, account.principal_issuer, account.principal_subject
    ) ORDER BY account.employee_id COLLATE "C", account.account_type COLLATE "C",
      account.principal_issuer COLLATE "C", account.principal_subject COLLATE "C") AS account_signatures
    FROM orgmaster_core.read_ai_pdm_principal_accounts_v1(NULL, NULL, NULL, true) account
    GROUP BY account.principal_id
  ), grants AS (
    SELECT grant_row.principal_id, jsonb_agg(signature ORDER BY signature) AS grant_signatures
    FROM orgmaster_contract.read_ai_pdm_principal_effective_grants_v6() grant_row
    CROSS JOIN LATERAL (SELECT jsonb_build_array(grant_row.employee_id, grant_row.stable_role_id,
      grant_row.role_code, grant_row.catalog_version, grant_row.scope_kind, grant_row.scope_key,
      grant_row.valid_until, grant_row.admin_catalog_sha256, grant_row.role_definition_hash
    ) AS signature) AS grant_signature
    GROUP BY grant_row.principal_id
  )
  SELECT accounts.principal_id, jsonb_build_array(accounts.account_signatures, COALESCE(grants.grant_signatures, '[]'::jsonb),
    orgmaster_core.read_ai_pdm_next_session_boundary_v1(accounts.principal_id, accounts.employee_id,
      (SELECT payload FROM publication), (SELECT payload FROM workspace)))
  FROM accounts LEFT JOIN grants USING (principal_id)
  WHERE EXISTS (SELECT 1 FROM orgmaster_core.principal_ownership_reservations owner
                WHERE owner.principal_id = accounts.principal_id AND owner.account_type IN ('human_personal','human_privileged'));
$impact$;

REVOKE ALL ON FUNCTION orgmaster_core.lock_pdm_session_publication_v1(), orgmaster_core.read_pdm_session_impact_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orgmaster_core.lock_pdm_session_publication_v1(), orgmaster_core.read_pdm_session_impact_v1() TO jenfu_orgmaster_runtime;
GRANT SELECT ON orgmaster_core.pdm_session_publication_v1 TO jenfu_orgmaster_runtime;
GRANT INSERT (operation_id, actor_principal_id, command_key, request_hash, baseline_version,
  publication_version, principal_ids, impact_hash, expires_at, owner_delivery)
  ON orgmaster_core.pdm_session_publication_v1 TO jenfu_orgmaster_runtime;
GRANT UPDATE (prepare_receipt, decision, decided_at, terminal_receipt)
  ON orgmaster_core.pdm_session_publication_v1 TO jenfu_orgmaster_runtime;

CREATE INDEX pdm_session_publication_pending_delivery_v1
  ON orgmaster_core.pdm_session_publication_v1 (decided_at, operation_id)
  WHERE terminal_receipt IS NULL;
CREATE INDEX pdm_session_publication_expiry_v1
  ON orgmaster_core.pdm_session_publication_v1 (expires_at) WHERE decision IS NULL;
COMMIT;
