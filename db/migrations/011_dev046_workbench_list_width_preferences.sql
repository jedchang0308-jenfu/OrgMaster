-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core
-- contract-impact: none
-- compatibility: backward-compatible
-- DEV-046 account-scoped presentation preference; no domain or URL state.
BEGIN;

SET LOCAL ROLE jenfu_orgmaster_migrator;

CREATE TABLE orgmaster_core.workbench_list_width_preferences (
  principal_id text NOT NULL,
  module_id text NOT NULL,
  list_width_px integer NOT NULL CHECK (list_width_px BETWEEN 160 AND 800),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (principal_id, module_id),
  CHECK (char_length(principal_id) BETWEEN 1 AND 255),
  CHECK (module_id IN ('employees','positions','departments','levels','duties','processes','management-methods','role-risks'))
);

ALTER TABLE orgmaster_core.workbench_list_width_preferences OWNER TO jenfu_orgmaster_migrator;
REVOKE ALL ON TABLE orgmaster_core.workbench_list_width_preferences FROM PUBLIC, jenfu_platform_runtime, jenfu_ai_pdm_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE orgmaster_core.workbench_list_width_preferences TO jenfu_orgmaster_runtime;

COMMIT;
