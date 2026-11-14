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
  impact_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  authority_timeline jsonb,
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
  CHECK ((decision IS NOT DISTINCT FROM 'published') = (authority_timeline IS NOT NULL)),
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

-- Keep the temporal projection on the same eligibility rules as the scoped
-- V6 readers. Reuse the installed definitions and bind only their time source
-- and the dependent account/mapping reads. Live reader signatures stay intact.
DO $temporal_readers$
DECLARE definition text; needle text; marker text;
BEGIN
  definition := pg_get_viewdef('orgmaster_contract.v_active_principal_mappings_v1'::regclass, true);
  IF length(definition)-length(replace(definition,'CURRENT_TIMESTAMP','')) <> 2*length('CURRENT_TIMESTAMP') THEN
    RAISE EXCEPTION 'PDM_TEMPORAL_MAPPING_PREDECESSOR_DRIFT';
  END IF;
  EXECUTE 'CREATE FUNCTION orgmaster_core.read_ai_pdm_mappings_at_v1(p_at timestamptz)
    RETURNS SETOF orgmaster_contract.v_active_principal_mappings_v1
    LANGUAGE sql STABLE SET search_path=pg_catalog AS ' ||
    quote_literal(replace(definition,'CURRENT_TIMESTAMP','p_at'));

  definition := pg_get_functiondef('orgmaster_core.read_ai_pdm_principal_accounts_v1(text,text,text,boolean)'::regprocedure);
  needle := 'read_ai_pdm_principal_accounts_v1(p_principal_id text, p_issuer text, p_subject text, p_all boolean DEFAULT false)';
  IF strpos(definition,needle)=0
     OR length(definition)-length(replace(definition,'CURRENT_TIMESTAMP','')) <> 2*length('CURRENT_TIMESTAMP') THEN
    RAISE EXCEPTION 'PDM_TEMPORAL_ACCOUNT_PREDECESSOR_DRIFT';
  END IF;
  definition := replace(definition,needle,'read_ai_pdm_principal_accounts_at_v1(p_principal_id text, p_issuer text, p_subject text, p_all boolean, p_at timestamptz)');
  EXECUTE replace(definition,'CURRENT_TIMESTAMP','p_at');

  definition := pg_get_functiondef('orgmaster_core.read_ai_pdm_principal_grants_v5(text,text,boolean)'::regprocedure);
  needle := 'read_ai_pdm_principal_grants_v5(p_principal_id text, p_employee_id text, p_all boolean)';
  marker := 'FROM orgmaster_contract.v_active_principal_mappings_v1 mapping';
  IF strpos(definition,needle)=0 OR strpos(definition,marker)=0
     OR length(definition)-length(replace(definition,'CURRENT_TIMESTAMP','')) <> 12*length('CURRENT_TIMESTAMP') THEN
    RAISE EXCEPTION 'PDM_TEMPORAL_GRANT_PREDECESSOR_DRIFT';
  END IF;
  definition := replace(definition,needle,'read_ai_pdm_principal_grants_at_v1(p_principal_id text, p_employee_id text, p_all boolean, p_at timestamptz)');
  definition := replace(definition,marker,'FROM orgmaster_core.read_ai_pdm_mappings_at_v1(p_at) mapping');
  definition := replace(definition,'read_ai_pdm_principal_accounts_v1(candidate_grant->>''principalId'',NULL,NULL)',
    'read_ai_pdm_principal_accounts_at_v1(candidate_grant->>''principalId'',NULL,NULL,false,p_at)');
  definition := replace(definition,'read_ai_pdm_principal_accounts_v1(p_principal_id,NULL,NULL,p_all)',
    'read_ai_pdm_principal_accounts_at_v1(p_principal_id,NULL,NULL,p_all,p_at)');
  IF strpos(definition,'read_ai_pdm_principal_accounts_v1')<>0 THEN
    RAISE EXCEPTION 'PDM_TEMPORAL_GRANT_ACCOUNT_PREDECESSOR_DRIFT';
  END IF;
  EXECUTE replace(definition,'CURRENT_TIMESTAMP','p_at');
END;
$temporal_readers$;
REVOKE ALL ON FUNCTION orgmaster_core.read_ai_pdm_mappings_at_v1(timestamptz),
  orgmaster_core.read_ai_pdm_principal_accounts_at_v1(text,text,text,boolean,timestamptz),
  orgmaster_core.read_ai_pdm_principal_grants_at_v1(text,text,boolean,timestamptz) FROM PUBLIC;

-- The published grant evaluator is piecewise constant over these source
-- boundaries. Evaluate only the selected Principal's points and coalesce
-- adjacent equal facts so unrelated timestamps cannot change its fingerprint.
CREATE FUNCTION orgmaster_core.read_pdm_authority_timeline_v1(
  p_principal_id text, p_employee_id text, p_at timestamptz, p_publication jsonb, p_workspace jsonb
) RETURNS TABLE(valid_from timestamptz, valid_until timestamptz, accounts jsonb, grants jsonb)
LANGUAGE sql STABLE SET search_path=pg_catalog AS $timeline$
  WITH assignments AS MATERIALIZED (
    SELECT value AS payload FROM jsonb_array_elements(COALESCE(p_publication#>'{policy,roleAssignments}','[]'))
    WHERE value->>'applicationId'='ai-pdm' AND value->>'status'='active'
  ), delegations AS MATERIALIZED (
    SELECT d.value AS payload, a.payload AS source
    FROM jsonb_array_elements(COALESCE(p_publication#>'{policy,roleDelegations}','[]')) d
    JOIN assignments a ON a.payload->>'id'=d.value->>'sourceAssignmentId'
      AND a.payload->>'employeeId'=d.value->>'fromEmployeeId'
      AND a.payload->>'roleId'=d.value->>'roleId'
      AND a.payload->>'catalogVersion'=d.value->>'catalogVersion'
      AND a.payload->'scope'=d.value->'scope'
    WHERE d.value->>'status'='active' AND d.value->>'toEmployeeId'=p_employee_id
  ), relevant AS MATERIALIZED (
    SELECT payload FROM assignments WHERE payload->>'employeeId'=p_employee_id
      AND (payload->>'subjectKind'='employee' OR payload->>'targetPrincipalId'=p_principal_id)
    UNION ALL SELECT source FROM delegations
  ), sources AS (
    SELECT payload FROM relevant
    UNION ALL SELECT payload FROM delegations
    UNION ALL
    SELECT appointment.value
    FROM relevant a
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(a.payload->'sources','[]')) source
    JOIN LATERAL jsonb_array_elements(COALESCE(p_workspace#>'{state,assignments}','[]')) appointment
      ON appointment.value->>'id'=source.value->>'positionAssignmentId'
      AND appointment.value->>'positionId'=source.value->>'positionId'
      AND appointment.value->>'employeeId'=a.payload->>'employeeId'
    WHERE a.payload->>'basis'='position_adoption'
    UNION ALL
    SELECT value FROM jsonb_array_elements(COALESCE(p_publication#>'{policy,administration,grants}','[]'))
    WHERE value->>'applicationId'='ai-pdm' AND value->>'status'='active'
      AND value->>'principalId'=p_principal_id AND value->>'employeeId'=p_employee_id
    UNION ALL
    SELECT value FROM jsonb_array_elements(COALESCE(p_publication#>'{policy,identityLinks}','[]'))
    WHERE value->>'principalId'=p_principal_id AND value->>'status'='active'
  ), points AS (
    SELECT p_at AS instant
    UNION
    SELECT boundary.instant FROM sources
    CROSS JOIN LATERAL (VALUES ((payload->>'validFrom')::timestamptz),
      ((payload->>'validTo')::timestamptz)) boundary(instant)
    WHERE boundary.instant>p_at
  ), facts AS MATERIALIZED (
    SELECT instant,
      COALESCE((SELECT jsonb_agg(fact ORDER BY fact)
        FROM orgmaster_core.read_ai_pdm_principal_accounts_at_v1(p_principal_id,NULL,NULL,false,instant) a
        CROSS JOIN LATERAL (SELECT jsonb_build_array(a.employee_id,a.account_type,a.principal_issuer,a.principal_subject) AS fact) signature
      ), '[]'::jsonb) AS accounts,
      COALESCE((SELECT jsonb_agg(fact ORDER BY fact)
        FROM orgmaster_core.read_ai_pdm_principal_grants_at_v1(p_principal_id,p_employee_id,false,instant) g
        CROSS JOIN LATERAL (SELECT jsonb_build_array(g.employee_id,g.subject_kind,g.target_principal_id,g.stable_role_id,
          g.role_code,g.catalog_version,g.scope_kind,g.scope_key,g.grant_kind,
          g.admin_catalog_sha256,g.role_definition_hash) AS fact) signature
      ), '[]'::jsonb) AS grants
    FROM points
  ), changes AS (
    SELECT *, lag(accounts) OVER chronological AS prior_accounts, lag(grants) OVER chronological AS prior_grants
    FROM facts WINDOW chronological AS (ORDER BY instant)
  )
  SELECT instant, lead(instant) OVER (ORDER BY instant), accounts, grants
  FROM changes WHERE accounts IS DISTINCT FROM prior_accounts OR grants IS DISTINCT FROM prior_grants
  ORDER BY instant;
$timeline$;
REVOKE ALL ON FUNCTION orgmaster_core.read_pdm_authority_timeline_v1(text,text,timestamptz,jsonb,jsonb) FROM PUBLIC;

-- Null first lower bound means the start of the frozen scan/operation.
-- Future boundaries and role multiplicity are retained in the fingerprint.
CREATE FUNCTION orgmaster_core.read_pdm_session_impact_v1(p_at timestamptz DEFAULT transaction_timestamp())
RETURNS TABLE(principal_id text, effect jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog SET timezone = 'UTC' AS $impact$
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
  )
  SELECT owner.principal_id, timeline.effect
  FROM orgmaster_core.principal_ownership_reservations owner
  CROSS JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_array(
      CASE WHEN fact.valid_from=p_at THEN NULL ELSE fact.valid_from END,
      fact.valid_until, fact.accounts, fact.grants) ORDER BY fact.valid_from) AS effect
    FROM orgmaster_core.read_pdm_authority_timeline_v1(owner.principal_id,owner.employee_id,p_at,
      (SELECT payload FROM publication), (SELECT payload FROM workspace)) fact
    HAVING bool_or(fact.accounts<>'[]'::jsonb OR fact.grants<>'[]'::jsonb)
  ) timeline
  WHERE owner.account_type IN ('human_personal','human_privileged');
$impact$;

REVOKE ALL ON FUNCTION orgmaster_core.lock_pdm_session_publication_v1(), orgmaster_core.read_pdm_session_impact_v1(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orgmaster_core.lock_pdm_session_publication_v1(), orgmaster_core.read_pdm_session_impact_v1(timestamptz) TO jenfu_orgmaster_runtime;
GRANT SELECT ON orgmaster_core.pdm_session_publication_v1 TO jenfu_orgmaster_runtime;
GRANT INSERT (operation_id, actor_principal_id, command_key, request_hash, baseline_version,
  publication_version, principal_ids, impact_hash, expires_at, owner_delivery)
  ON orgmaster_core.pdm_session_publication_v1 TO jenfu_orgmaster_runtime;
GRANT UPDATE (prepare_receipt, decision, decided_at, terminal_receipt, authority_timeline)
  ON orgmaster_core.pdm_session_publication_v1 TO jenfu_orgmaster_runtime;

CREATE INDEX pdm_session_publication_pending_delivery_v1
  ON orgmaster_core.pdm_session_publication_v1 (decided_at, operation_id)
  WHERE terminal_receipt IS NULL;
CREATE INDEX pdm_session_publication_expiry_v1
  ON orgmaster_core.pdm_session_publication_v1 (expires_at) WHERE decision IS NULL;
COMMIT;
