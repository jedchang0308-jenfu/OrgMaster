import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalize, sha256 } from './dev012-owner-release-runtime.mjs'
import { DEV014_PRINCIPAL_LIFECYCLE_V2_REMEDIATION } from './dev014-principal-lifecycle-release.mjs'
import { executePrincipalLifecycleQuiescence } from './dev014-principal-lifecycle-quiescence.mjs'
import { createPrincipalOnlyRepairFixture } from './dev057-principal-forward-repair.fixture.mjs'
import { principalOnlyQuiescenceRequest, assertPrincipalOnlyQuiescenceReadback } from './dev057-principal-only-release.mjs'
import { recoveryOperationBinding } from './dev057-principal-recovery-operator.mjs'

const bucket = 'jenfu-platform-prod-orgmaster-release'
const serviceName = 'orgmaster-prod'
const previousRevision = 'orgmaster-prod-157cdf5f7cc2'
const recoveryRevisionName = 'orgmaster-prod-recovery-abcdef123456'
const sourceRevision = 'b'.repeat(40)
const sourceTree = 'f'.repeat(40)
const uid = 'd65f379b-a342-4eb3-ba22-109aa5f368c5'
const image = `asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster-recovery@sha256:${'a'.repeat(64)}`
const controlUri = `gs://${bucket}/control/active.json`
const profile = {
  application: { id: 'orgmaster', repository: 'jedchang0308-jenfu/OrgMaster', branch: 'master' },
  artifact: { releaseBucket: bucket },
  target: { projectId: 'jenfu-platform-prod', region: 'asia-east1', serviceName },
  runtime: { containerName: 'orgmaster' },
}
const recovery = {
  revision: recoveryRevisionName,
  imageDigest: image,
  serviceUid: uid,
  receiptRef: {
    uri: `gs://${bucket}/receipts/releases/DEV057-PRINCIPAL-ONLY-RECOVERY/${sourceRevision}.json`,
    sha256: 'd'.repeat(64),
  },
}
const intent = { releaseId: 'DEV014-LIFECYCLE-TEST0001', sourceRevision, previousRevision,
  principalOnlyRecovery: recovery, deadlineAt: '2999-01-01T00:00:00.000Z' }
const traffic = [{ type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: previousRevision, percent: 100 }]
const before = {
  name: `projects/jenfu-platform-prod/locations/asia-east1/services/${serviceName}`,
  uid, etag: 'etag-before', generation: '249', observedGeneration: '249', reconciling: false,
  terminalCondition: { state: 'CONDITION_SUCCEEDED' },
  scaling: { scalingMode: 'AUTOMATIC', maxInstanceCount: 1 },
  ingress: 'INGRESS_TRAFFIC_ALL', defaultUriDisabled: false, invokerIamDisabled: true,
  template: { serviceAccount: 'orgmaster-runtime', containers: [{ name: 'orgmaster', image: 'old' }] },
  traffic, trafficStatuses: traffic,
}
const manualZero = { ...before, etag: 'etag-manual-zero', generation: '250', observedGeneration: '250',
  scaling: { scalingMode: 'MANUAL', manualInstanceCount: 0, maxInstanceCount: 1 } }
const proof = {
  schemaVersion: 'orgmaster.principal-only-recovery.v1', sourceRevision,
  projectId: 'jenfu-platform-prod', region: 'asia-east1', service: serviceName,
  serviceUid: uid, oldRevision: previousRevision, recoveryRevision: recoveryRevisionName,
  imageDigest: image, status: 'PASS',
}
const revision = {
  name: `${before.name}/revisions/${recoveryRevisionName}`,
  service: before.name,
  conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }],
  containers: [{ name: 'orgmaster', image }],
}
const controlCore = {
  schemaVersion: 'jenfu.dev012.owner-control-head.v1', ownerApplicationId: 'orgmaster',
  service: serviceName, controlBucket: bucket, state: 'FINALIZED', result: 'RELEASED',
  candidateRevision: previousRevision,
}
const values = {
  sourceLock: { sourceRevision, sourceTree, remoteRevision: sourceRevision, clean: true, status: 'SOURCE_FROZEN' },
  readiness: { schemaVersion: 'orgmaster.routine-release-readiness.v1', devId: 'DEV-014',
    slice: '014-PRINCIPAL-LIFECYCLE-V2', remediation: DEV014_PRINCIPAL_LIFECYCLE_V2_REMEDIATION },
  authorization: { schemaVersion: 'orgmaster.routine-release-authorization.v1',
    authorizationBasis: 'OPERATOR_INVOKED_DEPLOY_PRODUCTION', devId: 'DEV-014',
    slice: '014-PRINCIPAL-LIFECYCLE-V2', remediation: DEV014_PRINCIPAL_LIFECYCLE_V2_REMEDIATION },
}
const sourceProof = {
  status: 'OFFICIAL_MERGED_PR_VERIFIED', repository: profile.application.repository,
  branch: 'master', sourceRevision, sourceTree, branchProtected: true,
  reviewMode: 'SOLO_MAINTAINER_NO_HUMAN_APPROVAL_REQUIRED', rulesetId: 24077876,
  requiredChecks: ['Production Source QC'],
}

function harness({ source = sourceProof, activeControl = controlCore, activeReadback = null,
  secondControl = null, service = before, recoveryProof = proof, recoveryRevision = revision } = {}) {
  const activeControlBytes = Buffer.from(JSON.stringify({
    ...activeControl, controlSha256: sha256(canonicalize(activeControl)),
  }))
  const activeControlReadback = activeReadback ?? {
    ref: { uri: controlUri, sha256: sha256(activeControlBytes) }, metadata: { generation: '23' },
  }
  const finalControlReadback = secondControl ?? activeControlReadback
  const calls = { readBytes: 0, getService: 0, readJson: 0, getRevision: 0, quiesce: [], putJson: [] }
  const transport = {
    async readBytes(uri) {
      assert.equal(uri, controlUri)
      calls.readBytes += 1
      const readback = calls.readBytes === 1 ? activeControlReadback : finalControlReadback
      return { bytes: activeControlBytes, ref: readback.ref, metadata: readback.metadata }
    },
    async getService() { calls.getService += 1; return service },
    async readJson(ref) { calls.readJson += 1; assert.deepEqual(ref, recovery.receiptRef); return { value: recoveryProof } },
    async getRevision(_profile, name) { calls.getRevision += 1; assert.equal(name, recoveryRevisionName); return recoveryRevision },
    async quiescePrincipalOnly(input) {
      calls.quiesce.push(input)
      return { service: manualZero, operationRef: { name: 'operations/quiesce-1' } }
    },
    now() { return '2026-10-06T00:00:00.000Z' },
    async putJson(uri, value, options) {
      calls.putJson.push({ uri, value, options })
      return { ref: { uri, sha256: 'e'.repeat(64) } }
    },
  }
  return { calls, transport, activeControlReadback, run: () => executePrincipalLifecycleQuiescence({
    profile, intent, values, sourceProof: source, controlReadback: activeControlReadback, transport,
  }) }
}

test('lifecycle quiescence verifies official source and stable owner control before an etag-bound mutation and receipt', async () => {
  const h = harness()
  const result = await h.run()
  assert.equal(h.calls.readBytes, 2, 'control generation and object hash are reread immediately before CAS')
  assert.equal(h.calls.getService, 1)
  assert.equal(h.calls.readJson, 1)
  assert.equal(h.calls.getRevision, 1)
  assert.equal(h.calls.quiesce.length, 1)
  assert.equal(h.calls.quiesce[0].expectedEtag, before.etag)
  assert.equal(h.calls.quiesce[0].proof, proof)
  assert.equal(h.calls.putJson.length, 1)
  assert.equal(h.calls.putJson[0].uri, `gs://${bucket}/receipts/releases/${intent.releaseId}/quiescence.json`)
  assert.equal(h.calls.putJson[0].value.schemaVersion, 'orgmaster.principal-lifecycle-quiescence.v1')
  assert.equal(h.calls.putJson[0].value.status, 'MANUAL_ZERO_READ_BACK')
  assert.equal(h.calls.putJson[0].value.serviceUid, uid)
  assert.equal(h.calls.putJson[0].value.previousRevision, previousRevision)
  assert.equal(h.calls.putJson[0].value.databaseDrain, 'MIGRATION_PREFLIGHT_STILL_REQUIRED')
  assert.equal(result.ref.uri, h.calls.putJson[0].uri)
})

test('quiescence refuses an unverified source before reading or mutating the service', async () => {
  const h = harness({ source: { ...sourceProof, branchProtected: false } })
  await assert.rejects(() => h.run(), /DEV014_LIFECYCLE_QUIESCENCE_INVALID/u)
  assert.equal(h.calls.readBytes, 0)
  assert.equal(h.calls.getService, 0)
  assert.equal(h.calls.quiesce.length, 0)
  assert.equal(h.calls.putJson.length, 0)
})

test('quiescence refuses control generation or hash drift before service mutation', async () => {
  const h = harness({ secondControl: {
    ref: { uri: controlUri, sha256: 'f'.repeat(64) }, metadata: { generation: '24' },
  } })
  await assert.rejects(() => h.run(), /DEV014_LIFECYCLE_QUIESCENCE_INVALID/u)
  assert.equal(h.calls.readBytes, 2)
  assert.equal(h.calls.quiesce.length, 0)
  assert.equal(h.calls.putJson.length, 0)
})

test('a sealed pre-candidate abort with no candidate may be safely re-quiesced for a new forward attempt', async () => {
  const abortedControl = { ...controlCore, result: 'PRE_ACTIVATION_ABORTED', candidateRevision: null }
  const h = harness({ activeControl: abortedControl, service: manualZero })
  await h.run()
  assert.equal(h.calls.readBytes, 2)
  assert.equal(h.calls.quiesce.length, 1)
  assert.equal(h.calls.putJson[0].value.baselineControlRef.sha256, h.activeControlReadback.ref.sha256)
  assert.equal(h.calls.putJson[0].value.baselineControlGeneration, '23')
})

test('quiescence refuses a mismatched recovery service identity before service mutation', async () => {
  const h = harness({ service: { ...before, uid: '11111111-2222-4333-8444-555555555555' } })
  await assert.rejects(() => h.run())
  assert.equal(h.calls.quiesce.length, 0)
  assert.equal(h.calls.putJson.length, 0)
})

function recoveredHarness() {
  const h = createPrincipalOnlyRepairFixture()
  const targetProfile = { ...h.input.profile, application: { ...h.input.profile.application, branch: 'master' } }
  Object.assign(h.service, { etag: 'maintenance-etag', scaling: { scalingMode: 'AUTOMATIC', maxInstanceCount: 1 },
    template: { containers: [{ name: 'orgmaster', image: h.revision.containers[0].image }] } })
  const oldProof = h.objects.get(h.intent.principalOnlyRecovery.receiptRef.uri)
  const operation = recoveryOperationBinding({ sourceRevision, serviceUid: h.service.uid, oldRevision: h.recovery })
  const nextProof = h.put(`gs://${bucket}/receipts/releases/DEV057-PRINCIPAL-ONLY-RECOVERY/${operation.receiptName}`,
    { ...proof, oldRevision: h.recovery, recoveryRevision: operation.revision })
  assert.equal(h.objects.get(oldProof.ref.uri), oldProof, 'an immutable prior recovery proof must survive unchanged')
  const nextIntent = { ...intent, previousRevision: h.recovery, baselineIntentRef: h.input.baselineIntentRef,
    principalOnlyRecovery: { ...recovery, revision: operation.revision, receiptRef: nextProof.ref } }
  const controlRow = h.objects.get(controlUri)
  const controlReadback = { ref: controlRow.ref, metadata: { generation: '41' } }
  const calls = { quiesce: 0, controlReads: 0 }
  const transport = { ...h.input.transport,
    async readBytes(uri) {
      if (uri === controlUri) calls.controlReads += 1
      const row = await h.input.transport.readBytes(uri)
      return { ...row, metadata: { generation: '41' } }
    },
    async readJson(ref) {
      const row = await this.readBytes(ref.uri)
      assert.deepEqual(ref, row.ref)
      return row
    },
    async getRevision(profile, name) {
      return name === operation.revision ? { ...revision, name: `${h.service.name}/revisions/${operation.revision}` }
        : h.input.transport.getRevision(profile, name)
    },
    async quiescePrincipalOnly({ intent: candidateIntent, expectedEtag }) {
      calls.quiesce += 1
      assert.equal(expectedEtag, h.service.etag)
      const request = principalOnlyQuiescenceRequest({ service: h.service, oldRevision: candidateIntent.previousRevision })
      const after = { ...h.service, etag: 'maintenance-stopped-etag', generation: '3', observedGeneration: '3', scaling: request.scaling }
      assertPrincipalOnlyQuiescenceReadback({ before: h.service, after, oldRevision: candidateIntent.previousRevision })
      return { service: after, operationRef: { name: 'operations/recovered-quiesce' } }
    },
    now() { return '2026-10-06T00:00:00Z' },
    async putJson(uri, value) { return h.put(uri, value) },
  }
  return { h, calls, nextIntent, transport, controlReadback,
    run: () => executePrincipalLifecycleQuiescence({ profile: targetProfile, intent: nextIntent,
      values, sourceProof, controlReadback, transport }) }
}

test('a sealed maintenance rollback can be re-quiesced only after the actual forward-repair joins and a fresh distinct recovery proof', async () => {
  const h = recoveredHarness()
  const result = await h.run()
  assert.equal(h.calls.quiesce, 1)
  assert.equal(h.calls.controlReads, 2)
  assert.equal(result.value.previousRevision, h.h.recovery)
  assert.deepEqual(result.value.repairBaselineIntentRef, h.h.input.baselineIntentRef)
  assert.equal(result.value.repairTerminalRef.uri, h.h.paths.terminal)
  assert.equal(result.value.repairMigrationRef.uri, h.h.paths.migrate)
  assert.deepEqual(h.h.calls, [h.h.recovery], 'the old application revision is never inspected as a runtime authority')
})

test('rolled-back control alone cannot quiesce when sealed repair evidence, owner run or maintenance identity is invalid', async () => {
  for (const mutate of [
    row => row.h.objects.delete(row.h.paths.migrate),
    row => { row.h.run.status = 'in_progress' },
    row => { row.h.run.headSha = '9'.repeat(40) },
    row => row.h.revision.containers.push({ name: 'database-proxy', image: 'proxy' }),
  ]) {
    const h = recoveredHarness()
    mutate(h)
    await assert.rejects(() => h.run(), /MISSING|PRINCIPAL_/u)
    assert.equal(h.calls.quiesce, 0)
  }
})

test('repair readback does not bypass the final control generation CAS', async () => {
  const h = recoveredHarness()
  const readBytes = h.transport.readBytes
  h.transport.readBytes = async uri => {
    const row = await readBytes(uri)
    return uri === controlUri && h.calls.controlReads === 2
      ? { ...row, metadata: { generation: '42' } } : row
  }
  await assert.rejects(() => h.run(), /DEV014_LIFECYCLE_QUIESCENCE_INVALID/u)
  assert.equal(h.calls.quiesce, 0)
})

test('the previous maintenance recovery proof cannot become its own new rollback baseline', async () => {
  const h = recoveredHarness()
  h.nextIntent.principalOnlyRecovery = h.h.intent.principalOnlyRecovery
  await assert.rejects(() => h.run(), /PRINCIPAL_/u)
  assert.equal(h.calls.quiesce, 0)
})
