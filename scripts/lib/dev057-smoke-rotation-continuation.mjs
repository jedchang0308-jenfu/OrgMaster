import { spawnSync } from 'node:child_process'
import { canonicalize, sha256, assertImmutableRef } from './dev012-owner-release-runtime.mjs'
import { validateReauthReceipt, EXPECTED } from './dev057-smoke-credential-reauth.mjs'

const H64 = /^[a-f0-9]{64}$/u
const INFRA_PROFILE = 'config/release/dev040-production-release-infra-plan.json'
const RUNNER_DOCKER = 'infra/google-cloud/dev-040-production-release/migration-runner.Dockerfile'
const CONTROLLER_ROOT = 'tools/dev-040/abort-controller'
const RECIPE = 'infra/google-cloud/dev-040-production-release/candidate-smoke.tf'
function fail(code) { throw Object.assign(new Error(code), { code }) }
const same = (a, b) => canonicalize(a) === canonicalize(b)
export function readReleaseSourceFile(root, revision, file) {
  if (!/^[a-f0-9]{40}$/u.test(revision ?? '') || !/^[A-Za-z0-9._/-]+$/u.test(file ?? '') || file.includes('..')) fail('SMOKE_ROTATION_SOURCE_INVALID')
  const result = spawnSync('git', ['show', revision + ':' + file], { cwd: root, encoding: null, windowsHide: true })
  if (result.status !== 0 || !result.stdout?.length) fail('SMOKE_ROTATION_SOURCE_MISSING')
  return result.stdout
}
function assertOwner(profile) {
  if (profile?.application?.id !== EXPECTED.ownerApplicationId || profile.application.repository !== EXPECTED.repository ||
      profile.application.branch !== 'master' || profile.target?.projectId !== EXPECTED.projectId || profile.target.region !== 'asia-east1' ||
      profile.target.canonicalOrigin !== EXPECTED.ownerCanonicalOrigin || profile.artifact?.releaseBucket !== EXPECTED.releaseBucket ||
      profile.verification?.candidateWorkflowName !== 'orgmaster-prod-candidate-smoke' ||
      profile.verification.candidateRefreshTokenSecretId !== EXPECTED.secretId ||
      profile.verification.candidateSmokeMode !== 'WORKFLOWS_INTERNAL_OIDC_V2_PRINCIPAL_SSO') fail('SMOKE_ROTATION_OWNER_INVALID')
}
function sealedInfra(value, profile) {
  const { receiptSha256, ...core } = value ?? {}
  if (value?.schemaVersion !== 'jenfu.dev012.app-infra-receipt.v1' || value.ownerApplicationId !== profile.application.id ||
      value.projectId !== profile.target.projectId || value.region !== profile.target.region || value.status !== 'APPLIED' ||
      !/^[a-f0-9]{40}$/u.test(value.sourceRevision ?? '') ||
      value.releaseAuthority !== true || value.evidenceScope !== 'PRODUCTION_PROVIDER' || !H64.test(receiptSha256 ?? '') ||
      receiptSha256 !== sha256(canonicalize(core))) fail('SMOKE_ROTATION_INFRA_INVALID')
}
function executablePaths(read) {
  const copies = (file, prefix = '') => read(file).toString('utf8').split(/\r?\n/u)
    .filter((line) => line.startsWith('COPY ')).flatMap((line) => line.slice(5).trim().split(/\s+/u).slice(0, -1))
    .map((file) => prefix + file)
  const paths = [...new Set([RUNNER_DOCKER, ...copies(RUNNER_DOCKER), CONTROLLER_ROOT + '/Dockerfile',
    ...copies(CONTROLLER_ROOT + '/Dockerfile', CONTROLLER_ROOT + '/')])].sort()
  if (paths.some((file) => !/^[A-Za-z0-9._/-]+$/u.test(file) || file.includes('..'))) fail('SMOKE_ROTATION_EXECUTABLE_CHANGED')
  return paths
}
export async function assertSmokeRotationContinuation({ root, profile, transport, intent, values, baseline,
  readSourceFile = readReleaseSourceFile, nowMs = Date.now() }) {
  assertOwner(profile)
  assertImmutableRef(intent.infraReceiptRef, EXPECTED.releaseBucket, ['receipts/releases'])
  if (!/^gs:\/\/jenfu-platform-prod-orgmaster-release\/receipts\/releases\/[A-Z0-9][A-Z0-9-]{5,63}\/app-infra\.json$/u.test(intent.infraReceiptRef.uri)) fail('SMOKE_ROTATION_REF_INVALID')
  const rotation = (await transport.readJson(intent.infraReceiptRef, EXPECTED.releaseBucket)).value
  const prior = (await transport.readJson(baseline.intent.infraReceiptRef, EXPECTED.releaseBucket)).value
  sealedInfra(rotation, profile)
  sealedInfra(prior, profile)
  const rotationKeys = ['schemaVersion', 'ownerApplicationId', 'projectId', 'region', 'sourceRevision', 'foundationManifestSha256',
    'migrationRunnerDigest', 'controllerImageDigest', 'terraformAddressCount', 'terraformAddressesSha256', 'binaryPlanSha256',
    'planJsonSha256', 'stateLineage', 'stateSerial', 'stateJsonSha256', 'outputManifestSha256', 'mutationProfile',
    'candidateSmokeRefreshTokenSecretVersion', 'credentialEvidenceRef', 'status', 'releaseAuthority', 'evidenceScope', 'observedAt', 'receiptSha256']
  if (!same(Object.keys(rotation).sort(), rotationKeys.sort())) fail('SMOKE_ROTATION_INFRA_SHAPE_INVALID')
  if (!same(rotation, values.infra) || rotation.sourceRevision !== intent.sourceRevision ||
      rotation.mutationProfile !== 'APP_INFRA_SMOKE_CREDENTIAL_ROTATION') fail('SMOKE_ROTATION_INFRA_INVALID')
  for (const field of ['foundationManifestSha256', 'migrationRunnerDigest', 'controllerImageDigest', 'terraformAddressCount', 'terraformAddressesSha256', 'stateLineage']) {
    if (!same(rotation[field], prior[field])) fail('SMOKE_ROTATION_INFRA_DRIFT')
  }
  if (profile.artifact.migrationRunnerUri !== 'asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster-migration-runner' ||
      !/^asia-east1-docker\.pkg\.dev\/jenfu-platform-prod\/orgmaster-release\/orgmaster-migration-runner@sha256:[a-f0-9]{64}$/u.test(rotation.migrationRunnerDigest ?? '') ||
      !/^asia-east1-docker\.pkg\.dev\/jenfu-platform-prod\/orgmaster-release\/orgmaster-abort-controller@sha256:[a-f0-9]{64}$/u.test(rotation.controllerImageDigest ?? '') ||
      !Number.isSafeInteger(rotation.stateSerial) || !Number.isSafeInteger(prior.stateSerial) || rotation.stateSerial <= prior.stateSerial ||
      !/^[a-f0-9-]{20,}$/iu.test(rotation.stateLineage ?? '') ||
      ['foundationManifestSha256', 'terraformAddressesSha256', 'binaryPlanSha256', 'planJsonSha256', 'stateJsonSha256', 'outputManifestSha256'].some((key) => !H64.test(rotation[key] ?? ''))) fail('SMOKE_ROTATION_INFRA_INVALID')
  const read = (revision, file) => readSourceFile(root, revision, file)
  const beforeProfile = JSON.parse(read(baseline.intent.sourceRevision, INFRA_PROFILE))
  const afterProfile = JSON.parse(read(intent.sourceRevision, INFRA_PROFILE))
  const addresses = [...(afterProfile.stageA ?? []), ...(afterProfile.stageBAdditional ?? [])].sort()
  if (!same(beforeProfile, afterProfile) || !same(JSON.parse(read(prior.sourceRevision, INFRA_PROFILE)), afterProfile) ||
      afterProfile.schemaVersion !== 'jenfu.dev040.production-release-infra-plan.v2' || afterProfile.ownerApplicationId !== EXPECTED.ownerApplicationId ||
      afterProfile.projectId !== EXPECTED.projectId || afterProfile.region !== profile.target.region || afterProfile.backendKey !== profile.state.backendKey ||
      !addresses.length || new Set(addresses).size !== addresses.length || addresses.some((address) => typeof address !== 'string') ||
      rotation.terraformAddressCount !== addresses.length || rotation.terraformAddressesSha256 !== sha256(canonicalize(addresses))) fail('SMOKE_ROTATION_ADDRESS_SET_INVALID')
  const oldRead = (file) => read(baseline.intent.sourceRevision, file)
  const newRead = (file) => read(intent.sourceRevision, file)
  const priorRead = (file) => read(prior.sourceRevision, file)
  const paths = executablePaths(newRead)
  if (!same(paths, executablePaths(oldRead)) || !same(paths, executablePaths(priorRead)) ||
      paths.some((file) => !oldRead(file).equals(newRead(file)) || !priorRead(file).equals(newRead(file)))) fail('SMOKE_ROTATION_EXECUTABLE_CHANGED')
  const credentialRef = rotation.credentialEvidenceRef
  assertImmutableRef(credentialRef, EXPECTED.releaseBucket, ['receipts/credential-reauth'])
  const credential = (await transport.readJson(credentialRef, EXPECTED.releaseBucket, ['receipts/credential-reauth'])).value
  const observedAtMs = Date.parse(rotation.observedAt)
  if (!Number.isFinite(observedAtMs) || observedAtMs > nowMs + 30000 || observedAtMs < Date.parse(credential.observedAt)) fail('SMOKE_ROTATION_APPLY_TIME_INVALID')
  // Revalidate the original completed mutation, not permission for another mutation now.
  validateReauthReceipt(credential, { sourceRevision: intent.sourceRevision,
    expectedPreviousVersion: credential.secret?.previousVersion,
    expectedNewVersion: rotation.candidateSmokeRefreshTokenSecretVersion, nowMs: observedAtMs })
  if (prior.candidateSmokeRefreshTokenSecretVersion != null &&
      prior.candidateSmokeRefreshTokenSecretVersion !== credential.secret.previousVersion) fail('SMOKE_ROTATION_VERSION_INVALID')
  return { evidenceScope: 'OWNER_SEALED_APPLIED_ROTATION', infraReceiptRef: intent.infraReceiptRef,
    credentialEvidenceRef: credentialRef, sourceRevision: intent.sourceRevision,
    previousVersion: credential.secret.previousVersion, newVersion: credential.secret.newVersion,
    principalId: credential.principalId, employeeId: credential.employeeId, assuranceLevel: credential.assuranceLevel,
    appliedObservedAt: rotation.observedAt, executableInputCount: paths.length,
    terraformAddressCount: addresses.length, terraformAddressesSha256: rotation.terraformAddressesSha256,
    providerCurrentReadback: false, credentialMaterialPresent: false }
}

export function expectedSmokeWorkflowSource({ root, sourceRevision, profile, version, readSourceFile = readReleaseSourceFile }) {
  assertOwner(profile)
  const recipe = readSourceFile(root, sourceRevision, RECIPE).toString('utf8').replaceAll('\r\n', '\n')
  const match = /source_contents = <<-YAML\n([\s\S]*?)\n  YAML/u.exec(recipe)
  if (!match) fail('SMOKE_ROTATION_RECIPE_INVALID')
  const lines = match[1].split('\n')
  const indentation = Math.min(...lines.filter((line) => line.trim()).map((line) => /^ */u.exec(line)[0].length))
  let body = lines.map((line) => line.slice(indentation)).join('\n') + '\n'
  const locals = readSourceFile(root, sourceRevision, 'infra/google-cloud/dev-040-production-release/locals.tf').toString('utf8')
  for (const key of ['app', 'candidate_smoke_secret', 'candidate_smoke_probe_path', 'candidate_smoke_negative_path', 'candidate_smoke_image_pattern']) {
    const value = new RegExp('^\\s*' + key + '\\s*=\\s*"([^"\\r\\n]*)"', 'mu').exec(locals)?.[1]
    if (value == null) fail('SMOKE_ROTATION_RECIPE_INVALID')
    body = body.replaceAll('$' + '{local.' + key + '}', value)
  }
  body = body.replaceAll('$' + '{var.project_id}', profile.target.projectId)
    .replaceAll('$' + '{coalesce(var.candidate_smoke_refresh_token_secret_version, "0")}', version)
    .replaceAll('$$' + '{', '$' + '{')
  if (body.includes('$' + '{local.') || body.includes('$' + '{var.') || body.includes('$' + '{coalesce(')) fail('SMOKE_ROTATION_RECIPE_INVALID')
  return body
}

export async function readSmokeRotationProvider({ root, profile, transport, continuation, readSourceFile = readReleaseSourceFile }) {
  assertOwner(profile)
  const expectedSource = expectedSmokeWorkflowSource({ root, profile, sourceRevision: continuation.sourceRevision,
    version: continuation.newVersion, readSourceFile })
  const workflowName = 'projects/' + profile.target.projectId + '/locations/' + profile.target.region + '/workflows/' + profile.verification.candidateWorkflowName
  const workflow = await transport.request('https://workflows.googleapis.com/v1/' + workflowName)
  const account = 'projects/' + profile.target.projectId + '/serviceAccounts/' + profile.identities.smoke
  if (workflow.name !== workflowName || workflow.state !== 'ACTIVE' || typeof workflow.revisionId !== 'string' || !workflow.revisionId ||
      workflow.serviceAccount !== account || workflow.sourceContents !== expectedSource) fail('SMOKE_ROTATION_WORKFLOW_DRIFT')
  const secretBase = 'projects/' + profile.target.projectNumber + '/secrets/' + EXPECTED.secretId + '/versions/'
  for (const version of [continuation.newVersion, 'latest']) {
    const metadata = await transport.request('https://secretmanager.googleapis.com/v1/' + secretBase + version)
    if (metadata.name !== secretBase + continuation.newVersion || metadata.state !== 'ENABLED') fail('SMOKE_ROTATION_PROVIDER_VERSION_INVALID')
  }
  return { evidenceScope: 'OPERATOR_PROVIDER_CURRENT_METADATA', observedAt: transport.now?.() ?? new Date().toISOString(),
    workflowName, workflowRevisionId: workflow.revisionId, workflowSourceSha256: sha256(expectedSource),
    secretId: EXPECTED.secretId, exactNumericVersion: continuation.newVersion, secretState: 'ENABLED',
    releaseAuthority: false, credentialMaterialPresent: false }
}
