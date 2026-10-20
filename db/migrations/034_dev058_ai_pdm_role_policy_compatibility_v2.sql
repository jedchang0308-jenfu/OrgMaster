-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: ai-pdm.role-policy-consumer-compatibility.v2
-- compatibility: new-version
-- governance-review: DEV-058

BEGIN;

SET LOCAL ROLE jenfu_orgmaster_migrator;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

SELECT pg_advisory_xact_lock(
  hashtext('dev058-ai-pdm-role-policy-compatibility-v2'),
  hashtext(current_database())
);

CREATE TABLE orgmaster_core.ai_pdm_role_policy_compatibility (
  application_id text NOT NULL CHECK (application_id = 'ai-pdm'),
  consumer_id text NOT NULL CHECK (consumer_id = 'orgmaster'),
  contract_version text NOT NULL CHECK (contract_version = 'ai-pdm.role-policy-consumer-compatibility.v2'),
  compatibility_revision bigint NOT NULL CHECK (compatibility_revision >= 0),
  supported_publication_format text NOT NULL CHECK (supported_publication_format = 'dynamic-policy-v1'),
  supported_canonicalization_version text NOT NULL CHECK (supported_canonicalization_version = 'jenfu.canonical-json.v1'),
  supported_role_schema_id text NOT NULL CHECK (supported_role_schema_id = 'ai-pdm.role-schema.flexible.v2'),
  supported_role_profile_schema_id text NOT NULL CHECK (supported_role_profile_schema_id = 'ai-pdm.role-profile-schema.v1'),
  accepted_registry_hash char(64) NULL CHECK (accepted_registry_hash IS NULL OR accepted_registry_hash ~ '^[a-f0-9]{64}$'),
  accepted_baseline_role_identity_hash char(64) NULL CHECK (accepted_baseline_role_identity_hash IS NULL OR accepted_baseline_role_identity_hash ~ '^[a-f0-9]{64}$'),
  accepted_protected_policy_hash char(64) NULL CHECK (accepted_protected_policy_hash IS NULL OR accepted_protected_policy_hash ~ '^[a-f0-9]{64}$'),
  consumer_source_revision char(40) NULL CHECK (consumer_source_revision IS NULL OR consumer_source_revision ~ '^[a-f0-9]{40}$'),
  enablement_ref text NULL CHECK (enablement_ref IS NULL OR char_length(enablement_ref) BETWEEN 1 AND 500),
  readiness text NOT NULL DEFAULT 'NOT_READY' CHECK (readiness IN ('NOT_READY', 'READY')),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (application_id, consumer_id),
  CHECK (
    readiness = 'NOT_READY'
    OR (
      accepted_registry_hash IS NOT NULL
      AND accepted_baseline_role_identity_hash IS NOT NULL
      AND accepted_protected_policy_hash IS NOT NULL
      AND consumer_source_revision IS NOT NULL
      AND enablement_ref IS NOT NULL
      AND compatibility_revision > 0
    )
  )
);

INSERT INTO orgmaster_core.ai_pdm_role_policy_compatibility (
  application_id,
  consumer_id,
  contract_version,
  compatibility_revision,
  supported_publication_format,
  supported_canonicalization_version,
  supported_role_schema_id,
  supported_role_profile_schema_id,
  readiness
) VALUES (
  'ai-pdm',
  'orgmaster',
  'ai-pdm.role-policy-consumer-compatibility.v2',
  0,
  'dynamic-policy-v1',
  'jenfu.canonical-json.v1',
  'ai-pdm.role-schema.flexible.v2',
  'ai-pdm.role-profile-schema.v1',
  'NOT_READY'
);

CREATE VIEW orgmaster_contract.v_ai_pdm_role_policy_compatibility_v2
WITH (security_barrier = true) AS
SELECT
  application_id,
  consumer_id,
  contract_version,
  compatibility_revision,
  supported_publication_format,
  supported_canonicalization_version,
  supported_role_schema_id,
  supported_role_profile_schema_id,
  accepted_registry_hash,
  accepted_baseline_role_identity_hash,
  accepted_protected_policy_hash,
  consumer_source_revision,
  enablement_ref,
  readiness
FROM orgmaster_core.ai_pdm_role_policy_compatibility;

COMMENT ON TABLE orgmaster_core.ai_pdm_role_policy_compatibility IS
  'Owner-controlled AI-PDM dynamic role-policy consumer readiness. Runtime identities are read-only.';
COMMENT ON VIEW orgmaster_contract.v_ai_pdm_role_policy_compatibility_v2 IS
  'Fourteen-column AI-PDM/OrgMaster compatibility declaration; initial state is NOT_READY.';

REVOKE ALL ON TABLE orgmaster_core.ai_pdm_role_policy_compatibility
  FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;
REVOKE ALL ON TABLE orgmaster_contract.v_ai_pdm_role_policy_compatibility_v2
  FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;
GRANT USAGE ON SCHEMA orgmaster_contract TO jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;
GRANT SELECT ON orgmaster_contract.v_ai_pdm_role_policy_compatibility_v2
  TO jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;

INSERT INTO orgmaster_core.contract_manifest (
  contract_id,
  contract_version,
  signature_sha256,
  payload_sha256
) VALUES (
  'orgmaster.ai-pdm-role-policy-consumer-compatibility-v2',
  'ai-pdm.role-policy-consumer-compatibility.v2',
  '398d6c501c7f69e609750774a40b093be8197129fe73115e51b77ad22c34b94c',
  NULL
);

COMMIT;
