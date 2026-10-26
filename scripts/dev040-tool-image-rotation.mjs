#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { canonicalize, sha256, createOwnerTransport, releasePaths } from './lib/dev012-owner-release-runtime.mjs'
import { readGitAuthority } from './lib/dev012-owner-prerequisite-producer.mjs'
import { createGitSourceIdentity, readGitBlob } from './lib/dev012-owner-stage-executor.mjs'
import { verifyOfficialMergedSource } from './lib/dev012-official-source-review.mjs'
import { readRoutineBaseline, resolveRoutineControlBaseline } from './lib/dev040-routine-release.mjs'
import { buildMigrationToolImage, reuseMigrationToolImage } from './lib/dev040-tool-image-build.mjs'
import { createToolTerraform, terraformVariablesFromState } from './lib/dev040-tool-terraform.mjs'
import { assertDev040ReleaseIntent } from './lib/dev040-orgmaster-independent-release.mjs'
import { assertToolOwner, assertToolRotationPlan, assertToolRotationState, sealToolEvidence,
  assertToolInfrastructureTransition, rotationAddresses, assertOrdinaryToolRotation, assertToolSeal, assertToolBuildProof,
  assertToolArtifactAssociation, assertToolPreActivationAbortControl, assertToolStateSourceContinuation } from './lib/dev040-tool-image-rotation.mjs'

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
  return latest
}
export async function readHistoricalToolBuildSource({ root, profile, sourceRevision, providerBuild, readGithub }) {
  const revisions = providerBuild?.steps?.[0]?.args?.filter(value => value.startsWith('SOURCE_REVISION=')) ?? []
  if (revisions.length !== 1 || !/^SOURCE_REVISION=[a-f0-9]{40}$/u.test(revisions[0])) fail('ARTIFACT_SOURCE_INVALID')
  const revision = revisions[0].slice('SOURCE_REVISION='.length)
  const [commit, pulls, checks] = await Promise.all([
    readGithub(`git/commits/${revision}`), readGithub(`commits/${revision}/pulls?per_page=100`), readGithub(`commits/${revision}/check-runs?per_page=100`),
  ])
  const merged = pulls.filter(pull => pull.state === 'closed' && pull.merge_commit_sha === revision
    && pull.base?.ref === profile.application.branch && pull.base.repo?.full_name === profile.application.repository
    && Number.isFinite(Date.parse(pull.merged_at ?? '')))
  if (commit.sha !== revision || merged.length !== 1) fail('ARTIFACT_SOURCE_INVALID')
  const check = assertRequiredToolSourceQc(checks, revision)
  const proof = { schemaVersion: 'orgmaster.reviewed-tool-build-source.v1', sourceRevision: revision,
    rotationSourceRevision: sourceRevision, sourceTree: commit.tree.sha, repository: profile.application.repository,
    branch: profile.application.branch, pullRequestNumber: merged[0].number, pullRequestUrl: merged[0].html_url,
    mergedAt: merged[0].merged_at, requiredSourceQc: 'SUCCESS', requiredSourceQcCheckId: check.id, status: 'HISTORICAL_MERGED_SOURCE_VERIFIED' }
  assertToolArtifactAssociation({ root, profile, sourceRevision, buildSourceRevision: revision, proof })
  return { providerBuild, sourceRevision: revision, sourceProof: proof }
}
export async function executeToolImageRotation({ root, profile, git, sourceProof, transport, terraform,
  build = buildMigrationToolImage, reuseBuild = null, apply = false, now = () => new Date().toISOString(),
  verifySource = () => readGitAuthority(root, profile), readBaseline = readRoutineBaseline,
  resolveControlBaseline = resolveRoutineControlBaseline,
  validateExistingRotation = assertOrdinaryToolRotation,
  variablesFromState = terraformVariablesFromState }) {
  assertToolOwner(profile)
  if (sourceProof?.sourceRevision !== git.sourceRevision || sourceProof.status !== 'OFFICIAL_MERGED_PR_VERIFIED'
    || sourceProof.requiredSourceQc !== 'SUCCESS' || git.clean !== true || git.branch !== 'master') fail('OFFICIAL_SOURCE_REQUIRED')
  const bucket = profile.artifact.releaseBucket
  if (reuseBuild) assertToolArtifactAssociation({ root, profile, sourceRevision: git.sourceRevision,
    buildSourceRevision: reuseBuild.sourceRevision, proof: reuseBuild.sourceProof })
  const prefix = `gs://${bucket}/receipts/tool-rotations/${git.sourceRevision}`
  const infraProfile = JSON.parse(readGitBlob(root, 'config/release/dev040-production-release-infra-plan.json', git.sourceRevision))
  const head = await transport.readBytes(`gs://${bucket}/control/active.json`, { prefixes: ['control'] })
  const control = JSON.parse(head.bytes.toString('utf8'))
  const { controlSha256, ...controlCore } = control
  if (controlSha256 !== sha256(canonicalize(controlCore)) || control.state !== 'FINALIZED'
    || !['RELEASED', 'PRE_ACTIVATION_ABORTED'].includes(control.result)
    || (control.result === 'PRE_ACTIVATION_ABORTED' && control.candidateRevision !== null)
    || control.ownerApplicationId !== 'orgmaster' || control.service !== 'orgmaster-prod') fail('CONTROL_NOT_RELEASED')
  const intentRead = await transport.readBytes(`gs://${bucket}/receipts/releases/${control.releaseId}/release-intent.json`, { prefixes: ['receipts'] })
  const controlIntent = JSON.parse(intentRead.bytes.toString('utf8'))
  const attempt = { ...intentRead, value: controlIntent }
  const baselineIntentRef = control.result === 'RELEASED'
    ? intentRead.ref
    : await resolveControlBaseline({ profile, transport, control, attempt })
  const controlAttemptIntent = control.result === 'PRE_ACTIVATION_ABORTED'
    ? assertDev040ReleaseIntent(controlIntent, profile)
    : null
  let controlPrepareRead = null, controlRollbackRead = null, controlTerminalRead = null
  if (control.result === 'PRE_ACTIVATION_ABORTED') {
    const paths = releasePaths(profile, controlIntent, intentRead.ref.sha256)
    ;[controlPrepareRead, controlRollbackRead, controlTerminalRead] = await Promise.all([
      transport.readBytes(paths.prepare, { prefixes: ['receipts'] }),
      transport.readBytes(paths.rollback, { prefixes: ['receipts'] }),
      transport.readBytes(paths.terminal, { prefixes: ['receipts'] }),
    ])
  }
  const baseline = await readBaseline({ profile, transport, baselineIntentRef })
  if ((control.result === 'RELEASED'
    && (baseline.intent.sourceRevision !== control.sourceRevision || baseline.activeRevision !== control.candidateRevision))
    || (control.result === 'PRE_ACTIVATION_ABORTED' && baseline.activeRevision !== control.previousRevision)) fail('BASELINE_INVALID')
  const service = await transport.getService(profile)
  transport.assertServiceSettled(service); transport.assertCanonicalEntrypoint(profile, service)
  if (transport.effectiveRevision(service) !== baseline.activeRevision || [...(service.traffic ?? []), ...(service.trafficStatuses ?? [])].some(row => row.tag)) fail('BASELINE_INVALID')
  let previousInfraRef = baseline.intent.infraReceiptRef
  let previousInfra = (await transport.readJson(previousInfraRef, bucket, ['receipts'])).value
  const existing = await optionalJson(transport, `${prefix}/app-infra.json`, bucket)
  if (controlAttemptIntent && !same(controlAttemptIntent.infraReceiptRef, previousInfraRef)) {
    const appliedRotation = await transport.readJson(controlAttemptIntent.infraReceiptRef, bucket, ['receipts'])
    await validateExistingRotation({ root, profile, transport, intent: controlAttemptIntent,
      receipt: appliedRotation.value, baseline, readLiveJob: !existing })
    previousInfraRef = appliedRotation.ref
    previousInfra = appliedRotation.value
  }
  if (controlAttemptIntent) {
    const stageRead = read => ({ ...read, value: JSON.parse(read.bytes.toString('utf8')) })
    assertToolPreActivationAbortControl({ profile, attemptIntent: controlAttemptIntent, attemptRef: intentRead.ref,
      baselineIntentRef, infraRef: previousInfraRef, priorInfra: previousInfra,
      baselineActiveRevision: baseline.activeRevision, control: controlCore,
      prepareRead: stageRead(controlPrepareRead), rollbackRead: stageRead(controlRollbackRead), terminalRead: stageRead(controlTerminalRead) })
  }
  assertToolInfrastructureTransition(root, previousInfra.sourceRevision, git.sourceRevision)
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
      || !same(prepared.baselineInfraRef, previousInfraRef)
      || !same(prepared.controlAttemptIntentRef ?? null, control.result === 'PRE_ACTIVATION_ABORTED' ? intentRead.ref : null)
      || !same(prepared.controlPrepareRef ?? null, controlPrepareRead?.ref ?? null)
      || !same(prepared.controlRollbackRef ?? null, controlRollbackRead?.ref ?? null)
      || !same(prepared.controlTerminalRef ?? null, controlTerminalRead?.ref ?? null)
      || prepared.baselineSourceRevision !== previousInfra.sourceRevision || !same(prepared.sourceProof, sourceProof)
      || !same(prepared.artifactSourceProof ?? null, reuseBuild?.sourceProof ?? null)
      || prepared.controlBaseline.sha256 !== head.ref.sha256 || prepared.controlGeneration !== String(head.metadata.generation)) fail('PREPARED_BASELINE_CHANGED')
  } else {
    const beforeState = await terraform.read()
    const manifest = beforeState.manifest
    assertToolStateSourceContinuation(root, previousInfra.sourceRevision, manifest.source_revision, git.sourceRevision)
    if (manifest.migration_runner_digest !== previousImage || manifest.controller_image_digest !== controllerImage
      || manifest.foundation_manifest_sha256 !== previousInfra.foundationManifestSha256) fail('STATE_BASELINE_CHANGED')
    const variables = variablesFromState({ state: beforeState.stateMeta, profile, sourceRevision: git.sourceRevision, nextImage: previousImage })
    const readinessPlan = await terraform.plan({ variables })
    assertToolRotationPlan({ plan: readinessPlan.plan, infraProfile, previousImage, nextImage: previousImage, allowNoop: true })
    await sameControl()
    if (!apply) return { status: reuseBuild ? 'READY_FOR_EXISTING_BUILD_REUSE' : 'READY_FOR_IMAGE_BUILD', releaseAuthority: false, sourceRevision: git.sourceRevision,
      ...(reuseBuild ? { buildSourceRevision: reuseBuild.sourceRevision, buildId: reuseBuild.providerBuild.id } : {}),
      baselineIntentRef, addressCount: rotationAddresses(infraProfile).length, ddlExecuted: 0 }
    const buildResult = reuseBuild ? await reuseMigrationToolImage({ root, profile, sourceRevision: reuseBuild.sourceRevision,
      currentSourceRevision: git.sourceRevision, providerBuild: reuseBuild.providerBuild, transport,
      deadlineAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() }) : await build({ root, profile, sourceRevision: git.sourceRevision,
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
      baselineIntentRef, baselineInfraRef: previousInfraRef, baselineSourceRevision: previousInfra.sourceRevision,
      ...(control.result === 'PRE_ACTIVATION_ABORTED' ? { controlAttemptIntentRef: intentRead.ref,
        controlPrepareRef: controlPrepareRead.ref, controlRollbackRef: controlRollbackRead.ref, controlTerminalRef: controlTerminalRead.ref } : {}),
      controlBaseline: head.ref, controlSnapshotRef: controlSnapshot.ref, controlGeneration: String(head.metadata.generation), sourceProof,
      ...(reuseBuild ? { artifactSourceProof: reuseBuild.sourceProof } : {}),
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
  assertToolArtifactAssociation({ root, profile, sourceRevision: git.sourceRevision,
    buildSourceRevision: savedBuild.value.sourceRevision, proof: prepared.artifactSourceProof })
  await assertToolBuildProof({ root, profile, build: savedBuild.value, sourceRevision: savedBuild.value.sourceRevision, imageDigest: prepared.nextImage, transport })
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
      ...(prepared.controlAttemptIntentRef ? { controlAttemptIntentRef: prepared.controlAttemptIntentRef,
        controlPrepareRef: prepared.controlPrepareRef, controlRollbackRef: prepared.controlRollbackRef,
        controlTerminalRef: prepared.controlTerminalRef } : {}),
      previousMigrationRunnerDigest: prepared.previousImage, previousControllerImageDigest: prepared.controllerImage,
      controlBaseline: prepared.controlBaseline, controlSnapshotRef: prepared.controlSnapshotRef, controlGeneration: prepared.controlGeneration,
      binaryPlanRef: prepared.binaryPlanRef, planJsonRef: prepared.planJsonRef, beforeStateRef: prepared.beforeStateRef,
      afterStateRef: stateRead.ref, outputManifestRef: outputRead.ref, buildProofRef: prepared.buildProofRef,
      providerJobBeforeRef: prepared.providerJobBeforeRef, providerJobAfterRef: jobRead.ref, jobUid: afterJob.uid,
      sourceProof: prepared.sourceProof, ...(prepared.artifactSourceProof ? { artifactSourceProof: prepared.artifactSourceProof } : {}) },
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
  const reuseId = argv[1]?.match(/^--reuse-build-id=([a-f0-9]{8}-[a-f0-9-]{27})$/u)?.[1] ?? null
  if (![1, 2].includes(argv.length) || !['--check', '--apply'].includes(argv[0]) || (argv.length === 2 && !reuseId)) fail('ARGUMENT_INVALID')
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
  const reuseBuild = reuseId ? await readHistoricalToolBuildSource({ root, profile, sourceRevision: git.sourceRevision,
    providerBuild: await transport.request(`https://cloudbuild.googleapis.com/v1/projects/${profile.target.projectId}/locations/${profile.target.region}/builds/${reuseId}`),
    readGithub: async endpoint => JSON.parse(capture('gh', ['api', `repos/${profile.application.repository}/${endpoint}`])) }) : null
  const outputDirectory = path.join(root, 'output', 'tool-rotation-native', git.sourceRevision)
  await mkdir(outputDirectory, { recursive: true })
  const terraform = createToolTerraform({ root, outputDirectory, environment: { ...process.env, GOOGLE_OAUTH_ACCESS_TOKEN: token } })
  const result = await executeToolImageRotation({ root, profile, git, sourceProof, transport, terraform, reuseBuild, apply: argv[0] === '--apply' })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { process.stderr.write(`${error.code ?? 'TOOL_ROTATION_FAILED'}\n`); process.exitCode = 1 })
}
