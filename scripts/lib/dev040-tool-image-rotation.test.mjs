import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { gunzipSync, gzipSync } from 'node:zlib'

import { canonicalize, sha256 } from './dev012-owner-release-runtime.mjs'
import { createGitSourceIdentity } from './dev012-owner-stage-executor.mjs'
import {
  assertOrdinaryToolRotation,
  assertToolArtifactAssociation,
  assertToolBuildProof,
  assertToolJobLiveReadback,
  assertToolOwner,
  assertToolRotationPlan,
  assertToolSeal,
  MIGRATION_JOB_ADDRESS,
  rotationAddresses,
  sealToolEvidence,
} from './dev040-tool-image-rotation.mjs'

const ROOT = process.cwd()
const INFRA_PROFILE_PATH = 'config/release/dev040-production-release-infra-plan.json'
const PRODUCTION_PROFILE_PATH = 'config/release/dev040-orgmaster-independent-production-v3.json'
const RUNNER_RECIPE = 'infra/google-cloud/dev-040-production-release/migration-runner.Dockerfile'
const INFRA_ROOT = 'infra/google-cloud/dev-040-production-release'
const BUCKET = 'jenfu-platform-prod-orgmaster-release'
const RUNNER_URI = 'asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster-migration-runner'
const CONTROLLER_URI = 'asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster-abort-controller'
const FOUNDATION_HASH = 'a'.repeat(64)
const PREVIOUS_IMAGE = `${RUNNER_URI}@sha256:${'1'.repeat(64)}`
const NEXT_IMAGE = `${RUNNER_URI}@sha256:${'2'.repeat(64)}`
const CONTROLLER_IMAGE = `${CONTROLLER_URI}@sha256:${'3'.repeat(64)}`
const JOB_NAME = 'projects/jenfu-platform-prod/locations/asia-east1/jobs/orgmaster-prod-migration-runner'
const JOB_UID = '00000000-0000-4000-8000-000000000001'

let sourceFixture

function runGit(cwd, args, { bytes = false } = {}) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: bytes ? null : 'utf8',
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  })
  if (result.error || result.status !== 0) {
    throw new Error(`GIT_FIXTURE_FAILED:${args.join(' ')}:${result.stderr?.toString?.() ?? ''}`)
  }
  return bytes ? result.stdout : result.stdout.trim()
}

function readGitBytes(cwd, revision, file) {
  return runGit(cwd, ['show', `${revision}:${file}`], { bytes: true })
}

function createSourceFixture() {
  const root = fs.mkdtempSync(path.join(ROOT, '.dev040-tool-image-rotation-'))
  const sourceRevision = runGit(ROOT, ['rev-parse', 'HEAD'])
  const trackedPaths = runGit(ROOT, [
    'ls-tree', '-r', '--name-only', sourceRevision, '--',
    INFRA_ROOT,
    PRODUCTION_PROFILE_PATH,
    INFRA_PROFILE_PATH,
    'config/dev-010/n1c-orgmaster.json',
  ]).split(/\r?\n/u).filter(Boolean)
  const runnerRecipe = readGitBytes(ROOT, sourceRevision, RUNNER_RECIPE).toString('utf8')
  const runnerCopyInputs = runnerRecipe.split(/\r?\n/u)
    .filter(line => line.startsWith('COPY '))
    .flatMap(line => line.trim().split(/\s+/u).slice(1, -1))
  const paths = [...new Set([...trackedPaths, ...runnerCopyInputs])].sort()

  for (const file of paths) {
    const destination = path.join(root, ...file.split('/'))
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.writeFileSync(destination, readGitBytes(ROOT, sourceRevision, file))
  }

  runGit(root, ['init', '--quiet'])
  runGit(root, ['config', 'user.name', 'Tool Rotation Test'])
  runGit(root, ['config', 'user.email', 'tool-rotation-test@example.invalid'])
  runGit(root, ['add', '--all'])
  runGit(root, ['commit', '--quiet', '-m', 'baseline infrastructure source'])
  const baselineSourceRevision = runGit(root, ['rev-parse', 'HEAD'])

  fs.appendFileSync(path.join(root, ...RUNNER_RECIPE.split('/')), '\n# source-bound image rotation fixture\n')
  runGit(root, ['add', RUNNER_RECIPE])
  runGit(root, ['commit', '--quiet', '-m', 'rotate migration runner recipe'])
  const rotationSourceRevision = runGit(root, ['rev-parse', 'HEAD'])

  fs.writeFileSync(path.join(root, 'application-only-change.txt'), 'ordinary application source change\n')
  runGit(root, ['add', 'application-only-change.txt'])
  runGit(root, ['commit', '--quiet', '-m', 'ordinary source-only change'])
  const ordinarySourceRevision = runGit(root, ['rev-parse', 'HEAD'])

  runGit(root, ['checkout', '--quiet', '--detach', ordinarySourceRevision])
  const changedCopyInput = 'scripts/lib/dev012-production-migration-runner.mjs'
  fs.appendFileSync(path.join(root, ...changedCopyInput.split('/')), '\n// changed after historical tool build\n')
  runGit(root, ['add', changedCopyInput])
  runGit(root, ['commit', '--quiet', '-m', 'change copied runner input after tool build'])
  const copyInputDriftSourceRevision = runGit(root, ['rev-parse', 'HEAD'])

  runGit(root, ['checkout', '--quiet', '--detach', ordinarySourceRevision])
  fs.writeFileSync(path.join(root, '.dockerignore'), '# added after the tool image rotation\n')
  runGit(root, ['add', '.dockerignore'])
  runGit(root, ['commit', '--quiet', '-m', 'add dockerignore after tool image build'])
  const toolInputDriftSourceRevision = runGit(root, ['rev-parse', 'HEAD'])

  runGit(root, ['checkout', '--quiet', '--detach', ordinarySourceRevision])
  fs.appendFileSync(path.join(root, ...`${INFRA_ROOT}/migration.tf`.split('/')), '\n# infrastructure drift fixture\n')
  runGit(root, ['add', `${INFRA_ROOT}/migration.tf`])
  runGit(root, ['commit', '--quiet', '-m', 'change owned infrastructure input'])
  const driftSourceRevision = runGit(root, ['rev-parse', 'HEAD'])

  runGit(root, ['checkout', '--quiet', '--detach', rotationSourceRevision])
  const sourceIdentitySha256 = sha256(createGitSourceIdentity(root, rotationSourceRevision))
  const sourceArchive = runGit(root, ['archive', '--format=tar', '--prefix=source/', rotationSourceRevision], { bytes: true })
  const sourceArchiveBytes = gzipSync(sourceArchive, { level: 9 })
  // Model the native Windows producer bytes independent of the host running tests.
  sourceArchiveBytes[9] = 10
  const sourceArchiveSha256 = sha256(sourceArchiveBytes)

  return {
    root, baselineSourceRevision, rotationSourceRevision, ordinarySourceRevision,
    copyInputDriftSourceRevision, toolInputDriftSourceRevision, driftSourceRevision,
    sourceIdentitySha256, sourceArchive, sourceArchiveBytes, sourceArchiveSha256,
    sourceArchiveObject: `source/archives/${sourceArchiveSha256}/source.tar.gz`,
  }
}

function removeSourceFixture(root) {
  const resolvedRoot = path.resolve(root)
  assert.equal(path.dirname(resolvedRoot), path.resolve(ROOT))
  assert.ok(path.basename(resolvedRoot).startsWith('.dev040-tool-image-rotation-'))
  fs.rmSync(resolvedRoot, { recursive: true, force: true })
}

before(() => {
  sourceFixture = createSourceFixture()
})

after(() => {
  if (sourceFixture) removeSourceFixture(sourceFixture.root)
})

function productionProfile() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, PRODUCTION_PROFILE_PATH), 'utf8'))
}

function infraProfileAt(revision = sourceFixture.rotationSourceRevision) {
  return JSON.parse(readGitBytes(sourceFixture.root, revision, INFRA_PROFILE_PATH).toString('utf8'))
}

function terraformJob(image, extra = {}) {
  return {
    name: 'orgmaster-prod-migration-runner',
    project: 'jenfu-platform-prod',
    location: 'asia-east1',
    template: [{
      parallelism: 1,
      task_count: 1,
      template: [{
        service_account: 'orgmaster-prod-migrator@jenfu-platform-prod.iam.gserviceaccount.com',
        timeout: '1800s',
        max_retries: 0,
        containers: [{ name: 'migration', image, args: ['--bundle-ref-required'] }],
      }],
    }],
    ...extra,
  }
}

function makePlan({
  infraProfile = infraProfileAt(),
  previousImage = PREVIOUS_IMAGE,
  nextImage = NEXT_IMAGE,
  dataAction = address => address.endsWith('current') ? 'no-op' : 'read',
} = {}) {
  const addresses = rotationAddresses(infraProfile)
  const resource_changes = addresses.map(address => {
    const mode = address.startsWith('data.') ? 'data' : 'managed'
    const action = address === MIGRATION_JOB_ADDRESS ? 'update'
      : mode === 'data' ? dataAction(address) : 'no-op'
    return {
      address,
      mode,
      change: {
        actions: [action],
        ...(address === MIGRATION_JOB_ADDRESS ? {
          before: terraformJob(previousImage),
          after: terraformJob(nextImage),
        } : {}),
      },
    }
  })
  return { errored: false, complete: true, resource_changes, deferred_changes: [] }
}

function typeForAddress(address) {
  return (address.startsWith('data.') ? address.slice('data.'.length) : address).split('.')[0]
}

function nativeDataValues(address) {
  if (address === 'data.google_project.current') return { project_id: 'jenfu-platform-prod', number: '9536592944' }
  if (address === 'data.google_cloud_run_v2_service.application') {
    return { project: 'jenfu-platform-prod', location: 'asia-east1', name: 'orgmaster-prod' }
  }
  if (address === 'data.google_service_account.runtime' || address === 'data.google_service_account.migrator') {
    const accountId = address.endsWith('.runtime') ? 'orgmaster-prod-runtime' : 'orgmaster-prod-migrator'
    const email = `${accountId}@jenfu-platform-prod.iam.gserviceaccount.com`
    return { project: 'jenfu-platform-prod', account_id: accountId, email,
      name: `projects/jenfu-platform-prod/serviceAccounts/${email}`, unique_id: '111111111111111111111', disabled: false }
  }
  if (address === 'data.google_storage_project_service_account.gcs') {
    return { email_address: 'service-9536592944@gs-project-accounts.iam.gserviceaccount.com' }
  }
  if (address === 'data.google_secret_manager_secret.controller_github_token') {
    const secretId = 'orgmaster-prod-controller-github-read-token'
    return { project: 'jenfu-platform-prod', secret_id: secretId, name: `projects/jenfu-platform-prod/secrets/${secretId}` }
  }
  throw new Error(`UNEXPECTED_DATA_ADDRESS:${address}`)
}

function nativePlanFixture() {
  const infraProfile = infraProfileAt()
  const addresses = rotationAddresses(infraProfile)
  const plan = makePlan({ infraProfile })
  for (const row of plan.resource_changes.filter(value => value.mode === 'managed')) {
    row.change.before ??= { id: row.address }
    row.change.after ??= structuredClone(row.change.before)
  }
  const managedRows = plan.resource_changes.filter(row => row.mode === 'managed')
  const managedAddresses = addresses.filter(address => !address.startsWith('data.'))
  const dataAddresses = addresses.filter(address => address.startsWith('data.'))
  const stateResources = addresses.map(address => {
    const managed = !address.startsWith('data.')
    const planRow = managedRows.find(row => row.address === address)
    return {
      address,
      mode: managed ? 'managed' : 'data',
      type: typeForAddress(address),
      values: managed ? structuredClone(planRow.change.before) : nativeDataValues(address),
    }
  })
  const configurationResources = [...new Set(addresses.map(address => address.split('[')[0]))].sort().map(address => ({
    address,
    mode: address.startsWith('data.') ? 'data' : 'managed',
    type: typeForAddress(address),
    provider_config_key: 'google',
  }))
  plan.resource_changes = managedRows
  plan.prior_state = { values: { root_module: { resources: stateResources } } }
  plan.configuration = { root_module: { resources: configurationResources } }
  plan.planned_values = { root_module: { resources: managedRows.map(row => ({
    address: row.address, mode: row.mode, type: typeForAddress(row.address), values: structuredClone(row.change.after),
  })) } }
  plan.applyable = true
  rowFor(plan, MIGRATION_JOB_ADDRESS).change.after_unknown = {}
  return { plan, addresses, managedAddresses, dataAddresses }
}

function migrationToolBuildProofCore(profile, sourceArchiveBytes = sourceFixture.sourceArchiveBytes) {
  const releaseId = 'REL-TOOL-ROTATION-0001'
  const toolProfile = structuredClone(profile)
  toolProfile.artifact.uri = RUNNER_URI
  toolProfile.build.dockerfile = RUNNER_RECIPE
  toolProfile.build.dockerTarget = 'runtime'
  const imageTag = `${RUNNER_URI}:release-${sourceFixture.rotationSourceRevision}`
  const sourceArchiveSha256 = sha256(sourceArchiveBytes)
  const sourceArchiveObject = `source/archives/${sourceArchiveSha256}/source.tar.gz`
  const sourceObject = {
    uri: `gs://${BUCKET}/${sourceArchiveObject}`,
    sha256: sourceArchiveSha256,
    generation: '7',
    crc32c: 'fixture-crc32c',
  }
  const storage = { bucket: BUCKET, object: sourceArchiveObject, generation: sourceObject.generation }
  const request = {
    source: { storageSource: { ...storage } },
    steps: [{
      name: toolProfile.build.dockerBuilderImage,
      dir: 'source',
      args: [
        'build', '--pull=false', '--no-cache', '--file', toolProfile.build.dockerfile,
        '--target', toolProfile.build.dockerTarget,
        '--build-arg', `SOURCE_REVISION=${sourceFixture.rotationSourceRevision}`,
        '--build-arg', `SOURCE_TREE=${sourceFixture.sourceIdentitySha256}`,
        '--build-arg', 'SOURCE_CREATED_AT=1970-01-01T00:00:00Z',
        '--build-arg', `SOURCE_VERSION=${sourceFixture.rotationSourceRevision}`,
        '--build-arg', 'SOURCE_STATE=frozen', '--tag', imageTag, '.',
      ],
    }],
    images: [imageTag],
    timeout: '1800s',
    queueTtl: '300s',
    logsBucket: `gs://${BUCKET}/logs/cloud-build`,
    serviceAccount: `projects/${profile.target.projectId}/serviceAccounts/${profile.identities.builder}`,
    options: { logging: 'GCS_ONLY', logStreamingOption: 'STREAM_OFF', requestedVerifyOption: 'VERIFIED' },
  }
  const buildInputSha256 = sha256(canonicalize({
    ownerApplicationId: profile.application.id,
    sourceArchiveSha256: sourceObject.sha256,
    request,
  }))
  const buildId = '12345678-1234-1234-1234-123456789abc'
  const imageSha = NEXT_IMAGE.slice(RUNNER_URI.length + 1)
  const resourceUrl = `https://${NEXT_IMAGE}`
  const cloudBuild = {
    id: buildId,
    name: `projects/${profile.target.projectId}/locations/${profile.target.region}/builds/${buildId}`,
    projectId: profile.target.projectId,
    status: 'SUCCESS',
    serviceAccount: request.serviceAccount,
    createTime: '2026-10-18T00:00:00.000Z',
    startTime: '2026-10-18T00:00:02.000Z',
    finishTime: '2026-10-18T00:01:00.000Z',
    source: { storageSource: { ...storage } },
    sourceProvenance: { resolvedStorageSource: { ...storage } },
    steps: structuredClone(request.steps),
    images: [...request.images],
    tags: ['dev-012', profile.application.id, `owner-build-${buildInputSha256}`, releaseId.toLowerCase(), 'owner-submission-1'],
    results: { images: [{ name: imageTag, digest: imageSha }] },
    options: structuredClone(request.options),
  }
  const artifactRegistry = {
    uri: NEXT_IMAGE,
    name: `projects/${profile.target.projectId}/locations/${profile.target.region}/repositories/${profile.artifact.repository}/dockerImages/${profile.artifact.migrationRunnerImage}@${imageSha}`,
  }
  const scan = {
    resourceUrl,
    buildOccurrenceNames: ['projects/p/occurrences/build-1'],
    discoveryOccurrenceNames: ['projects/p/occurrences/discovery-1'],
    sbomOccurrenceNames: ['projects/p/occurrences/sbom-1'],
    vulnerabilityCount: 2,
    rawHighOrCriticalVulnerabilityCount: 0,
    blockingVulnerabilityCount: 0,
    notAffectedAssessments: [{ cve: 'CVE-TEST-0001', policy: { id: 'reviewed-policy' }, assessment: { status: 'NOT_AFFECTED' } }],
    sbomExport: { resourceUrl, discoveryOccurrenceId: 'projects/p/locations/asia-east1/occurrences/sbom-export-1' },
    observedAt: '2026-10-18T00:01:30.000Z',
    status: 'PASS',
  }
  return {
    schemaVersion: 'orgmaster.tool-image-build.v1',
    ownerApplicationId: profile.application.id,
    releaseId,
    sourceRevision: sourceFixture.rotationSourceRevision,
    sourceSha256: sourceFixture.sourceIdentitySha256,
    artifactDigest: NEXT_IMAGE,
    status: 'PASS',
    sourceObject,
    cloudBuild,
    buildInputSha256,
    artifactRegistry,
    scan,
    buildDisposition: 'BUILT',
    reused: false,
  }
}

function planInput(overrides = {}) {
  return {
    plan: makePlan(),
    infraProfile: infraProfileAt(),
    previousImage: PREVIOUS_IMAGE,
    nextImage: NEXT_IMAGE,
    ...overrides,
  }
}

function rowFor(plan, address) {
  const row = plan.resource_changes.find(value => value.address === address)
  assert.ok(row, `fixture is missing ${address}`)
  return row
}

function assertRotationCode(run, code) {
  assert.throws(run, error => error?.code === `TOOL_ROTATION_${code}`)
}

test('accepts the frozen complete profile-address plan with one migration image update', () => {
  const plan = makePlan()
  const addresses = rotationAddresses(infraProfileAt())
  assert.deepEqual(plan.resource_changes.map(row => row.address).sort(), addresses)
  const proof = assertToolRotationPlan(planInput({ plan }))
  assert.equal(proof.addressActions.length, addresses.length)
  assert.deepEqual(proof.updates.map(row => row.address), [MIGRATION_JOB_ADDRESS])
  assert.equal(rowFor(plan, MIGRATION_JOB_ADDRESS).change.actions[0], 'update')
  assert.ok(plan.resource_changes.filter(row => row.mode === 'data').every(row => ['read', 'no-op'].includes(row.change.actions[0])))
  assert.ok(plan.resource_changes.filter(row => row.mode !== 'data' && row.address !== MIGRATION_JOB_ADDRESS)
    .every(row => row.change.actions[0] === 'no-op'))
})

test('rejects an omitted, duplicated, or substituted address from the complete configured set', () => {
  const omitted = makePlan()
  omitted.resource_changes.pop()
  assertRotationCode(() => assertToolRotationPlan(planInput({ plan: omitted })), 'ADDRESS_SET_INVALID')

  const missingDataRead = makePlan()
  const dataReadIndex = missingDataRead.resource_changes.findIndex(row => row.mode === 'data' && row.change.actions[0] === 'read')
  assert.notEqual(dataReadIndex, -1)
  missingDataRead.resource_changes.splice(dataReadIndex, 1)
  assertRotationCode(() => assertToolRotationPlan(planInput({ plan: missingDataRead })), 'ADDRESS_SET_INVALID')

  const duplicated = makePlan()
  duplicated.resource_changes.push(structuredClone(duplicated.resource_changes[0]))
  assertRotationCode(() => assertToolRotationPlan(planInput({ plan: duplicated })), 'ADDRESS_SET_INVALID')

  const substituted = makePlan()
  substituted.resource_changes[0].address = 'google_project_iam_member.unconfigured'
  assertRotationCode(() => assertToolRotationPlan(planInput({ plan: substituted })), 'ADDRESS_SET_INVALID')
})

test('normalizes native absent data changes only from the exact full prior state', () => {
  const { plan, addresses, managedAddresses, dataAddresses } = nativePlanFixture()
  assert.deepEqual(plan.resource_changes.map(row => row.address).sort(), managedAddresses)
  assert.deepEqual(plan.prior_state.values.root_module.resources.map(row => row.address).sort(), addresses)
  const expectedConfigurationAddresses = [...new Set(addresses.map(address => address.split('[')[0]))].sort()
  assert.deepEqual(plan.configuration.root_module.resources.map(row => row.address), expectedConfigurationAddresses)
  assert.ok(plan.configuration.root_module.resources.every(row => row.provider_config_key === 'google'
    && row.type === typeForAddress(row.address)
    && row.mode === (row.address.startsWith('data.') ? 'data' : 'managed')))
  assert.deepEqual(plan.planned_values.root_module.resources.map(row => row.address).sort(), managedAddresses)
  assert.ok(plan.planned_values.root_module.resources.every(row => !row.address.startsWith('data.')))
  assert.deepEqual(rowFor(plan, MIGRATION_JOB_ADDRESS).change.after_unknown, {})

  const proof = assertToolRotationPlan(planInput({ plan }))
  const expectedActions = addresses.map(address => [address, address === MIGRATION_JOB_ADDRESS ? 'update' : 'no-op'])
    .sort((left, right) => left[0].localeCompare(right[0]))
  assert.deepEqual(proof.addressActions, expectedActions)
  assert.deepEqual(dataAddresses.map(address => proof.addressActions.find(([candidate]) => candidate === address)),
    dataAddresses.map(address => [address, 'no-op']))
  assert.deepEqual(proof.updates.map(row => row.address), [MIGRATION_JOB_ADDRESS])
})

test('rejects native plans with a missing managed change, missing prior state, or bad prior data', () => {
  const missingManaged = nativePlanFixture()
  missingManaged.plan.resource_changes.splice(missingManaged.plan.resource_changes.findIndex(row => row.address === MIGRATION_JOB_ADDRESS), 1)
  assertRotationCode(() => assertToolRotationPlan(planInput({ plan: missingManaged.plan })), 'ADDRESS_SET_INVALID')

  const missingPrior = nativePlanFixture()
  delete missingPrior.plan.prior_state
  assertRotationCode(() => assertToolRotationPlan(planInput({ plan: missingPrior.plan })), 'ADDRESS_SET_INVALID')

  const badDataMode = nativePlanFixture()
  const dataState = badDataMode.plan.prior_state.values.root_module.resources.find(row => row.address === badDataMode.dataAddresses[0])
  dataState.mode = 'managed'
  assertRotationCode(() => assertToolRotationPlan(planInput({ plan: badDataMode.plan })), 'ADDRESS_SET_INVALID')

  const badDataValues = nativePlanFixture()
  const emptyDataState = badDataValues.plan.prior_state.values.root_module.resources.find(row => row.address === badDataValues.dataAddresses[0])
  emptyDataState.values = null
  assertRotationCode(() => assertToolRotationPlan(planInput({ plan: badDataValues.plan })), 'ADDRESS_SET_INVALID')
})

test('rejects create, delete, IAM, Secret, or any second resource mutation', () => {
  for (const actions of [['create'], ['delete'], ['delete', 'create']]) {
    const plan = makePlan()
    rowFor(plan, MIGRATION_JOB_ADDRESS).change.actions = actions
    assertRotationCode(() => assertToolRotationPlan(planInput({ plan })), 'ACTION_DENIED')
  }

  const addresses = rotationAddresses(infraProfileAt())
  const iamAddress = addresses.find(address => address.includes('iam_member'))
  const secretAddress = addresses.find(address => address.startsWith('google_secret_manager_secret.'))
  assert.ok(iamAddress)
  assert.ok(secretAddress)

  for (const address of [iamAddress, secretAddress, 'google_cloud_run_v2_service.abort_controller[0]']) {
    const plan = makePlan()
    rowFor(plan, address).change.actions = ['update']
    assertRotationCode(() => assertToolRotationPlan(planInput({ plan })), 'ACTION_DENIED')
  }
})

test('rejects non-image changes inside the migration job update', () => {
  const plan = makePlan()
  rowFor(plan, MIGRATION_JOB_ADDRESS).change.after.template[0].template[0].containers[0].args.push('--unexpected')
  assertRotationCode(() => assertToolRotationPlan(planInput({ plan })), 'NON_IMAGE_CHANGE_DENIED')
})

test('rejects the wrong owner, runner repository, malformed digest, or unbound after-image', () => {
  const wrongOwner = { ...infraProfileAt(), ownerApplicationId: 'platform' }
  assertRotationCode(() => assertToolRotationPlan(planInput({ infraProfile: wrongOwner })), 'ADDRESS_SET_INVALID')

  for (const image of [
    `asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/other-runner@sha256:${'4'.repeat(64)}`,
    `${RUNNER_URI}@sha256:${'A'.repeat(64)}`,
    `${RUNNER_URI}@sha256:${'5'.repeat(63)}`,
  ]) {
    assertRotationCode(() => assertToolRotationPlan(planInput({ nextImage: image })), 'PLAN_INVALID')
  }

  const plan = makePlan()
  rowFor(plan, MIGRATION_JOB_ADDRESS).change.after.template[0].template[0].containers[0].image = `${RUNNER_URI}@sha256:${'6'.repeat(64)}`
  assertRotationCode(() => assertToolRotationPlan(planInput({ plan })), 'IMAGE_INVALID')
})

test('allows an explicitly reviewed no-op plan only when the runner digest is already current', () => {
  const plan = makePlan({ previousImage: NEXT_IMAGE, nextImage: NEXT_IMAGE })
  rowFor(plan, MIGRATION_JOB_ADDRESS).change.actions = ['no-op']
  assertRotationCode(() => assertToolRotationPlan(planInput({ plan, previousImage: NEXT_IMAGE, nextImage: NEXT_IMAGE })), 'PLAN_INVALID')
  const proof = assertToolRotationPlan({ ...planInput({ plan, previousImage: NEXT_IMAGE, nextImage: NEXT_IMAGE }), allowNoop: true })
  assert.deepEqual(proof.updates, [])
  assert.equal(rowFor(plan, MIGRATION_JOB_ADDRESS).change.actions[0], 'no-op')
})

function providerJob(image, generation) {
  return {
    name: JOB_NAME,
    uid: JOB_UID,
    generation: String(generation),
    observedGeneration: String(generation),
    reconciling: false,
    template: {
      template: {
        serviceAccount: 'orgmaster-prod-migrator@jenfu-platform-prod.iam.gserviceaccount.com',
        timeout: '1800s',
        maxRetries: 0,
        containers: [{ name: 'migration', image, args: ['--bundle-ref-required'] }],
      },
    },
  }
}

function makeReceiptHarness({
  intentSourceRevision = sourceFixture.rotationSourceRevision,
  receiptSourceRevision = sourceFixture.rotationSourceRevision,
  baselineUsesRotation = false,
  sourceArchiveBytes = sourceFixture.sourceArchiveBytes,
  buildPatch = {},
  proofPatch = {},
  receiptPatch = {},
  outputPatch = {},
} = {}) {
  const profile = productionProfile()
  const infraProfile = infraProfileAt()
  const plan = {
    ...nativePlanFixture().plan,
    variables: {
      source_revision: { value: receiptSourceRevision },
      migration_runner_image_digest: { value: NEXT_IMAGE },
      controller_image_digest: { value: CONTROLLER_IMAGE },
      foundation_manifest_sha256: { value: FOUNDATION_HASH },
    },
  }
  const planBytes = Buffer.from(canonicalize(plan))
  const binaryPlanBytes = Buffer.from('synthetic-saved-terraform-plan')
  const outputManifest = {
    foundation_manifest_sha256: FOUNDATION_HASH,
    migration_runner_digest: NEXT_IMAGE,
    controller_image_digest: CONTROLLER_IMAGE,
    source_revision: receiptSourceRevision,
    project_id: profile.target.projectId,
    region: profile.target.region,
    application_service: profile.target.serviceName,
    release_bucket: profile.artifact.releaseBucket,
    incident_runtime: true,
    ...outputPatch,
  }
  const outputBytes = Buffer.from(canonicalize(outputManifest))
  const state = {
    stateMeta: { lineage: '11111111-2222-4333-8444-555555555555', serial: 41 },
    stateJson: {
      values: {
        root_module: { resources: rotationAddresses(infraProfile).map(address => ({
          address,
          values: address === MIGRATION_JOB_ADDRESS ? terraformJob(NEXT_IMAGE) : {},
        })) },
        outputs: { app_release_infra_manifest: { value: outputManifest } },
      },
    },
  }
  const stateBytes = Buffer.from(canonicalize(state))
  const beforeJob = providerJob(PREVIOUS_IMAGE, 40)
  const afterJob = providerJob(NEXT_IMAGE, 41)
  const jsonObjects = new Map()
  const byteObjects = new Map()

  const putJson = (name, value, folder = 'tool-rotation') => {
    const bytes = Buffer.from(canonicalize(value))
    const ref = { uri: `gs://${BUCKET}/receipts/${folder}/${name}.json`, sha256: sha256(bytes) }
    jsonObjects.set(ref.uri, { ref, bytes, value: JSON.parse(bytes.toString('utf8')) })
    return ref
  }
  const previousInfra = {
    ownerApplicationId: 'orgmaster',
    projectId: profile.target.projectId,
    region: profile.target.region,
    sourceRevision: sourceFixture.baselineSourceRevision,
    foundationManifestSha256: FOUNDATION_HASH,
    migrationRunnerDigest: PREVIOUS_IMAGE,
    controllerImageDigest: CONTROLLER_IMAGE,
  }
  const previousInfraRef = putJson('app-infra', previousInfra, 'releases/ROTATION-BASELINE')
  const originalBaselineIntent = {
    ownerApplicationId: 'orgmaster',
    releaseId: 'ROTATION-BASELINE',
    sourceRevision: sourceFixture.baselineSourceRevision,
    infraReceiptRef: previousInfraRef,
  }
  const originalBaselineIntentRef = putJson('release-intent', originalBaselineIntent, 'releases/ROTATION-BASELINE')
  const controlCore = {
    schemaVersion: 'jenfu.dev012.owner-control-head.v1',
    state: 'FINALIZED',
    result: 'RELEASED',
    ownerApplicationId: 'orgmaster',
    service: 'orgmaster-prod',
    sourceRevision: sourceFixture.baselineSourceRevision,
    releaseId: originalBaselineIntent.releaseId,
  }
  const controlSnapshot = { ...controlCore, controlSha256: sha256(canonicalize(controlCore)) }
  const controlSnapshotRef = putJson('control-head', controlSnapshot, 'releases/ROTATION-BASELINE')
  const planJsonRef = putJson('plan-json', plan)
  const buildProof = sealToolEvidence({ ...migrationToolBuildProofCore(profile, sourceArchiveBytes), ...buildPatch })
  const buildProofRef = putJson('build-proof', buildProof)
  byteObjects.set(buildProof.sourceObject.uri, Buffer.from(sourceArchiveBytes))
  const afterStateRef = putJson('after-state', state)
  const beforeState = structuredClone(state)
  beforeState.stateMeta.serial = 40
  beforeState.stateJson.values.root_module.resources.find(row => row.address === MIGRATION_JOB_ADDRESS).values = terraformJob(PREVIOUS_IMAGE)
  const beforeManifest = beforeState.stateJson.values.outputs.app_release_infra_manifest.value
  beforeManifest.source_revision = sourceFixture.baselineSourceRevision
  beforeManifest.migration_runner_digest = PREVIOUS_IMAGE
  const beforeStateRef = putJson('before-state', beforeState)
  const outputManifestRef = putJson('output-manifest', outputManifest)
  const providerJobBeforeRef = putJson('provider-job-before', beforeJob)
  const providerJobAfterRef = putJson('provider-job-after', afterJob)
  const binaryPlanRef = { uri: `gs://${BUCKET}/receipts/tool-rotation/saved-plan.bin`, sha256: sha256(binaryPlanBytes) }
  byteObjects.set(binaryPlanRef.uri, binaryPlanBytes)

  const derived = assertToolRotationPlan({ plan, infraProfile, previousImage: PREVIOUS_IMAGE, nextImage: NEXT_IMAGE })
  const imageRotation = {
    ...derived,
    sourceRevision: receiptSourceRevision,
    planJsonSha256: sha256(planBytes),
    ...proofPatch,
  }
  const toolRotation = {
    schemaVersion: 'orgmaster.ordinary-tool-image-rotation.v1',
    ddlExecuted: 0,
    baselineSourceRevision: sourceFixture.baselineSourceRevision,
    previousMigrationRunnerDigest: PREVIOUS_IMAGE,
    previousControllerImageDigest: CONTROLLER_IMAGE,
    jobUid: JOB_UID,
    baselineIntentRef: originalBaselineIntentRef,
    baselineInfraRef: previousInfraRef,
    beforeStateRef,
    controlSnapshotRef,
    controlBaseline: { sha256: controlSnapshotRef.sha256 },
    planJsonRef,
    buildProofRef,
    afterStateRef,
    outputManifestRef,
    providerJobBeforeRef,
    providerJobAfterRef,
    binaryPlanRef,
    ...(buildProof.sourceRevision === receiptSourceRevision ? {} : {
      artifactSourceProof: reviewedToolBuildSourceProof(profile, buildProof.sourceRevision, receiptSourceRevision),
    }),
    sourceProof: {
      sourceRevision: receiptSourceRevision,
      repository: profile.application.repository,
      branch: profile.application.branch,
      status: 'OFFICIAL_MERGED_PR_VERIFIED',
      branchProtected: true,
      requiredSourceQc: 'SUCCESS',
    },
  }
  const core = {
    schemaVersion: 'jenfu.dev012.app-infra-receipt.v1',
    ownerApplicationId: 'orgmaster',
    projectId: 'jenfu-platform-prod',
    region: 'asia-east1',
    sourceRevision: receiptSourceRevision,
    foundationManifestSha256: outputManifest.foundation_manifest_sha256,
    migrationRunnerDigest: NEXT_IMAGE,
    controllerImageDigest: CONTROLLER_IMAGE,
    terraformAddressCount: rotationAddresses(infraProfile).length,
    terraformAddressesSha256: sha256(canonicalize(rotationAddresses(infraProfile))),
    binaryPlanSha256: sha256(binaryPlanBytes),
    planJsonSha256: sha256(planBytes),
    stateJsonSha256: sha256(stateBytes),
    stateSerial: state.stateMeta.serial,
    stateLineage: state.stateMeta.lineage,
    outputManifestSha256: sha256(outputBytes),
    imageRotation,
    toolRotation,
    mutationProfile: 'APP_INFRA_IMAGE_ROTATION',
    status: 'APPLIED',
    releaseAuthority: true,
    evidenceScope: 'PRODUCTION_PROVIDER',
    observedAt: '2026-10-18T00:00:00.000Z',
    ...receiptPatch,
  }
  const receipt = sealToolEvidence(core)
  const receiptRef = putJson('app-infra', receipt, 'releases/ROTATION-001')
  const ordinaryBaselineIntentRef = putJson('release-intent', {
    ownerApplicationId: 'orgmaster',
    releaseId: 'ORDINARY-BASELINE',
    sourceRevision: sourceFixture.ordinarySourceRevision,
    infraReceiptRef: receiptRef,
  }, 'releases/ORDINARY-BASELINE')
  const currentIntentBaselineRef = baselineUsesRotation ? ordinaryBaselineIntentRef : originalBaselineIntentRef
  const intent = {
    sourceRevision: intentSourceRevision,
    baselineIntentRef: currentIntentBaselineRef,
    infraReceiptRef: receiptRef,
  }
  const baseline = {
    intent: { infraReceiptRef: baselineUsesRotation ? receiptRef : previousInfraRef },
  }
  const transport = {
    async readJson(ref) {
      const item = jsonObjects.get(ref.uri)
      if (!item || item.ref.sha256 !== ref.sha256) throw new Error('FIXTURE_JSON_REF_INVALID')
      return { ref: item.ref, bytes: Buffer.from(item.bytes), value: structuredClone(item.value) }
    },
    async readBytes(uri) {
      const bytes = byteObjects.get(uri)
      if (!bytes) throw new Error('FIXTURE_BYTES_MISSING')
      return { bytes: Buffer.from(bytes) }
    },
    async request() { return structuredClone(afterJob) },
  }

  return {
    profile, transport, intent, baseline, receipt, receiptRef, jsonObjects, byteObjects,
    originalBaselineIntentRef, previousInfraRef, controlSnapshotRef, controlSnapshot, planJsonRef, buildProofRef, binaryPlanRef,
    putJson,
    planBytes, binaryPlanBytes, stateBytes, outputBytes,
  }
}

function resealReceipt(fixture) {
  const { receiptSha256: _oldHash, ...core } = fixture.receipt
  fixture.receipt = sealToolEvidence(core)
}

function replaceJsonObject(fixture, ref, value) {
  const bytes = Buffer.from(canonicalize(value))
  const nextRef = { uri: ref.uri, sha256: sha256(bytes) }
  fixture.jsonObjects.set(nextRef.uri, { ref: nextRef, bytes, value: JSON.parse(bytes.toString('utf8')) })
  return nextRef
}

function validateRotationFixture(fixture) {
  return assertOrdinaryToolRotation({
    root: sourceFixture.root, profile: fixture.profile, transport: fixture.transport,
    intent: fixture.intent, receipt: fixture.receipt, baseline: fixture.baseline,
  })
}

function mutatePlanEvidence(fixture, mutate) {
  const currentRef = fixture.receipt.toolRotation.planJsonRef
  const plan = structuredClone(fixture.jsonObjects.get(currentRef.uri).value)
  mutate(plan)
  const nextRef = replaceJsonObject(fixture, currentRef, plan)
  fixture.receipt.toolRotation.planJsonRef = nextRef
  fixture.receipt.planJsonSha256 = nextRef.sha256
  fixture.receipt.imageRotation.planJsonSha256 = nextRef.sha256
  resealReceipt(fixture)
}

function mutateBuildEvidence(fixture, mutate) {
  const currentRef = fixture.receipt.toolRotation.buildProofRef
  const { receiptSha256: _oldHash, ...buildCore } = fixture.jsonObjects.get(currentRef.uri).value
  const updatedCore = structuredClone(buildCore)
  mutate(updatedCore)
  const updatedBuild = sealToolEvidence(updatedCore)
  fixture.receipt.toolRotation.buildProofRef = replaceJsonObject(fixture, currentRef, updatedBuild)
  resealReceipt(fixture)
}

function reviewedToolBuildSourceProof(profile, buildSourceRevision, rotationSourceRevision) {
  return {
    schemaVersion: 'orgmaster.reviewed-tool-build-source.v1',
    sourceRevision: buildSourceRevision,
    rotationSourceRevision,
    sourceTree: runGit(sourceFixture.root, ['rev-parse', `${buildSourceRevision}^{tree}`]),
    repository: profile.application.repository,
    branch: profile.application.branch,
    pullRequestNumber: 417,
    pullRequestUrl: `https://github.com/${profile.application.repository}/pull/417`,
    mergedAt: '2026-10-18T00:00:00.000Z',
    requiredSourceQc: 'SUCCESS',
    requiredSourceQcCheckId: 9417,
    status: 'HISTORICAL_MERGED_SOURCE_VERIFIED',
  }
}

test('accepts the first rotation and a later source-only release reusing its immutable receipt', async () => {
  const first = makeReceiptHarness()
  const firstResult = await assertOrdinaryToolRotation({
    root: sourceFixture.root, profile: first.profile, transport: first.transport,
    intent: first.intent, receipt: first.receipt, baseline: first.baseline,
  })
  assert.equal(Object.hasOwn(first.receipt.toolRotation, 'artifactSourceProof'), false)
  assert.equal(firstResult.evidenceScope, 'OWNER_SEALED_TOOL_IMAGE_ROTATION')
  assert.equal(firstResult.terraformAddressCount, rotationAddresses(infraProfileAt()).length)
  assert.equal(firstResult.ddlExecuted, 0)

  const later = makeReceiptHarness({
    intentSourceRevision: sourceFixture.ordinarySourceRevision,
    baselineUsesRotation: true,
  })
  const priorHead = runGit(sourceFixture.root, ['rev-parse', 'HEAD'])
  try {
    runGit(sourceFixture.root, ['checkout', '--quiet', '--detach', sourceFixture.ordinarySourceRevision])
    assert.equal(runGit(sourceFixture.root, ['rev-parse', 'HEAD']), sourceFixture.ordinarySourceRevision)
    const laterResult = await assertOrdinaryToolRotation({
      root: sourceFixture.root, profile: later.profile, transport: later.transport,
      intent: later.intent, receipt: later.receipt, baseline: later.baseline,
    })
    assert.equal(later.intent.sourceRevision, sourceFixture.ordinarySourceRevision)
    assert.deepEqual(later.intent.infraReceiptRef, later.baseline.intent.infraReceiptRef)
    assert.equal(laterResult.sourceRevision, sourceFixture.rotationSourceRevision)
    assert.equal(laterResult.migrationRunnerDigest, NEXT_IMAGE)
  } finally {
    runGit(sourceFixture.root, ['checkout', '--quiet', '--detach', priorHead])
  }
})

test('accepts a complete consumer receipt associating a historical image build with its newer rotation source', async () => {
  const fixture = makeReceiptHarness({
    intentSourceRevision: sourceFixture.ordinarySourceRevision,
    baselineUsesRotation: true,
    receiptSourceRevision: sourceFixture.ordinarySourceRevision,
  })
  const priorHead = runGit(sourceFixture.root, ['rev-parse', 'HEAD'])
  try {
    runGit(sourceFixture.root, ['checkout', '--quiet', '--detach', sourceFixture.ordinarySourceRevision])
    const build = fixture.jsonObjects.get(fixture.receipt.toolRotation.buildProofRef.uri).value
    assert.equal(build.sourceRevision, sourceFixture.rotationSourceRevision)
    assert.equal(build.artifactDigest, NEXT_IMAGE)
    assert.equal(build.cloudBuild.id, '12345678-1234-1234-1234-123456789abc')
    assert.equal(build.cloudBuild.createTime, '2026-10-18T00:00:00.000Z')
    assert.equal(build.sourceObject.sha256, sourceFixture.sourceArchiveSha256)
    assert.deepEqual(fixture.receipt.toolRotation.artifactSourceProof,
      reviewedToolBuildSourceProof(fixture.profile, sourceFixture.rotationSourceRevision, sourceFixture.ordinarySourceRevision))
    const result = await validateRotationFixture(fixture)
    assert.equal(result.sourceRevision, sourceFixture.ordinarySourceRevision)
    assert.equal(result.migrationRunnerDigest, NEXT_IMAGE)
  } finally {
    runGit(sourceFixture.root, ['checkout', '--quiet', '--detach', priorHead])
  }
})

test('prepare validates sealed rotation evidence without a live Job read; migrate readback separately rejects drift', async () => {
  const fixture = makeReceiptHarness()
  let requestCount = 0
  fixture.transport.request = async () => {
    requestCount += 1
    throw new Error('LIVE_JOB_READ_FORBIDDEN_DURING_PREPARE')
  }
  const summary = await assertOrdinaryToolRotation({
    root: sourceFixture.root, profile: fixture.profile, transport: fixture.transport,
    intent: fixture.intent, receipt: fixture.receipt, baseline: fixture.baseline, readLiveJob: false,
  })
  assert.equal(summary.evidenceScope, 'OWNER_SEALED_TOOL_IMAGE_ROTATION')
  assert.equal(summary.migrationRunnerDigest, NEXT_IMAGE)
  assert.equal(requestCount, 0)

  const recordedJob = fixture.jsonObjects.get(fixture.receipt.toolRotation.providerJobAfterRef.uri).value
  const driftedJob = structuredClone(recordedJob)
  driftedJob.template.template.containers[0].args.push('--live-drift')
  fixture.transport.request = async url => {
    requestCount += 1
    assert.equal(url, `https://run.googleapis.com/v2/${JOB_NAME}`)
    return driftedJob
  }
  await assert.rejects(() => assertToolJobLiveReadback({
    profile: fixture.profile, transport: fixture.transport, receipt: fixture.receipt,
  }), error => error?.code === 'TOOL_ROTATION_LIVE_JOB_DRIFT')
  assert.equal(requestCount, 1)

  const invalidSource = makeReceiptHarness()
  invalidSource.receipt.toolRotation.sourceProof.status = 'UNVERIFIED'
  resealReceipt(invalidSource)
  invalidSource.transport.request = async () => {
    requestCount += 1
    throw new Error('LIVE_JOB_READ_FORBIDDEN_DURING_PREPARE')
  }
  await assert.rejects(() => assertOrdinaryToolRotation({
    root: sourceFixture.root, profile: invalidSource.profile, transport: invalidSource.transport,
    intent: invalidSource.intent, receipt: invalidSource.receipt, baseline: invalidSource.baseline, readLiveJob: false,
  }), error => error?.code === 'TOOL_ROTATION_SOURCE_PROOF_INVALID')
  assert.equal(requestCount, 1)
})

test('artifact association rejects changed COPY/context inputs and a mismatched historical source proof', () => {
  const profile = productionProfile()
  const buildSourceRevision = sourceFixture.rotationSourceRevision
  const assertAssociation = (currentRevision, proof) => assertToolArtifactAssociation({
    root: sourceFixture.root, profile, sourceRevision: currentRevision, buildSourceRevision, proof,
  })
  assert.doesNotThrow(() => assertAssociation(sourceFixture.ordinarySourceRevision,
    reviewedToolBuildSourceProof(profile, buildSourceRevision, sourceFixture.ordinarySourceRevision)))

  for (const changedSourceRevision of [sourceFixture.copyInputDriftSourceRevision, sourceFixture.toolInputDriftSourceRevision]) {
    assert.throws(() => assertAssociation(changedSourceRevision,
      reviewedToolBuildSourceProof(profile, buildSourceRevision, changedSourceRevision)),
    error => error?.code === 'TOOL_ROTATION_ARTIFACT_SOURCE_INVALID')
  }
  const wrongSourceProof = reviewedToolBuildSourceProof(profile, buildSourceRevision, sourceFixture.ordinarySourceRevision)
  wrongSourceProof.rotationSourceRevision = sourceFixture.baselineSourceRevision
  assert.throws(() => assertAssociation(sourceFixture.ordinarySourceRevision, wrongSourceProof),
    error => error?.code === 'TOOL_ROTATION_ARTIFACT_SOURCE_INVALID')
})

test('rejects later reuse after .dockerignore drift while the historical source archive remains valid', async () => {
  const fixture = makeReceiptHarness({
    intentSourceRevision: sourceFixture.toolInputDriftSourceRevision,
    baselineUsesRotation: true,
  })
  const priorHead = runGit(sourceFixture.root, ['rev-parse', 'HEAD'])
  try {
    runGit(sourceFixture.root, ['checkout', '--quiet', '--detach', sourceFixture.toolInputDriftSourceRevision])
    const build = fixture.jsonObjects.get(fixture.receipt.toolRotation.buildProofRef.uri).value
    await assertToolBuildProof({
      root: sourceFixture.root,
      profile: fixture.profile,
      build,
      sourceRevision: fixture.receipt.sourceRevision,
      imageDigest: fixture.receipt.migrationRunnerDigest,
      transport: fixture.transport,
    })
    await assert.rejects(() => assertOrdinaryToolRotation({
      root: sourceFixture.root,
      profile: fixture.profile,
      transport: fixture.transport,
      intent: fixture.intent,
      receipt: fixture.receipt,
      baseline: fixture.baseline,
    }), error => error?.code === 'TOOL_ROTATION_SOURCE_INPUT_DRIFT')
  } finally {
    runGit(sourceFixture.root, ['checkout', '--quiet', '--detach', priorHead])
  }
})

test('rejects changes to state, output, saved-plan hashes, and the sealed image proof', async () => {
  for (const receiptPatch of [
    { binaryPlanSha256: 'f'.repeat(64) },
    { planJsonSha256: 'f'.repeat(64) },
    { stateJsonSha256: 'f'.repeat(64) },
    { outputManifestSha256: 'f'.repeat(64) },
  ]) {
    const fixture = makeReceiptHarness({ receiptPatch })
    await assert.rejects(() => assertOrdinaryToolRotation({
      root: sourceFixture.root, profile: fixture.profile, transport: fixture.transport,
      intent: fixture.intent, receipt: fixture.receipt, baseline: fixture.baseline,
    }), error => error?.code === 'TOOL_ROTATION_PLAN_HASH_INVALID')
  }

  for (const proofPatch of [
    { sourceRevision: sourceFixture.baselineSourceRevision },
    { planJsonSha256: 'f'.repeat(64) },
  ]) {
    const fixture = makeReceiptHarness({ proofPatch })
    await assert.rejects(() => assertOrdinaryToolRotation({
      root: sourceFixture.root, profile: fixture.profile, transport: fixture.transport,
      intent: fixture.intent, receipt: fixture.receipt, baseline: fixture.baseline,
    }), error => error?.code === 'TOOL_ROTATION_PLAN_PROOF_INVALID')
  }

  const badBuild = makeReceiptHarness({ buildPatch: { sourceRevision: sourceFixture.baselineSourceRevision } })
  await assert.rejects(() => assertOrdinaryToolRotation({
    root: sourceFixture.root, profile: badBuild.profile, transport: badBuild.transport,
    intent: badBuild.intent, receipt: badBuild.receipt, baseline: badBuild.baseline,
  }), error => error?.code === 'TOOL_ROTATION_ARTIFACT_SOURCE_INVALID')

  const corruptSeal = makeReceiptHarness()
  corruptSeal.receipt.receiptSha256 = '0'.repeat(64)
  assertRotationCode(() => assertToolSeal(corruptSeal.receipt), 'EVIDENCE_HASH_INVALID')
})

test('rejects changed infrastructure inputs and a mismatched owner profile', async () => {
  const drift = makeReceiptHarness({ intentSourceRevision: sourceFixture.driftSourceRevision })
  await assert.rejects(() => assertOrdinaryToolRotation({
    root: sourceFixture.root, profile: drift.profile, transport: drift.transport,
    intent: drift.intent, receipt: drift.receipt, baseline: drift.baseline,
  }), error => error?.code === 'TOOL_ROTATION_SOURCE_INPUT_DRIFT')

  const wrongOwner = makeReceiptHarness()
  wrongOwner.profile.target = { ...wrongOwner.profile.target, projectId: 'another-project' }
  await assert.rejects(() => assertOrdinaryToolRotation({
    root: sourceFixture.root, profile: wrongOwner.profile, transport: wrongOwner.transport,
    intent: wrongOwner.intent, receipt: wrongOwner.receipt, baseline: wrongOwner.baseline,
  }), error => error?.code === 'TOOL_ROTATION_OWNER_INVALID')
  assertRotationCode(() => assertToolOwner({ ...wrongOwner.profile, target: { ...wrongOwner.profile.target, projectId: 'other' } }), 'OWNER_INVALID')
})

test('rejects a saved-plan reference whose own hash is detached from the sealed plan hash', async () => {
  const fixture = makeReceiptHarness()
  fixture.receipt.toolRotation.binaryPlanRef.sha256 = '9'.repeat(64)
  resealReceipt(fixture)
  await assert.rejects(() => validateRotationFixture(fixture), error => error?.code === 'TOOL_ROTATION_PLAN_HASH_INVALID')
})

test('requires the frozen before-state, original intent/infra, and control references', async () => {
  for (const field of ['beforeStateRef', 'baselineIntentRef', 'baselineInfraRef', 'controlSnapshotRef']) {
    const fixture = makeReceiptHarness()
    delete fixture.receipt.toolRotation[field]
    resealReceipt(fixture)
    await assert.rejects(() => validateRotationFixture(fixture))
  }
})

test('rejects plans whose sealed variables omit the rotation source or image bindings', async () => {
  const fixture = makeReceiptHarness()
  mutatePlanEvidence(fixture, plan => {
    delete plan.variables.source_revision
    delete plan.variables.migration_runner_image_digest
    delete plan.variables.controller_image_digest
    delete plan.variables.foundation_manifest_sha256
  })
  await assert.rejects(() => validateRotationFixture(fixture), error => error?.code === 'TOOL_ROTATION_PLAN_PROOF_INVALID')
})

test('binds build source identity and gzip archive hashes to the frozen Git revision', async () => {
  const badIdentity = makeReceiptHarness()
  mutateBuildEvidence(badIdentity, build => { build.sourceSha256 = 'f'.repeat(64) })
  const badArchive = makeReceiptHarness()
  mutateBuildEvidence(badArchive, build => { build.sourceObject.sha256 = 'e'.repeat(64) })

  const failures = await Promise.all([
    assert.rejects(() => validateRotationFixture(badIdentity), /^Error: TOOL_IMAGE_BUILD_TARGET_INVALID:source-build-args$/u),
    assert.rejects(() => validateRotationFixture(badArchive), /^Error: TOOL_ROTATION_SOURCE_PROOF_INVALID$/u),
  ])
  assert.equal(failures.length, 2)

  const linuxHeaderBytes = Buffer.from(sourceFixture.sourceArchiveBytes)
  linuxHeaderBytes[9] = 3
  assert.equal(gunzipSync(linuxHeaderBytes).compare(sourceFixture.sourceArchive), 0)
  assert.notEqual(sha256(linuxHeaderBytes), sourceFixture.sourceArchiveSha256)
  const linuxHeaderFixture = makeReceiptHarness({ sourceArchiveBytes: linuxHeaderBytes })
  const result = await validateRotationFixture(linuxHeaderFixture)
  assert.equal(result.migrationRunnerDigest, NEXT_IMAGE)
})

test('requires the hash-bound original finalized control head and rejects a bad control result', async () => {
  const missingBinding = makeReceiptHarness()
  delete missingBinding.receipt.toolRotation.controlBaseline.sha256
  resealReceipt(missingBinding)

  const badControl = makeReceiptHarness()
  const { controlSha256: _oldControlHash, ...badControlCore } = badControl.controlSnapshot
  badControlCore.result = 'PRE_ACTIVATION_ABORTED'
  const badControlSnapshot = { ...badControlCore, controlSha256: sha256(canonicalize(badControlCore)) }
  const badControlRef = badControl.putJson('control-head-invalid', badControlSnapshot, 'releases/ROTATION-BASELINE')
  badControl.receipt.toolRotation.controlSnapshotRef = badControlRef
  badControl.receipt.toolRotation.controlBaseline.sha256 = badControlRef.sha256
  resealReceipt(badControl)

  await Promise.all([
    assert.rejects(() => validateRotationFixture(missingBinding), error => error?.code === 'TOOL_ROTATION_BASELINE_INVALID'),
    assert.rejects(() => validateRotationFixture(badControl), error => error?.code === 'TOOL_ROTATION_BASELINE_INVALID'),
  ])
})
