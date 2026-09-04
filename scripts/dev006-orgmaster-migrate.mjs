import { createHash, randomUUID } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import pg from 'pg'

const CONTRACT_VERSION = 'jenfu.orgmaster-persistence.v1'
const MODES = new Set(['inventory', 'dry-run', 'shadow-import', 'activate-isolated', 'read-active'])
const SAFE_ID = /^[A-Za-z0-9-]{1,80}$/

function parseArgs(values) {
  const args = { mode: 'inventory', sourceRoot: process.cwd(), databaseUrl: process.env.ORGMASTER_DEV006_DATABASE_URL ?? '', targetClass: process.env.DEV006_TARGET_CLASS ?? '' }
  for (let index = 2; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--allow-isolated-activation') { args.allowIsolatedActivation = true; continue }
    const next = values[index + 1]
    if (!next || next.startsWith('--')) throw new Error(`Missing value for ${value}`)
    if (value === '--mode') args.mode = next
    else if (value === '--source-root') args.sourceRoot = resolve(next)
    else if (value === '--database-url') args.databaseUrl = next
    else if (value === '--target-class') args.targetClass = next
    else if (value === '--source-revision') args.sourceRevision = next
    else if (value === '--artifact-key') args.artifactKey = next
    else throw new Error(`Unknown argument: ${value}`)
    index += 1
  }
  if (!MODES.has(args.mode)) throw new Error(`Unsupported mode: ${args.mode}`)
  return args
}

function sha256(value) { return createHash('sha256').update(value).digest('hex') }

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
}

function canonicalJson(value) { return JSON.stringify(canonicalize(value)) }

function assertObject(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code)
  return value
}

async function readJsonArtifact(path, artifactKey, artifactKind) {
  const raw = await readFile(path, 'utf8')
  const payload = assertObject(JSON.parse(raw), 'ARTIFACT_JSON_OBJECT_REQUIRED')
  return {
    artifactKey,
    artifactKind,
    payload,
    sourceSha256: sha256(raw),
    canonicalSha256: sha256(canonicalJson(payload)),
    sourceBytes: Buffer.byteLength(raw),
  }
}

function validateDocument(artifact, expectedKind) {
  if (artifact.payload.app !== 'OrgMaster' || !Number.isInteger(artifact.payload.version) || artifact.payload.version < 1 || !artifact.payload.state || typeof artifact.payload.savedAt !== 'string') {
    throw new Error('WORKSPACE_DOCUMENT_INVALID')
  }
  const actualKind = artifact.payload.kind
  if ((expectedKind === 'current' && actualKind !== 'document') || (expectedKind === 'draft' && actualKind !== 'draft')) throw new Error('WORKSPACE_DOCUMENT_KIND_MISMATCH')
}

async function listMedia(dataRoot) {
  const root = resolve(dataRoot, 'orgmaster-management-method-media')
  let entries
  try { entries = await readdir(root, { withFileTypes: true }) } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  const media = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || entry.name.includes('..') || entry.name.includes('/') || entry.name.includes('\\')) continue
    const path = resolve(root, entry.name)
    const bytes = await readFile(path)
    const extension = entry.name.toLowerCase().split('.').at(-1)
    const mimeType = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : null
    if (!mimeType) throw new Error('MEDIA_TYPE_UNSUPPORTED')
    media.push({ mediaKey: `orgmaster-management-method-media/${entry.name}`, sourceSha256: sha256(bytes), sourceBytes: bytes.byteLength, mimeType, bytes })
  }
  return media
}

async function legacyInventory(dataRoot) {
  const categories = { legacy: 0, previous: 0, temporary: 0 }
  const objects = []
  const scan = async (root) => {
    let entries = []
    try { entries = await readdir(root, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const category = entry.name.includes('.tmp') ? 'temporary'
        : entry.name.includes('.previous') ? 'previous'
          : /orgmaster-(document\.v[1-6]|governance\.v1|duty-plans)/.test(entry.name) ? 'legacy' : null
      if (!category) continue
      categories[category] += 1
      const objectPath = resolve(root, entry.name)
      const bytes = await readFile(objectPath)
      const relativeKey = relative(dataRoot, objectPath).replaceAll('\\', '/')
      objects.push({
        category,
        identitySha256: sha256(`orgmaster:legacy:${relativeKey}`),
        contentSha256: sha256(bytes),
        sourceBytes: bytes.byteLength,
      })
    }
  }
  await scan(dataRoot)
  await scan(resolve(dataRoot, 'orgmaster-versions'))
  return { categories, objects: objects.sort((a, b) => a.identitySha256.localeCompare(b.identitySha256)) }
}

export async function inventorySource(sourceRoot) {
  const dataRoot = resolve(sourceRoot, 'data')
  const manifest = await readJsonArtifact(resolve(dataRoot, 'orgmaster-workspace.v1.json'), 'orgmaster-workspace.v1.json', 'workspace-manifest')
  if (manifest.payload.app !== 'OrgMaster' || manifest.payload.workspaceVersion !== 1 || !Array.isArray(manifest.payload.entries) || typeof manifest.payload.currentVersionId !== 'string') {
    throw new Error('WORKSPACE_MANIFEST_INVALID')
  }
  const ids = new Set()
  const artifacts = [manifest]
  for (const rawEntry of manifest.payload.entries) {
    const entry = assertObject(rawEntry, 'WORKSPACE_ENTRY_INVALID')
    if (!SAFE_ID.test(entry.id) || ids.has(entry.id) || !['current', 'draft'].includes(entry.kind) || !['active', 'archived'].includes(entry.status)) throw new Error('WORKSPACE_ENTRY_INVALID')
    ids.add(entry.id)
    const artifact = await readJsonArtifact(resolve(dataRoot, 'orgmaster-versions', `${entry.id}.json`), `orgmaster-versions/${entry.id}.json`, 'workspace-version')
    validateDocument(artifact, entry.kind)
    artifacts.push(artifact)
  }
  if (!ids.has(manifest.payload.currentVersionId)) throw new Error('WORKSPACE_CURRENT_VERSION_MISSING')

  const governance = await readJsonArtifact(resolve(dataRoot, 'orgmaster-governance.v2.json'), 'orgmaster-governance.v2.json', 'governance')
  if (governance.payload.app !== 'OrgMaster' || governance.payload.schemaVersion !== 2 || !Array.isArray(governance.payload.publishedVersions) || !Array.isArray(governance.payload.auditEvents)) throw new Error('GOVERNANCE_ARTIFACT_INVALID')
  artifacts.push(governance)

  const methods = await readJsonArtifact(resolve(dataRoot, 'orgmaster-management-methods.v1.json'), 'orgmaster-management-methods.v1.json', 'management-methods')
  if (methods.payload.app !== 'OrgMasterManagementMethods' || methods.payload.schemaVersion !== 1 || !Array.isArray(methods.payload.methods) || !Array.isArray(methods.payload.mediaAssets) || !Array.isArray(methods.payload.commandReceipts)) throw new Error('MANAGEMENT_METHOD_ARTIFACT_INVALID')
  artifacts.push(methods)

  artifacts.sort((a, b) => a.artifactKey.localeCompare(b.artifactKey))
  const media = await listMedia(dataRoot)
  const legacy = await legacyInventory(dataRoot)
  const safeManifest = {
    contractVersion: CONTRACT_VERSION,
    artifacts: artifacts.map(({ artifactKey, artifactKind, sourceSha256, canonicalSha256, sourceBytes }) => ({ artifactKey, artifactKind, sourceSha256, canonicalSha256, sourceBytes })),
    media: media.map(({ bytes: _bytes, mimeType: _mimeType, ...item }) => item),
    legacy: legacy.categories,
    legacyObjects: legacy.objects,
  }
  return {
    contractVersion: CONTRACT_VERSION,
    sourceRoot,
    sourceRevision: sha256(canonicalJson(safeManifest)),
    artifactCount: artifacts.length,
    mediaCount: media.length,
    sourceBytes: artifacts.reduce((sum, artifact) => sum + artifact.sourceBytes, 0) + media.reduce((sum, item) => sum + item.sourceBytes, 0),
    artifacts,
    media,
    legacy: legacy.categories,
    legacyObjects: legacy.objects,
    safeManifest,
  }
}

function requireDatabaseUrl(args) {
  if (!args.databaseUrl) throw new Error('DATABASE_URL_REQUIRED')
}

async function withPool(args, operation) {
  requireDatabaseUrl(args)
  const pool = new pg.Pool({ connectionString: args.databaseUrl, max: 2, connectionTimeoutMillis: 5_000 })
  try { return await operation(pool) } finally { await pool.end() }
}

async function dryRun(args, inventory) {
  return withPool(args, async (pool) => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SET LOCAL ROLE jenfu_platform_migrator')
      const schema = await client.query(`SELECT
        to_regclass('orgmaster.persistence_batches') IS NOT NULL AS batches,
        to_regclass('orgmaster.persistence_artifacts') IS NOT NULL AS artifacts,
        to_regclass('orgmaster.persistence_media_inventory') IS NOT NULL AS media,
        to_regclass('orgmaster.persistence_authority') IS NOT NULL AS authority,
        to_regprocedure('orgmaster.read_active_persistence_artifact_v1(text)') IS NOT NULL AS reader`)
      if (!Object.values(schema.rows[0]).every(Boolean)) throw new Error('TARGET_SCHEMA_INCOMPLETE')
      const authority = await client.query('SELECT active_batch_id, authority_version FROM orgmaster.persistence_authority WHERE singleton = true')
      if (authority.rowCount !== 1) throw new Error('TARGET_AUTHORITY_INVALID')
      await client.query('ROLLBACK')
      return { status: 'PASS', mode: 'dry-run', sourceRevision: inventory.sourceRevision, artifactCount: inventory.artifactCount, mediaCount: inventory.mediaCount, targetAuthorityActive: authority.rows[0].active_batch_id !== null, writes: 0 }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally { client.release() }
  })
}

async function shadowImport(args, inventory) {
  return withPool(args, async (pool) => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SET LOCAL ROLE jenfu_platform_migrator')
      const existing = await client.query('SELECT id, artifact_count, media_count, source_bytes, status FROM orgmaster.persistence_batches WHERE source_revision = $1', [inventory.sourceRevision])
      if (existing.rowCount) {
        const batch = existing.rows[0]
        const rows = await client.query('SELECT artifact_key, source_sha256, canonical_sha256, source_bytes FROM orgmaster.persistence_artifacts WHERE batch_id = $1 ORDER BY artifact_key', [batch.id])
        const actual = rows.rows.map((row) => ({ artifactKey: row.artifact_key, sourceSha256: row.source_sha256.trim(), canonicalSha256: row.canonical_sha256.trim(), sourceBytes: Number(row.source_bytes) }))
        const expected = inventory.artifacts.map(({ artifactKey, sourceSha256, canonicalSha256, sourceBytes }) => ({ artifactKey, sourceSha256, canonicalSha256, sourceBytes }))
        const mediaRows = await client.query(`SELECT inventory.media_key, inventory.source_sha256, inventory.source_bytes,
          blob.content_sha256, blob.byte_size
          FROM orgmaster.persistence_media_inventory AS inventory
          LEFT JOIN orgmaster.persistence_media_blobs AS blob ON blob.media_key = inventory.media_key
          WHERE inventory.batch_id = $1 ORDER BY inventory.media_key`, [batch.id])
        const actualMedia = mediaRows.rows.map((row) => ({ mediaKey: row.media_key, sourceSha256: row.source_sha256.trim(), sourceBytes: Number(row.source_bytes), contentSha256: row.content_sha256?.trim() ?? null, byteSize: row.byte_size === null ? null : Number(row.byte_size) }))
        const expectedMedia = inventory.media.map(({ mediaKey, sourceSha256, sourceBytes }) => ({ mediaKey, sourceSha256, sourceBytes, contentSha256: sourceSha256, byteSize: sourceBytes }))
        if (JSON.stringify(actual) !== JSON.stringify(expected) || JSON.stringify(actualMedia) !== JSON.stringify(expectedMedia) || Number(batch.artifact_count) !== inventory.artifactCount || Number(batch.media_count) !== inventory.mediaCount || Number(batch.source_bytes) !== inventory.sourceBytes) throw new Error('IDEMPOTENCY_MISMATCH')
        await client.query('COMMIT')
        return { status: 'PASS', mode: 'shadow-import', sourceRevision: inventory.sourceRevision, batchId: batch.id, replayed: true, batchStatus: batch.status, artifactCount: inventory.artifactCount, mediaCount: inventory.mediaCount }
      }

      const batchId = randomUUID()
      const importedAt = new Date().toISOString()
      await client.query(`INSERT INTO orgmaster.persistence_batches
        (id, source_revision, contract_version, source_manifest, artifact_count, media_count, source_bytes, status, imported_at, verified_at)
        VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, 'shadow', $8, $8)`,
      [batchId, inventory.sourceRevision, CONTRACT_VERSION, JSON.stringify(inventory.safeManifest), inventory.artifactCount, inventory.mediaCount, inventory.sourceBytes, importedAt])
      for (const artifact of inventory.artifacts) {
        await client.query(`INSERT INTO orgmaster.persistence_artifacts
          (batch_id, artifact_key, artifact_kind, payload, source_sha256, canonical_sha256, source_bytes, imported_at)
          VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)`,
        [batchId, artifact.artifactKey, artifact.artifactKind, JSON.stringify(artifact.payload), artifact.sourceSha256, artifact.canonicalSha256, artifact.sourceBytes, importedAt])
      }
      for (const media of inventory.media) {
        await client.query(`INSERT INTO orgmaster.persistence_media_inventory
          (batch_id, media_key, source_sha256, source_bytes) VALUES ($1, $2, $3, $4)`,
        [batchId, media.mediaKey, media.sourceSha256, media.sourceBytes])
        await client.query(`INSERT INTO orgmaster.persistence_media_blobs
          (media_key, media_bytes, mime_type, content_sha256, byte_size, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $6)
          ON CONFLICT (media_key) DO UPDATE SET
            media_bytes = EXCLUDED.media_bytes,
            mime_type = EXCLUDED.mime_type,
            content_sha256 = EXCLUDED.content_sha256,
            byte_size = EXCLUDED.byte_size,
            updated_at = EXCLUDED.updated_at
          WHERE orgmaster.persistence_media_blobs.content_sha256 = EXCLUDED.content_sha256`,
        [media.mediaKey, media.bytes, media.mimeType, media.sourceSha256, media.sourceBytes, importedAt])
      }
      await client.query('COMMIT')
      return { status: 'PASS', mode: 'shadow-import', sourceRevision: inventory.sourceRevision, batchId, replayed: false, batchStatus: 'shadow', artifactCount: inventory.artifactCount, mediaCount: inventory.mediaCount }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally { client.release() }
  })
}

async function activateIsolated(args) {
  if (args.targetClass !== 'local-isolated' || !args.allowIsolatedActivation) throw new Error('ISOLATED_ACTIVATION_GUARD_REQUIRED')
  if (!/^[0-9a-f]{64}$/.test(args.sourceRevision ?? '')) throw new Error('SOURCE_REVISION_REQUIRED')
  return withPool(args, async (pool) => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SET LOCAL ROLE jenfu_platform_migrator')
      const target = await client.query('SELECT id, status FROM orgmaster.persistence_batches WHERE source_revision = $1 FOR UPDATE', [args.sourceRevision])
      if (target.rowCount !== 1 || !['shadow', 'active'].includes(target.rows[0].status)) throw new Error('SHADOW_BATCH_NOT_READY')
      const at = new Date().toISOString()
      await client.query(`UPDATE orgmaster.persistence_batches SET status = 'retired', retired_at = $1
        WHERE status = 'active' AND id <> $2`, [at, target.rows[0].id])
      await client.query(`UPDATE orgmaster.persistence_batches SET status = 'active', activated_at = COALESCE(activated_at, $1), retired_at = NULL
        WHERE id = $2`, [at, target.rows[0].id])
      const pointer = await client.query(`UPDATE orgmaster.persistence_authority
        SET active_batch_id = $1, authority_version = authority_version + 1, updated_at = $2,
            updated_by = 'dev006-isolated-qc', reason_code = 'isolated_activation_verification'
        WHERE singleton = true RETURNING authority_version`, [target.rows[0].id, at])
      await client.query('COMMIT')
      return { status: 'PASS', mode: 'activate-isolated', sourceRevision: args.sourceRevision, batchId: target.rows[0].id, authorityVersion: Number(pointer.rows[0].authority_version), targetClass: args.targetClass }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally { client.release() }
  })
}

async function readActive(args) {
  const artifactKey = args.artifactKey ?? 'orgmaster-workspace.v1.json'
  return withPool(args, async (pool) => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SET LOCAL ROLE jenfu_orgmaster_runtime')
      const result = await client.query('SELECT artifact_key, artifact_kind, canonical_sha256, source_sha256, source_bytes, source_revision FROM orgmaster.read_active_persistence_artifact_v1($1)', [artifactKey])
      await client.query('ROLLBACK')
      if (result.rowCount !== 1) throw new Error('ACTIVE_ARTIFACT_NOT_FOUND')
      const row = result.rows[0]
      return { status: 'PASS', mode: 'read-active', artifactKey: row.artifact_key, artifactKind: row.artifact_kind, canonicalSha256: row.canonical_sha256, sourceSha256: row.source_sha256, sourceBytes: Number(row.source_bytes), sourceRevision: row.source_revision }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally { client.release() }
  })
}

export async function run(args) {
  if (args.mode === 'activate-isolated') return activateIsolated(args)
  if (args.mode === 'read-active') return readActive(args)
  const inventory = await inventorySource(args.sourceRoot)
  if (args.mode === 'inventory') return {
    status: 'PASS', mode: 'inventory', contractVersion: CONTRACT_VERSION, sourceRevision: inventory.sourceRevision,
    artifactCount: inventory.artifactCount, mediaCount: inventory.mediaCount, sourceBytes: inventory.sourceBytes,
    legacy: inventory.legacy, legacyObjects: inventory.legacyObjects,
    artifacts: inventory.safeManifest.artifacts, media: inventory.safeManifest.media,
  }
  if (args.mode === 'dry-run') return dryRun(args, inventory)
  return shadowImport(args, inventory)
}

function safeError(error) {
  const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR'
  return /^[A-Z0-9_:-]+$/.test(message) ? message : 'DEV006_MIGRATION_FAILED'
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run(parseArgs(process.argv))
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stdout.write(`${JSON.stringify({ status: 'FAIL', code: safeError(error) })}\n`)
      process.exitCode = 1
    })
}
