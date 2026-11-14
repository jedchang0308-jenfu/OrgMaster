import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalize, sha256 } from './lib/dev012-owner-release-runtime.mjs'
import { LIFECYCLE_SCHEDULER_NAME } from './lib/dev014-lifecycle-scheduler-contract.mjs'
import { parseArgs, publishedOwner, schedulerReady } from './dev057-pdm-publication-owner.mjs'
import { assertAcceptance, assertControlOperation, controlIdentity, owners, pathsForControl } from './lib/dev057-pdm-publication-control.mjs'

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
