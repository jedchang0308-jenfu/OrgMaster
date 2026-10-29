import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LOCAL_SANDBOX_VERSION, canonicalJson, sha256 } from '../contracts/local-principal-sandbox/v1/protocol.mjs'
import {
  initializeEmptyLocalOwnerBootstrap,
  prepareEmptyLocalOwnerBootstrap,
  type EmptyLocalOwnerBootstrapDatabase,
  type EmptyLocalOwnerBootstrapInput,
  type PreparedEmptyLocalOwnerBootstrap,
} from './localPrincipalSandboxEmptyBootstrap'

const input: EmptyLocalOwnerBootstrapInput = {
  config: {
    contractVersion: LOCAL_SANDBOX_VERSION,
    applicationId: 'orgmaster',
    sandboxId: 'dev060-empty-owner-20261029',
    origin: 'http://127.0.0.1:4173',
    platformOrigin: 'http://127.0.0.1:4174',
    bindHost: '127.0.0.1',
    databaseName: 'jenfu_local_dev060_empty_owner_20261029',
    runtimeRole: 'local_org_runtime_test',
    databaseUrl: 'postgres://local-only.invalid/orgmaster',
  },
  target: { port: 5432, sessionUser: 'local_org_seed_0123456789abcdef' },
  targetRoot: join(tmpdir(), 'orgmaster-empty-owner'),
  createdAt: '2026-10-29T00:00:00Z',
}

type BatchRow = Record<string, unknown>
type ArtifactRow = Record<string, unknown>

class MemoryDatabase implements EmptyLocalOwnerBootstrapDatabase {
  readonly statements: string[] = []
  readonly batches = new Map<string, BatchRow>()
  readonly artifacts = new Map<string, ArtifactRow[]>()
  activeBatchId: string | null = null
  authorityVersion = 0
  sessions = 0
  priorBatchCount = 0
  failAt: string | null = null

  seedActiveBatch(batchId: string, prepared: PreparedEmptyLocalOwnerBootstrap, options: {
    manifest?: unknown
    sourceRevision?: string
    status?: string
    corruptArtifact?: boolean
  } = {}) {
    const manifest = options.manifest ?? prepared.sourceManifest
    const artifactRows = prepared.artifacts.map((artifact) => ({
      artifact_key: artifact.artifactKey,
      artifact_kind: artifact.artifactKind,
      payload: artifact.payload,
      source_sha256: artifact.sourceSha256,
      canonical_sha256: artifact.canonicalSha256,
      source_bytes: artifact.sourceBytes,
    }))
    if (options.corruptArtifact && artifactRows[0]) artifactRows[0] = { ...artifactRows[0], canonical_sha256: '0'.repeat(64) }
    this.batches.set(batchId, {
      batch_id: batchId,
      source_revision: options.sourceRevision ?? prepared.sourceRevision,
      source_manifest: manifest,
      artifact_count: prepared.batch.artifactCount,
      media_count: 0,
      source_bytes: prepared.batch.sourceBytes,
      status: options.status ?? 'active',
    })
    this.artifacts.set(batchId, artifactRows)
    this.activeBatchId = batchId
    this.authorityVersion = 1
    this.priorBatchCount = 1
  }

  async query(sql: string, values: unknown[] = []) {
    const normalized = sql.replace(/\s+/gu, ' ').trim()
    this.statements.push(normalized)
    if (this.failAt && normalized.startsWith(this.failAt)) {
      throw Object.assign(new Error('FAKE_DATABASE_FAILURE'), { code: '23505' })
    }
    if (/^(BEGIN|SET LOCAL|COMMIT|ROLLBACK)/u.test(normalized)) return { rows: [], rowCount: null }
    if (normalized.startsWith('SELECT current_database()')) return { rows: [{
      database_name: input.config.databaseName,
      address: '127.0.0.1',
      port: input.target.port,
      session_user: input.target.sessionUser,
    }], rowCount: 1 }
    if (normalized.includes('FROM orgmaster_core.managed_identity_admission_authority')) return { rows: [{ singleton: true }], rowCount: 1 }
    if (normalized.includes('FROM orgmaster_core.persistence_authority')) return { rows: [{
      active_batch_id: this.activeBatchId,
      authority_version: this.authorityVersion,
    }], rowCount: 1 }
    if (normalized.includes('FROM orgmaster_core.persistence_batches WHERE id=$1')) {
      const row = this.batches.get(String(values[0]))
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 }
    }
    if (normalized.includes('FROM orgmaster_core.app_sessions')) return { rows: [{ session_count: this.sessions }], rowCount: 1 }
    if (normalized.includes('count(*)::int AS batch_count')) return { rows: [{ batch_count: this.priorBatchCount }], rowCount: 1 }
    if (normalized.startsWith('INSERT INTO orgmaster_core.persistence_batches')) {
      const [id, sourceRevision, sourceManifest, artifactCount, sourceBytes] = values
      const batchId = String(id)
      this.batches.set(batchId, {
        batch_id: batchId,
        source_revision: sourceRevision,
        source_manifest: JSON.parse(String(sourceManifest)),
        artifact_count: artifactCount,
        media_count: 0,
        source_bytes: sourceBytes,
        status: 'active',
      })
      this.artifacts.set(batchId, [])
      this.priorBatchCount += 1
      return { rows: [], rowCount: 1 }
    }
    if (normalized.startsWith('INSERT INTO orgmaster_core.persistence_artifacts')) {
      const [batchIdValue, artifactKey, artifactKind, payload, sourceSha256, canonicalSha256, sourceBytes] = values
      const batchId = String(batchIdValue)
      this.artifacts.get(batchId)?.push({
        artifact_key: artifactKey,
        artifact_kind: artifactKind,
        payload: JSON.parse(String(payload)),
        source_sha256: sourceSha256,
        canonical_sha256: canonicalSha256,
        source_bytes: sourceBytes,
      })
      return { rows: [], rowCount: 1 }
    }
    if (normalized.startsWith('UPDATE orgmaster_core.persistence_authority')) {
      this.activeBatchId = String(values[0])
      this.authorityVersion = 1
      return { rows: [{ singleton: true }], rowCount: 1 }
    }
    if (normalized.includes('FROM orgmaster_core.persistence_artifacts WHERE batch_id=$1')) {
      const rows = [...(this.artifacts.get(String(values[0])) ?? [])]
        .sort((left, right) => String(left.artifact_key).localeCompare(String(right.artifact_key)))
      return { rows, rowCount: rows.length }
    }
    throw new Error(`UNEXPECTED_FAKE_QUERY: ${normalized}`)
  }
}

function errorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error ? (error as { code: unknown }).code : undefined
}

describe('local empty owner bootstrap', () => {
  it('prepares exactly three hashed native artifacts and a valid empty active V3 policy', () => {
    const prepared = prepareEmptyLocalOwnerBootstrap(input)
    expect(prepared.status).toBe('materialized-in-memory')
    expect(prepared.applicationId).toBe('orgmaster')
    expect(prepared.sourceManifest.format).toBe('orgmaster.local-empty-bootstrap.v1')
    expect(prepared.sourceManifest.sandboxId).toBe(input.config.sandboxId)
    expect(prepared.artifacts.map(({ artifactKind }) => artifactKind).sort()).toEqual([
      'governance', 'workspace-manifest', 'workspace-version',
    ])
    expect(prepared.artifacts).toHaveLength(3)
    expect(prepared.artifacts.every((artifact) => artifact.sourceSha256 === sha256(artifact.raw))).toBe(true)
    expect(prepared.artifacts.every((artifact) => artifact.canonicalSha256 === sha256(canonicalJson(artifact.payload)))).toBe(true)
    expect(prepared.artifacts.every((artifact) => artifact.sourceBytes === Buffer.byteLength(artifact.raw, 'utf8'))).toBe(true)
    expect(prepared.sourceManifest.artifacts).toEqual(prepared.artifactHashes)

    const active = prepared.governance.publishedVersions.find((version) => version.id === prepared.governance.activePolicyVersionId)
    expect(active?.kind).toBe('assignment-governance-v3')
    if (active?.kind !== 'assignment-governance-v3') throw new Error('ACTIVE_V3_VERSION_MISSING')
    expect(active.publishedByPrincipalId).toBe('local-fixture-bootstrap')
    expect(active.externalRoleCatalogs).toEqual([])
    expect(active.policy.applications.map((application) => application.id)).toEqual([
      'orgmaster', 'ai-pdm', 'financial-management-system',
    ])
    expect(active.policy.applications.every(({ id }) => /^[a-z0-9][a-z0-9-]{0,127}$/u.test(id))).toBe(true)
    expect(prepared.workspace.currentVersion.state.employees).toEqual([])
    expect(active.policy.identityLinks).toEqual([])
    expect(active.policy.principalAdmissions).toEqual([])
    expect(active.policy.roleAssignments).toEqual([])
    expect(active.policy.managementGrants).toEqual([])
    expect(JSON.stringify(active)).not.toContain('ai-pdm.role-catalog.2026-10')
  })

  it('commits the manifest and all three artifacts atomically under the owner role', async () => {
    const database = new MemoryDatabase()
    const result = await initializeEmptyLocalOwnerBootstrap(database, input)
    expect(result.stage).toBe('empty-native-owner-initialization-committed')
    expect(database.batches.size).toBe(1)
    expect(database.activeBatchId).toBe(result.batchId)
    expect(database.artifacts.get(result.batchId)).toHaveLength(3)
    expect(database.statements).toContain('SET LOCAL ROLE jenfu_orgmaster_migrator')
    expect(database.statements.at(-1)).toBe('COMMIT')
    expect(database.statements.some((statement) => statement.startsWith('INSERT INTO orgmaster_core.persistence_batches'))).toBe(true)
  })

  it('reuses the exact active empty publication without writing new state', async () => {
    const prepared = prepareEmptyLocalOwnerBootstrap(input)
    const database = new MemoryDatabase()
    database.seedActiveBatch('existing-empty-batch', prepared)
    const result = await initializeEmptyLocalOwnerBootstrap(database, input)
    expect(result).toMatchObject({ stage: 'empty-native-owner-initialization-reused', batchId: 'existing-empty-batch' })
    expect(database.statements.some((statement) => /^(INSERT|UPDATE) /u.test(statement))).toBe(false)
    expect(database.statements.at(-1)).toBe('COMMIT')
  })

  it('refuses an active batch whose artifact checksum readback differs', async () => {
    const prepared = prepareEmptyLocalOwnerBootstrap(input)
    const database = new MemoryDatabase()
    database.seedActiveBatch('tampered-empty-batch', prepared, { corruptArtifact: true })
    await expect(initializeEmptyLocalOwnerBootstrap(database, input)).rejects.toSatisfy((error: unknown) =>
      errorCode(error) === 'LOCAL_EMPTY_BOOTSTRAP_ARTIFACT_READBACK_MISMATCH')
    expect(database.statements.at(-1)).toBe('ROLLBACK')
  })

  it('recognizes a same-sandbox final seed publication without modifying it', async () => {
    const prepared = prepareEmptyLocalOwnerBootstrap(input)
    const database = new MemoryDatabase()
    database.seedActiveBatch('final-seed-batch', prepared, {
      manifest: { format: 'orgmaster.local-principal-seed.v1', sandboxId: input.config.sandboxId },
    })
    const result = await initializeEmptyLocalOwnerBootstrap(database, input)
    expect(result).toMatchObject({
      stage: 'final-publication-present',
      batchId: 'final-seed-batch',
      sourceRevision: prepared.sourceRevision,
    })
    expect(database.statements.some((statement) => statement.includes('orgmaster_core.app_sessions'))).toBe(true)
    expect(database.statements.some((statement) => /^(INSERT|UPDATE) /u.test(statement))).toBe(false)
    expect(database.statements.at(-1)).toBe('COMMIT')
  })

  it('refuses to report a final publication while native application sessions remain', async () => {
    const prepared = prepareEmptyLocalOwnerBootstrap(input)
    const database = new MemoryDatabase()
    database.seedActiveBatch('final-seed-with-session', prepared, {
      manifest: { format: 'orgmaster.local-principal-seed.v1', sandboxId: input.config.sandboxId },
    })
    database.sessions = 1
    await expect(initializeEmptyLocalOwnerBootstrap(database, input)).rejects.toMatchObject({
      code: 'LOCAL_EMPTY_BOOTSTRAP_NOT_EMPTY',
    })
    expect(database.statements.at(-1)).toBe('ROLLBACK')
    expect(database.statements.some((statement) => /^(INSERT|UPDATE) /u.test(statement))).toBe(false)
  })

  it('refuses other active state and any native application session', async () => {
    const prepared = prepareEmptyLocalOwnerBootstrap(input)
    const occupied = new MemoryDatabase()
    occupied.seedActiveBatch('other-batch', prepared, {
      manifest: { format: 'orgmaster.local-empty-bootstrap.v1', sandboxId: 'other-sandbox', artifacts: [] },
    })
    await expect(initializeEmptyLocalOwnerBootstrap(occupied, input)).rejects.toSatisfy((error: unknown) =>
      errorCode(error) === 'LOCAL_EMPTY_BOOTSTRAP_NOT_EMPTY')

    const sessions = new MemoryDatabase()
    sessions.sessions = 1
    await expect(initializeEmptyLocalOwnerBootstrap(sessions, input)).rejects.toSatisfy((error: unknown) =>
      errorCode(error) === 'LOCAL_EMPTY_BOOTSTRAP_NOT_EMPTY')
    expect(sessions.batches.size).toBe(0)
    expect(sessions.statements.at(-1)).toBe('ROLLBACK')
  })

  it('preserves the database error code when wrapping a write failure', async () => {
    const database = new MemoryDatabase()
    database.failAt = 'INSERT INTO orgmaster_core.persistence_batches'
    await expect(initializeEmptyLocalOwnerBootstrap(database, input)).rejects.toMatchObject({
      code: 'LOCAL_EMPTY_BOOTSTRAP_INITIALIZATION_FAILED',
      databaseCode: '23505',
      cause: expect.objectContaining({ message: 'FAKE_DATABASE_FAILURE' }),
    })
    expect(database.statements.at(-1)).toBe('ROLLBACK')
  })
})
