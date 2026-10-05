import assert from 'node:assert/strict'
import test from 'node:test'
import { recoveryOperationBinding } from './dev057-principal-recovery-operator.mjs'
import {
  assertPrincipalOnlyRecoveryBinding,
  assertPrincipalOnlyRecoveryReadback,
  assertRecoveryProofReadback,
  assertPrincipalOnlyActivationReadback,
  principalOnlyActivationRequest,
  principalOnlyQuiescenceRequest,
  assertPrincipalOnlyQuiescenceReadback,
  principalOnlyMaintenanceRequest,
  assertPrincipalOnlyMaintenanceReadback,
  principalOnlyRollbackRevision,
} from './dev057-principal-only-release.mjs'

const serviceName = 'projects/jenfu-platform-prod/locations/asia-east1/services/orgmaster-prod'
const old = 'orgmaster-prod-legacy'
const recovery = 'orgmaster-prod-recovery'
const candidate = 'orgmaster-prod-abcdef123456'
const tag = 'candidate-abcdef123456'
const image = `asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster-recovery@sha256:${'a'.repeat(64)}`
const bucket = 'jenfu-platform-prod-orgmaster-release'
const intent = {
  sourceRevision: 'b'.repeat(40), previousRevision: old,
  principalOnlyRecovery: {
    revision: recovery, imageDigest: image, serviceUid: 'd65f379b-a342-4eb3-ba22-109aa5f368c5',
    receiptRef: { uri: `gs://${bucket}/receipts/releases/DEV057-PRINCIPAL-ONLY-RECOVERY/${'b'.repeat(40)}.json`, sha256: 'd'.repeat(64) },
  },
}
const profile = { artifact: { releaseBucket: bucket }, target: {
  projectId: 'jenfu-platform-prod', region: 'asia-east1', serviceName: 'orgmaster-prod',
}, runtime: { containerName: 'orgmaster' } }
const oldTraffic = { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: old, percent: 100 }
const candidateTraffic = { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: candidate, percent: 0, tag }
const recoveryTraffic = { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: recovery, percent: 100 }
const base = {
  name: serviceName, uid: 'd65f379b-a342-4eb3-ba22-109aa5f368c5', etag: 'etag-one', generation: '91',
  observedGeneration: '91', reconciling: false,
  terminalCondition: { state: 'CONDITION_SUCCEEDED' },
  scaling: { scalingMode: 'MANUAL', manualInstanceCount: 0 },
  traffic: [oldTraffic, candidateTraffic], trafficStatuses: [oldTraffic, candidateTraffic],
}
const proof = {
  schemaVersion: 'orgmaster.principal-only-recovery.v1',
  sourceRevision: intent.sourceRevision, projectId: 'jenfu-platform-prod',
  region: 'asia-east1', service: 'orgmaster-prod', serviceUid: base.uid,
  oldRevision: old, recoveryRevision: recovery, imageDigest: image, status: 'PASS',
}
const revision = {
  name: `${serviceName}/revisions/${recovery}`,
  conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }],
  containers: [{ name: 'orgmaster', image }],
}

test('operation-bound recovery readback rejects a mismatched immutable key or revision', () => {
  const operation = recoveryOperationBinding({ sourceRevision: intent.sourceRevision, serviceUid: base.uid, oldRevision: old })
  const binding = { ...intent.principalOnlyRecovery, revision: operation.revision,
    receiptRef: { ...intent.principalOnlyRecovery.receiptRef, uri: `gs://${bucket}/receipts/releases/DEV057-PRINCIPAL-ONLY-RECOVERY/${operation.receiptName}` } }
  const input = { sourceRevision: intent.sourceRevision, oldRevision: old, profile, binding,
    service: { ...base, traffic: [oldTraffic], trafficStatuses: [oldTraffic] },
    proof: { ...proof, recoveryRevision: operation.revision }, revision: { ...revision, name: `${serviceName}/revisions/${operation.revision}` } }
  assert.equal(assertRecoveryProofReadback(input), binding)
  assert.throws(() => assertRecoveryProofReadback({ ...input, binding: { ...binding,
    receiptRef: { ...binding.receiptRef, uri: binding.receiptRef.uri.replace(operation.receiptName, `${intent.sourceRevision}-${'0'.repeat(12)}.json`) } } }), /PRINCIPAL_RECOVERY_INVALID/u)
  assert.throws(() => assertRecoveryProofReadback({ ...input, binding: { ...binding, revision: recovery } }), /PRINCIPAL_RECOVERY_INVALID/u)
  for (const filename of ['proof.json', `${intent.sourceRevision}-unknown.json`, `${'e'.repeat(40)}.json`, `nested/${operation.receiptName}`]) {
    const invalid = { ...binding, receiptRef: { ...binding.receiptRef,
      uri: `gs://${bucket}/receipts/releases/DEV057-PRINCIPAL-ONLY-RECOVERY/${filename}` } }
    assert.throws(() => assertRecoveryProofReadback({ ...input, binding: invalid }), /PRINCIPAL_RECOVERY_INVALID/u)
  }
})

test('Principal-only recovery is source-bound and distinct from the old security revision', () => {
  assert.equal(assertPrincipalOnlyRecoveryBinding(intent, bucket).revision, recovery)
  assert.equal(principalOnlyRollbackRevision(intent), recovery)
  assert.equal(principalOnlyRollbackRevision({ previousRevision: old }), old)
  for (const broken of [
    { ...intent, principalOnlyRecovery: null },
    { ...intent, principalOnlyRecovery: { ...intent.principalOnlyRecovery, revision: old } },
    { ...intent, principalOnlyRecovery: { ...intent.principalOnlyRecovery, imageDigest: image.replace('orgmaster-recovery', 'orgmaster') } },
    { ...intent, principalOnlyRecovery: { ...intent.principalOnlyRecovery,
      receiptRef: { ...intent.principalOnlyRecovery.receiptRef, uri: `gs://${bucket}/receipts/other.json` } } },
  ]) assert.throws(() => assertPrincipalOnlyRecoveryBinding(broken, bucket), /DEV057_PRINCIPAL_RECOVERY_INVALID/u)
})

test('recovery proof joins the exact service, source, ready revision and immutable image', () => {
  const service = { ...base, traffic: [oldTraffic], trafficStatuses: [oldTraffic] }
  assert.equal(assertPrincipalOnlyRecoveryReadback({ intent, profile, proof, service, revision }).revision, recovery)
  assert.equal(assertRecoveryProofReadback({ sourceRevision: intent.sourceRevision,
    oldRevision: old, binding: intent.principalOnlyRecovery, profile, proof,
    service, revision }).revision, recovery)
  for (const changed of [
    { proof: { ...proof, sourceRevision: 'f'.repeat(40) } },
    { proof: { ...proof, imageDigest: image.replace('orgmaster-recovery', 'orgmaster') } },
    { service: { ...service, traffic: [oldTraffic, candidateTraffic] } },
    { service: { ...service, uid: 'replacement-service' } },
    { revision: { ...revision, containers: [{ name: 'orgmaster', image: image.replace(/a{64}$/u, 'e'.repeat(64)) }] } },
  ]) assert.throws(() => assertPrincipalOnlyRecoveryReadback({ intent, profile, proof, service, revision, ...changed }), /DEV057_PRINCIPAL_RECOVERY_INVALID/u)
})

test('activation request atomically replaces old default traffic while leaving the candidate tag', () => {
  const request = principalOnlyActivationRequest({ service: base, oldRevision: old,
    candidateRevision: candidate, candidateTag: tag, recoveryRevision: recovery })
  assert.deepEqual(Object.keys(request).sort(), ['etag', 'name', 'scaling', 'traffic'])
  assert.deepEqual(request.scaling, { scalingMode: 'AUTOMATIC', manualInstanceCount: null,
    maxInstanceCount: 1 })
  assert.deepEqual(request.traffic.map((row) => [row.revision, row.percent]), [[candidate, 100], [candidate, 0]])
  assert.equal(request.traffic.some((row) => row.revision === old || row.revision === recovery), false)
  for (const changed of [
    { scaling: { scalingMode: 'AUTOMATIC' } },
    { scaling: { scalingMode: 'MANUAL' } },
    { traffic: [oldTraffic, { ...candidateTraffic, tag: 'unknown' }] },
    { trafficStatuses: [oldTraffic] },
  ]) assert.throws(() => principalOnlyActivationRequest({ service: { ...base, ...changed },
    oldRevision: old, candidateRevision: candidate, candidateTag: tag,
    recoveryRevision: recovery }), /DEV057_PRINCIPAL_RECOVERY_INVALID/u)
})

test('activation accepts Cloud Run zero-percent tags omitted from configured and observed traffic', () => {
  const providerZeroTag = { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION',
    revision: candidate, tag, uri: 'https://candidate.example.invalid' }
  const providerBefore = { ...base,
    traffic: [oldTraffic, { revision: candidate, tag }],
    trafficStatuses: [oldTraffic, providerZeroTag] }
  const request = principalOnlyActivationRequest({ service: providerBefore,
    oldRevision: old, candidateRevision: candidate, candidateTag: tag,
    recoveryRevision: recovery })
  assert.equal(request.traffic[0].revision, candidate)
  const providerAfter = { ...providerBefore, etag: 'etag-two', generation: '92',
    observedGeneration: '92', scaling: { scalingMode: 'AUTOMATIC', maxInstanceCount: 1 },
    traffic: [{ revision: candidate, percent: 100 }, { revision: candidate, tag }],
    trafficStatuses: [{ revision: candidate, percent: 100, tag,
      uri: 'https://candidate.example.invalid' }] }
  assert.equal(assertPrincipalOnlyActivationReadback({ before: providerBefore,
    after: providerAfter, candidateRevision: candidate, candidateTag: tag,
    recoveryRevision: recovery }), providerAfter)
  for (const traffic of [
    [oldTraffic, providerZeroTag],
    [{ revision: candidate, percent: 100 }, { revision: candidate, tag, percent: 50 }],
  ]) assert.throws(() => assertPrincipalOnlyActivationReadback({ before: providerBefore,
    after: { ...providerAfter, traffic }, candidateRevision: candidate,
    candidateTag: tag, recoveryRevision: recovery }), /DEV057_PRINCIPAL_RECOVERY_INVALID/u)
})

test('activation readback rejects any legacy traffic and any incomplete resume', () => {
  const request = principalOnlyActivationRequest({ service: base, oldRevision: old,
    candidateRevision: candidate, candidateTag: tag, recoveryRevision: recovery })
  const after = { ...base, etag: 'etag-two', generation: '92', observedGeneration: '92',
    scaling: { scalingMode: 'AUTOMATIC', maxInstanceCount: 1 }, traffic: request.traffic,
    trafficStatuses: request.traffic }
  assert.equal(assertPrincipalOnlyActivationReadback({ before: base, after,
    candidateRevision: candidate, candidateTag: tag, recoveryRevision: recovery }), after)
  for (const changed of [
    { scaling: { scalingMode: 'MANUAL', manualInstanceCount: 0 } },
    { scaling: { scalingMode: 'AUTOMATIC', maxInstanceCount: 100 } },
    { traffic: [oldTraffic, candidateTraffic] },
    { trafficStatuses: [oldTraffic, candidateTraffic] },
    { uid: 'replacement-service' },
    { generation: '91' },
  ]) assert.throws(() => assertPrincipalOnlyActivationReadback({ before: base,
    after: { ...after, ...changed }, candidateRevision: candidate,
    candidateTag: tag, recoveryRevision: recovery }), /DEV057_PRINCIPAL_RECOVERY_INVALID/u)
})

test('activation matches exact traffic identities independently of provider row order', () => {
  for (const configured of [base.traffic, [...base.traffic].reverse()]) {
    for (const observed of [base.trafficStatuses, [...base.trafficStatuses].reverse()]) {
      const before = { ...base, traffic: configured, trafficStatuses: observed }
      const request = principalOnlyActivationRequest({ service: before, oldRevision: old,
        candidateRevision: candidate, candidateTag: tag, recoveryRevision: recovery })
      const after = { ...before, etag: 'etag-two', generation: '92', observedGeneration: '92',
        scaling: { scalingMode: 'AUTOMATIC', maxInstanceCount: 1 },
        traffic: [...request.traffic].reverse(), trafficStatuses: [...request.traffic].reverse() }
      assert.equal(assertPrincipalOnlyActivationReadback({ before, after,
        candidateRevision: candidate, candidateTag: tag, recoveryRevision: recovery }), after)
    }
  }
  for (const rows of [
    [oldTraffic, oldTraffic], [candidateTraffic, candidateTraffic],
    [oldTraffic, { ...candidateTraffic, tag: 'candidate-ffffffffffff' }],
    [oldTraffic, { ...candidateTraffic, revision: recovery }],
    [oldTraffic, { ...candidateTraffic, percent: 50 }],
    [oldTraffic, candidateTraffic, candidateTraffic],
  ]) assert.throws(() => principalOnlyActivationRequest({
    service: { ...base, trafficStatuses: rows }, oldRevision: old,
    candidateRevision: candidate, candidateTag: tag, recoveryRevision: recovery }),
    /PRINCIPAL_RECOVERY_INVALID/u)
})

test('quiescence request is own-service, etag-bound, and changes only scaling plus baseline traffic', () => {
  const baseline = { ...base, traffic: [oldTraffic], trafficStatuses: [oldTraffic],
    scaling: { scalingMode: 'AUTOMATIC', maxInstanceCount: 1 },
    ingress: 'INGRESS_TRAFFIC_INTERNAL_ONLY', defaultUriDisabled: true, invokerIamDisabled: false,
    template: { serviceAccount: 'orgmaster-runtime', containers: [{ name: 'orgmaster', image: 'baseline' }] } }
  const request = principalOnlyQuiescenceRequest({ service: baseline, oldRevision: old })
  assert.deepEqual(Object.keys(request).sort(), ['etag', 'name', 'scaling', 'traffic'])
  assert.equal(request.name, serviceName)
  assert.equal(request.etag, baseline.etag)
  assert.deepEqual(request.scaling, { scalingMode: 'MANUAL', manualInstanceCount: 0, maxInstanceCount: 1 })
  assert.deepEqual(request.traffic, [oldTraffic])
  assert.notEqual(request.traffic[0], baseline.traffic[0])

  for (const invalid of [
    { ...baseline, name: 'projects/jenfu-platform-prod/locations/asia-east1/services/platform-prod' },
    { ...baseline, uid: '' },
    { ...baseline, etag: '' },
    { ...baseline, traffic: [candidateTraffic], trafficStatuses: [candidateTraffic] },
    { ...baseline, trafficStatuses: [oldTraffic, candidateTraffic] },
    { ...baseline, generation: '92', observedGeneration: '91' },
    { ...baseline, scaling: { scalingMode: 'MANUAL', manualInstanceCount: 1 } },
  ]) assert.throws(() => principalOnlyQuiescenceRequest({ service: invalid, oldRevision: old }), /DEV057_PRINCIPAL_RECOVERY_INVALID/u)
})

test('quiescence readback requires settled MANUAL 0 and preserves owner identity, revision, template, entrypoint and stable scaling', () => {
  const before = { ...base, traffic: [oldTraffic], trafficStatuses: [oldTraffic],
    scaling: { scalingMode: 'AUTOMATIC', maxInstanceCount: 1 },
    ingress: 'INGRESS_TRAFFIC_INTERNAL_ONLY', defaultUriDisabled: true, invokerIamDisabled: false,
    template: { serviceAccount: 'orgmaster-runtime', containers: [{ name: 'orgmaster', image: 'baseline' }] } }
  const after = { ...before, etag: 'etag-two', generation: '92', observedGeneration: '92',
    scaling: { scalingMode: 'MANUAL', manualInstanceCount: 0, maxInstanceCount: 1 } }
  assert.equal(assertPrincipalOnlyQuiescenceReadback({ before, after, oldRevision: old }), after)
  const changed = [
    { uid: '11111111-2222-4333-8444-555555555555' },
    { name: 'projects/jenfu-platform-prod/locations/asia-east1/services/platform-prod' },
    { generation: '90', observedGeneration: '90' },
    { generation: '92', observedGeneration: '91' },
    { scaling: { scalingMode: 'MANUAL', manualInstanceCount: 1, maxInstanceCount: 1 } },
    { scaling: { scalingMode: 'MANUAL', manualInstanceCount: 0, maxInstanceCount: 2 } },
    { traffic: [{ ...oldTraffic, revision: recovery }], trafficStatuses: [{ ...oldTraffic, revision: recovery }] },
    { trafficStatuses: [{ ...oldTraffic, revision: recovery }] },
    { template: { serviceAccount: 'other-runtime', containers: [{ name: 'orgmaster', image: 'baseline' }] } },
    { ingress: 'INGRESS_TRAFFIC_ALL' },
    { defaultUriDisabled: false },
    { invokerIamDisabled: true },
  ]
  for (const drift of changed) assert.throws(() => assertPrincipalOnlyQuiescenceReadback({
    before, after: { ...after, ...drift }, oldRevision: old,
  }), /DEV057_PRINCIPAL_RECOVERY_INVALID/u)
})

test('Principal-only maintenance request pins only the recovery revision and restores explicit automatic max-one scaling', () => {
  const before = { ...base, scaling: { scalingMode: 'MANUAL', manualInstanceCount: '0', maxInstanceCount: 1 },
    traffic: [oldTraffic], trafficStatuses: [oldTraffic] }
  const request = principalOnlyMaintenanceRequest({ service: before, intent })
  assert.deepEqual(request, {
    name: serviceName, etag: before.etag,
    scaling: { scalingMode: 'AUTOMATIC', manualInstanceCount: null, maxInstanceCount: 1 },
    traffic: [recoveryTraffic],
  })

  const after = { ...before, etag: 'etag-maintenance', generation: '92', observedGeneration: '92',
    scaling: { scalingMode: 'AUTOMATIC', manualInstanceCount: null, maxInstanceCount: 1 },
    traffic: [recoveryTraffic], trafficStatuses: [recoveryTraffic] }
  assert.equal(assertPrincipalOnlyMaintenanceReadback({ before, after, intent }), after)
})

test('Principal-only maintenance readback is idempotent and rejects wrong identity, revision, generation or service drift', () => {
  const active = { ...base, scaling: { scalingMode: 'AUTOMATIC', maxInstanceCount: 1 },
    traffic: [recoveryTraffic], trafficStatuses: [recoveryTraffic] }
  assert.equal(assertPrincipalOnlyMaintenanceReadback({ before: active, after: active, intent }), active)

  const before = { ...base, scaling: { scalingMode: 'MANUAL', manualInstanceCount: 0, maxInstanceCount: 1 },
    traffic: [oldTraffic], trafficStatuses: [oldTraffic] }
  const after = { ...before, generation: '92', observedGeneration: '92',
    scaling: { scalingMode: 'AUTOMATIC', manualInstanceCount: null, maxInstanceCount: 1 },
    traffic: [recoveryTraffic], trafficStatuses: [recoveryTraffic] }
  const invalid = [
    { ...before, name: 'projects/jenfu-platform-prod/locations/asia-east1/services/platform-prod' },
    { ...after, uid: '11111111-2222-4333-8444-555555555555' },
    { ...after, generation: '90', observedGeneration: '90' },
    { ...after, scaling: { ...after.scaling, maxInstanceCount: 2 } },
    { ...after, traffic: [oldTraffic], trafficStatuses: [oldTraffic] },
    { ...after, template: { ...before.template, serviceAccount: 'other-runtime' } },
    { ...after, ingress: 'INGRESS_TRAFFIC_INTERNAL_ONLY' },
  ]
  for (const service of invalid) {
    assert.throws(() => assertPrincipalOnlyMaintenanceReadback({ before, after: service, intent }))
  }
  assert.throws(() => principalOnlyMaintenanceRequest({
    service: { ...active, traffic: [oldTraffic], trafficStatuses: [oldTraffic] }, intent,
  }), /DEV057_PRINCIPAL_RECOVERY_INVALID/u)
})

test('quiescence accepts Cloud Run omitting the automatic ceiling only after settled MANUAL zero', () => {
  const before = { ...base, traffic: [oldTraffic], trafficStatuses: [oldTraffic],
    scaling: { scalingMode: 'AUTOMATIC', maxInstanceCount: 1 } }
  const after = { ...before, generation: '92', observedGeneration: '92',
    scaling: { scalingMode: 'MANUAL', manualInstanceCount: 0 } }
  assert.equal(assertPrincipalOnlyQuiescenceReadback({ before, after, oldRevision: old }), after)
  for (const invalid of [
    { scalingMode: 'MANUAL', manualInstanceCount: 1 },
    { scalingMode: 'MANUAL', manualInstanceCount: 0, maxInstanceCount: 2 },
    { scalingMode: 'MANUAL', manualInstanceCount: 0, minInstanceCount: 1 },
  ]) assert.throws(() => assertPrincipalOnlyQuiescenceReadback({ before,
    after: { ...after, scaling: invalid }, oldRevision: old }), /DEV057_PRINCIPAL_RECOVERY_INVALID/u)
  const extraBefore = { ...before, scaling: { ...before.scaling, minInstanceCount: 1 } }
  assert.throws(() => assertPrincipalOnlyQuiescenceReadback({ before: extraBefore,
    after, oldRevision: old }), /DEV057_PRINCIPAL_RECOVERY_INVALID/u)
  const manualBefore = { ...before, scaling: { scalingMode: 'MANUAL', manualInstanceCount: 0, maxInstanceCount: 1 } }
  assert.throws(() => assertPrincipalOnlyQuiescenceReadback({ before: manualBefore,
    after, oldRevision: old }), /DEV057_PRINCIPAL_RECOVERY_INVALID/u)
})