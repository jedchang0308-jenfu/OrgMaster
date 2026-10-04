import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { canonicalize, sha256, assertImmutableRef, assertControllerImageResolutionProof, releasePaths } from './dev012-owner-release-runtime.mjs'
import { principalOnlyRollbackRevision } from './dev057-principal-only-release.mjs'
import { validateReauthReceipt, EXPECTED } from './dev057-smoke-credential-reauth.mjs'

const H64 = /^[a-f0-9]{64}$/u
const INFRA_PROFILE = 'config/release/dev040-production-release-infra-plan.json'
const RUNNER_DOCKER = 'infra/google-cloud/dev-040-production-release/migration-runner.Dockerfile'
const CONTROLLER_ROOT = 'tools/dev-040/abort-controller'
const RECIPE = 'infra/google-cloud/dev-040-production-release/candidate-smoke.tf'
const INFRA_ROOT = 'infra/google-cloud/dev-040-production-release'
const REUSE_SCHEMA = 'jenfu.dev012.app-infra-reuse-receipt.v1'
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
async function assertAppliedSmokeRotation({ root, profile, transport, intent, values, baseline,
  readSourceFile = readReleaseSourceFile, nowMs = Date.now(), sourceReuse = false }) {
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
  if (!same(rotation, values.infra) || (!sourceReuse && rotation.sourceRevision !== intent.sourceRevision) ||
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
  const rotationRead = (file) => read(rotation.sourceRevision, file)
  const paths = executablePaths(newRead)
  if (!same(paths, executablePaths(oldRead)) || !same(paths, executablePaths(priorRead)) || !same(paths, executablePaths(rotationRead)) ||
      paths.some((file) => !oldRead(file).equals(newRead(file)) || !priorRead(file).equals(newRead(file)) || !rotationRead(file).equals(newRead(file)))) fail('SMOKE_ROTATION_EXECUTABLE_CHANGED')
  const credentialRef = rotation.credentialEvidenceRef
  assertImmutableRef(credentialRef, EXPECTED.releaseBucket, ['receipts/credential-reauth'])
  const credential = (await transport.readJson(credentialRef, EXPECTED.releaseBucket, ['receipts/credential-reauth'])).value
  const observedAtMs = Date.parse(rotation.observedAt)
  if (!Number.isFinite(observedAtMs) || observedAtMs > nowMs + 30000 || observedAtMs < Date.parse(credential.observedAt)) fail('SMOKE_ROTATION_APPLY_TIME_INVALID')
  // Revalidate the original completed mutation, not permission for another mutation now.
  validateReauthReceipt(credential, { sourceRevision: rotation.sourceRevision,
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

export async function assertSmokeRotationContinuation(input) {
  return assertAppliedSmokeRotation(input)
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

function assertReuseSourceLock(lock, profile) {
  if (lock?.schemaVersion !== 'jenfu.dev012.owner-source-lock.v1' || lock.ownerApplicationId !== profile.application.id ||
      lock.repository !== profile.application.repository || lock.branch !== profile.application.branch || lock.clean !== true ||
      lock.remoteRef !== 'refs/heads/' + profile.application.branch || lock.remoteRevision !== lock.sourceRevision ||
      !/^[a-f0-9]{40}$/u.test(lock.sourceRevision ?? '') || !/^[a-f0-9]{40}$/u.test(lock.sourceTree ?? '') ||
      !H64.test(lock.sourceSha256 ?? '') || lock.status !== 'SOURCE_FROZEN' || lock.releaseAuthority !== true ||
      lock.evidenceScope !== 'PRODUCTION_BOUND') fail('SMOKE_REUSE_SOURCE_INVALID')
}

export function readSmokeReuseInfrastructureTree(root, revision) {
  if (!/^[a-f0-9]{40}$/u.test(revision ?? '')) fail('SMOKE_REUSE_SOURCE_INVALID')
  const result = spawnSync('git', ['ls-tree', '-r', '-z', revision, '--', INFRA_ROOT, INFRA_PROFILE,
    'config/release/dev040-orgmaster-independent-production-v3.json', 'config/dev-010/n1c-orgmaster.json'],
  { cwd: root, encoding: null, windowsHide: true })
  if (result.status !== 0 || !result.stdout?.length) fail('SMOKE_REUSE_SOURCE_INVALID')
  return result.stdout
}

// Mutable control is read twice by the producer. Only its exact finalized owner
// attempt and sealed terminal/rollback may select the retained release baseline.
export async function readSmokeReuseControl({ profile, transport, baselineIntentRef, baseline }) {
  assertOwner(profile)
  const bucket = profile.artifact.releaseBucket
  const head = await transport.readBytes('gs://' + bucket + '/control/active.json', { prefixes: ['control'] })
  const control = JSON.parse(head.bytes.toString('utf8'))
  const { controlSha256, ...core } = control
  const keys = ['schemaVersion', 'inputFingerprint', 'ownerApplicationId', 'service', 'controlBucket', 'releaseId', 'sourceRevision',
    'sourceLockSha256', 'candidateRevision', 'previousRevision', 'ownerRunRef', 'leaseExpiresAt', 'deadlineAt', 'state', 'result', 'controlSha256']
  if (!same(Object.keys(control).sort(), keys.sort()) || controlSha256 !== sha256(canonicalize(core)) ||
      control.schemaVersion !== 'jenfu.dev012.owner-control-head.v1' || control.state !== 'FINALIZED' ||
      control.ownerApplicationId !== profile.application.id || control.service !== profile.target.serviceName || control.controlBucket !== bucket ||
      !/^[A-Z0-9][A-Z0-9-]{5,63}$/u.test(control.releaseId ?? '') || !['RELEASED', 'PRE_ACTIVATION_ABORTED'].includes(control.result) ||
      !/^[1-9][0-9]*$/u.test(String(head.metadata?.generation ?? '')) || head.ref.sha256 !== sha256(head.bytes) ||
      !Number.isFinite(Date.parse(control.leaseExpiresAt)) || Date.parse(control.leaseExpiresAt) >= Date.now()) fail('SMOKE_REUSE_CONTROL_INVALID')
  const attemptRefUri = 'gs://' + bucket + '/receipts/releases/' + control.releaseId + '/release-intent.json'
  const attempt = await transport.readBytes(attemptRefUri, { prefixes: ['receipts'] })
  const intent = JSON.parse(attempt.bytes.toString('utf8'))
  const fingerprint = sha256(canonicalize({ ownerApplicationId: profile.application.id, releaseId: intent.releaseId,
    sourceRevision: intent.sourceRevision, releaseIntentSha256: attempt.ref.sha256 }))
  if (intent.schemaVersion !== profile.schemas.releaseIntent || intent.ownerApplicationId !== profile.application.id ||
      intent.releaseId !== control.releaseId || intent.sourceRevision !== control.sourceRevision ||
      intent.sourceLockRef?.sha256 !== control.sourceLockSha256 || intent.deadlineAt !== control.deadlineAt ||
      control.inputFingerprint !== fingerprint || !/^https:\/\/api\.github\.com\/repos\/jedchang0308-jenfu\/OrgMaster\/actions\/runs\/[1-9][0-9]*$/u.test(control.ownerRunRef ?? '')) fail('SMOKE_REUSE_CONTROL_INVALID')
  const paths = releasePaths(profile, intent, attempt.ref.sha256)
  const terminal = await transport.readBytes(paths.terminal, { prefixes: ['receipts'] })
  const terminalValue = JSON.parse(terminal.bytes.toString('utf8'))
  const sealedStage = (value, stage) => {
    const { receiptSha256, ...stageCore } = value ?? {}
    if (receiptSha256 !== sha256(canonicalize(stageCore)) || value.schemaVersion !== 'jenfu.dev012.stage-receipt.v1' ||
        value.ownerApplicationId !== profile.application.id || value.releaseId !== intent.releaseId ||
        value.sourceRevision !== intent.sourceRevision || value.stage !== stage || value.status !== 'PASS') fail('SMOKE_REUSE_CONTROL_INVALID')
    return value.facts
  }
  const facts = sealedStage(terminalValue, 'terminal')
  if (facts.result !== control.result) fail('SMOKE_REUSE_CONTROL_INVALID')
  let rollbackRef = null
  if (control.result === 'RELEASED') {
    if (!same(attempt.ref, baselineIntentRef) || control.candidateRevision !== baseline.activeRevision ||
        facts.candidateRevision !== baseline.activeRevision) fail('SMOKE_REUSE_BASELINE_INVALID')
  } else {
    const rollback = await transport.readBytes(paths.rollback, { prefixes: ['receipts'] })
    const rollbackValue = JSON.parse(rollback.bytes.toString('utf8'))
    const rollbackFacts = sealedStage(rollbackValue, 'rollback')
    const rollbackRevision = principalOnlyRollbackRevision(intent)
    if (!same(intent.baselineIntentRef, baselineIntentRef) || intent.previousRevision !== baseline.activeRevision ||
        control.previousRevision !== rollbackRevision || facts.previousRevision !== rollbackRevision ||
        rollbackFacts.previousRevision !== rollbackRevision || rollbackFacts.result !== control.result ||
        !same(terminalValue.previousReceiptRef, rollback.ref) || facts.databaseDisposition !== rollbackFacts.databaseDisposition ||
        !same(facts.entrypointRecovery, rollbackFacts.entrypointRecovery) ||
        !same(rollbackFacts.recoveryOrder, ['TRAFFIC_ROLLBACK', 'TAG_CLEANUP', 'ENTRYPOINT_BASELINE_RESTORE'])) fail('SMOKE_REUSE_BASELINE_INVALID')
    rollbackRef = rollback.ref
  }
  return { ref: head.ref, generation: String(head.metadata.generation), controlSha256, sourceRevision: control.sourceRevision,
    releaseId: control.releaseId, result: control.result, attemptIntentRef: attempt.ref, terminalRef: terminal.ref, rollbackRef }
}

function terraformJson(root, args) {
  const directory = path.join(root, INFRA_ROOT)
  let backend
  try { backend = JSON.parse(fs.readFileSync(path.join(directory, '.terraform/terraform.tfstate'), 'utf8')).backend }
  catch { fail('SMOKE_REUSE_BACKEND_INVALID') }
  if (backend?.type !== 'gcs' || backend.config?.bucket !== 'tfstate-jenfu-platform-prod' ||
      backend.config.prefix !== 'dev-040-r2/production-release/default.tfstate') fail('SMOKE_REUSE_BACKEND_INVALID')
  const result = spawnSync(process.env.TERRAFORM_EXECUTABLE || 'terraform', args,
    { cwd: directory, encoding: 'utf8', windowsHide: true, maxBuffer: 256 * 1024 * 1024 })
  if (result.error || result.status !== 0) fail('SMOKE_REUSE_STATE_READ_FAILED')
  try { return JSON.parse(result.stdout) } catch { fail('SMOKE_REUSE_STATE_READ_FAILED') }
}

const BLOCKS = new Set(['template', 'resources', 'scaling', 'vpcAccess', 'valueSource', 'secretKeyRef', 'cloudSqlInstance',
  'startupProbe', 'livenessProbe', 'httpGet', 'tcpSocket', 'grpc', 'binaryAuthorization', 'nodeSelector'])

// Convert Terraform's singleton blocks and snake_case fields to API names, then
// normalize only protobuf empty defaults and own project-qualified identifiers.
// Every remaining field participates; unexpected env/args/volumes also differ.
export function smokeInfraTemplateProjection(value, profile, { terraform = false } = {}) {
  const convert = (item, key = '', map = false) => {
    if (Array.isArray(item)) {
      if (terraform && BLOCKS.has(key)) {
        if (item.length > 1) fail('SMOKE_REUSE_TEMPLATE_INVALID')
        return item.length ? convert(item[0], key) : undefined
      }
      const rows = item.map((row) => convert(row, key)).filter((row) => row !== undefined)
      if (key === 'env') {
        if (new Set(rows.map((row) => row.name)).size !== rows.length) fail('SMOKE_REUSE_TEMPLATE_INVALID')
        rows.sort((a, b) => a.name.localeCompare(b.name))
      }
      return rows.length ? rows : undefined
    }
    if (item && typeof item === 'object') {
      const rows = Object.entries(item).map(([field, child]) => {
        const name = terraform && !map ? field.replace(/_([a-z])/gu, (_, letter) => letter.toUpperCase()) : field
        return [name, convert(child, name, ['labels', 'annotations', 'limits'].includes(name))]
      }).filter(([, child]) => child !== undefined)
      return rows.length ? Object.fromEntries(rows) : undefined
    }
    if (item == null || item === '' || item === false || item === 0 ||
        (typeof item === 'string' && item.endsWith('_UNSPECIFIED'))) return undefined
    if (typeof item === 'string' && ['network', 'subnetwork', 'secret'].includes(key) && item.startsWith('projects/')) {
      const patterns = { network: '^projects/' + profile.target.projectId + '/global/networks/([^/]+)$',
        subnetwork: '^projects/' + profile.target.projectId + '/regions/' + profile.target.region + '/subnetworks/([^/]+)$',
        secret: '^projects/(?:' + profile.target.projectId + '|' + profile.target.projectNumber + ')/secrets/([^/]+)$' }
      const match = new RegExp(patterns[key], 'u').exec(item)
      if (!match) fail('SMOKE_REUSE_TEMPLATE_INVALID')
      return match[1]
    }
    return item
  }
  return convert(value) ?? {}
}

export async function readSmokeReuseLiveTemplates({ profile, transport, expectedTemplates }) {
  assertOwner(profile)
  const prefix = 'projects/' + profile.target.projectId + '/locations/' + profile.target.region + '/'
  const expectedNames = { migrationJob: prefix + 'jobs/orgmaster-prod-migration-runner',
    abortController: prefix + 'services/orgmaster-prod-abort-controller' }
  const result = {}
  for (const kind of ['migrationJob', 'abortController']) {
    const expected = expectedTemplates?.[kind]
    if (expected?.name !== expectedNames[kind] || !H64.test(expected.expectedTemplateSha256 ?? '') ||
        typeof expected.expectedUid !== 'string' || !expected.expectedUid ||
        expected.expectedTemplateSha256 !== sha256(canonicalize(expected.expectedTemplate))) fail('SMOKE_REUSE_TEMPLATE_INVALID')
    const actual = await transport.request('https://run.googleapis.com/v2/' + expected.name)
    const body = { template: actual.template, ...(kind === 'abortController' ? {
      ingress: actual.ingress, invokerIamDisabled: actual.invokerIamDisabled, defaultUriDisabled: actual.defaultUriDisabled,
      binaryAuthorization: actual.binaryAuthorization,
    } : { binaryAuthorization: actual.binaryAuthorization }) }
    const projection = smokeInfraTemplateProjection(body, profile)
    if (actual.name !== expected.name || actual.uid !== expected.expectedUid || actual.reconciling === true || actual.observedGeneration !== actual.generation ||
        sha256(canonicalize(projection)) !== expected.expectedTemplateSha256) fail('SMOKE_REUSE_LIVE_TEMPLATE_DRIFT')
    result[kind] = { ...expected, actualTemplateSha256: sha256(canonicalize(projection)),
      etag: actual.etag, generation: String(actual.generation) }
    if (typeof actual.etag !== 'string' || !actual.etag || !/^[1-9][0-9]*$/u.test(result[kind].generation)) fail('SMOKE_REUSE_TEMPLATE_INVALID')
    if (kind === 'abortController') {
      const revisionName = (value) => {
        if (typeof value !== 'string' || !value) fail('SMOKE_REUSE_CONTROLLER_SERVING_INVALID')
        const full = value.startsWith('projects/') ? value : expected.name + '/revisions/' + value
        if (!full.startsWith(expected.name + '/revisions/') || !/^[a-z0-9-]+$/u.test(full.slice((expected.name + '/revisions/').length))) fail('SMOKE_REUSE_CONTROLLER_SERVING_INVALID')
        return full
      }
      const servingRevision = revisionName(actual.latestReadyRevision)
      if (revisionName(actual.latestCreatedRevision) !== servingRevision ||
          (actual.template.revision && revisionName(actual.template.revision) !== servingRevision)) fail('SMOKE_REUSE_CONTROLLER_SERVING_INVALID')
      for (const rows of [actual.traffic, actual.trafficStatuses]) {
        if (!Array.isArray(rows) || rows.length !== 1 || Number(rows[0].percent) !== 100 || rows[0].tag ||
            !['TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST', 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION'].includes(rows[0].type) ||
            (rows[0].revision ? revisionName(rows[0].revision) !== servingRevision : rows[0].type !== 'TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST')) fail('SMOKE_REUSE_CONTROLLER_SERVING_INVALID')
      }
      const revision = await transport.request('https://run.googleapis.com/v2/' + servingRevision)
      const expectedContainer = expected.expectedTemplate.template.containers
      if (revision.name !== servingRevision || revision.conditions?.find((row) => row.type === 'Ready')?.state !== 'CONDITION_SUCCEEDED' ||
          !Array.isArray(revision.containers) || revision.containers.length !== 1 || expectedContainer.length !== 1 ||
          revision.containers[0].name !== 'controller' ||
          revision.serviceAccount !== expected.expectedTemplate.template.serviceAccount) fail('SMOKE_REUSE_CONTROLLER_SERVING_INVALID')
      const servingImageResolution = await transport.readControllerImageResolution(profile, expectedContainer[0].image, revision.containers[0].image)
      assertControllerImageResolutionProof({ profile, parentImage: expectedContainer[0].image,
        servingImage: revision.containers[0].image, proof: servingImageResolution })
      result[kind].servingRevision = servingRevision
      result[kind].servingImageDigest = revision.containers[0].image
      result[kind].servingImageResolution = servingImageResolution
    }
  }
  return result
}

export async function readSmokeReuseProviderState({ root, profile, transport, rotation, sourceRevision, readSourceFile = readReleaseSourceFile, terraformReader = terraformJson }) {
  assertOwner(profile)
  const state = terraformReader(root, ['show', '-json'])
  const stateMeta = terraformReader(root, ['state', 'pull'])
  const manifest = terraformReader(root, ['output', '-json', 'app_release_infra_manifest'])
  const resources = (module) => [...(module?.resources ?? []), ...(module?.child_modules ?? []).flatMap(resources)]
  // The frozen profile and applied receipt bind all 75 addresses, including data resources.
  const rows = resources(state?.values?.root_module)
  const addresses = rows.map((row) => row.address).sort()
  const infraProfile = JSON.parse(readSourceFile(root, sourceRevision, INFRA_PROFILE))
  const expectedAddresses = [...infraProfile.stageA, ...infraProfile.stageBAdditional].sort()
  if (profile.state.backendKey !== 'dev-040-r2/production-release/default.tfstate' ||
      !same(addresses, expectedAddresses) || new Set(addresses).size !== addresses.length ||
      addresses.length !== rotation.terraformAddressCount || sha256(canonicalize(addresses)) !== rotation.terraformAddressesSha256 ||
      stateMeta.lineage !== rotation.stateLineage || stateMeta.serial !== rotation.stateSerial ||
      sha256(canonicalize(state)) !== rotation.stateJsonSha256 || sha256(canonicalize(manifest)) !== rotation.outputManifestSha256 ||
      !same(state.outputs?.app_release_infra_manifest?.value ?? state.values?.outputs?.app_release_infra_manifest?.value, manifest) ||
      manifest.project_id !== profile.target.projectId || manifest.region !== profile.target.region ||
      manifest.source_revision !== rotation.sourceRevision || manifest.foundation_manifest_sha256 !== rotation.foundationManifestSha256 ||
      manifest.application_service !== profile.target.serviceName || manifest.runtime_identity !== profile.target.runtimeServiceAccount ||
      manifest.release_bucket !== profile.artifact.releaseBucket || manifest.candidate_smoke_secret !== EXPECTED.secretId ||
      manifest.incident_runtime !== true || manifest.migration_runner_digest !== rotation.migrationRunnerDigest ||
      manifest.controller_image_digest !== rotation.controllerImageDigest) fail('SMOKE_REUSE_STATE_DRIFT')
  const workflow = rows.find((row) => row.address === 'google_workflows_workflow.candidate_smoke[0]')
  const expectedSource = expectedSmokeWorkflowSource({ root, sourceRevision, profile, version: rotation.candidateSmokeRefreshTokenSecretVersion, readSourceFile })
  if (workflow?.values?.source_contents !== expectedSource || workflow.values.name !== profile.verification.candidateWorkflowName ||
      workflow.values.project !== profile.target.projectId || workflow.values.region !== profile.target.region) fail('SMOKE_REUSE_STATE_DRIFT')
  const expectedTemplates = {}
  for (const [kind, address, type, name] of [
    ['migrationJob', 'google_cloud_run_v2_job.migration[0]', 'jobs', 'orgmaster-prod-migration-runner'],
    ['abortController', 'google_cloud_run_v2_service.abort_controller[0]', 'services', 'orgmaster-prod-abort-controller'],
  ]) {
    const value = rows.find((row) => row.address === address)?.values
    if (value?.name !== name || value.project !== profile.target.projectId || value.location !== profile.target.region ||
        typeof value.uid !== 'string' || !value.uid ||
        !Array.isArray(value.template) || value.template.length !== 1) fail('SMOKE_REUSE_STATE_DRIFT')
    const template = smokeInfraTemplateProjection({ template: value.template, binary_authorization: value.binary_authorization,
      ...(kind === 'abortController' ? { ingress: value.ingress, invoker_iam_disabled: value.invoker_iam_disabled, default_uri_disabled: value.default_uri_disabled } : {}) }, profile, { terraform: true })
    expectedTemplates[kind] = { name: 'projects/' + profile.target.projectId + '/locations/' + profile.target.region + '/' + type + '/' + name,
      expectedUid: value.uid,
      expectedTemplate: template, expectedTemplateSha256: sha256(canonicalize(template)) }
  }
  const liveTemplates = await readSmokeReuseLiveTemplates({ profile, transport, expectedTemplates })
  return { backendBucket: 'tfstate-jenfu-platform-prod', backendKey: profile.state.backendKey,
    stateLineage: stateMeta.lineage, stateSerial: stateMeta.serial, stateJsonSha256: rotation.stateJsonSha256,
    outputManifestSha256: rotation.outputManifestSha256, terraformAddressCount: addresses.length,
    terraformAddressesSha256: rotation.terraformAddressesSha256, liveTemplates }
}

export function assertSmokeInfraReuseReceipt({ receipt, profile, sourceLock, intent = null }) {
  assertOwner(profile)
  assertReuseSourceLock(sourceLock, profile)
  const { receiptSha256, ...core } = receipt ?? {}
  const refs = ['sourceLockRef', 'baselineIntentRef', 'reusedInfraReceiptRef', 'priorInfraReceiptRef']
  if (receipt?.schemaVersion !== REUSE_SCHEMA || receipt.ownerApplicationId !== profile.application.id ||
      receipt.projectId !== profile.target.projectId || receipt.region !== profile.target.region ||
      !/^[A-Z0-9][A-Z0-9-]{5,63}$/u.test(receipt.releaseId ?? '') || receipt.sourceRevision !== sourceLock.sourceRevision ||
      receipt.sourceSha256 !== sourceLock.sourceSha256 || receipt.sourceTree !== sourceLock.sourceTree ||
      !/^[a-f0-9]{40}$/u.test(receipt.reusedSourceRevision ?? '') || receipt.reusedSourceRevision === receipt.sourceRevision ||
      receipt.mutationProfile !== 'APP_INFRA_REUSE' || receipt.reuseBasis !== 'APPLICATION_SOURCE_ONLY_NO_INFRA_EXECUTABLE_INPUT_CHANGE' ||
      receipt.status !== 'APPLIED' || receipt.releaseAuthority !== true || receipt.evidenceScope !== 'PRODUCTION_PROVIDER_REUSE' ||
      receipt.credentialMaterialPresent !== false || receiptSha256 !== sha256(canonicalize(core)) ||
      !Number.isFinite(Date.parse(receipt.observedAt)) || (intent && (!same(receipt.baselineIntentRef, intent.baselineIntentRef) ||
        receipt.sourceRevision !== intent.sourceRevision || receipt.sourceSha256 !== intent.sourceSha256))) fail('SMOKE_REUSE_RECEIPT_INVALID')
  for (const field of refs) assertImmutableRef(receipt[field], EXPECTED.releaseBucket, ['receipts'])
  if (receipt.reusedInfraReceiptRef.uri === receipt.sourceLockRef.uri ||
      !/^gs:\/\/jenfu-platform-prod-orgmaster-release\/receipts\/releases\/[A-Z0-9][A-Z0-9-]{5,63}\/app-infra\.json$/u.test(receipt.reusedInfraReceiptRef.uri)) fail('SMOKE_REUSE_RECEIPT_INVALID')
  assertImmutableRef(receipt.credentialEvidenceRef, EXPECTED.releaseBucket, ['receipts/credential-reauth'])
  const provider = receipt.providerReadback
  if (!provider || provider.evidenceScope !== 'OPERATOR_PROVIDER_CURRENT_METADATA' || provider.exactNumericVersion !== receipt.candidateSmokeRefreshTokenSecretVersion ||
      provider.exactNumericVersion !== EXPECTED.newSecretVersion || provider.secretState !== 'ENABLED' || provider.secretId !== EXPECTED.secretId ||
      provider.credentialMaterialPresent !== false || !H64.test(provider.workflowSourceSha256 ?? '') ||
      !receipt.controlHead || receipt.controlHead.ref?.uri !== 'gs://' + EXPECTED.releaseBucket + '/control/active.json' ||
      !H64.test(receipt.controlHead.ref.sha256 ?? '') || !/^[1-9][0-9]*$/u.test(receipt.controlHead.generation ?? '') ||
      ['foundationManifestSha256', 'terraformAddressesSha256', 'stateJsonSha256', 'outputManifestSha256', 'executableInputsSha256', 'infrastructureInputsSha256']
        .some((field) => !H64.test(receipt[field] ?? ''))) fail('SMOKE_REUSE_RECEIPT_INVALID')
  const prefix = 'projects/' + profile.target.projectId + '/locations/' + profile.target.region + '/'
  for (const [kind, name, image, account] of [
    ['migrationJob', prefix + 'jobs/orgmaster-prod-migration-runner', receipt.migrationRunnerDigest,
      profile.identities.migratorDbLogin + '.gserviceaccount.com'],
    ['abortController', prefix + 'services/orgmaster-prod-abort-controller', receipt.controllerImageDigest, profile.identities.controller],
  ]) {
    const row = receipt.liveTemplates?.[kind]
    const template = kind === 'migrationJob' ? row?.expectedTemplate?.template?.template : row?.expectedTemplate?.template
    if (row?.name !== name || typeof row.expectedUid !== 'string' || !row.expectedUid || !H64.test(row.expectedTemplateSha256 ?? '') ||
        row.expectedTemplateSha256 !== sha256(canonicalize(row.expectedTemplate)) || row.actualTemplateSha256 !== row.expectedTemplateSha256 ||
        typeof row.etag !== 'string' || !row.etag || !/^[1-9][0-9]*$/u.test(row.generation ?? '') ||
        template?.serviceAccount !== account || template.containers?.length !== 1 || template.containers[0].image !== image ||
        (kind === 'abortController' && (!row.servingRevision?.startsWith(name + '/revisions/') ||
          !/^[a-z0-9-]+$/u.test(row.servingRevision.slice((name + '/revisions/').length))))) fail('SMOKE_REUSE_RECEIPT_INVALID')
    if (kind === 'abortController') assertControllerImageResolutionProof({ profile, parentImage: image,
      servingImage: row.servingImageDigest, proof: row.servingImageResolution })
  }
}

export async function buildSmokeInfraReuseReceipt({ root, profile, transport, releaseId, sourceLock, sourceLockRef, baselineIntentRef,
  baseline, rotationRef, observedAt, readSourceFile = readReleaseSourceFile, readInfrastructureTree = readSmokeReuseInfrastructureTree,
  terraformReader = terraformJson }) {
  assertReuseSourceLock(sourceLock, profile)
  if (sourceLock.releaseId !== releaseId || !Number.isFinite(Date.parse(observedAt))) fail('SMOKE_REUSE_SOURCE_INVALID')
  const rotation = (await transport.readJson(rotationRef, EXPECTED.releaseBucket, ['receipts'])).value
  if (rotation.sourceRevision === sourceLock.sourceRevision) fail('SMOKE_REUSE_SOURCE_INVALID')
  const intent = { sourceRevision: sourceLock.sourceRevision, infraReceiptRef: rotationRef }
  const continuation = await assertAppliedSmokeRotation({ root, profile, transport, intent, values: { infra: rotation }, baseline,
    readSourceFile, sourceReuse: true })
  const prior = (await transport.readJson(baseline.intent.infraReceiptRef, EXPECTED.releaseBucket)).value
  const tree = readInfrastructureTree(root, sourceLock.sourceRevision)
  if (![baseline.intent.sourceRevision, prior.sourceRevision, rotation.sourceRevision]
    .every((revision) => tree.equals(readInfrastructureTree(root, revision)))) fail('SMOKE_REUSE_INFRA_CHANGED')
  const executable = executablePaths((file) => readSourceFile(root, sourceLock.sourceRevision, file))
    .map((file) => ({ path: file, sha256: sha256(readSourceFile(root, sourceLock.sourceRevision, file)) }))
  const readCurrent = async () => ({
    controlHead: await readSmokeReuseControl({ profile, transport, baselineIntentRef, baseline }),
    providerState: await readSmokeReuseProviderState({ root, profile, transport, rotation, sourceRevision: sourceLock.sourceRevision, readSourceFile, terraformReader }),
    providerReadback: await readSmokeRotationProvider({ root, profile, transport, continuation, readSourceFile }),
  })
  const before = await readCurrent(), after = await readCurrent()
  // Timestamps may advance; no mutable execution binding may drift while sealed.
  const normalize = (value) => ({ ...value, providerReadback: { ...value.providerReadback, observedAt: null } })
  if (!same(normalize(before), normalize(after))) fail('SMOKE_REUSE_PROVIDER_CAS_CHANGED')
  const core = { schemaVersion: REUSE_SCHEMA, ownerApplicationId: profile.application.id, projectId: profile.target.projectId,
    region: profile.target.region, releaseId, sourceRevision: sourceLock.sourceRevision, sourceSha256: sourceLock.sourceSha256,
    sourceTree: sourceLock.sourceTree, sourceLockRef, baselineIntentRef, reusedInfraReceiptRef: rotationRef,
    priorInfraReceiptRef: baseline.intent.infraReceiptRef, reusedSourceRevision: rotation.sourceRevision,
    foundationManifestSha256: rotation.foundationManifestSha256, migrationRunnerDigest: rotation.migrationRunnerDigest,
    controllerImageDigest: rotation.controllerImageDigest, candidateSmokeRefreshTokenSecretVersion: continuation.newVersion,
    credentialEvidenceRef: continuation.credentialEvidenceRef, appliedObservedAt: continuation.appliedObservedAt,
    executableInputCount: executable.length, executableInputsSha256: sha256(canonicalize(executable)),
    infrastructureInputsSha256: sha256(tree), ...after.providerState, controlHead: after.controlHead,
    providerReadback: after.providerReadback, mutationProfile: 'APP_INFRA_REUSE',
    reuseBasis: 'APPLICATION_SOURCE_ONLY_NO_INFRA_EXECUTABLE_INPUT_CHANGE', status: 'APPLIED',
    releaseAuthority: true, evidenceScope: 'PRODUCTION_PROVIDER_REUSE', credentialMaterialPresent: false, observedAt }
  const receipt = { ...core, receiptSha256: sha256(canonicalize(core)) }
  assertSmokeInfraReuseReceipt({ receipt, profile, sourceLock })
  return receipt
}

export async function assertSmokeInfraReuseContinuation({ root, profile, transport, intent, values, baseline,
  readSourceFile = readReleaseSourceFile, readInfrastructureTree = readSmokeReuseInfrastructureTree }) {
  const receipt = (await transport.readJson(intent.infraReceiptRef, EXPECTED.releaseBucket)).value
  if (!same(receipt, values.infra)) fail('SMOKE_REUSE_RECEIPT_INVALID')
  assertSmokeInfraReuseReceipt({ receipt, profile, sourceLock: values.sourceLock, intent })
  const lock = (await transport.readJson(receipt.sourceLockRef, EXPECTED.releaseBucket)).value
  assertReuseSourceLock(lock, profile)
  if (lock.sourceRevision !== receipt.sourceRevision || lock.sourceSha256 !== receipt.sourceSha256 || lock.sourceTree !== receipt.sourceTree ||
      lock.releaseId !== receipt.releaseId || !same(receipt.priorInfraReceiptRef, baseline.intent.infraReceiptRef)) fail('SMOKE_REUSE_RECEIPT_INVALID')
  const rotation = (await transport.readJson(receipt.reusedInfraReceiptRef, EXPECTED.releaseBucket)).value
  const continuation = await assertAppliedSmokeRotation({ root, profile, transport,
    intent: { ...intent, infraReceiptRef: receipt.reusedInfraReceiptRef }, values: { infra: rotation }, baseline, readSourceFile, sourceReuse: true })
  for (const field of ['foundationManifestSha256', 'migrationRunnerDigest', 'controllerImageDigest', 'terraformAddressCount',
    'terraformAddressesSha256', 'stateLineage', 'stateSerial', 'stateJsonSha256', 'outputManifestSha256', 'credentialEvidenceRef']) {
    if (!same(receipt[field], rotation[field])) fail('SMOKE_REUSE_RECEIPT_INVALID')
  }
  const tree = readInfrastructureTree(root, intent.sourceRevision)
  if (sha256(tree) !== receipt.infrastructureInputsSha256 || ![baseline.intent.sourceRevision, rotation.sourceRevision]
    .every((revision) => tree.equals(readInfrastructureTree(root, revision)))) fail('SMOKE_REUSE_INFRA_CHANGED')
  const executable = executablePaths((file) => readSourceFile(root, intent.sourceRevision, file))
    .map((file) => ({ path: file, sha256: sha256(readSourceFile(root, intent.sourceRevision, file)) }))
  if (sha256(canonicalize(executable)) !== receipt.executableInputsSha256 || executable.length !== receipt.executableInputCount ||
      receipt.appliedObservedAt !== continuation.appliedObservedAt || receipt.reusedSourceRevision !== rotation.sourceRevision ||
      receipt.candidateSmokeRefreshTokenSecretVersion !== continuation.newVersion ||
      receipt.providerReadback.workflowSourceSha256 !== sha256(expectedSmokeWorkflowSource({ root, profile,
        sourceRevision: intent.sourceRevision, version: continuation.newVersion, readSourceFile })) ||
      !same(receipt.controlHead, await readSmokeReuseControl({ profile, transport, baselineIntentRef: intent.baselineIntentRef, baseline }))) fail('SMOKE_REUSE_RECEIPT_INVALID')
  return { ...continuation, evidenceScope: 'OWNER_SEALED_APPLIED_ROTATION_REUSE', infraReceiptRef: intent.infraReceiptRef,
    reusedInfraReceiptRef: receipt.reusedInfraReceiptRef, reusedSourceRevision: receipt.reusedSourceRevision }
}
