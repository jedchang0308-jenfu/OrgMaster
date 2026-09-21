-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: additive OrgMaster managed identity lifecycle producer v1
-- compatibility: additive
-- governance-review: DEV-014 / OrgMaster DEV-052

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SELECT pg_advisory_xact_lock(
  hashtext('dev014-managed-identity-lifecycle-contract'),
  hashtext(current_database())
);
SET LOCAL ROLE jenfu_orgmaster_migrator;

-- One lifecycle event is addressed to one application.  The Platform
-- consumer receives only its own events and never reads orgmaster_core.
CREATE VIEW orgmaster_contract.v_managed_identity_lifecycle_events_v1
WITH (security_barrier = true)
AS
SELECT
  outbox.event_id::text AS event_id,
  outbox.employee_id,
  outbox.event_kind
FROM orgmaster_core.managed_identity_lifecycle_outbox AS outbox
WHERE outbox.application_id = 'platform';

-- Invalidation must include a principal after it disappears from the active
-- admission projection.  The reservation registry is append-only and records
-- every legacy or managed issuer/subject pair ever bound to the employee.
CREATE VIEW orgmaster_contract.v_managed_identity_lifecycle_event_principals_v1
WITH (security_barrier = true)
AS
SELECT
  outbox.event_id::text AS event_id,
  reservation.principal_issuer,
  reservation.principal_subject
FROM orgmaster_core.managed_identity_lifecycle_outbox AS outbox
JOIN orgmaster_core.principal_identity_reservations AS reservation
  ON reservation.employee_id = outbox.employee_id
WHERE outbox.application_id = 'platform';

INSERT INTO orgmaster_core.contract_manifest (
  contract_id,
  contract_version,
  signature_sha256,
  payload_sha256
) VALUES (
  'orgmaster.identity-lifecycle',
  'jenfu.orgmaster-contract.managed-identity-lifecycle.v1',
  '57771a5c7f2406245f724ee07f2c80ef95bd918dc9dbc66a2823a7a1626de5ee',
  NULL
)
ON CONFLICT (contract_id) DO UPDATE SET
  contract_version = EXCLUDED.contract_version,
  signature_sha256 = EXCLUDED.signature_sha256,
  payload_sha256 = EXCLUDED.payload_sha256,
  published_at = clock_timestamp();

ALTER VIEW orgmaster_contract.v_managed_identity_lifecycle_events_v1
  OWNER TO jenfu_orgmaster_migrator;
ALTER VIEW orgmaster_contract.v_managed_identity_lifecycle_event_principals_v1
  OWNER TO jenfu_orgmaster_migrator;

REVOKE ALL ON TABLE orgmaster_contract.v_managed_identity_lifecycle_events_v1
  FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;
REVOKE ALL ON TABLE orgmaster_contract.v_managed_identity_lifecycle_event_principals_v1
  FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;

-- Platform's SECURITY DEFINER consumer functions are owned by the Platform
-- migrator.  No application runtime receives direct producer-table access.
GRANT SELECT ON TABLE
  orgmaster_contract.v_managed_identity_lifecycle_events_v1,
  orgmaster_contract.v_managed_identity_lifecycle_event_principals_v1
TO jenfu_platform_migrator;

COMMIT;
