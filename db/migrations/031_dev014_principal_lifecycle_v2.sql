-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: orgmaster.workload-principals.v1, orgmaster.principal-lifecycle.v2
-- compatibility: new-version
-- Additive schema; V1 EXECUTE retired in a quiesced owner window.
-- Historical contracts remain read-only provenance.
-- governance-review: DEV-057 / JENFU DEV-014 current-lifecycle-completion-20261005

BEGIN;
SET LOCAL ROLE jenfu_orgmaster_migrator;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtext('dev014-principal-lifecycle-v2'), hashtext(current_database()));

-- Old events contain dynamic Employee-wide targets. Never silently reconstruct,
-- complete, delete or consume those events using today's identity mapping.
DO $preflight$
BEGIN
  -- Service scaling alone does not prove that in-flight V1 writes have drained.
  -- Count only this owner's runtime login in this exact database; never inspect
  -- sibling queries or terminate sessions. A remaining connection stops DDL.
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_stat_activity
      WHERE datname=current_database()
        AND usename='orgmaster-prod-runtime@jenfu-platform-prod.iam') THEN
    RAISE EXCEPTION 'ORGMASTER_RUNTIME_CONNECTIONS_NOT_QUIESCED';
  END IF;
  IF EXISTS (SELECT 1 FROM orgmaster_core.managed_identity_lifecycle_outbox WHERE status <> 'completed') THEN
    RAISE EXCEPTION 'HISTORICAL_LIFECYCLE_RECONCILIATION_REQUIRED';
  END IF;
END;
$preflight$;

CREATE TABLE orgmaster_core.workload_principal_bindings (
  principal_id text PRIMARY KEY CHECK (char_length(principal_id) BETWEEN 1 AND 255),
  owner text NOT NULL CHECK (owner IN ('orgmaster','platform')),
  purpose text NOT NULL,
  provider_issuer text NOT NULL CHECK (provider_issuer = 'https://accounts.google.com'),
  provider_subject text NOT NULL UNIQUE CHECK (provider_subject ~ '^[0-9]{18,24}$'),
  db_session_user text NOT NULL UNIQUE,
  binding_version bigint NOT NULL CHECK (binding_version > 0),
  enabled boolean NOT NULL,
  UNIQUE (owner,purpose),
  CHECK ((owner='orgmaster' AND purpose='managed-identity-lifecycle') OR
         (owner='platform' AND purpose='principal-lifecycle-invalidation'))
);
INSERT INTO orgmaster_core.workload_principal_bindings VALUES
  ('principal-workload:orgmaster-managed-identity-lifecycle','orgmaster','managed-identity-lifecycle',
   'https://accounts.google.com','109928765105400231333','orgmaster-prod-runtime@jenfu-platform-prod.iam',1,true),
  ('principal-workload:platform-principal-lifecycle-invalidation','platform','principal-lifecycle-invalidation',
   'https://accounts.google.com','101029748006912113815','platform-prod-runtime@jenfu-platform-prod.iam',1,true);

CREATE VIEW orgmaster_contract.v_workload_principals_v1 WITH (security_barrier=true) AS
SELECT 'orgmaster.workload-principals.v1'::text AS contract_version,
       principal_id, owner, purpose, provider_issuer, provider_subject,
       db_session_user, binding_version, enabled
FROM orgmaster_core.workload_principal_bindings;

CREATE FUNCTION orgmaster_core.assert_lifecycle_executor_v2(p_principal_id text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE result text;
BEGIN
  SELECT b.principal_id INTO result FROM orgmaster_core.workload_principal_bindings b
   WHERE b.db_session_user=SESSION_USER::text AND b.owner='orgmaster'
     AND b.purpose='managed-identity-lifecycle' AND b.enabled;
  IF result IS NULL OR (p_principal_id IS NOT NULL AND p_principal_id IS DISTINCT FROM result) THEN
    RAISE EXCEPTION 'MANAGED_LIFECYCLE_EXECUTOR_INVALID';
  END IF;
  RETURN result;
END;
$fn$;

-- Immutable security payload and mutable delivery lease are separate records.
CREATE TABLE orgmaster_core.principal_lifecycle_events_v2 (
  event_id uuid PRIMARY KEY,
  operation_id text NOT NULL UNIQUE CHECK (char_length(operation_id) BETWEEN 1 AND 255),
  source_revision text NOT NULL CHECK (char_length(source_revision) BETWEEN 1 AND 255),
  originating_principal_id text NOT NULL,
  initiating_principal_id text NULL,
  reason_code text NOT NULL CHECK (char_length(reason_code) BETWEEN 1 AND 128),
  snapshot_text text NOT NULL CHECK (octet_length(snapshot_text) <= 2097152),
  snapshot_hash char(64) NOT NULL CHECK (snapshot_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (snapshot_hash=encode(public.digest(snapshot_text,'sha256'),'hex'))
);
CREATE TABLE orgmaster_core.principal_lifecycle_delivery_v2 (
  event_id uuid PRIMARY KEY REFERENCES orgmaster_core.principal_lifecycle_events_v2(event_id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','blocked')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  lease_generation bigint NOT NULL DEFAULT 0 CHECK (lease_generation>=0),
  lease_id uuid NULL,
  lease_until timestamptz NULL,
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  receipt_id uuid NULL,
  last_error_code text NULL,
  completed_at timestamptz NULL,
  CHECK ((status='processing')=(lease_id IS NOT NULL AND lease_until IS NOT NULL)),
  CHECK ((status='completed')=(receipt_id IS NOT NULL AND completed_at IS NOT NULL))
);
CREATE FUNCTION orgmaster_core.reject_lifecycle_payload_mutation_v2()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN RAISE EXCEPTION 'LIFECYCLE_PAYLOAD_IMMUTABLE'; END;
$fn$;
CREATE TRIGGER principal_lifecycle_payload_immutable_v2 BEFORE UPDATE OR DELETE
ON orgmaster_core.principal_lifecycle_events_v2 FOR EACH ROW
EXECUTE FUNCTION orgmaster_core.reject_lifecycle_payload_mutation_v2();

CREATE VIEW orgmaster_contract.v_principal_lifecycle_events_v2 WITH (security_barrier=true) AS
SELECT 'orgmaster.principal-lifecycle.v2'::text AS contract_version,
       event_id::text, operation_id, source_revision, originating_principal_id,
       initiating_principal_id, reason_code, snapshot_text, snapshot_hash, created_at
FROM orgmaster_core.principal_lifecycle_events_v2;
CREATE VIEW orgmaster_contract.v_principal_lifecycle_targets_v2 WITH (security_barrier=true) AS
SELECT e.event_id::text, p.value->>'principalId' AS principal_id,
       p.value->>'employeeId' AS employee_id, p.value->>'accountType' AS account_type,
       pair.value->>'issuer' AS principal_issuer, pair.value->>'subject' AS principal_subject
FROM orgmaster_core.principal_lifecycle_events_v2 e
CROSS JOIN LATERAL jsonb_array_elements(e.snapshot_text::jsonb->'principals') p(value)
CROSS JOIN LATERAL jsonb_array_elements(p.value->'pairs') pair(value);

-- Block re-admission until the exact frozen Principal event has a verified
-- consumer receipt. Accounts, sessions and effective grants derive this view.
-- Preserve its column/version contract and all prior eligibility requirements.
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

ALTER VIEW orgmaster_contract.v_active_principal_mappings_v1 OWNER TO jenfu_orgmaster_migrator;


-- Intrinsic facts only: no pending-event gate, grants, scope, global version or
-- publication hash. All aliases are explicitly reserved to the same Principal.
CREATE FUNCTION orgmaster_core.read_principal_lifecycle_facts_v2()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
WITH governance AS (
  SELECT a.payload FROM orgmaster_core.persistence_authority authority
  JOIN orgmaster_core.persistence_batches b ON b.id=authority.active_batch_id AND b.status='active'
  JOIN orgmaster_core.persistence_artifacts a ON a.batch_id=b.id
   AND a.artifact_key='orgmaster-governance.v3.json' AND a.artifact_kind='governance'
  WHERE authority.singleton
), current_policy AS (
  SELECT v.value->'policy' AS policy FROM governance g
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(g.payload->'publishedVersions','[]'::jsonb)) v(value)
  WHERE v.value->>'id'=g.payload->>'activePolicyVersionId'
    AND v.value->>'kind'='assignment-governance-v3'
), governed AS (
  SELECT l.value->>'principalId' AS principal_id,
   jsonb_agg(jsonb_build_object('issuer',l.value->>'issuer','subject',l.value->>'subject',
     'linkStatus',l.value->>'status','admissionStatus',a.value->>'status','accountType',a.value->>'accountType')
     ORDER BY l.value->>'issuer',l.value->>'subject',l.value->>'status',a.value->>'status',a.value->>'accountType') AS links
  FROM current_policy p
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.policy->'identityLinks','[]'::jsonb)) l(value)
  LEFT JOIN LATERAL jsonb_array_elements(COALESCE(p.policy->'principalAdmissions','[]'::jsonb)) a(value)
    ON a.value->>'identityLinkId'=l.value->>'id'
  GROUP BY l.value->>'principalId'
)
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'principalId',o.principal_id,'employeeId',o.employee_id,'accountType',o.account_type,
  'facts',jsonb_build_object('employeeStatus',COALESCE(e.employee_status,'absent'),
    'governedLinks',COALESCE(g.links,'[]'::jsonb),
    'managed',CASE WHEN m.identity_record_id IS NULL THEN NULL ELSE jsonb_build_object(
       'linkState',m.link_state,'issuer',m.auth_issuer,'subject',m.auth_subject,
       'admissionEnabled',COALESCE(ad.admission_enabled,false),
       'directoryState',COALESCE(obs.directory_state,'unknown'),
       'primaryEmailMatches',lower(obs.primary_email)=lower(m.last_verified_primary_email)) END),
  'pairs',COALESCE((SELECT jsonb_agg(jsonb_build_object('issuer',r.principal_issuer,'subject',r.principal_subject)
     ORDER BY r.principal_issuer,r.principal_subject) FROM orgmaster_core.principal_identity_reservations r
     WHERE r.principal_id=o.principal_id),'[]'::jsonb)) ORDER BY o.principal_id),'[]'::jsonb)
FROM orgmaster_core.principal_ownership_reservations o
LEFT JOIN orgmaster_core.v_current_workspace_employees_v1 e ON e.employee_id=o.employee_id
LEFT JOIN governed g ON g.principal_id=o.principal_id
LEFT JOIN orgmaster_core.managed_daily_identities m ON m.principal_id=o.principal_id
LEFT JOIN orgmaster_core.managed_identity_admission_authority ad ON ad.singleton
LEFT JOIN orgmaster_core.managed_identity_observations obs ON obs.identity_record_id=m.identity_record_id;
$fn$;

CREATE FUNCTION orgmaster_core.enqueue_principal_lifecycle_v2(
  p_before jsonb,p_after jsonb,p_operation_id text,p_source_revision text,
  p_originating_principal_id text,p_initiating_principal_id text,p_reason_code text
) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE targets jsonb; payload text; event_id_value uuid:=public.gen_random_uuid(); existing record;
BEGIN
  WITH before_rows AS (SELECT v.value FROM jsonb_array_elements(p_before) v(value)),
       after_rows AS (SELECT v.value FROM jsonb_array_elements(p_after) v(value)),
       changed AS (
    SELECT COALESCE(a.value,b.value) AS identity,b.value AS previous,a.value AS current
    FROM before_rows b FULL JOIN after_rows a ON a.value->>'principalId'=b.value->>'principalId'
    WHERE b.value->'facts' IS DISTINCT FROM a.value->'facts'
  ) SELECT jsonb_agg(jsonb_build_object('principalId',c.identity->>'principalId',
     'employeeId',c.identity->>'employeeId','accountType',c.identity->>'accountType',
     'pairs',(SELECT COALESCE(jsonb_agg(pair ORDER BY pair->>'issuer',pair->>'subject'),'[]'::jsonb)
       FROM (SELECT DISTINCT value AS pair FROM jsonb_array_elements(
          COALESCE(c.previous->'pairs','[]'::jsonb)||COALESCE(c.current->'pairs','[]'::jsonb))) union_pairs))
     ORDER BY c.identity->>'principalId') INTO targets FROM changed c;
  IF targets IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(targets) t WHERE jsonb_array_length(t->'pairs')=0) THEN
    RAISE EXCEPTION 'LIFECYCLE_PRINCIPAL_PAIR_HISTORY_INCOMPLETE';
  END IF;
  SELECT * INTO existing FROM orgmaster_core.principal_lifecycle_events_v2 e WHERE e.operation_id=p_operation_id;
  IF FOUND THEN
    IF existing.source_revision IS DISTINCT FROM p_source_revision OR
       existing.originating_principal_id IS DISTINCT FROM p_originating_principal_id OR
       existing.initiating_principal_id IS DISTINCT FROM p_initiating_principal_id OR
       existing.reason_code IS DISTINCT FROM p_reason_code OR
       existing.snapshot_text::jsonb->'principals' IS DISTINCT FROM targets THEN
      RAISE EXCEPTION 'LIFECYCLE_OPERATION_CONFLICT';
    END IF;
    RETURN existing.event_id;
  END IF;
  payload:=jsonb_build_object('contractVersion','orgmaster.principal-lifecycle.v2','eventId',event_id_value::text,
    'operationId',p_operation_id,'sourceRevision',p_source_revision,'reasonCode',p_reason_code,
    'originatingPrincipalId',p_originating_principal_id,'initiatingPrincipalId',p_initiating_principal_id,
    'principals',targets)::text;
  INSERT INTO orgmaster_core.principal_lifecycle_events_v2
    (event_id,operation_id,source_revision,originating_principal_id,initiating_principal_id,reason_code,snapshot_text,snapshot_hash)
  VALUES(event_id_value,p_operation_id,p_source_revision,p_originating_principal_id,p_initiating_principal_id,
    p_reason_code,payload,encode(public.digest(payload,'sha256'),'hex'));
  INSERT INTO orgmaster_core.principal_lifecycle_delivery_v2(event_id) VALUES(event_id_value);
  RETURN event_id_value;
END;
$fn$;

CREATE FUNCTION orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v2(
  p_changes jsonb,p_source_revision text,p_updated_by text,p_reason_code text,p_operation_id text,
  p_entitlement_changes jsonb DEFAULT '[]'::jsonb
) RETURNS TABLE(authority_version bigint,source_revision text,outbox_count integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE before_facts jsonb; after_facts jsonb; before_employees jsonb; result record; lifecycle_id uuid; changed_employee record;
BEGIN
  PERFORM 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton FOR UPDATE;
  PERFORM 1 FROM orgmaster_core.persistence_authority WHERE singleton FOR UPDATE;
  IF p_updated_by IS NULL OR char_length(p_updated_by) NOT BETWEEN 1 AND 255 THEN RAISE EXCEPTION 'PRINCIPAL_ACTOR_REQUIRED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM orgmaster_contract.v_active_principal_accounts_v1 a WHERE a.principal_id=p_updated_by) THEN
    PERFORM orgmaster_core.assert_lifecycle_executor_v2(p_updated_by);
  END IF;
  before_facts:=orgmaster_core.read_principal_lifecycle_facts_v2();
  SELECT COALESCE(jsonb_object_agg(employee_id,employee_status),'{}'::jsonb) INTO before_employees
    FROM orgmaster_core.v_current_workspace_employees_v1;
  SELECT * INTO STRICT result FROM orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v1(
    p_changes,p_source_revision,p_updated_by,p_reason_code,p_operation_id,p_entitlement_changes);
  after_facts:=orgmaster_core.read_principal_lifecycle_facts_v2();
  lifecycle_id:=orgmaster_core.enqueue_principal_lifecycle_v2(before_facts,after_facts,p_operation_id,
    p_source_revision,p_updated_by,CASE WHEN EXISTS (SELECT 1 FROM orgmaster_core.principal_ownership_reservations
      WHERE principal_id=p_updated_by) THEN p_updated_by ELSE NULL END,p_reason_code);
  -- Domain demand also covers pending identities which do not yet have a
  -- human Principal reservation/provider pair. Never create a fake pair.
  FOR changed_employee IN WITH current_employees AS (
    SELECT employee_id,employee_status FROM orgmaster_core.v_current_workspace_employees_v1
  ), changed AS (
    SELECT COALESCE(current.employee_id,previous.key) AS employee_id
      FROM jsonb_each_text(before_employees) previous FULL JOIN current_employees current ON current.employee_id=previous.key
     WHERE current.employee_status IS DISTINCT FROM previous.value
    UNION
    SELECT COALESCE(a.value,b.value)->>'employeeId' FROM jsonb_array_elements(before_facts) b(value)
      FULL JOIN jsonb_array_elements(after_facts) a(value) ON a.value->>'principalId'=b.value->>'principalId'
     WHERE b.value->'facts' IS DISTINCT FROM a.value->'facts'
  ) SELECT DISTINCT changed.employee_id FROM changed
    JOIN orgmaster_core.managed_daily_identities m ON m.employee_id=changed.employee_id
  LOOP
    PERFORM orgmaster_core.enqueue_managed_identity_refresh_v1(changed_employee.employee_id,'domain',p_operation_id,p_updated_by);
  END LOOP;
  RETURN QUERY SELECT result.authority_version,result.source_revision,CASE WHEN lifecycle_id IS NULL THEN 0 ELSE 1 END;
END;
$fn$;

-- Freshness is the age of trusted facts, not the last HTTP outcome. A retry
-- never extends trusted_observed_at or immediately makes recent facts stale.
CREATE OR REPLACE FUNCTION orgmaster_core.read_employee_managed_identity_v1(p_employee_id text)
RETURNS TABLE(employee_id text, employee_status text, employee_number text, identity_record_id uuid, identity_state text, primary_email text, directory_state text, freshness text, registry_revision bigint, admission_enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 SELECT e.employee_id,e.employee_status,a.employee_number,i.identity_record_id,
   COALESCE(i.link_state,'not_linked'),i.last_verified_primary_email,o.directory_state,
   CASE WHEN o.trusted_observed_at IS NULL THEN 'unknown'
     WHEN o.trusted_observed_at<=clock_timestamp()-CASE
       WHEN e.employee_status='inactive' AND i.link_state<>'directory_linked_pending_auth'
         AND o.directory_state IN ('missing','suspended','archived')
         AND NOT (o.primary_email IS NOT NULL AND lower(o.primary_email) IS DISTINCT FROM lower(i.last_verified_primary_email)) THEN interval '25 hours'
       ELSE interval '30 minutes' END THEN 'stale' ELSE 'fresh' END,
   COALESCE(a.revision,0),aa.admission_enabled
 FROM orgmaster_core.v_current_workspace_employees_v1 e
 LEFT JOIN orgmaster_core.employee_number_assignments a ON a.employee_id=e.employee_id
 LEFT JOIN orgmaster_core.managed_daily_identities i ON i.employee_id=e.employee_id
 LEFT JOIN orgmaster_core.managed_identity_observations o ON o.identity_record_id=i.identity_record_id
 CROSS JOIN orgmaster_core.managed_identity_admission_authority aa
 WHERE e.employee_id=p_employee_id AND aa.singleton;
$fn$;

-- Reuse the existing shared lock: background grants cannot bypass interactive
-- grants. Both windows are charged atomically before a claim consumes attempts.
ALTER TABLE orgmaster_core.managed_identity_directory_read_budget
  ADD COLUMN background_granted_at timestamptz[] NOT NULL DEFAULT '{}'::timestamptz[]
  CHECK (cardinality(background_granted_at)<=40);
CREATE FUNCTION orgmaster_core.enqueue_due_managed_identity_refresh_v2(p_executor text)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE item record; count_value integer:=0;
BEGIN
  p_executor:=orgmaster_core.assert_lifecycle_executor_v2(p_executor);
  PERFORM 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton FOR UPDATE;
  FOR item IN SELECT i.employee_id FROM orgmaster_core.managed_daily_identities i
    LEFT JOIN orgmaster_core.v_current_workspace_employees_v1 e ON e.employee_id=i.employee_id
    LEFT JOIN orgmaster_core.managed_identity_observations o ON o.identity_record_id=i.identity_record_id
    WHERE (o.trusted_observed_at IS NULL OR o.trusted_observed_at<=clock_timestamp()-CASE
      WHEN e.employee_id IS NULL OR e.employee_status='active' OR i.link_state='directory_linked_pending_auth' OR
           (COALESCE(e.employee_status='active',false) IS DISTINCT FROM (o.directory_state='present')) OR
           (o.primary_email IS NOT NULL AND lower(o.primary_email) IS DISTINCT FROM lower(i.last_verified_primary_email)) OR o.directory_state='unknown'
      THEN interval '15 minutes' ELSE interval '24 hours' END)
      AND NOT EXISTS (SELECT 1 FROM orgmaster_core.managed_identity_refresh_outbox q
         WHERE q.identity_record_id=i.identity_record_id AND q.state IN ('queued','retry','leased'))
    ORDER BY o.trusted_observed_at NULLS FIRST,i.identity_record_id LIMIT 500
  LOOP
    PERFORM orgmaster_core.enqueue_managed_identity_refresh_v1(item.employee_id,'periodic',NULL,p_executor);
    count_value:=count_value+1;
  END LOOP;
  RETURN count_value;
END;
$fn$;

CREATE FUNCTION orgmaster_core.claim_managed_identity_refresh_v2(p_executor text,p_lease_id uuid,p_limit integer)
RETURNS TABLE(claim_kind text,request_id uuid,attempt_count integer,lease_generation bigint,directory_customer_id text,directory_user_id text,retry_after_milliseconds integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE budget orgmaster_core.managed_identity_directory_read_budget%ROWTYPE; item record; granted timestamptz[];
  background timestamptz[]; now_value timestamptz; slots integer; lease_slots integer; terminal_row record;
  leased_count integer:=0; quota_ready_at timestamptz;
BEGIN
  p_executor:=orgmaster_core.assert_lifecycle_executor_v2(p_executor);
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 2 OR p_lease_id IS NULL THEN RAISE EXCEPTION 'MANAGED_REFRESH_CLAIM_INVALID'; END IF;
  PERFORM 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton FOR UPDATE;
  SELECT * INTO STRICT budget FROM orgmaster_core.managed_identity_directory_read_budget WHERE singleton FOR UPDATE;
  now_value:=clock_timestamp();
  FOR terminal_row IN UPDATE orgmaster_core.managed_identity_refresh_outbox q
    SET state='dead',completion_disposition='terminal',lease_worker_id=NULL,lease_until=NULL,
      completed_at=now_value,updated_at=now_value,last_error_code='ATTEMPTS_EXHAUSTED'
    WHERE q.state='leased' AND q.lease_until<=now_value AND q.attempt_count>=5 RETURNING q.*
  LOOP
    IF terminal_row.rerun_requested THEN
      INSERT INTO orgmaster_core.managed_identity_refresh_outbox(identity_record_id,trigger,state,request_sequence,available_at)
       VALUES(terminal_row.identity_record_id,'domain','queued',nextval('orgmaster_core.managed_identity_refresh_request_seq'),now_value+interval '30 seconds');
    END IF;
    RETURN QUERY SELECT 'terminalized',terminal_row.request_id,5,0::bigint,NULL::text,NULL::text,NULL::integer;
  END LOOP;
  SELECT COALESCE(array_agg(t ORDER BY t),'{}'::timestamptz[]) INTO granted
    FROM unnest(budget.granted_at) t WHERE t>now_value-interval '60 seconds';
  SELECT COALESCE(array_agg(t ORDER BY t),'{}'::timestamptz[]) INTO background
    FROM unnest(budget.background_granted_at) t WHERE t>now_value-interval '60 seconds';
  SELECT GREATEST(0,2-count(*)::integer) INTO lease_slots FROM orgmaster_core.managed_identity_refresh_outbox q
    WHERE q.state='leased' AND q.lease_until>now_value;
  slots:=LEAST(lease_slots,p_limit,60-cardinality(granted),40-cardinality(background));
  FOR item IN SELECT q.request_id FROM orgmaster_core.managed_identity_refresh_outbox q
    WHERE (q.state IN ('queued','retry') OR (q.state='leased' AND q.lease_until<=now_value))
      AND q.available_at<=now_value AND q.attempt_count<5
    ORDER BY q.request_sequence FOR UPDATE SKIP LOCKED LIMIT slots
  LOOP
    leased_count:=leased_count+1;
    granted:=array_append(granted,now_value); background:=array_append(background,now_value);
    RETURN QUERY WITH claimed AS (
      UPDATE orgmaster_core.managed_identity_refresh_outbox q SET state='leased',attempt_count=q.attempt_count+1,
        lease_version=q.lease_version+1,lease_worker_id=p_lease_id::text,lease_until=now_value+interval '60 seconds',updated_at=now_value
      WHERE q.request_id=item.request_id RETURNING q.*
    ) SELECT 'leased',c.request_id,c.attempt_count,c.lease_version,i.directory_customer_id,i.directory_user_id
      ,NULL::integer FROM claimed c JOIN orgmaster_core.managed_daily_identities i ON i.identity_record_id=c.identity_record_id;
  END LOOP;
  UPDATE orgmaster_core.managed_identity_directory_read_budget SET granted_at=granted,background_granted_at=background WHERE singleton;
  -- A rolling window may still contain late grants from the preceding minute.
  -- Distinguish queued demand waiting for quota from an empty queue. No lease,
  -- attempt or Directory grant is consumed by this hint; live-lease contention
  -- exits instead of making duplicate workers wait for each other.
  IF leased_count=0 AND lease_slots>0 AND
      (cardinality(granted)>=60 OR cardinality(background)>=40) AND EXISTS (
        SELECT 1 FROM orgmaster_core.managed_identity_refresh_outbox q
        WHERE (q.state IN ('queued','retry') OR (q.state='leased' AND q.lease_until<=now_value))
          AND q.available_at<=now_value AND q.attempt_count<5
      ) THEN
    quota_ready_at:=GREATEST(
      CASE WHEN cardinality(granted)>=60 THEN granted[1]+interval '60 seconds' ELSE now_value END,
      CASE WHEN cardinality(background)>=40 THEN background[1]+interval '60 seconds' ELSE now_value END);
    RETURN QUERY SELECT 'quota_wait',NULL::uuid,NULL::integer,NULL::bigint,NULL::text,NULL::text,
      GREATEST(1,ceil(extract(epoch FROM quota_ready_at-now_value)*1000)::integer);
  END IF;
END;
$fn$;

CREATE FUNCTION orgmaster_core.complete_managed_identity_refresh_v2(
 p_executor text,p_lease_id uuid,p_request_id uuid,p_generation bigint,p_directory_state text,p_primary_email text,p_source_etag text
) RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE q orgmaster_core.managed_identity_refresh_outbox%ROWTYPE; identity_row orgmaster_core.managed_daily_identities%ROWTYPE;
 before_facts jsonb; after_facts jsonb; source_value text; next_state text; result_value text;
BEGIN
  p_executor:=orgmaster_core.assert_lifecycle_executor_v2(p_executor);
  IF p_directory_state IS NULL OR p_directory_state NOT IN ('present','suspended','archived','missing') OR
     (p_directory_state<>'missing' AND nullif(trim(p_primary_email),'') IS NULL) THEN
    RAISE EXCEPTION 'MANAGED_DIRECTORY_OBSERVATION_INVALID';
  END IF;
  PERFORM 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton FOR UPDATE;
  PERFORM 1 FROM orgmaster_core.persistence_authority WHERE singleton FOR UPDATE;
  SELECT trim(a.source_revision) INTO STRICT source_value FROM orgmaster_core.read_active_persistence_authority_v1() a;
  SELECT * INTO q FROM orgmaster_core.managed_identity_refresh_outbox r WHERE r.request_id=p_request_id
    AND r.state='leased' AND r.lease_worker_id=p_lease_id::text AND r.lease_version=p_generation
    FOR UPDATE;
  IF NOT FOUND OR q.lease_until IS NULL OR q.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'MANAGED_IDENTITY_REFRESH_LEASE_CONFLICT'; END IF;
  SELECT * INTO STRICT identity_row FROM orgmaster_core.managed_daily_identities i WHERE i.identity_record_id=q.identity_record_id FOR UPDATE;
  result_value:=CASE WHEN q.rerun_requested OR EXISTS (SELECT 1 FROM orgmaster_core.managed_identity_observations o
      WHERE o.identity_record_id=q.identity_record_id AND o.last_applied_request_sequence>=q.request_sequence)
    THEN 'superseded' ELSE 'applied' END;
  IF result_value='applied' THEN
    before_facts:=orgmaster_core.read_principal_lifecycle_facts_v2();
    next_state:=CASE WHEN p_directory_state<>'present' OR lower(p_primary_email) IS DISTINCT FROM lower(identity_row.last_verified_primary_email)
      THEN 'conflict' ELSE identity_row.link_state END;
    IF next_state IS DISTINCT FROM identity_row.link_state THEN
      UPDATE orgmaster_core.managed_daily_identities SET link_state=next_state,revision=revision+1,
        admission_revision=nextval('orgmaster_core.managed_identity_mapping_version_seq'),admission_changed_at=clock_timestamp(),
        updated_at=clock_timestamp(),updated_by=p_executor WHERE identity_record_id=q.identity_record_id;
    END IF;
    INSERT INTO orgmaster_core.managed_identity_observations
      (identity_record_id,primary_email,directory_state,source_etag,last_applied_request_sequence,adapter_outcome,trusted_observed_at,last_attempt_at,freshness)
    VALUES(q.identity_record_id,p_primary_email,p_directory_state,p_source_etag,q.request_sequence,
      CASE WHEN p_directory_state='missing' THEN 'not_found' ELSE 'success' END,clock_timestamp(),clock_timestamp(),'fresh')
    ON CONFLICT ON CONSTRAINT managed_identity_observations_pkey DO UPDATE SET
      primary_email=EXCLUDED.primary_email,directory_state=EXCLUDED.directory_state,source_etag=EXCLUDED.source_etag,
      last_applied_request_sequence=EXCLUDED.last_applied_request_sequence,adapter_outcome=EXCLUDED.adapter_outcome,
      trusted_observed_at=EXCLUDED.trusted_observed_at,last_attempt_at=EXCLUDED.last_attempt_at,freshness='fresh',error_code=NULL;
    after_facts:=orgmaster_core.read_principal_lifecycle_facts_v2();
    PERFORM orgmaster_core.enqueue_principal_lifecycle_v2(before_facts,after_facts,'managed-refresh:'||p_request_id::text,
       source_value,p_executor,NULL,'managed_directory_observation_changed');
    INSERT INTO orgmaster_core.managed_identity_audit_events(command_id,action,actor,employee_id,identity_record_id,result,reason_code,details)
    VALUES(p_request_id::text,'managed_identity_refresh_v2',p_executor,identity_row.employee_id,q.identity_record_id,'applied',
      'managed_directory_observation_changed',jsonb_build_object('requestSequence',q.request_sequence,'leaseGeneration',p_generation,'directoryState',p_directory_state));
  END IF;
  UPDATE orgmaster_core.managed_identity_refresh_outbox SET state='completed',completion_disposition=result_value,
    lease_worker_id=NULL,lease_until=NULL,completed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE request_id=p_request_id;
  IF q.rerun_requested THEN
    PERFORM orgmaster_core.enqueue_managed_identity_refresh_v1(identity_row.employee_id,'domain',NULL,p_executor);
  END IF;
  RETURN result_value;
END;
$fn$;

CREATE FUNCTION orgmaster_core.retry_managed_identity_refresh_v2(
 p_executor text,p_lease_id uuid,p_request_id uuid,p_generation bigint,p_error_code text
) RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE q orgmaster_core.managed_identity_refresh_outbox%ROWTYPE; next_state text;
BEGIN
  p_executor:=orgmaster_core.assert_lifecycle_executor_v2(p_executor);
  IF p_error_code IS NULL OR p_error_code NOT IN ('TIMEOUT','RATE_LIMITED','DIRECTORY_READ_UNAVAILABLE','DIRECTORY_PERMANENT_ERROR') THEN
    RAISE EXCEPTION 'MANAGED_REFRESH_RETRY_INVALID';
  END IF;
  PERFORM 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton FOR UPDATE;
  SELECT * INTO q FROM orgmaster_core.managed_identity_refresh_outbox r WHERE r.request_id=p_request_id
    AND r.state='leased' AND r.lease_worker_id=p_lease_id::text AND r.lease_version=p_generation
    FOR UPDATE;
  IF NOT FOUND OR q.lease_until IS NULL OR q.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'MANAGED_IDENTITY_REFRESH_LEASE_CONFLICT'; END IF;
  next_state:=CASE WHEN q.attempt_count>=5 OR p_error_code='DIRECTORY_PERMANENT_ERROR' THEN 'dead' ELSE 'retry' END;
  UPDATE orgmaster_core.managed_identity_refresh_outbox SET state=next_state,last_error_code=p_error_code,
    lease_worker_id=NULL,lease_until=NULL,completion_disposition=CASE WHEN next_state='dead' THEN 'terminal' ELSE NULL END,
    available_at=clock_timestamp()+make_interval(secs=>LEAST(60,power(2,GREATEST(0,q.attempt_count-1)))+random()),
    completed_at=CASE WHEN next_state='dead' THEN clock_timestamp() ELSE NULL END,updated_at=clock_timestamp() WHERE request_id=p_request_id;
  UPDATE orgmaster_core.managed_identity_observations SET last_attempt_at=clock_timestamp(),error_code=p_error_code
    WHERE identity_record_id=q.identity_record_id;
  IF next_state='dead' AND q.rerun_requested THEN
    INSERT INTO orgmaster_core.managed_identity_refresh_outbox(identity_record_id,trigger,state,request_sequence,available_at)
      VALUES(q.identity_record_id,'domain','queued',nextval('orgmaster_core.managed_identity_refresh_request_seq'),clock_timestamp()+interval '30 seconds');
  END IF;
  RETURN CASE WHEN next_state='dead' THEN 'terminal' ELSE 'retry' END;
END;
$fn$;

CREATE FUNCTION orgmaster_core.claim_principal_lifecycle_v2(p_executor text,p_lease_id uuid,p_limit integer)
RETURNS TABLE(event_id uuid,operation_id text,source_revision text,snapshot_hash text,lease_generation bigint)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  p_executor:=orgmaster_core.assert_lifecycle_executor_v2(p_executor);
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 2 OR p_lease_id IS NULL THEN RAISE EXCEPTION 'MANAGED_LIFECYCLE_CLAIM_INVALID'; END IF;
  UPDATE orgmaster_core.principal_lifecycle_delivery_v2 SET status='blocked',lease_id=NULL,lease_until=NULL,
    last_error_code='ATTEMPTS_EXHAUSTED' WHERE status='processing' AND lease_until<=clock_timestamp() AND attempt_count>=5;
  RETURN QUERY WITH candidates AS (
    SELECT q.event_id FROM orgmaster_core.principal_lifecycle_delivery_v2 q
    WHERE (q.status='pending' OR (q.status='processing' AND q.lease_until<=clock_timestamp()))
      AND q.next_attempt_at<=clock_timestamp() AND q.attempt_count<5
    ORDER BY q.next_attempt_at,q.event_id FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), claimed AS (
    UPDATE orgmaster_core.principal_lifecycle_delivery_v2 q SET status='processing',attempt_count=q.attempt_count+1,
      lease_generation=q.lease_generation+1,lease_id=p_lease_id,lease_until=clock_timestamp()+interval '60 seconds'
    FROM candidates c WHERE q.event_id=c.event_id RETURNING q.event_id,q.lease_generation
  ) SELECT e.event_id,e.operation_id,e.source_revision,trim(e.snapshot_hash),c.lease_generation
    FROM claimed c JOIN orgmaster_core.principal_lifecycle_events_v2 e ON e.event_id=c.event_id;
END;
$fn$;

CREATE FUNCTION orgmaster_core.complete_principal_lifecycle_v2(p_executor text,p_lease_id uuid,p_event_id uuid,p_generation bigint,p_receipt_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE event_row orgmaster_core.principal_lifecycle_events_v2%ROWTYPE; consumer text; locked_lease_until timestamptz;
BEGIN
  p_executor:=orgmaster_core.assert_lifecycle_executor_v2(p_executor);
  SELECT q.lease_until INTO locked_lease_until FROM orgmaster_core.principal_lifecycle_delivery_v2 q WHERE q.event_id=p_event_id
    AND q.status='processing' AND q.lease_id=p_lease_id AND q.lease_generation=p_generation FOR UPDATE;
  IF NOT FOUND OR locked_lease_until IS NULL OR locked_lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'MANAGED_LIFECYCLE_LEASE_CONFLICT'; END IF;
  SELECT * INTO STRICT event_row FROM orgmaster_core.principal_lifecycle_events_v2 WHERE event_id=p_event_id;
  SELECT principal_id INTO STRICT consumer FROM orgmaster_core.workload_principal_bindings
    WHERE owner='platform' AND purpose='principal-lifecycle-invalidation' AND enabled;
  IF NOT EXISTS (SELECT 1 FROM platform_contract.v_principal_lifecycle_receipts_v2 r
    WHERE r.contract_version='platform.principal-lifecycle-receipt.v2' AND r.receipt_id=p_receipt_id::text
      AND r.event_id=p_event_id::text AND r.operation_id=event_row.operation_id AND r.source_revision=event_row.source_revision
      AND r.snapshot_hash=event_row.snapshot_hash AND r.delivery_principal_id=p_executor
      AND r.executor_principal_id=consumer AND r.principal_only) THEN RAISE EXCEPTION 'MANAGED_LIFECYCLE_RECEIPT_INVALID'; END IF;
  UPDATE orgmaster_core.principal_lifecycle_delivery_v2 SET status='completed',receipt_id=p_receipt_id,
    lease_id=NULL,lease_until=NULL,completed_at=clock_timestamp(),last_error_code=NULL WHERE event_id=p_event_id;
END;
$fn$;

CREATE FUNCTION orgmaster_core.retry_principal_lifecycle_v2(p_executor text,p_lease_id uuid,p_event_id uuid,p_generation bigint,p_error_code text)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE attempts integer; next_state text; locked_lease_until timestamptz;
BEGIN
  p_executor:=orgmaster_core.assert_lifecycle_executor_v2(p_executor);
  IF p_error_code IS NULL OR p_error_code NOT IN ('DISPATCH_UNAVAILABLE','RECEIPT_CONTRACT_INVALID','COMPLETION_UNAVAILABLE') THEN
    RAISE EXCEPTION 'MANAGED_LIFECYCLE_RETRY_INVALID';
  END IF;
  SELECT q.attempt_count,q.lease_until INTO attempts,locked_lease_until FROM orgmaster_core.principal_lifecycle_delivery_v2 q WHERE q.event_id=p_event_id
    AND q.status='processing' AND q.lease_id=p_lease_id AND q.lease_generation=p_generation FOR UPDATE;
  IF NOT FOUND OR locked_lease_until IS NULL OR locked_lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'MANAGED_LIFECYCLE_LEASE_CONFLICT'; END IF;
  next_state:=CASE WHEN attempts>=5 OR p_error_code='RECEIPT_CONTRACT_INVALID' THEN 'blocked' ELSE 'pending' END;
  UPDATE orgmaster_core.principal_lifecycle_delivery_v2 SET status=next_state,last_error_code=p_error_code,
    lease_id=NULL,lease_until=NULL,next_attempt_at=clock_timestamp()+make_interval(secs=>LEAST(60,power(2,attempts)::integer)) WHERE event_id=p_event_id;
  RETURN CASE WHEN next_state='blocked' THEN 'blocked' ELSE 'retry' END;
END;
$fn$;

-- New table/view/function ownership and exact ACL. Private payload helpers are
-- not executable by runtime; callers cannot submit their own frozen targets.
DO $acl$
DECLARE name text; signature text;
BEGIN
  FOREACH name IN ARRAY ARRAY['workload_principal_bindings','principal_lifecycle_events_v2','principal_lifecycle_delivery_v2'] LOOP
    EXECUTE format('ALTER TABLE orgmaster_core.%I OWNER TO jenfu_orgmaster_migrator',name);
    EXECUTE format('REVOKE ALL ON orgmaster_core.%I FROM PUBLIC,jenfu_orgmaster_runtime,jenfu_platform_runtime,jenfu_ai_pdm_runtime',name);
  END LOOP;
  FOREACH name IN ARRAY ARRAY['v_workload_principals_v1','v_principal_lifecycle_events_v2','v_principal_lifecycle_targets_v2'] LOOP
    EXECUTE format('ALTER VIEW orgmaster_contract.%I OWNER TO jenfu_orgmaster_migrator',name);
    EXECUTE format('REVOKE ALL ON orgmaster_contract.%I FROM PUBLIC,jenfu_orgmaster_runtime,jenfu_platform_runtime,jenfu_ai_pdm_runtime',name);
  END LOOP;
  FOREACH signature IN ARRAY ARRAY[
    'assert_lifecycle_executor_v2(text)','reject_lifecycle_payload_mutation_v2()',
    'read_principal_lifecycle_facts_v2()','enqueue_principal_lifecycle_v2(jsonb,jsonb,text,text,text,text,text)',
    'write_active_persistence_artifacts_with_identity_fence_v2(jsonb,text,text,text,text,jsonb)',
    'enqueue_due_managed_identity_refresh_v2(text)','claim_managed_identity_refresh_v2(text,uuid,integer)',
    'complete_managed_identity_refresh_v2(text,uuid,uuid,bigint,text,text,text)',
    'retry_managed_identity_refresh_v2(text,uuid,uuid,bigint,text)','claim_principal_lifecycle_v2(text,uuid,integer)',
    'complete_principal_lifecycle_v2(text,uuid,uuid,bigint,uuid)','retry_principal_lifecycle_v2(text,uuid,uuid,bigint,text)'
  ] LOOP
    EXECUTE 'ALTER FUNCTION orgmaster_core.'||signature||' OWNER TO jenfu_orgmaster_migrator';
    EXECUTE 'REVOKE ALL ON FUNCTION orgmaster_core.'||signature||' FROM PUBLIC,jenfu_orgmaster_runtime,jenfu_platform_runtime,jenfu_ai_pdm_runtime';
  END LOOP;
END;
$acl$;
GRANT SELECT ON orgmaster_contract.v_workload_principals_v1 TO jenfu_orgmaster_runtime,jenfu_platform_runtime,jenfu_platform_migrator;
GRANT SELECT ON orgmaster_contract.v_principal_lifecycle_events_v2,orgmaster_contract.v_principal_lifecycle_targets_v2 TO jenfu_platform_migrator;
GRANT EXECUTE ON FUNCTION
  orgmaster_core.assert_lifecycle_executor_v2(text),
  orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v2(jsonb,text,text,text,text,jsonb),
  orgmaster_core.enqueue_due_managed_identity_refresh_v2(text),
  orgmaster_core.claim_managed_identity_refresh_v2(text,uuid,integer),
  orgmaster_core.complete_managed_identity_refresh_v2(text,uuid,uuid,bigint,text,text,text),
  orgmaster_core.retry_managed_identity_refresh_v2(text,uuid,uuid,bigint,text),
  orgmaster_core.claim_principal_lifecycle_v2(text,uuid,integer),
  orgmaster_core.complete_principal_lifecycle_v2(text,uuid,uuid,bigint,uuid),
  orgmaster_core.retry_principal_lifecycle_v2(text,uuid,uuid,bigint,text)
TO jenfu_orgmaster_runtime;

-- Normal product artifact callers now use the verified-Principal v2 writer.
-- Historical ownership checks remain private to its SECURITY DEFINER chain;
-- a runtime cannot bypass frozen lifecycle enqueue through an older writer.
REVOKE EXECUTE ON FUNCTION
 orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v1(jsonb,text,text,text,text,jsonb),
 orgmaster_core.write_active_persistence_artifacts_v1(jsonb,text,text,text)
FROM PUBLIC,jenfu_orgmaster_runtime,jenfu_platform_runtime,jenfu_ai_pdm_runtime;

-- Retire the old worker public surface. Owner-internal enqueue reuse is
-- private implementation; a runtime cannot select the v1 worker-label actor.
REVOKE EXECUTE ON FUNCTION
 orgmaster_core.claim_managed_identity_refresh_v1(text,integer,integer),
 orgmaster_core.complete_managed_identity_refresh_v1(uuid,text,bigint,text,text,text,text,text,text),
 orgmaster_core.retry_managed_identity_refresh_v1(uuid,text,bigint,text)
FROM PUBLIC,jenfu_orgmaster_runtime,jenfu_platform_runtime,jenfu_ai_pdm_runtime;


-- New versioned interface declarations; historical v1 entries are untouched.
INSERT INTO orgmaster_core.contract_manifest(contract_id,contract_version,signature_sha256,payload_sha256)
VALUES
 ('orgmaster.workload-principals.v1','orgmaster.workload-principals.v1','83b4ddecc6a5315952e3ec5d7bbe30894e588b24f9731a5dcdcda4f1ddbecf03',NULL),
 ('orgmaster.principal-lifecycle.v2','orgmaster.principal-lifecycle.v2','8d714f78e025eed9e3a067ee567f3c08607602943a60f9483fd0b973cf63a6cb',NULL)
ON CONFLICT(contract_id) DO NOTHING;
DO $manifest$
BEGIN
 IF  NOT EXISTS(SELECT 1 FROM orgmaster_core.contract_manifest WHERE contract_id='orgmaster.workload-principals.v1' AND contract_version='orgmaster.workload-principals.v1' AND signature_sha256='83b4ddecc6a5315952e3ec5d7bbe30894e588b24f9731a5dcdcda4f1ddbecf03' AND payload_sha256 IS NULL) OR
 NOT EXISTS(SELECT 1 FROM orgmaster_core.contract_manifest WHERE contract_id='orgmaster.principal-lifecycle.v2' AND contract_version='orgmaster.principal-lifecycle.v2' AND signature_sha256='8d714f78e025eed9e3a067ee567f3c08607602943a60f9483fd0b973cf63a6cb' AND payload_sha256 IS NULL) THEN RAISE EXCEPTION 'LIFECYCLE_V2_CONTRACT_MANIFEST_DRIFT'; END IF;
END;
$manifest$;
COMMIT;
