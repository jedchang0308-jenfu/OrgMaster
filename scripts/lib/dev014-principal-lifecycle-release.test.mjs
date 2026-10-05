import assert from 'node:assert/strict'
import test from 'node:test'
import { assertDev014PrincipalLifecycleContainment } from './dev014-principal-lifecycle-release.mjs'

const bucket = 'jenfu-platform-prod-orgmaster-release'
const previousRevision = 'orgmaster-prod-before-lifecycle'
const recoveryRevision = 'orgmaster-prod-maintenance-abcdef123456'
const serviceUid = 'd65f379b-a342-4eb3-ba22-109aa5f368c5'
const profile = {
  artifact: { releaseBucket: bucket },
  target: { projectId: 'jenfu-platform-prod', region: 'asia-east1', serviceName: 'orgmaster-prod' },
}
const intent = {
  previousRevision,
  principalOnlyRecovery: {
    revision: recoveryRevision,
    imageDigest: `asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster-recovery@sha256:${'9'.repeat(64)}`,
    serviceUid,
    receiptRef: {
      uri: `gs://${bucket}/receipts/releases/DEV057-PRINCIPAL-ONLY-RECOVERY/${'a'.repeat(40)}.json`,
      sha256: 'b'.repeat(64),
    },
  },
}
const traffic = [{ type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: previousRevision, percent: 100 }]
const service = {
  name: 'projects/jenfu-platform-prod/locations/asia-east1/services/orgmaster-prod',
  uid: serviceUid,
  reconciling: false,
  generation: '3',
  observedGeneration: '3',
  terminalCondition: { state: 'CONDITION_SUCCEEDED' },
  scaling: { scalingMode: 'MANUAL', manualInstanceCount: 0 },
  traffic,
  trafficStatuses: traffic,
}

test('DEV-014 lifecycle containment requires the bound Principal-only maintenance recovery', () => {
  assert.equal(assertDev014PrincipalLifecycleContainment(intent, profile, service), intent.principalOnlyRecovery)
  assert.throws(() => assertDev014PrincipalLifecycleContainment({ previousRevision }, profile, service), /DEV014_PRINCIPAL_LIFECYCLE_CONTAINMENT_REQUIRED/u)
})

test('DEV-014 lifecycle containment rejects nonzero instances and service UID or traffic drift', () => {
  assert.throws(() => assertDev014PrincipalLifecycleContainment(intent, profile, {
    ...service, scaling: { scalingMode: 'MANUAL', manualInstanceCount: 1 },
  }), /DEV014_PRINCIPAL_LIFECYCLE_CONTAINMENT_REQUIRED/u)
  assert.throws(() => assertDev014PrincipalLifecycleContainment(intent, profile, {
    ...service, uid: '11111111-2222-4333-8444-555555555555',
  }), /DEV014_PRINCIPAL_LIFECYCLE_CONTAINMENT_REQUIRED/u)
  assert.throws(() => assertDev014PrincipalLifecycleContainment(intent, profile, {
    ...service, trafficStatuses: [{ ...traffic[0], revision: recoveryRevision }],
  }), /DEV014_PRINCIPAL_LIFECYCLE_CONTAINMENT_REQUIRED/u)
})
