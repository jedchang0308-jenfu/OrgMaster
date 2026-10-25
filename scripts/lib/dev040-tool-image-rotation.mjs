import { spawnSync } from 'node:child_process'
import { gunzipSync } from 'node:zlib'
import { canonicalize, sha256, assertImmutableRef, releasePaths } from './dev012-owner-release-runtime.mjs'
import { readGitBlob } from './dev012-owner-stage-executor.mjs'
import { assertDev040ReleaseIntent } from './dev040-orgmaster-independent-release.mjs'
import { assertMigrationToolBuildEvidence } from './dev040-tool-image-build.mjs'
import { matchGitSourceArchive } from './dev040-git-archive.mjs'
import { assertDev058RolePolicyAppend } from './dev058-role-policy-migration.mjs'
import { assertDev059FmsAuthorityAppend } from './dev059-fms-authority-migration.mjs'

export const TOOL_RECIPES = Object.freeze([
  'infra/google-cloud/dev-040-production-release/migration-runner.Dockerfile',
  'infra/google-cloud/dev-040-production-release/dev057-principal-pair-diagnostic.Dockerfile',
  'infra/google-cloud/dev-040-production-release/dev057-v4-catalog-readback.Dockerfile',
])
export const MIGRATION_JOB_ADDRESS = 'google_cloud_run_v2_job.migration[0]'
const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const PRODUCTION_PROFILE_PATH = 'config/release/dev040-orgmaster-independent-production-v3.json'
const TOOL_INFRASTRUCTURE_PATHS = Object.freeze([
  'infra/google-cloud/dev-040-production-release',
  PRODUCTION_PROFILE_PATH,
  'config/release/dev040-production-release-infra-plan.json',
  'config/dev-010/n1c-orgmaster.json',
])
const same = (a, b) => canonicalize(a) === canonicalize(b)
function fail(code) { throw Object.assign(new Error(`TOOL_ROTATION_${code}`), { code: `TOOL_ROTATION_${code}` }) }
export function sealToolEvidence(core) { return { ...core, receiptSha256: sha256(canonicalize(core)) } }
export function assertToolSeal(value) {
  const { receiptSha256, ...core } = value ?? {}
  if (!H64.test(receiptSha256 ?? '') || receiptSha256 !== sha256(canonicalize(core))) fail('EVIDENCE_HASH_INVALID')
  return value
}

function assertToolControlTerminal(value, profile, intent) {
  const { receiptSha256, ...core } = value ?? {}
  if (value?.schemaVersion !== 'jenfu.dev012.stage-receipt.v1'
    || value.ownerApplicationId !== profile.application.id || value.releaseId !== intent.releaseId
    || value.sourceRevision !== intent.sourceRevision || value.stage !== 'terminal' || value.status !== 'PASS'
    || receiptSha256 !== sha256(canonicalize(core))) fail('BASELINE_INVALID')
  return value
}
export function assertToolOwner(profile) {
  if (profile.application.id !== 'orgmaster' || profile.target.projectId !== 'jenfu-platform-prod'
    || profile.target.region !== 'asia-east1' || profile.target.serviceName !== 'orgmaster-prod'
    || profile.artifact.releaseBucket !== 'jenfu-platform-prod-orgmaster-release'
    || profile.state.backendKey !== 'dev-040-r2/production-release/default.tfstate') fail('OWNER_INVALID')
}
export function toolExecutableInputs(root, revision) {
  if (!H40.test(revision)) fail('SOURCE_INVALID')
  const recipe = TOOL_RECIPES[0]
  const read = file => readGitBlob(root, file, revision)
  const files = [recipe, ...read(recipe).toString('utf8').split(/\r?\n/u)
    .filter(line => line.startsWith('COPY ')).flatMap(line => line.trim().split(/\s+/u).slice(1, -1))]
  for (const file of ['.dockerignore', `${recipe}.dockerignore`, '.gitattributes']) {
    const exists = spawnSync('git', ['cat-file', '-e', `${revision}:${file}`], { cwd: root, windowsHide: true })
    if (exists.status === 0) files.push(file)
  }
  if (files.some(file => !/^[A-Za-z0-9._/-]+$/u.test(file) || file.includes('..'))) fail('COPY_INVALID')
  return [...new Set(files)].sort().map(path => ({ path, sha256: sha256(read(path)) }))
}
function infrastructureTreeEntries(root, revision) {
  if (!H40.test(revision)) fail('SOURCE_INVALID')
  const result = spawnSync('git', ['ls-tree', '-r', '-z', revision, '--', ...TOOL_INFRASTRUCTURE_PATHS],
    { cwd: root, encoding: null, windowsHide: true })
  if (result.status !== 0 || !result.stdout.length) fail('SOURCE_INVALID')
  return result.stdout.toString('utf8').split('\0').filter(Boolean)
}
export function toolInfrastructureFingerprint(root, revision) {
  const entries = infrastructureTreeEntries(root, revision)
    .filter(entry => !TOOL_RECIPES.includes(entry.split('\t').at(-1)))
  return sha256(entries.join('\0'))
}
function readProductionProfile(root, revision) {
  try { return JSON.parse(readGitBlob(root, PRODUCTION_PROFILE_PATH, revision).toString('utf8')) } catch { fail('SOURCE_INVALID') }
}
function nonRecipeInfrastructureEntries(root, revision) {
  return infrastructureTreeEntries(root, revision)
    .filter(entry => {
      const file = entry.split('\t').at(-1)
      return file !== PRODUCTION_PROFILE_PATH && !TOOL_RECIPES.includes(file)
    })
}
/**
 * The baseline-to-receipt transition may carry the exact DEV-058 or DEV-059
 * migration append alongside existing tool recipe changes. Every other infrastructure
 * input, including every non-recipe tree entry and every profile field, stays
 * byte-equivalent. The receipt-to-intent check remains strict below.
 */
export function assertToolInfrastructureTransition(root, beforeRevision, afterRevision) {
  const beforeFingerprint = toolInfrastructureFingerprint(root, beforeRevision)
  const afterFingerprint = toolInfrastructureFingerprint(root, afterRevision)
  if (beforeFingerprint === afterFingerprint) return { disposition: 'UNCHANGED', beforeFingerprint, afterFingerprint }

  const beforeProfile = readProductionProfile(root, beforeRevision)
  const afterProfile = readProductionProfile(root, afterRevision)
  let disposition = 'DEV059_FMS_AUTHORITY_APPEND'
  try {
    const beforeMigrations = beforeProfile.migrations
    const afterMigrations = afterProfile.migrations
    try {
      assertDev059FmsAuthorityAppend(beforeMigrations, afterMigrations)
    } catch {
      if (beforeMigrations.entries?.length === 31) assertDev058RolePolicyAppend(beforeMigrations, afterMigrations)
      else {
        if (!Number.isSafeInteger(beforeMigrations.entries?.length) || beforeMigrations.entries.length < 31
          || beforeMigrations.entries.length >= (afterMigrations.entries?.length ?? 0)
          || !same(beforeMigrations.entries, afterMigrations.entries.slice(0, beforeMigrations.entries.length))) fail('SOURCE_INPUT_DRIFT')
        assertDev058RolePolicyAppend({ ...beforeMigrations, entries: beforeMigrations.entries.slice(0, 31) }, afterMigrations)
      }
      disposition = 'DEV058_ROLE_POLICY_APPEND'
    }
  } catch { fail('SOURCE_INPUT_DRIFT') }
  const { migrations: _beforeMigrations, ...beforeProfileWithoutMigrations } = beforeProfile
  const { migrations: _afterMigrations, ...afterProfileWithoutMigrations } = afterProfile
  if (!same(beforeProfileWithoutMigrations, afterProfileWithoutMigrations)
    || !same(nonRecipeInfrastructureEntries(root, beforeRevision), nonRecipeInfrastructureEntries(root, afterRevision))) fail('SOURCE_INPUT_DRIFT')
  return { disposition, beforeFingerprint, afterFingerprint }
}
export function assertToolArtifactAssociation({ root, profile, sourceRevision, buildSourceRevision, proof }) {
  if (sourceRevision === buildSourceRevision) {
    if (proof != null) fail('ARTIFACT_SOURCE_INVALID')
    return
  }
  if (!H40.test(sourceRevision ?? '') || !H40.test(buildSourceRevision ?? '')
    || proof?.schemaVersion !== 'orgmaster.reviewed-tool-build-source.v1'
    || proof.sourceRevision !== buildSourceRevision || proof.rotationSourceRevision !== sourceRevision
    || proof.repository !== profile.application.repository || proof.branch !== profile.application.branch
    || proof.status !== 'HISTORICAL_MERGED_SOURCE_VERIFIED' || proof.requiredSourceQc !== 'SUCCESS'
    || !Number.isSafeInteger(proof.requiredSourceQcCheckId) || proof.requiredSourceQcCheckId < 1
    || !Number.isSafeInteger(proof.pullRequestNumber) || proof.pullRequestNumber < 1
    || !Number.isFinite(Date.parse(proof.mergedAt ?? ''))) fail('ARTIFACT_SOURCE_INVALID')
  const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', buildSourceRevision, sourceRevision], { cwd: root, windowsHide: true })
  const tree = spawnSync('git', ['rev-parse', `${buildSourceRevision}^{tree}`], { cwd: root, encoding: 'utf8', windowsHide: true })
  if (ancestor.status !== 0 || tree.status !== 0 || tree.stdout.trim() !== proof.sourceTree
    || !same(toolExecutableInputs(root, buildSourceRevision), toolExecutableInputs(root, sourceRevision))) fail('ARTIFACT_SOURCE_INVALID')
}
export function rotationAddresses(infraProfile) {
  const addresses = [...(infraProfile.stageA ?? []), ...(infraProfile.stageBAdditional ?? [])].sort()
  if (infraProfile.ownerApplicationId !== 'orgmaster' || infraProfile.projectId !== 'jenfu-platform-prod'
    || infraProfile.region !== 'asia-east1' || infraProfile.backendKey !== 'dev-040-r2/production-release/default.tfstate'
    || !addresses.length || new Set(addresses).size !== addresses.length) fail('ADDRESS_SET_INVALID')
  return addresses
}

function candidateSmokeVersionFromState(state) {
  const resource = state?.resources?.find(row => row.mode === 'managed' && row.type === 'google_workflows_workflow' && row.name === 'candidate_smoke')
  const source = resource?.instances?.[0]?.attributes?.source_contents
  const marker = 'orgmaster-prod-smoke-firebase-refresh-token'
  const offset = typeof source === 'string' ? source.indexOf(marker) : -1
  const match = offset < 0 ? null : /\bversion\s*:\s*["']([1-9][0-9]*)["']/u.exec(source.slice(offset, offset + 240))
  if (!match || !Number.isSafeInteger(Number(match[1]))) return null
  return match[1]
}
export function assertToolRotationPlan({ plan, infraProfile, previousImage, nextImage, allowNoop = false }) {
  const imagePattern = /^asia-east1-docker\.pkg\.dev\/jenfu-platform-prod\/orgmaster-release\/orgmaster-migration-runner@sha256:[a-f0-9]{64}$/u
  if (![previousImage, nextImage].every(value => imagePattern.test(value ?? '')) || (!allowNoop && previousImage === nextImage)
    || plan.errored === true || plan.complete === false || !Array.isArray(plan.resource_changes)
    || (plan.deferred_changes?.length ?? 0)) fail('PLAN_INVALID')
  const addresses = rotationAddresses(infraProfile)
  const rows = [...plan.resource_changes]
  // Terraform omits already-resolved data sources from resource_changes. They
  // remain bound by the complete provider-refreshed prior state, not guessed.
  const missing = addresses.filter(address => !rows.some(row => row.address === address))
  if (missing.length) {
    const prior = plan.prior_state?.values?.root_module
    if ((prior?.child_modules?.length ?? 0) || !same(prior?.resources?.map(row => row.address).sort(), addresses)) fail('ADDRESS_SET_INVALID')
    for (const address of missing) {
      const row = prior.resources.find(value => value.address === address)
      if (!address.startsWith('data.') || row?.mode !== 'data' || !row.values) fail('ADDRESS_SET_INVALID')
      rows.push({ address, mode: 'data', change: { actions: ['no-op'], before: row.values, after: row.values } })
    }
  }
  if (!same(rows.map(row => row.address).sort(), addresses) || new Set(rows.map(row => row.address)).size !== rows.length) fail('ADDRESS_SET_INVALID')
  for (const row of rows) {
    if (!['managed', 'data'].includes(row.mode)) fail('ACTION_DENIED')
    const actions = row.change?.actions
    const expected = row.address === MIGRATION_JOB_ADDRESS && previousImage !== nextImage ? 'update'
      : row.mode === 'data' ? ['read', 'no-op'].find(action => same(actions, [action])) : 'no-op'
    if (!expected || !same(actions, [expected]) || (row.mode === 'data') !== row.address.startsWith('data.')
      || (row.change?.importing != null) || (row.change?.replace_paths?.length ?? 0)) fail('ACTION_DENIED')
    if (expected === 'no-op' && !same(row.change.before, row.change.after)) fail('NON_IMAGE_CHANGE_DENIED')
  }
  const job = rows.find(row => row.address === MIGRATION_JOB_ADDRESS)
  const before = structuredClone(job.change.before), after = structuredClone(job.change.after)
  for (const row of [before, after]) if (row?.project !== 'jenfu-platform-prod' || row.location !== 'asia-east1'
    || row.name !== 'orgmaster-prod-migration-runner') fail('JOB_INVALID')
  const oldContainer = before.template?.[0]?.template?.[0]?.containers?.[0]
  const newContainer = after.template?.[0]?.template?.[0]?.containers?.[0]
  if (oldContainer?.image !== previousImage || newContainer?.image !== nextImage) fail('IMAGE_INVALID')
  oldContainer.image = newContainer.image = '__BOUND_IMAGE__'
  if (before.client === 'gcloud' && /^\d+(?:\.\d+){1,3}$/u.test(before.client_version ?? '') && after.client == null && after.client_version == null) {
    delete before.client; delete before.client_version; delete after.client; delete after.client_version
  }
  if (!same(before, after)) fail('NON_IMAGE_CHANGE_DENIED')
  return { schemaVersion: 'jenfu.dev012.image-rotation-proof.v1',
    addressActions: rows.map(row => [row.address, row.change.actions[0]]).sort((a, b) => a[0].localeCompare(b[0])),
    updates: previousImage === nextImage ? [] : [{ address: job.address, before: job.change.before, after: job.change.after }] }
}

export async function assertToolBuildProof({ root, profile, build, sourceRevision, imageDigest, transport }) {
  assertToolSeal(build)
  assertMigrationToolBuildEvidence({ profile, proof: build })
  if (build.sourceRevision !== sourceRevision || build.artifactDigest !== imageDigest
    || build.status !== 'PASS' || build.scan?.status !== 'PASS' || build.scan?.blockingVulnerabilityCount !== 0
    || build.cloudBuild?.status !== 'SUCCESS' || build.artifactRegistry?.uri !== imageDigest
    || build.scan?.resourceUrl !== `https://${imageDigest}`
    || !H64.test(build.buildInputSha256 ?? '') || !H64.test(build.sourceSha256 ?? '')
    || build.sourceObject?.generation !== String(build.cloudBuild?.sourceProvenance?.resolvedStorageSource?.generation)) fail('BUILD_PROOF_INVALID')
  const storage = build.cloudBuild.sourceProvenance.resolvedStorageSource
  if (storage.bucket !== profile.artifact.releaseBucket || build.sourceObject.uri !== `gs://${storage.bucket}/${storage.object}`) fail('BUILD_PROOF_INVALID')
  // This is historical evidence validation, not a new source freeze: app-only
  // releases may have a newer HEAD while retaining unchanged tool inputs.
  const identity = spawnSync('git', ['ls-tree', '-r', '-z', '--full-tree', sourceRevision],
    { cwd: root, encoding: null, maxBuffer: 256 * 1024 * 1024, windowsHide: true })
  if (identity.status !== 0 || !identity.stdout.length || build.sourceSha256 !== sha256(identity.stdout)) fail('SOURCE_PROOF_INVALID')
  if (!H64.test(build.sourceObject.sha256 ?? '')
    || build.sourceObject.uri !== `gs://${profile.artifact.releaseBucket}/source/archives/${build.sourceObject.sha256}/source.tar.gz`) fail('SOURCE_PROOF_INVALID')
  // Preserve the original compressed-byte hash. Windows/Linux gzip OS headers
  // differ, so recompression is not an archive identity comparison.
  const frozenArchive = await transport.readBytes(build.sourceObject.uri, { prefixes: ['source'], expectedSha256: build.sourceObject.sha256 })
  let expanded
  try { expanded = gunzipSync(frozenArchive.bytes, { maxOutputLength: 256 * 1024 * 1024 }) } catch { fail('SOURCE_PROOF_INVALID') }
  if (sha256(frozenArchive.bytes) !== build.sourceObject.sha256) fail('SOURCE_PROOF_INVALID')
  try { return matchGitSourceArchive(root, sourceRevision, expanded) } catch { fail('SOURCE_PROOF_INVALID') }
}

export function assertToolRotationState({ state, infraProfile, profile, sourceRevision, image, controllerImage, foundationHash }) {
  assertToolOwner(profile)
  const resources = module => [...(module?.resources ?? []), ...(module?.child_modules ?? []).flatMap(resources)]
  const rows = resources(state.stateJson?.values?.root_module)
  if (!same(rows.map(row => row.address).sort(), rotationAddresses(infraProfile))
    || new Set(rows.map(row => row.address)).size !== rows.length || !Number.isSafeInteger(state.stateMeta?.serial)
    || state.stateMeta.serial < 1 || typeof state.stateMeta.lineage !== 'string' || !state.stateMeta.lineage) fail('STATE_READBACK_INVALID')
  const manifest = state.stateJson.values.outputs?.app_release_infra_manifest?.value ?? state.stateJson.outputs?.app_release_infra_manifest?.value
  if (manifest?.source_revision !== sourceRevision || manifest.project_id !== profile.target.projectId || manifest.region !== profile.target.region
    || manifest.migration_runner_digest !== image || manifest.controller_image_digest !== controllerImage
    || manifest.foundation_manifest_sha256 !== foundationHash || manifest.application_service !== profile.target.serviceName
    || manifest.release_bucket !== profile.artifact.releaseBucket || manifest.incident_runtime !== true) fail('STATE_READBACK_INVALID')
  const job = rows.find(row => row.address === MIGRATION_JOB_ADDRESS)?.values
  if (job?.name !== 'orgmaster-prod-migration-runner' || job.project !== profile.target.projectId || job.location !== profile.target.region
    || job.template?.[0]?.template?.[0]?.containers?.[0]?.image !== image) fail('STATE_READBACK_INVALID')
  return manifest
}

/** Native prepare validates immutable evidence; the operator also reads live state before dispatch. */
export async function assertOrdinaryToolRotation({ root, profile, transport, intent, receipt, baseline, readLiveJob = true, rotationDepth = 0 }) {
  assertToolOwner(profile); assertToolSeal(receipt)
  if (!Number.isSafeInteger(rotationDepth) || rotationDepth < 0 || rotationDepth > 8) fail('BASELINE_INVALID')
  const proof = receipt.toolRotation
  if (receipt.schemaVersion !== 'jenfu.dev012.app-infra-receipt.v1' || receipt.mutationProfile !== 'APP_INFRA_IMAGE_ROTATION'
    || receipt.ownerApplicationId !== 'orgmaster' || receipt.projectId !== profile.target.projectId || receipt.region !== profile.target.region
    || receipt.status !== 'APPLIED' || receipt.releaseAuthority !== true || receipt.evidenceScope !== 'PRODUCTION_PROVIDER'
    || proof?.schemaVersion !== 'orgmaster.ordinary-tool-image-rotation.v1' || proof.ddlExecuted !== 0
    || !H40.test(receipt.sourceRevision ?? '') || !H40.test(proof.baselineSourceRevision ?? '')
    || !H64.test(receipt.foundationManifestSha256 ?? '') || !H64.test(receipt.binaryPlanSha256 ?? '')
    || !H64.test(receipt.planJsonSha256 ?? '') || !H64.test(receipt.stateJsonSha256 ?? '')
    || receipt.controllerImageDigest !== proof.previousControllerImageDigest) fail('RECEIPT_INVALID')
  const read = async ref => {
    assertImmutableRef(ref, profile.artifact.releaseBucket, ['receipts'])
    return transport.readJson(ref, profile.artifact.releaseBucket, ['receipts'])
  }
  const [planRead, buildRead, stateRead, outputRead, beforeJobRead, afterJobRead, beforeStateRead, originalIntentRead, priorInfraRead, controlRead] = await Promise.all([
    read(proof.planJsonRef), read(proof.buildProofRef), read(proof.afterStateRef), read(proof.outputManifestRef),
    read(proof.providerJobBeforeRef), read(proof.providerJobAfterRef),
    read(proof.beforeStateRef), read(proof.baselineIntentRef), read(proof.baselineInfraRef),
    read(proof.controlSnapshotRef),
  ])
  assertImmutableRef(proof.binaryPlanRef, profile.artifact.releaseBucket, ['receipts'])
  if (proof.binaryPlanRef.sha256 !== receipt.binaryPlanSha256 || proof.planJsonRef.sha256 !== receipt.planJsonSha256
    || proof.afterStateRef.sha256 !== receipt.stateJsonSha256 || proof.outputManifestRef.sha256 !== receipt.outputManifestSha256) fail('PLAN_HASH_INVALID')
  const binary = await transport.readBytes(proof.binaryPlanRef.uri, { prefixes: ['receipts'], expectedSha256: receipt.binaryPlanSha256 })
  if (sha256(binary.bytes) !== receipt.binaryPlanSha256 || sha256(planRead.bytes) !== receipt.planJsonSha256
    || sha256(stateRead.bytes) !== receipt.stateJsonSha256 || sha256(outputRead.bytes) !== receipt.outputManifestSha256) fail('PLAN_HASH_INVALID')
  const infraProfile = JSON.parse(readGitBlob(root, 'config/release/dev040-production-release-infra-plan.json', intent.sourceRevision))
  const derived = assertToolRotationPlan({ plan: planRead.value, infraProfile, previousImage: proof.previousMigrationRunnerDigest, nextImage: receipt.migrationRunnerDigest })
  if (!same(receipt.imageRotation, { ...derived, sourceRevision: receipt.sourceRevision, planJsonSha256: receipt.planJsonSha256 })
    || receipt.terraformAddressCount !== rotationAddresses(infraProfile).length
    || receipt.terraformAddressesSha256 !== sha256(canonicalize(rotationAddresses(infraProfile)))) fail('PLAN_PROOF_INVALID')
  const build = buildRead.value
  assertToolArtifactAssociation({ root, profile, sourceRevision: receipt.sourceRevision, buildSourceRevision: build.sourceRevision, proof: proof.artifactSourceProof })
  const archiveProof = await assertToolBuildProof({ root, profile, build, sourceRevision: build.sourceRevision, imageDigest: receipt.migrationRunnerDigest, transport })
  const sourceProof = proof.sourceProof
  if (sourceProof?.sourceRevision !== receipt.sourceRevision || sourceProof.repository !== profile.application.repository
    || sourceProof.branch !== profile.application.branch || sourceProof.status !== 'OFFICIAL_MERGED_PR_VERIFIED'
    || sourceProof.branchProtected !== true || sourceProof.requiredSourceQc !== 'SUCCESS') fail('SOURCE_PROOF_INVALID')
  const originalIntent = originalIntentRead.value, priorInfra = priorInfraRead.value
  if (originalIntent.ownerApplicationId !== 'orgmaster'
    || priorInfra.migrationRunnerDigest !== proof.previousMigrationRunnerDigest
    || priorInfra.controllerImageDigest !== receipt.controllerImageDigest
    || priorInfra.foundationManifestSha256 !== receipt.foundationManifestSha256) fail('BASELINE_INVALID')
  const { controlSha256, ...controlCore } = controlRead.value
  if (controlRead.ref.sha256 !== proof.controlBaseline?.sha256 || controlSha256 !== sha256(canonicalize(controlCore))
    || controlCore.state !== 'FINALIZED' || !['RELEASED', 'PRE_ACTIVATION_ABORTED'].includes(controlCore.result)
    || controlCore.ownerApplicationId !== 'orgmaster' || controlCore.service !== 'orgmaster-prod') fail('BASELINE_INVALID')
  if (controlCore.result === 'RELEASED') {
    if (proof.controlAttemptIntentRef != null || proof.controlTerminalRef != null
      || controlCore.sourceRevision !== proof.baselineSourceRevision || controlCore.releaseId !== originalIntent.releaseId
      || originalIntent.sourceRevision !== proof.baselineSourceRevision
      || !same(originalIntent.infraReceiptRef, proof.baselineInfraRef)) fail('BASELINE_INVALID')
  } else {
    if (controlCore.candidateRevision !== null || !proof.controlAttemptIntentRef || !proof.controlTerminalRef) fail('BASELINE_INVALID')
    const [attemptRead, terminalRead] = await Promise.all([read(proof.controlAttemptIntentRef), read(proof.controlTerminalRef)])
    const attemptIntent = assertDev040ReleaseIntent(attemptRead.value, profile)
    const expectedTerminalUri = releasePaths(profile, attemptIntent, attemptRead.ref.sha256).terminal
    const terminal = assertToolControlTerminal(terminalRead.value, profile, attemptIntent)
    if (controlCore.releaseId !== attemptIntent.releaseId || controlCore.sourceRevision !== attemptIntent.sourceRevision
      || controlCore.sourceLockSha256 !== attemptIntent.sourceLockRef.sha256
      || !same(attemptIntent.baselineIntentRef, proof.baselineIntentRef)
      || attemptIntent.previousRevision !== baseline.activeRevision || controlCore.previousRevision !== baseline.activeRevision
      || terminalRead.ref.uri !== expectedTerminalUri || terminal.facts?.result !== 'PRE_ACTIVATION_ABORTED'
      || terminal.facts.previousRevision !== baseline.activeRevision) fail('BASELINE_INVALID')
    if (same(attemptIntent.infraReceiptRef, originalIntent.infraReceiptRef)) {
      if (originalIntent.sourceRevision !== proof.baselineSourceRevision
        || !same(originalIntent.infraReceiptRef, proof.baselineInfraRef)) fail('BASELINE_INVALID')
    } else {
      if (!same(attemptIntent.infraReceiptRef, proof.baselineInfraRef)
        || priorInfra.sourceRevision !== proof.baselineSourceRevision) fail('BASELINE_INVALID')
      await assertOrdinaryToolRotation({ root, profile, transport, intent: attemptIntent, receipt: priorInfra,
        baseline, readLiveJob: false, rotationDepth: rotationDepth + 1 })
    }
  }
  const manifest = assertToolRotationState({ state: stateRead.value, infraProfile, profile, sourceRevision: receipt.sourceRevision,
    image: receipt.migrationRunnerDigest, controllerImage: receipt.controllerImageDigest, foundationHash: receipt.foundationManifestSha256 })
  if (stateRead.value.stateMeta.serial !== receipt.stateSerial || stateRead.value.stateMeta.lineage !== receipt.stateLineage
    || !same(manifest, outputRead.value)) fail('STATE_READBACK_INVALID')
  if (beforeStateRead.value.stateMeta.lineage !== receipt.stateLineage
    || !Number.isSafeInteger(beforeStateRead.value.stateMeta.serial) || beforeStateRead.value.stateMeta.serial >= receipt.stateSerial) fail('STATE_READBACK_INVALID')
  const beforeSource = beforeStateRead.value.stateJson?.values?.outputs?.app_release_infra_manifest?.value?.source_revision
    ?? beforeStateRead.value.stateJson?.outputs?.app_release_infra_manifest?.value?.source_revision
  if (!H40.test(beforeSource ?? '')) fail('STATE_READBACK_INVALID')
  assertToolRotationState({ state: beforeStateRead.value, infraProfile, profile, sourceRevision: beforeSource,
    image: proof.previousMigrationRunnerDigest, controllerImage: receipt.controllerImageDigest, foundationHash: receipt.foundationManifestSha256 })
  if (planRead.value.variables?.source_revision?.value !== receipt.sourceRevision
    || planRead.value.variables?.migration_runner_image_digest?.value !== receipt.migrationRunnerDigest
    || planRead.value.variables?.controller_image_digest?.value !== receipt.controllerImageDigest
    || planRead.value.variables?.foundation_manifest_sha256?.value !== receipt.foundationManifestSha256) fail('PLAN_PROOF_INVALID')
  assertToolInfrastructureTransition(root, proof.baselineSourceRevision, receipt.sourceRevision)
  if (toolInfrastructureFingerprint(root, receipt.sourceRevision) !== toolInfrastructureFingerprint(root, intent.sourceRevision)
    || !same(toolExecutableInputs(root, receipt.sourceRevision), toolExecutableInputs(root, intent.sourceRevision))) fail('SOURCE_INPUT_DRIFT')
  const before = beforeJobRead.value, after = afterJobRead.value
  if (before.name !== after.name || before.uid !== after.uid || before.uid !== proof.jobUid
    || after.name !== `projects/${profile.target.projectId}/locations/${profile.target.region}/jobs/orgmaster-prod-migration-runner`
    || after.reconciling === true || String(after.observedGeneration) !== String(after.generation)) fail('JOB_READBACK_INVALID')
  const templateBefore = structuredClone(before.template), templateAfter = structuredClone(after.template)
  if (templateBefore?.template?.containers?.[0]?.image !== proof.previousMigrationRunnerDigest
    || templateAfter?.template?.containers?.[0]?.image !== receipt.migrationRunnerDigest) fail('JOB_READBACK_INVALID')
  templateBefore.template.containers[0].image = templateAfter.template.containers[0].image = '__BOUND_IMAGE__'
  if (!same(templateBefore, templateAfter)) fail('NON_IMAGE_CHANGE_DENIED')
  if (receipt.foundationManifestSha256 !== outputRead.value.foundation_manifest_sha256
    || receipt.migrationRunnerDigest !== outputRead.value.migration_runner_digest
    || receipt.controllerImageDigest !== outputRead.value.controller_image_digest
    || outputRead.value.source_revision !== receipt.sourceRevision) fail('STATE_READBACK_INVALID')
  if (readLiveJob) await assertToolJobLiveReadback({ profile, transport, receipt, recordedJob: after })
  // The first publication joins the exact original baseline. Later app-only
  // publications may retain the same immutable tool proof with unchanged inputs.
  if (!same(intent.infraReceiptRef, baseline.intent.infraReceiptRef)
    && !same(proof.baselineIntentRef, intent.baselineIntentRef)) fail('BASELINE_INVALID')
  const candidateSmokeRefreshTokenSecretVersion = candidateSmokeVersionFromState(stateRead.value.stateMeta)
  return { evidenceScope: 'OWNER_SEALED_TOOL_IMAGE_ROTATION', sourceRevision: receipt.sourceRevision,
    migrationRunnerDigest: receipt.migrationRunnerDigest, binaryPlanRef: proof.binaryPlanRef, planJsonRef: proof.planJsonRef,
    terraformAddressCount: receipt.terraformAddressCount, ddlExecuted: 0,
    ...(candidateSmokeRefreshTokenSecretVersion ? { candidateSmokeRefreshTokenSecretVersion } : {}),
    liveJobReadback: readLiveJob ? 'VERIFIED' : 'REQUIRED_AT_DEPLOYER_MIGRATE', archiveExportProfile: archiveProof.exportProfile }
}

/** Exact-job deployer readback; the prepare verifier gains no Job permission. */
export async function assertToolJobLiveReadback({ profile, transport, receipt, recordedJob = null }) {
  assertToolOwner(profile); assertToolSeal(receipt)
  const proof = receipt.toolRotation
  if (proof?.schemaVersion !== 'orgmaster.ordinary-tool-image-rotation.v1') fail('RECEIPT_INVALID')
  assertImmutableRef(proof.providerJobAfterRef, profile.artifact.releaseBucket, ['receipts'])
  const after = recordedJob ?? (await transport.readJson(proof.providerJobAfterRef, profile.artifact.releaseBucket, ['receipts'])).value
  const expectedName = `projects/${profile.target.projectId}/locations/${profile.target.region}/jobs/orgmaster-prod-migration-runner`
  if (after.name !== expectedName || after.uid !== proof.jobUid
    || after.template?.template?.containers?.[0]?.image !== receipt.migrationRunnerDigest) fail('JOB_READBACK_INVALID')
  const live = await transport.request(`https://run.googleapis.com/v2/${expectedName}`)
  if (live.uid !== after.uid || live.reconciling === true || String(live.observedGeneration) !== String(live.generation)
    || !same(live.template, after.template)) fail('LIVE_JOB_DRIFT')
  return { jobName: live.name, uid: live.uid, generation: String(live.generation), migrationRunnerDigest: receipt.migrationRunnerDigest }
}
