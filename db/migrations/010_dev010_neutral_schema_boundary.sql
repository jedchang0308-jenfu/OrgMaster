BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtext('dev010-n2-orgmaster'), hashtext(current_database()));
SET LOCAL ROLE jenfu_orgmaster_migrator;

CREATE TABLE IF NOT EXISTS orgmaster_core.schema_migrations (
  version text PRIMARY KEY,
  name text NOT NULL,
  checksum_sha256 char(64) NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  source_revision text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS orgmaster_core.contract_manifest (
  contract_id text PRIMARY KEY,
  contract_version text NOT NULL,
  signature_sha256 char(64) NOT NULL CHECK (signature_sha256 ~ '^[0-9a-f]{64}$'),
  payload_sha256 char(64),
  published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (payload_sha256 IS NULL OR payload_sha256 ~ '^[0-9a-f]{64}$')
);

-- 001-009 were historically owned by jenfu_platform_migrator.  The task-owned
-- migration-admin connection performs the one-time transfer without creating
-- permanent cross-role membership; every moved object is reassigned below.
RESET ROLE;

-- Move every authority relation into the neutral owner schema.  Compatibility
-- views retain the old names so historical SECURITY DEFINER bodies keep
-- resolving during rollback, without retaining a second authority table.
DO $move_relations$
DECLARE
  source_schema text;
  relation record;
BEGIN
  FOREACH source_schema IN ARRAY ARRAY['orgmaster', 'access_governance'] LOOP
    FOR relation IN
      SELECT c.relname, c.relkind
      FROM pg_catalog.pg_class AS c
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = source_schema
        AND c.relkind IN ('r', 'p')
      ORDER BY c.relname
    LOOP
      IF to_regclass(format('orgmaster_core.%I', relation.relname)) IS NOT NULL THEN
        RAISE EXCEPTION 'DEV010_N2_ORGMASTER_RELATION_COLLISION: %', relation.relname USING ERRCODE = '42710';
      END IF;
      EXECUTE format('ALTER TABLE %I.%I SET SCHEMA orgmaster_core', source_schema, relation.relname);
      EXECUTE format(
        'CREATE VIEW %I.%I WITH (security_barrier=true) AS SELECT * FROM orgmaster_core.%I',
        source_schema, relation.relname, relation.relname
      );
      EXECUTE format('ALTER VIEW %I.%I OWNER TO jenfu_orgmaster_migrator', source_schema, relation.relname);
      EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime', source_schema, relation.relname);
    END LOOP;
  END LOOP;
END;
$move_relations$;

DO $ownership$
DECLARE
  relation record;
  routine record;
BEGIN
  FOR relation IN
    SELECT n.nspname, c.relname, c.relkind
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('orgmaster_core', 'organization', 'access_governance')
      AND c.relkind IN ('r', 'p', 'v', 'S')
  LOOP
    EXECUTE format(
      'ALTER %s %I.%I OWNER TO jenfu_orgmaster_migrator',
      CASE WHEN relation.relkind = 'S' THEN 'SEQUENCE' WHEN relation.relkind = 'v' THEN 'VIEW' ELSE 'TABLE' END,
      relation.nspname,
      relation.relname
    );
  END LOOP;
  FOR routine IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('orgmaster', 'access_governance')
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO jenfu_orgmaster_migrator', routine.signature);
  END LOOP;
END;
$ownership$;

-- Historical SECURITY DEFINER implementations remain in the compatibility
-- schemas and now run as the neutral OrgMaster migrator.  Grant only that
-- non-login owner the schema lookup required by their stored bodies.
GRANT USAGE ON SCHEMA orgmaster, organization, access_governance
  TO jenfu_orgmaster_migrator;

-- The original authority migration declared this FK without a leading index.
-- Add the single missing referencing-side index before runtime grants are set.
CREATE INDEX dev010_fk_persistence_authority_active_batch
  ON orgmaster_core.persistence_authority (active_batch_id);

INSERT INTO orgmaster_core.contract_manifest (
  contract_id, contract_version, signature_sha256, payload_sha256
) VALUES
  (
    'orgmaster.identity-visibility',
    'jenfu.orgmaster-contract.identity-visibility.v1',
    'e400a51351fc1b5fab083ed94bcf0c62efdd0606d4316f354b2893f9bf82cf15',
    '4d27c1e297b516207f931f57e443ecda99e260c56369132f9a269d11920cda96'
  ),
  (
    'orgmaster.ai-pdm-entitlement',
    'jenfu.platform-entitlement.v1',
    '13a74783a6da2ac210090a6ba56937cb7b2f6d7d06e97a89844d4d6aaaca8306',
    '6587e984f1b9e258ad467213ad6291fa6735233d6e4b173c7a8e66ab93fd721e'
  )
ON CONFLICT (contract_id) DO UPDATE SET
  contract_version = EXCLUDED.contract_version,
  signature_sha256 = EXCLUDED.signature_sha256,
  payload_sha256 = EXCLUDED.payload_sha256,
  published_at = clock_timestamp();

CREATE OR REPLACE VIEW orgmaster_contract.v_active_principal_mappings_v1
WITH (security_barrier = true)
AS SELECT * FROM organization.v_active_principal_mappings_v1;

CREATE OR REPLACE VIEW orgmaster_contract.v_portal_app_visibility_v1
WITH (security_barrier = true)
AS SELECT * FROM access_governance.v_portal_app_visibility_v1;

CREATE OR REPLACE VIEW orgmaster_contract.v_ai_pdm_entitlement_authority_v1
WITH (security_barrier = true)
AS SELECT * FROM access_governance.v_ai_pdm_entitlement_authority_v1;

CREATE OR REPLACE VIEW orgmaster_contract.v_ai_pdm_effective_role_assignments_v1
WITH (security_barrier = true)
AS SELECT * FROM access_governance.v_ai_pdm_effective_role_assignments_v1;

CREATE OR REPLACE VIEW orgmaster_contract.v_contract_manifest_v1
WITH (security_barrier = true)
AS
SELECT contract_id, contract_version, signature_sha256::text, payload_sha256::text
FROM orgmaster_core.contract_manifest;

CREATE OR REPLACE FUNCTION orgmaster_contract.claim_entitlement_change_outbox_v1(
  p_worker_id text, p_limit integer DEFAULT 16, p_lease_seconds integer DEFAULT 30
)
RETURNS TABLE (
  event_id uuid, operation_id text, employee_id text, application_id text,
  event_kind text, actor text, reason_code text, attempt_count integer, lease_until timestamptz
)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
  SELECT * FROM access_governance.claim_entitlement_change_outbox_v1(p_worker_id, p_limit, p_lease_seconds);
$function$;

CREATE OR REPLACE FUNCTION orgmaster_contract.complete_entitlement_change_outbox_v1(
  p_event_id uuid, p_worker_id text, p_platform_receipt_id uuid
)
RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
  SELECT access_governance.complete_entitlement_change_outbox_v1(p_event_id, p_worker_id, p_platform_receipt_id);
$function$;

CREATE OR REPLACE FUNCTION orgmaster_contract.retry_entitlement_change_outbox_v1(
  p_event_id uuid, p_worker_id text, p_error_code text
)
RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
  SELECT access_governance.retry_entitlement_change_outbox_v1(p_event_id, p_worker_id, p_error_code);
$function$;

-- Neutral private API used only by the OrgMaster runtime.  Historical
-- functions remain as compatibility implementations and have no cross-app grant.
CREATE OR REPLACE FUNCTION orgmaster_core.read_active_persistence_artifact_v1(p_artifact_key text)
RETURNS TABLE (
  artifact_key text, artifact_kind text, payload jsonb, canonical_sha256 text,
  source_sha256 text, source_bytes bigint, source_revision text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$ SELECT * FROM orgmaster.read_active_persistence_artifact_v1(p_artifact_key); $function$;

CREATE OR REPLACE FUNCTION orgmaster_core.read_active_persistence_authority_v1()
RETURNS TABLE (authority_version bigint, source_revision text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$ SELECT * FROM orgmaster.read_active_persistence_authority_v1(); $function$;

CREATE OR REPLACE FUNCTION orgmaster_core.write_active_persistence_artifacts_v1(
  p_changes jsonb, p_source_revision text, p_updated_by text, p_reason_code text
)
RETURNS TABLE (authority_version bigint, source_revision text)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$ SELECT * FROM orgmaster.write_active_persistence_artifacts_v1(p_changes, p_source_revision, p_updated_by, p_reason_code); $function$;

CREATE OR REPLACE FUNCTION orgmaster_core.write_active_persistence_artifacts_with_entitlement_outbox_v1(
  p_changes jsonb, p_source_revision text, p_updated_by text, p_reason_code text, p_entitlement_changes jsonb
)
RETURNS TABLE (authority_version bigint, source_revision text, outbox_count integer)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$ SELECT * FROM orgmaster.write_active_persistence_artifacts_with_entitlement_outbox_v1(p_changes, p_source_revision, p_updated_by, p_reason_code, p_entitlement_changes); $function$;

CREATE OR REPLACE FUNCTION orgmaster_core.write_persistence_media_v1(
  p_media_key text, p_media_bytes bytea, p_mime_type text, p_content_sha256 text
)
RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$ SELECT orgmaster.write_persistence_media_v1(p_media_key, p_media_bytes, p_mime_type, p_content_sha256); $function$;

CREATE OR REPLACE FUNCTION orgmaster_core.read_persistence_media_v1(p_media_key text)
RETURNS TABLE (media_bytes bytea, mime_type text, content_sha256 text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$ SELECT * FROM orgmaster.read_persistence_media_v1(p_media_key); $function$;

CREATE OR REPLACE FUNCTION orgmaster_core.delete_persistence_media_v1(p_media_key text)
RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$ SELECT orgmaster.delete_persistence_media_v1(p_media_key); $function$;

CREATE OR REPLACE FUNCTION orgmaster_core.claim_privileged_security_alerts_v1(
  p_worker_id text, p_limit integer DEFAULT 20, p_lease_seconds integer DEFAULT 60
)
RETURNS SETOF orgmaster_core.privileged_security_alert_intents
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$ SELECT * FROM orgmaster.claim_privileged_security_alerts_v1(p_worker_id, p_limit, p_lease_seconds); $function$;

CREATE OR REPLACE FUNCTION orgmaster_core.complete_privileged_security_alert_v1(
  p_alert_reference text, p_worker_id text, p_provider_receipt_sha256 text
)
RETURNS uuid
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$ SELECT orgmaster.complete_privileged_security_alert_v1(p_alert_reference, p_worker_id, p_provider_receipt_sha256); $function$;

CREATE OR REPLACE FUNCTION orgmaster_core.retry_privileged_security_alert_v1(
  p_alert_reference text, p_worker_id text, p_error_code text
)
RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$ SELECT orgmaster.retry_privileged_security_alert_v1(p_alert_reference, p_worker_id, p_error_code); $function$;

DO $secure_functions$
DECLARE routine record;
BEGIN
  FOR routine IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('orgmaster_core', 'orgmaster_contract')
      AND p.proname <> 'capture_privileged_security_alert_intents_v1'
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO jenfu_orgmaster_migrator', routine.signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime', routine.signature);
  END LOOP;
END;
$secure_functions$;

DO $secure_relations$
DECLARE relation record;
BEGIN
  FOR relation IN
    SELECT n.nspname, c.relname, c.relkind
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('orgmaster_core', 'orgmaster_contract')
      AND c.relkind IN ('r', 'p', 'v', 'S')
  LOOP
    EXECUTE format(
      'ALTER %s %I.%I OWNER TO jenfu_orgmaster_migrator',
      CASE WHEN relation.relkind = 'S' THEN 'SEQUENCE'
           WHEN relation.relkind = 'v' THEN 'VIEW'
           WHEN relation.relkind = 'm' THEN 'MATERIALIZED VIEW'
           ELSE 'TABLE' END,
      relation.nspname,
      relation.relname
    );
    EXECUTE format('REVOKE ALL ON %s %I.%I FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime',
      CASE WHEN relation.relkind = 'S' THEN 'SEQUENCE' ELSE 'TABLE' END,
      relation.nspname, relation.relname);
  END LOOP;
END;
$secure_relations$;

REVOKE CREATE ON SCHEMA orgmaster_core, orgmaster_contract, orgmaster, organization, access_governance FROM PUBLIC;
REVOKE ALL ON TABLE orgmaster_core.schema_migrations, orgmaster_core.contract_manifest
  FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;
GRANT USAGE ON SCHEMA orgmaster_core TO jenfu_orgmaster_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE orgmaster_core.app_sessions TO jenfu_orgmaster_runtime;
GRANT USAGE ON SCHEMA orgmaster_contract TO jenfu_platform_migrator, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;
GRANT SELECT ON TABLE
  orgmaster_contract.v_active_principal_mappings_v1,
  orgmaster_contract.v_ai_pdm_entitlement_authority_v1,
  orgmaster_contract.v_ai_pdm_effective_role_assignments_v1,
  orgmaster_contract.v_contract_manifest_v1
TO jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;
GRANT SELECT ON TABLE orgmaster_contract.v_active_principal_mappings_v1, orgmaster_contract.v_contract_manifest_v1
  TO jenfu_platform_migrator;
GRANT SELECT ON TABLE orgmaster_contract.v_portal_app_visibility_v1 TO jenfu_platform_runtime;
GRANT EXECUTE ON FUNCTION
  orgmaster_contract.claim_entitlement_change_outbox_v1(text, integer, integer),
  orgmaster_contract.complete_entitlement_change_outbox_v1(uuid, text, uuid),
  orgmaster_contract.retry_entitlement_change_outbox_v1(uuid, text, text)
TO jenfu_orgmaster_runtime;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA orgmaster_core TO jenfu_orgmaster_runtime;

COMMIT;
