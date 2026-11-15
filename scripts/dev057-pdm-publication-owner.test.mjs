import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalize, sha256 } from './lib/dev012-owner-release-runtime.mjs'
import { LIFECYCLE_SCHEDULER_NAME } from './lib/dev014-lifecycle-scheduler-contract.mjs'
import { parseArgs, publishedOwner, schedulerReady } from './dev057-pdm-publication-owner.mjs'
import { assertAcceptance, assertControlOperation, controlIdentity, executePublicationControl,
  fmsPublicationControl, owners, pathsForControl } from './lib/dev057-pdm-publication-control.mjs'
import { DEV070_MIGRATION_ENTRIES } from './lib/dev070-administration-migration.mjs'
import { TARGET } from './lib/orgmaster-production-database.mjs'

const sourceRevision = 'a'.repeat(40)
const hash = 'b'.repeat(64)
const expectedFor = owner => ({
  sourceRevision, artifactDigest: `asia-east1-docker.pkg.dev/jenfu-platform-prod/${owners[owner].image}@sha256:${hash}`,
})

test('owner entry accepts only a sealed acceptance reference, an exact CAS revision and a fixed action', () => {
  const ref = `--acceptance-ref=gs://${owners.orgmaster.bucket}/receipts/pdm-session-acceptance/check.json#sha256=${hash}`
  assert.equal(parseArgs(['enable', '--expected-revision=0', ref, '--check']).expectedRevision, '0')
  for (const args of [['enable', '--expected-revision=-1', ref], ['disable', '--expected-revision=1', ref, '--sql=select'],
    ['enable', '--expected-revision=01', ref], ['enable', '--expected-revision=0', ref.split('#')[0]]]) {
    assert.throws(() => parseArgs(args), /ARGUMENT_INVALID/)
  }
  const sources = Object.fromEntries(Object.keys(owners).map(owner => [owner, expectedFor(owner)]))
  const evidence = { schemaVersion: 'jenfu.pdm-session-rollout-acceptance.v1', status: 'PASS', action: 'enable',
    evidenceSha256: hash, sources }
  assert.doesNotThrow(() => assertAcceptance(evidence, 'enable'))
  assert.throws(() => assertAcceptance(evidence, 'disable'), /ACCEPTANCE_INVALID/)
  assert.throws(() => assertAcceptance({ ...evidence, sources: { ...sources, platform: sources['ai-pdm'] } }, 'enable'), /ACCEPTANCE_INVALID/)
})

test('retry deadlines do not mint a different DB operation and distinct transitions cannot reuse its receipt', () => {
  const operation = { schemaVersion: 'orgmaster.pdm-publication-control-operation.v1', action: 'enable',
    sourceRevision, expectedRevision: '0', acceptanceRef: {}, releaseIntentRef: {}, terminalRef: {},
    deadlineAt: '2026-11-14T00:02:00Z' }
  const now = Date.parse('2026-11-14T00:00:00Z')
  assert.doesNotThrow(() => assertControlOperation(operation, sourceRevision, now))
  assert.throws(() => assertControlOperation(operation, sourceRevision, now + 120_000), /OPERATION_INVALID/)
  const identity = controlIdentity(operation)
  assert.equal(controlIdentity({ ...operation, deadlineAt: '2026-11-14T00:03:00Z' }), identity)
  assert.notEqual(controlIdentity({ ...operation, action: 'disable', expectedRevision: '1' }), identity)
  assert.notEqual(pathsForControl(sourceRevision, identity, hash).inputUri, pathsForControl(sourceRevision, identity, 'c'.repeat(64)).inputUri)
})

function releaseFixture(owner, flags) {
  const config = owners[owner]
  const artifact = expectedFor(owner)
  const revision = `${config.service}-cafe`
  const origin = `https://${config.service}-9536592944.asia-east1.run.app`
  const head = { schemaVersion: 'jenfu.dev012.owner-control-head.v1', ownerApplicationId: owner,
    controlBucket: config.bucket, service: config.service, result: 'RELEASED', state: 'FINALIZED',
    sourceRevision, releaseId: 'OWNER-RELEASED', candidateRevision: revision, sourceLockSha256: hash }
  const release = { ownerApplicationId: owner, releaseId: head.releaseId, sourceRevision, sourceLockRef: { sha256: hash } }
  const proof = { schemaVersion: 'jenfu.dev012.stage-receipt.v1', status: 'PASS', stage: 'terminal',
    ownerApplicationId: owner, releaseId: head.releaseId, sourceRevision,
    facts: { result: 'RELEASED', remainingHumanAction: 0, candidateRevision: revision, artifactDigest: artifact.artifactDigest } }
  const traffic = [{ revision, percent: 100 }]
  const service = { name: `projects/jenfu-platform-prod/locations/asia-east1/services/${config.service}`,
    uid: 'owner', etag: 'e1', urls: [origin], traffic, trafficStatuses: traffic }
  const active = { containers: [{ name: config.container, image: artifact.artifactDigest, env: flags }],
    conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }] }
  const transport = {
    readBytes: async uri => {
      const value = uri.endsWith('active.json') ? { ...head, controlSha256: sha256(canonicalize(head)) }
        : uri.endsWith('release-intent.json') ? release : { ...proof, receiptSha256: sha256(canonicalize(proof)) }
      return { bytes: Buffer.from(JSON.stringify(value)), ref: { uri, sha256: hash }, metadata: { generation: 1 } }
    },
    assertServiceSettled: row => row, effectiveRevision: () => revision,
    getService: async () => service, getRevision: async () => active,
  }
  return { transport, owner, expected: artifact, service, active, head }
}

test('activation requires released Platform relay and global producer with 100 percent pinned traffic', async () => {
  const state = releaseFixture('platform', [{ name: 'PORTAL_PDM_REVOCATION_RELAY_ENABLED', value: 'true' }])
  await assert.rejects(publishedOwner({ ...state, action: 'enable' }), /PLATFORM_PRODUCER_NOT_READY/)
  state.active.containers[0].env.push({ name: 'PORTAL_PDM_GLOBAL_LOGOUT_ENABLED', value: 'true' })
  await publishedOwner({ ...state, action: 'enable' })
  state.head.result = 'MIGRATION_APPLIED'
  await assert.rejects(publishedOwner({ ...state, action: 'enable' }), /OWNER_NOT_RELEASED/)
  state.head.result = 'RELEASED'
  state.service.trafficStatuses.push({ revision: 'another', percent: 0, tag: 'candidate' })
  await assert.rejects(publishedOwner({ ...state, action: 'enable' }), /OWNER_TRAFFIC_INVALID/)
})

test('activation and OrgMaster recovery require PDM receiver in live-authority mode', async () => {
  const state = releaseFixture('ai-pdm', [
    { name: 'PDM_SESSION_REVOCATION_ENABLED', value: '1' },
    { name: 'PDM_SESSION_REVOCATION_AUDIENCE', value: 'https://ai-pdm-prod-9536592944.asia-east1.run.app' },
    { name: 'PDM_SESSION_PERMISSION_SNAPSHOTS_ENABLED', value: '1' },
  ])
  for (const action of ['enable', 'disable']) {
    await assert.rejects(publishedOwner({ ...state, action }), /PDM_COMPATIBILITY_MODE_REQUIRED/)
  }
  state.active.containers[0].env.at(-1).value = '0'
  await publishedOwner({ ...state, action: 'disable' })
  state.active.containers[0].image = 'unexpected'
  await assert.rejects(publishedOwner({ ...state, action: 'disable' }), /OWNER_ARTIFACT_INVALID/)
})

test('FMS owner evidence binds release, image, database and serving compatibility revision', async () => {
  const config = fmsPublicationControl.owners['jf-fms']
  const releaseId = 'FMS-DEV068-COMPATIBILITY'
  const artifactDigest = `asia-east1-docker.pkg.dev/jenfu-platform-prod/${config.image}@sha256:${hash}`
  const expected = { sourceRevision, artifactDigest, releaseId, databaseReleaseSha256: hash }
  const sources = { orgmaster: expectedFor('orgmaster'), platform: expectedFor('platform'), 'jf-fms': expected }
  const evidence = { schemaVersion: fmsPublicationControl.acceptanceSchema, status: 'PASS', action: 'enable', evidenceSha256: hash, sources }
  const reference = `--acceptance-ref=gs://${owners.orgmaster.bucket}/${fmsPublicationControl.acceptancePrefix}/test.json#sha256=${hash}`
  assert.equal(parseArgs(['--fms', 'enable', '--expected-revision=0', reference, '--check']).control, fmsPublicationControl)
  assert.doesNotThrow(() => assertAcceptance(evidence, 'enable', fmsPublicationControl))
  assert.throws(() => assertAcceptance(evidence, 'enable'), /ACCEPTANCE_INVALID/)
  assert.throws(() => assertAcceptance({ ...evidence, sources: { ...sources, 'jf-fms': { ...expected, databaseReleaseSha256: 'bad' } } },
    'enable', fmsPublicationControl), /ACCEPTANCE_INVALID/)
  const fmsHash = value => sha256(JSON.stringify(JSON.parse(canonicalize(value)), null, 2) + '\n')
  const revision = `${config.service}-tested`
  const target = { project: 'jenfu-platform-prod', region: 'asia-east1', service: config.service, serviceUid: 'fms-uid', canonicalUrl: config.origin }
  const candidate = { revision, image: artifactDigest, uid: 'revision-uid' }
  const source = { candidateSource: sourceRevision }
  const plan = { format: 'fms.dev070.owner-release-plan.v1', releaseId, target, source, candidate }
  const terminal = { format: 'fms.dev070.owner-release-terminal.v1', releaseId, status: 'ACTIVATED',
    planSha256: fmsHash(plan), target, source, candidate }
  const traffic = [{ revision, percent: 100 }]
  const service = { name: `projects/jenfu-platform-prod/locations/asia-east1/services/${config.service}`, uid: target.serviceUid,
    urls: [config.origin], etag: 'service-etag', traffic, trafficStatuses: traffic }
  const env = [
    { name: 'FMS_SESSION_REVOCATION_ENABLED', value: '1' },
    { name: 'FMS_SESSION_AUTHORIZATION_ENABLED', value: '0' },
    { name: 'FMS_DATABASE_RELEASE_SHA256', value: hash },
  ]
  const transport = {
    async readBytes(uri) {
      const body = uri.endsWith('/plan.json') ? { ...plan, planSha256: fmsHash(plan) } : { ...terminal, receiptSha256: fmsHash(terminal) }
      return { bytes: Buffer.from(JSON.stringify(body)), ref: { uri, sha256: fmsHash(body) } }
    },
    assertServiceSettled: value => value, effectiveRevision: () => revision, getService: async () => service,
    getRevision: async () => ({ uid: candidate.uid, conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }],
      containers: [{ name: config.container, image: artifactDigest, env }] }),
  }
  const request = { owner: 'jf-fms', expected, transport, control: fmsPublicationControl, action: 'enable' }
  assert.equal((await publishedOwner(request)).revision, revision)
  env[1].value = '1'
  await assert.rejects(publishedOwner({ ...request, action: 'disable' }), /FMS_COMPATIBILITY_MODE_REQUIRED/)
  env[1].value = '0'
  env[2].value = 'c'.repeat(64)
  await assert.rejects(publishedOwner(request), /FMS_COMPATIBILITY_MODE_REQUIRED/)
  env[2].value = hash
  terminal.status = 'CANDIDATE'
  await assert.rejects(publishedOwner(request), /OWNER_RELEASE_EVIDENCE_INVALID/)
})

test('FMS control calls its own transition only after validating the complete FMS ledger suffix', async () => {
  const calls = []
  const expected = DEV070_MIGRATION_ENTRIES.filter(row => row.order >= 54)
  let ledger = expected.map(row => ({ version: row.version, checksum: row.appliedSha256 }))
  const state = { enabled: true, revision: '1', operationSha256: hash }
  const database = { async query(sql, params) {
    calls.push(sql)
    if (sql.includes('SESSION_USER')) return { rows: [{ login: TARGET.login, db: 'jenfu_prod', migrator: true, runtime: false }] }
    if (sql.includes('schema_migrations')) {
      assert.deepEqual(params, [expected.map(row => row.version)])
      return { rows: ledger }
    }
    if (sql.includes('transition_fms_session_publication_v1')) return { rows: [{ state }] }
    assert.doesNotMatch(sql, /transition_pdm/)
    return { rows: [] }
  } }
  const request = { database, operation: { expectedRevision: '0', action: 'enable', deadlineAt: 'test' },
    operationSha256: hash, control: fmsPublicationControl }
  assert.deepEqual(await executePublicationControl(request), state)
  assert.equal(calls.at(-1), 'COMMIT')
  calls.length = 0
  ledger = ledger.slice(0, -1)
  await assert.rejects(executePublicationControl(request), /LEDGER_INVALID/)
  assert.equal(calls.at(-1), 'ROLLBACK')
  assert.equal(calls.some(sql => sql.includes('transition_fms')), false)
})

test('scheduler must be enabled and recently succeed on the serving OrgMaster revision', async () => {
  const job = {
    name: LIFECYCLE_SCHEDULER_NAME, state: 'ENABLED', description: 'DEV-014 managed identity lifecycle worker trigger',
    schedule: '* * * * *', timeZone: 'Asia/Taipei', attemptDeadline: '60s',
    httpTarget: { httpMethod: 'POST', uri: 'https://orgmaster-prod-9536592944.asia-east1.run.app/api/internal/managed-identity-lifecycle/v2',
      oidcToken: { serviceAccountEmail: 'orgmaster-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com',
        audience: 'https://orgmaster-prod-9536592944.asia-east1.run.app' } },
  }
  const org = { revision: 'orgmaster-prod-cafe', createdAt: '2026-11-14T12:00:00Z' }
  const log = { insertId: 'observed-entry', timestamp: '2026-11-14T12:01:00Z' }
  const transport = {
    now: () => '2026-11-14T12:02:00Z',
    async request(uri, options) {
      if (uri.includes('cloudscheduler.googleapis.com')) return job
      const { filter } = JSON.parse(options.body)
      assert.match(filter, /revision_name="orgmaster-prod-cafe"/u)
      assert.match(filter, /timestamp >= "2026-11-14T12:00:00.000Z"/u)
      return { entries: [log] }
    },
  }
  assert.deepEqual((await schedulerReady(transport, org)).lastSuccess, log)
  log.timestamp = '2026-11-14T11:59:55Z'
  await assert.rejects(schedulerReady(transport, org), /SCHEDULER_SUCCESS_NOT_OBSERVED/)
  job.state = 'PAUSED'
  await assert.rejects(schedulerReady(transport, org), /SCHEDULER_READBACK_INVALID/)
})
