import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { gzipSync, gunzipSync } from 'node:zlib'
import { after, test } from 'node:test'
import { canonicalize, sha256 } from './dev012-owner-release-runtime.mjs'
import { createGitArchive, createGitSourceIdentity } from './dev012-owner-stage-executor.mjs'
import { buildMigrationToolImage, reuseMigrationToolImage, assertMigrationToolBuildEvidence } from './dev040-tool-image-build.mjs'

const RELEASE_ID = 'REL-TOOL-0001'
const DEADLINE = '2999-01-01T00:00:00.000Z'
const IMAGE_SHA = 'd'.repeat(64)
const RUNNER_URI = 'asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster-migration-runner'
const RUNNER_DOCKERFILE = 'infra/google-cloud/dev-040-production-release/migration-runner.Dockerfile'

function makeSource() {
  const root = fs.mkdtempSync(path.join(process.cwd(), '.dev040-tool-image-build-'))
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true })
    if (result.error || result.status !== 0) throw new Error(result.stderr || 'git fixture failed')
    return result.stdout.trim()
  }
  try {
    git('init', '--quiet')
    git('config', 'user.name', 'Tool Image Test')
    git('config', 'user.email', 'tool-image-test@example.invalid')
    fs.writeFileSync(path.join(root, 'source.txt'), 'source bytes for migration runner\n')
    git('add', 'source.txt')
    git('commit', '--quiet', '-m', 'fixture source')
    const sourceRevision = git('rev-parse', 'HEAD')
    const sourceSha256 = sha256(createGitSourceIdentity(root, sourceRevision))
    return { root, sourceRevision, sourceSha256 }
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true })
    throw error
  }
}

function removeSource(root) {
  assert.ok(path.resolve(root).startsWith(path.resolve(process.cwd()) + path.sep))
  assert.ok(path.basename(root).startsWith('.dev040-tool-image-build-'))
  fs.rmSync(root, { recursive: true, force: true })
}

const sharedSource = makeSource()
after(() => removeSource(sharedSource.root))

function makeProfile() {
  return {
    application: { id: 'orgmaster', repository: 'jedchang0308-jenfu/OrgMaster', branch: 'master' },
    target: { projectId: 'jenfu-platform-prod', projectNumber: '9536592944', region: 'asia-east1' },
    identities: { builder: 'orgmaster-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com' },
    artifact: {
      releaseBucket: 'jenfu-platform-prod-orgmaster-release',
      repository: 'orgmaster-release',
      uri: 'asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster',
      migrationRunnerUri: RUNNER_URI,
      migrationRunnerImage: 'orgmaster-migration-runner',
    },
    build: {
      dockerBuilderImage: 'gcr.io/cloud-builders/docker@sha256:3d00b6c1a9b862621c30fc74d4f2abfc62bcbdee631ed3febd31e7edbdf6252c',
      dockerfile: 'Dockerfile',
      dockerTarget: 'runner',
      maximumAllowedSeverity: 'MEDIUM',
      lockPolicy: { npm: 'package-lock.json', node: '24.11' },
    },
    runtime: { containerName: 'orgmaster' },
    securityPolicy: { requestedVerifyOption: 'VERIFIED', network: 'restricted' },
  }
}

function makeScanEvidence(artifactDigest) {
  const resourceUrl = `https://${artifactDigest}`
  return {
    resourceUrl,
    buildOccurrenceNames: ['projects/p/occurrences/build-1'],
    discoveryOccurrenceNames: ['projects/p/occurrences/discovery-1'],
    sbomOccurrenceNames: ['projects/p/occurrences/sbom-1'],
    vulnerabilityCount: 2,
    rawHighOrCriticalVulnerabilityCount: 0,
    blockingVulnerabilityCount: 0,
    notAffectedAssessments: [{ cve: 'CVE-TEST-0001', policy: { id: 'reviewed-policy' }, assessment: { status: 'NOT_AFFECTED' } }],
    sbomExport: { resourceUrl, discoveryOccurrenceId: 'projects/p/locations/asia-east1/occurrences/sbom-export-1' },
    observedAt: '2026-10-18T01:00:00.000Z',
    status: 'PASS',
  }
}

function makeTransport({ fault = null, reused = false, buildError = null } = {}) {
  const calls = { putBytes: [], createBuild: [], readArtifactImage: [], waitArtifactEvidence: [] }
  const transport = {
    async putBytes(uri, bytes, options) {
      calls.putBytes.push({ uri, bytes: Buffer.from(bytes), options: structuredClone(options) })
      return {
        bytes: Buffer.from(bytes),
        ref: { uri, sha256: sha256(bytes) },
        metadata: { generation: '73', crc32c: 'fixture-crc32c' },
        reused: true,
      }
    },
    async createBuild(input) {
      calls.createBuild.push(input)
      if (buildError) throw buildError
      const { profile, intent, sourceObject } = input
      const tag = `${profile.artifact.uri}:release-${intent.sourceRevision}`
      const args = [
        'build', '--pull=false', '--no-cache', '--file', profile.build.dockerfile,
        '--target', profile.build.dockerTarget,
        '--build-arg', `SOURCE_REVISION=${intent.sourceRevision}`,
        '--build-arg', `SOURCE_TREE=${intent.sourceSha256}`,
        '--build-arg', 'SOURCE_CREATED_AT=1970-01-01T00:00:00Z',
        '--build-arg', `SOURCE_VERSION=${intent.sourceRevision}`,
        '--build-arg', 'SOURCE_STATE=frozen', '--tag', tag, '.',
      ]
      const storage = {
        bucket: profile.artifact.releaseBucket,
        object: sourceObject.ref.uri.split('/').slice(3).join('/'),
        generation: String(sourceObject.metadata.generation),
      }
      const request = {
        source: { storageSource: { ...storage } },
        steps: [{ name: profile.build.dockerBuilderImage, dir: 'source', args }],
        images: [tag],
        timeout: '1800s',
        queueTtl: '300s',
        logsBucket: `gs://${profile.artifact.releaseBucket}/logs/cloud-build`,
        serviceAccount: `projects/${profile.target.projectId}/serviceAccounts/${profile.identities.builder}`,
        options: { logging: 'GCS_ONLY', logStreamingOption: 'STREAM_OFF', requestedVerifyOption: 'VERIFIED' },
      }
      const buildInputSha256 = sha256(canonicalize({ ownerApplicationId: profile.application.id, sourceArchiveSha256: sourceObject.ref.sha256, request }))
      const cloudBuild = {
        id: '12345678-1234-1234-1234-123456789abc',
        name: `projects/${profile.target.projectId}/locations/${profile.target.region}/builds/12345678-1234-1234-1234-123456789abc`,
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
        tags: ['dev-012', profile.application.id, `owner-build-${buildInputSha256}`, intent.releaseId.toLowerCase(), 'owner-submission-1'],
        results: { images: [{ name: tag, digest: `sha256:${IMAGE_SHA}` }] },
        options: structuredClone(request.options),
      }
      if (fault === 'target') cloudBuild.steps[0].args[cloudBuild.steps[0].args.indexOf('--target') + 1] = 'runner'
      if (fault === 'source') cloudBuild.source.storageSource.object = 'source/other.tar.gz'
      if (fault === 'provenance') cloudBuild.sourceProvenance.resolvedStorageSource.generation = '72'
      if (fault === 'status') cloudBuild.status = 'FAILURE'
      if (fault === 'project-number') cloudBuild.name = cloudBuild.name.replace(profile.target.projectId, profile.target.projectNumber)
      if (fault === 'foreign-project-number') cloudBuild.name = cloudBuild.name.replace(profile.target.projectId, '1234567890')
      if (fault === 'foreign-project-id') cloudBuild.projectId = 'other-project'
      return {
        artifactDigest: `${profile.artifact.uri}@sha256:${fault === 'digest' ? 'f'.repeat(64) : IMAGE_SHA}`,
        build: cloudBuild,
        request: { ...request, tags: [...cloudBuild.tags] },
        buildInputSha256,
        sourceArchiveSha256: sourceObject.ref.sha256,
        reused,
        disposition: reused ? 'REUSED_PROVIDER_BUILD' : 'BUILT',
      }
    },
    async readArtifactImage(profile, artifactDigest) {
      calls.readArtifactImage.push({ profile, artifactDigest })
      const name = `projects/${profile.target.projectId}/locations/${profile.target.region}/repositories/${profile.artifact.repository}/dockerImages/${profile.artifact.migrationRunnerImage}@sha256:${IMAGE_SHA}`
      return { name: fault === 'registry' ? `${name}-other` : name, uri: artifactDigest }
    },
    async waitArtifactEvidence(input) {
      calls.waitArtifactEvidence.push(input)
      const evidence = makeScanEvidence(input.artifactDigest)
      if (fault === 'scan') evidence.blockingVulnerabilityCount = 1
      return evidence
    },
  }
  return { transport, calls }
}

async function runBuild({ fault = null, reused = false, buildError = null, profile = makeProfile(), sourceSha256 } = {}) {
  const source = sharedSource
  const setup = makeTransport({ fault, reused, buildError })
  try {
    const result = await buildMigrationToolImage({
      root: source.root,
      profile,
      sourceRevision: source.sourceRevision,
      sourceSha256: sourceSha256 ?? source.sourceSha256,
      releaseId: RELEASE_ID,
      transport: setup.transport,
      deadlineAt: DEADLINE,
    })
    return { ...result, source, ...setup }
  } catch (error) {
    error.fixture = { source, ...setup }
    throw error
  }
}

test('builds the migration runner with an immutable source archive and sealed evidence', async () => {
  const profile = makeProfile()
  const originalProfile = structuredClone(profile)
  const { imageDigest, buildProof, sourceObject, source, calls } = await runBuild({ profile })
  try {
    assert.equal(imageDigest, `${RUNNER_URI}@sha256:${IMAGE_SHA}`)
    assert.equal(sourceObject.ref.sha256, sha256(calls.putBytes[0].bytes))
    assert.equal(sourceObject.ref.uri, `gs://${profile.artifact.releaseBucket}/source/archives/${sourceObject.ref.sha256}/source.tar.gz`)
    assert.equal(sourceObject.metadata.generation, '73')
    assert.deepEqual(gunzipSync(calls.putBytes[0].bytes), createGitArchive(source.root, source.sourceRevision))
    assert.deepEqual(calls.putBytes[0].options, { bucket: profile.artifact.releaseBucket, prefix: 'source', contentType: 'application/gzip' })

    const expectedBuildProfile = structuredClone(originalProfile)
    expectedBuildProfile.artifact.uri = RUNNER_URI
    expectedBuildProfile.build.dockerfile = RUNNER_DOCKERFILE
    expectedBuildProfile.build.dockerTarget = 'runtime'
    const buildInput = calls.createBuild[0]
    assert.deepEqual(buildInput.profile, expectedBuildProfile)
    assert.deepEqual(profile, originalProfile)
    assert.equal(buildInput.intent.sourceRevision, source.sourceRevision)
    assert.equal(buildInput.intent.sourceSha256, source.sourceSha256)
    assert.equal(buildInput.intent.releaseId, RELEASE_ID)
    assert.equal(buildInput.profile.identities.builder, originalProfile.identities.builder)
    assert.equal(buildInput.profile.build.dockerBuilderImage, originalProfile.build.dockerBuilderImage)
    assert.equal(buildInput.profile.build.maximumAllowedSeverity, originalProfile.build.maximumAllowedSeverity)
    assert.deepEqual(buildInput.profile.build.lockPolicy, originalProfile.build.lockPolicy)
    assert.deepEqual(buildInput.profile.securityPolicy, originalProfile.securityPolicy)
    assert.deepEqual(buildInput.profile.runtime, originalProfile.runtime)

    assert.equal(buildProof.schemaVersion, 'orgmaster.tool-image-build.v1')
    assert.equal(buildProof.ownerApplicationId, 'orgmaster')
    assert.equal(buildProof.sourceRevision, source.sourceRevision)
    assert.equal(buildProof.sourceSha256, source.sourceSha256)
    assert.equal(buildProof.artifactDigest, imageDigest)
    assert.equal(buildProof.status, 'PASS')
    assert.equal(buildProof.sourceObject.uri, sourceObject.ref.uri)
    assert.equal(buildProof.sourceObject.generation, '73')
    assert.equal(buildProof.sourceObject.crc32c, 'fixture-crc32c')
    assert.equal(buildProof.cloudBuild.status, 'SUCCESS')
    assert.equal(buildProof.cloudBuild.sourceProvenance.resolvedStorageSource.generation, '73')
    assert.match(buildProof.buildInputSha256, /^[a-f0-9]{64}$/u)
    assert.deepEqual(buildProof.scan, makeScanEvidence(imageDigest))
    assert.equal(buildProof.artifactRegistry.uri, imageDigest)
    const { receiptSha256, ...core } = buildProof
    assert.equal(receiptSha256, sha256(canonicalize(core)))
    assert.equal(calls.createBuild.length, 1)
    assert.equal(calls.readArtifactImage.length, 1)
    assert.equal(calls.waitArtifactEvidence.length, 1)
    assert.equal(calls.waitArtifactEvidence[0].requireActiveAnalysis, false)
  } finally { assert.ok(source.root) }
})

for (const [fault, expectedCode] of [
  ['digest', 'TOOL_IMAGE_BUILD_DIGEST_INVALID'],
  ['target', 'TOOL_IMAGE_BUILD_TARGET_INVALID'],
  ['source', 'TOOL_IMAGE_BUILD_SOURCE_INVALID'],
  ['provenance', 'TOOL_IMAGE_BUILD_PROVENANCE_INVALID'],
  ['status', 'TOOL_IMAGE_BUILD_STATUS_INVALID'],
  ['registry', 'TOOL_IMAGE_ARTIFACT_READBACK_INVALID'],
  ['scan', 'TOOL_IMAGE_SCAN_EVIDENCE_INVALID'],
]) {
  test(`rejects provider build evidence with an invalid ${fault}`, async () => {
    await assert.rejects(runBuild({ fault }), error => {
      assert.equal(error.code, expectedCode)
      return true
    })
  })
}

test('rejects a source identity that does not match the requested source hash', async () => {
  await assert.rejects(runBuild({ sourceSha256: 'a'.repeat(64) }), error => {
    assert.equal(error.code, 'TOOL_IMAGE_SOURCE_IDENTITY_MISMATCH')
    assert.equal(error.fixture.calls.putBytes.length, 0)
    assert.equal(error.fixture.calls.createBuild.length, 0)
    return true
  })
})

test('reuses the provider build and requires current active analysis evidence', async () => {
  const result = await runBuild({ reused: true })
  try {
    assert.equal(result.buildProof.cloudBuild.status, 'SUCCESS')
    assert.equal(result.calls.createBuild.length, 1)
    assert.equal(result.calls.waitArtifactEvidence[0].requireActiveAnalysis, true)
  } finally { assert.ok(result.source.root) }
})

test('propagates an unknown build submission outcome without a duplicate call', async () => {
  const error = Object.assign(new Error('unknown submission result'), { code: 'OUTCOME_UNKNOWN' })
  await assert.rejects(runBuild({ buildError: error }), caught => {
    assert.equal(caught, error)
    assert.equal(caught.fixture.calls.createBuild.length, 1)
    assert.equal(caught.fixture.calls.readArtifactImage.length, 0)
    assert.equal(caught.fixture.calls.waitArtifactEvidence.length, 0)
    return true
  })
})

test('accepts the exact verified project-number alias without rewriting provider provenance', async () => {
  const result = await runBuild({ fault: 'project-number' })
  assert.equal(result.buildProof.cloudBuild.name,
    `projects/9536592944/locations/asia-east1/builds/${result.buildProof.cloudBuild.id}`)
  assert.equal(result.buildProof.cloudBuild.projectId, 'jenfu-platform-prod')
  assertMigrationToolBuildEvidence({ profile: makeProfile(), proof: result.buildProof })
})

test('rejects another project number or projectId even when the remaining evidence matches', async () => {
  for (const fault of ['foreign-project-number', 'foreign-project-id']) {
    await assert.rejects(runBuild({ fault }), error => error.code === 'TOOL_IMAGE_BUILD_READBACK_INVALID')
  }
})

let historicalFixture
after(() => { if (historicalFixture) removeSource(historicalFixture.root) })

async function reuseHarness() {
  if (!historicalFixture) {
    const source = makeSource()
    historicalFixture = source
    const profile = makeProfile()
    const archive = gzipSync(createGitArchive(source.root, source.sourceRevision), { level: 9 })
    // Preserve a Linux-produced gzip header even when this test runs on Windows.
    archive[9] = 3
    const hash = sha256(archive)
    const sourceObject = { bytes: archive,
      ref: { uri: `gs://${profile.artifact.releaseBucket}/source/archives/${hash}/source.tar.gz`, sha256: hash },
      metadata: { generation: '73', crc32c: 'fixture-crc32c' } }
    const toolProfile = structuredClone(profile)
    toolProfile.artifact.uri = RUNNER_URI
    toolProfile.build.dockerfile = RUNNER_DOCKERFILE
    toolProfile.build.dockerTarget = 'runtime'
    const original = await makeTransport({ reused: true }).transport.createBuild({ profile: toolProfile,
      intent: { sourceRevision: source.sourceRevision, sourceSha256: source.sourceSha256, releaseId: RELEASE_ID }, sourceObject })
    original.build.name = original.build.name.replace(profile.target.projectId, profile.target.projectNumber)
    fs.writeFileSync(path.join(source.root, 'current-source.txt'), 'new rotation source; historical artifact stays unchanged\n')
    for (const args of [['add', 'current-source.txt'], ['-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'current source']]) {
      const command = spawnSync('git', args, { cwd: source.root, encoding: 'utf8', windowsHide: true })
      assert.equal(command.status, 0, command.stderr)
    }
    const current = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: source.root, encoding: 'utf8', windowsHide: true })
    assert.equal(current.status, 0)
    Object.assign(historicalFixture, { currentSourceRevision: current.stdout.trim(), original, sourceObject })
  }
  const source = historicalFixture
  const setup = makeTransport({ reused: true })
  const calls = { ...setup.calls, readBytes: [], posts: 0 }
  const h = { providerBuild: structuredClone(source.original.build), buildResult: structuredClone(source.original),
    downloaded: { bytes: Buffer.from(source.sourceObject.bytes), ref: { ...source.sourceObject.ref }, metadata: { ...source.sourceObject.metadata } }, calls }
  const transport = {
    ...setup.transport,
    async readBytes(uri, options) {
      calls.readBytes.push({ uri, options })
      return h.downloaded
    },
    async putBytes() { calls.putBytes.push('unexpected write'); throw new Error('reuse must not upload source') },
    async createBuild(input) {
      calls.createBuild.push(input)
      if (input.reuseOnly !== true) { calls.posts++; throw new Error('unexpected build submission') }
      return h.buildResult
    },
    async waitArtifactEvidence(input) {
      const evidence = await setup.transport.waitArtifactEvidence(input)
      return { ...evidence, observedAt: '2026-10-18T02:00:00.000Z' }
    },
  }
  h.input = { root: source.root, profile: makeProfile(), sourceRevision: source.sourceRevision,
    currentSourceRevision: source.currentSourceRevision, providerBuild: h.providerBuild, transport, deadlineAt: DEADLINE }
  return h
}

test('read-only reuse pins the original build and source archive while refreshing active scan evidence', async () => {
  const h = await reuseHarness()
  const result = await reuseMigrationToolImage(h.input)
  assert.equal(h.calls.posts, 0)
  assert.equal(h.calls.putBytes.length, 0)
  assert.equal(h.calls.createBuild.length, 1)
  assert.equal(h.calls.createBuild[0].reuseOnly, true)
  assert.equal(h.calls.readBytes[0].uri, h.downloaded.ref.uri)
  assert.deepEqual(h.calls.readBytes[0].options, { prefixes: ['source'], expectedSha256: h.downloaded.ref.sha256 })
  assert.deepEqual(h.calls.createBuild[0].sourceObject.bytes, historicalFixture.sourceObject.bytes)
  assert.equal(h.calls.createBuild[0].intent.sourceSha256, historicalFixture.sourceSha256)
  assert.equal(result.buildProof.sourceRevision, historicalFixture.sourceRevision)
  assert.notEqual(result.buildProof.sourceRevision, h.input.currentSourceRevision)
  assert.deepEqual(result.buildProof.cloudBuild, h.providerBuild)
  assert.equal(result.buildProof.reused, true)
  assert.equal(result.buildProof.buildDisposition, 'REUSED_PROVIDER_BUILD')
  assert.equal(result.buildProof.scan.observedAt, '2026-10-18T02:00:00.000Z')
  assert.equal(h.calls.waitArtifactEvidence[0].requireActiveAnalysis, true)
  assert.equal(h.calls.waitArtifactEvidence[0].sourceRevision, historicalFixture.sourceRevision)
  assertMigrationToolBuildEvidence({ profile: h.input.profile, proof: result.buildProof })
  const { receiptSha256, ...core } = result.buildProof
  assert.equal(receiptSha256, sha256(canonicalize(core)))
})

test('reuse rejects foreign project or mismatched historical source before provider lookup', async () => {
  for (const fault of ['project', 'source']) {
    const h = await reuseHarness()
    if (fault === 'project') h.providerBuild.name = h.providerBuild.name.replace('9536592944', '1234567890')
    else {
      const args = h.providerBuild.steps[0].args
      args[args.indexOf(`SOURCE_REVISION=${h.input.sourceRevision}`)] = `SOURCE_REVISION=${h.input.currentSourceRevision}`
    }
    await assert.rejects(reuseMigrationToolImage(h.input), error =>
      ['TOOL_IMAGE_BUILD_READBACK_INVALID', 'TOOL_IMAGE_BUILD_TARGET_INVALID'].includes(error.code))
    assert.equal(h.calls.createBuild.length, 0)
    assert.equal(h.calls.posts, 0)
  }
})

test('reuse validates the original compressed hash, generation and historical tar bytes', async () => {
  for (const fault of ['hash', 'generation', 'archive', 'bucket']) {
    const h = await reuseHarness()
    if (fault === 'hash') h.downloaded.bytes[20] ^= 1
    if (fault === 'generation') h.downloaded.metadata.generation = '74'
    if (fault === 'bucket') h.providerBuild.sourceProvenance.resolvedStorageSource.bucket = 'other-release'
    if (fault === 'archive') {
      h.downloaded.bytes = gzipSync(Buffer.from('not the historical Git archive'))
      const hash = sha256(h.downloaded.bytes)
      h.downloaded.ref = { uri: `gs://${h.input.profile.artifact.releaseBucket}/source/archives/${hash}/source.tar.gz`, sha256: hash }
      h.providerBuild.sourceProvenance.resolvedStorageSource.object = `source/archives/${hash}/source.tar.gz`
    }
    await assert.rejects(reuseMigrationToolImage(h.input), error =>
      ['TOOL_IMAGE_SOURCE_OBJECT_INVALID', 'TOOL_IMAGE_SOURCE_ARCHIVE_INVALID', 'TOOL_IMAGE_BUILD_PROVENANCE_INVALID'].includes(error.code))
    assert.equal(h.calls.createBuild.length, 0)
    assert.equal(h.calls.posts, 0)
  }
})

test('reuse rejects a new submission or a different returned build ID or digest', async () => {
  for (const fault of ['not-reused', 'id', 'digest', 'timestamps']) {
    const h = await reuseHarness()
    if (fault === 'not-reused') { h.buildResult.reused = false; h.buildResult.disposition = 'BUILT' }
    if (fault === 'id') h.buildResult.build.id = '87654321-1234-1234-1234-123456789abc'
    if (fault === 'digest') h.buildResult.artifactDigest = `${RUNNER_URI}@sha256:${'f'.repeat(64)}`
    if (fault === 'timestamps') h.buildResult.build.finishTime = '2026-10-18T00:02:00.000Z'
    await assert.rejects(reuseMigrationToolImage(h.input), error => error.code === 'TOOL_IMAGE_BUILD_REUSE_MISMATCH')
    assert.equal(h.calls.createBuild.length, 1)
    assert.equal(h.calls.posts, 0)
    assert.equal(h.calls.waitArtifactEvidence.length, 0)
  }
})
