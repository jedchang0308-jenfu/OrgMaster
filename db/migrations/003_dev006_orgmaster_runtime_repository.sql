BEGIN;

SET LOCAL ROLE jenfu_platform_migrator;

CREATE TABLE IF NOT EXISTS orgmaster.persistence_media_blobs (
  media_key text PRIMARY KEY,
  media_bytes bytea NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
  content_sha256 char(64) NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  byte_size bigint NOT NULL CHECK (byte_size >= 0 AND byte_size <= 8388608),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT orgmaster_persistence_media_blob_key
    CHECK (media_key ~ '^orgmaster-management-method-media/[A-Za-z0-9._-]{1,200}$')
);

ALTER TABLE orgmaster.persistence_media_blobs OWNER TO jenfu_platform_migrator;
REVOKE ALL ON TABLE orgmaster.persistence_media_blobs FROM PUBLIC;
REVOKE ALL ON TABLE orgmaster.persistence_media_blobs
  FROM jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;

CREATE OR REPLACE FUNCTION orgmaster.read_active_persistence_authority_v1()
RETURNS TABLE (
  authority_version bigint,
  source_revision text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT authority.authority_version, batch.source_revision::text
  FROM orgmaster.persistence_authority AS authority
  JOIN orgmaster.persistence_batches AS batch
    ON batch.id = authority.active_batch_id
   AND batch.status = 'active'
  WHERE authority.singleton = true;
$function$;

CREATE OR REPLACE FUNCTION orgmaster.write_active_persistence_artifacts_v1(
  p_changes jsonb,
  p_source_revision text,
  p_updated_by text,
  p_reason_code text
)
RETURNS TABLE (
  authority_version bigint,
  source_revision text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_authority orgmaster.persistence_authority%ROWTYPE;
  v_active_batch orgmaster.persistence_batches%ROWTYPE;
  v_next_batch_id uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_change jsonb;
  v_key text;
  v_kind text;
  v_expected text;
  v_next_canonical text;
  v_source_sha text;
  v_source_bytes bigint;
  v_actual text;
  v_artifact_count integer;
  v_media_count integer;
  v_total_bytes bigint;
BEGIN
  IF jsonb_typeof(p_changes) <> 'array'
     OR jsonb_array_length(p_changes) < 1
     OR jsonb_array_length(p_changes) > 32 THEN
    RAISE EXCEPTION 'PERSISTENCE_CHANGES_INVALID';
  END IF;
  IF p_source_revision !~ '^[0-9a-f]{64}$'
     OR char_length(p_updated_by) NOT BETWEEN 1 AND 128
     OR char_length(p_reason_code) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'PERSISTENCE_WRITE_METADATA_INVALID';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_changes) AS item
    GROUP BY item->>'artifactKey'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'PERSISTENCE_CHANGE_KEY_DUPLICATE';
  END IF;

  SELECT * INTO v_authority
  FROM orgmaster.persistence_authority
  WHERE singleton = true
  FOR UPDATE;
  IF NOT FOUND OR v_authority.active_batch_id IS NULL THEN
    RAISE EXCEPTION 'PERSISTENCE_AUTHORITY_NOT_ACTIVE';
  END IF;

  SELECT * INTO v_active_batch
  FROM orgmaster.persistence_batches
  WHERE id = v_authority.active_batch_id AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERSISTENCE_AUTHORITY_NOT_ACTIVE';
  END IF;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_changes)
  LOOP
    v_key := v_change->>'artifactKey';
    v_kind := v_change->>'artifactKind';
    v_expected := v_change->>'expectedCanonicalSha256';
    v_next_canonical := v_change->>'nextCanonicalSha256';
    v_source_sha := v_change->>'sourceSha256';
    v_source_bytes := (v_change->>'sourceBytes')::bigint;
    IF v_key !~ '^[A-Za-z0-9._/-]{1,240}$' OR v_key ~ '(^|/)\.\.(/|$)'
       OR v_kind NOT IN ('workspace-manifest', 'workspace-version', 'governance', 'management-methods')
       OR jsonb_typeof(v_change->'payload') <> 'object'
       OR v_next_canonical !~ '^[0-9a-f]{64}$'
       OR v_source_sha !~ '^[0-9a-f]{64}$'
       OR v_source_bytes < 0 THEN
      RAISE EXCEPTION 'PERSISTENCE_CHANGE_INVALID';
    END IF;
    SELECT trim(artifact.canonical_sha256) INTO v_actual
    FROM orgmaster.persistence_artifacts AS artifact
    WHERE artifact.batch_id = v_active_batch.id AND artifact.artifact_key = v_key;
    IF v_expected IS NULL THEN
      IF FOUND THEN RAISE EXCEPTION 'PERSISTENCE_ARTIFACT_EXISTS'; END IF;
    ELSIF NOT FOUND OR v_actual <> v_expected THEN
      RAISE EXCEPTION 'PERSISTENCE_REVISION_CONFLICT';
    END IF;
  END LOOP;

  INSERT INTO orgmaster.persistence_batches (
    id, source_revision, contract_version, source_manifest,
    artifact_count, media_count, source_bytes, status,
    imported_at, verified_at, activated_at
  ) VALUES (
    v_next_batch_id, p_source_revision, 'jenfu.orgmaster-persistence.v1',
    jsonb_build_object(
      'contractVersion', 'jenfu.orgmaster-persistence.v1',
      'origin', 'orgmaster-runtime',
      'previousSourceRevision', trim(v_active_batch.source_revision),
      'changedArtifactKeys', (
        SELECT jsonb_agg(item->>'artifactKey' ORDER BY item->>'artifactKey')
        FROM jsonb_array_elements(p_changes) AS item
      )
    ),
    0, v_active_batch.media_count, 0, 'shadow', v_now, v_now, v_now
  );

  INSERT INTO orgmaster.persistence_artifacts (
    batch_id, artifact_key, artifact_kind, payload,
    source_sha256, canonical_sha256, source_bytes, imported_at
  )
  SELECT
    v_next_batch_id, artifact.artifact_key, artifact.artifact_kind, artifact.payload,
    artifact.source_sha256, artifact.canonical_sha256, artifact.source_bytes, v_now
  FROM orgmaster.persistence_artifacts AS artifact
  WHERE artifact.batch_id = v_active_batch.id
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_changes) AS item
      WHERE item->>'artifactKey' = artifact.artifact_key
    );

  INSERT INTO orgmaster.persistence_artifacts (
    batch_id, artifact_key, artifact_kind, payload,
    source_sha256, canonical_sha256, source_bytes, imported_at
  )
  SELECT
    v_next_batch_id,
    item->>'artifactKey',
    item->>'artifactKind',
    item->'payload',
    item->>'sourceSha256',
    item->>'nextCanonicalSha256',
    (item->>'sourceBytes')::bigint,
    v_now
  FROM jsonb_array_elements(p_changes) AS item;

  INSERT INTO orgmaster.persistence_media_inventory (batch_id, media_key, source_sha256, source_bytes)
  SELECT v_next_batch_id, media_key, content_sha256, byte_size
  FROM orgmaster.persistence_media_blobs;

  SELECT count(*), COALESCE(sum(source_bytes), 0)
  INTO v_artifact_count, v_total_bytes
  FROM orgmaster.persistence_artifacts
  WHERE batch_id = v_next_batch_id;
  SELECT count(*), v_total_bytes + COALESCE(sum(source_bytes), 0)
  INTO v_media_count, v_total_bytes
  FROM orgmaster.persistence_media_inventory
  WHERE batch_id = v_next_batch_id;

  UPDATE orgmaster.persistence_batches
  SET artifact_count = v_artifact_count,
      media_count = v_media_count,
      source_bytes = v_total_bytes,
      status = 'active'
  WHERE id = v_next_batch_id;
  UPDATE orgmaster.persistence_batches
  SET status = 'retired', retired_at = v_now
  WHERE id = v_active_batch.id;
  UPDATE orgmaster.persistence_authority
  SET active_batch_id = v_next_batch_id,
      authority_version = v_authority.authority_version + 1,
      updated_at = v_now,
      updated_by = p_updated_by,
      reason_code = p_reason_code
  WHERE singleton = true;

  RETURN QUERY SELECT v_authority.authority_version + 1, p_source_revision;
END;
$function$;

CREATE OR REPLACE FUNCTION orgmaster.write_persistence_media_v1(
  p_media_key text,
  p_media_bytes bytea,
  p_mime_type text,
  p_content_sha256 text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_media_key !~ '^orgmaster-management-method-media/[A-Za-z0-9._-]{1,200}$'
     OR p_mime_type NOT IN ('image/png', 'image/jpeg', 'image/webp')
     OR p_content_sha256 !~ '^[0-9a-f]{64}$'
     OR octet_length(p_media_bytes) > 8388608 THEN
    RAISE EXCEPTION 'PERSISTENCE_MEDIA_INVALID';
  END IF;
  INSERT INTO orgmaster.persistence_media_blobs (
    media_key, media_bytes, mime_type, content_sha256, byte_size, created_at, updated_at
  ) VALUES (
    p_media_key, p_media_bytes, p_mime_type, p_content_sha256, octet_length(p_media_bytes), v_now, v_now
  )
  ON CONFLICT (media_key) DO UPDATE
    SET media_bytes = EXCLUDED.media_bytes,
        mime_type = EXCLUDED.mime_type,
        content_sha256 = EXCLUDED.content_sha256,
        byte_size = EXCLUDED.byte_size,
        updated_at = EXCLUDED.updated_at
    WHERE orgmaster.persistence_media_blobs.content_sha256 = EXCLUDED.content_sha256;
  IF NOT FOUND THEN RAISE EXCEPTION 'PERSISTENCE_MEDIA_CONFLICT'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION orgmaster.read_persistence_media_v1(p_media_key text)
RETURNS TABLE (
  media_bytes bytea,
  mime_type text,
  content_sha256 text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT blob.media_bytes, blob.mime_type, blob.content_sha256::text
  FROM orgmaster.persistence_media_blobs AS blob
  WHERE blob.media_key = p_media_key;
$function$;

CREATE OR REPLACE FUNCTION orgmaster.delete_persistence_media_v1(p_media_key text)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  DELETE FROM orgmaster.persistence_media_blobs AS blob
  WHERE blob.media_key = p_media_key
    AND NOT EXISTS (
      SELECT 1
      FROM orgmaster.read_active_persistence_artifact_v1('orgmaster-management-methods.v1.json') AS artifact,
           jsonb_array_elements(artifact.payload->'mediaAssets') AS asset
      WHERE 'orgmaster-management-method-media/' || (asset->>'storedFileRef') = p_media_key
    );
$function$;

ALTER FUNCTION orgmaster.read_active_persistence_authority_v1() OWNER TO jenfu_platform_migrator;
ALTER FUNCTION orgmaster.write_active_persistence_artifacts_v1(jsonb, text, text, text) OWNER TO jenfu_platform_migrator;
ALTER FUNCTION orgmaster.write_persistence_media_v1(text, bytea, text, text) OWNER TO jenfu_platform_migrator;
ALTER FUNCTION orgmaster.read_persistence_media_v1(text) OWNER TO jenfu_platform_migrator;
ALTER FUNCTION orgmaster.delete_persistence_media_v1(text) OWNER TO jenfu_platform_migrator;

REVOKE ALL ON FUNCTION orgmaster.read_active_persistence_authority_v1() FROM PUBLIC, jenfu_platform_runtime, jenfu_ai_pdm_runtime;
REVOKE ALL ON FUNCTION orgmaster.write_active_persistence_artifacts_v1(jsonb, text, text, text) FROM PUBLIC, jenfu_platform_runtime, jenfu_ai_pdm_runtime;
REVOKE ALL ON FUNCTION orgmaster.write_persistence_media_v1(text, bytea, text, text) FROM PUBLIC, jenfu_platform_runtime, jenfu_ai_pdm_runtime;
REVOKE ALL ON FUNCTION orgmaster.read_persistence_media_v1(text) FROM PUBLIC, jenfu_platform_runtime, jenfu_ai_pdm_runtime;
REVOKE ALL ON FUNCTION orgmaster.delete_persistence_media_v1(text) FROM PUBLIC, jenfu_platform_runtime, jenfu_ai_pdm_runtime;

GRANT EXECUTE ON FUNCTION orgmaster.read_active_persistence_authority_v1() TO jenfu_orgmaster_runtime;
GRANT EXECUTE ON FUNCTION orgmaster.write_active_persistence_artifacts_v1(jsonb, text, text, text) TO jenfu_orgmaster_runtime;
GRANT EXECUTE ON FUNCTION orgmaster.write_persistence_media_v1(text, bytea, text, text) TO jenfu_orgmaster_runtime;
GRANT EXECUTE ON FUNCTION orgmaster.read_persistence_media_v1(text) TO jenfu_orgmaster_runtime;
GRANT EXECUTE ON FUNCTION orgmaster.delete_persistence_media_v1(text) TO jenfu_orgmaster_runtime;

COMMIT;
