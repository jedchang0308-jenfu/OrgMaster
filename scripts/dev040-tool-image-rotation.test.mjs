import assert from 'node:assert/strict'
import fs, { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test, { before, after } from 'node:test'
import { gzipSync } from 'node:zlib'
import { executeToolImageRotation, assertAppliedRecoverySourceProof, assertRequiredToolSourceQc, assertReusableAfterStateEvidence, parseToolRotationArgs, readHistoricalToolBuildSource } from './dev040-tool-image-rotation.mjs'
import { assertDeployToolRotationSelection, bindDeployToolRotationAuthority, parseDeployProductionArgs, selectDeployInfrastructureRef } from './dev040-deploy-production.mjs'
import { resolveRoutineToolRotationRef } from './lib/dev040-routine-release.mjs'
import { canonicalize, sha256, releasePaths } from './lib/dev012-owner-release-runtime.mjs'
import { sealToolEvidence, assertToolSeal, rotationAddresses, MIGRATION_JOB_ADDRESS, assertToolBuildProof } from './lib/dev040-tool-image-rotation.mjs'
import { createGitArchive, createGitSourceIdentity } from './lib/dev012-owner-stage-executor.mjs'
import { buildMigrationToolImage } from './lib/dev040-tool-image-build.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const profile = JSON.parse(readFileSync(path.join(root, 'config/release/dev040-orgmaster-independent-production-v3.json')))
const infraProfile = JSON.parse(readFileSync(path.join(root, 'config/release/dev040-production-release-infra-plan.json')))
let sourceRevision
let sourceFixture
const oldImage = `${profile.artifact.migrationRunnerUri}@sha256:${'1'.repeat(64)}`
const newImage = `${profile.artifact.migrationRunnerUri}@sha256:${'2'.repeat(64)}`
const controllerImage = 'asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster-abort-controller@sha256:' + '3'.repeat(64)
const bucket = profile.artifact.releaseBucket
const bytes = value => Buffer.from(`${canonicalize(value)}\n`)
const FOUNDATION = 'd'.repeat(64)
const NOW = '2026-10-18T02:00:00.000Z'
const JOB_NAME = `projects/${profile.target.projectId}/locations/${profile.target.region}/jobs/orgmaster-prod-migration-runner`
const LINEAGE = '11111111-2222-4333-8444-555555555555'
const RECIPE = 'infra/google-cloud/dev-040-production-release/migration-runner.Dockerfile'

test('tool rotation CLI limits applied-source recovery to apply mode and one exact revision', () => {
  const revision = 'a'.repeat(40)
  assert.deepEqual(parseToolRotationArgs(['--apply', `--recover-applied-source=${revision}`]), {
    apply: true,
    reuseId: null,
    recoveryRevision: revision,
    appliedInfraBaselineSource: null,
  })
  assert.deepEqual(parseToolRotationArgs(['--check', `--applied-infra-baseline-source=${revision}`]), {
    apply: false, reuseId: null, recoveryRevision: null, appliedInfraBaselineSource: revision,
  })
  assert.deepEqual(parseToolRotationArgs(['--apply', `--applied-infra-baseline-source=${revision}`]), {
    apply: true, reuseId: null, recoveryRevision: null, appliedInfraBaselineSource: revision,
  })
  assert.throws(() => parseToolRotationArgs(['--check', `--recover-applied-source=${revision}`]), /ARGUMENT_INVALID/u)
  assert.throws(() => parseToolRotationArgs(['--apply', '--recover-applied-source=short']), /ARGUMENT_INVALID/u)
  assert.throws(() => parseToolRotationArgs(['--check', '--applied-infra-baseline-source=short']), /ARGUMENT_INVALID/u)
  assert.throws(() => parseToolRotationArgs(['--apply', `--recover-applied-source=${revision}`, '--reuse-build-id=12345678-1234-1234-1234-123456789abc']), /ARGUMENT_INVALID/u)
  assert.throws(() => parseToolRotationArgs(['--apply', `--recover-applied-source=${revision}`, `--applied-infra-baseline-source=${revision}`]), /ARGUMENT_INVALID/u)
})

test('applied-source recovery reuses only the sealed proof of the exact merged ancestor and successful QC', () => {
  const revision = 'a'.repeat(40)
  const sourceTree = 'b'.repeat(40)
  const mergedAt = '2026-10-26T00:00:00.000Z'
  const currentSourceProof = {
    repository: 'jedchang0308-jenfu/OrgMaster', branch: 'master', branchProtected: true,
    reviewMode: 'SOLO_MAINTAINER_NO_HUMAN_APPROVAL_REQUIRED', rulesetId: 24077876,
    requiredChecks: ['Production Source QC'],
  }
  const preparedSourceProof = {
    schemaVersion: 'jenfu.dev012.official-merged-source.v1', ...currentSourceProof,
    sourceRevision: revision, sourceTree, pullRequestNumber: 172,
    pullRequestUrl: 'https://github.com/jedchang0308-jenfu/OrgMaster/pull/172', mergedAt,
    status: 'OFFICIAL_MERGED_PR_VERIFIED', requiredSourceQc: 'SUCCESS',
  }
  const commit = { sha: revision, tree: { sha: sourceTree } }
  const pulls = [{ state: 'closed', merge_commit_sha: revision, merged_at: mergedAt, number: 172,
    html_url: preparedSourceProof.pullRequestUrl, base: { ref: 'master', repo: { full_name: currentSourceProof.repository } } }]
  const checks = { check_runs: [{ id: 11, name: 'Production Source QC', head_sha: revision,
    status: 'completed', conclusion: 'success', app: { id: 15368 } }] }
  assert.equal(assertAppliedRecoverySourceProof({ preparedSourceProof, currentSourceProof, revision, sourceTree, commit, pulls, checks }), preparedSourceProof)
  assert.throws(() => assertAppliedRecoverySourceProof({ preparedSourceProof: { ...preparedSourceProof, sourceRevision: 'c'.repeat(40) },
    currentSourceProof, revision, sourceTree, commit, pulls, checks }), /RECOVERY_SOURCE_INVALID/u)
  assert.throws(() => assertAppliedRecoverySourceProof({ preparedSourceProof, currentSourceProof, revision, sourceTree, commit, pulls,
    checks: { check_runs: checks.check_runs.map(row => ({ ...row, conclusion: 'failure' })) } }), /REQUIRED_SOURCE_QC_MISSING/u)
})

test('applied recovery reuses sealed after-state when only Terraform check result order changes', () => {
  const row = (address) => ({ config_addr: address, objects: [{ object_addr: address, status: 'pass' }], status: 'pass' })
  const existing = { stateMeta: { serial: 131, lineage: 'lineage', check_results: [row('b'), row('a')] },
    stateJson: { format_version: '1.0' }, manifest: { source_revision: 'a'.repeat(40) } }
  const current = { ...existing, stateMeta: { ...existing.stateMeta, check_results: [row('a'), row('b')] } }
  assert.equal(assertReusableAfterStateEvidence(existing, current), existing)
  assert.throws(() => assertReusableAfterStateEvidence(existing,
    { ...current, stateMeta: { ...current.stateMeta, serial: 132 } }), /RECOVERY_AFTER_STATE_CHANGED/u)
})

function runGit(cwd, args) {
  const result = spawnSync('git', ['-c', 'core.autocrlf=false', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=.git/no-hooks', ...args], {
    cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, GIT_AUTHOR_DATE: NOW, GIT_COMMITTER_DATE: NOW },
  })
  assert.equal(result.status, 0, `FIXTURE_GIT_FAILED:${result.stderr}`)
  return result.stdout.trim()
}

function removeFixture(directory) {
  const resolved = path.resolve(directory)
  assert.equal(path.dirname(resolved), root)
  assert.ok(path.basename(resolved).startsWith('.dev040-tool-protocol-'))
  fs.rmSync(resolved, { recursive: true, force: true })
}

before(() => {
  const directory = fs.mkdtempSync(path.join(root, '.dev040-tool-protocol-'))
  try {
    const paths = runGit(root, ['ls-tree', '-r', '--name-only', 'HEAD', '--',
      'infra/google-cloud/dev-040-production-release', 'config/release/dev040-orgmaster-independent-production-v3.json',
      'config/release/dev040-production-release-infra-plan.json', 'config/dev-010/n1c-orgmaster.json']).split(/\r?\n/u).filter(Boolean)
    const copyInputs = readFileSync(path.join(root, RECIPE), 'utf8').split(/\r?\n/u)
      .filter(line => line.startsWith('COPY ')).flatMap(line => line.trim().split(/\s+/u).slice(1, -1))
    for (const file of new Set([...paths, ...copyInputs])) {
      assert.match(file, /^[A-Za-z0-9._/-]+$/u)
      assert.ok(!file.includes('..'))
      fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true })
      fs.copyFileSync(path.join(root, file), path.join(directory, file))
    }
    runGit(directory, ['init', '--quiet', '--initial-branch=master'])
    runGit(directory, ['config', 'user.name', 'Synthetic Tool Protocol'])
    runGit(directory, ['config', 'user.email', 'tool-protocol@example.invalid'])
    runGit(directory, ['add', '--all'])
    runGit(directory, ['commit', '--quiet', '-m', 'synthetic baseline'])
    const baselineRevision = runGit(directory, ['rev-parse', 'HEAD'])
    fs.appendFileSync(path.join(directory, RECIPE), '\n# synthetic controlled image rotation\n')
    runGit(directory, ['add', RECIPE])
    runGit(directory, ['commit', '--quiet', '-m', 'synthetic tool source'])
    const rotationSourceRevision = runGit(directory, ['rev-parse', 'HEAD'])
    fs.writeFileSync(path.join(directory, 'producer-build-notes.md'), 'non-executable producer documentation\n')
    runGit(directory, ['add', 'producer-build-notes.md'])
    runGit(directory, ['commit', '--quiet', '-m', 'synthetic state successor documentation only'])
    const stateSuccessorRevision = runGit(directory, ['rev-parse', 'HEAD'])
    fs.appendFileSync(path.join(directory, 'producer-build-notes.md'), 'current source successor\n')
    runGit(directory, ['add', 'producer-build-notes.md'])
    runGit(directory, ['commit', '--quiet', '-m', 'synthetic current source documentation only'])
    sourceRevision = runGit(directory, ['rev-parse', 'HEAD'])
    sourceFixture = { root: directory, baselineRevision,
      rotationSourceRevision,
      stateSuccessorRevision,
      sourceTree: runGit(directory, ['rev-parse', 'HEAD^{tree}']),
      identitySha256: sha256(createGitSourceIdentity(directory, sourceRevision)),
      archive: gzipSync(createGitArchive(directory, sourceRevision), { level: 9 }) }
  } catch (error) {
    removeFixture(directory)
    throw error
  }
})
after(() => { if (sourceFixture) removeFixture(sourceFixture.root) })

function terraformJob(image) {
  return { name: 'orgmaster-prod-migration-runner', project: profile.target.projectId, location: profile.target.region,
    template: [{ parallelism: 1, task_count: 1, template: [{
      service_account: 'orgmaster-prod-migrator@jenfu-platform-prod.iam.gserviceaccount.com',
      timeout: '1800s', max_retries: 0, containers: [{ name: 'migration', image, args: ['--bundle-ref-required'] }],
    }] }] }
}

function providerJob(image, generation) {
  return { name: JOB_NAME, uid: '00000000-0000-4000-8000-000000000001', generation: String(generation),
    observedGeneration: String(generation), reconciling: false,
    template: { template: { serviceAccount: 'orgmaster-prod-migrator@jenfu-platform-prod.iam.gserviceaccount.com',
      timeout: '1800s', maxRetries: 0, containers: [{ name: 'migration', image, args: ['--bundle-ref-required'] }] } } }
}

function fullState(image, revision, serial) {
  const manifest = { project_id: profile.target.projectId, region: profile.target.region, source_revision: revision,
    foundation_manifest_sha256: FOUNDATION, application_service: profile.target.serviceName,
    runtime_identity: profile.target.runtimeServiceAccount,
    release_repository: `projects/${profile.target.projectId}/locations/${profile.target.region}/repositories/${profile.artifact.repository}`,
    release_bucket: bucket, wif_provider: `projects/${profile.target.projectNumber}/locations/global/workloadIdentityPools/orgmaster-prod-github/providers/github`,
    incident_runtime: true, abort_controller_name: 'orgmaster-prod-abort-controller', migration_job_name: 'orgmaster-prod-migration-runner',
    candidate_smoke: `projects/${profile.target.projectId}/locations/${profile.target.region}/workflows/${profile.verification.candidateWorkflowName}`,
    candidate_smoke_secret: profile.verification.candidateRefreshTokenSecretId,
    controller_image_digest: controllerImage, migration_runner_digest: image }
  const resources = rotationAddresses(infraProfile).map(address => ({ address,
    mode: address.startsWith('data.') ? 'data' : 'managed',
    values: address === MIGRATION_JOB_ADDRESS ? terraformJob(image) : { id: `synthetic:${address}` } }))
  const outputs = { app_release_infra_manifest: { value: manifest } }
  const rawResources = resources.map(row => {
    const match = /^(data\.)?(google_[a-z0-9_]+)\.([a-z0-9_]+)(?:\[(\d+|"[^"]+")\])?$/u.exec(row.address)
    assert.ok(match, `FIXTURE_ADDRESS_INVALID:${row.address}`)
    return { mode: row.mode, type: match[2], name: match[3], instances: [{
      ...(match[4] === undefined ? {} : { index_key: JSON.parse(match[4]) }), attributes: structuredClone(row.values),
    }] }
  })
  return { stateMeta: { version: 4, serial, lineage: LINEAGE, outputs: structuredClone(outputs), resources: rawResources },
    stateJson: { values: { root_module: { resources }, outputs: structuredClone(outputs) }, outputs: structuredClone(outputs) }, manifest }
}

function harness({ unknownApply = false } = {}) {
  const git = { clean: true, branch: 'master', sourceRevision, sourceTree: sourceFixture.sourceTree, remoteRevision: sourceRevision }
  const sourceProof = { schemaVersion: 'jenfu.dev012.official-merged-source.v1', sourceRevision, sourceTree: git.sourceTree,
    repository: profile.application.repository, branch: 'master', branchProtected: true,
    reviewMode: 'SOLO_MAINTAINER_NO_HUMAN_APPROVAL_REQUIRED', rulesetId: 24077876,
    requiredChecks: ['Production Source QC'], requiredSourceQc: 'SUCCESS', pullRequestNumber: 999,
    pullRequestUrl: `https://github.com/${profile.application.repository}/pull/999`, mergedAt: NOW,
    status: 'OFFICIAL_MERGED_PR_VERIFIED' }
  const controlCore = { schemaVersion: 'jenfu.dev012.owner-control-head.v1', state: 'FINALIZED', result: 'RELEASED',
    ownerApplicationId: 'orgmaster', service: 'orgmaster-prod', releaseId: 'ORGMASTER-BASELINE',
    sourceRevision: sourceFixture.baselineRevision, candidateRevision: 'orgmaster-prod-baseline' }
  const control = { ...controlCore, controlSha256: sha256(canonicalize(controlCore)) }
  const store = new Map(), generations = new Map(), trace = []
  const calls = { builds: 0, applies: 0, puts: 0, plans: 0 }
  const faults = { stopAfterPrepared: false, stopAfterFence: false }
  let generation = 10, applied = false
  const prefix = `gs://${bucket}/receipts/tool-rotations/${sourceRevision}`
  const controlUri = `gs://${bucket}/control/active.json`
  const seed = (uri, value) => {
    const content = Buffer.isBuffer(value) ? Buffer.from(value) : bytes(value)
    store.set(uri, content); generations.set(uri, String(++generation))
    return { uri, sha256: sha256(content) }
  }
  const originalInfra = { schemaVersion: 'jenfu.dev012.app-infra-receipt.v1', ownerApplicationId: 'orgmaster',
    sourceRevision: sourceFixture.baselineRevision, migrationRunnerDigest: oldImage,
    controllerImageDigest: controllerImage, foundationManifestSha256: FOUNDATION, status: 'APPLIED' }
  const infraRef = seed(`gs://${bucket}/receipts/releases/${control.releaseId}/app-infra.json`, originalInfra)
  const originalIntent = { ownerApplicationId: 'orgmaster', releaseId: control.releaseId,
    sourceRevision: sourceFixture.baselineRevision, infraReceiptRef: infraRef }
  const baselineIntentRef = seed(`gs://${bucket}/receipts/releases/${control.releaseId}/release-intent.json`, originalIntent)
  seed(controlUri, control)
  const baseline = { intent: originalIntent, activeRevision: control.candidateRevision }
  const state = fullState(oldImage, sourceFixture.baselineRevision, 10)
  const afterState = fullState(newImage, sourceRevision, 11)
  const plan = { errored: false, complete: true, deferred_changes: [], resource_changes: rotationAddresses(infraProfile).map(address => ({ address,
    mode: address.startsWith('data.') ? 'data' : 'managed', change: { actions: ['no-op'],
      before: address === MIGRATION_JOB_ADDRESS ? terraformJob(oldImage) : {},
      after: address === MIGRATION_JOB_ADDRESS ? terraformJob(oldImage) : {} } })) }
  const savedBinary = Buffer.from('synthetic immutable saved Terraform plan')
  const readBytes = async (uri, options = {}) => {
    trace.push(`read:${uri}`)
    const content = store.get(uri)
    if (!content) throw Object.assign(new Error('MISSING'), { code: 'MISSING' })
    if (options.expectedSha256) assert.equal(sha256(content), options.expectedSha256, 'FIXTURE_PROVIDER_HASH_MISMATCH')
    return { bytes: Buffer.from(content), ref: { uri, sha256: sha256(content) },
      metadata: { generation: generations.get(uri), crc32c: 'fixture-crc32c' } }
  }
  const write = async (uri, content) => {
    calls.puts++; trace.push(`put:${uri}`)
    const existed = store.has(uri)
    if (existed) assert.deepEqual(store.get(uri), content, 'FIXTURE_IMMUTABLE_OBJECT_CHANGED')
    else seed(uri, content)
    return { ...(await readBytes(uri)), reused: existed }
  }
  const transport = {
    readBytes,
    readJson: async ref => {
      assert.ok(ref?.uri && ref.sha256, 'FIXTURE_REF_INVALID')
      const read = await readBytes(ref.uri, { expectedSha256: ref.sha256 })
      return { ...read, value: JSON.parse(read.bytes.toString('utf8')) }
    },
    getService: async () => ({ name: `projects/${profile.target.projectId}/locations/${profile.target.region}/services/orgmaster-prod`,
      uri: profile.target.canonicalOrigin, reconciling: false, generation: '1', observedGeneration: '1',
      traffic: [{ revision: baseline.activeRevision, percent: 100 }], trafficStatuses: [] }),
    assertServiceSettled(value) { assert.equal(value.reconciling, false) },
    assertCanonicalEntrypoint(_profile, value) { assert.equal(value.uri, profile.target.canonicalOrigin) },
    effectiveRevision: value => value.traffic.find(row => row.percent === 100).revision,
    putJson: async (uri, value) => {
      const result = await write(uri, bytes(value))
      if (faults.stopAfterPrepared && uri === `${prefix}/prepared.json`) throw Object.assign(new Error('fixture interrupted after prepare'), { code: 'FIXTURE_STOP_PREPARED' })
      if (faults.stopAfterFence && uri === `${prefix}/apply-attempt.json`) throw Object.assign(new Error('fixture interrupted before apply'), { code: 'FIXTURE_STOP_FENCE' })
      return result
    },
    putBytes: async (uri, value) => write(uri, Buffer.from(value)),
    request: async url => {
      assert.equal(url, `https://run.googleapis.com/v2/${JOB_NAME}`, 'FIXTURE_UNEXPECTED_PROVIDER_REQUEST')
      trace.push('provider-job-readback')
      return providerJob(applied ? newImage : oldImage, applied ? 11 : 10)
    },
    createBuild: async ({ profile: toolProfile, intent, sourceObject }) => {
      assert.equal(toolProfile.artifact.uri, profile.artifact.migrationRunnerUri)
      assert.equal(toolProfile.build.dockerfile, RECIPE)
      assert.equal(toolProfile.build.dockerTarget, 'runtime')
      const tag = `${toolProfile.artifact.uri}:release-${intent.sourceRevision}`
      const storage = { bucket, object: sourceObject.ref.uri.split('/').slice(3).join('/'), generation: String(sourceObject.metadata.generation) }
      const request = { source: { storageSource: storage }, steps: [{ name: toolProfile.build.dockerBuilderImage, dir: 'source',
        args: ['build', '--pull=false', '--no-cache', '--file', RECIPE, '--target', 'runtime',
          '--build-arg', `SOURCE_REVISION=${intent.sourceRevision}`, '--build-arg', `SOURCE_TREE=${intent.sourceSha256}`,
          '--build-arg', 'SOURCE_CREATED_AT=1970-01-01T00:00:00Z', '--build-arg', `SOURCE_VERSION=${intent.sourceRevision}`,
          '--build-arg', 'SOURCE_STATE=frozen', '--tag', tag, '.'] }], images: [tag], timeout: '1800s', queueTtl: '300s',
        logsBucket: `gs://${bucket}/logs/cloud-build`, serviceAccount: `projects/${profile.target.projectId}/serviceAccounts/${profile.identities.builder}`,
        options: { logging: 'GCS_ONLY', logStreamingOption: 'STREAM_OFF', requestedVerifyOption: 'VERIFIED' } }
      const buildInputSha256 = sha256(canonicalize({ ownerApplicationId: 'orgmaster', sourceArchiveSha256: sourceObject.ref.sha256, request }))
      const id = '12345678-1234-1234-1234-123456789abc'
      return { artifactDigest: newImage, request, buildInputSha256, sourceArchiveSha256: sourceObject.ref.sha256,
        reused: false, disposition: 'BUILT', build: { ...structuredClone(request), id,
          name: `projects/${profile.target.projectId}/locations/${profile.target.region}/builds/${id}`, projectId: profile.target.projectId,
          status: 'SUCCESS', createTime: '2026-10-18T01:00:00Z', startTime: '2026-10-18T01:00:02Z', finishTime: '2026-10-18T01:01:00Z',
          sourceProvenance: { resolvedStorageSource: storage },
          tags: ['dev-012', 'orgmaster', `owner-build-${buildInputSha256}`, intent.releaseId.toLowerCase(), 'owner-submission-1'],
          results: { images: [{ name: tag, digest: `sha256:${'2'.repeat(64)}` }] } } }
    },
    readArtifactImage: async (_profile, digest) => ({ uri: digest,
      name: `projects/${profile.target.projectId}/locations/${profile.target.region}/repositories/${profile.artifact.repository}/dockerImages/${profile.artifact.migrationRunnerImage}@sha256:${'2'.repeat(64)}` }),
    waitArtifactEvidence: async ({ artifactDigest }) => ({ status: 'PASS', resourceUrl: `https://${artifactDigest}`,
      buildOccurrenceNames: ['projects/synthetic/occurrences/build'], discoveryOccurrenceNames: ['projects/synthetic/occurrences/discovery'],
      sbomOccurrenceNames: ['projects/synthetic/occurrences/sbom'], vulnerabilityCount: 0, rawHighOrCriticalVulnerabilityCount: 0,
      blockingVulnerabilityCount: 0, notAffectedAssessments: [], observedAt: NOW,
      sbomExport: { resourceUrl: `https://${artifactDigest}`, discoveryOccurrenceId: 'projects/synthetic/locations/asia-east1/occurrences/export' } }),
  }
  const terraform = { initialize: async () => { trace.push('initialize') },
    read: async () => { trace.push('state-readback'); return structuredClone(applied ? afterState : state) },
    plan: async ({ variables }) => {
      calls.plans++
      const result = structuredClone(plan)
      const nextImage = variables.migration_runner_image_digest
      const row = result.resource_changes.find(value => value.address === MIGRATION_JOB_ADDRESS)
      row.change.actions = [nextImage === oldImage ? 'no-op' : 'update']
      row.change.after.template[0].template[0].containers[0].image = nextImage
      result.variables = Object.fromEntries(Object.entries(variables).map(([name, value]) => [name, { value }]))
      return { plan: result, binaryPlan: Buffer.from(savedBinary) }
    },
    apply: async ({ binaryPlan, binaryPlanSha256 }) => {
      calls.applies++; trace.push('terraform-apply')
      assert.deepEqual(binaryPlan, savedBinary)
      assert.equal(binaryPlanSha256, sha256(savedBinary))
      if (unknownApply) throw Object.assign(new Error('synthetic unknown apply completion'), { code: 'OUTCOME_UNKNOWN' })
      applied = true
    } }
  const input = { root: sourceFixture.root, profile, git, sourceProof, transport, terraform, now: () => NOW,
    readBaseline: async ({ baselineIntentRef: ref }) => { assert.deepEqual(ref, baselineIntentRef); return baseline },
    variablesFromState: ({ sourceRevision: revision, nextImage }) => ({ source_revision: revision,
      migration_runner_image_digest: nextImage, controller_image_digest: controllerImage, foundation_manifest_sha256: FOUNDATION }),
    verifySource: () => structuredClone(git),
    build: async options => { calls.builds++; return buildMigrationToolImage(options) } }
  return { input, control, store, plan, calls, state, afterState, baseline, infraRef, baselineIntentRef, controlUri,
    prefix, trace, faults, seed, markApplied: () => { applied = true },
    json: name => JSON.parse(store.get(`${prefix}/${name}.json`).toString('utf8')) }
}

async function stopAt(h, stage) {
  const flag = stage === 'prepared' ? 'stopAfterPrepared' : 'stopAfterFence'
  const code = stage === 'prepared' ? 'FIXTURE_STOP_PREPARED' : 'FIXTURE_STOP_FENCE'
  h.faults[flag] = true
  await assert.rejects(executeToolImageRotation({ ...h.input, apply: true }), error => error.code === code)
  h.faults[flag] = false
  assert.equal(h.calls.applies, 0)
  return h.json(stage === 'prepared' ? 'prepared' : 'apply-attempt')
}

function reseal(value) {
  const { receiptSha256: _oldHash, ...core } = value
  return sealToolEvidence(core)
}
test('ordinary CLI binds the exact own rotation receipt and rejects mixed or alternate authority', () => {
  const ref = `gs://${bucket}/receipts/tool-rotations/${'a'.repeat(40)}/app-infra.json#sha256=${'b'.repeat(64)}`
  const options = parseDeployProductionArgs(['--check', `--tool-image-rotation-ref=${ref}`])
  assert.equal(selectDeployInfrastructureRef(options, { intent: { infraReceiptRef: null } }).uri, ref.split('#')[0])
  const smoke = `gs://${bucket}/receipts/releases/ORGMASTER-SMOKE-V11-${'C'.repeat(12)}/app-infra.json#sha256=${'c'.repeat(64)}`
  const composed = parseDeployProductionArgs(['--check', `--tool-image-rotation-ref=${ref}`, `--smoke-rotation-ref=${smoke}`, '--reuse-aborted-app-artifact'])
  assert.equal(selectDeployInfrastructureRef(composed, { intent: { infraReceiptRef: null } }).uri, smoke.split('#')[0])
  assert.equal(composed.reuseAbortedAppArtifact, true)
  const toolRef = options.toolRotationRef
  const smokeRef = composed.smokeRotationRef
  const authorization = bindDeployToolRotationAuthority(composed, { schemaVersion: 'orgmaster.routine-release-authorization.v1' })
  const readiness = bindDeployToolRotationAuthority(composed, { schemaVersion: 'orgmaster.routine-release-readiness.v1' })
  assert.deepEqual(resolveRoutineToolRotationRef({ authorization, readiness }), toolRef)
  assert.deepEqual(resolveRoutineToolRotationRef({ authorization, readiness }, toolRef), toolRef)
  assert.throws(() => resolveRoutineToolRotationRef({ authorization, readiness: { ...readiness, toolRotationRef: smokeRef } }), /TOOL_ROTATION_AUTHORITY_MISMATCH/u)
  assert.throws(() => resolveRoutineToolRotationRef({ authorization, readiness }, smokeRef), /TOOL_ROTATION_AUTHORITY_MISMATCH/u)
  assert.doesNotThrow(() => assertDeployToolRotationSelection(options, { infraReceiptRef: toolRef },
    { toolRotation: { schemaVersion: 'orgmaster.ordinary-tool-image-rotation.v1' } }))
  assert.doesNotThrow(() => assertDeployToolRotationSelection(composed, { infraReceiptRef: smokeRef },
    { mutationProfile: 'APP_INFRA_SMOKE_CREDENTIAL_ROTATION' }))
  assert.throws(() => assertDeployToolRotationSelection(options, { infraReceiptRef: smokeRef },
    { mutationProfile: 'APP_INFRA_SMOKE_CREDENTIAL_ROTATION' }), /TOOL_ROTATION_REF_INVALID/u)
  assert.throws(() => assertDeployToolRotationSelection(options, { infraReceiptRef: toolRef },
    { mutationProfile: 'APP_INFRA_SMOKE_CREDENTIAL_ROTATION' }), /TOOL_ROTATION_REF_INVALID/u)
  for (const arg of ['--dev014-principal-lifecycle-v2-remediation', '--principal-only-recovery-ref=bad']) {
    assert.throws(() => parseDeployProductionArgs([`--tool-image-rotation-ref=${ref}`, arg]))
  }
  assert.throws(() => parseDeployProductionArgs(['--reuse-aborted-app-artifact', '--dev014-activate']))
  assert.throws(() => parseDeployProductionArgs([`--tool-image-rotation-ref=${ref.replace(bucket, 'other-release')}`]))
})
test('required source QC uses the latest matching run instead of an older success', () => {
  const check = (id, status, conclusion, extra = {}) => ({ id, name: 'Production Source QC',
    app: { id: 15368 }, head_sha: sourceRevision, status, conclusion, ...extra })
  const oldSuccess = check(101, 'completed', 'success')
  for (const latest of [check(102, 'completed', 'failure'), check(102, 'queued', null)]) {
    assert.throws(() => assertRequiredToolSourceQc({ check_runs: [oldSuccess, latest] }, sourceRevision),
      error => error.code === 'TOOL_ROTATION_REQUIRED_SOURCE_QC_MISSING')
  }
  const unrelated = [
    check(901, 'completed', 'failure', { name: 'Other QC' }),
    check(902, 'queued', null, { app: { id: 15369 } }),
    check(903, 'completed', 'failure', { head_sha: 'f'.repeat(40) }),
  ]
  assert.doesNotThrow(() => assertRequiredToolSourceQc({ check_runs: [
    check(103, 'completed', 'success'), ...unrelated, oldSuccess, check(102, 'completed', 'failure'),
  ] }, sourceRevision))
  assert.throws(() => assertRequiredToolSourceQc({ check_runs: unrelated }, sourceRevision),
    error => error.code === 'TOOL_ROTATION_REQUIRED_SOURCE_QC_MISSING')
})
test('historical build source reader accepts a merged old recipe source with a newer producer-doc revision', async () => {
  const historicalRevision = sourceFixture.rotationSourceRevision
  const providerBuild = { steps: [{ args: ['--build-arg', `SOURCE_REVISION=${historicalRevision}`] }] }
  const calls = []
  const endpoints = {
    [`git/commits/${historicalRevision}`]: {
      sha: historicalRevision,
      tree: { sha: runGit(sourceFixture.root, ['rev-parse', `${historicalRevision}^{tree}`]) },
    },
    [`commits/${historicalRevision}/pulls?per_page=100`]: [{
      number: 417,
      state: 'closed',
      merge_commit_sha: historicalRevision,
      base: { ref: profile.application.branch, repo: { full_name: profile.application.repository } },
      merged_at: NOW,
      html_url: `https://github.com/${profile.application.repository}/pull/417`,
    }],
    [`commits/${historicalRevision}/check-runs?per_page=100`]: { check_runs: [{
      id: 9417,
      name: 'Production Source QC',
      app: { id: 15368 },
      head_sha: historicalRevision,
      status: 'completed',
      conclusion: 'success',
    }] },
  }
  const result = await readHistoricalToolBuildSource({
    root: sourceFixture.root,
    profile,
    sourceRevision,
    providerBuild,
    readGithub: async endpoint => {
      calls.push(endpoint)
      assert.ok(Object.hasOwn(endpoints, endpoint), `UNEXPECTED_GITHUB_READ:${endpoint}`)
      return endpoints[endpoint]
    },
  })
  assert.equal(result.providerBuild, providerBuild)
  assert.equal(result.sourceRevision, historicalRevision)
  assert.equal(result.sourceProof.schemaVersion, 'orgmaster.reviewed-tool-build-source.v1')
  assert.equal(result.sourceProof.sourceRevision, historicalRevision)
  assert.equal(result.sourceProof.rotationSourceRevision, sourceRevision)
  assert.equal(result.sourceProof.sourceTree, endpoints[`git/commits/${historicalRevision}`].tree.sha)
  assert.equal(result.sourceProof.status, 'HISTORICAL_MERGED_SOURCE_VERIFIED')
  assert.equal(result.sourceProof.requiredSourceQc, 'SUCCESS')
  assert.equal(result.sourceProof.requiredSourceQcCheckId, 9417)
  assert.deepEqual(calls.sort(), Object.keys(endpoints).sort())
})
test('read-only readiness verifies all 75 addresses without a build, mutation or publication', async () => {
  const h = harness()
  const result = await executeToolImageRotation(h.input)
  assert.equal(result.status, 'READY_FOR_IMAGE_BUILD'); assert.equal(result.addressCount, 75)
  assert.equal(result.ddlExecuted, 0); assert.deepEqual(h.calls, { builds: 0, applies: 0, puts: 0, plans: 1 })
})
test('read-only readiness accepts an infra-equivalent protected state source successor', async () => {
  const h = harness()
  const successorInfra = { ...JSON.parse(h.store.get(h.infraRef.uri).toString('utf8')),
    sourceRevision: sourceFixture.rotationSourceRevision }
  h.baseline.intent.infraReceiptRef = h.seed(h.infraRef.uri, successorInfra)
  h.state.manifest.source_revision = sourceFixture.stateSuccessorRevision
  const result = await executeToolImageRotation(h.input)
  assert.equal(result.status, 'READY_FOR_IMAGE_BUILD')
  assert.deepEqual(h.calls, { builds: 0, applies: 0, puts: 0, plans: 1 })
})
test('read-only readiness rejects an unrelated or tool-drifted state source before plan or mutation', async () => {
  for (const revision of ['f'.repeat(40), sourceFixture.rotationSourceRevision]) {
    const h = harness()
    h.state.manifest.source_revision = revision
    await assert.rejects(executeToolImageRotation(h.input), /STATE_BASELINE_CHANGED/u)
    assert.deepEqual(h.calls, { builds: 0, applies: 0, puts: 0, plans: 0 })
  }
})
test('state source continuation keeps runner, controller and foundation bindings exact', async () => {
  for (const [field, value] of [
    ['migration_runner_digest', `${profile.artifact.migrationRunnerUri}@sha256:${'f'.repeat(64)}`],
    ['controller_image_digest', `asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster-abort-controller@sha256:${'f'.repeat(64)}`],
    ['foundation_manifest_sha256', 'f'.repeat(64)],
  ]) {
    const h = harness()
    h.state.manifest[field] = value
    await assert.rejects(executeToolImageRotation(h.input), /STATE_BASELINE_CHANGED/u)
    assert.deepEqual(h.calls, { builds: 0, applies: 0, puts: 0, plans: 0 })
  }
})
function bindProducerAbort(h, { releaseId, infraRef }) {
  const attemptIntent = { schemaVersion: profile.schemas.releaseIntent, ownerApplicationId: 'orgmaster',
    releaseId, sourceRevision, sourceSha256: '4'.repeat(64), sourceLockRef: h.infraRef,
    authorizationPolicyRef: h.infraRef, readinessReceiptRef: h.infraRef, foundationReceiptRef: h.infraRef,
    infraReceiptRef: infraRef, runtimeConfigRef: h.infraRef, migrationManifestSha256: '5'.repeat(64),
    previousRevision: h.baseline.activeRevision, deadlineAt: '2026-10-18T03:00:00.000Z',
    baselineIntentRef: h.baselineIntentRef }
  const attemptRef = h.seed(`gs://${bucket}/receipts/releases/${attemptIntent.releaseId}/release-intent.json`, attemptIntent)
  const paths = releasePaths(profile, attemptIntent, attemptRef.sha256)
  const prepareRef = h.seed(paths.prepare, sealToolEvidence({ schemaVersion: 'jenfu.dev012.stage-receipt.v1', ownerApplicationId: 'orgmaster',
    releaseId: attemptIntent.releaseId, sourceRevision, stage: 'prepare', status: 'PASS', previousReceiptRef: null,
    facts: { prerequisiteRefs: { infra: infraRef }, migrationRunnerDigest: oldImage }, observedAt: NOW }))
  const rollbackRef = h.seed(paths.rollback, sealToolEvidence({ schemaVersion: 'jenfu.dev012.stage-receipt.v1', ownerApplicationId: 'orgmaster',
    releaseId: attemptIntent.releaseId, sourceRevision, stage: 'rollback', status: 'PASS', previousReceiptRef: null,
    facts: { result: 'PRE_ACTIVATION_ABORTED', previousRevision: h.baseline.activeRevision,
      recoveryOrder: ['TRAFFIC_ROLLBACK', 'TAG_CLEANUP', 'ENTRYPOINT_BASELINE_RESTORE'],
      entrypointRecovery: { changed: false, result: 'NOT_REQUIRED' }, databaseDisposition: 'NOT_APPLIED' }, observedAt: NOW }))
  const terminalRef = h.seed(paths.terminal, sealToolEvidence({ schemaVersion: 'jenfu.dev012.stage-receipt.v1', ownerApplicationId: 'orgmaster',
    releaseId: attemptIntent.releaseId, sourceRevision, stage: 'terminal', status: 'PASS', previousReceiptRef: rollbackRef,
    facts: { result: 'PRE_ACTIVATION_ABORTED', previousRevision: h.baseline.activeRevision,
      entrypointRecovery: { changed: false, result: 'NOT_REQUIRED' }, databaseDisposition: 'NOT_APPLIED' }, observedAt: NOW }))
  const abortedCore = { schemaVersion: 'jenfu.dev012.owner-control-head.v1', state: 'FINALIZED', result: 'PRE_ACTIVATION_ABORTED',
    ownerApplicationId: 'orgmaster', service: 'orgmaster-prod', releaseId: attemptIntent.releaseId,
    sourceRevision: attemptIntent.sourceRevision, sourceLockSha256: attemptIntent.sourceLockRef.sha256,
    previousRevision: h.baseline.activeRevision, candidateRevision: null }
  const aborted = { ...abortedCore, controlSha256: sha256(canonicalize(abortedCore)) }
  h.seed(h.controlUri, aborted)
  h.input.resolveControlBaseline = async ({ control, attempt }) => {
    assert.deepEqual(control, aborted); assert.deepEqual(attempt.ref, attemptRef)
    return h.baselineIntentRef
  }
  return { attemptIntent, attemptRef, prepareRef, rollbackRef, terminalRef, aborted }
}
function bindAppliedInfrastructureBaseline(h) {
  const source = sourceFixture.rotationSourceRevision
  Object.assign(h.state, fullState(oldImage, source, 10))
  const afterStateRef = h.seed(`gs://${bucket}/receipts/tool-rotations/${source}/after-state.json`, h.state)
  const receipt = { ownerApplicationId: 'orgmaster', sourceRevision: source,
    migrationRunnerDigest: oldImage, controllerImageDigest: controllerImage, foundationManifestSha256: FOUNDATION,
    toolRotation: { afterStateRef } }
  const ref = h.seed(`gs://${bucket}/receipts/tool-rotations/${source}/app-infra.json`, receipt)
  const expected = { schemaVersion: 'orgmaster.applied-tool-infra-baseline.v1', sourceRevision: source,
    infraReceiptRef: ref, serviceDataBaselineIntentRef: h.baselineIntentRef }
  let validation = null
  h.input.appliedInfraBaselineSource = source
  h.input.validateAppliedInfraBaseline = async options => {
    validation = options
    assert.deepEqual(options.appliedBaseline, expected)
    assert.equal(options.currentSourceRevision, sourceRevision)
    assert.deepEqual(options.baselineIntentRef, h.baselineIntentRef)
    assert.deepEqual(options.baseline, h.baseline)
    assert.deepEqual(options.receiptRead.ref, ref)
    assert.deepEqual(options.receiptRead.value, receipt)
    return { ref, receipt, summary: { evidenceScope: 'OWNER_SEALED_TOOL_IMAGE_ROTATION' } }
  }
  return { source, ref, receipt, expected, afterStateRef, validation: () => validation }
}
test('read-only readiness bridges an exact applied historical infra receipt without changing the RELEASED control baseline', async () => {
  const h = harness()
  const bridge = bindAppliedInfrastructureBaseline(h)
  const result = await executeToolImageRotation(h.input)
  assert.equal(result.status, 'READY_FOR_IMAGE_BUILD')
  assert.equal(bridge.validation().readLiveJob, true)
  assert.deepEqual(h.baseline.intent.infraReceiptRef, h.infraRef)
  assert.notDeepEqual(bridge.ref, h.infraRef)
  assert.deepEqual(h.calls, { builds: 0, applies: 0, puts: 0, plans: 1 })
})
test('applied historical infra bridge rejects Terraform state that no longer equals the sealed after-state', async () => {
  const h = harness()
  bindAppliedInfrastructureBaseline(h)
  h.state.stateMeta.serial += 1
  await assert.rejects(executeToolImageRotation(h.input), /RECOVERY_AFTER_STATE_CHANGED/u)
  assert.deepEqual(h.calls, { builds: 0, applies: 0, puts: 0, plans: 0 })
})
test('applied historical infra bridge cannot be combined with a pre-activation-aborted control head', async () => {
  const h = harness()
  const bridge = bindAppliedInfrastructureBaseline(h)
  bindProducerAbort(h, { releaseId: 'ORGMASTER-ABORTED-BRIDGE-DENIED', infraRef: bridge.ref })
  await assert.rejects(executeToolImageRotation(h.input), /APPLIED_INFRA_BASELINE_CONTROL_INVALID/u)
  assert.deepEqual(h.calls, { builds: 0, applies: 0, puts: 0, plans: 0 })
})
test('prepared current-source rotation freezes the exact applied historical infra bridge', async () => {
  const h = harness()
  const bridge = bindAppliedInfrastructureBaseline(h)
  const prepared = await stopAt(h, 'prepared')
  assert.deepEqual(prepared.appliedInfraBaseline, bridge.expected)
  delete prepared.appliedInfraBaseline
  h.seed(`${h.prefix}/prepared.json`, reseal(prepared))
  await assert.rejects(executeToolImageRotation({ ...h.input, apply: true }), /PREPARED_BASELINE_CHANGED/u)
  assert.equal(h.calls.applies, 0)
})
test('read-only readiness resolves an exact sealed pre-activation abort to its released predecessor', async () => {
  const h = harness()
  const abort = bindProducerAbort(h, { releaseId: 'ORGMASTER-ABORTED-ATTEMPT', infraRef: h.infraRef })
  const result = await executeToolImageRotation(h.input)
  assert.equal(result.status, 'READY_FOR_IMAGE_BUILD')
  assert.deepEqual(result.baselineIntentRef, h.baselineIntentRef)
  for (const ref of [abort.prepareRef, abort.rollbackRef, abort.terminalRef]) assert.ok(h.trace.includes(`read:${ref.uri}`))
  assert.deepEqual(h.calls, { builds: 0, applies: 0, puts: 0, plans: 1 })
})
test('read-only readiness uses an already-applied rotation from the sealed aborted attempt as the live infrastructure baseline', async () => {
  const h = harness()
  const appliedInfra = { ownerApplicationId: 'orgmaster', sourceRevision: sourceFixture.rotationSourceRevision,
    migrationRunnerDigest: oldImage, controllerImageDigest: controllerImage, foundationManifestSha256: FOUNDATION }
  const appliedInfraRef = h.seed(`gs://${bucket}/receipts/tool-rotations/${sourceFixture.rotationSourceRevision}/app-infra.json`, appliedInfra)
  const abort = bindProducerAbort(h, { releaseId: 'ORGMASTER-ABORTED-APPLIED-TOOL', infraRef: appliedInfraRef })
  let validationCount = 0
  h.input.validateExistingRotation = async ({ intent, receipt, baseline }) => {
    validationCount++
    assert.deepEqual(intent, abort.attemptIntent); assert.deepEqual(receipt, appliedInfra); assert.deepEqual(baseline, h.baseline)
  }
  h.state.manifest.source_revision = sourceFixture.rotationSourceRevision
  const result = await executeToolImageRotation(h.input)
  assert.equal(result.status, 'READY_FOR_IMAGE_BUILD')
  assert.equal(validationCount, 1)
  assert.deepEqual(h.calls, { builds: 0, applies: 0, puts: 0, plans: 1 })
})
test('a published successor treats the aborted-attempt rotation as historical before validating the successor', async () => {
  const h = harness()
  const appliedInfra = { ownerApplicationId: 'orgmaster', sourceRevision: sourceFixture.rotationSourceRevision,
    migrationRunnerDigest: oldImage, controllerImageDigest: controllerImage, foundationManifestSha256: FOUNDATION }
  const appliedInfraRef = h.seed(`gs://${bucket}/receipts/tool-rotations/${sourceFixture.rotationSourceRevision}/app-infra.json`, appliedInfra)
  bindProducerAbort(h, { releaseId: 'ORGMASTER-ABORTED-PUBLISHED-SUCCESSOR', infraRef: appliedInfraRef })
  h.seed(`${h.prefix}/app-infra.json`, { invalidSuccessorFixture: true })
  let priorLiveReadback = null
  h.input.validateExistingRotation = async ({ readLiveJob }) => { priorLiveReadback = readLiveJob }
  h.state.manifest.source_revision = sourceFixture.rotationSourceRevision
  await assert.rejects(executeToolImageRotation(h.input), /TOOL_ROTATION_/u)
  assert.equal(priorLiveReadback, false)
  assert.equal(h.calls.builds, 0); assert.equal(h.calls.applies, 0)
})
test('non-protected source and non-finalized control stop before provider builds or apply', async () => {
  const h = harness()
  await assert.rejects(executeToolImageRotation({ ...h.input, sourceProof: {} }), /OFFICIAL_SOURCE_REQUIRED/u)
  const { controlSha256: _hash, ...core } = { ...h.control, state: 'ACTIVE' }
  h.store.set(h.controlUri, bytes({ ...core, controlSha256: sha256(canonicalize(core)) }))
  await assert.rejects(executeToolImageRotation(h.input), /CONTROL_NOT_RELEASED/u)
  assert.equal(h.calls.builds, 0); assert.equal(h.calls.applies, 0)
})
test('partial preflight or tampered prepared plans fail before apply', async () => {
  for (const mutate of [plan => plan.resource_changes.pop(), plan => { plan.resource_changes[0].change.actions = ['delete'] }]) {
    const h = harness(); mutate(h.plan)
    await assert.rejects(executeToolImageRotation({ ...h.input, apply: true }), /TOOL_ROTATION_/u)
    assert.equal(h.calls.builds, 0); assert.equal(h.calls.puts, 0); assert.equal(h.calls.applies, 0)
  }
  const h = harness()
  const prepared = await stopAt(h, 'prepared')
  const savedPlan = h.json('plan')
  savedPlan.variables.source_revision.value = 'f'.repeat(40)
  prepared.planJsonRef = h.seed(prepared.planJsonRef.uri, savedPlan)
  prepared.imageRotation.planJsonSha256 = prepared.planJsonRef.sha256
  h.seed(`${h.prefix}/prepared.json`, reseal(prepared))
  await assert.rejects(executeToolImageRotation({ ...h.input, apply: true }), /PREPARED_PLAN_INVALID/u)
  assert.equal(h.calls.applies, 0)
  assert.equal(h.store.has(`${h.prefix}/apply-attempt.json`), false)
})
test('source or control drift fails before a build submission', async () => {
  const h = harness()
  h.input.verifySource = () => ({ ...h.input.git, sourceRevision: 'f'.repeat(40) })
  await assert.rejects(executeToolImageRotation({ ...h.input, apply: true }), /SOURCE_CHANGED/u)
  assert.equal(h.calls.builds, 0); assert.equal(h.calls.applies, 0)
})
test('a new image plan containing an IAM mutation is never applied or promoted to a receipt', async () => {
  const h = harness()
  const originalPlan = h.input.terraform.plan
  h.input.terraform.plan = async options => {
    const result = await originalPlan(options)
    if (h.calls.plans === 2) result.plan.resource_changes.find(row => row.address.includes('iam_member')).change.actions = ['update']
    return result
  }
  await assert.rejects(executeToolImageRotation({ ...h.input, apply: true }), /ACTION_DENIED/u)
  assert.equal(h.calls.builds, 1); assert.equal(h.calls.applies, 0)
  assert.equal(h.store.has(`${h.prefix}/prepared.json`), false)
  assert.equal(h.store.has(`${h.prefix}/app-infra.json`), false)
})
test('a tampered native apply fence is rejected before any apply', async () => {
  const h = harness()
  const fence = await stopAt(h, 'fence')
  fence.preparedReceiptSha256 = 'f'.repeat(64)
  h.seed(`${h.prefix}/apply-attempt.json`, Object.hasOwn(fence, 'receiptSha256') ? reseal(fence) : fence)
  await assert.rejects(executeToolImageRotation({ ...h.input, apply: true }), /APPLY_FENCE_INVALID/u)
  assert.equal(h.calls.builds, 1); assert.equal(h.calls.applies, 0)
  assert.equal(h.store.has(`${h.prefix}/app-infra.json`), false)
})

test('composite apply success seals the real Git archive and complete before/after provider evidence', async () => {
  const h = harness()
  const result = await executeToolImageRotation({ ...h.input, apply: true })
  assert.equal(result.status, 'APPLIED')
  assert.equal(result.migrationRunnerDigest, newImage)
  assert.equal(result.ddlExecuted, 0)
  assert.equal(h.calls.builds, 1)
  assert.equal(h.calls.applies, 1)
  assert.equal(h.calls.plans, 2)
  const receipt = h.json('app-infra'), prepared = h.json('prepared'), build = h.json('build-proof')
  assertToolSeal(receipt); assertToolSeal(prepared); assertToolSeal(build)
  assert.equal(result.ref.sha256, sha256(h.store.get(result.ref.uri)))
  assert.equal(prepared.schemaVersion, 'orgmaster.tool-image-rotation-prepared.v1')
  assert.deepEqual(prepared.sourceProof, h.input.sourceProof)
  assert.deepEqual(prepared.baselineInfraRef, h.infraRef)
  assert.deepEqual(prepared.baselineIntentRef, h.baselineIntentRef)
  assert.equal(h.baseline.intent.ownerApplicationId, 'orgmaster')
  assert.equal(h.baseline.intent.releaseId, h.control.releaseId)
  assert.equal(build.sourceSha256, sourceFixture.identitySha256)
  assert.equal(build.sourceObject.sha256, sha256(sourceFixture.archive))
  assert.deepEqual(h.store.get(build.sourceObject.uri), sourceFixture.archive)
  await assertToolBuildProof({ root: sourceFixture.root, profile, build, sourceRevision, imageDigest: newImage,
    transport: h.input.transport })
  for (const name of ['before-state', 'after-state']) {
    const state = h.json(name)
    assert.deepEqual(state.stateJson.values.root_module.resources.map(row => row.address).sort(), rotationAddresses(infraProfile))
    assert.equal(state.stateMeta.resources.length, 75)
    assert.equal(state.manifest.controller_image_digest, controllerImage)
    assert.equal(state.manifest.foundation_manifest_sha256, FOUNDATION)
  }
  assert.equal(h.json('before-state').manifest.migration_runner_digest, oldImage)
  assert.equal(h.json('before-state').manifest.source_revision, sourceFixture.baselineRevision)
  assert.equal(h.json('after-state').manifest.migration_runner_digest, newImage)
  assert.equal(h.json('after-state').manifest.source_revision, sourceRevision)
  assert.deepEqual(h.store.get(prepared.controlSnapshotRef.uri), h.store.get(h.controlUri))
  assert.equal(receipt.terraformAddressCount, 75)
  assert.equal(receipt.stateSerial, 11)
  const applyIndex = h.trace.indexOf('terraform-apply')
  assert.ok(applyIndex >= 0)
  assert.ok(h.trace.slice(applyIndex + 1).includes('state-readback'))
  assert.ok(h.trace.slice(applyIndex + 1).includes('provider-job-readback'))
})

test('a valid resumed prepared bundle applies the saved plan without another build or plan', async () => {
  const h = harness()
  const prepared = await stopAt(h, 'prepared')
  const first = { builds: h.calls.builds, plans: h.calls.plans }
  const result = await executeToolImageRotation({ ...h.input, apply: true })
  assert.equal(result.status, 'APPLIED')
  assert.equal(h.calls.builds, first.builds)
  assert.equal(h.calls.plans, first.plans)
  assert.equal(h.calls.applies, 1)
  assert.deepEqual(h.json('app-infra').toolRotation.binaryPlanRef, prepared.binaryPlanRef)
  assert.equal(h.json('apply-attempt').preparedReceiptSha256, prepared.receiptSha256)
})

test('resumed prepared rejects live Job drift with unchanged Terraform serial before fence or apply', async () => {
  const h = harness()
  const prepared = await stopAt(h, 'prepared')
  const savedJob = h.json('provider-job-before')
  assert.equal(h.state.stateMeta.serial, prepared.beforeSerial)
  const readJob = h.input.transport.request
  h.input.transport.request = async url => {
    const live = await readJob(url)
    live.template.template.timeout = '1801s'
    live.generation = live.observedGeneration = '11'
    return live
  }
  const first = { builds: h.calls.builds, plans: h.calls.plans, traceLength: h.trace.length }
  await assert.rejects(executeToolImageRotation({ ...h.input, apply: true }),
    error => error.code === 'TOOL_ROTATION_LIVE_JOB_BASELINE_CHANGED')
  assert.equal(h.state.stateMeta.serial, prepared.beforeSerial)
  assert.deepEqual(h.json('provider-job-before'), savedJob)
  assert.equal(h.calls.builds, first.builds)
  assert.equal(h.calls.plans, first.plans)
  assert.equal(h.calls.applies, 0)
  assert.equal(h.store.has(`${h.prefix}/apply-attempt.json`), false)
  assert.equal(h.store.has(`${h.prefix}/app-infra.json`), false)
  const trace = h.trace.slice(first.traceLength)
  assert.ok(trace.indexOf('state-readback') >= 0)
  assert.ok(trace.indexOf('provider-job-readback') > trace.indexOf('state-readback'))
})

test('a legitimate unknown apply fence finishes by readback without duplicate apply', async () => {
  const h = harness({ unknownApply: true })
  await assert.rejects(executeToolImageRotation({ ...h.input, apply: true }), error =>
    ['TOOL_ROTATION_APPLY_OUTCOME_UNRESOLVED', 'TOOL_ROTATION_STATE_READBACK_INVALID'].includes(error.code))
  const fence = h.json('apply-attempt'), prepared = h.json('prepared')
  assert.equal(fence.preparedReceiptSha256, prepared.receiptSha256)
  assert.deepEqual(fence.binaryPlanRef, prepared.binaryPlanRef)
  assert.equal(h.calls.applies, 1)
  assert.equal(h.store.has(`${h.prefix}/app-infra.json`), false)
  const first = { builds: h.calls.builds, plans: h.calls.plans, traceLength: h.trace.length }
  h.markApplied()
  const result = await executeToolImageRotation({ ...h.input, apply: true })
  assert.equal(result.status, 'APPLIED')
  assert.equal(h.calls.applies, 1)
  assert.equal(h.calls.builds, first.builds)
  assert.equal(h.calls.plans, first.plans)
  assert.ok(h.trace.slice(first.traceLength).includes('state-readback'))
  assert.ok(h.trace.slice(first.traceLength).includes('provider-job-readback'))
  assert.equal(h.json('app-infra').stateSerial, 11)
})
