-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core
-- contract-impact: none
-- compatibility: backward-compatible
-- DEV-046 employee list resize lower bound; widen the existing preference constraint only for employees.

BEGIN;

SET LOCAL ROLE jenfu_orgmaster_migrator;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE orgmaster_core.workbench_list_width_preferences
  DROP CONSTRAINT workbench_list_width_preferences_list_width_px_check;

ALTER TABLE orgmaster_core.workbench_list_width_preferences
  ADD CONSTRAINT workbench_list_width_preferences_module_width_check
  CHECK (
    (module_id = 'employees' AND list_width_px BETWEEN 66 AND 800)
    OR (module_id <> 'employees' AND list_width_px BETWEEN 160 AND 800)
  );

COMMIT;
