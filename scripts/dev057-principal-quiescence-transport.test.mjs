import assert from 'node:assert/strict'
import test from 'node:test'
import { createOwnerTransport } from './lib/dev012-owner-release-runtime.mjs'

const projectId = 'jenfu-platform-prod'
const region = 'asia-east1'
const serviceName = 'orgmaster-prod'
const fullName = `projects/${projectId}/locations/${region}/services/${serviceName}`
const containerName = 'orgmaster'
const oldRevision = `${serviceName}-157cdf5f7cc2`
const recoveryRevision = `${serviceName}-recovery-abcdef123456`
const uid = 'd65f379b-a342-4eb3-ba22-109aa5f368c5'
const sourceRevision = 'b'.repeat(40)
const bucket = 'jenfu-platform-prod-orgmaster-release'
const image = `asia-east1-docker.pkg.dev/${projectId}/orgmaster-release/orgmaster-recovery@sha256:${'a'.repeat(64)}`
const profile = {
  target: { projectId, region, serviceName },
  runtime: { containerName },
  artifact: { releaseBucket: bucket },
}
const traffic = [{ type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: oldRevision, percent: 100 }]
const intent = {
  sourceRevision,
  previousRevision: oldRevision,
  principalOnlyRecovery: {
    revision: recoveryRevision,
    imageDigest: image,
    serviceUid: uid,
    receiptRef: {
      uri: `gs://${bucket}/receipts/releases/DEV057-PRINCIPAL-ONLY-RECOVERY/${sourceRevision}.json`,
      sha256: 'd'.repeat(64),
    },
  },
}
const proof = {
  schemaVersion: 'orgmaster.principal-only-recovery.v1',
  sourceRevision,
  projectId,
  region,
  service: serviceName,
  serviceUid: uid,
  oldRevision,
  recoveryRevision,
  imageDigest: image,
  status: 'PASS',
}
const recovery = {
  name: `${fullName}/revisions/${recoveryRevision}`,
  service: fullName,
  conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }],
  containers: [{ name: containerName, image }],
}
const baseline = {
  name: fullName,
  uid,
  etag: 'etag-before',
  generation: '249',
  observedGeneration: '249',
  reconciling: false,
  terminalCondition: { state: 'CONDITION_SUCCEEDED' },
  scaling: { scalingMode: 'AUTOMATIC', maxInstanceCount: 1 },
  ingress: 'INGRESS_TRAFFIC_ALL',
  defaultUriDisabled: false,
  invokerIamDisabled: true,
  template: { serviceAccount: 'orgmaster-runtime', containers: [{ name: containerName, image: 'old' }] },
  traffic,
  trafficStatuses: traffic,
}
const manualZero = { ...baseline, etag: 'etag-after', generation: '250', observedGeneration: '250',
  scaling: { scalingMode: 'MANUAL', manualInstanceCount: 0, maxInstanceCount: 1 } }
const maintenanceTraffic = [{ type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: recoveryRevision, percent: 100 }]
const maintenance = { ...manualZero, etag: 'etag-maintenance', generation: '251', observedGeneration: '251',
  scaling: { scalingMode: 'AUTOMATIC', manualInstanceCount: null, maxInstanceCount: 1 },
  traffic: maintenanceTraffic, trafficStatuses: maintenanceTraffic }
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })

function harness({ before = baseline, after = manualZero, recoveryRevisionReadback = recovery,
  patchStatus = 200, targetProfile = profile, maxSleeps = 3 } = {}) {
  const mutations = []
  let serviceReads = 0
  let sleepCalls = 0
  const transport = createOwnerTransport({ token: 'x'.repeat(32), sleep: async () => {
    sleepCalls += 1
    if (sleepCalls > maxSleeps) throw new Error('TEST_POLL_FENCE_EXCEEDED')
  }, fetchImpl: async (url, options = {}) => {
    const value = String(url)
    if (value === `https://run.googleapis.com/v2/${fullName}/revisions/${recoveryRevision}`) return json(recoveryRevisionReadback)
    if (value.startsWith(`https://run.googleapis.com/v2/${fullName}?updateMask=`) && options.method === 'PATCH') {
      mutations.push({ url: value, body: JSON.parse(options.body) })
      if (patchStatus !== 200) return json({ error: { code: patchStatus } }, patchStatus)
      const operation = mutations.at(-1).body.scaling.scalingMode === 'AUTOMATIC' ? 'maintenance-restore-1' : 'quiesce-1'
      return json({ name: `projects/${projectId}/locations/${region}/operations/${operation}` })
    }
    if (value === `https://run.googleapis.com/v2/${fullName}` && !options.method) {
      serviceReads += 1
      return json(serviceReads === 1 ? before : after)
    }
    throw new Error(`UNEXPECTED_FETCH:${options.method ?? 'GET'}:${value}`)
  } })
  return {
    transport,
    mutations,
    serviceReads: () => serviceReads,
    sleepCalls: () => sleepCalls,
    quiesce: (input = {}) => transport.quiescePrincipalOnly({
      profile: targetProfile,
      intent,
      proof,
      deadlineAt: new Date(Date.now() + 5_000).toISOString(),
      ...input,
    }),
    restore: (input = {}) => transport.restorePrincipalOnlyMaintenance({
      profile: targetProfile,
      intent,
      proof,
      deadlineAt: new Date(Date.now() + 5_000).toISOString(),
      ...input,
    }),
  }
}

test('owner transport quiesces only after exact recovery proof and preserves the own-service baseline under etag CAS', async () => {
  const h = harness()
  const result = await h.quiesce()
  assert.equal(h.mutations.length, 1)
  const mutation = h.mutations[0]
  assert.equal(new URL(mutation.url).searchParams.get('updateMask'), 'scaling,traffic')
  assert.deepEqual(Object.keys(mutation.body).sort(), ['etag', 'name', 'scaling', 'traffic'])
  assert.equal(mutation.body.name, fullName)
  assert.equal(mutation.body.etag, baseline.etag)
  assert.deepEqual(mutation.body.scaling, { scalingMode: 'MANUAL', manualInstanceCount: 0, maxInstanceCount: 1 })
  assert.deepEqual(mutation.body.traffic, baseline.traffic)
  assert.equal(Object.hasOwn(mutation.body, 'template'), false)
  assert.equal(Object.hasOwn(mutation.body, 'ingress'), false)
  assert.deepEqual(result.service, manualZero)
  assert.deepEqual(result.operationRef, { name: `projects/${projectId}/locations/${region}/operations/quiesce-1` })
})

test('an existing settled MANUAL 0 service is idempotent and issues no PATCH', async () => {
  const existing = { ...baseline, scaling: { scalingMode: 'MANUAL', manualInstanceCount: '0', maxInstanceCount: 1 } }
  const h = harness({ before: existing, after: existing })
  const result = await h.quiesce()
  assert.deepEqual(result.service, existing)
  assert.equal(result.operationRef, null)
  assert.equal(h.mutations.length, 0)
  assert.equal(h.serviceReads(), 1)
})

test('quiescence requires a Principal-only recovery binding before reading a revision or mutating', async () => {
  const h = harness()
  await assert.rejects(() => h.quiesce({ intent: { sourceRevision, previousRevision: oldRevision } }), /PRINCIPAL_ONLY_RECOVERY_REQUIRED/u)
  assert.equal(h.serviceReads(), 1)
  assert.equal(h.mutations.length, 0)
})

test('quiescence rejects stale etag and never treats a failed CAS as a completed mutation', async () => {
  const h = harness({ patchStatus: 412 })
  await assert.rejects(() => h.quiesce())
  assert.equal(h.mutations.length, 1)
  assert.equal(h.mutations[0].body.etag, baseline.etag)
  assert.equal(h.serviceReads(), 1, 'a rejected CAS must not proceed to mutation readback')
})

test('quiescence rejects wrong owner service, UID, baseline traffic, generation and recovery proof before PATCH', async () => {
  const cases = [
    ['cross-owner profile', { target: { projectId, region, serviceName: 'platform-prod' }, runtime: profile.runtime, artifact: profile.artifact }, intent, proof, baseline, recovery],
    ['cross-owner service', profile, intent, proof, { ...baseline, name: `projects/${projectId}/locations/${region}/services/platform-prod` }, recovery],
    ['service UID mismatch', profile, intent, proof, { ...baseline, uid: '11111111-2222-4333-8444-555555555555' }, recovery],
    ['wrong old traffic', profile, intent, proof, { ...baseline, traffic: [{ ...traffic[0], revision: `${serviceName}-other` }] }, recovery],
    ['unsettled generation', profile, intent, proof, { ...baseline, generation: '250', observedGeneration: '249' }, recovery],
    ['proof source mismatch', profile, intent, { ...proof, sourceRevision: 'e'.repeat(40) }, baseline, recovery],
    ['proof UID mismatch', profile, intent, { ...proof, serviceUid: '11111111-2222-4333-8444-555555555555' }, baseline, recovery],
    ['proof recovery revision mismatch', profile, intent, { ...proof, recoveryRevision: `${serviceName}-other` }, baseline, recovery],
    ['proof image mismatch', profile, intent, { ...proof, imageDigest: image.replace(/a{64}$/u, 'e'.repeat(64)) }, baseline, recovery],
    ['proof status mismatch', profile, intent, { ...proof, status: 'FAIL' }, baseline, recovery],
    ['extra proof field', profile, intent, { ...proof, operator: 'untrusted' }, baseline, recovery],
    ['wrong recovery image readback', profile, intent, proof, baseline, { ...recovery, containers: [{ name: containerName, image: image.replace(/a{64}$/u, 'e'.repeat(64)) }] }],
  ]
  for (const [label, targetProfile, candidateIntent, candidateProof, service, revision] of cases) {
    const h = harness({ before: service, recoveryRevisionReadback: revision, targetProfile })
    await assert.rejects(() => h.quiesce({ intent: candidateIntent, proof: candidateProof }), undefined, label)
    assert.equal(h.mutations.length, 0, `${label} must be rejected before PATCH`)
  }
})

test('quiescence readback rejects service identity, template, entrypoint, stable scaling and generation drift', async () => {
  const drifts = [
    ['UID', { uid: '11111111-2222-4333-8444-555555555555' }],
    ['template', { template: { serviceAccount: 'other-runtime', containers: [{ name: containerName, image: 'old' }] } }],
    ['ingress', { ingress: 'INGRESS_TRAFFIC_INTERNAL_ONLY' }],
    ['default URI policy', { defaultUriDisabled: true }],
    ['invoker IAM policy', { invokerIamDisabled: false }],
    ['stable scaling', { scaling: { scalingMode: 'MANUAL', manualInstanceCount: 0, maxInstanceCount: 2 } }],
    ['generation rollback', { generation: '248', observedGeneration: '248' }],
  ]
  for (const [label, drift] of drifts) {
    const h = harness({ after: { ...manualZero, ...drift } })
    await assert.rejects(() => h.quiesce(), error => {
      assert.match(error.message, /DEV057_PRINCIPAL_RECOVERY_INVALID/u)
      return true
    }, label)
    assert.equal(h.mutations.length, 1, `${label} drift is checked against provider readback`)
  }
})

test('owner transport restores only the proof-bound maintenance revision with explicit automatic max-one scaling', async () => {
  const h = harness({ before: manualZero, after: maintenance })
  const result = await h.restore()
  assert.equal(h.mutations.length, 1)
  const mutation = h.mutations[0]
  assert.equal(new URL(mutation.url).searchParams.get('updateMask'), 'scaling,traffic')
  assert.deepEqual(Object.keys(mutation.body).sort(), ['etag', 'name', 'scaling', 'traffic'])
  assert.equal(mutation.body.name, fullName)
  assert.equal(mutation.body.etag, manualZero.etag)
  assert.deepEqual(mutation.body.scaling, {
    scalingMode: 'AUTOMATIC', manualInstanceCount: null, maxInstanceCount: 1,
  })
  assert.deepEqual(mutation.body.traffic, maintenanceTraffic)
  assert.equal(Object.hasOwn(mutation.body, 'template'), false)
  assert.equal(Object.hasOwn(mutation.body, 'ingress'), false)
  assert.deepEqual(result.service, maintenance)
  assert.deepEqual(result.operationRef, { name: `projects/${projectId}/locations/${region}/operations/maintenance-restore-1` })
})

test('an already restored proof-bound maintenance service is idempotent and issues no PATCH', async () => {
  const h = harness({ before: maintenance, after: maintenance })
  const result = await h.restore()
  assert.deepEqual(result.service, maintenance)
  assert.equal(result.operationRef, null)
  assert.equal(h.mutations.length, 0)
  assert.equal(h.serviceReads(), 1)
})

test('maintenance restore requires the recovery binding and rejects a failed etag CAS', async () => {
  const missing = harness({ before: manualZero })
  await assert.rejects(() => missing.restore({ intent: { sourceRevision, previousRevision: oldRevision } }), /PRINCIPAL_ONLY_RECOVERY_REQUIRED/u)
  assert.equal(missing.mutations.length, 0)

  const stale = harness({ before: manualZero, patchStatus: 412 })
  await assert.rejects(() => stale.restore())
  assert.equal(stale.mutations.length, 1)
  assert.equal(stale.mutations[0].body.etag, manualZero.etag)
  assert.equal(stale.serviceReads(), 1, 'a rejected CAS must not proceed to mutation readback')
})

test('maintenance restore rejects wrong owner, revision proof and provider readback before accepting the result', async () => {
  const wrongOwner = harness({ before: { ...manualZero, name: `projects/${projectId}/locations/${region}/services/platform-prod` } })
  await assert.rejects(() => wrongOwner.restore())
  assert.equal(wrongOwner.mutations.length, 0)

  const wrongProof = harness({ before: manualZero, recoveryRevisionReadback: {
    ...recovery, containers: [{ name: containerName, image: image.replace(/a{64}$/u, 'e'.repeat(64)) }],
  } })
  await assert.rejects(() => wrongProof.restore())
  assert.equal(wrongProof.mutations.length, 0)

  const drifts = [
    ['UID', { uid: '11111111-2222-4333-8444-555555555555' }],
    ['template', { template: { serviceAccount: 'other-runtime', containers: [{ name: containerName, image: 'old' }] } }],
    ['ingress', { ingress: 'INGRESS_TRAFFIC_INTERNAL_ONLY' }],
    ['scaling ceiling', { scaling: { scalingMode: 'AUTOMATIC', manualInstanceCount: null, maxInstanceCount: 2 } }],
    ['wrong active revision', { traffic: [{ ...maintenanceTraffic[0], revision: oldRevision }], trafficStatuses: [{ ...maintenanceTraffic[0], revision: oldRevision }] }],
    ['generation rollback', { generation: '249', observedGeneration: '249' }],
  ]
  for (const [label, drift] of drifts) {
    const h = harness({ before: manualZero, after: { ...maintenance, ...drift } })
    await assert.rejects(() => h.restore(), error => {
      assert.match(error.message, label === 'wrong active revision'
        ? /TEST_POLL_FENCE_EXCEEDED/u : /DEV057_PRINCIPAL_RECOVERY_INVALID/u)
      return true
    }, label)
    if (label === 'wrong active revision') {
      assert.equal(h.sleepCalls(), 4, 'a non-visible provider response is bounded by the test sleep fence')
    }
    assert.equal(h.mutations.length, 1, `${label} drift is rejected from provider readback`)
  }
})

test('native quiescence completes when provider normalizes MANUAL zero by dropping automatic max', async () => {
  const providerAfter = { ...manualZero, scaling: { scalingMode: 'MANUAL', manualInstanceCount: 0 } }
  const h = harness({ after: providerAfter })
  const result = await h.quiesce()
  assert.equal(h.mutations.length, 1)
  assert.deepEqual(result.service.scaling, providerAfter.scaling)
  assert.deepEqual(result.service.traffic, traffic)
  assert.deepEqual(result.service.template, baseline.template)
  const replay = harness({ before: providerAfter, after: providerAfter })
  const repeated = await replay.quiesce()
  assert.equal(replay.mutations.length, 0)
  assert.equal(repeated.operationRef, null)
  assert.deepEqual(repeated.service, providerAfter)
})