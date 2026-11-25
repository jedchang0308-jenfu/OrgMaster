-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: equivalent PDM Principal grant projection for the directory
-- compatibility: backward-compatible
-- governance-review: DEV-057 all-user directory
BEGIN;
SET LOCAL ROLE jenfu_orgmaster_migrator;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- The bulk reader needs the complete mapping cardinality for each Principal.
-- Aggregate it once instead of reopening the mapping view for every Principal.
-- Keep the existing point lookup for scoped login and session callers.
DO $migration$
DECLARE
  definition text := pg_get_functiondef(
    'orgmaster_core.read_ai_pdm_principal_grants_v5(text,text,boolean)'::regprocedure
  );
  prior_input constant text := $prior$
), active_principals AS (
  SELECT typed.principal_id,$prior$;
  bulk_input constant text := $bulk$
), mapping_counts AS MATERIALIZED (
  SELECT mapping.principal_id, count(*) AS pair_count
  FROM orgmaster_contract.v_active_principal_mappings_v1 mapping
  WHERE p_all
  GROUP BY mapping.principal_id
), active_principals AS (
  SELECT typed.principal_id,$bulk$;
  prior_check constant text := $prior$
     AND count(*) = (
       SELECT count(*)
         FROM orgmaster_contract.v_active_principal_mappings_v1 mapping
        WHERE mapping.principal_id = typed.principal_id
     )$prior$;
  bulk_check constant text := $bulk$
     AND count(*) = CASE WHEN p_all THEN COALESCE(
       (SELECT pair_count FROM mapping_counts WHERE principal_id = typed.principal_id), 0
     ) ELSE (
       SELECT count(*)
         FROM orgmaster_contract.v_active_principal_mappings_v1 mapping
        WHERE mapping.principal_id = typed.principal_id
     ) END$bulk$;
BEGIN
  IF cardinality(string_to_array(definition, prior_input)) <> 2
     OR cardinality(string_to_array(definition, prior_check)) <> 2 THEN
    RAISE EXCEPTION 'DEV057_DIRECTORY_GRANTS_PREDECESSOR_DRIFT';
  END IF;
  EXECUTE replace(replace(definition, prior_input, bulk_input), prior_check, bulk_check);
END;
$migration$;
COMMIT;
