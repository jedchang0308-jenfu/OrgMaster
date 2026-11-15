-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: FMS runtime can read the active authorization epoch
-- compatibility: additive
-- governance-review: DEV-059 / JFFMS DEV-068
BEGIN;
SET LOCAL ROLE jenfu_orgmaster_migrator;

CREATE FUNCTION orgmaster_contract.read_fms_session_publication_epoch_v1()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $epoch$
  SELECT revision::text FROM orgmaster_core.fms_session_publication_control_v1
  WHERE singleton AND enabled AND revision>0;
$epoch$;
REVOKE ALL ON FUNCTION orgmaster_contract.read_fms_session_publication_epoch_v1() FROM PUBLIC;
DO $fms_acl$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fms_runtime') THEN
    GRANT EXECUTE ON FUNCTION orgmaster_contract.read_fms_session_publication_epoch_v1() TO fms_runtime;
  END IF;
END; $fms_acl$;
COMMIT;
