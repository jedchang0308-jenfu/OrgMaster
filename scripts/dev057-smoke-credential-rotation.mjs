#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createOwnerTransport, canonicalize, sha256 } from './lib/dev012-owner-release-runtime.mjs'
import { readGitAuthority } from './lib/dev012-owner-prerequisite-producer.mjs'
import { readGitBlob } from './lib/dev012-owner-stage-executor.mjs'
import { verifyOfficialMergedSource } from './lib/dev012-official-source-review.mjs'
import { readRoutineBaseline, resolveRoutineControlBaseline } from './lib/dev040-routine-release.mjs'
import { assertOrdinaryToolRotation } from './lib/dev040-tool-image-rotation.mjs'
import { assertRequiredToolSourceQc } from './dev040-tool-image-rotation.mjs'
import { createToolTerraform, terraformVariablesFromState } from './lib/dev040-tool-terraform.mjs'
import { assertSmokeCredentialRotationPlan, expectedSmokeWorkflowSource } from './lib/dev057-smoke-rotation-continuation.mjs'
import { validateReauthReceipt } from './lib/dev057-smoke-credential-reauth.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const H64 = /^[a-f0-9]{64}$/u
function fail(code) { throw Object.assign(new Error(code), { code }) }
const same = (left, right) => canonicalize(left) === canonicalize(right)
const seal = value => ({ ...value, receiptSha256: sha256(canonicalize(value)) })

function assertSeal(value, schemaVersion, code) {
  const { receiptSha256, ...core } = value ?? {}
  if (value?.schemaVersion !== schemaVersion || receiptSha256 !== sha256(canonicalize(core))) fail(code)
  return value
}

export function workflowControlPlane(value) {
  const { sourceContents, revisionCreateTime, revisionId, updateTime, ...stable } = value ?? {}
  return stable
}

function command(name, args) {
  const result = spawnSync(name, args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
  if (result.error || result.status !== 0) fail('SMOKE_ROTATION_COMMAND_FAILED')
  return result.stdout.trim()
}

function parseRef(value, expression, code) {
  const match = expression.exec(value ?? '')
  if (!match) fail(code)
  return { uri: value.slice(0, value.lastIndexOf('#')), sha256: match.groups.sha256 }
}

async function optionalJson(transport, uri, bucket) {
  try { return await transport.readJson({ uri, sha256: (await transport.readBytes(uri, { prefixes: ['receipts'] })).ref.sha256 }, bucket, ['receipts']) }
  catch (error) { if (error?.code === 'MISSING') return null; throw error }
}

function workflowName(profile) {
  return `projects/${profile.target.projectId}/locations/${profile.target.region}/workflows/${profile.verification.candidateWorkflowName}`
}

async function readWorkflow(transport, profile) {
  const name = workflowName(profile)
  const workflow = await transport.request(`https://workflows.googleapis.com/v1/${name}`)
  if (workflow.name !== name || workflow.state !== 'ACTIVE' || typeof workflow.revisionId !== 'string' || !workflow.revisionId) fail('SMOKE_ROTATION_WORKFLOW_READBACK_INVALID')
  return workflow
}

export async function submitSmokeRotationApplyOnce({ fenceRead, expectedFence, beforeSubmit, readBaseline,
  assertBaseline, readBinaryPlan, putFence, applyPlan }) {
  if (fenceRead && !same(fenceRead.value, expectedFence)) fail('SMOKE_ROTATION_APPLY_FENCE_INVALID')
  if (fenceRead) return { submitted: false, fenced: true }
  await beforeSubmit()
  assertBaseline(await readBaseline())
  const binaryPlan = await readBinaryPlan()
  const claim = await putFence(expectedFence)
  if (!claim.reused) {
    try { await applyPlan(binaryPlan) } catch {}
  }
  return { submitted: !claim.reused, fenced: true }
}

export async function executeSmokeCredentialRotation({ root, profile, git, sourceProof, transport, terraform,
  credentialRef, toolRotationRef, apply = false, now = () => new Date().toISOString(),
  verifySource = () => readGitAuthority(root, profile) }) {
  const bucket = profile.artifact.releaseBucket
  if (git.clean !== true || git.branch !== 'master' || sourceProof?.sourceRevision !== git.sourceRevision ||
      sourceProof.status !== 'OFFICIAL_MERGED_PR_VERIFIED' || sourceProof.requiredSourceQc !== 'SUCCESS') fail('SMOKE_ROTATION_OFFICIAL_SOURCE_REQUIRED')
  const credentialRead = await transport.readJson(credentialRef, bucket, ['receipts/credential-reauth'])
  const credential = credentialRead.value
  validateReauthReceipt(credential, { sourceRevision: git.sourceRevision,
    expectedPreviousVersion: credential.secret?.previousVersion, expectedNewVersion: credential.secret?.newVersion,
    nowMs: Number.isInteger(credential.authTime) ? credential.authTime * 1000 : Number.NaN })
  const previousVersion = credential.secret.previousVersion, nextVersion = credential.secret.newVersion
  const controlRead = await transport.readBytes(`gs://${bucket}/control/active.json`, { prefixes: ['control'] })
  const control = JSON.parse(controlRead.bytes.toString('utf8'))
  const { controlSha256, ...controlCore } = control
  if (controlSha256 !== sha256(canonicalize(controlCore)) || control.state !== 'FINALIZED' ||
      !['RELEASED', 'PRE_ACTIVATION_ABORTED'].includes(control.result) || control.ownerApplicationId !== 'orgmaster') fail('SMOKE_ROTATION_CONTROL_INVALID')
  const attemptedIntent = await transport.readBytes(`gs://${bucket}/receipts/releases/${control.releaseId}/release-intent.json`, { prefixes: ['receipts'] })
  const baselineIntentRef = await resolveRoutineControlBaseline({ profile, transport, control,
    attempt: { ...attemptedIntent, value: JSON.parse(attemptedIntent.bytes.toString('utf8')) } })
  const baseline = await readRoutineBaseline({ profile, transport, baselineIntentRef })
  const toolRead = await transport.readJson(toolRotationRef, bucket, ['receipts/tool-rotations'])
  const toolEvidence = await assertOrdinaryToolRotation({ root, profile, transport,
    intent: { ...baseline.intent, sourceRevision: git.sourceRevision, infraReceiptRef: toolRotationRef, baselineIntentRef },
    receipt: toolRead.value, baseline })
  if (toolEvidence.candidateSmokeRefreshTokenSecretVersion !== previousVersion) fail('SMOKE_ROTATION_VERSION_BASELINE_INVALID')
  const service = await transport.getService(profile)
  transport.assertServiceSettled(service); transport.assertCanonicalEntrypoint(profile, service)
  if (transport.effectiveRevision(service) !== baseline.activeRevision || [...(service.traffic ?? []), ...(service.trafficStatuses ?? [])].some(row => row.tag)) fail('SMOKE_ROTATION_SERVICE_BASELINE_INVALID')
  const sameControl = async () => {
    if (!same(await verifySource(), git)) fail('SMOKE_ROTATION_SOURCE_CHANGED')
    const current = await transport.readBytes(controlRead.ref.uri, { prefixes: ['control'] })
    if (!current.bytes.equals(controlRead.bytes) || String(current.metadata.generation) !== String(controlRead.metadata.generation)) fail('SMOKE_ROTATION_CONTROL_CAS_CHANGED')
  }
  const releaseId = `ORGMASTER-SMOKE-V${nextVersion}-${git.sourceRevision.slice(0, 12).toUpperCase()}`
  const prefix = `gs://${bucket}/receipts/releases/${releaseId}`
  const put = (name, value) => transport.putJson(`${prefix}/${name}.json`, value, { bucket, prefix: 'receipts' })
  const existing = await optionalJson(transport, `${prefix}/app-infra.json`, bucket)
  if (existing) {
    const receipt = assertSeal(existing.value, 'jenfu.dev012.app-infra-receipt.v1', 'SMOKE_ROTATION_RECEIPT_INVALID')
    if (receipt.ownerApplicationId !== 'orgmaster' || receipt.sourceRevision !== git.sourceRevision ||
        receipt.mutationProfile !== 'APP_INFRA_SMOKE_CREDENTIAL_ROTATION' || receipt.status !== 'APPLIED' ||
        receipt.releaseAuthority !== true || receipt.candidateSmokeRefreshTokenSecretVersion !== nextVersion ||
        !same(receipt.credentialEvidenceRef, credentialRef) || !same(receipt.smokeRotation?.toolRotationRef, toolRotationRef) ||
        !same(receipt.smokeRotation?.credentialEvidenceRef, credentialRef) || !same(receipt.smokeRotation?.sourceProof, sourceProof)) {
      fail('SMOKE_ROTATION_RECEIPT_INVALID')
    }
    return { status: 'APPLIED', reused: true, ref: existing.ref }
  }
  await terraform.initialize()
  const infraProfile = JSON.parse(readGitBlob(root, 'config/release/dev040-production-release-infra-plan.json', git.sourceRevision))
  const preparedRead = await optionalJson(transport, `${prefix}/prepared.json`, bucket)
  let prepared, preparedRef, beforeState, beforeWorkflow, manifest, planProof
  if (preparedRead) {
    prepared = assertSeal(preparedRead.value, 'orgmaster.smoke-credential-rotation-prepared.v1', 'SMOKE_ROTATION_PREPARED_INVALID')
    preparedRef = preparedRead
    if (prepared.ownerApplicationId !== 'orgmaster' || prepared.sourceRevision !== git.sourceRevision || prepared.releaseId !== releaseId ||
        !same(prepared.baselineIntentRef, baselineIntentRef) || !same(prepared.toolRotationRef, toolRotationRef) ||
        !same(prepared.credentialEvidenceRef, credentialRef) || prepared.previousVersion !== previousVersion ||
        prepared.nextVersion !== nextVersion || !same(prepared.sourceProof, sourceProof) ||
        !same(prepared.controlBaseline, controlRead.ref) || prepared.controlGeneration !== String(controlRead.metadata.generation) ||
        prepared.applyClaimAt !== prepared.observedAt || !Number.isFinite(Date.parse(prepared.applyClaimAt))) {
      fail('SMOKE_ROTATION_PREPARED_BASELINE_CHANGED')
    }
    validateReauthReceipt(credential, { sourceRevision: git.sourceRevision, expectedPreviousVersion: previousVersion,
      expectedNewVersion: nextVersion, nowMs: Date.parse(prepared.applyClaimAt) })
    const [savedPlan, savedState, savedWorkflow, savedControl] = await Promise.all([
      transport.readJson(prepared.planJsonRef, bucket, ['receipts']),
      transport.readJson(prepared.beforeStateRef, bucket, ['receipts']),
      transport.readJson(prepared.providerWorkflowBeforeRef, bucket, ['receipts']),
      transport.readBytes(prepared.controlSnapshotRef.uri, { prefixes: ['receipts'], expectedSha256: prepared.controlSnapshotRef.sha256 }),
    ])
    await transport.readBytes(prepared.binaryPlanRef.uri, { prefixes: ['receipts'], expectedSha256: prepared.binaryPlanRef.sha256 })
    if (!same(savedPlan.ref, prepared.planJsonRef) || !same(savedState.ref, prepared.beforeStateRef) ||
        !same(savedWorkflow.ref, prepared.providerWorkflowBeforeRef) || !same(savedControl.ref, prepared.controlSnapshotRef) ||
        !savedControl.bytes.equals(controlRead.bytes)) fail('SMOKE_ROTATION_PREPARED_REF_INVALID')
    beforeState = savedState.value; beforeWorkflow = savedWorkflow.value; manifest = beforeState.manifest
    planProof = assertSmokeCredentialRotationPlan({ root, profile, sourceRevision: git.sourceRevision,
      plan: savedPlan.value, infraProfile, previousVersion, nextVersion })
    const expectedBeforeSource = expectedSmokeWorkflowSource({ root, profile, sourceRevision: git.sourceRevision, version: previousVersion })
    if (!same(planProof, prepared.planProof) || beforeState.stateMeta.serial !== prepared.beforeSerial ||
        beforeState.stateMeta.lineage !== prepared.stateLineage || beforeWorkflow.sourceContents !== expectedBeforeSource ||
        manifest.migration_runner_digest !== toolRead.value.migrationRunnerDigest ||
        manifest.controller_image_digest !== toolRead.value.controllerImageDigest ||
        manifest.foundation_manifest_sha256 !== toolRead.value.foundationManifestSha256) fail('SMOKE_ROTATION_PREPARED_PLAN_INVALID')
  } else {
    beforeState = await terraform.read()
    manifest = beforeState.manifest
    if (manifest.migration_runner_digest !== toolRead.value.migrationRunnerDigest ||
        manifest.controller_image_digest !== toolRead.value.controllerImageDigest ||
        manifest.foundation_manifest_sha256 !== toolRead.value.foundationManifestSha256) fail('SMOKE_ROTATION_STATE_BASELINE_INVALID')
    const variables = terraformVariablesFromState({ state: beforeState.stateMeta, profile, sourceRevision: git.sourceRevision,
      candidateSmokeRefreshTokenSecretVersion: nextVersion })
    if (variables.candidate_smoke_refresh_token_secret_version !== nextVersion) fail('SMOKE_ROTATION_VERSION_BASELINE_INVALID')
    const planResult = await terraform.plan({ variables })
    planProof = assertSmokeCredentialRotationPlan({ root, profile, sourceRevision: git.sourceRevision,
      plan: planResult.plan, infraProfile, previousVersion, nextVersion })
    beforeWorkflow = await readWorkflow(transport, profile)
    const expectedBeforeSource = expectedSmokeWorkflowSource({ root, profile, sourceRevision: git.sourceRevision, version: previousVersion })
    if (beforeWorkflow.sourceContents !== expectedBeforeSource) fail('SMOKE_ROTATION_WORKFLOW_BASELINE_INVALID')
    await sameControl()
    if (!apply) return { status: 'READY', releaseAuthority: false, sourceRevision: git.sourceRevision,
      previousVersion, nextVersion, addressCount: planProof.addressActions.length, imageBuilds: 0, ddlExecuted: 0 }
    const observedAt = now()
    validateReauthReceipt(credential, { sourceRevision: git.sourceRevision, expectedPreviousVersion: previousVersion,
      expectedNewVersion: nextVersion, nowMs: Date.parse(observedAt) })
    const [binaryPlan, planJson, beforeStateRef, beforeWorkflowRef, controlSnapshot] = await Promise.all([
      transport.putBytes(`${prefix}/plan.bin`, planResult.binaryPlan, { bucket, prefix: 'receipts', contentType: 'application/octet-stream' }),
      put('plan', planResult.plan), put('before-state', beforeState), put('provider-workflow-before', beforeWorkflow),
      transport.putBytes(`${prefix}/control-baseline.json`, controlRead.bytes, { bucket, prefix: 'receipts', contentType: 'application/json' }),
    ])
    prepared = seal({ schemaVersion: 'orgmaster.smoke-credential-rotation-prepared.v1', ownerApplicationId: 'orgmaster',
      sourceRevision: git.sourceRevision, releaseId, baselineIntentRef, toolRotationRef, credentialEvidenceRef: credentialRef,
      previousVersion, nextVersion, sourceProof, controlBaseline: controlRead.ref, controlSnapshotRef: controlSnapshot.ref,
      controlGeneration: String(controlRead.metadata.generation), beforeSerial: beforeState.stateMeta.serial,
      stateLineage: beforeState.stateMeta.lineage, binaryPlanRef: binaryPlan.ref, planJsonRef: planJson.ref,
      beforeStateRef: beforeStateRef.ref, providerWorkflowBeforeRef: beforeWorkflowRef.ref, planProof,
      applyClaimAt: observedAt, observedAt })
    preparedRef = await put('prepared', prepared)
  }
  if (!apply) {
    validateReauthReceipt(credential, { sourceRevision: git.sourceRevision, expectedPreviousVersion: previousVersion,
      expectedNewVersion: nextVersion })
    return { status: 'PREPARED', releaseAuthority: false, sourceRevision: git.sourceRevision,
      previousVersion, nextVersion, addressCount: planProof.addressActions.length, imageBuilds: 0, ddlExecuted: 0 }
  }
  const fenceUri = `${prefix}/apply-attempt.json`
  const fenceRead = await optionalJson(transport, fenceUri, bucket)
  const expectedFence = { schemaVersion: 'orgmaster.smoke-credential-rotation-apply.v1', sourceRevision: git.sourceRevision,
    preparedRef: preparedRef.ref, preparedReceiptSha256: prepared.receiptSha256, binaryPlanRef: prepared.binaryPlanRef,
    expectedStateSerial: prepared.beforeSerial, submittedAt: prepared.applyClaimAt }
  await submitSmokeRotationApplyOnce({ fenceRead, expectedFence, beforeSubmit: async () => {
    validateReauthReceipt(credential, { sourceRevision: git.sourceRevision, expectedPreviousVersion: previousVersion,
      expectedNewVersion: nextVersion })
    await sameControl()
  },
    readBaseline: async () => {
      const [state, workflow] = await Promise.all([terraform.read(), readWorkflow(transport, profile)])
      return { state, workflow }
    },
    assertBaseline: ({ state, workflow }) => {
      if (state.stateMeta.serial !== prepared.beforeSerial || state.stateMeta.lineage !== prepared.stateLineage ||
          !same(workflow, beforeWorkflow)) fail('SMOKE_ROTATION_STATE_CAS_CHANGED')
    },
    readBinaryPlan: () => transport.readBytes(prepared.binaryPlanRef.uri,
      { prefixes: ['receipts'], expectedSha256: prepared.binaryPlanRef.sha256 }),
    putFence: value => transport.putJson(fenceUri, value, { bucket, prefix: 'receipts' }),
    applyPlan: binaryPlan => terraform.apply({ binaryPlan: binaryPlan.bytes, binaryPlanSha256: prepared.binaryPlanRef.sha256 }),
  })
  const [afterState, afterWorkflow] = await Promise.all([terraform.read(), readWorkflow(transport, profile)])
  const expectedAfterSource = expectedSmokeWorkflowSource({ root, profile, sourceRevision: git.sourceRevision, version: nextVersion })
  if (afterState.stateMeta.lineage !== prepared.stateLineage || afterState.stateMeta.serial <= prepared.beforeSerial ||
      afterWorkflow.sourceContents !== expectedAfterSource || !same(workflowControlPlane(afterWorkflow), workflowControlPlane(beforeWorkflow)) ||
      afterWorkflow.name !== beforeWorkflow.name || afterWorkflow.revisionId === beforeWorkflow.revisionId ||
      afterState.manifest.source_revision !== git.sourceRevision ||
      afterState.manifest.migration_runner_digest !== manifest.migration_runner_digest ||
      afterState.manifest.controller_image_digest !== manifest.controller_image_digest ||
      afterState.manifest.foundation_manifest_sha256 !== manifest.foundation_manifest_sha256) fail('SMOKE_ROTATION_APPLY_OUTCOME_UNRESOLVED')
  await sameControl()
  const [afterStateRef, outputManifestRef, afterWorkflowRef] = await Promise.all([
    put('after-state', afterState), put('output-manifest', afterState.manifest), put('provider-workflow-after', afterWorkflow),
  ])
  const addresses = [...infraProfile.stageA, ...infraProfile.stageBAdditional].sort()
  const proof = { schemaVersion: 'orgmaster.smoke-credential-rotation.v1', baselineIntentRef, toolRotationRef,
    credentialEvidenceRef: credentialRef, sourceProof, controlBaseline: controlRead.ref, controlSnapshotRef: prepared.controlSnapshotRef,
    controlGeneration: String(controlRead.metadata.generation), previousVersion, nextVersion, preparedRef: preparedRef.ref,
    binaryPlanRef: prepared.binaryPlanRef, planJsonRef: prepared.planJsonRef, beforeStateRef: prepared.beforeStateRef,
    afterStateRef: afterStateRef.ref, outputManifestRef: outputManifestRef.ref,
    providerWorkflowBeforeRef: prepared.providerWorkflowBeforeRef, providerWorkflowAfterRef: afterWorkflowRef.ref,
    beforeSerial: prepared.beforeSerial, stateLineage: prepared.stateLineage, planProof }
  const receipt = seal({ schemaVersion: 'jenfu.dev012.app-infra-receipt.v1', ownerApplicationId: 'orgmaster',
    projectId: profile.target.projectId, region: profile.target.region, sourceRevision: git.sourceRevision,
    foundationManifestSha256: manifest.foundation_manifest_sha256, migrationRunnerDigest: manifest.migration_runner_digest,
    controllerImageDigest: manifest.controller_image_digest, terraformAddressCount: addresses.length,
    terraformAddressesSha256: sha256(canonicalize(addresses)), binaryPlanSha256: prepared.binaryPlanRef.sha256,
    planJsonSha256: prepared.planJsonRef.sha256, stateLineage: afterState.stateMeta.lineage, stateSerial: afterState.stateMeta.serial,
    stateJsonSha256: afterStateRef.ref.sha256, outputManifestSha256: outputManifestRef.ref.sha256,
    mutationProfile: 'APP_INFRA_SMOKE_CREDENTIAL_ROTATION', candidateSmokeRefreshTokenSecretVersion: nextVersion,
    credentialEvidenceRef: credentialRef, smokeRotation: proof, status: 'APPLIED', releaseAuthority: true,
    evidenceScope: 'PRODUCTION_PROVIDER', observedAt: prepared.applyClaimAt })
  if (!H64.test(receipt.receiptSha256) || receipt.credentialEvidenceRef.sha256 !== credentialRead.ref.sha256) fail('SMOKE_ROTATION_RECEIPT_INVALID')
  const result = await put('app-infra', receipt)
  return { status: 'APPLIED', ref: result.ref, previousVersion, nextVersion, imageBuilds: 0, ddlExecuted: 0 }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length !== 3 || !['--check', '--apply'].includes(args[0])) fail('SMOKE_ROTATION_ARGUMENT_INVALID')
  if (!args[1].startsWith('--credential-ref=') || !args[2].startsWith('--tool-image-rotation-ref=')) fail('SMOKE_ROTATION_ARGUMENT_INVALID')
  const credentialRef = parseRef(args[1].slice('--credential-ref='.length),
    /^gs:\/\/jenfu-platform-prod-orgmaster-release\/receipts\/credential-reauth\/[A-Za-z0-9_.-]+\.json#sha256=(?<sha256>[a-f0-9]{64})$/u, 'SMOKE_ROTATION_CREDENTIAL_REF_INVALID')
  const toolRotationRef = parseRef(args[2].slice('--tool-image-rotation-ref='.length),
    /^gs:\/\/jenfu-platform-prod-orgmaster-release\/receipts\/tool-rotations\/[a-f0-9]{40}\/app-infra\.json#sha256=(?<sha256>[a-f0-9]{64})$/u, 'SMOKE_ROTATION_TOOL_REF_INVALID')
  const profile = JSON.parse(readGitBlob(root, 'config/release/dev040-orgmaster-independent-production-v3.json'))
  const git = readGitAuthority(root, profile)
  const githubToken = process.env.GITHUB_TOKEN || command('gh', ['auth', 'token'])
  const sourceProof = await verifyOfficialMergedSource({ repository: profile.application.repository, branch: profile.application.branch,
    revision: git.sourceRevision, sourceTree: git.sourceTree, token: githubToken, rulesetId: 24077876 })
  const checks = JSON.parse(command('gh', ['api', `repos/${profile.application.repository}/commits/${git.sourceRevision}/check-runs?per_page=100`]))
  assertRequiredToolSourceQc(checks, git.sourceRevision)
  sourceProof.requiredSourceQc = 'SUCCESS'
  const token = process.env.GOOGLE_OAUTH_ACCESS_TOKEN || command(process.platform === 'win32' ? 'pwsh' : 'gcloud',
    process.platform === 'win32' ? ['-NoProfile', '-Command', 'gcloud auth print-access-token'] : ['auth', 'print-access-token'])
  const transport = createOwnerTransport({ token })
  const outputDirectory = path.join(root, 'output', 'smoke-credential-rotation', git.sourceRevision)
  await fs.mkdir(outputDirectory, { recursive: true })
  const terraform = createToolTerraform({ root, outputDirectory, environment: { ...process.env, GOOGLE_OAUTH_ACCESS_TOKEN: token } })
  const result = await executeSmokeCredentialRotation({ root, profile, git, sourceProof, transport, terraform,
    credentialRef, toolRotationRef, apply: args[0] === '--apply' })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { process.stderr.write(`${error.code ?? error.message}\n`); process.exitCode = 1 })
}
