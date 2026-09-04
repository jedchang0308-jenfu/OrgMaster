-- DEV-039 D2: additive, default-off application entitlement v2 contract.
-- AI-PDM v1 tables/views remain untouched. Financial authority remains local_legacy
-- until an isolated transaction explicitly records an orgmaster authority mode.
BEGIN;

SET LOCAL ROLE jenfu_platform_migrator;

CREATE TABLE IF NOT EXISTS access_governance.application_role_catalog_versions_v2 (
  application_id text NOT NULL,
  catalog_version text NOT NULL,
  catalog_sha256 text NOT NULL,
  payload_sha256 text NOT NULL,
  status text NOT NULL CHECK (status IN ('inactive', 'active', 'retired')),
  snapshot jsonb NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activated_at timestamptz,
  retired_at timestamptz,
  PRIMARY KEY (application_id, catalog_version),
  CHECK (application_id ~ '^[a-z][a-z0-9-]{2,63}$'),
  CHECK (catalog_version ~ '^[a-z][a-z0-9-]{2,63}\.role-catalog\.[0-9]{4}-[0-9]{2}-[0-9]{2}\.v[0-9]+$'),
  CHECK (catalog_sha256 ~ '^[0-9a-f]{64}$'),
  CHECK (payload_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS application_role_catalog_versions_v2_one_active
  ON access_governance.application_role_catalog_versions_v2 (application_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS access_governance.application_role_assignments_v2 (
  assignment_id text PRIMARY KEY,
  application_id text NOT NULL,
  employee_id text NOT NULL,
  stable_role_id text NOT NULL,
  role_code_snapshot text NOT NULL,
  role_name_snapshot text NOT NULL,
  catalog_version text NOT NULL,
  catalog_sha256 text NOT NULL,
  scope_kind text NOT NULL CHECK (scope_kind = 'workspace'),
  scope_value text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'revoked')),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  authority_mode text NOT NULL DEFAULT 'local_legacy' CHECK (authority_mode IN ('local_legacy', 'orgmaster')),
  governance_revision text NOT NULL,
  organization_revision text NOT NULL,
  created_by_principal_id text NOT NULL,
  created_reason text NOT NULL,
  CHECK (catalog_sha256 ~ '^[0-9a-f]{64}$'),
  CHECK (valid_until IS NULL OR valid_from < valid_until)
);

CREATE UNIQUE INDEX IF NOT EXISTS application_role_assignments_v2_active_key
  ON access_governance.application_role_assignments_v2 (application_id, employee_id, stable_role_id, scope_kind, scope_value)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS access_governance.application_management_grants_v2 (
  grant_id text PRIMARY KEY,
  application_id text NOT NULL,
  principal_id text NOT NULL,
  employee_id text NOT NULL,
  capability text NOT NULL CHECK (capability IN ('financial-management-system.role_assignment.manage', 'financial-management-system.role_assignment.publish')),
  status text NOT NULL CHECK (status IN ('active', 'revoked')),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  granted_by_principal_id text NOT NULL,
  governance_revision text NOT NULL,
  organization_revision text NOT NULL,
  reason text NOT NULL,
  CHECK (application_id = 'financial-management-system'),
  CHECK (valid_until IS NULL OR valid_from < valid_until),
  CHECK (length(trim(reason)) BETWEEN 1 AND 240)
);

CREATE UNIQUE INDEX IF NOT EXISTS application_management_grants_v2_active_key
  ON access_governance.application_management_grants_v2 (application_id, principal_id, employee_id, capability)
  WHERE status = 'active';

CREATE VIEW access_governance.v_application_entitlement_authority_v2
WITH (security_barrier = true)
AS
SELECT application_id, employee_id, MAX(authority_mode) AS authority_mode,
       MAX(governance_revision) AS governance_revision,
       MAX(organization_revision) AS organization_revision
FROM access_governance.application_role_assignments_v2
WHERE status = 'active'
GROUP BY application_id, employee_id;

CREATE VIEW access_governance.v_effective_role_assignments_v2
WITH (security_barrier = true)
AS
SELECT assignment.assignment_id, assignment.application_id, assignment.employee_id,
       assignment.stable_role_id, assignment.role_code_snapshot, assignment.role_name_snapshot,
       assignment.catalog_version, assignment.catalog_sha256, assignment.scope_kind,
       assignment.scope_value, assignment.valid_from, assignment.valid_until,
       assignment.governance_revision, assignment.organization_revision,
       assignment.authority_mode
FROM access_governance.application_role_assignments_v2 AS assignment
JOIN access_governance.application_role_catalog_versions_v2 AS catalog
  ON catalog.application_id = assignment.application_id
 AND catalog.catalog_version = assignment.catalog_version
 AND catalog.catalog_sha256 = assignment.catalog_sha256
 AND catalog.status = 'active'
WHERE assignment.status = 'active'
  AND assignment.valid_from <= CURRENT_TIMESTAMP
  AND (assignment.valid_until IS NULL OR assignment.valid_until > CURRENT_TIMESTAMP)
  AND assignment.scope_kind = 'workspace'
  AND assignment.scope_value = 'company-jenfu';

ALTER TABLE access_governance.application_role_catalog_versions_v2 OWNER TO jenfu_platform_migrator;
ALTER TABLE access_governance.application_role_assignments_v2 OWNER TO jenfu_platform_migrator;
ALTER TABLE access_governance.application_management_grants_v2 OWNER TO jenfu_platform_migrator;
ALTER VIEW access_governance.v_application_entitlement_authority_v2 OWNER TO jenfu_platform_migrator;
ALTER VIEW access_governance.v_effective_role_assignments_v2 OWNER TO jenfu_platform_migrator;

REVOKE ALL ON access_governance.application_role_catalog_versions_v2,
  access_governance.application_role_assignments_v2,
  access_governance.application_management_grants_v2,
  access_governance.v_application_entitlement_authority_v2,
  access_governance.v_effective_role_assignments_v2
  FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;
GRANT USAGE ON SCHEMA access_governance TO jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;
GRANT SELECT ON access_governance.v_application_entitlement_authority_v2,
  access_governance.v_effective_role_assignments_v2
  TO jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;

COMMENT ON VIEW access_governance.v_application_entitlement_authority_v2 IS
  'DEV-039 Tier-0 authority projection; one row per application and employee, without holder or credential data.';
COMMENT ON VIEW access_governance.v_effective_role_assignments_v2 IS
  'DEV-039 Tier-0 effective role projection; exact application, catalog version and catalog SHA binding is required.';

COMMIT;
