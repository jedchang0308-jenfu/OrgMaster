-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: exact FMS pre-publication receipt and committed owner decision
-- compatibility: backward-compatible
-- governance-review: DEV-059
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_orgmaster_migrator;

-- Publication planning observes the chosen permissions after pending lifecycle
-- work. Live admissions still honor the installed 060 delivery fences. A
-- terminal publication is only exposed after the affected delivery clears.
DO $planned_authority$
DECLARE definition text; condition text;
BEGIN
  definition := replace(pg_get_functiondef('orgmaster_core.read_fms_fact_accounts_at_v1(text,text,text,timestamptz)'::regprocedure),chr(13),'');
  FOREACH condition IN ARRAY ARRAY[
    $match$AND NOT EXISTS (SELECT 1 FROM orgmaster_core.managed_identity_lifecycle_outbox lifecycle
      WHERE lifecycle.employee_id=candidates.employee AND lifecycle.status<>'completed')$match$,
    $match$AND NOT EXISTS (SELECT 1 FROM orgmaster_core.fms_lifecycle_targets target
      JOIN orgmaster_core.principal_lifecycle_delivery_v2 delivery ON delivery.event_id=target.event_id
      WHERE target.principal_id=candidates.principal AND delivery.status<>'completed')$match$,
    $match$AND NOT EXISTS (SELECT 1 FROM orgmaster_core.managed_identity_lifecycle_outbox lifecycle
    WHERE lifecycle.employee_id=managed.employee_id AND lifecycle.status<>'completed')$match$
  ] LOOP
    condition := replace(condition,chr(13),'');
    IF strpos(definition,condition)=0 THEN RAISE EXCEPTION 'FMS_PLANNED_ACCOUNT_PREDECESSOR_DRIFT'; END IF;
    definition := replace(definition,condition,'');
  END LOOP;
  EXECUTE replace(definition,'read_fms_fact_accounts_at_v1','read_fms_planned_accounts_at_v1');

  definition := pg_get_functiondef('orgmaster_core.read_fms_authority_at_v1(text,text,timestamptz)'::regprocedure);
  IF strpos(definition,'read_fms_fact_accounts_at_v1')=0 THEN RAISE EXCEPTION 'FMS_PLANNED_AUTHORITY_PREDECESSOR_DRIFT'; END IF;
  EXECUTE replace(replace(definition,'read_fms_authority_at_v1','read_fms_planned_authority_at_v1'),
    'read_fms_fact_accounts_at_v1','read_fms_planned_accounts_at_v1');

  definition := pg_get_functiondef('orgmaster_core.read_fms_authority_timeline_v1(text,timestamptz)'::regprocedure);
  IF strpos(definition,'read_fms_authority_at_v1')=0 OR strpos(definition,'read_fms_fact_accounts_at_v1')=0
    THEN RAISE EXCEPTION 'FMS_PLANNED_TIMELINE_PREDECESSOR_DRIFT'; END IF;
  EXECUTE replace(replace(definition,'read_fms_authority_at_v1','read_fms_planned_authority_at_v1'),
    'read_fms_fact_accounts_at_v1','read_fms_planned_accounts_at_v1');
END;
$planned_authority$;
REVOKE ALL ON FUNCTION orgmaster_core.read_fms_planned_accounts_at_v1(text,text,text,timestamptz),
  orgmaster_core.read_fms_planned_authority_at_v1(text,text,timestamptz) FROM PUBLIC;

CREATE TABLE orgmaster_core.fms_session_publication_control_v1 (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false
);
INSERT INTO orgmaster_core.fms_session_publication_control_v1 DEFAULT VALUES;
REVOKE ALL ON orgmaster_core.fms_session_publication_control_v1 FROM PUBLIC;

CREATE FUNCTION orgmaster_core.fms_session_publication_enabled_v1()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $enabled$
  SELECT enabled FROM orgmaster_core.fms_session_publication_control_v1 WHERE singleton;
$enabled$;
REVOKE ALL ON FUNCTION orgmaster_core.fms_session_publication_enabled_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orgmaster_core.fms_session_publication_enabled_v1() TO jenfu_orgmaster_runtime;

-- Extend the existing owner operation so both app receipts gate one authority
-- commit. principal_ids and the original event IDs still belong only to PDM.
ALTER TABLE orgmaster_core.pdm_session_publication_v1
  ADD COLUMN fms_principal_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN fms_impact_hash text,
  ADD COLUMN fms_prepare_event_id uuid UNIQUE,
  ADD COLUMN fms_terminal_event_id uuid UNIQUE,
  ADD COLUMN fms_prepare_receipt jsonb,
  ADD COLUMN fms_terminal_receipt jsonb,
  ADD COLUMN fms_authority_timeline jsonb;

DO $update_old_checks$
DECLARE candidate record; dropped integer := 0;
BEGIN
  FOR candidate IN SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conrelid='orgmaster_core.pdm_session_publication_v1'::regclass AND contype='c'
  LOOP
    IF candidate.definition LIKE '%cardinality(principal_ids)%'
      OR (candidate.definition LIKE '%decision IS DISTINCT FROM%published%' AND candidate.definition LIKE '%prepare_receipt IS NOT NULL%')
    THEN
      EXECUTE format('ALTER TABLE orgmaster_core.pdm_session_publication_v1 DROP CONSTRAINT %I',candidate.conname);
      dropped := dropped+1;
    END IF;
  END LOOP;
  IF dropped<>2 THEN RAISE EXCEPTION 'FMS_PUBLICATION_CHECK_PREDECESSOR_DRIFT'; END IF;
END;
$update_old_checks$;

ALTER TABLE orgmaster_core.pdm_session_publication_v1
  ADD CONSTRAINT publication_app_scopes_v1 CHECK (
    cardinality(principal_ids)<=4096 AND cardinality(fms_principal_ids)<=4096
    AND cardinality(principal_ids)+cardinality(fms_principal_ids)>0),
  ADD CONSTRAINT publication_app_prepares_v1 CHECK (
    decision IS DISTINCT FROM 'published' OR ((cardinality(principal_ids)=0 OR prepare_receipt IS NOT NULL)
      AND (cardinality(fms_principal_ids)=0 OR fms_prepare_receipt IS NOT NULL))),
  ADD CONSTRAINT publication_fms_binding_v1 CHECK (
    CASE WHEN cardinality(fms_principal_ids)>0 THEN
      fms_impact_hash IS NOT NULL AND fms_impact_hash ~ '^[a-f0-9]{64}$'
      AND fms_prepare_event_id IS NOT NULL AND fms_terminal_event_id IS NOT NULL
      AND fms_prepare_event_id<>fms_terminal_event_id
      AND ((decision IS NOT DISTINCT FROM 'published')=(fms_authority_timeline IS NOT NULL))
      AND (fms_terminal_receipt IS NULL OR (decision IS NOT NULL AND fms_prepare_receipt IS NOT NULL))
    ELSE num_nonnulls(fms_impact_hash,fms_prepare_event_id,fms_terminal_event_id,fms_prepare_receipt,
      fms_terminal_receipt,fms_authority_timeline)=0 END);

CREATE FUNCTION orgmaster_core.guard_fms_publication_receipts_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $guard$
BEGIN
  IF cardinality(NEW.fms_principal_ids)=0 THEN RETURN NEW; END IF;
  IF (OLD.decision IS NOT NULL AND NEW.decision IS DISTINCT FROM OLD.decision)
    OR (OLD.fms_prepare_receipt IS NOT NULL AND NEW.fms_prepare_receipt IS DISTINCT FROM OLD.fms_prepare_receipt)
    OR (OLD.fms_terminal_receipt IS NOT NULL AND NEW.fms_terminal_receipt IS DISTINCT FROM OLD.fms_terminal_receipt)
    OR (OLD.fms_authority_timeline IS NOT NULL AND NEW.fms_authority_timeline IS DISTINCT FROM OLD.fms_authority_timeline)
  THEN RAISE EXCEPTION 'FMS_PUBLICATION_RECEIPTS_IMMUTABLE'; END IF;
  IF NEW.fms_authority_timeline IS NOT NULL AND (jsonb_typeof(NEW.fms_authority_timeline)<>'array'
    OR NEW.fms_principal_ids IS DISTINCT FROM ARRAY(SELECT entry.value->>0
        FROM jsonb_array_elements(NEW.fms_authority_timeline) WITH ORDINALITY entry(value,ordinal) ORDER BY entry.ordinal)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.fms_authority_timeline) value
        WHERE jsonb_typeof(value->0) IS DISTINCT FROM 'string' OR jsonb_typeof(value->1) IS DISTINCT FROM 'array'
          OR jsonb_array_length(value)<>2))
  THEN RAISE EXCEPTION 'FMS_PUBLICATION_TIMELINE_SCOPE_INVALID'; END IF;
  RETURN NEW;
END;
$guard$;
CREATE TRIGGER fms_publication_receipts_guard_v1 BEFORE UPDATE
  ON orgmaster_core.pdm_session_publication_v1 FOR EACH ROW
  EXECUTE FUNCTION orgmaster_core.guard_fms_publication_receipts_v1();
REVOKE ALL ON FUNCTION orgmaster_core.guard_fms_publication_receipts_v1() FROM PUBLIC;
GRANT INSERT (fms_principal_ids,fms_impact_hash,fms_prepare_event_id,fms_terminal_event_id)
  ON orgmaster_core.pdm_session_publication_v1 TO jenfu_orgmaster_runtime;
GRANT UPDATE (fms_prepare_receipt,fms_terminal_receipt,fms_authority_timeline)
  ON orgmaster_core.pdm_session_publication_v1 TO jenfu_orgmaster_runtime;

CREATE FUNCTION orgmaster_core.fms_publication_reviewer_timeline_v1(p_at timestamptz, p_timeline jsonb)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog SET timezone='UTC' AS $project$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('principal_id',entry.value->>0,
    'intervals', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'valid_from',COALESCE((period.value->>0)::timestamptz,p_at),
      'valid_until',(period.value->>1)::timestamptz,
      'authorities',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'employee_id',effect.value->>0,'catalog_version',effect.value->>1,'catalog_hash',effect.value->>2,
        'assignments',effect.value->5) ORDER BY effect.ordinal),'[]'::jsonb)
        FROM jsonb_array_elements(period.value->2) WITH ORDINALITY effect(value,ordinal))
      ) ORDER BY period.ordinal),'[]'::jsonb)
      FROM jsonb_array_elements(entry.value->1) WITH ORDINALITY period(value,ordinal))
    ) ORDER BY entry.ordinal),'[]'::jsonb)
  FROM jsonb_array_elements(p_timeline) WITH ORDINALITY entry(value,ordinal);
$project$;
REVOKE ALL ON FUNCTION orgmaster_core.fms_publication_reviewer_timeline_v1(timestamptz,jsonb) FROM PUBLIC;

-- A later unrelated publication cannot erase proof of this exact decision.
CREATE FUNCTION orgmaster_contract.read_fms_session_publication_v1(p_operation_id uuid, p_terminal_event_id uuid)
RETURNS TABLE(contract_version text, operation_id uuid, terminal_event_id uuid, decision text,
  observed_version text, prepare_receipt_id uuid, principal_ids text[], authority_at timestamptz, authority_timeline jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $terminal$
  SELECT 'jenfu.orgmaster.fms-session-publication.v1', op.operation_id, op.fms_terminal_event_id, op.decision,
    encode(sha256(convert_to('orgmaster.fms-session-publication.v1:' ||
      CASE op.decision WHEN 'published' THEN op.publication_version ELSE op.baseline_version END::text,'UTF8')),'hex'),
    (op.fms_prepare_receipt->>'receiptId')::uuid, op.fms_principal_ids, op.impact_at,
    CASE WHEN op.decision='published' THEN orgmaster_core.fms_publication_reviewer_timeline_v1(op.impact_at,op.fms_authority_timeline) END
  FROM orgmaster_core.pdm_session_publication_v1 op JOIN orgmaster_core.persistence_authority authority
    ON authority.singleton AND authority.authority_version>=CASE op.decision WHEN 'published' THEN op.publication_version ELSE op.baseline_version END
  WHERE op.operation_id=p_operation_id AND op.fms_terminal_event_id=p_terminal_event_id
    AND op.decision IS NOT NULL AND op.fms_prepare_receipt IS NOT NULL AND cardinality(op.fms_principal_ids)>0
    AND (op.decision='cancelled' OR orgmaster_core.pdm_reviewer_delivery_clear_v1(op.fms_principal_ids));
$terminal$;
REVOKE ALL ON FUNCTION orgmaster_contract.read_fms_session_publication_v1(uuid,uuid) FROM PUBLIC;
DO $fms_acl$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fms_runtime') THEN
    GRANT EXECUTE ON FUNCTION orgmaster_contract.read_fms_session_publication_v1(uuid,uuid) TO fms_runtime;
  END IF;
END; $fms_acl$;

CREATE OR REPLACE FUNCTION orgmaster_contract.read_ai_pdm_session_publication_v1(p_operation_id uuid, p_publication_version text)
RETURNS TABLE(publication_version text, published_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $pdm$
  SELECT op.publication_version::text, op.decided_at
  FROM orgmaster_core.pdm_session_publication_v1 op JOIN orgmaster_core.persistence_authority owner
    ON owner.singleton AND owner.authority_version>=op.publication_version
  WHERE op.operation_id=p_operation_id AND op.publication_version::text=p_publication_version
    AND op.decision='published' AND cardinality(op.principal_ids)>0;
$pdm$;

DO $pdm_scope$
DECLARE definition text; marker text;
BEGIN
  definition := pg_get_functiondef('orgmaster_contract.read_ai_pdm_reviewer_publication_v1(uuid,text)'::regprocedure);
  marker := 'AND published.decision=''published'';';
  IF strpos(definition,marker)=0 THEN RAISE EXCEPTION 'PDM_REVIEWER_PUBLICATION_PREDECESSOR_DRIFT'; END IF;
  EXECUTE replace(definition,marker,'AND published.decision=''published'' AND cardinality(published.principal_ids)>0;');
  definition := pg_get_functiondef('orgmaster_core.transition_pdm_session_publication_v1(bigint,boolean,text,timestamptz)'::regprocedure);
  marker := 'WHERE terminal_receipt IS NULL) THEN';
  IF strpos(definition,marker)=0 THEN RAISE EXCEPTION 'PDM_PUBLICATION_CONTROL_PREDECESSOR_DRIFT'; END IF;
  EXECUTE replace(definition,marker,'WHERE cardinality(principal_ids)>0 AND terminal_receipt IS NULL) THEN');
END;
$pdm_scope$;

-- Match the same checked writer locations as the existing PDM control.
DO $writer_fences$
DECLARE entry regprocedure; definition text; marker text; condition text;
BEGIN
  FOREACH entry IN ARRAY ARRAY[
    'orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v3(jsonb,text,text,text,text,jsonb,jsonb)'::regprocedure,
    'orgmaster_core.apply_administration_command_v1(jsonb,jsonb)'::regprocedure,
    'orgmaster_core.initialize_administration_private_v1(jsonb,text)'::regprocedure,
    'orgmaster_core.complete_managed_identity_refresh_v2(text,uuid,uuid,bigint,text,text,text)'::regprocedure,
    'orgmaster_core.set_managed_identity_admission_v1(bigint,boolean,text,text)'::regprocedure,
    'orgmaster_core.quarantine_managed_identity_v1(uuid,bigint,text,text,text)'::regprocedure
  ] LOOP
    definition := pg_get_functiondef(entry);
    marker := CASE WHEN entry IN ('orgmaster_core.set_managed_identity_admission_v1(bigint,boolean,text,text)'::regprocedure,
      'orgmaster_core.quarantine_managed_identity_v1(uuid,bigint,text,text,text)'::regprocedure)
      THEN 'PERFORM 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton FOR UPDATE;'
      ELSE 'PERFORM 1 FROM orgmaster_core.persistence_authority WHERE singleton FOR UPDATE;' END;
    IF strpos(definition,marker)=0 THEN RAISE EXCEPTION 'FMS_PUBLICATION_WRITER_PREDECESSOR_DRIFT: %',entry; END IF;
    condition := CASE entry::oid
      WHEN 'orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v3(jsonb,text,text,text,text,jsonb,jsonb)'::regprocedure::oid
        THEN 'EXISTS (SELECT 1 FROM jsonb_array_elements(p_changes) artifact
          WHERE (artifact->>''artifactKind'' = ''workspace-version'' AND artifact#>>''{payload,kind}'' = ''document'')
             OR (artifact->>''artifactKey'' = ''orgmaster-governance.v3.json'' AND NOT EXISTS (
               SELECT 1 FROM orgmaster_core.persistence_authority authority
               JOIN orgmaster_core.persistence_artifacts previous ON previous.batch_id=authority.active_batch_id
               WHERE authority.singleton AND previous.artifact_key=artifact->>''artifactKey''
                 AND previous.payload->''activePolicyVersionId'' = artifact#>''{payload,activePolicyVersionId}''
                 AND previous.payload->''publishedVersions'' = artifact#>''{payload,publishedVersions}'')))'
      WHEN 'orgmaster_core.initialize_administration_private_v1(jsonb,text)'::regprocedure::oid
        THEN 'EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_package#>''{command,grants}'',''[]''::jsonb)) grant_row
          WHERE grant_row->>''applicationId'' = ''financial-management-system'')'
      ELSE 'true' END;
    EXECUTE replace(definition,marker,marker || E'\n IF ' || condition
      || ' AND orgmaster_core.fms_session_publication_enabled_v1() AND '
      || 'current_setting(''orgmaster.fms_publication_writer'',true) IS DISTINCT FROM ''coordinated'' '
      || 'THEN RAISE EXCEPTION ''FMS_PUBLICATION_WRITER_REQUIRED''; END IF;');
  END LOOP;
END;
$writer_fences$;
COMMIT;
