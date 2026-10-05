import { canonicalize, sha256 } from './dev012-production-migration-runner.mjs'
import { assertDev014PrincipalLifecycleV2Remediation } from './dev014-principal-lifecycle-release.mjs'
import { assertPrincipalOnlyRecoveryReadback } from './dev057-principal-only-release.mjs'
import { readPrincipalOnlyRepairBaseline } from './dev057-principal-forward-repair.mjs'

function fail() { throw new Error('DEV014_LIFECYCLE_QUIESCENCE_INVALID') }

// Called only after the existing owner deploy CLI has verified the full release
// prerequisites. --check and --prepare-only never call this mutation.
export async function executePrincipalLifecycleQuiescence({ profile, intent, values,
  sourceProof, controlReadback, transport }) {
  assertDev014PrincipalLifecycleV2Remediation(values.readiness, values.authorization)
  if (profile.application.id !== 'orgmaster' || profile.application.repository !== 'jedchang0308-jenfu/OrgMaster'
    || profile.application.branch !== 'master'
    || sourceProof?.status !== 'OFFICIAL_MERGED_PR_VERIFIED'
    || sourceProof.repository !== profile.application.repository || sourceProof.branch !== 'master'
    || sourceProof.sourceRevision !== intent.sourceRevision || sourceProof.branchProtected !== true
    || sourceProof.sourceTree !== values.sourceLock?.sourceTree
    || values.sourceLock?.sourceRevision !== intent.sourceRevision || values.sourceLock.clean !== true
    || values.sourceLock.status !== 'SOURCE_FROZEN' || values.sourceLock.remoteRevision !== intent.sourceRevision
    || sourceProof.reviewMode !== 'SOLO_MAINTAINER_NO_HUMAN_APPROVAL_REQUIRED'
    || sourceProof.rulesetId !== 24077876 || !sourceProof.requiredChecks?.includes('Production Source QC')) fail()
  const uri = `gs://${profile.artifact.releaseBucket}/control/active.json`
  const current = await transport.readBytes(uri, { prefixes: ['control'] })
  const control = JSON.parse(current.bytes.toString('utf8'))
  const { controlSha256, ...core } = control
  if (controlReadback?.ref?.uri !== uri || current.ref.sha256 !== controlReadback.ref.sha256
    || String(current.metadata.generation) !== String(controlReadback.metadata.generation)
    || controlSha256 !== sha256(canonicalize(core)) || control.state !== 'FINALIZED'
    || !['RELEASED', 'PRE_ACTIVATION_ABORTED', 'ROLLED_BACK'].includes(control.result) || control.ownerApplicationId !== 'orgmaster'
    || control.service !== 'orgmaster-prod' || control.controlBucket !== profile.artifact.releaseBucket
    || (control.result === 'RELEASED' && control.candidateRevision !== intent.previousRevision)
    || (control.result === 'PRE_ACTIVATION_ABORTED' && control.candidateRevision !== null)
    || (control.result === 'ROLLED_BACK' && control.previousRevision !== intent.previousRevision)) fail()
  const before = await transport.getService(profile)
  // ROLLED_BACK is never sufficient authority by itself. Reuse the existing
  // sealed forward-repair joins, exact maintenance image and completed owner
  // run proof; then quiesce that verified active baseline under a fresh CAS.
  let repair = null
  if (control.result === 'ROLLED_BACK') {
    repair = await readPrincipalOnlyRepairBaseline({ profile, transport,
      baselineIntentRef: intent.baselineIntentRef, service: before, control })
    if (!repair || repair.activeRevision !== intent.previousRevision) fail()
  }
  const recovery = intent.principalOnlyRecovery
  if (!recovery) fail()
  const proof = await transport.readJson(recovery.receiptRef, profile.artifact.releaseBucket, ['receipts'])
  const revision = await transport.getRevision(profile, recovery.revision)
  assertPrincipalOnlyRecoveryReadback({ intent, profile, proof: proof.value, service: before, revision })
  // Read again immediately before the service CAS. A different owner attempt
  // cannot be treated as this release's finalized baseline.
  const confirmed = await transport.readBytes(uri, { prefixes: ['control'] })
  if (confirmed.ref.sha256 !== current.ref.sha256
    || String(confirmed.metadata.generation) !== String(current.metadata.generation)) fail()
  const result = await transport.quiescePrincipalOnly({ profile, intent, proof: proof.value,
    deadlineAt: intent.deadlineAt, expectedEtag: before.etag })
  const service = result.service
  const receipt = { schemaVersion: 'orgmaster.principal-lifecycle-quiescence.v1',
    ownerApplicationId: 'orgmaster', sourceRevision: intent.sourceRevision,
    releaseId: intent.releaseId, baselineControlRef: current.ref,
    baselineControlGeneration: String(current.metadata.generation),
    recoveryRef: recovery.receiptRef, service: service.name, serviceUid: service.uid,
    previousRevision: intent.previousRevision, generation: String(service.generation),
    templateSha256: sha256(canonicalize(service.template)), scaling: service.scaling,
    traffic: service.traffic, providerOperationRef: result.operationRef,
    observedAt: transport.now(), status: 'MANUAL_ZERO_READ_BACK',
    databaseDrain: 'MIGRATION_PREFLIGHT_STILL_REQUIRED',
    ...(repair ? { repairBaselineIntentRef: intent.baselineIntentRef,
      repairTerminalRef: repair.terminalRef, repairRollbackRef: repair.rollbackRef,
      repairMigrationRef: repair.migrationRef, priorRecoveryRef: repair.recoveryRef } : {}) }
  return transport.putJson(`gs://${profile.artifact.releaseBucket}/receipts/releases/${intent.releaseId}/quiescence.json`,
    receipt, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
}
