-- DEV-005 S3: effective entitlement projection, per-employee authority,
-- immutable switch receipts, and durable post-commit session invalidation.
-- Additive and default-off: AI-PDM starts on legacy_authority.
BEGIN;

SET LOCAL ROLE jenfu_platform_migrator;

CREATE SCHEMA IF NOT EXISTS access_governance AUTHORIZATION jenfu_platform_migrator;
ALTER SCHEMA access_governance OWNER TO jenfu_platform_migrator;
REVOKE CREATE ON SCHEMA access_governance FROM PUBLIC;

CREATE TABLE IF NOT EXISTS access_governance.application_authority_state (
  application_id text PRIMARY KEY,
  authority_source text NOT NULL CHECK (authority_source IN ('legacy_authority', 'orgmaster_authority')),
  authority_version bigint NOT NULL CHECK (authority_version >= 1),
  updated_at timestamptz NOT NULL,
  operation_id text NULL,
  actor text NOT NULL,
  reason text NOT NULL,
  CHECK (char_length(application_id) BETWEEN 1 AND 128),
  CHECK (operation_id IS NULL OR char_length(operation_id) BETWEEN 1 AND 255),
  CHECK (char_length(actor) BETWEEN 1 AND 128),
  CHECK (char_length(reason) BETWEEN 1 AND 240)
);

CREATE TABLE IF NOT EXISTS access_governance.employee_authority_overrides (
  application_id text NOT NULL REFERENCES access_governance.application_authority_state(application_id) ON DELETE RESTRICT,
  employee_id text NOT NULL,
  authority_source text NOT NULL CHECK (authority_source IN ('legacy_authority', 'orgmaster_authority')),
  authority_version bigint NOT NULL CHECK (authority_version >= 1),
  updated_at timestamptz NOT NULL,
  operation_id text NOT NULL,
  actor text NOT NULL,
  reason text NOT NULL,
  PRIMARY KEY (application_id, employee_id),
  CHECK (char_length(employee_id) BETWEEN 1 AND 255),
  CHECK (char_length(operation_id) BETWEEN 1 AND 255),
  CHECK (char_length(actor) BETWEEN 1 AND 128),
  CHECK (char_length(reason) BETWEEN 1 AND 240)
);

CREATE TABLE IF NOT EXISTS access_governance.authority_switch_receipts (
  receipt_id uuid PRIMARY KEY,
  operation_id text NOT NULL,
  batch_id text NULL,
  application_id text NOT NULL,
  employee_id text NOT NULL,
  employee_set_hash char(64) NOT NULL CHECK (employee_set_hash ~ '^[a-f0-9]{64}$'),
  from_authority_source text NOT NULL CHECK (from_authority_source IN ('legacy_authority', 'orgmaster_authority')),
  to_authority_source text NOT NULL CHECK (to_authority_source IN ('legacy_authority', 'orgmaster_authority')),
  authority_version bigint NOT NULL CHECK (authority_version >= 1),
  assignment_version_id text NULL,
  session_refresh_state text NOT NULL CHECK (session_refresh_state IN ('pending', 'completed')),
  platform_receipt_id uuid NULL,
  actor text NOT NULL,
  reason text NOT NULL,
  switched_at timestamptz NOT NULL,
  UNIQUE (operation_id, application_id, employee_id),
  CHECK (char_length(operation_id) BETWEEN 1 AND 255),
  CHECK (batch_id IS NULL OR char_length(batch_id) BETWEEN 1 AND 255),
  CHECK (char_length(actor) BETWEEN 1 AND 128),
  CHECK (char_length(reason) BETWEEN 1 AND 240)
);

CREATE TABLE IF NOT EXISTS access_governance.entitlement_change_outbox (
  event_id uuid PRIMARY KEY,
  operation_id text NOT NULL,
  employee_id text NOT NULL,
  application_id text NOT NULL,
  event_kind text NOT NULL CHECK (event_kind IN ('authority_switch', 'governance_publish', 'role_assignment_changed', 'position_source_ended')),
  actor text NOT NULL,
  reason_code text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL,
  lease_until timestamptz NULL,
  worker_id text NULL,
  platform_receipt_id uuid NULL,
  last_error_code text NULL,
  fifth_attempt_alerted_at timestamptz NULL,
  overdue_alerted_at timestamptz NULL,
  created_at timestamptz NOT NULL,
  completed_at timestamptz NULL,
  UNIQUE (operation_id, employee_id, application_id),
  CHECK (char_length(operation_id) BETWEEN 1 AND 255),
  CHECK (char_length(employee_id) BETWEEN 1 AND 255),
  CHECK (char_length(application_id) BETWEEN 1 AND 128),
  CHECK (char_length(actor) BETWEEN 1 AND 128),
  CHECK (char_length(reason_code) BETWEEN 1 AND 128),
  CHECK (worker_id IS NULL OR char_length(worker_id) BETWEEN 1 AND 128),
  CHECK (last_error_code IS NULL OR char_length(last_error_code) BETWEEN 1 AND 128)
);

CREATE INDEX IF NOT EXISTS entitlement_change_outbox_due_idx
  ON access_governance.entitlement_change_outbox (next_attempt_at, created_at)
  WHERE status IN ('pending', 'processing', 'failed');

INSERT INTO access_governance.application_authority_state (
  application_id, authority_source, authority_version, updated_at, operation_id, actor, reason
) VALUES (
  'ai-pdm', 'legacy_authority', 1, clock_timestamp(), NULL, 'migration', 'default_off'
)
ON CONFLICT (application_id) DO NOTHING;

ALTER TABLE access_governance.application_authority_state OWNER TO jenfu_platform_migrator;
ALTER TABLE access_governance.employee_authority_overrides OWNER TO jenfu_platform_migrator;
ALTER TABLE access_governance.authority_switch_receipts OWNER TO jenfu_platform_migrator;
ALTER TABLE access_governance.entitlement_change_outbox OWNER TO jenfu_platform_migrator;

-- V3-compatible principal projection. V2 remains readable during the staged
-- migration, while V3 requires an explicit active principal admission.
CREATE OR REPLACE VIEW access_governance.v_active_principal_links_v1
WITH (security_barrier = true)
AS
WITH active_batch AS (
  SELECT batch.id
  FROM orgmaster.persistence_authority AS authority
  JOIN orgmaster.persistence_batches AS batch
    ON batch.id = authority.active_batch_id
   AND batch.status = 'active'
  WHERE authority.singleton = true
), active_version AS (
  SELECT version.value AS version_payload
  FROM active_batch
  JOIN orgmaster.persistence_artifacts AS governance
    ON governance.batch_id = active_batch.id
   AND governance.artifact_kind = 'governance'
   AND governance.artifact_key IN ('orgmaster-governance.v2.json', 'orgmaster-governance.v3.json')
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(governance.payload->'publishedVersions') = 'array'
      THEN governance.payload->'publishedVersions' ELSE '[]'::jsonb END
  ) AS version(value)
  WHERE version.value->>'id' = governance.payload->>'activePolicyVersionId'
    AND version.value->>'kind' IN ('assignment-governance-v2', 'assignment-governance-v3')
), version_workspace AS (
  SELECT active_version.version_payload, workspace.payload AS workspace_payload
  FROM active_version
  JOIN active_batch ON true
  JOIN orgmaster.persistence_artifacts AS workspace
    ON workspace.batch_id = active_batch.id
   AND workspace.artifact_kind = 'workspace-version'
   AND workspace.artifact_key =
       'orgmaster-versions/' || (active_version.version_payload#>>'{organizationSnapshot,workspaceVersionId}') || '.json'
   AND (
     trim(workspace.source_sha256) = active_version.version_payload#>>'{organizationSnapshot,workspaceRevision}'
     OR trim(workspace.canonical_sha256) = active_version.version_payload#>>'{organizationSnapshot,workspaceRevision}'
   )
), links AS (
  SELECT version_workspace.*, link.value AS link_payload
  FROM version_workspace
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(version_workspace.version_payload#>'{policy,identityLinks}') = 'array'
      THEN version_workspace.version_payload#>'{policy,identityLinks}' ELSE '[]'::jsonb END
  ) AS link(value)
), admitted_links AS (
  SELECT links.*, 'human_personal'::text AS account_type
  FROM links
  WHERE links.version_payload->>'kind' = 'assignment-governance-v2'
  UNION ALL
  SELECT links.*, admission.value->>'accountType' AS account_type
  FROM links
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(links.version_payload#>'{policy,principalAdmissions}') = 'array'
      THEN links.version_payload#>'{policy,principalAdmissions}' ELSE '[]'::jsonb END
  ) AS admission(value)
  WHERE links.version_payload->>'kind' = 'assignment-governance-v3'
    AND admission.value->>'identityLinkId' = links.link_payload->>'id'
    AND admission.value->>'status' = 'active'
    AND admission.value->>'accountType' IN ('human_personal', 'human_privileged')
), active_employees AS (
  SELECT admitted_links.*, employee.value AS employee_payload
  FROM admitted_links
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(admitted_links.workspace_payload#>'{state,employees}') = 'array'
      THEN admitted_links.workspace_payload#>'{state,employees}' ELSE '[]'::jsonb END
  ) AS employee(value)
  WHERE employee.value->>'id' = admitted_links.link_payload->>'employeeId'
    AND employee.value->>'status' = 'active'
)
SELECT
  'organization.active-principal.v1'::text AS contract_version,
  link_payload->>'issuer' AS principal_issuer,
  link_payload->>'subject' AS principal_subject,
  link_payload->>'principalId' AS principal_id,
  link_payload->>'employeeId' AS employee_id,
  account_type,
  employee_payload->>'status' AS employee_status,
  (version_payload->>'versionNumber')::bigint AS mapping_version,
  (version_payload->>'publishedAt')::timestamptz AS published_at
FROM active_employees
WHERE link_payload->>'status' = 'active'
  AND NULLIF(link_payload->>'issuer', '') IS NOT NULL
  AND NULLIF(link_payload->>'subject', '') IS NOT NULL
  AND NULLIF(link_payload->>'principalId', '') IS NOT NULL
  AND NULLIF(link_payload->>'employeeId', '') IS NOT NULL
  AND NULLIF(link_payload->>'validFrom', '') IS NOT NULL
  AND (link_payload->>'validFrom')::timestamptz <= CURRENT_TIMESTAMP
  AND (
    link_payload->>'validTo' IS NULL
    OR (link_payload->>'validTo')::timestamptz > CURRENT_TIMESTAMP
  );

ALTER VIEW access_governance.v_active_principal_links_v1 OWNER TO jenfu_platform_migrator;

CREATE OR REPLACE VIEW organization.v_active_principal_mappings_v1
WITH (security_barrier = true)
AS
SELECT
  contract_version,
  principal_issuer,
  principal_subject,
  principal_id,
  employee_id,
  employee_status,
  mapping_version,
  published_at
FROM access_governance.v_active_principal_links_v1;

ALTER VIEW organization.v_active_principal_mappings_v1 OWNER TO jenfu_platform_migrator;

CREATE OR REPLACE VIEW access_governance.v_ai_pdm_entitlement_authority_v1
WITH (security_barrier = true)
AS
WITH active_employees AS (
  SELECT principal.employee_id
  FROM access_governance.v_active_principal_links_v1 AS principal
  GROUP BY principal.employee_id
)
SELECT
  'jenfu.platform-entitlement.v1'::text AS contract_version,
  app.application_id,
  COALESCE(override.authority_source, app.authority_source) AS authority_source,
  COALESCE(override.authority_version, app.authority_version) AS authority_version,
  employee.employee_id,
  COALESCE(override.updated_at, app.updated_at) AS updated_at,
  COALESCE(override.operation_id, app.operation_id) AS operation_id
FROM access_governance.application_authority_state AS app
CROSS JOIN active_employees AS employee
LEFT JOIN access_governance.employee_authority_overrides AS override
  ON override.application_id = app.application_id
 AND override.employee_id = employee.employee_id
WHERE app.application_id = 'ai-pdm';

ALTER VIEW access_governance.v_ai_pdm_entitlement_authority_v1 OWNER TO jenfu_platform_migrator;

CREATE OR REPLACE VIEW access_governance.v_effective_role_assignments_v1
WITH (security_barrier = true)
AS
WITH active_batch AS (
  SELECT batch.id
  FROM orgmaster.persistence_authority AS authority
  JOIN orgmaster.persistence_batches AS batch
    ON batch.id = authority.active_batch_id
   AND batch.status = 'active'
  WHERE authority.singleton = true
), active_version AS (
  SELECT version.value AS version_payload
  FROM active_batch
  JOIN orgmaster.persistence_artifacts AS governance
    ON governance.batch_id = active_batch.id
   AND governance.artifact_kind = 'governance'
   AND governance.artifact_key = 'orgmaster-governance.v3.json'
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(governance.payload->'publishedVersions') = 'array'
      THEN governance.payload->'publishedVersions' ELSE '[]'::jsonb END
  ) AS version(value)
  WHERE version.value->>'id' = governance.payload->>'activePolicyVersionId'
    AND version.value->>'kind' = 'assignment-governance-v3'
), version_workspace AS (
  SELECT active_version.version_payload, workspace.payload AS workspace_payload
  FROM active_version
  JOIN active_batch ON true
  JOIN orgmaster.persistence_artifacts AS workspace
    ON workspace.batch_id = active_batch.id
   AND workspace.artifact_kind = 'workspace-version'
   AND workspace.artifact_key =
       'orgmaster-versions/' || (active_version.version_payload#>>'{organizationSnapshot,workspaceVersionId}') || '.json'
   AND (
     trim(workspace.source_sha256) = active_version.version_payload#>>'{organizationSnapshot,workspaceRevision}'
     OR trim(workspace.canonical_sha256) = active_version.version_payload#>>'{organizationSnapshot,workspaceRevision}'
   )
), direct_grants AS (
  SELECT
    version_workspace.version_payload,
    version_workspace.workspace_payload,
    assignment.value AS assignment_payload,
    assignment.value->>'employeeId' AS source_employee_id,
    assignment.value->>'employeeId' AS recipient_employee_id,
    'direct'::text AS grant_kind,
    NULL::text AS delegation_id,
    assignment.value->>'id' AS projected_assignment_id,
    assignment.value->>'validFrom' AS projected_valid_from,
    assignment.value->>'validTo' AS projected_valid_until
  FROM version_workspace
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(version_workspace.version_payload#>'{policy,roleAssignments}') = 'array'
      THEN version_workspace.version_payload#>'{policy,roleAssignments}' ELSE '[]'::jsonb END
  ) AS assignment(value)
), delegated_grants AS (
  SELECT
    version_workspace.version_payload,
    version_workspace.workspace_payload,
    source.value AS assignment_payload,
    source.value->>'employeeId' AS source_employee_id,
    delegation.value->>'toEmployeeId' AS recipient_employee_id,
    'delegated'::text AS grant_kind,
    delegation.value->>'id' AS delegation_id,
    delegation.value->>'id' AS projected_assignment_id,
    delegation.value->>'validFrom' AS projected_valid_from,
    delegation.value->>'validTo' AS projected_valid_until
  FROM version_workspace
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(version_workspace.version_payload#>'{policy,roleDelegations}') = 'array'
      THEN version_workspace.version_payload#>'{policy,roleDelegations}' ELSE '[]'::jsonb END
  ) AS delegation(value)
  JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(version_workspace.version_payload#>'{policy,roleAssignments}') = 'array'
      THEN version_workspace.version_payload#>'{policy,roleAssignments}' ELSE '[]'::jsonb END
  ) AS source(value)
    ON source.value->>'id' = delegation.value->>'sourceAssignmentId'
   AND source.value->>'employeeId' = delegation.value->>'fromEmployeeId'
   AND source.value->>'roleId' = delegation.value->>'roleId'
   AND source.value->>'catalogVersion' = delegation.value->>'catalogVersion'
   AND source.value->'scope' = delegation.value->'scope'
  WHERE delegation.value->>'status' = 'active'
    AND NULLIF(delegation.value->>'validFrom', '') IS NOT NULL
    AND NULLIF(delegation.value->>'validTo', '') IS NOT NULL
    AND (delegation.value->>'validFrom')::timestamptz <= CURRENT_TIMESTAMP
    AND (delegation.value->>'validTo')::timestamptz > CURRENT_TIMESTAMP
), grants AS (
  SELECT * FROM direct_grants
  UNION ALL
  SELECT * FROM delegated_grants
), valid_grants AS (
  SELECT grants.*
  FROM grants
  WHERE assignment_payload->>'applicationId' = 'ai-pdm'
    AND assignment_payload->>'status' = 'active'
    AND NULLIF(assignment_payload->>'id', '') IS NOT NULL
    AND NULLIF(assignment_payload->>'employeeId', '') IS NOT NULL
    AND NULLIF(assignment_payload->>'roleId', '') IS NOT NULL
    AND NULLIF(assignment_payload->>'roleCodeSnapshot', '') IS NOT NULL
    AND NULLIF(assignment_payload->>'catalogVersion', '') IS NOT NULL
    AND NULLIF(assignment_payload->>'validFrom', '') IS NOT NULL
    AND (assignment_payload->>'validFrom')::timestamptz <= CURRENT_TIMESTAMP
    AND (
      assignment_payload->>'validTo' IS NULL
      OR (assignment_payload->>'validTo')::timestamptz > CURRENT_TIMESTAMP
    )
    AND NULLIF(projected_assignment_id, '') IS NOT NULL
    AND NULLIF(projected_valid_from, '') IS NOT NULL
    AND (projected_valid_from)::timestamptz <= CURRENT_TIMESTAMP
    AND (
      projected_valid_until IS NULL
      OR (projected_valid_until)::timestamptz > CURRENT_TIMESTAMP
    )
    AND (
      (
        assignment_payload->>'basis' = 'manual'
        AND jsonb_array_length(CASE WHEN jsonb_typeof(assignment_payload->'sources') = 'array' THEN assignment_payload->'sources' ELSE '[]'::jsonb END) = 0
      )
      OR (
        assignment_payload->>'basis' = 'position_adoption'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(assignment_payload->'sources') = 'array' THEN assignment_payload->'sources' ELSE '[]'::jsonb END
          ) AS source(value)
          JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(workspace_payload#>'{state,positions}') = 'array'
              THEN workspace_payload#>'{state,positions}' ELSE '[]'::jsonb END
          ) AS position(value)
            ON position.value->>'id' = source.value->>'positionId'
           AND position.value->>'status' = 'active'
          JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(workspace_payload#>'{state,assignments}') = 'array'
              THEN workspace_payload#>'{state,assignments}' ELSE '[]'::jsonb END
          ) AS position_assignment(value)
            ON position_assignment.value->>'id' = source.value->>'positionAssignmentId'
           AND position_assignment.value->>'positionId' = source.value->>'positionId'
           AND position_assignment.value->>'employeeId' = source_employee_id
          WHERE NULLIF(position_assignment.value->>'validFrom', '') IS NOT NULL
            AND (position_assignment.value->>'validFrom')::timestamptz <= CURRENT_TIMESTAMP
            AND (
              position_assignment.value->>'validTo' IS NULL
              OR (position_assignment.value->>'validTo')::timestamptz > CURRENT_TIMESTAMP
            )
            AND source.value->>'scopeKeySnapshot' = assignment_payload#>>'{scope,value}'
            AND (
              (
                source.value->>'scopeSource' = 'jenfu_workspace'
                AND assignment_payload#>>'{scope,kind}' = 'workspace'
                AND assignment_payload#>>'{scope,value}' = 'company-jenfu'
              )
              OR (
                source.value->>'scopeSource' = 'fixed_project'
                AND assignment_payload#>>'{scope,kind}' = 'project'
                AND NULLIF(assignment_payload#>>'{scope,value}', '') IS NOT NULL
              )
            )
        )
      )
    )
), catalog_valid AS (
  SELECT
    valid_grants.*,
    catalog.stable_role_id,
    catalog.role_code,
    catalog.subject_kind AS catalog_subject_kind
  FROM valid_grants
  JOIN ai_pdm_contract.v_application_role_catalog_v1 AS catalog
    ON catalog.application_id = 'ai-pdm'
   AND catalog.stable_role_id = valid_grants.assignment_payload->>'roleId'
   AND catalog.role_code = valid_grants.assignment_payload->>'roleCodeSnapshot'
   AND catalog.assignable = true
   AND catalog.allowed_scope_kinds ? (valid_grants.assignment_payload#>>'{scope,kind}')
   AND (
     valid_grants.grant_kind = 'direct'
     OR catalog.delegation_allowed = true
   )
  WHERE valid_grants.assignment_payload#>>'{scope,kind}' IN ('workspace', 'project', 'global')
    AND (
      (
        valid_grants.assignment_payload#>>'{scope,kind}' = 'global'
        AND valid_grants.assignment_payload#>'{scope,value}' IS NULL
      )
      OR (
        valid_grants.assignment_payload#>>'{scope,kind}' <> 'global'
        AND NULLIF(valid_grants.assignment_payload#>>'{scope,value}', '') IS NOT NULL
      )
    )
    AND (
      valid_grants.assignment_payload->>'roleId' <> 'role-external-specialist'
      OR (
        valid_grants.assignment_payload#>>'{scope,kind}' = 'project'
        AND valid_grants.assignment_payload->>'validTo' IS NOT NULL
        AND NULLIF(valid_grants.assignment_payload#>>'{metadata,sponsorEmployeeId}', '') IS NOT NULL
        AND NULLIF(valid_grants.assignment_payload#>>'{metadata,reviewDueAt}', '') IS NOT NULL
      )
    )
), resolved AS (
  SELECT
    catalog_valid.*,
    principal.principal_issuer,
    principal.principal_subject,
    principal.principal_id,
    principal.employee_id,
    principal.account_type,
    authority.authority_version
  FROM catalog_valid
  JOIN access_governance.v_active_principal_links_v1 AS principal
    ON principal.employee_id = catalog_valid.recipient_employee_id
   AND (
     (
       catalog_valid.grant_kind = 'delegated'
       AND catalog_valid.catalog_subject_kind = 'employee'
       AND principal.account_type = 'human_personal'
     )
     OR (
       catalog_valid.grant_kind = 'direct'
       AND catalog_valid.assignment_payload->>'subjectKind' = 'employee'
       AND catalog_valid.assignment_payload->'targetPrincipalId' = 'null'::jsonb
       AND catalog_valid.catalog_subject_kind = 'employee'
       AND principal.account_type = 'human_personal'
     )
     OR (
       catalog_valid.grant_kind = 'direct'
       AND catalog_valid.assignment_payload->>'subjectKind' = 'principal'
       AND catalog_valid.assignment_payload->>'targetPrincipalId' = principal.principal_id
       AND catalog_valid.catalog_subject_kind = 'principal'
       AND principal.account_type = 'human_privileged'
     )
   )
  JOIN access_governance.v_ai_pdm_entitlement_authority_v1 AS authority
    ON authority.application_id = 'ai-pdm'
   AND authority.employee_id = catalog_valid.recipient_employee_id
   AND authority.authority_source = 'orgmaster_authority'
)
SELECT
  'jenfu.platform-entitlement.v1'::text AS contract_version,
  version_payload->>'id' AS assignment_version_id,
  (version_payload->>'versionNumber')::bigint AS assignment_version,
  projected_assignment_id AS assignment_id,
  grant_kind,
  delegation_id,
  'ai-pdm'::text AS application_id,
  principal_issuer AS identity_issuer,
  principal_subject AS identity_subject,
  principal_id,
  employee_id,
  CASE WHEN grant_kind = 'delegated' THEN 'employee' ELSE assignment_payload->>'subjectKind' END AS subject_kind,
  CASE WHEN grant_kind = 'delegated' THEN NULL ELSE assignment_payload->>'targetPrincipalId' END AS target_principal_id,
  stable_role_id,
  role_code,
  assignment_payload->>'catalogVersion' AS catalog_version,
  assignment_payload#>>'{scope,kind}' AS scope_kind,
  assignment_payload#>>'{scope,value}' AS scope_key,
  (projected_valid_from)::timestamptz AS valid_from,
  (projected_valid_until)::timestamptz AS valid_until,
  (version_payload->>'publishedAt')::timestamptz AS published_at,
  authority_version
FROM resolved;

ALTER VIEW access_governance.v_effective_role_assignments_v1 OWNER TO jenfu_platform_migrator;

CREATE OR REPLACE VIEW access_governance.v_ai_pdm_effective_role_assignments_v1
WITH (security_barrier = true)
AS
SELECT *
FROM access_governance.v_effective_role_assignments_v1
WHERE application_id = 'ai-pdm';

ALTER VIEW access_governance.v_ai_pdm_effective_role_assignments_v1 OWNER TO jenfu_platform_migrator;

CREATE OR REPLACE FUNCTION access_governance.enqueue_entitlement_change_v1(
  p_operation_id text,
  p_employee_id text,
  p_application_id text,
  p_event_kind text,
  p_actor text,
  p_reason_code text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_event_id uuid := gen_random_uuid();
  v_existing access_governance.entitlement_change_outbox%ROWTYPE;
BEGIN
  IF btrim(p_operation_id) IS NULL OR char_length(btrim(p_operation_id)) NOT BETWEEN 1 AND 255
    OR btrim(p_employee_id) IS NULL OR char_length(btrim(p_employee_id)) NOT BETWEEN 1 AND 255
    OR p_application_id <> 'ai-pdm'
    OR p_event_kind NOT IN ('authority_switch', 'governance_publish', 'role_assignment_changed', 'position_source_ended')
    OR btrim(p_actor) IS NULL OR char_length(btrim(p_actor)) NOT BETWEEN 1 AND 128
    OR btrim(p_reason_code) IS NULL OR char_length(btrim(p_reason_code)) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'ENTITLEMENT_OUTBOX_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM access_governance.entitlement_change_outbox AS event
  WHERE event.operation_id = btrim(p_operation_id)
    AND event.employee_id = btrim(p_employee_id)
    AND event.application_id = p_application_id;
  IF FOUND THEN
    IF v_existing.event_kind <> p_event_kind
      OR v_existing.actor <> btrim(p_actor)
      OR v_existing.reason_code <> btrim(p_reason_code) THEN
      RAISE EXCEPTION 'ENTITLEMENT_OUTBOX_OPERATION_REUSED' USING ERRCODE = '23505';
    END IF;
    RETURN v_existing.event_id;
  END IF;

  INSERT INTO access_governance.entitlement_change_outbox (
    event_id, operation_id, employee_id, application_id, event_kind,
    actor, reason_code, status, next_attempt_at, created_at
  ) VALUES (
    v_event_id, btrim(p_operation_id), btrim(p_employee_id), p_application_id, p_event_kind,
    btrim(p_actor), btrim(p_reason_code), 'pending', clock_timestamp(), clock_timestamp()
  );
  RETURN v_event_id;
END;
$function$;

CREATE OR REPLACE FUNCTION access_governance.switch_employee_entitlement_authority_v1(
  p_application_id text,
  p_employee_id text,
  p_to_authority_source text,
  p_expected_authority_version bigint,
  p_operation_id text,
  p_batch_id text,
  p_assignment_version_id text,
  p_actor text,
  p_reason text
)
RETURNS TABLE (
  receipt_id uuid,
  authority_version bigint,
  outbox_event_id uuid,
  session_refresh_state text,
  replayed boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_app access_governance.application_authority_state%ROWTYPE;
  v_override access_governance.employee_authority_overrides%ROWTYPE;
  v_existing access_governance.authority_switch_receipts%ROWTYPE;
  v_from text;
  v_current_version bigint;
  v_next_version bigint;
  v_receipt_id uuid := gen_random_uuid();
  v_event_id uuid;
  v_now timestamptz := clock_timestamp();
  v_hash text;
BEGIN
  IF p_application_id <> 'ai-pdm'
    OR btrim(p_employee_id) IS NULL OR char_length(btrim(p_employee_id)) NOT BETWEEN 1 AND 255
    OR p_to_authority_source NOT IN ('legacy_authority', 'orgmaster_authority')
    OR p_expected_authority_version < 1
    OR btrim(p_operation_id) IS NULL OR char_length(btrim(p_operation_id)) NOT BETWEEN 1 AND 255
    OR btrim(p_actor) IS NULL OR char_length(btrim(p_actor)) NOT BETWEEN 1 AND 128
    OR btrim(p_reason) IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 240 THEN
    RAISE EXCEPTION 'ENTITLEMENT_AUTHORITY_SWITCH_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM access_governance.v_active_principal_links_v1 AS principal
    WHERE principal.employee_id = btrim(p_employee_id)
  ) THEN
    RAISE EXCEPTION 'ENTITLEMENT_AUTHORITY_EMPLOYEE_INACTIVE' USING ERRCODE = '23503';
  END IF;

  SELECT * INTO v_existing
  FROM access_governance.authority_switch_receipts AS receipt
  WHERE receipt.operation_id = btrim(p_operation_id)
    AND receipt.application_id = p_application_id
    AND receipt.employee_id = btrim(p_employee_id);
  IF FOUND THEN
    IF v_existing.to_authority_source <> p_to_authority_source
      OR v_existing.actor <> btrim(p_actor)
      OR v_existing.reason <> btrim(p_reason)
      OR v_existing.batch_id IS DISTINCT FROM NULLIF(btrim(p_batch_id), '')
      OR v_existing.assignment_version_id IS DISTINCT FROM NULLIF(btrim(p_assignment_version_id), '') THEN
      RAISE EXCEPTION 'ENTITLEMENT_AUTHORITY_OPERATION_REUSED' USING ERRCODE = '23505';
    END IF;
    SELECT event.event_id INTO v_event_id
    FROM access_governance.entitlement_change_outbox AS event
    WHERE event.operation_id = v_existing.operation_id
      AND event.employee_id = v_existing.employee_id
      AND event.application_id = v_existing.application_id;
    RETURN QUERY SELECT v_existing.receipt_id, v_existing.authority_version, v_event_id,
      v_existing.session_refresh_state, true;
    RETURN;
  END IF;

  SELECT * INTO v_app
  FROM access_governance.application_authority_state AS app
  WHERE app.application_id = p_application_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ENTITLEMENT_AUTHORITY_STATE_NOT_FOUND' USING ERRCODE = '23503'; END IF;

  SELECT * INTO v_override
  FROM access_governance.employee_authority_overrides AS override
  WHERE override.application_id = p_application_id
    AND override.employee_id = btrim(p_employee_id)
  FOR UPDATE;

  IF FOUND THEN
    v_from := v_override.authority_source;
    v_current_version := v_override.authority_version;
  ELSE
    v_from := v_app.authority_source;
    v_current_version := v_app.authority_version;
  END IF;
  IF v_current_version <> p_expected_authority_version THEN
    RAISE EXCEPTION 'ENTITLEMENT_AUTHORITY_VERSION_CONFLICT' USING ERRCODE = '40001';
  END IF;
  v_next_version := v_current_version + 1;
  v_hash := md5(btrim(p_employee_id)) || md5('employee-set:' || btrim(p_employee_id));

  INSERT INTO access_governance.employee_authority_overrides (
    application_id, employee_id, authority_source, authority_version,
    updated_at, operation_id, actor, reason
  ) VALUES (
    p_application_id, btrim(p_employee_id), p_to_authority_source, v_next_version,
    v_now, btrim(p_operation_id), btrim(p_actor), btrim(p_reason)
  )
  ON CONFLICT (application_id, employee_id) DO UPDATE SET
    authority_source = EXCLUDED.authority_source,
    authority_version = EXCLUDED.authority_version,
    updated_at = EXCLUDED.updated_at,
    operation_id = EXCLUDED.operation_id,
    actor = EXCLUDED.actor,
    reason = EXCLUDED.reason;

  INSERT INTO access_governance.authority_switch_receipts (
    receipt_id, operation_id, batch_id, application_id, employee_id, employee_set_hash,
    from_authority_source, to_authority_source, authority_version, assignment_version_id,
    session_refresh_state, actor, reason, switched_at
  ) VALUES (
    v_receipt_id, btrim(p_operation_id), NULLIF(btrim(p_batch_id), ''), p_application_id,
    btrim(p_employee_id), v_hash, v_from, p_to_authority_source, v_next_version,
    NULLIF(btrim(p_assignment_version_id), ''), 'pending', btrim(p_actor), btrim(p_reason), v_now
  );

  v_event_id := access_governance.enqueue_entitlement_change_v1(
    btrim(p_operation_id), btrim(p_employee_id), p_application_id,
    'authority_switch', btrim(p_actor), 'entitlement_authority_switch'
  );

  RETURN QUERY SELECT v_receipt_id, v_next_version, v_event_id, 'pending'::text, false;
END;
$function$;

CREATE OR REPLACE FUNCTION access_governance.claim_entitlement_change_outbox_v1(
  p_worker_id text,
  p_limit integer DEFAULT 16,
  p_lease_seconds integer DEFAULT 30
)
RETURNS TABLE (
  event_id uuid,
  operation_id text,
  employee_id text,
  application_id text,
  event_kind text,
  actor text,
  reason_code text,
  attempt_count integer,
  lease_until timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF btrim(p_worker_id) IS NULL OR char_length(btrim(p_worker_id)) NOT BETWEEN 1 AND 128
    OR p_limit NOT BETWEEN 1 AND 100
    OR p_lease_seconds NOT BETWEEN 5 AND 300 THEN
    RAISE EXCEPTION 'ENTITLEMENT_OUTBOX_CLAIM_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH candidate AS (
    SELECT event.event_id
    FROM access_governance.entitlement_change_outbox AS event
    WHERE event.next_attempt_at <= clock_timestamp()
      AND (
        event.status IN ('pending', 'failed')
        OR (event.status = 'processing' AND event.lease_until <= clock_timestamp())
      )
    ORDER BY event.next_attempt_at, event.created_at, event.event_id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  ), claimed AS (
    UPDATE access_governance.entitlement_change_outbox AS event
    SET status = 'processing',
        worker_id = btrim(p_worker_id),
        attempt_count = event.attempt_count + 1,
        lease_until = clock_timestamp() + make_interval(secs => p_lease_seconds)
    FROM candidate
    WHERE event.event_id = candidate.event_id
    RETURNING event.*
  )
  SELECT claimed.event_id, claimed.operation_id, claimed.employee_id,
    claimed.application_id, claimed.event_kind, claimed.actor,
    claimed.reason_code, claimed.attempt_count, claimed.lease_until
  FROM claimed
  ORDER BY claimed.created_at, claimed.event_id;
END;
$function$;

CREATE OR REPLACE FUNCTION access_governance.complete_entitlement_change_outbox_v1(
  p_event_id uuid,
  p_worker_id text,
  p_platform_receipt_id uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  UPDATE access_governance.entitlement_change_outbox AS event
  SET status = 'completed', platform_receipt_id = p_platform_receipt_id,
      completed_at = clock_timestamp(), lease_until = NULL, worker_id = NULL,
      last_error_code = NULL
  WHERE event.event_id = p_event_id
    AND event.status = 'processing'
    AND event.worker_id = btrim(p_worker_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'ENTITLEMENT_OUTBOX_LEASE_NOT_OWNED' USING ERRCODE = '55000'; END IF;

  UPDATE access_governance.authority_switch_receipts AS receipt
  SET session_refresh_state = 'completed', platform_receipt_id = p_platform_receipt_id
  FROM access_governance.entitlement_change_outbox AS event
  WHERE event.event_id = p_event_id
    AND receipt.operation_id = event.operation_id
    AND receipt.employee_id = event.employee_id
    AND receipt.application_id = event.application_id;
END;
$function$;

CREATE OR REPLACE FUNCTION access_governance.retry_entitlement_change_outbox_v1(
  p_event_id uuid,
  p_worker_id text,
  p_error_code text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_attempt integer;
BEGIN
  IF btrim(p_error_code) IS NULL OR char_length(btrim(p_error_code)) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'ENTITLEMENT_OUTBOX_ERROR_CODE_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT event.attempt_count INTO v_attempt
  FROM access_governance.entitlement_change_outbox AS event
  WHERE event.event_id = p_event_id
    AND event.status = 'processing'
    AND event.worker_id = btrim(p_worker_id)
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ENTITLEMENT_OUTBOX_LEASE_NOT_OWNED' USING ERRCODE = '55000'; END IF;

  UPDATE access_governance.entitlement_change_outbox AS event
  SET status = 'failed',
      next_attempt_at = clock_timestamp() + CASE
        WHEN v_attempt <= 1 THEN interval '1 minute'
        WHEN v_attempt = 2 THEN interval '5 minutes'
        WHEN v_attempt = 3 THEN interval '15 minutes'
        ELSE interval '60 minutes'
      END,
      lease_until = NULL,
      worker_id = NULL,
      last_error_code = btrim(p_error_code),
      fifth_attempt_alerted_at = CASE
        WHEN v_attempt >= 5 THEN COALESCE(event.fifth_attempt_alerted_at, clock_timestamp())
        ELSE event.fifth_attempt_alerted_at END,
      overdue_alerted_at = CASE
        WHEN event.created_at <= clock_timestamp() - interval '24 hours'
          THEN COALESCE(event.overdue_alerted_at, clock_timestamp())
        ELSE event.overdue_alerted_at END
  WHERE event.event_id = p_event_id;
END;
$function$;

-- Cloud persistence callers use this wrapper when the same committed artifact
-- change alters effective authorization. Non-entitlement workspace writes can
-- continue to use the existing persistence function.
CREATE OR REPLACE FUNCTION orgmaster.write_active_persistence_artifacts_with_entitlement_outbox_v1(
  p_changes jsonb,
  p_source_revision text,
  p_updated_by text,
  p_reason_code text,
  p_entitlement_changes jsonb
)
RETURNS TABLE (
  authority_version bigint,
  source_revision text,
  outbox_count integer
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_write record;
  v_change jsonb;
  v_count integer := 0;
BEGIN
  IF jsonb_typeof(p_entitlement_changes) <> 'array'
    OR jsonb_array_length(p_entitlement_changes) < 1
    OR jsonb_array_length(p_entitlement_changes) > 100 THEN
    RAISE EXCEPTION 'ENTITLEMENT_CHANGES_INVALID' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_entitlement_changes) AS change(value)
    GROUP BY change.value->>'operationId', change.value->>'employeeId', change.value->>'applicationId'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'ENTITLEMENT_CHANGE_DUPLICATE' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_write
  FROM orgmaster.write_active_persistence_artifacts_v1(
    p_changes, p_source_revision, p_updated_by, p_reason_code
  );

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_entitlement_changes)
  LOOP
    PERFORM access_governance.enqueue_entitlement_change_v1(
      v_change->>'operationId',
      v_change->>'employeeId',
      v_change->>'applicationId',
      v_change->>'eventKind',
      COALESCE(NULLIF(v_change->>'actor', ''), p_updated_by),
      COALESCE(NULLIF(v_change->>'reasonCode', ''), p_reason_code)
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN QUERY SELECT v_write.authority_version, v_write.source_revision, v_count;
END;
$function$;

ALTER FUNCTION access_governance.enqueue_entitlement_change_v1(text, text, text, text, text, text) OWNER TO jenfu_platform_migrator;
ALTER FUNCTION access_governance.switch_employee_entitlement_authority_v1(text, text, text, bigint, text, text, text, text, text) OWNER TO jenfu_platform_migrator;
ALTER FUNCTION access_governance.claim_entitlement_change_outbox_v1(text, integer, integer) OWNER TO jenfu_platform_migrator;
ALTER FUNCTION access_governance.complete_entitlement_change_outbox_v1(uuid, text, uuid) OWNER TO jenfu_platform_migrator;
ALTER FUNCTION access_governance.retry_entitlement_change_outbox_v1(uuid, text, text) OWNER TO jenfu_platform_migrator;
ALTER FUNCTION orgmaster.write_active_persistence_artifacts_with_entitlement_outbox_v1(jsonb, text, text, text, jsonb) OWNER TO jenfu_platform_migrator;

REVOKE ALL ON ALL TABLES IN SCHEMA access_governance FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA access_governance
  FROM jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA access_governance FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA access_governance
  FROM jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;
REVOKE ALL ON FUNCTION orgmaster.write_active_persistence_artifacts_with_entitlement_outbox_v1(jsonb, text, text, text, jsonb)
  FROM PUBLIC, jenfu_platform_runtime, jenfu_ai_pdm_runtime;

GRANT USAGE ON SCHEMA access_governance TO jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;
GRANT SELECT ON access_governance.v_ai_pdm_entitlement_authority_v1 TO jenfu_ai_pdm_runtime;
GRANT SELECT ON access_governance.v_ai_pdm_effective_role_assignments_v1 TO jenfu_ai_pdm_runtime;
GRANT EXECUTE ON FUNCTION access_governance.enqueue_entitlement_change_v1(text, text, text, text, text, text) TO jenfu_orgmaster_runtime;
GRANT EXECUTE ON FUNCTION access_governance.switch_employee_entitlement_authority_v1(text, text, text, bigint, text, text, text, text, text) TO jenfu_orgmaster_runtime;
GRANT EXECUTE ON FUNCTION access_governance.claim_entitlement_change_outbox_v1(text, integer, integer) TO jenfu_orgmaster_runtime;
GRANT EXECUTE ON FUNCTION access_governance.complete_entitlement_change_outbox_v1(uuid, text, uuid) TO jenfu_orgmaster_runtime;
GRANT EXECUTE ON FUNCTION access_governance.retry_entitlement_change_outbox_v1(uuid, text, text) TO jenfu_orgmaster_runtime;
GRANT EXECUTE ON FUNCTION orgmaster.write_active_persistence_artifacts_with_entitlement_outbox_v1(jsonb, text, text, text, jsonb) TO jenfu_orgmaster_runtime;

ALTER DEFAULT PRIVILEGES FOR ROLE jenfu_platform_migrator IN SCHEMA access_governance
  REVOKE ALL ON TABLES FROM PUBLIC;

COMMENT ON VIEW access_governance.v_ai_pdm_effective_role_assignments_v1 IS
  'AI-PDM-only, request-time effective role assignments. Draft, legacy authority, inactive identity/employee, invalid scope, expired and source-ended rows are omitted.';
COMMENT ON TABLE access_governance.entitlement_change_outbox IS
  'Post-commit session refresh queue. Authorization correctness comes from committed authority/projection state, never worker completion.';

COMMIT;
