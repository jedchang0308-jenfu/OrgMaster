-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: owner-only switch for the FMS publication barrier
-- compatibility: additive
-- governance-review: DEV-059
BEGIN;
SET LOCAL ROLE jenfu_orgmaster_migrator;

ALTER TABLE orgmaster_core.fms_session_publication_control_v1
  ADD COLUMN revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  ADD COLUMN operation_sha256 text CHECK (operation_sha256 ~ '^[a-f0-9]{64}$'),
  ADD COLUMN changed_at timestamptz;

CREATE FUNCTION orgmaster_core.transition_fms_session_publication_v1(
  p_expected bigint, p_enabled boolean, p_operation_sha256 text, p_deadline timestamptz
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog AS $transition$
DECLARE state orgmaster_core.fms_session_publication_control_v1%ROWTYPE;
BEGIN
  PERFORM orgmaster_core.lock_pdm_session_publication_v1();
  IF p_expected IS NULL OR p_expected < 0 OR p_expected >= 9223372036854775807
    OR p_enabled IS NULL OR p_operation_sha256 IS NULL OR p_operation_sha256 !~ '^[a-f0-9]{64}$'
    OR p_deadline IS NULL OR p_deadline <= clock_timestamp()
    OR p_deadline > clock_timestamp() + interval '5 minutes'
  THEN RAISE EXCEPTION 'FMS_PUBLICATION_CONTROL_INPUT_INVALID'; END IF;

  SELECT * INTO STRICT state FROM orgmaster_core.fms_session_publication_control_v1 WHERE singleton FOR UPDATE;
  IF state.operation_sha256 IS DISTINCT FROM p_operation_sha256 THEN
    IF state.revision <> p_expected OR state.enabled = p_enabled THEN
      RAISE EXCEPTION 'FMS_PUBLICATION_CONTROL_CONFLICT';
    END IF;
    IF EXISTS (SELECT 1 FROM orgmaster_core.pdm_session_publication_v1 op
      WHERE cardinality(op.fms_principal_ids)>0 AND op.fms_terminal_receipt IS NULL)
    THEN RAISE EXCEPTION 'FMS_PUBLICATION_CONTROL_PENDING_DELIVERY'; END IF;
    IF p_enabled AND NOT orgmaster_contract.is_fms_authority_publication_ready_v1() THEN
      RAISE EXCEPTION 'FMS_PUBLICATION_CONTROL_SOURCE_NOT_READY';
    END IF;
    UPDATE orgmaster_core.fms_session_publication_control_v1 SET enabled=p_enabled,
      revision=state.revision+1, operation_sha256=p_operation_sha256, changed_at=clock_timestamp()
      WHERE singleton RETURNING * INTO STRICT state;
  ELSIF state.revision <> p_expected+1 OR state.enabled <> p_enabled THEN
    RAISE EXCEPTION 'FMS_PUBLICATION_CONTROL_CONFLICT';
  END IF;
  RETURN jsonb_build_object('enabled',state.enabled,'revision',state.revision::text,
    'operationSha256',state.operation_sha256,'changedAt',state.changed_at);
END;
$transition$;
REVOKE ALL ON FUNCTION orgmaster_core.transition_fms_session_publication_v1(bigint,boolean,text,timestamptz)
  FROM PUBLIC, jenfu_orgmaster_runtime;
COMMIT;
