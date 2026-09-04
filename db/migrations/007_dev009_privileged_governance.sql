-- DEV-009 S1: provider-authenticated re-auth time and a redacted privileged
-- security alert delivery queue. Governance V3 remains the only assignment
-- authority; the existing entitlement_change_outbox remains the session
-- invalidation queue. This additive migration is replay-safe.
BEGIN;

SET LOCAL ROLE jenfu_platform_migrator;

ALTER TABLE orgmaster.app_sessions
  ADD COLUMN IF NOT EXISTS authenticated_at timestamptz NULL;

CREATE TABLE IF NOT EXISTS orgmaster.privileged_security_alert_intents (
  alert_reference text PRIMARY KEY,
  command_id text NOT NULL UNIQUE,
  operation text NOT NULL CHECK (operation IN ('grant_system_admin', 'revoke_system_admin')),
  actor_principal_id text NOT NULL,
  employee_id text NOT NULL,
  target_hint text NOT NULL,
  audit_reference text NOT NULL,
  reason_sha256 char(64) NOT NULL CHECK (reason_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('pending', 'processing', 'delivered', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL,
  lease_until timestamptz NULL,
  worker_id text NULL,
  last_error_code text NULL,
  created_at timestamptz NOT NULL,
  delivered_at timestamptz NULL,
  CHECK (char_length(alert_reference) BETWEEN 1 AND 255),
  CHECK (char_length(command_id) BETWEEN 1 AND 255),
  CHECK (char_length(actor_principal_id) BETWEEN 1 AND 255),
  CHECK (char_length(employee_id) BETWEEN 1 AND 255),
  CHECK (char_length(target_hint) BETWEEN 1 AND 128 AND position('@' IN target_hint) = 0),
  CHECK (char_length(audit_reference) BETWEEN 1 AND 255),
  CHECK (worker_id IS NULL OR char_length(worker_id) BETWEEN 1 AND 128),
  CHECK (last_error_code IS NULL OR char_length(last_error_code) BETWEEN 1 AND 128)
);

CREATE INDEX IF NOT EXISTS privileged_security_alert_intents_due_idx
  ON orgmaster.privileged_security_alert_intents (next_attempt_at, created_at)
  WHERE status IN ('pending', 'processing', 'failed');

CREATE TABLE IF NOT EXISTS orgmaster.privileged_security_alert_delivery_receipts (
  receipt_id uuid PRIMARY KEY,
  alert_reference text NOT NULL UNIQUE REFERENCES orgmaster.privileged_security_alert_intents(alert_reference) ON DELETE RESTRICT,
  provider_receipt_sha256 char(64) NOT NULL CHECK (provider_receipt_sha256 ~ '^[a-f0-9]{64}$'),
  delivered_at timestamptz NOT NULL
);

CREATE OR REPLACE FUNCTION orgmaster.capture_privileged_security_alert_intents_v1()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_alert jsonb;
  v_existing orgmaster.privileged_security_alert_intents%ROWTYPE;
BEGIN
  IF NEW.artifact_kind <> 'governance' OR NEW.artifact_key <> 'orgmaster-governance.v3.json' THEN
    RETURN NEW;
  END IF;
  IF jsonb_typeof(COALESCE(NEW.payload->'securityAlertIntents', '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'SECURITY_ALERT_PERSIST_FAILED' USING ERRCODE = '22023';
  END IF;

  FOR v_alert IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.payload->'securityAlertIntents', '[]'::jsonb))
  LOOP
    IF COALESCE(v_alert->>'id', '') = ''
      OR COALESCE(v_alert->>'commandId', '') = ''
      OR v_alert->>'operation' NOT IN ('grant_system_admin', 'revoke_system_admin')
      OR COALESCE(v_alert->>'actorPrincipalId', '') = ''
      OR COALESCE(v_alert->>'employeeId', '') = ''
      OR COALESCE(v_alert->>'targetHint', '') = ''
      OR position('@' IN COALESCE(v_alert->>'targetHint', '')) > 0
      OR COALESCE(v_alert->>'auditReference', '') = ''
      OR COALESCE(v_alert->>'reasonSha256', '') !~ '^[a-f0-9]{64}$'
      OR v_alert->>'status' NOT IN ('pending', 'delivered', 'failed')
      OR COALESCE(v_alert->>'createdAt', '') = '' THEN
      RAISE EXCEPTION 'SECURITY_ALERT_PERSIST_FAILED' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_existing
    FROM orgmaster.privileged_security_alert_intents AS intent
    WHERE intent.alert_reference = v_alert->>'id' OR intent.command_id = v_alert->>'commandId';
    IF FOUND THEN
      IF v_existing.alert_reference <> v_alert->>'id'
        OR v_existing.command_id <> v_alert->>'commandId'
        OR v_existing.operation <> v_alert->>'operation'
        OR v_existing.actor_principal_id <> v_alert->>'actorPrincipalId'
        OR v_existing.employee_id <> v_alert->>'employeeId'
        OR v_existing.target_hint <> v_alert->>'targetHint'
        OR v_existing.audit_reference <> v_alert->>'auditReference'
        OR v_existing.reason_sha256 <> v_alert->>'reasonSha256' THEN
        RAISE EXCEPTION 'SECURITY_ALERT_COMMAND_REUSED' USING ERRCODE = '23505';
      END IF;
      CONTINUE;
    END IF;

    INSERT INTO orgmaster.privileged_security_alert_intents (
      alert_reference, command_id, operation, actor_principal_id, employee_id,
      target_hint, audit_reference, reason_sha256, status, next_attempt_at, created_at
    ) VALUES (
      v_alert->>'id', v_alert->>'commandId', v_alert->>'operation',
      v_alert->>'actorPrincipalId', v_alert->>'employeeId', v_alert->>'targetHint',
      v_alert->>'auditReference', v_alert->>'reasonSha256', 'pending',
      clock_timestamp(), (v_alert->>'createdAt')::timestamptz
    );
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM IN ('SECURITY_ALERT_PERSIST_FAILED', 'SECURITY_ALERT_COMMAND_REUSED') THEN RAISE; END IF;
  RAISE EXCEPTION 'SECURITY_ALERT_PERSIST_FAILED' USING ERRCODE = '22023';
END;
$function$;

DROP TRIGGER IF EXISTS persistence_artifact_privileged_alert_v1 ON orgmaster.persistence_artifacts;
CREATE TRIGGER persistence_artifact_privileged_alert_v1
AFTER INSERT ON orgmaster.persistence_artifacts
FOR EACH ROW EXECUTE FUNCTION orgmaster.capture_privileged_security_alert_intents_v1();

CREATE OR REPLACE FUNCTION orgmaster.claim_privileged_security_alerts_v1(
  p_worker_id text,
  p_limit integer DEFAULT 20,
  p_lease_seconds integer DEFAULT 60
)
RETURNS SETOF orgmaster.privileged_security_alert_intents
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF char_length(btrim(p_worker_id)) NOT BETWEEN 1 AND 128 OR p_limit NOT BETWEEN 1 AND 100 OR p_lease_seconds NOT BETWEEN 5 AND 600 THEN
    RAISE EXCEPTION 'SECURITY_ALERT_CLAIM_INVALID' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT intent.alert_reference
    FROM orgmaster.privileged_security_alert_intents AS intent
    WHERE intent.status IN ('pending', 'failed')
      OR (intent.status = 'processing' AND intent.lease_until < clock_timestamp())
    ORDER BY intent.next_attempt_at, intent.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE orgmaster.privileged_security_alert_intents AS intent
  SET status = 'processing', attempt_count = intent.attempt_count + 1,
      worker_id = btrim(p_worker_id), lease_until = clock_timestamp() + make_interval(secs => p_lease_seconds)
  FROM candidates
  WHERE intent.alert_reference = candidates.alert_reference
  RETURNING intent.*;
END;
$function$;

CREATE OR REPLACE FUNCTION orgmaster.complete_privileged_security_alert_v1(
  p_alert_reference text,
  p_worker_id text,
  p_provider_receipt_sha256 text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_receipt uuid;
BEGIN
  IF p_provider_receipt_sha256 !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'SECURITY_ALERT_RECEIPT_INVALID' USING ERRCODE = '22023'; END IF;
  SELECT receipt.receipt_id INTO v_receipt
  FROM orgmaster.privileged_security_alert_delivery_receipts AS receipt
  WHERE receipt.alert_reference = p_alert_reference;
  IF FOUND THEN RETURN v_receipt; END IF;
  UPDATE orgmaster.privileged_security_alert_intents AS intent
  SET status = 'delivered', delivered_at = clock_timestamp(), lease_until = NULL, worker_id = NULL, last_error_code = NULL
  WHERE intent.alert_reference = p_alert_reference AND intent.status = 'processing' AND intent.worker_id = btrim(p_worker_id)
  RETURNING gen_random_uuid() INTO v_receipt;
  IF NOT FOUND THEN RAISE EXCEPTION 'SECURITY_ALERT_LEASE_INVALID' USING ERRCODE = '55000'; END IF;
  INSERT INTO orgmaster.privileged_security_alert_delivery_receipts (receipt_id, alert_reference, provider_receipt_sha256, delivered_at)
  VALUES (v_receipt, p_alert_reference, p_provider_receipt_sha256, clock_timestamp());
  RETURN v_receipt;
END;
$function$;

CREATE OR REPLACE FUNCTION orgmaster.retry_privileged_security_alert_v1(
  p_alert_reference text,
  p_worker_id text,
  p_error_code text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF char_length(btrim(p_error_code)) NOT BETWEEN 1 AND 128 THEN RAISE EXCEPTION 'SECURITY_ALERT_RETRY_INVALID' USING ERRCODE = '22023'; END IF;
  UPDATE orgmaster.privileged_security_alert_intents AS intent
  SET status = 'failed', next_attempt_at = clock_timestamp() + make_interval(secs => LEAST(3600, 5 * (2 ^ LEAST(intent.attempt_count, 9))::integer)),
      lease_until = NULL, worker_id = NULL, last_error_code = btrim(p_error_code)
  WHERE intent.alert_reference = p_alert_reference AND intent.status = 'processing' AND intent.worker_id = btrim(p_worker_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'SECURITY_ALERT_LEASE_INVALID' USING ERRCODE = '55000'; END IF;
END;
$function$;

ALTER TABLE orgmaster.privileged_security_alert_intents OWNER TO jenfu_platform_migrator;
ALTER TABLE orgmaster.privileged_security_alert_delivery_receipts OWNER TO jenfu_platform_migrator;
ALTER FUNCTION orgmaster.capture_privileged_security_alert_intents_v1() OWNER TO jenfu_platform_migrator;
ALTER FUNCTION orgmaster.claim_privileged_security_alerts_v1(text, integer, integer) OWNER TO jenfu_platform_migrator;
ALTER FUNCTION orgmaster.complete_privileged_security_alert_v1(text, text, text) OWNER TO jenfu_platform_migrator;
ALTER FUNCTION orgmaster.retry_privileged_security_alert_v1(text, text, text) OWNER TO jenfu_platform_migrator;

REVOKE ALL ON TABLE orgmaster.privileged_security_alert_intents, orgmaster.privileged_security_alert_delivery_receipts
  FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;
REVOKE ALL ON FUNCTION orgmaster.claim_privileged_security_alerts_v1(text, integer, integer),
  orgmaster.complete_privileged_security_alert_v1(text, text, text),
  orgmaster.retry_privileged_security_alert_v1(text, text, text)
  FROM PUBLIC, jenfu_platform_runtime, jenfu_ai_pdm_runtime;
GRANT EXECUTE ON FUNCTION orgmaster.claim_privileged_security_alerts_v1(text, integer, integer),
  orgmaster.complete_privileged_security_alert_v1(text, text, text),
  orgmaster.retry_privileged_security_alert_v1(text, text, text)
  TO jenfu_orgmaster_runtime;

COMMENT ON COLUMN orgmaster.app_sessions.authenticated_at IS
  'Provider-verified authentication instant (Firebase auth_time); never token exchange or session issue time.';
COMMENT ON TABLE orgmaster.privileged_security_alert_intents IS
  'Redacted durable alert intents captured in the same transaction as the Governance V3 persistence artifact.';

COMMIT;
