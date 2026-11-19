-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core
-- contract-impact: orgmaster.local-principal-workload-isolation.v1
-- compatibility: additive
-- governance-review: ORGMASTER/DEV-060, JENFU/DEV-021
-- Local-only disablement of the two formal lifecycle workload bindings.
-- Their source migration remains unchanged and this file is excluded from the
-- ordinary production migration profile.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $local_target$
BEGIN
  IF current_database() !~ '^jenfu_local_[a-z0-9_]{3,51}$'
     OR COALESCE(host(inet_server_addr()), '') NOT IN ('127.0.0.1', '::1')
     OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'LOCAL_SANDBOX_TARGET_REQUIRED';
  END IF;
END
$local_target$;
SET LOCAL ROLE jenfu_orgmaster_migrator;

DO $disable_formal_workloads$
DECLARE
  exact_binding_count integer;
  changed_binding_count integer;
BEGIN
  IF to_regclass('orgmaster_core.workload_principal_bindings') IS NULL THEN
    RAISE EXCEPTION 'ORGMASTER_WORKLOAD_BINDINGS_REQUIRED';
  END IF;

  SELECT count(*) INTO exact_binding_count
    FROM orgmaster_core.workload_principal_bindings
   WHERE (principal_id, owner, purpose, provider_issuer, provider_subject,
          db_session_user, binding_version, enabled) IN (
     ('principal-workload:orgmaster-managed-identity-lifecycle', 'orgmaster',
      'managed-identity-lifecycle', 'https://accounts.google.com',
      '109928765105400231333', 'orgmaster-prod-runtime@jenfu-platform-prod.iam', 1, true),
     ('principal-workload:platform-principal-lifecycle-invalidation', 'platform',
      'principal-lifecycle-invalidation', 'https://accounts.google.com',
      '101029748006912113815', 'platform-prod-runtime@jenfu-platform-prod.iam', 1, true)
   );
  IF exact_binding_count <> 2 THEN
    RAISE EXCEPTION 'ORGMASTER_LOCAL_WORKLOAD_BINDING_READBACK_MISMATCH';
  END IF;

  UPDATE orgmaster_core.workload_principal_bindings
     SET enabled = false
   WHERE (principal_id, owner, purpose, provider_issuer, provider_subject,
          db_session_user, binding_version, enabled) IN (
     ('principal-workload:orgmaster-managed-identity-lifecycle', 'orgmaster',
      'managed-identity-lifecycle', 'https://accounts.google.com',
      '109928765105400231333', 'orgmaster-prod-runtime@jenfu-platform-prod.iam', 1, true),
     ('principal-workload:platform-principal-lifecycle-invalidation', 'platform',
      'principal-lifecycle-invalidation', 'https://accounts.google.com',
      '101029748006912113815', 'platform-prod-runtime@jenfu-platform-prod.iam', 1, true)
   );
  GET DIAGNOSTICS changed_binding_count = ROW_COUNT;
  IF changed_binding_count <> 2 THEN
    RAISE EXCEPTION 'ORGMASTER_LOCAL_WORKLOAD_BINDING_UPDATE_MISMATCH';
  END IF;

  IF (SELECT count(*) FROM orgmaster_core.workload_principal_bindings
       WHERE principal_id IN (
         'principal-workload:orgmaster-managed-identity-lifecycle',
         'principal-workload:platform-principal-lifecycle-invalidation'
       ) AND enabled = false) <> 2 THEN
    RAISE EXCEPTION 'ORGMASTER_LOCAL_WORKLOAD_BINDING_READBACK_MISMATCH';
  END IF;
END
$disable_formal_workloads$;

COMMIT;
