import { canonicalize, sha256 } from './dev012-production-migration-runner.mjs'
import { DEV070_MIGRATION_ENTRIES } from './dev070-administration-migration.mjs'
import { TARGET } from './orgmaster-production-database.mjs'

export const controlMode = 'DEV057_PDM_PUBLICATION_CONTROL'
export const controlInputPrefix = 'source/migration-bundles/pdm-publication-control'
export const controlReceiptPrefix = 'receipts/pdm-publication-control'
export const acceptancePrefix = 'receipts/pdm-session-acceptance'
export const controlSchema = 'orgmaster.pdm-publication-control-operation.v1'
export const acceptanceSchema = 'jenfu.pdm-session-rollout-acceptance.v1'
export const owners = {
  orgmaster: { service: 'orgmaster-prod', container: 'orgmaster', image: 'orgmaster-release/orgmaster', bucket: TARGET.releaseBucket },
  platform: { service: 'jenfu-platform-prod', container: 'platform', image: 'platform-release/platform', bucket: 'jenfu-platform-prod-platform-release' },
  'ai-pdm': { service: 'ai-pdm-prod', container: 'ai-pdm', image: 'aipdm-release/ai-pdm', bucket: 'jenfu-platform-prod-aipdm-release' },
}
const H64 = /^[a-f0-9]{64}$/u
const H40 = /^[a-f0-9]{40}$/u
export const exactKeys = (value, keys) => value && Object.keys(value).sort().join(',') === [...keys].sort().join(',')
export const same = (left, right) => canonicalize(left) === canonicalize(right)
export const fail = code => { throw new Error('DEV057_PDM_CONTROL_' + code) }
export const pathsForControl = (source, identity, inputHash) => ({
  inputUri: `gs://${TARGET.releaseBucket}/${controlInputPrefix}/${source}/${inputHash}.json`,
  outputUri: `gs://${TARGET.releaseBucket}/${controlReceiptPrefix}/${source}/${identity}.json`,
})

export function validControlRevision(revision) {
  return typeof revision === 'string' && /^(0|[1-9][0-9]{0,18})$/u.test(revision) && BigInt(revision) < 9223372036854775807n
}

export function assertAcceptance(value, action) {
  if (!exactKeys(value, ['schemaVersion', 'status', 'action', 'evidenceSha256', 'sources']) ||
      value.schemaVersion !== acceptanceSchema || value.status !== 'PASS' || value.action !== action ||
      !H64.test(value.evidenceSha256 ?? '') || !exactKeys(value.sources, Object.keys(owners))) fail('ACCEPTANCE_INVALID')
  for (const [owner, config] of Object.entries(owners)) {
    const row = value.sources[owner]
    if (!exactKeys(row, ['sourceRevision', 'artifactDigest']) || !H40.test(row.sourceRevision ?? '') ||
        typeof row.artifactDigest !== 'string' ||
        !row.artifactDigest?.startsWith(`asia-east1-docker.pkg.dev/jenfu-platform-prod/${config.image}@sha256:`) ||
        !H64.test(row.artifactDigest.split('@sha256:')[1] ?? '') || row.artifactDigest.split('@sha256:').length !== 2) fail('ACCEPTANCE_INVALID')
  }
}

export async function executePublicationControl({ database, operation, operationSha256 }) {
  const identity = (await database.query(`SELECT SESSION_USER::text AS login, current_database() AS db,
    pg_has_role(SESSION_USER,'jenfu_orgmaster_migrator','MEMBER') AS migrator,
    pg_has_role(SESSION_USER,'jenfu_orgmaster_runtime','MEMBER') AS runtime`)).rows[0]
  if (identity?.login !== TARGET.login || identity.db !== 'jenfu_prod' || identity.migrator !== true || identity.runtime !== false) fail('DATABASE_IDENTITY_INVALID')
  await database.query('BEGIN')
  try {
    await database.query('SET LOCAL ROLE jenfu_orgmaster_migrator')
    await database.query("SET LOCAL lock_timeout = '5s'")
    const expectedLedger = DEV070_MIGRATION_ENTRIES.slice(-2)
    const { rows } = await database.query(`SELECT version, trim(checksum_sha256) AS checksum
      FROM orgmaster_core.schema_migrations WHERE version=ANY($1::text[]) ORDER BY version`,
    [expectedLedger.map(row => row.version)])
    if (!same(rows, expectedLedger.map(row => ({ version: row.version, checksum: row.appliedSha256 })))) fail('LEDGER_INVALID')
    const changed = await database.query(`SELECT orgmaster_core.transition_pdm_session_publication_v1(
      $1::bigint, $2::boolean, $3::text, $4::timestamptz) AS state`,
    [operation.expectedRevision, operation.action === 'enable', operationSha256, operation.deadlineAt])
    const state = changed.rows[0]?.state
    if (state?.operationSha256 !== operationSha256 || state.enabled !== (operation.action === 'enable') ||
        state.revision !== (BigInt(operation.expectedRevision) + 1n).toString()) fail('DATABASE_READBACK_INVALID')
    await database.query('COMMIT')
    return state
  } catch (error) {
    await database.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

export function controlIdentity(operation) {
  const { deadlineAt: _deadline, ...core } = operation
  return sha256(canonicalize(core))
}

export function assertControlOperation(value, sourceRevision, now = Date.now()) {
  if (!exactKeys(value, ['schemaVersion', 'action', 'acceptanceRef', 'sourceRevision', 'expectedRevision',
    'releaseIntentRef', 'terminalRef', 'deadlineAt']) || value.schemaVersion !== controlSchema ||
    !['enable', 'disable'].includes(value.action) || !H40.test(sourceRevision) || value.sourceRevision !== sourceRevision ||
    !validControlRevision(value.expectedRevision) || !Number.isFinite(Date.parse(value.deadlineAt)) ||
    Date.parse(value.deadlineAt) <= now || Date.parse(value.deadlineAt) > now + 5 * 60_000) fail('OPERATION_INVALID')
}
