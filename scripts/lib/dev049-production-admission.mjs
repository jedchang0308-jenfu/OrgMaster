import { canonicalize, sha256 } from './dev012-production-migration-runner.mjs'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const OPERATION_ID = /^[A-Z0-9][A-Z0-9-]{7,127}$/u
const EVIDENCE_REF = /^gs:\/\/jenfu-platform-prod-(?:platform|orgmaster|aipdm)-release\/receipts\/[A-Za-z0-9._/-]+\.json$/u
const REQUIRED_CONSUMERS = Object.freeze(['ai-pdm', 'orgmaster', 'platform'])

export const ORGMASTER_ADMISSION_TARGET = Object.freeze({
  ownerApplicationId: 'orgmaster',
  projectId: 'jenfu-platform-prod',
  projectNumber: '9536592944',
  region: 'asia-east1',
  instance: 'jenfu-platform-prod-pg',
  database: 'jenfu_prod',
  jobName: 'orgmaster-prod-migration-runner',
  releaseBucket: 'jenfu-platform-prod-orgmaster-release',
  login: 'orgmaster-prod-migrator@jenfu-platform-prod.iam',
})

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code)
}

function exactKeys(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || canonicalize(Object.keys(value).sort()) !== canonicalize([...keys].sort())) fail(code)
}

function integerString(value, { allowZero = false } = {}) {
  return typeof value === 'string' && (allowZero ? /^(?:0|[1-9][0-9]*)$/u : /^[1-9][0-9]*$/u).test(value)
}

function authorityRow(row) {
  return {
    enabled: row.admission_enabled === true,
    revision: String(row.revision ?? ''),
    updatedBy: String(row.updated_by ?? ''),
    reasonCode: String(row.reason_code ?? ''),
  }
}

function applicationRow(row) {
  return {
    applicationId: String(row.application_id ?? ''),
    status: String(row.status ?? ''),
    supportState: String(row.support_state ?? ''),
    supportRevision: String(row.support_revision ?? ''),
    supportEvidenceRef: row.support_evidence_ref == null ? null : String(row.support_evidence_ref),
  }
}

export function evidenceValue(consumer) {
  return `${consumer.evidenceRef}#sha256=${consumer.evidenceSha256}`
}

export function assertOrgMasterAdmissionOperation(value, { bytes, operationSha256, sourceRevision, now = new Date() }) {
  if (!Buffer.isBuffer(bytes) || sha256(bytes) !== operationSha256 || !H64.test(operationSha256 ?? '')) fail('DEV049_OPERATION_SHA256_MISMATCH')
  exactKeys(value, ['schemaVersion', 'ownerApplicationId', 'operationId', 'sourceRevision', 'target', 'action', 'expected', 'consumers', 'deadlineAt', 'manifestSha256'], 'DEV049_OPERATION_KEYS_INVALID')
  if (value.schemaVersion !== 'jenfu.dev049.orgmaster-production-admission-operation.v1'
    || value.ownerApplicationId !== 'orgmaster'
    || !OPERATION_ID.test(value.operationId ?? '')
    || !H40.test(value.sourceRevision ?? '')
    || value.sourceRevision !== sourceRevision
    || !['activate', 'deactivate'].includes(value.action)
    || !Number.isFinite(Date.parse(value.deadlineAt))
    || Date.parse(value.deadlineAt) <= now.getTime()) fail('DEV049_OPERATION_IDENTITY_INVALID')
  exactKeys(value.target, ['projectId', 'projectNumber', 'region', 'instance', 'database', 'jobName'], 'DEV049_OPERATION_TARGET_INVALID')
  const expectedTarget = Object.fromEntries(Object.entries(ORGMASTER_ADMISSION_TARGET).filter(([key]) => ['projectId', 'projectNumber', 'region', 'instance', 'database', 'jobName'].includes(key)))
  if (canonicalize(value.target) !== canonicalize(expectedTarget)) fail('DEV049_OPERATION_TARGET_INVALID')
  exactKeys(value.expected, ['enabled', 'admissionRevision'], 'DEV049_OPERATION_EXPECTED_INVALID')
  if (typeof value.expected.enabled !== 'boolean' || !integerString(value.expected.admissionRevision)
    || value.expected.enabled !== (value.action === 'deactivate')) fail('DEV049_OPERATION_EXPECTED_INVALID')
  if (!Array.isArray(value.consumers) || value.consumers.length !== REQUIRED_CONSUMERS.length) fail('DEV049_OPERATION_CONSUMERS_INVALID')
  const ids = []
  for (const consumer of value.consumers) {
    exactKeys(consumer, ['applicationId', 'expectedSupportRevision', 'sourceRevision', 'artifactDigest', 'evidenceRef', 'evidenceSha256'], 'DEV049_OPERATION_CONSUMERS_INVALID')
    if (!/^[a-z][a-z0-9-]{1,63}$/u.test(consumer.applicationId ?? '')
      || !integerString(consumer.expectedSupportRevision, { allowZero: true })
      || !H40.test(consumer.sourceRevision ?? '')
      || !/^sha256:[a-f0-9]{64}$/u.test(consumer.artifactDigest ?? '')
      || !EVIDENCE_REF.test(consumer.evidenceRef ?? '')
      || !H64.test(consumer.evidenceSha256 ?? '')) fail('DEV049_OPERATION_CONSUMERS_INVALID')
    ids.push(consumer.applicationId)
  }
  if (canonicalize(ids) !== canonicalize(REQUIRED_CONSUMERS)) fail('DEV049_OPERATION_CONSUMERS_INVALID')
  const core = { ...value }
  delete core.manifestSha256
  if (!H64.test(value.manifestSha256 ?? '') || sha256(canonicalize(core)) !== value.manifestSha256) fail('DEV049_OPERATION_MANIFEST_INVALID')
  return value
}

function observedRequiredConsumers(applications) {
  return [...new Set(['platform', 'orgmaster', ...applications.filter((row) => row.status === 'active').map((row) => row.applicationId)])].sort()
}

export async function executeOrgMasterAdmission({ operation, database }) {
  const desiredEnabled = operation.action === 'activate'
  const reasonCode = desiredEnabled ? 'dev014-managed-login-activate' : 'dev014-managed-login-rollback'
  await database.query('BEGIN')
  try {
    await database.query('SET LOCAL ROLE jenfu_orgmaster_migrator')
    const authorityResult = await database.query(`
      SELECT admission_enabled, revision::text, updated_by, reason_code
      FROM orgmaster_core.managed_identity_admission_authority
      WHERE singleton = true
      FOR UPDATE
    `)
    if (authorityResult.rows.length !== 1) fail('DEV049_ADMISSION_ROW_MISSING')
    const before = authorityRow(authorityResult.rows[0])
    const applicationResult = await database.query(`
      SELECT application_id, status, support_state, support_revision::text, support_evidence_ref
      FROM orgmaster_core.managed_identity_invalidation_applications
      ORDER BY application_id
      FOR UPDATE
    `)
    const applications = applicationResult.rows.map(applicationRow)
    const required = observedRequiredConsumers(applications)
    if (canonicalize(required) !== canonicalize(operation.consumers.map(({ applicationId }) => applicationId))) fail('DEV049_ACTIVE_CONSUMER_SET_MISMATCH')
    const byId = new Map(applications.map((row) => [row.applicationId, row]))
    if (before.enabled === desiredEnabled && before.updatedBy === operation.operationId && before.reasonCode === reasonCode) {
      if (desiredEnabled) {
        for (const consumer of operation.consumers) {
          const observed = byId.get(consumer.applicationId)
          if (!observed || observed.supportState !== 'verified' || observed.supportEvidenceRef !== evidenceValue(consumer)) fail('DEV049_SUPPORT_REPLAY_MISMATCH')
        }
      }
      await database.query('COMMIT')
      return { before, after: before, supports: applications, disposition: 'REPLAY', affectedIdentityCount: 0, outboxCount: 0 }
    }
    if (before.enabled !== operation.expected.enabled || before.revision !== operation.expected.admissionRevision) fail('DEV049_ADMISSION_PRECONDITION_MISMATCH')
    const supports = []
    if (desiredEnabled) {
      for (const consumer of operation.consumers) {
        const observed = byId.get(consumer.applicationId)
        if ((observed?.supportRevision ?? '0') !== consumer.expectedSupportRevision) fail('DEV049_SUPPORT_REVISION_MISMATCH', consumer.applicationId)
        const result = await database.query(`
          SELECT application_id, support_revision::text, support_state
          FROM orgmaster_core.attest_managed_identity_invalidation_support_v1($1, $2::bigint, $3, $4)
        `, [consumer.applicationId, consumer.expectedSupportRevision, evidenceValue(consumer), operation.operationId])
        if (result.rows.length !== 1 || result.rows[0].support_state !== 'verified') fail('DEV049_SUPPORT_ATTESTATION_FAILED', consumer.applicationId)
        supports.push({
          applicationId: String(result.rows[0].application_id),
          supportRevision: String(result.rows[0].support_revision),
          supportState: String(result.rows[0].support_state),
          evidenceRef: evidenceValue(consumer),
        })
      }
    }
    const changed = await database.query(`
      SELECT revision::text, admission_enabled, affected_identity_count, outbox_count
      FROM orgmaster_core.set_managed_identity_admission_v1($1::bigint, $2, $3, $4)
    `, [operation.expected.admissionRevision, desiredEnabled, operation.operationId, reasonCode])
    if (changed.rows.length !== 1 || changed.rows[0].admission_enabled !== desiredEnabled) fail('DEV049_ADMISSION_CHANGE_FAILED')
    const after = {
      enabled: changed.rows[0].admission_enabled === true,
      revision: String(changed.rows[0].revision),
      updatedBy: operation.operationId,
      reasonCode,
    }
    await database.query('COMMIT')
    return {
      before,
      after,
      supports,
      disposition: 'APPLIED',
      affectedIdentityCount: Number(changed.rows[0].affected_identity_count),
      outboxCount: Number(changed.rows[0].outbox_count),
    }
  } catch (error) {
    await database.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}
