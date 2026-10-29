import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { canonicalJson, contractDigest, sha256, type LocalSandboxConfig } from '../contracts/local-principal-sandbox/v1/protocol.mjs'
import { materializeLocalPrincipalSandboxNativeFixture, materializeLegacyLocalPrincipalSandboxNativeFixtureForBatchProof,
  type LocalPrincipalSandboxNativeFixtureInput } from './localPrincipalSandboxNativeFixture'
import { prepareEmptyLocalOwnerBootstrap } from './localPrincipalSandboxEmptyBootstrap'

type Queryable = { query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }> }
type SeedTarget = { port: number; dataDirectory: string; sessionUser: string }
const fail = (code: string): never => { throw new Error('LOCAL_PRINCIPAL_SEED_' + code) }

function publicationProof(materialized: ReturnType<typeof materializeLocalPrincipalSandboxNativeFixture>, sandboxId: string) {
  const artifacts = materialized.persistenceArtifacts.map(artifact => ({ ...artifact,
    sourceSha256: sha256(artifact.raw), canonicalSha256: sha256(canonicalJson(artifact.payload)),
    sourceBytes: Buffer.byteLength(artifact.raw, 'utf8') }))
  return { artifacts,
    sourceRevision: contractDigest({ format: 'orgmaster.local-principal-seed.v1', sandboxId,
      fixtureHash: materialized.fixtureHash, artifacts: artifacts.map(artifact => ({ key: artifact.artifactKey,
        kind: artifact.artifactKind, sourceSha256: artifact.sourceSha256, canonicalSha256: artifact.canonicalSha256 })) }),
    manifest: { format: 'orgmaster.local-principal-seed.v1', sandboxId,
      fixtureVersion: materialized.fixtureVersion, fixtureHash: materialized.fixtureHash } }
}

/** Forward publication of the exact pre-audit fixture factory output. Existing
 * artifacts remain immutable, identity/grant payloads remain identical, and the
 * authority pointer advances only after a complete replacement batch exists.
 * This is not a general importer or an API for altering an active fixture. */
export async function publishLocalPrincipalSandboxAuditProvenance(database: Queryable, input: {
  config: LocalSandboxConfig; target: SeedTarget; fixture: LocalPrincipalSandboxNativeFixtureInput
}) {
  const { config, target } = input
  if (config.applicationId !== 'orgmaster' || input.fixture.sandboxId !== config.sandboxId ||
    !/^local_org_seed_[a-f0-9]{16}$/.test(target.sessionUser)) fail('TARGET_INVALID')
  const materialized = materializeLocalPrincipalSandboxNativeFixture(input.fixture)
  const legacy = materializeLegacyLocalPrincipalSandboxNativeFixtureForBatchProof(input.fixture)
  if (materialized.databaseName !== config.databaseName || legacy.fixtureHash !== materialized.fixtureHash) fail('TARGET_INVALID')
  const next = publicationProof(materialized, config.sandboxId), previous = publicationProof(legacy, config.sandboxId)
  const nonGovernance = (artifacts: typeof next.artifacts) => artifacts.filter(a => a.artifactKind !== 'governance')
    .map(a => ({ key: a.artifactKey, hash: a.canonicalSha256 }))
  if (canonicalJson(nonGovernance(next.artifacts)) !== canonicalJson(nonGovernance(previous.artifacts)) ||
    next.sourceRevision === previous.sourceRevision) fail('PROVENANCE_UPGRADE_INVALID')
  await database.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
  let commitAttempted = false
  const batchId = randomUUID()
  try {
    const physical = await database.query(`SELECT current_database() AS database_name,
      host(inet_server_addr()) AS address, inet_server_port() AS port, session_user`)
    if (physical.rows.length !== 1) fail('TARGET_MISMATCH')
    assertLocalPrincipalNativeSeedTarget(config, target, physical.rows[0])
    await database.query('SET LOCAL ROLE jenfu_orgmaster_migrator')
    const authority = await database.query(`SELECT active_batch_id,authority_version
      FROM orgmaster_core.persistence_authority WHERE singleton=true FOR UPDATE`)
    if (authority.rows.length !== 1 || !authority.rows[0].active_batch_id) fail('AUTHORITY_MISSING')
    const oldId = String(authority.rows[0].active_batch_id), oldVersion = Number(authority.rows[0].authority_version)
    if (!Number.isSafeInteger(oldVersion) || oldVersion < 1) fail('AUTHORITY_INVALID')
    const batch = await database.query(`SELECT trim(source_revision) AS source_revision,source_manifest,
      artifact_count,media_count,source_bytes,status FROM orgmaster_core.persistence_batches WHERE id=$1`, [oldId])
    const artifacts = await database.query(`SELECT artifact_key,artifact_kind,payload,trim(source_sha256) AS source_sha256,
      trim(canonical_sha256) AS canonical_sha256,source_bytes FROM orgmaster_core.persistence_artifacts
      WHERE batch_id=$1 ORDER BY artifact_key`, [oldId])
    if (batch.rows.length !== 1) fail('EXISTING_BATCH_MISMATCH')
    const reused = String(batch.rows[0].source_revision).trim() === next.sourceRevision
    assertLocalSeedBatchProof(batch.rows[0], reused ? next : previous, artifacts.rows)
    for (const scenario of materialized.effectiveFixture.scenarios) {
      const reservation = await database.query(`SELECT o.principal_id FROM orgmaster_core.principal_ownership_reservations o
        JOIN orgmaster_core.principal_identity_reservations i ON i.principal_id=o.principal_id AND i.employee_id=o.employee_id
        WHERE o.principal_id=$1 AND o.employee_id=$2 AND o.account_type=$3 AND i.principal_issuer=$4
          AND i.principal_subject=$5 AND o.source_revision=ANY($6::text[]) AND i.source_revision=o.source_revision`,
      [scenario.principalId,scenario.employeeId,scenario.accountType,scenario.identityIssuer,scenario.identitySubject,
        [previous.sourceRevision,next.sourceRevision]])
      if (reservation.rows.length !== 1) fail('EXISTING_IDENTITY_MISMATCH')
    }
    if (reused) {
      commitAttempted = true
      await database.query('COMMIT')
      return { materialized, batchId: oldId, sourceRevision: next.sourceRevision,
        stage: 'native-owner-provenance-publication-reused' as const }
    }
    await database.query(`INSERT INTO orgmaster_core.persistence_batches
      (id,source_revision,contract_version,source_manifest,artifact_count,media_count,source_bytes,status,imported_at,verified_at,activated_at)
      VALUES ($1,$2,'jenfu.orgmaster-persistence.v1',$3::jsonb,$4,0,$5,'active',clock_timestamp(),clock_timestamp(),clock_timestamp())`,
    [batchId,next.sourceRevision,JSON.stringify(next.manifest),next.artifacts.length,
      next.artifacts.reduce((sum,a) => sum+a.sourceBytes,0)])
    for (const artifact of next.artifacts) await database.query(`INSERT INTO orgmaster_core.persistence_artifacts
      (batch_id,artifact_key,artifact_kind,payload,source_sha256,canonical_sha256,source_bytes,imported_at)
      VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,clock_timestamp())`, [batchId,artifact.artifactKey,artifact.artifactKind,
      JSON.stringify(artifact.payload),artifact.sourceSha256,artifact.canonicalSha256,artifact.sourceBytes])
    const retired = await database.query(`UPDATE orgmaster_core.persistence_batches SET status='retired',retired_at=clock_timestamp()
      WHERE id=$1 AND status='active' RETURNING id`, [oldId])
    if (retired.rowCount !== 1) fail('AUTHORITY_CHANGED')
    const activated = await database.query(`UPDATE orgmaster_core.persistence_authority SET active_batch_id=$1,
      authority_version=authority_version+1,updated_at=clock_timestamp(),updated_by='dev060-local-provenance-publication',
      reason_code='synthetic-publication-audit-provenance' WHERE singleton=true AND active_batch_id=$2::uuid
      AND authority_version=$3 RETURNING singleton`, [batchId,oldId,oldVersion])
    if (activated.rowCount !== 1) fail('AUTHORITY_CHANGED')
    const verified = await database.query(`SELECT trim(source_revision) AS source_revision,source_manifest,
      artifact_count,media_count,source_bytes,status FROM orgmaster_core.persistence_batches WHERE id=$1`, [batchId])
    const written = await database.query(`SELECT artifact_key,artifact_kind,payload,trim(source_sha256) AS source_sha256,
      trim(canonical_sha256) AS canonical_sha256,source_bytes FROM orgmaster_core.persistence_artifacts
      WHERE batch_id=$1 ORDER BY artifact_key`, [batchId])
    if (verified.rows.length !== 1) fail('READBACK_MISMATCH')
    assertLocalSeedBatchProof(verified.rows[0], next, written.rows)
    commitAttempted = true
    await database.query('COMMIT')
    return { materialized,batchId,sourceRevision:next.sourceRevision,previousBatchId:oldId,
      stage:'native-owner-provenance-publication-committed' as const }
  } catch (error) {
    await database.query('ROLLBACK').catch(() => undefined)
    if (commitAttempted) throw Object.assign(new Error('LOCAL_PRINCIPAL_SEED_COMMIT_OUTCOME_UNKNOWN_READBACK_REQUIRED'),
      { batchId, sourceRevision: next.sourceRevision, fixtureHash: materialized.fixtureHash })
    throw error
  }
}


type ArtifactProof = { artifactKey: string; artifactKind: string; payload: unknown; sourceSha256: string;
  canonicalSha256: string; sourceBytes: number }

/** Both transitions accept exact factory artifacts, never a caller's assertion
 * that an existing publication is empty or safe to replace. */
export function assertLocalSeedBatchProof(batch: Record<string, unknown>, expected: {
  sourceRevision: string; manifest: unknown; artifacts: readonly ArtifactProof[]
}, rows: Record<string, unknown>[]) {
  if (batch.status !== 'active' || String(batch.source_revision).trim() !== expected.sourceRevision ||
    canonicalJson(batch.source_manifest) !== canonicalJson(expected.manifest) ||
    Number(batch.artifact_count) !== expected.artifacts.length || Number(batch.media_count) !== 0 ||
    Number(batch.source_bytes) !== expected.artifacts.reduce((sum, artifact) => sum + artifact.sourceBytes, 0) ||
    rows.length !== expected.artifacts.length) fail('EXISTING_BATCH_MISMATCH')
  const byKey = new Map(rows.map(row => [row.artifact_key, row]))
  for (const artifact of expected.artifacts) {
    const actual = byKey.get(artifact.artifactKey)
    if (!actual || actual.artifact_kind !== artifact.artifactKind ||
      String(actual.source_sha256).trim() !== artifact.sourceSha256 ||
      String(actual.canonical_sha256).trim() !== artifact.canonicalSha256 ||
      Number(actual.source_bytes) !== artifact.sourceBytes ||
      sha256(canonicalJson(actual.payload)) !== artifact.canonicalSha256) fail('EXISTING_ARTIFACT_MISMATCH')
  }
}

export function assertLocalPrincipalNativeSeedTarget(config: LocalSandboxConfig, target: SeedTarget, actual: Record<string, unknown>) {
  if (config.applicationId !== 'orgmaster' || !/^jenfu_local_[a-z0-9_]{3,51}$/.test(config.databaseName) ||
    !Number.isInteger(target.port) || target.port < 1024 || target.port > 65535 || !path.isAbsolute(target.dataDirectory) ||
    actual.database_name !== config.databaseName || !['127.0.0.1', '::1'].includes(String(actual.address)) ||
    actual.port !== target.port || !/^local_org_seed_[a-f0-9]{16}$/.test(target.sessionUser) ||
    actual.session_user !== target.sessionUser) fail('TARGET_MISMATCH')
}

/** Owner-only initialization for a newly migrated disposable database. Never an
 * HTTP endpoint, runtime permission bypass, overwrite, or general data importer.
 * The materializer runs again here; callers cannot submit arbitrary SQL/artifacts.
 */
export async function seedLocalPrincipalSandboxNativeFixture(database: Queryable, input: {
  config: LocalSandboxConfig; target: SeedTarget; fixture: LocalPrincipalSandboxNativeFixtureInput
}) {
  const { config, target } = input
  if (config.applicationId !== 'orgmaster' || input.fixture.sandboxId !== config.sandboxId ||
    !Number.isInteger(target.port) || target.port < 1024 || target.port > 65535 || !path.isAbsolute(target.dataDirectory) ||
    !/^local_org_seed_[a-f0-9]{16}$/.test(target.sessionUser)) fail('TARGET_INVALID')
  const materialized = materializeLocalPrincipalSandboxNativeFixture(input.fixture)
  if (materialized.databaseName !== config.databaseName) fail('TARGET_INVALID')
  const artifacts = materialized.persistenceArtifacts.map(artifact => ({ ...artifact,
    sourceSha256: sha256(artifact.raw), canonicalSha256: sha256(canonicalJson(artifact.payload)),
    sourceBytes: Buffer.byteLength(artifact.raw, 'utf8') }))
  const sourceRevision = contractDigest({ format: 'orgmaster.local-principal-seed.v1', sandboxId: config.sandboxId,
    fixtureHash: materialized.fixtureHash, artifacts: artifacts.map(artifact => ({ key: artifact.artifactKey,
      kind: artifact.artifactKind, sourceSha256: artifact.sourceSha256, canonicalSha256: artifact.canonicalSha256 })) })
  const sourceManifest = { format: 'orgmaster.local-principal-seed.v1', sandboxId: config.sandboxId,
    fixtureVersion: materialized.fixtureVersion, fixtureHash: materialized.fixtureHash }
  await database.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
  let commitAttempted = false
  const batchId = randomUUID()
  try {
    // The coordinator proves the physical cluster/data path before creating the
    // short-lived owner login. An owner-scoped role cannot read PostgreSQL's
    // protected data_directory setting; do not grant broad settings access.
    // This connection must still prove the exact DB/loopback port/new owner login.
    const targetRow = await database.query(`SELECT current_database() AS database_name,
      host(inet_server_addr()) AS address, inet_server_port() AS port, session_user`)
    if (targetRow.rows.length !== 1) fail('TARGET_MISMATCH')
    assertLocalPrincipalNativeSeedTarget(config, target, targetRow.rows[0])
    await database.query("SET LOCAL lock_timeout = '5s'")
    await database.query("SET LOCAL statement_timeout = '30s'")
    await database.query('SET LOCAL ROLE jenfu_orgmaster_migrator')
    await database.query('SELECT singleton FROM orgmaster_core.managed_identity_admission_authority WHERE singleton = true FOR UPDATE')
    const authority = await database.query(`SELECT active_batch_id, authority_version FROM orgmaster_core.persistence_authority
      WHERE singleton = true FOR UPDATE`)
    if (authority.rows.length !== 1) fail('NOT_EMPTY')
    const previousBatchId = authority.rows[0].active_batch_id
    const previousAuthorityVersion = Number(authority.rows[0].authority_version)
    const existing = await database.query(`SELECT (SELECT count(*)::int FROM orgmaster_core.persistence_batches) AS batches,
      (SELECT count(*)::int FROM orgmaster_core.app_sessions) AS sessions,
      (SELECT count(*)::int FROM orgmaster_core.principal_ownership_reservations) AS owners,
      (SELECT count(*)::int FROM orgmaster_core.principal_identity_reservations) AS identities`)
    if (existing.rows.length !== 1 || existing.rows[0].sessions !== 0) fail('NOT_EMPTY')
    if (previousBatchId !== null) {
      const previous = await database.query(`SELECT trim(source_revision) AS source_revision,source_manifest,
        artifact_count,media_count,source_bytes,status FROM orgmaster_core.persistence_batches WHERE id=$1 FOR UPDATE`, [previousBatchId])
      const persisted = await database.query(`SELECT artifact_key,artifact_kind,payload,source_sha256,canonical_sha256,source_bytes
        FROM orgmaster_core.persistence_artifacts WHERE batch_id=$1 ORDER BY artifact_key`, [previousBatchId])
      if (previous.rows.length !== 1) fail('NOT_EMPTY')
      const manifest = previous.rows[0].source_manifest as Record<string, unknown>
      if (manifest?.format === sourceManifest.format) {
        assertLocalSeedBatchProof(previous.rows[0], { sourceRevision, manifest: sourceManifest, artifacts }, persisted.rows)
        // An audit-only forward publication preserves the original immutable
        // reservation provenance. Both accepted sources are rebuilt from this
        // exact fixture input; unrelated reservation sources remain invalid.
        const reservationSources = [sourceRevision, publicationProof(
          materializeLegacyLocalPrincipalSandboxNativeFixtureForBatchProof(input.fixture), config.sandboxId).sourceRevision]
        if (previousAuthorityVersion !== 2 || existing.rows[0].batches !== 2 ||
          existing.rows[0].owners !== materialized.effectiveFixture.scenarios.length ||
          existing.rows[0].identities !== materialized.effectiveFixture.scenarios.length) fail('NOT_EMPTY')
        for (const scenario of materialized.effectiveFixture.scenarios) {
          const joined = await database.query(`SELECT o.principal_id FROM orgmaster_core.principal_ownership_reservations o
            JOIN orgmaster_core.principal_identity_reservations i ON i.principal_id=o.principal_id AND i.employee_id=o.employee_id
            WHERE o.principal_id=$1 AND o.employee_id=$2 AND o.account_type=$3 AND i.principal_issuer=$4
              AND i.principal_subject=$5 AND o.source_revision=ANY($6::text[]) AND i.source_revision=o.source_revision`,
          [scenario.principalId,scenario.employeeId,scenario.accountType,scenario.identityIssuer,scenario.identitySubject,reservationSources])
          if (joined.rows.length !== 1) fail('EXISTING_IDENTITY_MISMATCH')
        }
        await database.query('COMMIT')
        return { materialized, batchId: String(previousBatchId), sourceRevision, stage: 'native-owner-initialization-reused' as const }
      }
      const empty = prepareEmptyLocalOwnerBootstrap({ config, target: { port: target.port, sessionUser: target.sessionUser },
        targetRoot: input.fixture.targetRoot, createdAt: '2026-10-29T00:00:00Z' })
      assertLocalSeedBatchProof(previous.rows[0], { sourceRevision: empty.sourceRevision,
        manifest: empty.sourceManifest, artifacts: empty.artifacts }, persisted.rows)
      if (previousAuthorityVersion !== 1 || existing.rows[0].batches !== 1 ||
        existing.rows[0].owners !== 0 || existing.rows[0].identities !== 0) fail('NOT_EMPTY')
    } else if (previousAuthorityVersion !== 0 || existing.rows[0].batches !== 0 ||
      existing.rows[0].owners !== 0 || existing.rows[0].identities !== 0) fail('NOT_EMPTY')
    const stamp = materialized.governanceVersion.publishedAt
    for (const scenario of materialized.effectiveFixture.scenarios) {
      await database.query('SELECT orgmaster_core.reserve_principal_ownership_v1($1,$2,$3,$4::timestamptz,$5)',
        [scenario.principalId, scenario.employeeId, scenario.accountType, stamp, sourceRevision])
      await database.query(`INSERT INTO orgmaster_core.principal_identity_reservations
        (principal_issuer,principal_subject,employee_id,first_seen_at,source_kind,source_revision,principal_id)
        VALUES ($1,$2,$3,$4::timestamptz,'legacy',$5,$6)`,
      [scenario.identityIssuer, scenario.identitySubject, scenario.employeeId, stamp, sourceRevision, scenario.principalId])
    }
    await database.query(`INSERT INTO orgmaster_core.persistence_batches
      (id,source_revision,contract_version,source_manifest,artifact_count,media_count,source_bytes,status,imported_at,verified_at,activated_at)
      VALUES ($1,$2,'jenfu.orgmaster-persistence.v1',$3::jsonb,$4,0,$5,'active',clock_timestamp(),clock_timestamp(),clock_timestamp())`,
    [batchId, sourceRevision, JSON.stringify(sourceManifest), artifacts.length,
    artifacts.reduce((sum, artifact) => sum + artifact.sourceBytes, 0)])
    for (const artifact of artifacts) await database.query(`INSERT INTO orgmaster_core.persistence_artifacts
      (batch_id,artifact_key,artifact_kind,payload,source_sha256,canonical_sha256,source_bytes,imported_at)
      VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,clock_timestamp())`, [batchId, artifact.artifactKey, artifact.artifactKind,
      JSON.stringify(artifact.payload), artifact.sourceSha256, artifact.canonicalSha256, artifact.sourceBytes])
    if (previousBatchId !== null) {
      const retired = await database.query(`UPDATE orgmaster_core.persistence_batches SET status='retired',retired_at=clock_timestamp()
        WHERE id=$1 AND status='active' RETURNING id`, [previousBatchId])
      if (retired.rowCount !== 1) fail('AUTHORITY_CHANGED')
    }
    const activated = await database.query(`UPDATE orgmaster_core.persistence_authority SET active_batch_id=$1,
      authority_version=authority_version+1,updated_at=clock_timestamp(),updated_by='dev060-local-principal-seed',reason_code='synthetic-local-initialization'
      WHERE singleton=true AND active_batch_id IS NOT DISTINCT FROM $2::uuid AND authority_version=$3 RETURNING singleton`,
    [batchId, previousBatchId, previousAuthorityVersion])
    if (activated.rowCount !== 1) fail('AUTHORITY_CHANGED')
    const readback = await database.query(`SELECT trim(source_revision) AS source_revision,
      artifact_count,source_bytes FROM orgmaster_core.persistence_batches WHERE id=$1 AND status='active'`, [batchId])
    if (readback.rows.length !== 1 || readback.rows[0].source_revision !== sourceRevision ||
      readback.rows[0].artifact_count !== artifacts.length || Number(readback.rows[0].source_bytes) !== artifacts.reduce((sum, artifact) => sum + artifact.sourceBytes, 0)) fail('READBACK_MISMATCH')
    commitAttempted = true
    await database.query('COMMIT')
    return { materialized, batchId, sourceRevision, stage: 'native-owner-initialization-committed' as const }
  } catch (error) {
    await database.query('ROLLBACK').catch(() => undefined)
    // A failed COMMIT response is an unknown outcome, never an invitation to
    // replay this non-idempotent initializer. Read back batch/source first.
    if (commitAttempted) throw Object.assign(new Error('LOCAL_PRINCIPAL_SEED_COMMIT_OUTCOME_UNKNOWN_READBACK_REQUIRED'),
      { batchId, sourceRevision, fixtureHash: materialized.fixtureHash })
    throw error
  }
}
