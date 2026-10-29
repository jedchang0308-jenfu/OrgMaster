import { createHash } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { readFile, stat } from 'node:fs/promises'
import pg from 'pg'
import { writeVerifiedAtomicFile } from './orgmasterFileStore'
import { closeOrgmasterDatabase, closeOrgmasterLocalSandboxDatabase, createOrgmasterDatabase, createOrgmasterLocalSandboxDatabase, isOrgmasterLocalSandboxDatabaseTarget } from './orgmasterDatabase'

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

type Queryable = Pick<pg.Pool, 'query'>
const transactionDatabase = new AsyncLocalStorage<Queryable>()
const persistencePrincipal = new AsyncLocalStorage<string>()
const localSandboxPersistenceTarget = new AsyncLocalStorage<string>()
const localPrincipalDiagnosticContext = new AsyncLocalStorage<boolean>()

export type OrgmasterLocalPersistenceDiagnosticStage =
  | 'governance_session_store_read'
  | 'governance_v3_artifact_read'
  | 'governance_v3_audit_chain_validate'
  | 'governance_workspace_source_read'
  | 'governance_v3_owned_catalog_validate'
  | 'governance_v3_catalog_history_read'
  | 'governance_v3_document_validate'
  | 'persistence_artifact_exists'
  | 'persistence_artifact_read'

/** Marks only the authenticated synthetic-principal request whose source reads need local diagnostics. */
export function withOrgmasterLocalPrincipalDiagnosticContext<T>(run: () => T): T {
  return localPrincipalDiagnosticContext.run(true, run)
}

function diagnosticArtifactKey(value: string | undefined) {
  if (!value) return undefined
  if (['orgmaster-workspace.v1.json', 'orgmaster-governance.v3.json', 'orgmaster-governance.v2.json',
    'orgmaster-management-methods.v1.json'].includes(value) ||
    /^orgmaster-versions\/[A-Za-z0-9-]{1,80}\.json$/u.test(value)) return value
  return 'unrecognized'
}

function diagnosticErrorFrames(error: unknown) {
  if (!(error instanceof Error) || typeof error.stack !== 'string') return []
  return error.stack.split(/\r?\n/u).slice(1).flatMap((frame) => {
    const normalized = frame.trim().replace(/^at\s+/u, '').replace(/\)$/u, '')
    const location = normalized.match(/([^/\\():]+\.(?:tsx|ts|mjs|cjs|js)):(\d+):(\d+)$/u)
    if (!location) return []
    const functionName = normalized.match(/^([A-Za-z0-9_$<>.-]{1,120})\s+\(/u)?.[1] ?? 'anonymous'
    return [`${functionName}@${location[1]}:${location[2]}:${location[3]}`]
  }).slice(0, 8)
}

function diagnosticValidationIssues(value: unknown) {
  if (!Array.isArray(value)) return []
  const safe: Array<{ code: string; path: string }> = []
  for (const issue of value) {
    if (safe.length >= 10 || !issue || typeof issue !== 'object') break
    const candidate = issue as { code?: unknown; path?: unknown }
    if (typeof candidate.code !== 'string' || !/^[A-Z][A-Z0-9_]{0,79}$/u.test(candidate.code) ||
      typeof candidate.path !== 'string' || candidate.path.length > 160 ||
      !(candidate.path === '' || /^[A-Za-z][A-Za-z0-9_]*(?:\[\d{1,6}\])?(?:\.[A-Za-z][A-Za-z0-9_]*(?:\[\d{1,6}\])?)*$/u.test(candidate.path))) continue
    safe.push({ code: candidate.code, path: candidate.path })
  }
  return safe
}

/** Emit only allowlisted diagnostics for a verified local-principal request; never include messages or query data. */
export function warnOrgmasterLocalPersistenceDiagnostic(
  stage: OrgmasterLocalPersistenceDiagnosticStage,
  error: unknown,
  artifactKey?: string,
  options: { localPrincipalRequest?: boolean; validationIssues?: unknown } = {},
) {
  const persistenceTargetActive = Boolean(localSandboxPersistenceTarget.getStore())
  if (!persistenceTargetActive && !localPrincipalDiagnosticContext.getStore() && options.localPrincipalRequest !== true) return
  const candidate = error && typeof error === 'object' ? error as { name?: unknown; code?: unknown } : null
  const errorName = typeof candidate?.name === 'string' && /^[A-Za-z0-9_.-]{1,80}$/u.test(candidate.name)
    ? candidate.name : 'Error'
  const errorCode = typeof candidate?.code === 'string' && /^[A-Za-z0-9_-]{1,64}$/u.test(candidate.code)
    ? candidate.code : undefined
  const diagnostic = {
    event: 'orgmaster_local_persistence_read_failed',
    stage,
    persistenceTargetActive,
    ...(artifactKey ? { artifactKey: diagnosticArtifactKey(artifactKey) } : {}),
    errorName,
    ...(errorCode ? { errorCode } : {}),
    ...(options.validationIssues !== undefined ? { validationIssues: diagnosticValidationIssues(options.validationIssues) } : {}),
    stackFrames: diagnosticErrorFrames(error),
  }
  try { console.warn(JSON.stringify(diagnostic)) } catch { /* logging must not alter authorization or persistence results */ }
}

/** Carries the already verified security subject through normal API writes.
 * This is actor propagation, not an authentication or capability decision. */
export function withPersistencePrincipal<T>(principalId: string, run: () => T): T {
  if (!principalId || principalId.trim() !== principalId || principalId.length > 255) throw new OrgmasterPersistenceError('PERSISTENCE_WRITE_FAILED')
  return persistencePrincipal.run(principalId, run)
}

/** Bind ordinary OrgMaster persistence calls to the already verified local sandbox DB for this request. */
export function withOrgmasterLocalSandboxPersistenceTarget<T>(databaseUrl: string, run: () => T): T {
  if (!isOrgmasterLocalSandboxDatabaseTarget(databaseUrl)) {
    throw new OrgmasterPersistenceError('PERSISTENCE_NOT_CONFIGURED')
  }
  if ((process.env.ORGMASTER_PERSISTENCE_MODE && process.env.ORGMASTER_PERSISTENCE_MODE !== 'cloud-sql') ||
    (process.env.ORGMASTER_POSTGRES_URL?.trim() && process.env.ORGMASTER_POSTGRES_URL.trim() !== databaseUrl)) {
    throw new OrgmasterPersistenceError('PERSISTENCE_NOT_CONFIGURED')
  }
  return localSandboxPersistenceTarget.run(databaseUrl, run)
}

export class OrgmasterPersistenceError extends Error {
  constructor(public readonly code: 'PERSISTENCE_NOT_CONFIGURED' | 'PERSISTENCE_ARTIFACT_NOT_FOUND' | 'PERSISTENCE_REVISION_CONFLICT' | 'PERSISTENCE_READ_FAILED' | 'PERSISTENCE_WRITE_FAILED' | 'PERSISTENCE_MEDIA_NOT_FOUND') {
    super(code)
    this.name = 'OrgmasterPersistenceError'
  }
}

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
  if (environment === process.env && localSandboxPersistenceTarget.getStore()) return 'cloud-sql'
  const value = environment.ORGMASTER_PERSISTENCE_MODE?.trim() || 'local-json'
  if (value === 'local-json' || value === 'cloud-sql') return value
  throw new OrgmasterPersistenceError('PERSISTENCE_NOT_CONFIGURED')
}

export function usesCloudSqlPersistence(environment: NodeJS.ProcessEnv = process.env) {
  return resolveOrgmasterPersistenceMode(environment) === 'cloud-sql'
}

function poolForRuntime(environment: NodeJS.ProcessEnv = process.env) {
  const localTarget = environment === process.env ? localSandboxPersistenceTarget.getStore() : undefined
  if (localTarget) return createOrgmasterLocalSandboxDatabase(localTarget)
  const url = environment.ORGMASTER_POSTGRES_URL?.trim()
  if (!url) throw new OrgmasterPersistenceError('PERSISTENCE_NOT_CONFIGURED')
  return createOrgmasterDatabase(url, environment)
}

function database(input?: Queryable) {
  return input ?? transactionDatabase.getStore() ?? poolForRuntime()
}

/** Governance owns this transaction. Every nested artifact read/write uses its one runtime client. */
export async function withPersistenceTransaction<T>(run: () => Promise<T>): Promise<T> {
  if (!usesCloudSqlPersistence() || transactionDatabase.getStore()) return run()
  const client = await (poolForRuntime() as pg.Pool).connect()
  try {
    // The writer acquires the established admission/persistence locks. A fresh post-lock
    // read must observe a withdrawal that committed while it waited, so use READ COMMITTED.
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED')
    const result = await transactionDatabase.run(client, run)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export function currentPersistenceTransactionDatabase(): Queryable {
  const current = transactionDatabase.getStore()
  if (!current) throw new OrgmasterPersistenceError('PERSISTENCE_WRITE_FAILED')
  return current
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
    try { await stat(localPath); return true } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
        warnOrgmasterLocalPersistenceDiagnostic('persistence_artifact_exists', error, artifactKey)
      }
      return false
    }
  }
  try {
    const result = await database(input).query('SELECT 1 FROM orgmaster_core.read_active_persistence_artifact_v1($1)', [artifactKey])
    return Boolean(result.rowCount)
  } catch (error) {
    warnOrgmasterLocalPersistenceDiagnostic('persistence_artifact_exists', error, artifactKey)
    throw mappedError(error, 'PERSISTENCE_READ_FAILED')
  }
}

export async function readPersistenceArtifact(input: { localPath: string; artifactKey: string; artifactKind: PersistenceArtifactKind; database?: Queryable }): Promise<PersistenceArtifactRead> {
  if (!usesCloudSqlPersistence() && !input.database) {
    try {
      const raw = await readFile(input.localPath, 'utf8')
      return { artifactKey: input.artifactKey, artifactKind: input.artifactKind, payload: objectPayload(JSON.parse(raw)), raw, revision: sha256(raw), sourceRevision: null }
    } catch (error) {
      warnOrgmasterLocalPersistenceDiagnostic('persistence_artifact_read', error, input.artifactKey)
      throw error
    }
  }
  try {
    const result = await database(input.database).query(`SELECT artifact_key, artifact_kind, payload, canonical_sha256, source_revision
      FROM orgmaster_core.read_active_persistence_artifact_v1($1)`, [input.artifactKey])
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
    warnOrgmasterLocalPersistenceDiagnostic('persistence_artifact_read', error, input.artifactKey)
    throw mappedError(error, 'PERSISTENCE_READ_FAILED')
  }
}

export async function writePersistenceArtifacts(changes: PersistenceArtifactWrite[], input?: { database?: Queryable; updatedBy?: string; reasonCode?: string; operationId?: string; entitlementChanges?: PersistenceEntitlementChange[] }) {
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
    const authority = await database(input?.database).query('SELECT source_revision FROM orgmaster_core.read_active_persistence_authority_v1()')
    if (authority.rowCount !== 1) throw new OrgmasterPersistenceError('PERSISTENCE_READ_FAILED')
    const sourceRevision = sha256(canonicalJson({ previousSourceRevision: String(authority.rows[0].source_revision).trim(), changes: prepared.map(({ payload: _payload, ...metadata }) => metadata) }))
    const verifiedPrincipal = persistencePrincipal.getStore()
    const requestedPrincipal = input?.updatedBy?.trim()
    if (verifiedPrincipal && requestedPrincipal && verifiedPrincipal !== requestedPrincipal) throw new OrgmasterPersistenceError('PERSISTENCE_WRITE_FAILED')
    const updatedBy = verifiedPrincipal ?? requestedPrincipal
    if (!updatedBy || updatedBy.length > 255) throw new OrgmasterPersistenceError('PERSISTENCE_WRITE_FAILED')
    const reasonCode = input?.reasonCode?.trim() || 'runtime_artifact_write'
    const entitlementChanges = input?.entitlementChanges ?? []
    const result = await database(input?.database).query(`SELECT authority_version, source_revision, outbox_count
        FROM orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v2($1::jsonb, $2, $3, $4, $5, $6::jsonb)`, [
      JSON.stringify(prepared), sourceRevision, updatedBy, reasonCode, input?.operationId ?? `orgmaster-write-${sourceRevision.slice(0, 24)}`, JSON.stringify(entitlementChanges),
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
    await database(input.database).query('SELECT orgmaster_core.write_persistence_media_v1($1, $2, $3, $4)', [input.mediaKey, input.bytes, input.mimeType, sha256(input.bytes)])
  } catch (error) {
    throw mappedError(error, 'PERSISTENCE_WRITE_FAILED')
  }
}

export async function readPersistenceMedia(input: { mediaKey: string; database?: Queryable }) {
  try {
    const result = await database(input.database).query('SELECT media_bytes, mime_type, content_sha256 FROM orgmaster_core.read_persistence_media_v1($1)', [input.mediaKey])
    if (result.rowCount !== 1) throw new OrgmasterPersistenceError('PERSISTENCE_MEDIA_NOT_FOUND')
    return { bytes: Buffer.from(result.rows[0].media_bytes), mimeType: String(result.rows[0].mime_type), contentSha256: String(result.rows[0].content_sha256).trim() }
  } catch (error) {
    throw mappedError(error, 'PERSISTENCE_MEDIA_NOT_FOUND')
  }
}

export async function removePersistenceMedia(input: { mediaKey: string; database?: Queryable }) {
  try {
    await database(input.database).query('SELECT orgmaster_core.delete_persistence_media_v1($1)', [input.mediaKey])
  } catch (error) {
    throw mappedError(error, 'PERSISTENCE_WRITE_FAILED')
  }
}

export async function closeOrgmasterPersistencePool() {
  await closeOrgmasterDatabase()
  await closeOrgmasterLocalSandboxDatabase()
}
