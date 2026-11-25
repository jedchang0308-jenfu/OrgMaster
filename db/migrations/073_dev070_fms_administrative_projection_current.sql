-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: existing administrative grant and Portal visibility projections
-- compatibility: backward-compatible
-- governance-review: DEV-070 / Platform DEV-015 native FMS administrator entry
BEGIN;
SET LOCAL ROLE jenfu_orgmaster_migrator;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

-- 050 renamed the original function. PostgreSQL kept this view bound to its
-- original OID (now legacy), not the new compatibility function with that name.
-- Reparse only the FMS catalog decision against the current function. Other
-- applications retain the legacy decision; all original identity fences remain.
-- CREATE OR REPLACE preserves the view OID, owner and existing ACL.
CREATE OR REPLACE VIEW orgmaster_core.v_effective_administrative_grants_v1 WITH(security_barrier=true) AS
WITH publication AS (SELECT orgmaster_core.read_administration_publication_v1() AS payload),
native AS (
 SELECT principal_id,min(employee_id) employee_id FROM orgmaster_contract.v_active_principal_accounts_v1
 WHERE employee_status='active' AND account_type IN ('human_personal','human_privileged')
 GROUP BY principal_id HAVING count(DISTINCT employee_id)=1 AND count(DISTINCT account_type)=1
), grants AS (
 SELECT publication.payload,grant_row.value AS grant_payload FROM publication
 CROSS JOIN LATERAL jsonb_array_elements(COALESCE(publication.payload#>'{policy,administration,grants}','[]'::jsonb)) grant_row(value)
)
SELECT grants.payload AS publication,grants.grant_payload
FROM grants JOIN native ON native.principal_id=grants.grant_payload->>'principalId' AND native.employee_id=grants.grant_payload->>'employeeId'
JOIN orgmaster_core.v_current_workspace_employees_v1 employee ON employee.employee_id=native.employee_id AND employee.employee_status='active'
WHERE grant_payload->>'status'='active' AND grant_payload->>'subjectKind'='principal' AND grant_payload->>'basis'='manual'
 AND (grant_payload->>'validFrom')::timestamptz<=CURRENT_TIMESTAMP
 AND ((grant_payload->>'validTo') IS NULL OR (grant_payload->>'validTo')::timestamptz>CURRENT_TIMESTAMP)
 AND ((grant_payload->>'roleCode'='platform_super_admin' AND grant_payload->>'applicationId' IS NULL AND grant_payload#>>'{scope,kind}'='platform' AND grant_payload->>'validTo' IS NULL AND grant_payload->>'catalogBinding' IS NULL)
 OR (grant_payload->>'roleCode'='application_system_admin' AND grant_payload#>>'{scope,kind}'='global' AND grant_payload->>'applicationId' IN ('orgmaster','ai-pdm','financial-management-system')
 AND CASE WHEN grant_payload->>'applicationId'='financial-management-system'
  THEN orgmaster_core.administrative_catalog_current_v1(grant_payload->>'applicationId',grant_payload->'catalogBinding')
  ELSE orgmaster_core.administrative_catalog_current_legacy_v1(grant_payload->>'applicationId',grant_payload->'catalogBinding') END));

COMMIT;
