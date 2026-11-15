-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: complete reviewer baseline for the FMS local projection
-- compatibility: additive
-- governance-review: DEV-059
BEGIN;
SET LOCAL ROLE jenfu_orgmaster_migrator;

-- The caller holds its own projection lock until the baseline is committed.
-- Read all owner facts from one MVCC snapshot, with no unresolved FMS event.
CREATE FUNCTION orgmaster_contract.read_fms_reviewer_snapshot_v1()
RETURNS TABLE(contract_version text, source_version text, authority_at timestamptz,
  principal_ids text[], authority_timeline jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog SET timezone='UTC' AS $snapshot$
DECLARE observed_version bigint; observed_at timestamptz := transaction_timestamp();
BEGIN
  SELECT a.authority_version INTO STRICT observed_version FROM orgmaster_core.persistence_authority a WHERE a.singleton;
  IF NOT orgmaster_core.fms_session_publication_enabled_v1()
    OR NOT orgmaster_contract.is_fms_authority_publication_ready_v1()
    OR NOT orgmaster_core.pdm_reviewer_delivery_clear_v1(NULL)
    OR EXISTS (SELECT 1 FROM orgmaster_core.pdm_session_publication_v1 op
      WHERE cardinality(op.fms_principal_ids)>0 AND op.fms_terminal_receipt IS NULL)
  THEN RETURN; END IF;

  RETURN QUERY
  WITH facts AS MATERIALIZED (
    SELECT f.principal_id, f.effect FROM orgmaster_core.read_fms_session_impact_v1(observed_at) f LIMIT 1001
  ), complete AS (
    SELECT count(*) AS total, COALESCE(array_agg(facts.principal_id ORDER BY facts.principal_id COLLATE "C"), ARRAY[]::text[]) AS ids,
      COALESCE(jsonb_agg(jsonb_build_array(facts.principal_id,facts.effect) ORDER BY facts.principal_id COLLATE "C"),'[]'::jsonb) AS timeline
    FROM facts
  )
  SELECT 'jenfu.orgmaster.fms-reviewer-snapshot.v1'::text,
    encode(sha256(convert_to('orgmaster.fms-session-publication.v1:' || observed_version::text,'UTF8')),'hex'),
    observed_at, complete.ids, orgmaster_core.fms_publication_reviewer_timeline_v1(observed_at,complete.timeline)
  FROM complete WHERE complete.total<=1000;
END;
$snapshot$;

REVOKE ALL ON FUNCTION orgmaster_contract.read_fms_reviewer_snapshot_v1() FROM PUBLIC;
DO $fms_acl$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fms_runtime') THEN
    GRANT EXECUTE ON FUNCTION orgmaster_contract.read_fms_reviewer_snapshot_v1() TO fms_runtime;
  END IF;
END; $fms_acl$;
COMMIT;
