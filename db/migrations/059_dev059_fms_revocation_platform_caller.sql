-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: exact Platform revocation caller check for FMS
-- compatibility: additive
-- governance-review: DEV-059
BEGIN;
SET LOCAL ROLE jenfu_orgmaster_migrator;

CREATE FUNCTION orgmaster_contract.is_fms_revocation_platform_caller_v1(p_subject text, p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $caller$
  SELECT EXISTS (
    SELECT 1 FROM orgmaster_core.workload_principal_bindings b
    WHERE b.principal_id = 'principal-workload:platform-principal-lifecycle-invalidation'
      AND b.owner = 'platform' AND b.purpose = 'principal-lifecycle-invalidation' AND b.enabled
      AND b.provider_issuer = 'https://accounts.google.com' AND b.provider_subject = p_subject
      AND b.db_session_user || '.gserviceaccount.com' = p_email
  );
$caller$;

REVOKE ALL ON FUNCTION orgmaster_contract.is_fms_revocation_platform_caller_v1(text,text) FROM PUBLIC;
DO $fms_acl$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fms_runtime') THEN
    GRANT EXECUTE ON FUNCTION orgmaster_contract.is_fms_revocation_platform_caller_v1(text,text) TO fms_runtime;
  END IF;
END; $fms_acl$;

COMMENT ON FUNCTION orgmaster_contract.is_fms_revocation_platform_caller_v1(text,text) IS
  'FMS-only match of a verified Google service token to the active Platform lifecycle workload; exposes no binding rows.';
COMMIT;
