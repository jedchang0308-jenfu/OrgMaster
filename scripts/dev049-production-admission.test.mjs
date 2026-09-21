import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { canonicalize, sha256 } from './lib/dev012-production-migration-runner.mjs'
import { assertDev014ConsumerEvidenceBytes, buildDev014ConsumerConformance } from './lib/dev014-consumer-conformance.mjs'
import {
  assertOrgMasterAdmissionOperation,
  evidenceValue,
  executeOrgMasterAdmission,
  ORGMASTER_ADMISSION_TARGET,
} from './lib/dev049-production-admission.mjs'

function operation(overrides = {}) {
  const core = {
    schemaVersion: 'jenfu.dev049.orgmaster-production-admission-operation.v1',
    ownerApplicationId: 'orgmaster',
    operationId: 'DEV014-PROD-ORGMASTER-ADMISSION-001',
    sourceRevision: 'b'.repeat(40),
    target: {
      projectId: ORGMASTER_ADMISSION_TARGET.projectId,
      projectNumber: ORGMASTER_ADMISSION_TARGET.projectNumber,
      region: ORGMASTER_ADMISSION_TARGET.region,
      instance: ORGMASTER_ADMISSION_TARGET.instance,
      database: ORGMASTER_ADMISSION_TARGET.database,
      jobName: ORGMASTER_ADMISSION_TARGET.jobName,
    },
    action: 'activate',
    expected: { enabled: false, admissionRevision: '1' },
    consumers: ['ai-pdm', 'orgmaster', 'platform'].map((applicationId, index) => ({
      applicationId,
      expectedSupportRevision: applicationId === 'platform' ? '0' : '1',
      sourceRevision: String.fromCharCode(100 + index).repeat(40),
      artifactDigest: `sha256:${String(index + 7).repeat(64)}`,
      originEvidenceRef: `gs://jenfu-platform-prod-${applicationId === 'ai-pdm' ? 'aipdm' : applicationId}-release/receipts/dev014/${applicationId}.json`,
      evidenceRef: `gs://jenfu-platform-prod-orgmaster-release/source/production-data/dev014/admission/evidence/${applicationId}.json`,
      evidenceSha256: String(index + 4).repeat(64),
    })),
    deadlineAt: '2999-01-01T00:00:00.000Z',
    ...overrides,
  }
  core.manifestSha256 = sha256(canonicalize(core))
  return core
}

function bytesFor(value) {
  return Buffer.from(JSON.stringify(value))
}

class FakeDatabase {
  constructor() {
    this.authority = { admission_enabled: false, revision: '1', updated_by: 'migration', reason_code: 'migration_default_off' }
    this.applications = new Map([
      ['ai-pdm', { application_id: 'ai-pdm', status: 'active', support_state: 'pending', support_revision: '1', support_evidence_ref: null }],
      ['orgmaster', { application_id: 'orgmaster', status: 'active', support_state: 'pending', support_revision: '1', support_evidence_ref: null }],
    ])
    this.commands = []
  }
  async query(sql, values = []) {
    const normalized = String(sql).trim().replace(/\s+/gu, ' ')
    this.commands.push(normalized.split(' ')[0])
    if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK' || normalized.startsWith('SET LOCAL ROLE')) return { rows: [] }
    if (normalized.startsWith('SELECT admission_enabled')) return { rows: [this.authority] }
    if (normalized.startsWith('SELECT application_id, status')) return { rows: [...this.applications.values()].sort((a, b) => a.application_id.localeCompare(b.application_id)) }
    if (normalized.includes('attest_managed_identity_invalidation_support_v1')) {
      const [applicationId, expectedRevision, evidenceRef] = values
      const prior = this.applications.get(applicationId)
      assert.equal(prior?.support_revision ?? '0', expectedRevision)
      const next = {
        application_id: applicationId,
        status: prior?.status ?? 'inactive',
        support_state: 'verified',
        support_revision: prior ? String(BigInt(prior.support_revision) + 1n) : '1',
        support_evidence_ref: evidenceRef,
      }
      this.applications.set(applicationId, next)
      return { rows: [next] }
    }
    if (normalized.includes('set_managed_identity_admission_v1')) {
      const [expectedRevision, enabled, actor, reasonCode] = values
      assert.equal(this.authority.revision, expectedRevision)
      this.authority = { admission_enabled: enabled, revision: '17', updated_by: actor, reason_code: reasonCode }
      return { rows: [{ revision: '17', admission_enabled: enabled, affected_identity_count: 0, outbox_count: 0 }] }
    }
    throw new Error(`UNEXPECTED_QUERY:${normalized}`)
  }
}

test('DEV-049 admission operation is exact-target, exact-consumer and self-hashed', () => {
  const value = operation()
  const bytes = bytesFor(value)
  assert.equal(assertOrgMasterAdmissionOperation(value, { bytes, operationSha256: sha256(bytes), sourceRevision: value.sourceRevision, now: new Date('2026-09-21T00:00:00Z') }), value)
  const drift = operation({ consumers: value.consumers.slice(1) })
  const driftBytes = bytesFor(drift)
  assert.throws(() => assertOrgMasterAdmissionOperation(drift, { bytes: driftBytes, operationSha256: sha256(driftBytes), sourceRevision: drift.sourceRevision, now: new Date('2026-09-21T00:00:00Z') }), /DEV049_OPERATION_CONSUMERS_INVALID/u)
  const swappedOrigin = operation({ consumers: value.consumers.map((consumer) => consumer.applicationId === 'ai-pdm'
    ? { ...consumer, originEvidenceRef: value.consumers[1].originEvidenceRef }
    : consumer) })
  const swappedOriginBytes = bytesFor(swappedOrigin)
  assert.throws(() => assertOrgMasterAdmissionOperation(swappedOrigin, { bytes: swappedOriginBytes, operationSha256: sha256(swappedOriginBytes), sourceRevision: swappedOrigin.sourceRevision, now: new Date('2026-09-21T00:00:00Z') }), /DEV049_OPERATION_CONSUMERS_INVALID/u)
})

test('DEV-049 admission runner is present in the immutable migration image', () => {
  const dockerfile = fs.readFileSync(new URL('../infra/google-cloud/dev-040-production-release/migration-runner.Dockerfile', import.meta.url), 'utf8')
  const operator = fs.readFileSync(new URL('./lib/dev049-production-admission.mjs', import.meta.url), 'utf8')
  assert.match(dockerfile, /COPY scripts\/lib\/dev049-production-admission\.mjs/u)
  assert.match(dockerfile, /COPY scripts\/dev049-production-admission-runner\.mjs/u)
  assert.match(dockerfile, /COPY scripts\/lib\/dev014-consumer-conformance\.mjs/u)
  assert.doesNotMatch(operator, /(?:platform|ai_pdm)_core/u)
})

test('DEV-049 admission accepts only exact raw consumer evidence', () => {
  const consumer = operation().consumers[0]
  const receipt = buildDev014ConsumerConformance({ appId: consumer.applicationId, sourceRevision: consumer.sourceRevision, artifactDigest: consumer.artifactDigest, failSeekingEvidenceRef: 'gs://jenfu-platform-prod-aipdm-release/receipts/releases/r/canonical.json', verifiedAt: '2026-09-21T00:00:00.000Z' })
  const bytes = Buffer.from(`${canonicalize(receipt)}\n`)
  const bound = { ...consumer, evidenceSha256: sha256(bytes) }
  assert.deepEqual(assertDev014ConsumerEvidenceBytes(bound, bytes), receipt)
  assert.throws(() => assertDev014ConsumerEvidenceBytes({ ...bound, artifactDigest: `sha256:${'f'.repeat(64)}` }, bytes), /DEV014_CONSUMER_CONFORMANCE_INVALID/u)
})

test('DEV-049 admission attests dynamic consumers, enables once and replays', async () => {
  const value = operation()
  const database = new FakeDatabase()
  const applied = await executeOrgMasterAdmission({ operation: value, database })
  assert.equal(applied.disposition, 'APPLIED')
  assert.equal(applied.after.enabled, true)
  assert.equal(applied.supports.length, 3)
  for (const consumer of value.consumers) assert.equal(database.applications.get(consumer.applicationId).support_evidence_ref, evidenceValue(consumer))
  const replay = await executeOrgMasterAdmission({ operation: value, database })
  assert.equal(replay.disposition, 'REPLAY')
})

test('DEV-049 admission rejects active consumer drift before attestation', async () => {
  const database = new FakeDatabase()
  database.applications.set('financial', { application_id: 'financial', status: 'active', support_state: 'pending', support_revision: '1', support_evidence_ref: null })
  await assert.rejects(() => executeOrgMasterAdmission({ operation: operation(), database }), /DEV049_ACTIVE_CONSUMER_SET_MISMATCH/u)
  assert.equal(database.commands.includes('UPDATE'), false)
  assert.equal(database.commands.at(-1), 'ROLLBACK')
})
