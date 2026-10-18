#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { canonicalize, sha256, createOwnerTransport } from './lib/dev012-owner-release-runtime.mjs'
import { readGitAuthority } from './lib/dev012-owner-prerequisite-producer.mjs'
import { createGitSourceIdentity, readGitBlob } from './lib/dev012-owner-stage-executor.mjs'
import { verifyOfficialMergedSource } from './lib/dev012-official-source-review.mjs'
import { readRoutineBaseline } from './lib/dev040-routine-release.mjs'
import { buildMigrationToolImage } from './lib/dev040-tool-image-build.mjs'
import { createToolTerraform, terraformVariablesFromState } from './lib/dev040-tool-terraform.mjs'
import { assertToolOwner, assertToolRotationPlan, assertToolRotationState, sealToolEvidence,
  toolInfrastructureFingerprint, rotationAddresses, assertOrdinaryToolRotation, assertToolSeal, assertToolBuildProof } from './lib/dev040-tool-image-rotation.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
function fail(code) { throw Object.assign(new Error(`TOOL_ROTATION_${code}`), { code: `TOOL_ROTATION_${code}` }) }
const same = (a, b) => canonicalize(a) === canonicalize(b)
function capture(command, args) {
  const result = spawnSync(command, args, { cwd: root, windowsHide: true, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  if (result.error || result.status !== 0) fail('COMMAND_FAILED')
  return result.stdout.trim()
}
async function optionalJson(transport, uri, bucket) {
  if (!uri.startsWith(`gs://${bucket}/receipts/`)) fail('REF_INVALID')
  try {
    const read = await transport.readBytes(uri, { prefixes: ['receipts'] })
    return { ...read, value: JSON.parse(read.bytes.toString('utf8')) }
  } catch (error) {
    if (error.code === 'MISSING') return null
    throw error
  }
}
export function assertRequiredToolSourceQc(checks, revision) {
  const latest = (checks.check_runs ?? []).filter(check => check.name === 'Production Source QC'
    && check.app?.id === 15368 && check.head_sha === revision).sort((a, b) => b.id - a.id)[0]
  if (!Number.isSafeInteger(latest?.id) || latest.id < 1 || latest.status !== 'completed' || latest.conclusion !== 'success') fail('REQUIRED_SOURCE_QC_MISSING')
}
export async function executeToolImageRotation({ root, profile, git, sourceProof, transport, terraform,
  build = buildMigrationToolImage, apply = false, now = () => new Date().toISOString(),
  verifySource = () => readGitAuthority(root, profile), readBaseline = readRoutineBaseline,
  variablesFromState = terraformVariablesFromState }) {
  assertToolOwner(profile)
  if (sourceProof?.sourceRevision !== git.sourceRevision || sourceProof.status !== 'OFFICIAL_MERGED_PR_VERIFIED'
    || sourceProof.requiredSourceQc !== 'SUCCESS' || git.clean !== true || git.branch !== 'master') fail('OFFICIAL_SOURCE_REQUIRED')
  const bucket = profile.artifact.releaseBucket
  const prefix = `gs://${bucket}/receipts/tool-rotations/${git.sourceRevision}`
  const infraProfile = JSON.parse(readGitBlob(root, 'config/release/dev040-production-release-infra-plan.json', git.sourceRevision))
  const head = await transport.readBytes(`gs://${bucket}/control/active.json`, { prefixes: ['control'] })
  const control = JSON.parse(head.bytes.toString('utf8'))
  const { controlSha256, ...controlCore } = control
  if (controlSha256 !== sha256(canonicalize(controlCore)) || control.state !== 'FINALIZED' || control.result !== 'RELEASED'
    || control.ownerApplicationId !== 'orgmaster' || control.service !== 'orgmaster-prod') fail('CONTROL_NOT_RELEASED')
  const intentRead = await transport.readBytes(`gs://${bucket}/receipts/releases/${control.releaseId}/release-intent.json`, { prefixes: ['receipts'] })
  const baselineIntentRef = intentRead.ref
  const baseline = await readBaseline({ profile, transport, baselineIntentRef })
  if (baseline.intent.sourceRevision !== control.sourceRevision || baseline.activeRevision !== control.candidateRevision) fail('BASELINE_INVALID')
  const service = await transport.getService(profile)
  transport.assertServiceSettled(service); transport.assertCanonicalEntrypoint(profile, service)
  if (transport.effectiveRevision(service) !== baseline.activeRevision || [...(service.traffic ?? []), ...(service.trafficStatuses ?? [])].some(row => row.tag)) fail('BASELINE_INVALID')
  if (toolInfrastructureFingerprint(root, baseline.intent.sourceRevision) !== toolInfrastructureFingerprint(root, git.sourceRevision)) fail('INFRASTRUCTURE_SOURCE_CHANGED')
  const previousInfra = (await transport.readJson(baseline.intent.infraReceiptRef, bucket, ['receipts'])).value
  const previousImage = previousInfra.migrationRunnerDigest
  const controllerImage = previousInfra.controllerImageDigest
  const jobName = `projects/${profile.target.projectId}/locations/${profile.target.region}/jobs/orgmaster-prod-migration-runner`
  const readJob = () => transport.request(`https://run.googleapis.com/v2/${jobName}`)
  const put = (name, value) => transport.putJson(`${prefix}/${name}.json`, value, { bucket, prefix: 'receipts' })
  const sameControl = async () => {
    if (!same(await verifySource(), git)) fail('SOURCE_CHANGED')
    const current = await transport.readBytes(head.ref.uri, { prefixes: ['control'] })
    if (!current.bytes.equals(head.bytes) || String(current.metadata.generation) !== String(head.metadata.generation)) fail('CONTROL_CAS_CHANGED')
  }
  const existing = await optionalJson(transport, `${prefix}/app-infra.json`, bucket)
  if (existing) {
    await assertOrdinaryToolRotation({ root, profile, transport, intent: { sourceRevision: git.sourceRevision,
      infraReceiptRef: existing.ref, baselineIntentRef }, receipt: existing.value, baseline })
    return { status: 'APPLIED', reused: true, ref: existing.ref }
  }
  await terraform.initialize()
  const preparedRead = await optionalJson(transport, `${prefix}/prepared.json`, bucket)
  let prepared
  if (preparedRead) {
    prepared = preparedRead.value
    assertToolSeal(prepared)
    if (prepared.schemaVersion !== 'orgmaster.tool-image-rotation-prepared.v1'
      || prepared.sourceRevision !== git.sourceRevision || !same(prepared.baselineIntentRef, baselineIntentRef)
      || !same(prepared.baselineInfraRef, baseline.intent.infraReceiptRef)
      || prepared.baselineSourceRevision !== baseline.intent.sourceRevision || !same(prepared.sourceProof, sourceProof)
      || prepared.controlBaseline.sha256 !== head.ref.sha256 || prepared.controlGeneration !== String(head.metadata.generation)) fail('PREPARED_BASELINE_CHANGED')
  } else {
    const beforeState = await terraform.read()
    const manifest = beforeState.manifest
    if (manifest.migration_runner_digest !== previousImage || manifest.controller_image_digest !== controllerImage
      || manifest.foundation_manifest_sha256 !== previousInfra.foundationManifestSha256) fail('STATE_BASELINE_CHANGED')
    const variables = variablesFromState({ state: beforeState.stateMeta, profile, sourceRevision: git.sourceRevision, nextImage: previousImage })
    const readinessPlan = await terraform.plan({ variables })
    assertToolRotationPlan({ plan: readinessPlan.plan, infraProfile, previousImage, nextImage: previousImage, allowNoop: true })
    await sameControl()
    if (!apply) return { status: 'READY_FOR_IMAGE_BUILD', releaseAuthority: false, sourceRevision: git.sourceRevision,
      baselineIntentRef, addressCount: rotationAddresses(infraProfile).length, ddlExecuted: 0 }
    const buildResult = await build({ root, profile, sourceRevision: git.sourceRevision,
      sourceSha256: sha256(createGitSourceIdentity(root, git.sourceRevision)),
      releaseId: `ORGMASTER-TOOL-${git.sourceRevision.slice(0, 12).toUpperCase()}`, transport,
      deadlineAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() })
    const nextImage = buildResult.imageDigest
    const imagePlan = await terraform.plan({ variables: { ...variables, migration_runner_image_digest: nextImage } })
    const rotation = assertToolRotationPlan({ plan: imagePlan.plan, infraProfile, previousImage, nextImage })
    const freshState = await terraform.read()
    if (freshState.stateMeta.serial !== beforeState.stateMeta.serial || freshState.stateMeta.lineage !== beforeState.stateMeta.lineage) fail('STATE_CAS_CHANGED')
    const beforeJob = await readJob()
    if (beforeJob.name !== jobName || typeof beforeJob.uid !== 'string' || !beforeJob.uid
      || beforeJob.template?.template?.containers?.[0]?.image !== previousImage || beforeJob.reconciling === true
      || String(beforeJob.generation) !== String(beforeJob.observedGeneration)) fail('JOB_BASELINE_CHANGED')
    await sameControl()
    const [binary, plan, before, job, buildProof, controlSnapshot] = await Promise.all([
      transport.putBytes(`${prefix}/plan.bin`, imagePlan.binaryPlan, { bucket, prefix: 'receipts', contentType: 'application/octet-stream' }),
      put('plan', imagePlan.plan), put('before-state', beforeState), put('provider-job-before', beforeJob), put('build-proof', buildResult.buildProof),
      transport.putBytes(`${prefix}/control-baseline.json`, head.bytes, { bucket, prefix: 'receipts', contentType: 'application/json' }),
    ])
    prepared = sealToolEvidence({ schemaVersion: 'orgmaster.tool-image-rotation-prepared.v1', sourceRevision: git.sourceRevision,
      baselineIntentRef, baselineInfraRef: baseline.intent.infraReceiptRef, baselineSourceRevision: baseline.intent.sourceRevision,
      controlBaseline: head.ref, controlSnapshotRef: controlSnapshot.ref, controlGeneration: String(head.metadata.generation), sourceProof,
      previousImage, nextImage, controllerImage, foundationHash: manifest.foundation_manifest_sha256,
      beforeStateRef: before.ref, providerJobBeforeRef: job.ref, buildProofRef: buildProof.ref,
      binaryPlanRef: binary.ref, planJsonRef: plan.ref, imageRotation: { ...rotation, sourceRevision: git.sourceRevision, planJsonSha256: plan.ref.sha256 },
      beforeSerial: beforeState.stateMeta.serial, stateLineage: beforeState.stateMeta.lineage, observedAt: now() })
    await put('prepared', prepared)
  }
  if (!apply) return { status: 'PREPARED', releaseAuthority: false, sourceRevision: git.sourceRevision }
  const fence = await optionalJson(transport, `${prefix}/apply-attempt.json`, bucket)
  if (fence && (fence.value.sourceRevision !== git.sourceRevision || !same(fence.value.binaryPlanRef, prepared.binaryPlanRef)
    || fence.value.preparedReceiptSha256 !== prepared.receiptSha256 || fence.value.expectedStateSerial !== prepared.beforeSerial)) fail('APPLY_FENCE_INVALID')
  const [savedPlan, savedBuild] = await Promise.all([
    transport.readJson(prepared.planJsonRef, bucket, ['receipts']), transport.readJson(prepared.buildProofRef, bucket, ['receipts']),
  ])
  const rotation = assertToolRotationPlan({ plan: savedPlan.value, infraProfile, previousImage, nextImage: prepared.nextImage })
  if (!same(prepared.imageRotation, { ...rotation, sourceRevision: git.sourceRevision, planJsonSha256: prepared.planJsonRef.sha256 })
    || prepared.previousImage !== previousImage || prepared.controllerImage !== controllerImage
    || prepared.foundationHash !== previousInfra.foundationManifestSha256
    || savedPlan.value.variables?.source_revision?.value !== git.sourceRevision
    || savedPlan.value.variables?.migration_runner_image_digest?.value !== prepared.nextImage
    || savedPlan.value.variables?.controller_image_digest?.value !== controllerImage
    || savedPlan.value.variables?.foundation_manifest_sha256?.value !== prepared.foundationHash) fail('PREPARED_PLAN_INVALID')
  await assertToolBuildProof({ root, profile, build: savedBuild.value, sourceRevision: git.sourceRevision, imageDigest: prepared.nextImage, transport })
  if (!fence) {
    await sameControl()
    const state = await terraform.read()
    if (state.stateMeta.serial !== prepared.beforeSerial || state.stateMeta.lineage !== prepared.stateLineage) fail('STATE_CAS_CHANGED')
    const beforeJob = await transport.readJson(prepared.providerJobBeforeRef, bucket, ['receipts'])
    if (!same(await readJob(), beforeJob.value)) fail('LIVE_JOB_BASELINE_CHANGED')
    const bytes = (await transport.readBytes(prepared.binaryPlanRef.uri, { prefixes: ['receipts'], expectedSha256: prepared.binaryPlanRef.sha256 })).bytes
    // The adapter consumes these exact saved bytes, never an automatically refreshed plan.
    const claim = await put('apply-attempt', { sourceRevision: git.sourceRevision, binaryPlanRef: prepared.binaryPlanRef,
      preparedReceiptSha256: prepared.receiptSha256, expectedStateSerial: prepared.beforeSerial, submittedAt: now() })
    if (claim.reused) fail('APPLY_OUTCOME_UNRESOLVED')
    try {
      await terraform.apply({ binaryPlan: bytes, binaryPlanSha256: prepared.binaryPlanRef.sha256 })
    } catch {
      // Unknown completion is resolved below by state + provider readback; never resubmit.
    }
  }
  const [afterState, afterJob] = await Promise.all([terraform.read(), readJob()])
  const manifest = assertToolRotationState({ state: afterState, infraProfile, profile, sourceRevision: git.sourceRevision,
    image: prepared.nextImage, controllerImage: prepared.controllerImage, foundationHash: prepared.foundationHash })
  if (afterState.stateMeta.lineage !== prepared.stateLineage || afterState.stateMeta.serial <= prepared.beforeSerial
    || afterJob.template?.template?.containers?.[0]?.image !== prepared.nextImage || afterJob.reconciling === true
    || String(afterJob.generation) !== String(afterJob.observedGeneration)) fail('APPLY_OUTCOME_UNRESOLVED')
  await sameControl()
  const [stateRead, outputRead, jobRead] = await Promise.all([
    put('after-state', afterState), put('output-manifest', manifest), put('provider-job-after', afterJob),
  ])
  const receipt = sealToolEvidence({ schemaVersion: 'jenfu.dev012.app-infra-receipt.v1', ownerApplicationId: 'orgmaster',
    projectId: profile.target.projectId, region: profile.target.region, sourceRevision: git.sourceRevision,
    foundationManifestSha256: prepared.foundationHash, migrationRunnerDigest: prepared.nextImage,
    controllerImageDigest: prepared.controllerImage, terraformAddressCount: rotationAddresses(infraProfile).length,
    terraformAddressesSha256: sha256(canonicalize(rotationAddresses(infraProfile))),
    binaryPlanSha256: prepared.binaryPlanRef.sha256, planJsonSha256: prepared.planJsonRef.sha256,
    stateLineage: afterState.stateMeta.lineage, stateSerial: afterState.stateMeta.serial,
    stateJsonSha256: stateRead.ref.sha256, outputManifestSha256: outputRead.ref.sha256,
    mutationProfile: 'APP_INFRA_IMAGE_ROTATION', imageRotation: prepared.imageRotation,
    toolRotation: { schemaVersion: 'orgmaster.ordinary-tool-image-rotation.v1', ddlExecuted: 0,
      baselineIntentRef, baselineInfraRef: prepared.baselineInfraRef, baselineSourceRevision: prepared.baselineSourceRevision,
      previousMigrationRunnerDigest: prepared.previousImage, previousControllerImageDigest: prepared.controllerImage,
      controlBaseline: prepared.controlBaseline, controlSnapshotRef: prepared.controlSnapshotRef, controlGeneration: prepared.controlGeneration,
      binaryPlanRef: prepared.binaryPlanRef, planJsonRef: prepared.planJsonRef, beforeStateRef: prepared.beforeStateRef,
      afterStateRef: stateRead.ref, outputManifestRef: outputRead.ref, buildProofRef: prepared.buildProofRef,
      providerJobBeforeRef: prepared.providerJobBeforeRef, providerJobAfterRef: jobRead.ref, jobUid: afterJob.uid,
      sourceProof: prepared.sourceProof },
    status: 'APPLIED', releaseAuthority: true, evidenceScope: 'PRODUCTION_PROVIDER', observedAt: now() })
  // Re-run the same consumer before publishing APPLIED; an invalid proof cannot
  // be upgraded into an owner release prerequisite by an operator-only shortcut.
  await assertOrdinaryToolRotation({ root, profile, transport, intent: { sourceRevision: git.sourceRevision,
    infraReceiptRef: { uri: `${prefix}/app-infra.json`, sha256: sha256(Buffer.from(`${canonicalize(receipt)}\n`)) }, baselineIntentRef }, receipt, baseline })
  const result = await put('app-infra', receipt)
  return { status: 'APPLIED', ref: result.ref, migrationRunnerDigest: receipt.migrationRunnerDigest, ddlExecuted: 0 }
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.length !== 1 || !['--check', '--apply'].includes(argv[0])) fail('ARGUMENT_INVALID')
  const profile = JSON.parse(readGitBlob(root, 'config/release/dev040-orgmaster-independent-production-v3.json'))
  const git = readGitAuthority(root, profile)
  const githubToken = process.env.GITHUB_TOKEN || capture('gh', ['auth', 'token'])
  const sourceProof = await verifyOfficialMergedSource({ repository: profile.application.repository, branch: profile.application.branch,
    revision: git.sourceRevision, sourceTree: git.sourceTree, token: githubToken, rulesetId: 24077876 })
  const checks = JSON.parse(capture('gh', ['api', `repos/${profile.application.repository}/commits/${git.sourceRevision}/check-runs?per_page=100`]))
  assertRequiredToolSourceQc(checks, git.sourceRevision)
  sourceProof.requiredSourceQc = 'SUCCESS'
  const token = process.env.GOOGLE_OAUTH_ACCESS_TOKEN || capture(process.platform === 'win32' ? 'pwsh' : 'gcloud',
    process.platform === 'win32' ? ['-NoProfile', '-Command', 'gcloud auth print-access-token'] : ['auth', 'print-access-token'])
  const transport = createOwnerTransport({ token })
  const outputDirectory = path.join(root, 'output', 'tool-rotation-native', git.sourceRevision)
  await mkdir(outputDirectory, { recursive: true })
  const terraform = createToolTerraform({ root, outputDirectory, environment: { ...process.env, GOOGLE_OAUTH_ACCESS_TOKEN: token } })
  const result = await executeToolImageRotation({ root, profile, git, sourceProof, transport, terraform, apply: argv[0] === '--apply' })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { process.stderr.write(`${error.code ?? 'TOOL_ROTATION_FAILED'}\n`); process.exitCode = 1 })
}
