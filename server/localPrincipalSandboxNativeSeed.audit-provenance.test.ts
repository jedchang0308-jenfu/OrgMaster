import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { createAiPdmRoleCatalog } from '../src/governance/aiPdmCatalog'
import { migrateGovernanceV2ToV3 } from '../src/governance/migrateGovernanceV2ToV3'
import { createSeedDocumentV2 } from '../src/governance/migrateGovernanceV1ToV2'
import { canonicalJson, contractDigest, readLocalSandboxConfig, sha256 } from '../contracts/local-principal-sandbox/v1/protocol.mjs'
import { validateAndNormalizeFinancialCatalogRelease } from './financialCatalogReleaseStore'
import { readPublishedAiPdmRoleCatalog } from './aiPdmRoleCatalogRepository'
import { buildLocalPrincipalSandboxFixture } from './localPrincipalSandboxFixture.mjs'
import {
  materializeLegacyLocalPrincipalSandboxNativeFixtureForBatchProof,
  materializeLocalPrincipalSandboxNativeFixture,
  type LocalPrincipalSandboxFmsCatalogPin,
  type LocalPrincipalSandboxNativeFixtureInput,
  type LocalPrincipalSandboxPdmV7Readback,
} from './localPrincipalSandboxNativeFixture'
import { publishLocalPrincipalSandboxAuditProvenance } from './localPrincipalSandboxNativeSeed'

const STAMP = '2026-10-29T12:00:00.000Z'
const OLD_BATCH_ID = '11111111-1111-4111-8111-111111111111'

type SeedInput = {
  config: ReturnType<typeof readLocalSandboxConfig>
  target: { port: number; dataDirectory: string; sessionUser: string }
  fixture: LocalPrincipalSandboxNativeFixtureInput
}
type ArtifactProof = {
  artifactKey: string
  artifactKind: string
  payload: Record<string, unknown>
  sourceSha256: string
  canonicalSha256: string
  sourceBytes: number
}
type BatchProof = {
  sourceRevision: string
  manifest: Record<string, string>
  artifacts: ArtifactProof[]
}
type QueryResult = { rows: Record<string, unknown>[]; rowCount: number | null }
type QueryCall = { sql: string; values: unknown[] }
type DatabaseOptions = {
  physicalAddress?: string
  physicalSessionUser?: string
  omitExistingBatch?: boolean
  corruptExistingArtifact?: boolean
  identityMismatch?: boolean
  rejectAuthorityCas?: boolean
  commitOutcomeUnknown?: boolean
}

function sha256Text(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

async function pdmReadbackFixture(): Promise<LocalPrincipalSandboxPdmV7Readback> {
  const catalog = await readPublishedAiPdmRoleCatalog(process.cwd(), 'ai-pdm.role-catalog.2026-10-10.v7')
  return { ...catalog, sourcePath: 'postgres:ai_pdm_contract.v_application_role_catalog_v2' } as LocalPrincipalSandboxPdmV7Readback
}

function fmsCatalogPinFixture(): LocalPrincipalSandboxFmsCatalogPin {
  const catalog = {
    formatVersion: 'jf.configuration-catalog.v1',
    applicationId: 'financial-management-system',
    catalogVersion: 'fms.audit-provenance-test.v1',
    registryVersion: 'fms.audit-provenance-test-registry.v1',
    roles: [{ stableRoleId: 'role-owner', code: 'owner', displayName: 'Owner', builtIn: true,
      capabilityIds: ['finance.dashboard.view'], allowedScopeKinds: ['workspace'],
      assignmentPolicy: 'open' as const, roleDefinitionHash: '' }],
    publishedAt: STAMP,
    publishedBy: { principalId: 'test-release-principal', employeeId: 'employee-local-test-release' },
  }
  const roleBase = { ...catalog.roles[0] }
  delete (roleBase as Partial<typeof catalog.roles[number]>).roleDefinitionHash
  catalog.roles[0].roleDefinitionHash = sha256Text(canonicalJson(roleBase))
  const artifactUtf8 = canonicalJson(catalog) + '\n'
  const release = {
    applicationId: catalog.applicationId,
    version: catalog.catalogVersion,
    contentSha256: sha256Text(canonicalJson(catalog)),
    artifactSha256: sha256Text(artifactUtf8),
    artifactUtf8,
    sourceDraftId: 'audit-provenance-test-draft',
    sourceDraftRevision: 1,
    createdBy: catalog.publishedBy,
    createdAt: STAMP,
  }
  return validateAndNormalizeFinancialCatalogRelease(release, {
    principalId: catalog.publishedBy.principalId,
    employeeId: catalog.publishedBy.employeeId,
    issuer: 'test-only-issuer',
    subject: 'test-only-subject',
    bootstrap: false,
  }) as LocalPrincipalSandboxFmsCatalogPin
}

async function makeSeedInput(): Promise<SeedInput> {
  const sandboxId = 'dev060-audit-provenance-test'
  const config = readLocalSandboxConfig({
    NODE_ENV: 'development',
    JENFU_LOCAL_SANDBOX_ENABLED: '1',
    JENFU_LOCAL_SANDBOX_ID: sandboxId,
    JENFU_LOCAL_SANDBOX_ORIGIN: 'http://localhost:12010',
    JENFU_LOCAL_SANDBOX_PLATFORM_ORIGIN: 'http://localhost:12000',
    JENFU_LOCAL_SANDBOX_BIND_HOST: '127.0.0.1',
    JENFU_LOCAL_SANDBOX_DATABASE_URL: `postgresql://local_org_runtime:private@127.0.0.1:15439/${'jenfu_local_' + sandboxId.replaceAll('-', '_')}`,
    JENFU_LOCAL_SANDBOX_RUNTIME_ROLE: 'local_org_runtime',
  }, 'orgmaster')
  const pdmCatalog = await readPublishedAiPdmRoleCatalog(process.cwd(), 'ai-pdm.role-catalog.2026-10-10.v7')
  const pdmReadback = { ...pdmCatalog, sourcePath: 'postgres:ai_pdm_contract.v_application_role_catalog_v2' } as LocalPrincipalSandboxPdmV7Readback
  return {
    config,
    target: { port: 15439, dataDirectory: path.join(tmpdir(), 'orgmaster-audit-provenance-data'),
      sessionUser: 'local_org_seed_0123456789abcdef' },
    fixture: { fixture: buildLocalPrincipalSandboxFixture(), sandboxId,
      targetRoot: path.join(tmpdir(), 'orgmaster-audit-provenance-' + randomUUID()),
      pdmCatalogReadback: pdmReadback, fmsCatalogPin: fmsCatalogPinFixture(), createdAt: STAMP },
  }
}

function batchProof(materialized: ReturnType<typeof materializeLocalPrincipalSandboxNativeFixture>, sandboxId: string): BatchProof {
  const artifacts = materialized.persistenceArtifacts.map((artifact) => ({
    artifactKey: artifact.artifactKey,
    artifactKind: artifact.artifactKind,
    payload: artifact.payload,
    sourceSha256: sha256(artifact.raw),
    canonicalSha256: sha256(canonicalJson(artifact.payload)),
    sourceBytes: Buffer.byteLength(artifact.raw, 'utf8'),
  }))
  return {
    artifacts,
    sourceRevision: contractDigest({ format: 'orgmaster.local-principal-seed.v1', sandboxId,
      fixtureHash: materialized.fixtureHash, artifacts: artifacts.map((artifact) => ({ key: artifact.artifactKey,
        kind: artifact.artifactKind, sourceSha256: artifact.sourceSha256, canonicalSha256: artifact.canonicalSha256 })) }),
    manifest: { format: 'orgmaster.local-principal-seed.v1', sandboxId,
      fixtureVersion: materialized.fixtureVersion, fixtureHash: materialized.fixtureHash },
  }
}

function batchRow(proof: BatchProof) {
  return { source_revision: proof.sourceRevision, source_manifest: proof.manifest,
    artifact_count: proof.artifacts.length, media_count: 0,
    source_bytes: proof.artifacts.reduce((sum, artifact) => sum + artifact.sourceBytes, 0), status: 'active' }
}

class FakeSeedDatabase {
  readonly queries: QueryCall[] = []
  state: {
    authority: { active_batch_id: string; authority_version: number }
    batches: Map<string, Record<string, unknown>>
    artifacts: Map<string, Record<string, unknown>[]>
  }
  private transactionSnapshot: FakeSeedDatabase['state'] | null = null

  constructor(private readonly input: SeedInput, proof: BatchProof, private readonly options: DatabaseOptions = {}) {
    const artifacts = proof.artifacts.map((artifact) => ({
      batch_id: OLD_BATCH_ID,
      artifact_key: artifact.artifactKey,
      artifact_kind: artifact.artifactKind,
      payload: structuredClone(artifact.payload),
      source_sha256: artifact.sourceSha256,
      canonical_sha256: artifact.canonicalSha256,
      source_bytes: artifact.sourceBytes,
    }))
    if (options.corruptExistingArtifact && artifacts[0]) artifacts[0].canonical_sha256 = 'f'.repeat(64)
    this.state = {
      authority: { active_batch_id: OLD_BATCH_ID, authority_version: 1 },
      batches: options.omitExistingBatch ? new Map() : new Map([[OLD_BATCH_ID, batchRow(proof)]]),
      artifacts: new Map([[OLD_BATCH_ID, artifacts]]),
    }
  }

  async query(sql: string, values: unknown[] = []): Promise<QueryResult> {
    const normalized = sql.replace(/\s+/gu, ' ').trim()
    this.queries.push({ sql: normalized, values })
    if (normalized.startsWith('BEGIN ')) {
      this.transactionSnapshot = structuredClone(this.state)
      return { rows: [], rowCount: null }
    }
    if (normalized === 'SET LOCAL ROLE jenfu_orgmaster_migrator') return { rows: [], rowCount: null }
    if (normalized === 'ROLLBACK') {
      if (this.transactionSnapshot) this.state = this.transactionSnapshot
      this.transactionSnapshot = null
      return { rows: [], rowCount: null }
    }
    if (normalized === 'COMMIT') {
      if (this.options.commitOutcomeUnknown) {
        this.transactionSnapshot = null
        throw new Error('simulated lost COMMIT response')
      }
      this.transactionSnapshot = null
      return { rows: [], rowCount: null }
    }
    if (normalized.startsWith('SELECT current_database() AS database_name')) {
      return { rows: [{ database_name: this.input.config.databaseName,
        address: this.options.physicalAddress ?? '127.0.0.1', port: this.input.target.port,
        session_user: this.options.physicalSessionUser ?? this.input.target.sessionUser }], rowCount: null }
    }
    if (normalized.includes('FROM orgmaster_core.persistence_authority WHERE singleton=true FOR UPDATE')) {
      return { rows: [structuredClone(this.state.authority)], rowCount: null }
    }
    if (normalized.includes('FROM orgmaster_core.persistence_batches WHERE id=$1')) {
      const row = this.state.batches.get(String(values[0]))
      return { rows: row ? [structuredClone(row)] : [], rowCount: null }
    }
    if (normalized.includes('FROM orgmaster_core.persistence_artifacts WHERE batch_id=$1')) {
      const rows = this.state.artifacts.get(String(values[0])) ?? []
      return { rows: structuredClone(rows).sort((left, right) =>
        String(left.artifact_key).localeCompare(String(right.artifact_key))), rowCount: null }
    }
    if (normalized.includes('FROM orgmaster_core.principal_ownership_reservations o')) {
      return { rows: this.options.identityMismatch ? [] : [{ principal_id: values[0] }], rowCount: null }
    }
    if (normalized.startsWith('INSERT INTO orgmaster_core.persistence_batches ')) {
      this.state.batches.set(String(values[0]), { source_revision: values[1], source_manifest: JSON.parse(String(values[2])),
        artifact_count: values[3], media_count: 0, source_bytes: values[4], status: 'active' })
      this.state.artifacts.set(String(values[0]), [])
      return { rows: [], rowCount: 1 }
    }
    if (normalized.startsWith('INSERT INTO orgmaster_core.persistence_artifacts ')) {
      const batchId = String(values[0])
      const rows = this.state.artifacts.get(batchId) ?? []
      rows.push({ batch_id: batchId, artifact_key: values[1], artifact_kind: values[2], payload: JSON.parse(String(values[3])),
        source_sha256: values[4], canonical_sha256: values[5], source_bytes: values[6] })
      this.state.artifacts.set(batchId, rows)
      return { rows: [], rowCount: 1 }
    }
    if (normalized.startsWith("UPDATE orgmaster_core.persistence_batches SET status='retired'")) {
      const row = this.state.batches.get(String(values[0]))
      if (!row || row.status !== 'active') return { rows: [], rowCount: 0 }
      this.state.batches.set(String(values[0]), { ...row, status: 'retired' })
      return { rows: [{ id: values[0] as string }], rowCount: 1 }
    }
    if (normalized.startsWith('UPDATE orgmaster_core.persistence_authority SET active_batch_id=$1')) {
      const [nextBatchId, oldBatchId, oldVersion] = values
      if (this.options.rejectAuthorityCas || this.state.authority.active_batch_id !== oldBatchId ||
        this.state.authority.authority_version !== oldVersion) return { rows: [], rowCount: 0 }
      this.state.authority = { active_batch_id: String(nextBatchId), authority_version: Number(oldVersion) + 1 }
      return { rows: [{ singleton: true }], rowCount: 1 }
    }
    throw new Error('UNEXPECTED_FAKE_SQL: ' + normalized)
  }
}

function mutationTargets(database: FakeSeedDatabase) {
  return database.queries.flatMap(({ sql }) => {
    const match = sql.match(/^(INSERT INTO|UPDATE)\s+([a-z0-9_.]+)/iu)
    return match ? [`${match[1].toUpperCase()} ${match[2].toLowerCase()}`] : []
  })
}

function expectOwnerSafeSql(database: FakeSeedDatabase) {
  const allowed = new Set([
    'INSERT INTO orgmaster_core.persistence_batches',
    'INSERT INTO orgmaster_core.persistence_artifacts',
    'UPDATE orgmaster_core.persistence_batches',
    'UPDATE orgmaster_core.persistence_authority',
  ])
  expect(mutationTargets(database).every((target) => allowed.has(target))).toBe(true)
  expect(database.queries.some(({ sql }) => /\b(?:COPY|CALL|IMPORT)\b/iu.test(sql))).toBe(false)
  expect(database.queries.some(({ sql }) => /^UPDATE orgmaster_core\.persistence_artifacts\b/iu.test(sql))).toBe(false)
  expect(database.queries.some(({ sql }) => /\b(?:principal_ownership_reservations|principal_identity_reservations|app_sessions)\b/iu.test(sql) &&
    /^(?:INSERT INTO|UPDATE|DELETE FROM)\b/iu.test(sql))).toBe(false)
}

describe('OrgMaster forward audit-provenance publication', () => {
  it('publishes an exact legacy batch as a new immutable batch with pointer CAS, then reuses that exact upgrade', async () => {
    const input = await makeSeedInput()
    const legacy = materializeLegacyLocalPrincipalSandboxNativeFixtureForBatchProof(input.fixture)
    const current = materializeLocalPrincipalSandboxNativeFixture(input.fixture)
    const oldProof = batchProof(legacy, input.config.sandboxId)
    const newProof = batchProof(current, input.config.sandboxId)
    const database = new FakeSeedDatabase(input, oldProof)
    const oldArtifacts = structuredClone(database.state.artifacts.get(OLD_BATCH_ID))

    expect(newProof.sourceRevision).not.toBe(oldProof.sourceRevision)
    expect(current.governanceVersion.policy.identityLinks).toEqual(legacy.governanceVersion.policy.identityLinks)
    expect(current.governanceVersion.policy.principalAdmissions).toEqual(legacy.governanceVersion.policy.principalAdmissions)
    expect(current.governanceVersion.policy.roleAssignments).toEqual(legacy.governanceVersion.policy.roleAssignments)
    expect(current.governanceVersion.policy.managementGrants).toEqual(legacy.governanceVersion.policy.managementGrants)

    const first = await publishLocalPrincipalSandboxAuditProvenance(database, input)
    expect(first).toMatchObject({ previousBatchId: OLD_BATCH_ID,
      sourceRevision: newProof.sourceRevision, stage: 'native-owner-provenance-publication-committed' })
    expect(first.batchId).not.toBe(OLD_BATCH_ID)
    expect(database.state.authority).toEqual({ active_batch_id: first.batchId, authority_version: 2 })
    expect(database.state.batches.get(OLD_BATCH_ID)?.status).toBe('retired')
    expect(database.state.batches.get(first.batchId)?.source_revision).toBe(newProof.sourceRevision)
    expect(database.state.artifacts.get(OLD_BATCH_ID)).toEqual(oldArtifacts)
    expect(database.state.artifacts.get(first.batchId)?.map(({ batch_id: _batchId, ...row }) => row))
      .toEqual(newProof.artifacts.map((artifact) => ({ artifact_key: artifact.artifactKey,
        artifact_kind: artifact.artifactKind, payload: artifact.payload, source_sha256: artifact.sourceSha256,
        canonical_sha256: artifact.canonicalSha256, source_bytes: artifact.sourceBytes })))
    expect(database.queries.some(({ sql }) => /WHERE singleton=true AND active_batch_id=\$2::uuid AND authority_version=\$3 RETURNING singleton/u.test(sql))).toBe(true)
    expect(mutationTargets(database)).toEqual([
      'INSERT INTO orgmaster_core.persistence_batches',
      ...newProof.artifacts.map(() => 'INSERT INTO orgmaster_core.persistence_artifacts'),
      'UPDATE orgmaster_core.persistence_batches',
      'UPDATE orgmaster_core.persistence_authority',
    ])
    expectOwnerSafeSql(database)

    const beforeReuse = structuredClone(database.state)
    const mutationCountBeforeReuse = mutationTargets(database).length
    const second = await publishLocalPrincipalSandboxAuditProvenance(database, input)
    expect(second).toMatchObject({ batchId: first.batchId, sourceRevision: newProof.sourceRevision,
      stage: 'native-owner-provenance-publication-reused' })
    expect(database.state).toEqual(beforeReuse)
    expect(mutationTargets(database)).toHaveLength(mutationCountBeforeReuse)
    expectOwnerSafeSql(database)
  })

  it('rejects a non-loopback target or PostgreSQL session outside the scoped owner login', async () => {
    const input = await makeSeedInput()
    const proof = batchProof(materializeLegacyLocalPrincipalSandboxNativeFixtureForBatchProof(input.fixture), input.config.sandboxId)
    for (const options of [{ physicalAddress: '10.1.2.3' }, { physicalSessionUser: 'postgres' }]) {
      const database = new FakeSeedDatabase(input, proof, options)
      await expect(publishLocalPrincipalSandboxAuditProvenance(database, input))
        .rejects.toThrow('LOCAL_PRINCIPAL_SEED_TARGET_MISMATCH')
      expect(mutationTargets(database)).toEqual([])
    }
  })

  it('rejects an unknown active batch instead of treating it as an empty baseline', async () => {
    const input = await makeSeedInput()
    const proof = batchProof(materializeLegacyLocalPrincipalSandboxNativeFixtureForBatchProof(input.fixture), input.config.sandboxId)
    const database = new FakeSeedDatabase(input, proof, { omitExistingBatch: true })

    await expect(publishLocalPrincipalSandboxAuditProvenance(database, input))
      .rejects.toThrow('LOCAL_PRINCIPAL_SEED_EXISTING_BATCH_MISMATCH')
    expect(mutationTargets(database)).toEqual([])
  })

  it('rejects artifact drift before creating a replacement batch', async () => {
    const input = await makeSeedInput()
    const proof = batchProof(materializeLegacyLocalPrincipalSandboxNativeFixtureForBatchProof(input.fixture), input.config.sandboxId)
    const database = new FakeSeedDatabase(input, proof, { corruptExistingArtifact: true })

    await expect(publishLocalPrincipalSandboxAuditProvenance(database, input))
      .rejects.toThrow('LOCAL_PRINCIPAL_SEED_EXISTING_ARTIFACT_MISMATCH')
    expect(mutationTargets(database)).toEqual([])
  })

  it('rejects a missing exact identity-reservation join', async () => {
    const input = await makeSeedInput()
    const proof = batchProof(materializeLegacyLocalPrincipalSandboxNativeFixtureForBatchProof(input.fixture), input.config.sandboxId)
    const database = new FakeSeedDatabase(input, proof, { identityMismatch: true })

    await expect(publishLocalPrincipalSandboxAuditProvenance(database, input))
      .rejects.toThrow('LOCAL_PRINCIPAL_SEED_EXISTING_IDENTITY_MISMATCH')
    expect(mutationTargets(database)).toEqual([])
  })

  it('rolls back when the authority pointer compare-and-swap loses a race', async () => {
    const input = await makeSeedInput()
    const proof = batchProof(materializeLegacyLocalPrincipalSandboxNativeFixtureForBatchProof(input.fixture), input.config.sandboxId)
    const database = new FakeSeedDatabase(input, proof, { rejectAuthorityCas: true })

    await expect(publishLocalPrincipalSandboxAuditProvenance(database, input))
      .rejects.toThrow('LOCAL_PRINCIPAL_SEED_AUTHORITY_CHANGED')
    expect(database.state.authority).toEqual({ active_batch_id: OLD_BATCH_ID, authority_version: 1 })
    expect(database.state.batches.get(OLD_BATCH_ID)?.status).toBe('active')
    expect(database.queries.some(({ sql }) => sql === 'ROLLBACK')).toBe(true)
  })

  it('reports an unknown COMMIT outcome with readback-required identifiers', async () => {
    const input = await makeSeedInput()
    const proof = batchProof(materializeLegacyLocalPrincipalSandboxNativeFixtureForBatchProof(input.fixture), input.config.sandboxId)
    const database = new FakeSeedDatabase(input, proof, { commitOutcomeUnknown: true })

    await expect(publishLocalPrincipalSandboxAuditProvenance(database, input)).rejects.toMatchObject({
      message: 'LOCAL_PRINCIPAL_SEED_COMMIT_OUTCOME_UNKNOWN_READBACK_REQUIRED',
      batchId: expect.stringMatching(/^[a-f0-9-]{36}$/u),
      sourceRevision: expect.stringMatching(/^[a-f0-9]{64}$/u),
      fixtureHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
    })
  })
})
