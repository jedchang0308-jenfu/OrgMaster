import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { gunzipSync } from 'node:zlib'
import { after, test } from 'node:test'
import { canonicalize, sha256 } from './dev012-owner-release-runtime.mjs'
import { createGitArchive, createGitSourceIdentity } from './dev012-owner-stage-executor.mjs'
import { buildMigrationToolImage } from './dev040-tool-image-build.mjs'

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
    target: { projectId: 'jenfu-platform-prod', region: 'asia-east1' },
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
