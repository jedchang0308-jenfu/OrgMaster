import { canonicalize } from './dev012-production-migration-runner.mjs'
import { recoveryOperationBinding } from './dev057-principal-recovery-operator.mjs'

const SERVICE = 'projects/jenfu-platform-prod/locations/asia-east1/services/orgmaster-prod'
const PRODUCTION_MAX_INSTANCES = 1
const IMAGE = /^asia-east1-docker\.pkg\.dev\/jenfu-platform-prod\/orgmaster-release\/orgmaster-recovery@sha256:[a-f0-9]{64}$/u
const REVISION = /^orgmaster-prod-[a-z0-9-]+$/u
const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u

function fail() { throw new Error('DEV057_PRINCIPAL_RECOVERY_INVALID') }
function exactKeys(value, keys) {
  return value && !Array.isArray(value) && typeof value === 'object' &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
}
function exactTraffic(rows, revision, tag = null, percent = 100) {
  return Array.isArray(rows) && rows.length === 1 &&
    rows[0]?.revision === revision && Number(rows[0]?.percent) === percent &&
    rows[0]?.latestRevision !== true &&
    (tag === null ? rows[0]?.tag === undefined : rows[0]?.tag === tag)
}
function exactZeroTag(rows, revision, tag) {
  return Array.isArray(rows) && rows.length === 1 &&
    rows[0]?.revision === revision && rows[0]?.tag === tag &&
    rows[0]?.latestRevision !== true &&
    (rows[0]?.percent == null || Number(rows[0].percent) === 0)
}
function zeroInstances(value) {
  return value === 0 || value === '0'
}

export function assertPrincipalOnlyRecoveryBinding(intent, bucket) {
  if (!Object.hasOwn(intent ?? {}, 'principalOnlyRecovery')) return null
  return assertRecoveryBindingShape(intent.principalOnlyRecovery, bucket, intent.previousRevision)
}

function assertRecoveryBindingShape(binding, bucket, oldRevision) {
  if (!exactKeys(binding,
    ['revision', 'imageDigest', 'serviceUid', 'receiptRef']) ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(binding.serviceUid ?? '') ||
    !REVISION.test(oldRevision ?? '') ||
    !REVISION.test(binding.revision ?? '') ||
    binding.revision === oldRevision ||
    !IMAGE.test(binding.imageDigest ?? '') ||
    !exactKeys(binding.receiptRef, ['uri', 'sha256']) ||
    !binding.receiptRef.uri.startsWith(`gs://${bucket}/receipts/releases/DEV057-PRINCIPAL-ONLY-RECOVERY/`) ||
    binding.receiptRef.uri !== `gs://${bucket}/receipts/releases/DEV057-PRINCIPAL-ONLY-RECOVERY/${binding.receiptRef.uri.split('/').at(-1)}` ||
    !/^[a-f0-9]{40}(?:-[a-f0-9]{12})?\.json$/u.test(binding.receiptRef.uri.split('/').at(-1)) ||
    !H64.test(binding.receiptRef.sha256 ?? '')) fail()
  return binding
}

export function principalOnlyRollbackRevision(intent) {
  return intent.principalOnlyRecovery?.revision ?? intent.previousRevision
}

/** Preserve the baseline revision and template while stopping its instances.
 * The owner operator separately verifies the exact recovery proof before this
 * request; the release's prepare/migrate stages require the resulting fence. */
export function principalOnlyQuiescenceRequest({ service, oldRevision }) {
  if (service?.name !== SERVICE || !service.etag || !service.uid
    || service.reconciling === true || service.terminalCondition?.state !== 'CONDITION_SUCCEEDED'
    || service.generation == null || String(service.observedGeneration) !== String(service.generation)
    || !REVISION.test(oldRevision ?? '') || !exactTraffic(service.traffic, oldRevision)
    || !exactTraffic(service.trafficStatuses, oldRevision)
    || !['AUTOMATIC','MANUAL'].includes(service.scaling?.scalingMode)
    || (service.scaling.scalingMode === 'MANUAL' && !zeroInstances(service.scaling.manualInstanceCount))) fail()
  return { name: service.name, etag: service.etag,
    scaling: { ...service.scaling, scalingMode: 'MANUAL', manualInstanceCount: 0 },
    traffic: service.traffic.map(row => ({ ...row })) }
}

export function assertPrincipalOnlyQuiescenceReadback({ before, after, oldRevision }) {
  principalOnlyQuiescenceRequest({ service: before, oldRevision })
  if (after?.name !== before.name || after.uid !== before.uid || after.reconciling === true
    || after.terminalCondition?.state !== 'CONDITION_SUCCEEDED'
    || String(after.observedGeneration) !== String(after.generation)
    || Number(after.generation) < Number(before.generation)
    || (before.scaling?.scalingMode !== 'MANUAL' && Number(after.generation) <= Number(before.generation))
    || after.scaling?.scalingMode !== 'MANUAL' || !zeroInstances(after.scaling.manualInstanceCount)
    || !exactTraffic(after.traffic, oldRevision) || !exactTraffic(after.trafficStatuses, oldRevision)
    || canonicalize(after.template) !== canonicalize(before.template)
    || ['ingress','defaultUriDisabled','invokerIamDisabled'].some(field => after[field] !== before[field])) fail()
  const stable = value => { const { scalingMode, manualInstanceCount, ...fields } = value ?? {}; return fields }
  const beforeStable = stable(before.scaling)
  const afterStable = stable(after.scaling)
  // Cloud Run drops the automatic ceiling when the service enters MANUAL 0.
  // Accept only that omitted field; a returned different ceiling or any other
  // scaling drift still fails. Activation separately requires maxInstances=1.
  if (before.scaling.scalingMode === 'AUTOMATIC' && !Object.hasOwn(afterStable, 'maxInstanceCount')) {
    delete beforeStable.maxInstanceCount
  }
  if (canonicalize(afterStable) !== canonicalize(beforeStable)) fail()
  return after
}

export function assertPrincipalOnlyRecoveryReadback({ intent, profile, proof, service, revision }) {
  const binding = assertPrincipalOnlyRecoveryBinding(intent, profile.artifact.releaseBucket)
  if (!binding) fail()
  return assertRecoveryProofReadback({ sourceRevision: intent.sourceRevision,
    oldRevision: intent.previousRevision, binding, profile, proof, service, revision })
}

/** A failed lifecycle install may serve only the proof-bound maintenance image.
 * It has no database connection or business write surface. */
export function principalOnlyMaintenanceRequest({ service, intent }) {
  const binding = assertPrincipalOnlyRecoveryBinding(intent, 'jenfu-platform-prod-orgmaster-release')
  const active = service?.traffic?.[0]?.revision
  if (!binding || service?.name !== SERVICE || service.uid !== binding.serviceUid || !service.etag
    || service.reconciling === true || service.terminalCondition?.state !== 'CONDITION_SUCCEEDED'
    || service.generation == null || String(service.observedGeneration) !== String(service.generation)
    || ![intent.previousRevision, binding.revision].includes(active)
    || !exactTraffic(service.traffic, active) || !exactTraffic(service.trafficStatuses, active)
    || !(service.scaling?.scalingMode === 'MANUAL' && zeroInstances(service.scaling.manualInstanceCount)
      || service.scaling?.scalingMode === 'AUTOMATIC' && active === binding.revision)) fail()
  return { name: service.name, etag: service.etag,
    scaling: { scalingMode: 'AUTOMATIC', manualInstanceCount: null, maxInstanceCount: PRODUCTION_MAX_INSTANCES },
    traffic: [{ type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: binding.revision, percent: 100 }] }
}

export function assertPrincipalOnlyMaintenanceReadback({ before, after, intent }) {
  const request = principalOnlyMaintenanceRequest({ service: before, intent })
  if (after?.name !== before.name || after.uid !== before.uid || after.reconciling === true
    || after.terminalCondition?.state !== 'CONDITION_SUCCEEDED' || after.generation == null
    || String(after.observedGeneration) !== String(after.generation)
    || Number(after.generation) < Number(before.generation)
    || (before.scaling?.scalingMode === 'MANUAL' && Number(after.generation) <= Number(before.generation))
    || after.scaling?.scalingMode !== 'AUTOMATIC'
    || !(after.scaling.manualInstanceCount == null || zeroInstances(after.scaling.manualInstanceCount))
    || Number(after.scaling.maxInstanceCount) !== PRODUCTION_MAX_INSTANCES
    || !exactTraffic(after.traffic, request.traffic[0].revision)
    || !exactTraffic(after.trafficStatuses, request.traffic[0].revision)
    || canonicalize(after.template) !== canonicalize(before.template)
    || ['ingress','defaultUriDisabled','invokerIamDisabled'].some(field => after[field] !== before[field])) fail()
  return after
}

export function assertRecoveryProofReadback({ sourceRevision, oldRevision, binding,
  profile, proof, service, revision, activeRevision = oldRevision }) {
  assertRecoveryBindingShape(binding, profile.artifact.releaseBucket, oldRevision)
  if (![oldRevision, binding.revision].includes(activeRevision)) fail()
  const filename = binding.receiptRef.uri.split('/').at(-1)
  if (/^[a-f0-9]{40}-[a-f0-9]{12}\.json$/u.test(filename)) {
    const operation = recoveryOperationBinding({ sourceRevision, serviceUid: binding.serviceUid, oldRevision })
    if (filename !== operation.receiptName || binding.revision !== operation.revision) fail()
  } else if (filename !== `${sourceRevision}.json`) fail()
  if (!exactKeys(proof, ['schemaVersion', 'sourceRevision',
    'projectId', 'region', 'service', 'serviceUid', 'oldRevision',
    'recoveryRevision', 'imageDigest', 'status']) ||
    proof.schemaVersion !== 'orgmaster.principal-only-recovery.v1' ||
    !H40.test(sourceRevision ?? '') || proof.sourceRevision !== sourceRevision ||
    proof.projectId !== profile.target.projectId || proof.region !== profile.target.region ||
    proof.service !== profile.target.serviceName || proof.serviceUid !== binding.serviceUid ||
    proof.serviceUid !== service?.uid ||
    proof.oldRevision !== oldRevision ||
    proof.recoveryRevision !== binding.revision ||
    proof.imageDigest !== binding.imageDigest || proof.status !== 'PASS' ||
    service?.name !== SERVICE || service?.reconciling === true ||
    service?.terminalCondition?.state !== 'CONDITION_SUCCEEDED' ||
    String(service?.observedGeneration) !== String(service?.generation) ||
    !exactTraffic(service.traffic, activeRevision) ||
    !exactTraffic(service.trafficStatuses, activeRevision) ||
    revision?.name !== `${SERVICE}/revisions/${binding.revision}` ||
    revision?.conditions?.find((row) => row.type === 'Ready')?.state !== 'CONDITION_SUCCEEDED' ||
    revision?.containers?.find((row) => row.name === profile.runtime.containerName)?.image !== binding.imageDigest) fail()
  return binding
}

export function principalOnlyActivationRequest({ service, oldRevision, candidateRevision,
  candidateTag, recoveryRevision }) {
  if (service?.name !== SERVICE || !service.etag || service.reconciling === true ||
    service.terminalCondition?.state !== 'CONDITION_SUCCEEDED' ||
    String(service.observedGeneration) !== String(service.generation) ||
    service.scaling?.scalingMode !== 'MANUAL' ||
    !zeroInstances(service.scaling?.manualInstanceCount) ||
    !REVISION.test(oldRevision ?? '') || !REVISION.test(candidateRevision ?? '') ||
    !REVISION.test(recoveryRevision ?? '') ||
    new Set([oldRevision, candidateRevision, recoveryRevision]).size !== 3 ||
    !/^candidate-[a-f0-9]{12}$/u.test(candidateTag ?? '')) fail()
  for (const rows of [service.traffic, service.trafficStatuses]) {
    if (!Array.isArray(rows) || rows.length !== 2 ||
      !exactTraffic([rows.find((row) => row.tag === undefined)], oldRevision) ||
      !exactZeroTag([rows.find((row) => row.tag === candidateTag)], candidateRevision, candidateTag)) fail()
  }
  return {
    name: service.name, etag: service.etag,
    scaling: { scalingMode: 'AUTOMATIC', manualInstanceCount: null,
      maxInstanceCount: PRODUCTION_MAX_INSTANCES },
    traffic: [
      { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: candidateRevision, percent: 100 },
      { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: candidateRevision, percent: 0, tag: candidateTag },
    ],
  }
}

export function assertPrincipalOnlyActivationReadback({ before, after,
  candidateRevision, candidateTag, recoveryRevision }) {
  if (after?.name !== SERVICE || after.uid !== before?.uid ||
    after.reconciling === true || after.terminalCondition?.state !== 'CONDITION_SUCCEEDED' ||
    String(after.observedGeneration) !== String(after.generation) ||
    Number(after.generation) <= Number(before.generation) ||
    after.scaling?.scalingMode !== 'AUTOMATIC' ||
    (after.scaling.manualInstanceCount != null && Number(after.scaling.manualInstanceCount) !== 0) ||
    Number(after.scaling.maxInstanceCount) !== PRODUCTION_MAX_INSTANCES ||
    !REVISION.test(recoveryRevision ?? '') ||
    !Array.isArray(after.traffic) || !Array.isArray(after.trafficStatuses) ||
    after.traffic.length !== 2 || after.trafficStatuses.length < 1 ||
    after.trafficStatuses.length > 2 ||
    !exactTraffic([after.traffic.find((row) => row.tag === undefined)], candidateRevision) ||
    !exactZeroTag([after.traffic.find((row) => row.tag === candidateTag)], candidateRevision, candidateTag) ||
    after.trafficStatuses.some((row) => row.revision !== candidateRevision ||
      ![undefined, candidateTag].includes(row.tag) ||
      !((row.percent == null && row.tag === candidateTag) || [0, 100].includes(Number(row.percent)))) ||
    after.trafficStatuses.filter((row) => Number(row.percent) === 100).length !== 1 ||
    after.traffic.some((row) => row.revision === recoveryRevision)) fail()
  return after
}
