import { assertImmutableRef, assertRuntimeConfig, canonicalize, sha256 } from './dev012-owner-release-runtime.mjs'
import { assertPrincipalOnlyRecoveryBinding } from './dev057-principal-only-release.mjs'
import { assertLifecycleSchedulerReadback } from './dev014-lifecycle-scheduler-contract.mjs'

// Machine execution bindings for the already-authorized DEV-014 owner correction.
// The human authorization envelope is unchanged; this is not a new approval gate.
export const DEV014_PRINCIPAL_LIFECYCLE_V2_REMEDIATION = Object.freeze({
  kind: 'PRINCIPAL_LIFECYCLE_V2',
  migrationVersion: 'dev014-orgmaster-031',
  migrationPath: 'db/migrations/031_dev014_principal_lifecycle_v2.sql',
  sourceSha256: '586a7d829041272c67df31f9d9d6531dfb16497dfdb780be954bb05e259d8ab7',
  appliedSha256: '676c231bf2f6f31d9fc153603b8429894fa0e1b0d1adb4fedc07a103d87295b9',
  contractIds: ['orgmaster.workload-principals.v1', 'orgmaster.principal-lifecycle.v2'],
  consumerApplicationId: 'platform',
  triggerDisposition: 'DISABLED_UNTIL_CONSUMER_AND_PRODUCT_SCHEDULER_READY',
})

export const DEV014_PLATFORM_LIFECYCLE_V2_CONSUMER = Object.freeze({
  migrationVersion:'dev010-n1c-platform-011',
  migrationPath:'db/migrations/011_dev014_principal_lifecycle_receipt_v2.sql',
  sourceSha256:'d176d9251dfeca101bb08b7e49804fd7ba646bd2d4400f3370c3637e1f717f85',
  appliedSha256:'877e29aa680039f205484c730f5952177cbfeb9ba76ac69cdaae0118df084b80',
})

function fail(code) { throw Object.assign(new Error(code), { code }) }
const same = (a, b) => canonicalize(a) === canonicalize(b)

/** The operator reads both owners before creating the own immutable capsule.
 * CI validates that source-bound attestation without gaining sibling IAM.
 * Scheduler stays PAUSED through all ten owner stages; fresh operator reads
 * both owners again before resume. This is a runtime-only false -> true slice. */
export function assertDev014PrincipalLifecycleEnablement({profile,intent,readiness,authorization,before,after}) {
  const value=readiness?.enablement
  const {receiptSha256,...core}=value??{}
  const source=value?.sourceProof
  const field='ORGMASTER_PRINCIPAL_LIFECYCLE_ENABLED'
  if (readiness?.schemaVersion !== 'orgmaster.routine-release-readiness.v1'
    || authorization?.schemaVersion !== 'orgmaster.routine-release-authorization.v1'
    || authorization.authorizationBasis !== 'OPERATOR_INVOKED_DEPLOY_PRODUCTION'
    || [readiness,authorization].some(row=>row.devId!=='DEV-014'||row.slice!=='014-PRINCIPAL-LIFECYCLE-ENABLE'
      ||row.sourceRevision!==intent.sourceRevision||!same(row.baselineIntentRef,intent.baselineIntentRef))
    || !same(value,authorization.enablement) || receiptSha256!==sha256(canonicalize(core))
    || value.schemaVersion!=='orgmaster.principal-lifecycle-activation-prerequisites.v1'
    || value.status!=='PROVIDER_PREREQUISITES_READ_BACK' || value.sourceRevision!==intent.sourceRevision
    || value.field!==field||value.from!=='false'||value.to!=='true'
    || source?.sourceRevision!==intent.sourceRevision||source.repository!=='jedchang0308-jenfu/OrgMaster'
    || source.branch!=='master'||source.branchProtected!==true||source.rulesetId!==24077876
    || source.status!=='OFFICIAL_MERGED_PR_VERIFIED'||source.reviewMode!=='SOLO_MAINTAINER_NO_HUMAN_APPROVAL_REQUIRED'
    || !source.requiredChecks?.includes('Production Source QC')
    || value.scheduler?.state!=='PAUSED'
    || value.scheduler.config?.name!=='projects/jenfu-platform-prod/locations/asia-east1/jobs/orgmaster-prod-managed-identity-lifecycle'
    || !Array.isArray(value.owners)||!same(value.owners.map(row=>row.owner),['orgmaster','platform'])) fail('DEV014_PRINCIPAL_LIFECYCLE_ENABLEMENT_INVALID')
  const {readbackSha256,...snapshot}=value.scheduler
  if(readbackSha256!==sha256(canonicalize(snapshot)))fail('DEV014_PRINCIPAL_LIFECYCLE_ENABLEMENT_INVALID')
  assertLifecycleSchedulerReadback({...value.scheduler.config,state:value.scheduler.state},['PAUSED'])
  for (const [index,owner] of ['orgmaster','platform'].entries()) {
    const row=value.owners[index],binding=index===0?DEV014_PRINCIPAL_LIFECYCLE_V2_REMEDIATION:DEV014_PLATFORM_LIFECYCLE_V2_CONSUMER
    const bucket=`jenfu-platform-prod-${owner}-release`
    for(const ref of [row.ownerIntentRef,row.nativeMigrationRef])assertImmutableRef(ref,bucket,['receipts'])
    assertImmutableRef(row.controlRef,bucket,['control'])
    if (!row.serviceUid||!row.serviceEtag||row.ledgerCount!==(index===0?31:11)
      || !/^[a-f0-9]{40}$/u.test(row.sourceRevision??'')
      || !/^[a-f0-9]{64}$/u.test(row.migrationManifestSha256??'')
      || !same([row.migrationVersion,row.sourceSha256,row.appliedSha256],[binding.migrationVersion,binding.sourceSha256,binding.appliedSha256])
      || !new RegExp(`^${index===0?'orgmaster-prod':'jenfu-platform-prod'}-[a-z0-9-]+$`,'u').test(row.revision??'')
      || !new RegExp(`^asia-east1-docker\\.pkg\\.dev/jenfu-platform-prod/${owner}-release/${owner}@sha256:[a-f0-9]{64}$`,'u').test(row.artifactDigest??'')) fail('DEV014_PRINCIPAL_LIFECYCLE_ENABLEMENT_INVALID')
  }
  if(!same(value.owners[0].ownerIntentRef,intent.baselineIntentRef)||value.owners[0].revision!==intent.previousRevision)
    fail('DEV014_PRINCIPAL_LIFECYCLE_ENABLEMENT_BASELINE_CHANGED')
  if (after) {
    if (after.plainEnvironment?.[field]!=='true')fail('DEV014_PRINCIPAL_LIFECYCLE_ENABLEMENT_RUNTIME_INVALID')
    if (before && (before.plainEnvironment?.[field]!=='false'
      ||!same(after.plainEnvironment,{...before.plainEnvironment,[field]:'true'})
      ||!same(after.secretVersions,before.secretVersions)))fail('DEV014_PRINCIPAL_LIFECYCLE_ENABLEMENT_RUNTIME_INVALID')
    assertRuntimeConfig(profile,after)
  }
  return {releaseMode:'DEV014_PRINCIPAL_LIFECYCLE_ENABLEMENT',enablement:value}
}

// 031 retires the writer used by the previous application image. Applying it
// requires the existing Principal-only recovery path and quiesced old runtime;
// a traffic rollback to the V1 writer is not a compatible recovery.
export function assertDev014PrincipalLifecycleContainment(intent, profile, service) {
  const recovery = assertPrincipalOnlyRecoveryBinding(intent, profile.artifact.releaseBucket)
  const exactBaseline = rows => Array.isArray(rows) && rows.length === 1
    && rows[0].revision === intent.previousRevision && Number(rows[0].percent) === 100
    && rows[0].tag == null && rows[0].latestRevision !== true
  if (!recovery || service?.name !== `projects/${profile.target.projectId}/locations/${profile.target.region}/services/${profile.target.serviceName}`
    || service.uid !== recovery.serviceUid || service.reconciling === true
    || service.terminalCondition?.state !== 'CONDITION_SUCCEEDED'
    || service.generation == null || String(service.observedGeneration) !== String(service.generation)
    || service.scaling?.scalingMode !== 'MANUAL' || ![0, '0'].includes(service.scaling.manualInstanceCount)
    || !exactBaseline(service.traffic) || !exactBaseline(service.trafficStatuses)) {
    fail('DEV014_PRINCIPAL_LIFECYCLE_CONTAINMENT_REQUIRED')
  }
  return recovery
}

export function assertDev014PrincipalLifecycleRuntimeGuard(profile, before, after) {
  const field = 'ORGMASTER_PRINCIPAL_LIFECYCLE_ENABLED'
  const from = before?.plainEnvironment?.[field]
  if (![undefined, 'false'].includes(from) || after?.plainEnvironment?.[field] !== 'false'
    || !same(after.plainEnvironment, { ...before?.plainEnvironment, [field]: 'false' })
    || !same(after.secretVersions, before?.secretVersions)) fail('DEV014_PRINCIPAL_LIFECYCLE_RUNTIME_GUARD_INVALID')
  assertRuntimeConfig(profile, after)
  return after
}

export function assertDev014PrincipalLifecycleV2Remediation(readiness, authorization) {
  const remediation = DEV014_PRINCIPAL_LIFECYCLE_V2_REMEDIATION
  if (authorization?.schemaVersion !== 'orgmaster.routine-release-authorization.v1'
    || authorization.authorizationBasis !== 'OPERATOR_INVOKED_DEPLOY_PRODUCTION'
    || authorization.devId !== 'DEV-014' || authorization.slice !== '014-PRINCIPAL-LIFECYCLE-V2'
    || readiness?.schemaVersion !== 'orgmaster.routine-release-readiness.v1'
    || readiness.devId !== 'DEV-014' || readiness.slice !== '014-PRINCIPAL-LIFECYCLE-V2'
    || !same(authorization.remediation, remediation) || !same(readiness.remediation, remediation)) fail('DEV014_PRINCIPAL_LIFECYCLE_V2_AUTHORITY_INVALID')
  return { releaseMode: 'DEV014_PRINCIPAL_LIFECYCLE_V2_REMEDIATION', remediation }
}

export function assertDev014PrincipalLifecycleV2Append(before, after) {
  const staticInputs = ({ sourceRevision, manifestSha256, entries, ...inputs }) => inputs
  const migrationInputs = ({ sourceRevision, manifestSha256, ...inputs }) => inputs
  const remediation = DEV014_PRINCIPAL_LIFECYCLE_V2_REMEDIATION
  if (!same(staticInputs(before), staticInputs(after)) || before.baselineCount !== 10
    || before.entries?.length !== 30 || after.entries?.length !== 31
    || !same(before.entries, after.entries.slice(0, 30))) fail('DEV014_PRINCIPAL_LIFECYCLE_V2_APPEND_INVALID')
  const entry = after.entries[30]
  if (entry.order !== 31 || !same([entry.version, entry.path, entry.sourceSha256, entry.appliedSha256],
    [remediation.migrationVersion, remediation.migrationPath, remediation.sourceSha256, remediation.appliedSha256])) fail('DEV014_PRINCIPAL_LIFECYCLE_V2_APPEND_INVALID')
  return { migrationDisposition: 'FORWARD_APPLY', pendingMigrationCount: 1, migrationInputsSha256: sha256(canonicalize(migrationInputs(after))) }
}
