import { gzipSync } from 'node:zlib'
import { createGitArchive, createGitSourceIdentity } from './dev012-owner-stage-executor.mjs'
import { canonicalize, sha256 } from './dev012-owner-release-runtime.mjs'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const BUILD_ID = /^[a-f0-9]{8}-[a-f0-9-]{27}$/u
const MIGRATION_RUNNER_DOCKERFILE = 'infra/google-cloud/dev-040-production-release/migration-runner.Dockerfile'

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}:${detail}` : code)
  error.code = code
  throw error
}

function gsObject(ref, bucket) {
  const match = /^gs:\/\/([^/]+)\/(.+)$/u.exec(ref?.uri ?? '')
  if (!match || match[1] !== bucket) fail('TOOL_IMAGE_SOURCE_OBJECT_INVALID')
  return { bucket: match[1], object: match[2] }
}

function exactFlagValue(args, flag, expected, code) {
  const indices = args.flatMap((value, index) => value === flag ? [index] : [])
  if (indices.length !== 1 || args[indices[0] + 1] !== expected) fail(code, flag)
}

function assertBuildStep(step, profile, intent, imageTag, code) {
  if (step?.name !== profile.build.dockerBuilderImage || step.dir !== 'source' || !Array.isArray(step.args)) fail(code, 'step')
  exactFlagValue(step.args, '--file', profile.build.dockerfile, code)
  exactFlagValue(step.args, '--target', profile.build.dockerTarget, code)
  exactFlagValue(step.args, '--tag', imageTag, code)
  if (!step.args.includes(`SOURCE_REVISION=${intent.sourceRevision}`)
    || !step.args.includes(`SOURCE_TREE=${intent.sourceSha256}`)) fail(code, 'source-build-args')
}

function assertStorageSource(value, expected, code) {
  if (value?.bucket !== expected.bucket || value.object !== expected.object
    || String(value.generation) !== expected.generation) fail(code)
}

function assertBuildEvidence({ buildResult, profile, intent, sourceObject }) {
  const imageTag = `${profile.artifact.uri}:release-${intent.sourceRevision}`
  const expectedStorage = { ...gsObject(sourceObject.ref, profile.artifact.releaseBucket), generation: String(sourceObject.metadata.generation) }
  const inputHash = buildResult?.buildInputSha256
  const cloudBuild = buildResult?.build

  if (!H64.test(inputHash ?? '') || buildResult.sourceArchiveSha256 !== sourceObject.ref.sha256
    || typeof buildResult.reused !== 'boolean'
    || buildResult.disposition !== (buildResult.reused ? 'REUSED_PROVIDER_BUILD' : 'BUILT')
  ) fail('TOOL_IMAGE_BUILD_INPUT_INVALID')

  if (!cloudBuild || !BUILD_ID.test(cloudBuild.id ?? '')
    || cloudBuild.name !== `projects/${profile.target.projectId}/locations/${profile.target.region}/builds/${cloudBuild.id}`
    || cloudBuild.projectId !== profile.target.projectId
    || cloudBuild.serviceAccount !== `projects/${profile.target.projectId}/serviceAccounts/${profile.identities.builder}`
    || cloudBuild.status !== 'SUCCESS') {
    fail(cloudBuild?.status === 'SUCCESS' ? 'TOOL_IMAGE_BUILD_READBACK_INVALID' : 'TOOL_IMAGE_BUILD_STATUS_INVALID')
  }
  const times = ['createTime', 'startTime', 'finishTime'].map(key => Date.parse(cloudBuild[key] ?? ''))
  if (times.some(value => !Number.isFinite(value)) || times[0] > times[1] || times[1] > times[2]) fail('TOOL_IMAGE_BUILD_READBACK_INVALID', 'timestamps')
  if (!Array.isArray(cloudBuild.steps) || cloudBuild.steps.length !== 1) fail('TOOL_IMAGE_BUILD_TARGET_INVALID')
  assertBuildStep(cloudBuild.steps[0], profile, intent, imageTag, 'TOOL_IMAGE_BUILD_TARGET_INVALID')
  assertStorageSource(cloudBuild.source?.storageSource, expectedStorage, 'TOOL_IMAGE_BUILD_SOURCE_INVALID')
  if (canonicalize(cloudBuild.images) !== canonicalize([imageTag])
    || cloudBuild.options?.requestedVerifyOption !== 'VERIFIED'
    || cloudBuild.options?.logging !== 'GCS_ONLY'
    || cloudBuild.options?.logStreamingOption !== 'STREAM_OFF'
    || !(cloudBuild.tags ?? []).includes(`owner-build-${inputHash}`)) fail('TOOL_IMAGE_BUILD_READBACK_INVALID', 'request-binding')

  const provenance = cloudBuild.sourceProvenance?.resolvedStorageSource
  if (provenance?.bucket !== expectedStorage.bucket || provenance.object !== expectedStorage.object
    || String(provenance.generation) !== expectedStorage.generation) fail('TOOL_IMAGE_BUILD_PROVENANCE_INVALID')
  const imageRows = cloudBuild.results?.images
  const resultDigest = imageRows?.[0]?.digest
  const expectedDigest = `${profile.artifact.uri}@${resultDigest}`
  if (imageRows?.length !== 1 || imageRows[0]?.name !== imageTag || !/^sha256:[a-f0-9]{64}$/u.test(resultDigest ?? '')
    || buildResult.artifactDigest !== expectedDigest
    || buildResult.artifactDigest !== `${profile.artifact.uri}@sha256:${resultDigest?.slice('sha256:'.length)}`) fail('TOOL_IMAGE_BUILD_DIGEST_INVALID')
  return { imageTag, cloudBuild, inputHash, expectedStorage }
}

function assertArtifactAndScan({ profile, imageReadback, scanEvidence, imageDigest }) {
  const resourceUrl = `https://${imageDigest}`
  const imageSha = imageDigest.slice(profile.artifact.uri.length + 1)
  const expectedName = `projects/${profile.target.projectId}/locations/${profile.target.region}/repositories/${profile.artifact.repository}/dockerImages/${profile.artifact.migrationRunnerImage}@${imageSha}`
  if (imageReadback?.uri !== imageDigest || imageReadback?.name !== expectedName) fail('TOOL_IMAGE_ARTIFACT_READBACK_INVALID')
  if (scanEvidence?.status !== 'PASS' || scanEvidence.resourceUrl !== resourceUrl
    || !Array.isArray(scanEvidence.buildOccurrenceNames) || scanEvidence.buildOccurrenceNames.length === 0
    || !Array.isArray(scanEvidence.discoveryOccurrenceNames) || scanEvidence.discoveryOccurrenceNames.length === 0
    || !Array.isArray(scanEvidence.sbomOccurrenceNames) || scanEvidence.sbomOccurrenceNames.length === 0
    || !Number.isFinite(scanEvidence.vulnerabilityCount) || scanEvidence.vulnerabilityCount < 0
    || scanEvidence.blockingVulnerabilityCount !== 0
    || scanEvidence.sbomExport?.resourceUrl !== resourceUrl
    || typeof scanEvidence.sbomExport?.discoveryOccurrenceId !== 'string'
    || !Number.isFinite(Date.parse(scanEvidence.observedAt ?? ''))) fail('TOOL_IMAGE_SCAN_EVIDENCE_INVALID')
}

/** Revalidate the sealed producer's original request/provenance, including recipe. */
export function assertMigrationToolBuildEvidence({ profile, proof }) {
  const toolProfile = structuredClone(profile)
  toolProfile.artifact.uri = profile.artifact.migrationRunnerUri
  toolProfile.build.dockerfile = MIGRATION_RUNNER_DOCKERFILE
  toolProfile.build.dockerTarget = 'runtime'
  assertBuildEvidence({ profile: toolProfile, intent: proof,
    sourceObject: { ref: proof.sourceObject, metadata: proof.sourceObject },
    buildResult: { build: proof.cloudBuild, artifactDigest: proof.artifactDigest,
      buildInputSha256: proof.buildInputSha256, sourceArchiveSha256: proof.sourceObject?.sha256,
      reused: proof.reused, disposition: proof.buildDisposition } })
  assertArtifactAndScan({ profile: toolProfile, imageReadback: proof.artifactRegistry,
    scanEvidence: proof.scan, imageDigest: proof.artifactDigest })
}

/**
 * Build and seal the DEV-040 migration-runner image using the existing owner transport.
 * The transport retains responsibility for provider retries, submission fencing, and build reuse.
 */
export async function buildMigrationToolImage({ root, profile, sourceRevision, sourceSha256, releaseId, transport, deadlineAt }) {
  if (typeof root !== 'string' || !root || profile?.application?.id !== 'orgmaster' || !profile?.target?.projectId
    || !profile?.target?.region || !profile?.identities?.builder || !profile?.artifact?.releaseBucket
    || !profile?.artifact?.uri || !profile?.artifact?.repository || !profile?.artifact?.migrationRunnerImage
    || !profile?.artifact?.migrationRunnerUri || profile.artifact.migrationRunnerUri === profile.artifact.uri
    || !profile?.build?.dockerBuilderImage || !H40.test(sourceRevision ?? '') || !H64.test(sourceSha256 ?? '')
    || !/^[A-Z0-9][A-Z0-9-]{5,63}$/u.test(releaseId ?? '')
    || !Number.isFinite(Date.parse(deadlineAt ?? '')) || Date.parse(deadlineAt) <= Date.now()
    || !transport || !['putBytes', 'createBuild', 'readArtifactImage', 'waitArtifactEvidence'].every(name => typeof transport[name] === 'function')) {
    fail('TOOL_IMAGE_INPUT_INVALID')
  }

  const sourceIdentity = createGitSourceIdentity(root, sourceRevision)
  if (!Buffer.isBuffer(sourceIdentity) || sha256(sourceIdentity) !== sourceSha256) fail('TOOL_IMAGE_SOURCE_IDENTITY_MISMATCH')
  const sourceBytes = createGitArchive(root, sourceRevision)
  if (!Buffer.isBuffer(sourceBytes) || sourceBytes.length === 0) fail('TOOL_IMAGE_SOURCE_ARCHIVE_INVALID')
  const archiveBytes = gzipSync(sourceBytes, { level: 9 })
  const archiveSha256 = sha256(archiveBytes)
  const sourceUri = `gs://${profile.artifact.releaseBucket}/source/archives/${archiveSha256}/source.tar.gz`
  const uploadedSource = await transport.putBytes(sourceUri, archiveBytes, {
    bucket: profile.artifact.releaseBucket,
    prefix: 'source',
    contentType: 'application/gzip',
  })
  if (!Buffer.isBuffer(uploadedSource?.bytes) || !uploadedSource.bytes.equals(archiveBytes)
    || uploadedSource.ref?.uri !== sourceUri || uploadedSource.ref.sha256 !== archiveSha256
    || !/^[1-9][0-9]*$/u.test(String(uploadedSource.metadata?.generation ?? ''))
    || typeof uploadedSource.metadata?.crc32c !== 'string' || !uploadedSource.metadata.crc32c) {
    fail('TOOL_IMAGE_SOURCE_OBJECT_INVALID')
  }
  const sourceObject = {
    ref: { uri: uploadedSource.ref.uri, sha256: uploadedSource.ref.sha256 },
    metadata: { generation: String(uploadedSource.metadata.generation), crc32c: uploadedSource.metadata.crc32c },
  }
  const toolProfile = structuredClone(profile)
  toolProfile.artifact.uri = profile.artifact.migrationRunnerUri
  toolProfile.build.dockerfile = MIGRATION_RUNNER_DOCKERFILE
  toolProfile.build.dockerTarget = 'runtime'
  const intent = { sourceRevision, sourceSha256, releaseId }

  // createBuild owns build lookup, submission fences, bounded retries, and unknown-outcome recovery.
  const buildResult = await transport.createBuild({ profile: toolProfile, intent, sourceObject: uploadedSource, deadlineAt })
  const validated = assertBuildEvidence({ buildResult, profile: toolProfile, intent, sourceObject })
  const imageDigest = buildResult.artifactDigest
  const imageReadback = await transport.readArtifactImage(toolProfile, imageDigest)
  const scanEvidence = await transport.waitArtifactEvidence({ profile: toolProfile, sourceRevision, artifactDigest: imageDigest, deadlineAt, requireActiveAnalysis: buildResult.reused })
  assertArtifactAndScan({ profile: toolProfile, imageReadback, scanEvidence, imageDigest })

  // Official merged-source evidence belongs to the parent rotation receipt's separate sourceProof.
  const proofCore = {
    schemaVersion: 'orgmaster.tool-image-build.v1',
    ownerApplicationId: 'orgmaster',
    releaseId,
    sourceRevision,
    sourceSha256,
    artifactDigest: imageDigest,
    status: 'PASS',
    sourceObject: {
      ...sourceObject.ref,
      generation: sourceObject.metadata.generation,
      crc32c: sourceObject.metadata.crc32c,
    },
    cloudBuild: structuredClone(validated.cloudBuild),
    buildInputSha256: validated.inputHash,
    artifactRegistry: structuredClone(imageReadback),
    scan: structuredClone(scanEvidence),
    buildDisposition: buildResult.disposition,
    reused: buildResult.reused,
  }
  const buildProof = { ...proofCore, receiptSha256: sha256(canonicalize(proofCore)) }
  return { imageDigest, buildProof, sourceObject }
}
