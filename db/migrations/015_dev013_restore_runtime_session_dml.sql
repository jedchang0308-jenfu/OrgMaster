-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core
-- contract-impact: none
-- compatibility: backward-compatible
-- governance-review: DEV-013

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtext('dev013-orgmaster-session-dml'), hashtext(current_database()));
SET LOCAL ROLE jenfu_orgmaster_migrator;

DO $precondition$
DECLARE
  relation_owner text;
BEGIN
  IF to_regclass('orgmaster_core.app_sessions') IS NULL THEN
    RAISE EXCEPTION 'DEV013_ORGMASTER_APP_SESSIONS_MISSING';
  END IF;

  SELECT pg_get_userbyid(class.relowner)
    INTO relation_owner
  FROM pg_catalog.pg_class AS class
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = class.relnamespace
  WHERE namespace.nspname = 'orgmaster_core'
    AND class.relname = 'app_sessions'
    AND class.relkind = 'r';

  IF relation_owner IS DISTINCT FROM 'jenfu_orgmaster_migrator' THEN
    RAISE EXCEPTION 'DEV013_ORGMASTER_APP_SESSIONS_OWNER_MISMATCH';
  END IF;
END;
$precondition$;

REVOKE ALL ON TABLE orgmaster_core.app_sessions
  FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE orgmaster_core.app_sessions
  TO jenfu_orgmaster_runtime;

COMMIT;
