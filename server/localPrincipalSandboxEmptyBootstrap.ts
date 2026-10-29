import { randomUUID } from 'node:crypto'
import path from 'node:path'
import {
  canonicalJson,
  contractDigest,
  LOCAL_SANDBOX_VERSION,
  sha256,
  type LocalSandboxConfig,
} from '../contracts/local-principal-sandbox/v1/protocol.mjs'
import { createOrgDocumentFile, parseOrgDocument, type OrgDocumentFile } from '../src/documentStorage'
import { createEmptyProcessPlanningCollections } from '../src/processPlanning'
import { createDefaultOrganizationLevels } from '../src/organizationLevels'
import { createWorkspaceManifest, validateWorkspaceManifest, type OrgWorkspaceManifest } from '../src/versionWorkspace'
import { GOVERNANCE_APPLICATIONS, readAiPdmRoleCatalog } from '../src/governance/aiPdmCatalog'
import { migrateGovernanceV2ToV3 } from '../src/governance/migrateGovernanceV2ToV3'
import { createSeedDocumentV2 } from '../src/governance/migrateGovernanceV1ToV2'
import {
  buildOrganizationSnapshot,
  validateDocumentV3,
  validatePolicyDataV3,
} from '../src/governance/validation'
import {
  GOVERNANCE_PUBLICATION_HASH_FORMAT,
  publicationSnapshotHash,
} from '../src/governance/commands'
import type {
  GovernanceAssignmentVersionV3,
  GovernanceDocumentV3,
  GovernanceOrgSource,
  GovernancePolicyDataV3,
} from '../src/governance/types'
import type { OrgDirectoryState } from '../src/types'

const FIXED_CREATED_AT = '2026-10-29T00:00:00Z'
const LOCAL_EMPTY_BOOTSTRAP_FORMAT = 'orgmaster.local-empty-bootstrap.v1' as const
const FINAL_SEED_FORMAT = 'orgmaster.local-principal-seed.v1'
const OWNER_ROLE = 'jenfu_orgmaster_migrator'
const APPLICATION_ID = 'orgmaster' as const
const fail = (code: string): never => { throw Object.assign(new Error(`LOCAL_EMPTY_BOOTSTRAP_${code}`), { code: `LOCAL_EMPTY_BOOTSTRAP_${code}` }) }

export type EmptyLocalOwnerBootstrapInput = {
  config: LocalSandboxConfig
  target: { port: number; sessionUser: string }
  targetRoot: string
  createdAt: typeof FIXED_CREATED_AT
}

export type EmptyLocalOwnerArtifact = {
  artifactKey: string
  artifactKind: 'workspace-manifest' | 'workspace-version' | 'governance'
  localPath: string
  payload: OrgWorkspaceManifest | OrgDocumentFile | GovernanceDocumentV3
  raw: string
  sourceSha256: string
  canonicalSha256: string
  sourceBytes: number
}

export type EmptyLocalOwnerArtifactManifest = {
  key: string
  kind: EmptyLocalOwnerArtifact['artifactKind']
  sourceSha256: string
  canonicalSha256: string
  sourceBytes: number
}

export type EmptyLocalOwnerSourceManifest = {
  format: typeof LOCAL_EMPTY_BOOTSTRAP_FORMAT
  sandboxId: string
  artifacts: EmptyLocalOwnerArtifactManifest[]
}

export type PreparedEmptyLocalOwnerBootstrap = {
  status: 'materialized-in-memory'
  applicationId: typeof APPLICATION_ID
  sandboxId: string
  databaseName: string
  sourceManifest: EmptyLocalOwnerSourceManifest
  sourceRevision: string
  batch: { contractVersion: 'jenfu.orgmaster-persistence.v1'; artifactCount: 3; mediaCount: 0; sourceBytes: number }
  artifacts: readonly EmptyLocalOwnerArtifact[]
  workspace: { manifest: OrgWorkspaceManifest; currentVersionId: string; currentVersion: OrgDocumentFile; currentVersionRevision: string }
  governance: GovernanceDocumentV3
  governanceVersion: GovernanceAssignmentVersionV3
  artifactHashes: readonly EmptyLocalOwnerArtifactManifest[]
}

type QueryResult = { rows: Record<string, unknown>[]; rowCount: number | null }
export type EmptyLocalOwnerBootstrapDatabase = { query(sql: string, values?: unknown[]): Promise<QueryResult> }

function assertInput(input: EmptyLocalOwnerBootstrapInput): EmptyLocalOwnerBootstrapInput {
  if (!input || !input.config || input.config.contractVersion !== LOCAL_SANDBOX_VERSION ||
      input.config.applicationId !== APPLICATION_ID ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(input.config.sandboxId)) fail('INPUT_INVALID')
  const databaseName = `jenfu_local_${input.config.sandboxId.replaceAll('-', '_')}`
  if (input.config.databaseName !== databaseName || !/^jenfu_local_[a-z0-9_]{3,51}$/u.test(databaseName) ||
      databaseName.length > 63) fail('CONFIG_INVALID')
  if (!input.target || !Number.isInteger(input.target.port) || input.target.port < 1024 || input.target.port > 65535 ||
      !/^local_org_seed_[a-f0-9]{16}$/u.test(input.target.sessionUser)) fail('TARGET_INVALID')
  if (typeof input.targetRoot !== 'string' || !path.isAbsolute(input.targetRoot) || input.createdAt !== FIXED_CREATED_AT) {
    fail('INPUT_INVALID')
  }
  return input
}

function emptyDirectoryState(): OrgDirectoryState {
  return {
    employees: [],
    departments: [],
    roles: [],
    positions: [],
    assignments: [],
    members: [],
    roleCombinationRiskRules: [],
    organizationLevels: createDefaultOrganizationLevels(),
    organizationLayout: { mode: 'tree', showLevelGuides: true },
    duties: [],
    dutyPositionRelations: [],
    ...createEmptyProcessPlanningCollections(),
  }
}

function makeArtifact(
  targetRoot: string,
  artifactKey: string,
  artifactKind: EmptyLocalOwnerArtifact['artifactKind'],
  localRelativePath: string,
  payload: EmptyLocalOwnerArtifact['payload'],
): EmptyLocalOwnerArtifact {
  const raw = `${JSON.stringify(payload, null, 2)}\n`
  return Object.freeze({
    artifactKey,
    artifactKind,
    localPath: path.resolve(targetRoot, localRelativePath),
    payload,
    raw,
    sourceSha256: sha256(raw),
    canonicalSha256: sha256(canonicalJson(payload)),
    sourceBytes: Buffer.byteLength(raw, 'utf8'),
  })
}

/** Build an empty, validated OrgMaster workspace and active V3 publication without reading files or a database. */
export function prepareEmptyLocalOwnerBootstrap(input: EmptyLocalOwnerBootstrapInput): PreparedEmptyLocalOwnerBootstrap {
  assertInput(input)
  const { sandboxId, databaseName } = input.config
  const targetRoot = path.resolve(input.targetRoot)
  const suffix = sha256(sandboxId).slice(0, 24)
  const currentVersionId = `current-empty-${suffix}`
  const workspaceManifest = createWorkspaceManifest(currentVersionId, input.createdAt)
  const manifestValidation = validateWorkspaceManifest(workspaceManifest)
  if (!manifestValidation.ok) fail('WORKSPACE_MANIFEST_INVALID')

  const currentVersion = createOrgDocumentFile(emptyDirectoryState(), 'document', input.createdAt)
  const parsedWorkspace = parseOrgDocument(currentVersion)
  const state = parsedWorkspace.ok ? parsedWorkspace.document.state : fail('WORKSPACE_VERSION_INVALID')
  if (state.employees.length || state.departments.length || state.roles.length || state.positions.length ||
      state.assignments.length || state.members.length || state.duties.length || state.dutyPositionRelations.length ||
      state.processes.length || state.processNodes.length || state.processEdges.length || state.processNodeDutyLinks.length) {
    fail('WORKSPACE_NOT_EMPTY')
  }
  const workspaceRevision = publicationSnapshotHash(currentVersion)
  const governanceSource: GovernanceOrgSource = {
    workspaceVersionId: currentVersionId,
    workspaceRevision,
    sourceDataAt: input.createdAt,
    state,
  }

  // This existing migration factory needs a catalog argument to map legacy
  // assignments. Its unavailable snapshot is not stored or claimed as active;
  // the empty seed has no external assignments and the V3 publication pins none.
  const unavailableCatalog = readAiPdmRoleCatalog('unavailable')
  const seededV2 = createSeedDocumentV2(input.createdAt, unavailableCatalog)
  const emptyV2 = {
    ...seededV2,
    draft: {
      ...seededV2.draft,
      applications: GOVERNANCE_APPLICATIONS.map((application) => ({ ...application })),
      identityLinks: [],
      roleAssignments: [],
      roleDelegations: [],
      principalAdmissions: [],
    },
  }
  const v2SourceRevision = sha256(canonicalJson(emptyV2))
  const migratedV3 = migrateGovernanceV2ToV3(emptyV2, v2SourceRevision, unavailableCatalog, input.createdAt)
  const { basePolicyVersionId: _basePolicyVersionId, updatedAt: _updatedAt, ...policy } = migratedV3.draft
  const versionId = `assignment-policy-empty-${suffix}`
  const publicationPayload = {
    kind: 'assignment-governance-v3' as const,
    policy: policy as GovernancePolicyDataV3,
    externalRoleCatalogs: [],
    organizationSnapshot: buildOrganizationSnapshot(governanceSource, input.createdAt),
    effectState: 'not-synchronized' as const,
  }
  const governanceVersion: GovernanceAssignmentVersionV3 = {
    ...publicationPayload,
    id: versionId,
    versionNumber: 1,
    publishedAt: input.createdAt,
    publishedByPrincipalId: 'local-fixture-bootstrap',
    publishReason: '建立本機空治理基線；不建立使用者指派或管理授權',
    hashFormat: GOVERNANCE_PUBLICATION_HASH_FORMAT,
    snapshotHash: publicationSnapshotHash(publicationPayload),
  }
  const governance: GovernanceDocumentV3 = {
    ...migratedV3,
    activePolicyVersionId: versionId,
    draft: { ...migratedV3.draft, basePolicyVersionId: versionId, updatedAt: input.createdAt },
    publishedVersions: [governanceVersion],
  }
  const documentIssues = validateDocumentV3(governance, governanceSource, [])
  const versionIssues = validatePolicyDataV3(governanceVersion.policy, governanceSource, [], input.createdAt)
  if (documentIssues.length || versionIssues.length || governanceVersion.snapshotHash !== publicationSnapshotHash(publicationPayload) ||
      governanceVersion.externalRoleCatalogs.length !== 0 || governanceVersion.policy.roleAssignments.length !== 0 ||
      governanceVersion.policy.principalAdmissions?.length !== 0 || governanceVersion.policy.managementGrants.length !== 0 ||
      governanceVersion.policy.roleDelegations.length !== 0 || governanceVersion.policy.applicationPositionAdoptions.length !== 0) {
    fail('GOVERNANCE_V3_INVALID')
  }

  const artifacts = Object.freeze([
    makeArtifact(targetRoot, 'orgmaster-workspace.v1.json', 'workspace-manifest', 'data/orgmaster-workspace.v1.json', workspaceManifest),
    makeArtifact(targetRoot, `orgmaster-versions/${currentVersionId}.json`, 'workspace-version', `data/orgmaster-versions/${currentVersionId}.json`, currentVersion),
    makeArtifact(targetRoot, 'orgmaster-governance.v3.json', 'governance', 'data/orgmaster-governance.v3.json', governance),
  ])
  const artifactHashes = Object.freeze(artifacts.map((artifact) => Object.freeze({
    key: artifact.artifactKey,
    kind: artifact.artifactKind,
    sourceSha256: artifact.sourceSha256,
    canonicalSha256: artifact.canonicalSha256,
    sourceBytes: artifact.sourceBytes,
  })))
  const sourceManifest: EmptyLocalOwnerSourceManifest = Object.freeze({
    format: LOCAL_EMPTY_BOOTSTRAP_FORMAT,
    sandboxId,
    artifacts: [...artifactHashes],
  })
  const sourceRevision = contractDigest(sourceManifest)
  const sourceBytes = artifacts.reduce((sum, artifact) => sum + artifact.sourceBytes, 0)

  return Object.freeze({
    status: 'materialized-in-memory',
    applicationId: APPLICATION_ID,
    sandboxId,
    databaseName,
    sourceManifest,
    sourceRevision,
    batch: Object.freeze({ contractVersion: 'jenfu.orgmaster-persistence.v1', artifactCount: artifacts.length as 3, mediaCount: 0 as const, sourceBytes }),
    artifacts,
    workspace: Object.freeze({ manifest: workspaceManifest, currentVersionId, currentVersion, currentVersionRevision: workspaceRevision }),
    governance,
    governanceVersion,
    artifactHashes,
  })
}

function parsedObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try { return parsedObject(JSON.parse(value)) } catch { return null }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function trimmed(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function exactInteger(value: unknown) {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN
  return Number.isSafeInteger(number) && number >= 0 ? number : null
}

function assertTargetRow(row: Record<string, unknown> | undefined, input: EmptyLocalOwnerBootstrapInput) {
  if (!row || row.database_name !== input.config.databaseName || !['127.0.0.1', '::1'].includes(String(row.address)) ||
      Number(row.port) !== input.target.port || row.session_user !== input.target.sessionUser) fail('TARGET_MISMATCH')
}

function databaseFailure(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  if (code.startsWith('LOCAL_EMPTY_BOOTSTRAP_')) return error as Error
  const wrapped = Object.assign(new Error('LOCAL_EMPTY_BOOTSTRAP_INITIALIZATION_FAILED', { cause: error }), {
    code: 'LOCAL_EMPTY_BOOTSTRAP_INITIALIZATION_FAILED',
  }) as Error & { code: string; databaseCode?: string }
  if (/^[0-9A-Z_]{1,64}$/u.test(code)) wrapped.databaseCode = code
  return wrapped
}

async function assertNoNativeSessions(database: EmptyLocalOwnerBootstrapDatabase) {
  const result = await database.query('SELECT count(*)::int AS session_count FROM orgmaster_core.app_sessions')
  const count = exactInteger(result.rows?.[0]?.session_count)
  if (result.rows?.length !== 1 || count === null) fail('SESSION_READBACK_INVALID')
  if (count !== 0) fail('NOT_EMPTY')
}

async function readBatch(database: EmptyLocalOwnerBootstrapDatabase, batchId: string) {
  const result = await database.query(`SELECT id::text AS batch_id,trim(source_revision) AS source_revision,
      source_manifest,artifact_count,media_count,source_bytes,status
    FROM orgmaster_core.persistence_batches WHERE id=$1`, [batchId])
  if (result.rows?.length !== 1) fail('ACTIVE_BATCH_INVALID')
  return result.rows[0]
}

async function verifyBatchReadback(database: EmptyLocalOwnerBootstrapDatabase, batchId: string, prepared: PreparedEmptyLocalOwnerBootstrap) {
  const batch = await readBatch(database, batchId)
  const manifest = parsedObject(batch.source_manifest)
  const sourceBytes = exactInteger(batch.source_bytes)
  if (batch.status !== 'active' || trimmed(batch.source_revision) !== prepared.sourceRevision ||
      !manifest || canonicalJson(manifest) !== canonicalJson(prepared.sourceManifest) ||
      exactInteger(batch.artifact_count) !== prepared.batch.artifactCount || exactInteger(batch.media_count) !== 0 ||
      sourceBytes !== prepared.batch.sourceBytes) fail('BATCH_READBACK_MISMATCH')

  const actual = await database.query(`SELECT artifact_key,artifact_kind,payload,trim(source_sha256) AS source_sha256,
      trim(canonical_sha256) AS canonical_sha256,source_bytes
    FROM orgmaster_core.persistence_artifacts WHERE batch_id=$1 ORDER BY artifact_key`, [batchId])
  if (actual.rows?.length !== prepared.artifacts.length) fail('ARTIFACT_READBACK_MISMATCH')
  const actualByKey = new Map(actual.rows.map((row) => [row.artifact_key, row]))
  for (const expected of prepared.artifacts) {
    const row = actualByKey.get(expected.artifactKey)
    const payload = parsedObject(row?.payload)
    if (!row || row.artifact_kind !== expected.artifactKind || trimmed(row.source_sha256) !== expected.sourceSha256 ||
        trimmed(row.canonical_sha256) !== expected.canonicalSha256 || exactInteger(row.source_bytes) !== expected.sourceBytes ||
        !payload || sha256(canonicalJson(payload)) !== expected.canonicalSha256) fail('ARTIFACT_READBACK_MISMATCH')
  }
  return { batch, artifactHashes: prepared.artifactHashes }
}

function stageResult(stage: 'empty-native-owner-initialization-committed' | 'empty-native-owner-initialization-reused', batchId: string, prepared: PreparedEmptyLocalOwnerBootstrap) {
  return { stage, batchId, sourceRevision: prepared.sourceRevision, artifactHashes: prepared.artifactHashes }
}

/** Owner-only single-transaction initialization for the empty native OrgMaster baseline. */
export async function initializeEmptyLocalOwnerBootstrap(
  database: EmptyLocalOwnerBootstrapDatabase,
  input: EmptyLocalOwnerBootstrapInput,
) {
  const prepared = prepareEmptyLocalOwnerBootstrap(input)
  const batchId = randomUUID()
  let transactionStarted = false
  let commitAttempted = false
  try {
    await database.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
    transactionStarted = true
    const target = await database.query(`SELECT current_database() AS database_name,
      host(inet_server_addr()) AS address,inet_server_port() AS port,session_user`)
    if (target.rows?.length !== 1) fail('TARGET_MISMATCH')
    assertTargetRow(target.rows[0], input)
    await database.query("SET LOCAL lock_timeout = '5s'")
    await database.query("SET LOCAL statement_timeout = '30s'")
    await database.query('SET LOCAL ROLE jenfu_orgmaster_migrator')
    const admission = await database.query(`SELECT singleton FROM orgmaster_core.managed_identity_admission_authority
      WHERE singleton=true FOR UPDATE`)
    if (admission.rows?.length !== 1) fail('ADMISSION_AUTHORITY_INVALID')
    const authorityResult = await database.query(`SELECT active_batch_id::text AS active_batch_id,authority_version
      FROM orgmaster_core.persistence_authority WHERE singleton=true FOR UPDATE`)
    if (authorityResult.rows?.length !== 1) fail('PERSISTENCE_AUTHORITY_INVALID')
    const authority = authorityResult.rows[0]
    const activeBatchId = authority.active_batch_id === null ? null : trimmed(authority.active_batch_id)

    if (activeBatchId) {
      const existingBatch = await readBatch(database, activeBatchId)
      const existingManifest = parsedObject(existingBatch.source_manifest)
      if (existingBatch.status === 'active' && existingManifest?.format === FINAL_SEED_FORMAT &&
          existingManifest.sandboxId === prepared.sandboxId) {
        await assertNoNativeSessions(database)
        const sourceRevision = trimmed(existingBatch.source_revision)
        if (!sourceRevision) fail('BATCH_READBACK_MISMATCH')
        await database.query('COMMIT')
        transactionStarted = false
        return { stage: 'final-publication-present' as const, batchId: activeBatchId, sourceRevision }
      }
      await assertNoNativeSessions(database)
      if (!existingManifest || existingManifest.format !== LOCAL_EMPTY_BOOTSTRAP_FORMAT ||
          existingManifest.sandboxId !== prepared.sandboxId ||
          trimmed(existingBatch.source_revision) !== prepared.sourceRevision ||
          canonicalJson(existingManifest) !== canonicalJson(prepared.sourceManifest)) fail('NOT_EMPTY')
      await verifyBatchReadback(database, activeBatchId, prepared)
      await database.query('COMMIT')
      transactionStarted = false
      return stageResult('empty-native-owner-initialization-reused', activeBatchId, prepared)
    }

    if (exactInteger(authority.authority_version) !== 0) fail('PERSISTENCE_AUTHORITY_NOT_EMPTY')
    const priorBatches = await database.query('SELECT count(*)::int AS batch_count FROM orgmaster_core.persistence_batches')
    if (priorBatches.rows?.length !== 1 || exactInteger(priorBatches.rows[0].batch_count) !== 0) fail('NOT_EMPTY')
    await assertNoNativeSessions(database)

    await database.query(`INSERT INTO orgmaster_core.persistence_batches
      (id,source_revision,contract_version,source_manifest,artifact_count,media_count,source_bytes,status,imported_at,verified_at,activated_at)
      VALUES ($1,$2,'jenfu.orgmaster-persistence.v1',$3::jsonb,$4,0,$5,'active',clock_timestamp(),clock_timestamp(),clock_timestamp())`,
    [batchId, prepared.sourceRevision, JSON.stringify(prepared.sourceManifest), prepared.batch.artifactCount, prepared.batch.sourceBytes])
    for (const artifact of prepared.artifacts) {
      await database.query(`INSERT INTO orgmaster_core.persistence_artifacts
        (batch_id,artifact_key,artifact_kind,payload,source_sha256,canonical_sha256,source_bytes,imported_at)
        VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,clock_timestamp())`,
      [batchId, artifact.artifactKey, artifact.artifactKind, JSON.stringify(artifact.payload), artifact.sourceSha256,
        artifact.canonicalSha256, artifact.sourceBytes])
    }
    const activated = await database.query(`UPDATE orgmaster_core.persistence_authority SET active_batch_id=$1,
      authority_version=1,updated_at=clock_timestamp(),updated_by='local-fixture-bootstrap',reason_code='dev060-local-empty-bootstrap'
      WHERE singleton=true AND active_batch_id IS NULL AND authority_version=0 RETURNING singleton`, [batchId])
    if (activated.rowCount !== 1) fail('AUTHORITY_CHANGED')
    await verifyBatchReadback(database, batchId, prepared)
    commitAttempted = true
    await database.query('COMMIT')
    transactionStarted = false
    return stageResult('empty-native-owner-initialization-committed', batchId, prepared)
  } catch (error) {
    if (transactionStarted) await database.query('ROLLBACK').catch(() => undefined)
    if (commitAttempted) {
      throw Object.assign(new Error('LOCAL_EMPTY_BOOTSTRAP_COMMIT_OUTCOME_UNKNOWN_READBACK_REQUIRED'), {
        code: 'LOCAL_EMPTY_BOOTSTRAP_COMMIT_OUTCOME_UNKNOWN_READBACK_REQUIRED',
        batchId,
        sourceRevision: prepared.sourceRevision,
      })
    }
    throw databaseFailure(error)
  }
}
