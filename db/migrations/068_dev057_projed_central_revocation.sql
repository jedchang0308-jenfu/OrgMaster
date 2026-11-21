-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: projed session revocation v1 (consumer)
-- compatibility: additive
-- governance-review: DEV-057 / ProJED DEV-139
BEGIN;
SET LOCAL ROLE jenfu_orgmaster_migrator;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE FUNCTION orgmaster_core.revoke_projed_admission_sessions_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF to_regnamespace('projed_contract') IS NULL THEN RETURN NEW; END IF;
  IF to_regprocedure('projed_contract.invalidate_google_sessions_v1(text)') IS NULL THEN
    RAISE EXCEPTION 'PROJED_REVOCATION_CONTRACT_UNAVAILABLE';
  END IF;
  -- Inactivation and reactivation both advance the local fence. Replaying an
  -- unchanged status does nothing; rollback also rolls back the revocation.
  PERFORM projed_contract.invalidate_google_sessions_v1(OLD.google_subject);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION orgmaster_core.revoke_projed_admission_sessions_v1() FROM PUBLIC;
CREATE TRIGGER zz_projed_admission_session_revocation_v1 BEFORE UPDATE OF status ON orgmaster_core.projed_principal_admissions
  FOR EACH ROW EXECUTE FUNCTION orgmaster_core.revoke_projed_admission_sessions_v1();
COMMIT;
