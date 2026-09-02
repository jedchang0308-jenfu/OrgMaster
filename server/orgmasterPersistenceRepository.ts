import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import pg from 'pg'
import { writeVerifiedAtomicFile } from './orgmasterFileStore'

export type OrgmasterPersistenceMode = 'local-json' | 'cloud-sql'
export type PersistenceArtifactKind = 'workspace-manifest' | 'workspace-version' | 'governance' | 'management-methods'

export type PersistenceArtifactRead = {
  artifactKey: string
  artifactKind: PersistenceArtifactKind
  payload: Record<string, unknown>
  raw: string
  revision: string
  sourceRevision: string | null
}

export type PersistenceArtifactWrite = {
  artifactKey: string
  artifactKind: PersistenceArtifactKind
  localPath: string
  payload: Record<string, unknown>
  raw: string
  expectedRevision: string | null
}

export type PersistenceEntitlementChange = {
  operationId: string
  employeeId: string
  applicationId: 'ai-pdm'
  eventKind: 'governance_publish' | 'role_assignment_changed' | 'position_source_ended'
  actor?: string
  reasonCode?: string
}

type Queryable = Pick<pg.Pool, 'query' | 'end'>

export class OrgmasterPersistenceError extends Error {
  constructor(public readonly code: 'PERSISTENCE_NOT_CONFIGURED' | 'PERSISTENCE_ARTIFACT_NOT_FOUND' | 'PERSISTENCE_REVISION_CONFLICT' | 'PERSISTENCE_READ_FAILED' | 'PERSISTENCE_WRITE_FAILED' | 'PERSISTENCE_MEDIA_NOT_FOUND') {
    super(code)
    this.name = 'OrgmasterPersistenceError'
  }
}

let runtimePool: pg.Pool | null = null
let runtimePoolUrl = ''

function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex')
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]))
}

function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalize(value))
}

function objectPayload(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new OrgmasterPersistenceError('PERSISTENCE_READ_FAILED')
  return value as Record<string, unknown>
}

export function resolveOrgmasterPersistenceMode(environment: NodeJS.ProcessEnv = process.env): OrgmasterPersistenceMode {
  const value = environment.ORGMASTER_PERSISTENCE_MODE?.trim() || 'local-json'
  if (value === 'local-json' || value === 'cloud-sql') return value
  throw new OrgmasterPersistenceError('PERSISTENCE_NOT_CONFIGURED')
}

export function usesCloudSqlPersistence(environment: NodeJS.ProcessEnv = process.env) {
  return resolveOrgmasterPersistenceMode(environment) === 'cloud-sql'
}

function poolForRuntime(environment: NodeJS.ProcessEnv = process.env) {
  const url = environment.ORGMASTER_POSTGRES_URL?.trim()
  if (!url) throw new OrgmasterPersistenceError('PERSISTENCE_NOT_CONFIGURED')
  if (runtimePool && runtimePoolUrl === url) return runtimePool
  if (runtimePool) void runtimePool.end().catch(() => undefined)
  runtimePool = new pg.Pool({
    connectionString: url,
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 30_000,
    application_name: 'orgmaster-persistence-runtime',
  })
  runtimePoolUrl = url
  return runtimePool
}

function database(input?: Queryable) {
  return input ?? poolForRuntime()
}

function mappedError(error: unknown, fallback: OrgmasterPersistenceError['code']) {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('PERSISTENCE_REVISION_CONFLICT') || message.includes('PERSISTENCE_ARTIFACT_EXISTS')) return new OrgmasterPersistenceError('PERSISTENCE_REVISION_CONFLICT')
  if (message.includes('PERSISTENCE_ARTIFACT_NOT_FOUND')) return new OrgmasterPersistenceError('PERSISTENCE_ARTIFACT_NOT_FOUND')
  if (message.includes('PERSISTENCE_MEDIA_NOT_FOUND')) return new OrgmasterPersistenceError('PERSISTENCE_MEDIA_NOT_FOUND')
  return error instanceof OrgmasterPersistenceError ? error : new OrgmasterPersistenceError(fallback)
}

export async function persistenceArtifactExists(localPath: string, artifactKey: string, input?: Queryable) {
  if (!usesCloudSqlPersistence() && !input) {
    try { await stat(localPath); return true } catch { return false }
  }
  try {
    const result = await database(input).query('SELECT 1 FROM orgmaster.read_active_persistence_artifact_v1($1)', [artifactKey])
    return Boolean(result.rowCount)
  } catch (error) {
    throw mappedError(error, 'PERSISTENCE_READ_FAILED')
  }
}

export async function readPersistenceArtifact(input: { localPath: string; artifactKey: string; artifactKind: PersistenceArtifactKind; database?: Queryable }): Promise<PersistenceArtifactRead> {
  if (!usesCloudSqlPersistence() && !input.database) {
    const raw = await readFile(input.localPath, 'utf8')
    return { artifactKey: input.artifactKey, artifactKind: input.artifactKind, payload: objectPayload(JSON.parse(raw)), raw, revision: sha256(raw), sourceRevision: null }
  }
  try {
    const result = await database(input.database).query(`SELECT artifact_key, artifact_kind, payload, canonical_sha256, source_revision
      FROM orgmaster.read_active_persistence_artifact_v1($1)`, [input.artifactKey])
    if (result.rowCount !== 1) throw new OrgmasterPersistenceError('PERSISTENCE_ARTIFACT_NOT_FOUND')
    const row = result.rows[0]
    if (row.artifact_kind !== input.artifactKind) throw new OrgmasterPersistenceError('PERSISTENCE_READ_FAILED')
    const payload = objectPayload(row.payload)
    return {
      artifactKey: row.artifact_key,
      artifactKind: row.artifact_kind,
      payload,
      raw: canonicalJson(payload),
      revision: String(row.canonical_sha256).trim(),
      sourceRevision: String(row.source_revision).trim(),
    }
  } catch (error) {
    throw mappedError(error, 'PERSISTENCE_READ_FAILED')
  }
}

export async function writePersistenceArtifacts(changes: PersistenceArtifactWrite[], input?: { database?: Queryable; updatedBy?: string; reasonCode?: string; entitlementChanges?: PersistenceEntitlementChange[] }) {
  if (!changes.length) throw new OrgmasterPersistenceError('PERSISTENCE_WRITE_FAILED')
  if (!usesCloudSqlPersistence() && !input?.database) {
    for (const change of changes) await writeVerifiedAtomicFile(change.localPath, change.raw)
    return { authorityVersion: null, sourceRevision: null, outboxCount: null, revisions: Object.fromEntries(changes.map((change) => [change.artifactKey, sha256(change.raw)])) }
  }
  const prepared = changes.map((change) => ({
    artifactKey: change.artifactKey,
    artifactKind: change.artifactKind,
    payload: change.payload,
    expectedCanonicalSha256: change.expectedRevision,
    nextCanonicalSha256: sha256(canonicalJson(change.payload)),
    sourceSha256: sha256(change.raw),
    sourceBytes: Buffer.byteLength(change.raw),
  })).sort((left, right) => left.artifactKey.localeCompare(right.artifactKey))
  try {
    const authority = await database(input?.database).query('SELECT source_revision FROM orgmaster.read_active_persistence_authority_v1()')
    if (authority.rowCount !== 1) throw new OrgmasterPersistenceError('PERSISTENCE_READ_FAILED')
    const sourceRevision = sha256(canonicalJson({ previousSourceRevision: String(authority.rows[0].source_revision).trim(), changes: prepared.map(({ payload: _payload, ...metadata }) => metadata) }))
    const updatedBy = input?.updatedBy?.trim() || 'orgmaster-runtime'
    const reasonCode = input?.reasonCode?.trim() || 'runtime_artifact_write'
    const entitlementChanges = input?.entitlementChanges ?? []
    const result = entitlementChanges.length
      ? await database(input?.database).query(`SELECT authority_version, source_revision, outbox_count
          FROM orgmaster.write_active_persistence_artifacts_with_entitlement_outbox_v1($1::jsonb, $2, $3, $4, $5::jsonb)`, [
          JSON.stringify(prepared), sourceRevision, updatedBy, reasonCode, JSON.stringify(entitlementChanges),
        ])
      : await database(input?.database).query(`SELECT authority_version, source_revision, NULL::integer AS outbox_count
          FROM orgmaster.write_active_persistence_artifacts_v1($1::jsonb, $2, $3, $4)`, [
          JSON.stringify(prepared), sourceRevision, updatedBy, reasonCode,
        ])
    if (result.rowCount !== 1) throw new OrgmasterPersistenceError('PERSISTENCE_WRITE_FAILED')
    return {
      authorityVersion: Number(result.rows[0].authority_version),
      sourceRevision: String(result.rows[0].source_revision).trim(),
      outboxCount: result.rows[0].outbox_count === null ? null : Number(result.rows[0].outbox_count),
      revisions: Object.fromEntries(prepared.map((change) => [change.artifactKey, change.nextCanonicalSha256])),
    }
  } catch (error) {
    throw mappedError(error, 'PERSISTENCE_WRITE_FAILED')
  }
}

export async function writePersistenceMedia(input: { mediaKey: string; bytes: Buffer; mimeType: string; database?: Queryable }) {
  try {
    await database(input.database).query('SELECT orgmaster.write_persistence_media_v1($1, $2, $3, $4)', [input.mediaKey, input.bytes, input.mimeType, sha256(input.bytes)])
  } catch (error) {
    throw mappedError(error, 'PERSISTENCE_WRITE_FAILED')
  }
}

export async function readPersistenceMedia(input: { mediaKey: string; database?: Queryable }) {
  try {
    const result = await database(input.database).query('SELECT media_bytes, mime_type, content_sha256 FROM orgmaster.read_persistence_media_v1($1)', [input.mediaKey])
    if (result.rowCount !== 1) throw new OrgmasterPersistenceError('PERSISTENCE_MEDIA_NOT_FOUND')
    return { bytes: Buffer.from(result.rows[0].media_bytes), mimeType: String(result.rows[0].mime_type), contentSha256: String(result.rows[0].content_sha256).trim() }
  } catch (error) {
    throw mappedError(error, 'PERSISTENCE_MEDIA_NOT_FOUND')
  }
}

export async function removePersistenceMedia(input: { mediaKey: string; database?: Queryable }) {
  try {
    await database(input.database).query('SELECT orgmaster.delete_persistence_media_v1($1)', [input.mediaKey])
  } catch (error) {
    throw mappedError(error, 'PERSISTENCE_WRITE_FAILED')
  }
}

export async function closeOrgmasterPersistencePool() {
  await runtimePool?.end()
  runtimePool = null
  runtimePoolUrl = ''
}
