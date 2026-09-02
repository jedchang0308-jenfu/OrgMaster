BEGIN;

SET LOCAL ROLE jenfu_platform_migrator;

CREATE SCHEMA IF NOT EXISTS orgmaster AUTHORIZATION jenfu_platform_migrator;
ALTER SCHEMA orgmaster OWNER TO jenfu_platform_migrator;
REVOKE CREATE ON SCHEMA orgmaster FROM PUBLIC;

CREATE TABLE IF NOT EXISTS orgmaster.persistence_batches (
  id uuid PRIMARY KEY,
  source_revision char(64) UNIQUE NOT NULL,
  contract_version text NOT NULL CHECK (contract_version = 'jenfu.orgmaster-persistence.v1'),
  source_manifest jsonb NOT NULL,
  artifact_count integer NOT NULL CHECK (artifact_count >= 0),
  media_count integer NOT NULL CHECK (media_count >= 0),
  source_bytes bigint NOT NULL CHECK (source_bytes >= 0),
  status text NOT NULL CHECK (status IN ('shadow', 'active', 'retired')),
  imported_at timestamptz NOT NULL,
  verified_at timestamptz NULL,
  activated_at timestamptz NULL,
  retired_at timestamptz NULL,
  CONSTRAINT orgmaster_persistence_batches_source_hash
    CHECK (source_revision ~ '^[0-9a-f]{64}$')
);

CREATE TABLE IF NOT EXISTS orgmaster.persistence_artifacts (
  batch_id uuid NOT NULL REFERENCES orgmaster.persistence_batches(id) ON DELETE RESTRICT,
  artifact_key text NOT NULL,
  artifact_kind text NOT NULL CHECK (artifact_kind IN ('workspace-manifest', 'workspace-version', 'governance', 'management-methods')),
  payload jsonb NOT NULL,
  source_sha256 char(64) NOT NULL,
  canonical_sha256 char(64) NOT NULL,
  source_bytes bigint NOT NULL CHECK (source_bytes >= 0),
  imported_at timestamptz NOT NULL,
  PRIMARY KEY (batch_id, artifact_key),
  CONSTRAINT orgmaster_persistence_artifacts_key
    CHECK (artifact_key ~ '^[A-Za-z0-9._/-]{1,240}$' AND artifact_key !~ '(^|/)\.\.(/|$)'),
  CONSTRAINT orgmaster_persistence_artifacts_source_hash
    CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT orgmaster_persistence_artifacts_canonical_hash
    CHECK (canonical_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE TABLE IF NOT EXISTS orgmaster.persistence_media_inventory (
  batch_id uuid NOT NULL REFERENCES orgmaster.persistence_batches(id) ON DELETE RESTRICT,
  media_key text NOT NULL,
  source_sha256 char(64) NOT NULL,
  source_bytes bigint NOT NULL CHECK (source_bytes >= 0),
  PRIMARY KEY (batch_id, media_key),
  CONSTRAINT orgmaster_persistence_media_key
    CHECK (media_key ~ '^[A-Za-z0-9._/-]{1,240}$' AND media_key !~ '(^|/)\.\.(/|$)'),
  CONSTRAINT orgmaster_persistence_media_hash
    CHECK (source_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE TABLE IF NOT EXISTS orgmaster.persistence_authority (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  active_batch_id uuid NULL REFERENCES orgmaster.persistence_batches(id) ON DELETE RESTRICT,
  authority_version bigint NOT NULL DEFAULT 0 CHECK (authority_version >= 0),
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL CHECK (char_length(updated_by) BETWEEN 1 AND 128),
  reason_code text NOT NULL CHECK (char_length(reason_code) BETWEEN 1 AND 128)
);

INSERT INTO orgmaster.persistence_authority (
  singleton,
  active_batch_id,
  authority_version,
  updated_at,
  updated_by,
  reason_code
) VALUES (
  true,
  NULL,
  0,
  clock_timestamp(),
  'migration',
  'initial_shadow_only'
)
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE orgmaster.persistence_batches OWNER TO jenfu_platform_migrator;
ALTER TABLE orgmaster.persistence_artifacts OWNER TO jenfu_platform_migrator;
ALTER TABLE orgmaster.persistence_media_inventory OWNER TO jenfu_platform_migrator;
ALTER TABLE orgmaster.persistence_authority OWNER TO jenfu_platform_migrator;

CREATE INDEX IF NOT EXISTS orgmaster_persistence_artifacts_kind_idx
  ON orgmaster.persistence_artifacts (batch_id, artifact_kind);

CREATE OR REPLACE FUNCTION orgmaster.read_active_persistence_artifact_v1(
  p_artifact_key text
)
RETURNS TABLE (
  artifact_key text,
  artifact_kind text,
  payload jsonb,
  canonical_sha256 text,
  source_sha256 text,
  source_bytes bigint,
  source_revision text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT
    artifact.artifact_key,
    artifact.artifact_kind,
    artifact.payload,
    artifact.canonical_sha256::text,
    artifact.source_sha256::text,
    artifact.source_bytes,
    batch.source_revision::text
  FROM orgmaster.persistence_authority AS authority
  JOIN orgmaster.persistence_batches AS batch
    ON batch.id = authority.active_batch_id
   AND batch.status = 'active'
  JOIN orgmaster.persistence_artifacts AS artifact
    ON artifact.batch_id = batch.id
  WHERE authority.singleton = true
    AND artifact.artifact_key = p_artifact_key;
$function$;

ALTER FUNCTION orgmaster.read_active_persistence_artifact_v1(text)
  OWNER TO jenfu_platform_migrator;

REVOKE ALL ON TABLE orgmaster.persistence_batches FROM PUBLIC;
REVOKE ALL ON TABLE orgmaster.persistence_artifacts FROM PUBLIC;
REVOKE ALL ON TABLE orgmaster.persistence_media_inventory FROM PUBLIC;
REVOKE ALL ON TABLE orgmaster.persistence_authority FROM PUBLIC;
REVOKE ALL ON TABLE orgmaster.persistence_batches
  FROM jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;
REVOKE ALL ON TABLE orgmaster.persistence_artifacts
  FROM jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;
REVOKE ALL ON TABLE orgmaster.persistence_media_inventory
  FROM jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;
REVOKE ALL ON TABLE orgmaster.persistence_authority
  FROM jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;

REVOKE ALL ON FUNCTION orgmaster.read_active_persistence_artifact_v1(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION orgmaster.read_active_persistence_artifact_v1(text)
  FROM jenfu_platform_runtime, jenfu_ai_pdm_runtime;

GRANT USAGE ON SCHEMA orgmaster TO jenfu_orgmaster_runtime;
GRANT EXECUTE ON FUNCTION orgmaster.read_active_persistence_artifact_v1(text)
  TO jenfu_orgmaster_runtime;

COMMIT;
