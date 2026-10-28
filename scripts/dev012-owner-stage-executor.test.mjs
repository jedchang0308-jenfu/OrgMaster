import assert from 'node:assert/strict'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'
import { buildRuntimeConfig, canonicalize, sha256 } from './lib/dev012-owner-release-runtime.mjs'
import { assertMigrationReceipt, assertStaleControlSafeToSupersede, candidateTagUriMatches, executeOwnerStage } from './lib/dev012-owner-stage-executor.mjs'
import { DEV058_MIGRATION_ENTRIES, DEV058_MIGRATION_ENTRY_COUNT, DEV058_RELEASE_MODE, DEV058_ROLE_POLICY_REMEDIATION } from './lib/dev058-role-policy-migration.mjs'
import { DEV059_FMS_AUTHORITY_REMEDIATION, DEV059_MIGRATION_ENTRY_COUNT, DEV059_RELEASE_MODE } from './lib/dev059-fms-authority-migration.mjs'
import { DEV057_PROJED_MIGRATION_ENTRY_COUNT, DEV057_PROJED_RELEASE_MODE, DEV057_PROJED_REMEDIATION } from './lib/dev057-projed-principal-migration.mjs'

const H40 = 'a'.repeat(40)
const baselineRef = { uri: 'gs://jenfu-platform-prod-platform-release/receipts/baseline.json', sha256: 'e'.repeat(64) }
const verifiedBaseline = async ({ intent }) => ({ baselineIntentRef: intent.baselineIntentRef, baselineMigrationRef: { uri: baselineRef.uri, sha256: baselineRef.sha256 }, migrationDisposition: 'UNCHANGED_VERIFIED' })
const bucket = 'jenfu-platform-prod-platform-release'
const previousRevision = 'jenfu-platform-prod-previous'
const candidateRevision = 'jenfu-platform-prod-candidate'
const candidateTag = 'candidate-0123456789ab'
const canonicalOrigin = 'https://jenfu-platform-prod-9536592944.asia-east1.run.app'
const candidateOrigin = `https://${candidateTag}---jenfu-platform-prod-9536592944.asia-east1.run.app`
const migrationRunnerDigest = 'asia-east1-docker.pkg.dev/jenfu-platform-prod/platform-release/platform-migration-runner@sha256:' + 'c'.repeat(64)

test('DEV-057 principal contract requires exact 26-row forward migration receipt', () => {
  const profile = { application: { id: 'orgmaster' } }
  const intent = { sourceRevision: H40, migrationManifestSha256: 'b'.repeat(64) }
  const plan = { releaseMode: 'DEV057_PRINCIPAL_CONTRACT_REMEDIATION' }
  const core = {
    schemaVersion: 'jenfu.dev012.migration-receipt.v1', ownerApplicationId: 'orgmaster', sourceRevision: H40,
    manifestSha256: intent.migrationManifestSha256, status: 'PASS', boundaryStatus: 'PASS',
    baselineCount: 10, minimumLedgerCount: 10, ledgerCount: 26, applied: 5, replayed: 21,
    crossDatabaseDenials: [{ database: 'jenfu_dev', denied: true }, { database: 'jenfu_stg', denied: true }],
  }
  const receipt = (value) => ({ ...value, receiptSha256: sha256(canonicalize(value)) })
  assert.doesNotThrow(() => assertMigrationReceipt(receipt(core), profile, intent, { allowForward: true, forwardPlan: plan }))
  for (const changed of [{ ledgerCount: 25 }, { applied: 6, replayed: 20 }, { replayed: 20 }, { sourceRevision: 'c'.repeat(40) }]) {
    assert.throws(() => assertMigrationReceipt(receipt({ ...core, ...changed }), profile, intent, { allowForward: true, forwardPlan: plan }), /MIGRATION_RECEIPT_INVALID/u)
  }
})

test('DEV-057 principal-only grant v3 requires exact 28-row forward migration receipt', () => {
  const profile = { application: { id: 'orgmaster' } }
  const intent = { sourceRevision: H40, migrationManifestSha256: 'b'.repeat(64) }
  const plan = { releaseMode: 'DEV057_PRINCIPAL_GRANTS_V3_REMEDIATION' }
  const core = {
    schemaVersion: 'jenfu.dev012.migration-receipt.v1', ownerApplicationId: 'orgmaster', sourceRevision: H40,
    manifestSha256: intent.migrationManifestSha256, status: 'PASS', boundaryStatus: 'PASS',
    baselineCount: 10, minimumLedgerCount: 10, ledgerCount: 28, applied: 1, replayed: 27,
    crossDatabaseDenials: [{ database: 'jenfu_dev', denied: true }, { database: 'jenfu_stg', denied: true }],
  }
  const receipt = (value) => ({ ...value, receiptSha256: sha256(canonicalize(value)) })
  assert.doesNotThrow(() => assertMigrationReceipt(receipt(core), profile, intent, { allowForward: true, forwardPlan: plan }))
  for (const changed of [{ ledgerCount: 27 }, { applied: 2, replayed: 26 }, { replayed: 26 }]) {
    assert.throws(() => assertMigrationReceipt(receipt({ ...core, ...changed }), profile, intent, { allowForward: true, forwardPlan: plan }), /MIGRATION_RECEIPT_INVALID/u)
  }
})

function recordedHarness(ownerApplicationId = 'platform') {
  const objects = new Map()
  let generation = 0
  let service = {
    name: 'projects/jenfu-platform-prod/locations/asia-east1/services/jenfu-platform-prod', etag: 'e1', reconciling: false,
    generation: '1', observedGeneration: '1', terminalCondition: { state: 'CONDITION_SUCCEEDED' },
    ingress: 'INGRESS_TRAFFIC_INTERNAL_ONLY', defaultUriDisabled: true, invokerIamDisabled: false, uri: null, urls: [],
    template: { serviceAccount: 'platform-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com', containers: [{ image: 'old@sha256:' + '0'.repeat(64) }] },
    traffic: [{ type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: previousRevision, percent: 100 }],
    trafficStatuses: [{ type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: previousRevision, percent: 100 }],
  }
  const encode = (value) => Buffer.from(`${canonicalize(value)}\n`)
  const readBytes = async (uri, { expectedSha256 = null } = {}) => {
    const row = objects.get(uri)
    if (!row) { const error = new Error('MISSING'); error.code = 'MISSING'; throw error }
    if (expectedSha256 && expectedSha256 !== sha256(row.bytes)) throw new Error('HASH')
    return { bytes: row.bytes, metadata: { generation: String(row.generation), crc32c: row.crc32c }, ref: { uri, sha256: sha256(row.bytes) } }
  }
  const putBytes = async (uri, bytes, options = {}) => {
    const existing = objects.get(uri)
    const expected = String(options.ifGenerationMatch ?? '0')
    if (existing && expected === '0') {
      if (!existing.bytes.equals(bytes)) throw new Error('IMMUTABILITY')
      return { ...(await readBytes(uri)), reused: true }
    }
    if (existing && expected !== String(existing.generation)) throw new Error('CAS')
    const row = { bytes: Buffer.from(bytes), generation: ++generation, crc32c: 'recorded-crc32c' }
    objects.set(uri, row)
    return { ...(await readBytes(uri)), reused: false }
  }
  const putJson = (uri, value, options) => putBytes(uri, encode(value), options)
  const readJson = async (ref) => ({ ...(await readBytes(ref.uri, { expectedSha256: ref.sha256 })), value: JSON.parse((await readBytes(ref.uri)).bytes.toString()) })
  const effectiveRevision = (value) => value.trafficStatuses.find((row) => !row.tag && Number(row.percent) === 100).revision
  const entrypointSnapshot = (value) => ({ ingress: value.ingress, defaultUriDisabled: value.defaultUriDisabled, invokerIamDisabled: value.invokerIamDisabled, uri: value.uri, urls: [...value.urls], serviceEtag: value.etag, generation: String(value.generation) })
  const transport = {
    now: () => '2026-09-08T00:00:00.000Z', readBytes, putBytes, putJson, readJson, effectiveRevision,
    assertServiceSettled(value, code = 'RUN_SERVICE_NOT_SETTLED') { if (value.reconciling !== false || value.terminalCondition?.state !== 'CONDITION_SUCCEEDED' || String(value.generation) !== String(value.observedGeneration)) throw new Error(code); return value },
    entrypointSnapshot,
    assertCanonicalEntrypoint(_profile, value) { if (value.uri !== canonicalOrigin || !value.urls.includes(canonicalOrigin) || value.ingress !== 'INGRESS_TRAFFIC_ALL' || value.defaultUriDisabled === true || value.invokerIamDisabled !== true) throw new Error('ENTRYPOINT_READBACK_MISMATCH'); return value },
    assertRevisionReady(_profile, value, artifactDigest) { if (value.conditions?.find((row) => row.type === 'Ready')?.state !== 'CONDITION_SUCCEEDED' || value.containers?.[0]?.image !== artifactDigest) throw new Error('CANDIDATE_REVISION_READBACK_MISMATCH'); return value },
    async getService() { return structuredClone(service) },
    async createBuild({ profile, intent, sourceObject }) {
      const artifactDigest = `${profile.artifact.uri}@sha256:${'d'.repeat(64)}`
      return { artifactDigest, build: { name: 'projects/p/locations/r/builds/b1', id: 'b1', projectId: profile.target.projectId, status: 'SUCCESS', serviceAccount: `projects/${profile.target.projectId}/serviceAccounts/${profile.identities.builder}`, sourceProvenance: { resolvedStorageSource: { bucket, object: sourceObject.ref.uri.split('/').slice(3).join('/'), generation: sourceObject.metadata.generation } }, results: { images: [{ name: `${profile.artifact.uri}:release-${intent.sourceRevision}`, digest: 'sha256:' + 'd'.repeat(64) }] }, options: { requestedVerifyOption: 'VERIFIED' } } }
    },
    async readArtifactImage(_profile, artifactDigest) { return { name: 'projects/p/dockerImages/i@sha256:x', uri: artifactDigest } },
    async waitArtifactEvidence({ artifactDigest }) { return { resourceUrl: `https://${artifactDigest}`, buildOccurrenceNames: ['build'], discoveryOccurrenceNames: ['discovery'], sbomOccurrenceNames: ['sbom'], vulnerabilityCount: 0, blockingVulnerabilityCount: 0, sbomExport: { resourceUrl: `https://${artifactDigest}`, discoveryOccurrence: 'discovery' }, observedAt: this.now(), status: 'PASS' } },
    async runMigrationJob() { assert.fail('application releases must never run a migration job') },
    async createCandidate({ artifactDigest }) {
      service = { ...service, etag: 'e2', generation: '2', observedGeneration: '2', latestCreatedRevision: candidateRevision, traffic: [...service.traffic, { revision: candidateRevision, tag: candidateTag }], trafficStatuses: [...service.trafficStatuses, { revision: candidateRevision, tag: candidateTag, uri: candidateOrigin }] }
      return { candidateRevision, tag: candidateTag, tagUri: candidateOrigin, artifactDigest, previousRevision, beforeTraffic: service.traffic.slice(0, 1), etag: 'e2', revisionName: `projects/p/revisions/${candidateRevision}` }
    },
    async getRevision(_profile, revision) { return { name: `projects/p/services/s/revisions/${revision}`, service: 'projects/p/services/s', containers: [{ image: `${profile.artifact.uri}@sha256:${'d'.repeat(64)}` }], conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }] } },
    async runAuthenticatedSmoke({ origin }) { return { origin, observations: [{ id: 'session-reload', status: 200 }], status: 'PASS', observedAt: this.now() } },
    async runInternalCandidateSmoke({ origin }) { return { origin, observations: [{ id: 'internal-candidate', status: 200 }], status: 'PASS', observedAt: this.now() } },
    async configureEntrypoint({ candidate }) {
      const before = entrypointSnapshot(service)
      assert.equal(candidate.tagUri, candidateOrigin)
      const templateHash = sha256(canonicalize(service.template)); const trafficHash = sha256(canonicalize(service.traffic))
      service = { ...service, etag: 'e-entry', generation: '3', observedGeneration: '3', ingress: 'INGRESS_TRAFFIC_ALL', defaultUriDisabled: false, invokerIamDisabled: true, uri: canonicalOrigin, urls: [canonicalOrigin] }
      return { before, after: entrypointSnapshot(service), changed: true, updateMask: 'ingress,defaultUriDisabled,invokerIamDisabled', templateSha256Before: templateHash, templateSha256After: templateHash, trafficSha256Before: trafficHash, trafficSha256After: trafficHash, providerOperationRef: { name: 'operations/entrypoint' } }
    },
    async restoreEntrypoint({ baseline }) {
      const before = entrypointSnapshot(service)
      const changed = before.ingress !== baseline.ingress || before.defaultUriDisabled !== baseline.defaultUriDisabled || before.invokerIamDisabled !== baseline.invokerIamDisabled
      if (changed) service = { ...service, etag: 'e-restore', generation: '6', observedGeneration: '6', ingress: baseline.ingress, defaultUriDisabled: baseline.defaultUriDisabled, invokerIamDisabled: baseline.invokerIamDisabled, uri: baseline.uri, urls: baseline.urls }
      return { changed, before, after: entrypointSnapshot(service), providerOperationRef: changed ? { name: 'operations/restore' } : null }
    },
    async setTraffic({ revision, candidateTag: releaseTag }) {
      service = { ...service, etag: 'e3', generation: '4', observedGeneration: '4', traffic: [{ revision, percent: 100 }, ...(releaseTag ? [{ revision, tag: releaseTag }] : [])], trafficStatuses: [{ revision, percent: 100 }, ...(releaseTag ? [{ revision, tag: releaseTag, uri: candidateOrigin }] : [])] }
      if (service.defaultUriDisabled === false) delete service.defaultUriDisabled
      return structuredClone(service)
    },
    async removeCandidateTag({ candidateRevision: exact, expectedActiveRevision }) { assert.equal(exact, candidateRevision); const tagged = service.traffic.find((row) => row.tag); if (tagged && tagged.revision !== exact) throw new Error('CANDIDATE_TAG_OWNER_MISMATCH'); assert.equal(effectiveRevision(service), expectedActiveRevision); service = { ...service, etag: 'e4', generation: '5', observedGeneration: '5', traffic: service.traffic.filter((row) => !row.tag), trafficStatuses: service.trafficStatuses.filter((row) => !row.tag) }; return structuredClone(service) },
    async publishIncident() { return { messageIds: ['1'] } },
  }
  const profile = {
    application: { id: ownerApplicationId, repository: 'owner/repo', branch: 'main' },
    profileVersion: 'CONTINUOUS_NO_DWELL_V3_DIRECT_RUN_APP', contractSha256: 'f'.repeat(64),
    target: { projectId: 'jenfu-platform-prod', projectNumber: '9536592944', region: 'asia-east1', serviceName: 'jenfu-platform-prod', runtimeServiceAccount: 'platform-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com', canonicalOrigin, entryPolicy: { ingress: 'INGRESS_TRAFFIC_ALL', defaultUriDisabled: false, invokerIamDisabled: true } },
    runtime: { containerName: 'platform', cloudSqlProxyContainer: 'cloud-sql-proxy', cloudSqlProxyImage: `proxy@sha256:${'f'.repeat(64)}`, cloudSqlProxyPort: 5432, cloudSqlProxyMaximumConnections: 24, cloudSqlConnectionName: 'p:r:i', network: 'runtime-vpc', subnet: 'runtime-subnet', port: 8080, startupProbePath: '/ready', cpu: '1', memory: '512Mi', concurrency: 20, timeoutSeconds: 60, maxInstances: 1, poolMax: 4 },
    schemas: { releaseIntent: 'owner.intent.v2', deploymentCapsule: 'owner.deployment.v2' },
    artifact: { releaseBucket: bucket, repository: 'platform-release', uri: 'asia-east1-docker.pkg.dev/jenfu-platform-prod/platform-release/platform', migrationRunnerUri: 'asia-east1-docker.pkg.dev/jenfu-platform-prod/platform-release/platform-migration-runner', migrationBundlePrefix: 'source/migration-bundles' },
    identities: { builder: 'platform-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com' }, build: { maximumAllowedSeverity: 'MEDIUM' }, workflow: { path: '.github/workflows/deploy.yml' }, environment: { requiredPlainEnvironmentNames: ['NODE_ENV'], requiredSecretNames: ['SESSION_SECRET'], allowedSecretIds: { SESSION_SECRET: 'platform-prod-session-pepper' }, candidateOriginEnvironmentName: 'PORTAL_RELEASE_CANDIDATE_ORIGIN' }, sideEffects: { notification: 'DISABLED' },
  }
  const sourceIdentityBytes = Buffer.from('recorded-source-tree-manifest')
  const sourceArchiveBytes = Buffer.from('recorded-source-archive')
  const migrationBytes = Buffer.from('{"recorded":"migration"}\n')
  const migrationManifestSha256 = sha256('migration-manifest')
  const environment = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: profile.application.repository, GITHUB_REPOSITORY_ID: '1234', GITHUB_REPOSITORY_OWNER_ID: '5678', GITHUB_SHA: H40, GITHUB_WORKFLOW_SHA: H40, GITHUB_WORKFLOW_REF: 'owner/repo/.github/workflows/deploy.yml@refs/heads/main', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token.actions.example', GOOGLE_OAUTH_ACCESS_TOKEN: 'x'.repeat(32), GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1' }
  return { objects, transport, profile, sourceIdentityBytes, sourceArchiveBytes, migrationBytes, migrationManifestSha256, environment, service: () => service }
}
async function authorizedRecordedInput(h, releaseId) {
  const refFor = async (name, value) => (await h.transport.putJson(`gs://${bucket}/receipts/prerequisites/${releaseId}-${name}.json`, value, { bucket, prefix: 'receipts' })).ref
  const common = { releaseAuthority: true, evidenceScope: 'PROVIDER' }
  const sourceLockRef = await refFor('source-lock', { ...common, status: 'SOURCE_FROZEN', sourceRevision: H40, clean: true })
  const authorizationPolicyRef = await refFor('authorization', { ...common, status: 'PASS', environment: 'production', remainingHumanAction: 0, expiresAt: '2999-01-01T00:00:00.000Z' })
  const readinessReceiptRef = await refFor('readiness', { ...common, status: 'PASS', environment: 'production', remainingHumanAction: 0, expiresAt: '2999-01-01T00:00:00.000Z', projectId: 'jenfu-platform-prod' })
  const foundationReceiptRef = await refFor('foundation', { ...common, status: 'APPLIED', projectId: 'jenfu-platform-prod' })
  const infraReceiptRef = await refFor('infra', { ...common, status: 'APPLIED', projectId: 'jenfu-platform-prod', migrationRunnerDigest })
  const runtimeConfigRef = await refFor('runtime', { ...common, status: 'VERIFIED', projectId: 'jenfu-platform-prod', ...buildRuntimeConfig(h.profile, { plainEnvironment: { NODE_ENV: 'production' }, secretVersions: { SESSION_SECRET: '1' } }) })
  const intent = { baselineIntentRef: baselineRef, schemaVersion: 'owner.intent.v2', ownerApplicationId: h.profile.application.id, releaseId, sourceRevision: H40, sourceSha256: sha256(h.sourceIdentityBytes), sourceLockRef, authorizationPolicyRef, readinessReceiptRef, foundationReceiptRef, infraReceiptRef, runtimeConfigRef, migrationManifestSha256: h.migrationManifestSha256, previousRevision, deadlineAt: '2999-01-01T00:00:00.000Z' }
  const intentResult = await h.transport.putJson(`gs://${bucket}/receipts/intents/${releaseId}.json`, intent, { bucket, prefix: 'receipts' })
  return {
    intentResult,
    input: { capsuleRef: intentResult.ref.uri, capsuleSha256: intentResult.ref.sha256, profile: h.profile, transport: h.transport, environment: h.environment, verifyRoutineRelease: verifiedBaseline, validateIntent: (value) => value, createSourceIdentity: async () => h.sourceIdentityBytes, createSourceArchive: async () => h.sourceArchiveBytes, buildMigrationBundle: async () => ({ bundle: { manifestSha256: h.migrationManifestSha256 }, bytes: h.migrationBytes, bundleSha256: sha256(h.migrationBytes) }) },
  }
}

test('application-only release preserves all ten stages without importing data or executing a migration job', async () => {
  const h = recordedHarness()
  const { input, intentResult } = await authorizedRecordedInput(h, 'ROUTINE-ALL-STAGES')
  const intent = JSON.parse((await h.transport.readBytes(intentResult.ref.uri)).bytes)
  intent.baselineIntentRef = { uri: `gs://${bucket}/receipts/baseline.json`, sha256: 'e'.repeat(64) }
  const next = await h.transport.putJson(`gs://${bucket}/receipts/routine-intent.json`, intent)
  input.capsuleRef = next.ref.uri; input.capsuleSha256 = next.ref.sha256
  // The baseline verifier is independently covered with hash/source/provider negatives.
  input.verifyRoutineRelease = async () => ({ baselineIntentRef: intent.baselineIntentRef, baselineMigrationRef: { uri: `gs://${bucket}/receipts/baseline-migrate.json`, sha256: 'e'.repeat(64) }, migrationDisposition: 'UNCHANGED_VERIFIED' })
  h.transport.runMigrationJob = async () => assert.fail('routine releases must not run migration/import/bootstrap jobs')
  let terminal
  for (const stage of ['prepare', 'build', 'migrate', 'candidate', 'entrypoint', 'verify', 'decision', 'activate', 'canonical', 'finalize']) terminal = await executeOwnerStage({ ...input, stage })
  const result = JSON.parse((await h.transport.readBytes(terminal.ref.uri)).bytes)
  assert.equal(result.facts.databaseDisposition, 'UNCHANGED_VERIFIED')
  assert.equal(result.facts.result, 'RELEASED')
  assert.equal(h.service().traffic.length, 1)
})

test('release-executor-only continuation reuses the provider build and never submits a new image build', async () => {
  const h = recordedHarness()
  const { input, intentResult } = await authorizedRecordedInput(h, 'ROUTINE-APP-ARTIFACT-REUSE')
  const intent = (await h.transport.readJson(intentResult.ref)).value
  const artifactSourceRevision = 'b'.repeat(40)
  const artifactSourceObject = { uri: `gs://${bucket}/source/archives/${'b'.repeat(64)}/source.tar.gz`, sha256: 'b'.repeat(64), generation: '7', crc32c: 'old-crc32c' }
  const association = { schemaVersion: 'orgmaster.release-executor-only-app-artifact-reuse.v1',
    releaseSourceRevision: intent.sourceRevision, artifactSourceRevision,
    artifactDigest: `${h.profile.artifact.uri}@sha256:${'d'.repeat(64)}` }
  input.verifyRoutineRelease = async () => ({ baselineIntentRef: intent.baselineIntentRef,
    baselineMigrationRef: { uri: `gs://${bucket}/receipts/baseline-migrate.json`, sha256: 'e'.repeat(64) },
    migrationDisposition: 'UNCHANGED_VERIFIED', appArtifactReuse: association })
  h.transport.createBuild = async () => assert.fail('cross-source continuation must not submit or select a current-source build')
  let observedEvidenceSource = null
  const originalEvidence = h.transport.waitArtifactEvidence
  h.transport.waitArtifactEvidence = async inputValue => { observedEvidenceSource = inputValue.sourceRevision; return originalEvidence.call(h.transport, inputValue) }
  input.reuseAppArtifact = async ({ association: actual }) => {
    assert.deepEqual(actual, association)
    return { artifactDigest: association.artifactDigest, buildInputSha256: 'c'.repeat(64), sourceArchiveSha256: artifactSourceObject.sha256,
      reused: true, disposition: 'REUSED_CROSS_SOURCE_RELEASE_EXECUTOR_ONLY', artifactSourceRevision, artifactSourceObject,
      association, build: { name: 'projects/p/locations/r/builds/b-old', id: 'b-old', projectId: h.profile.target.projectId,
        status: 'SUCCESS', serviceAccount: `projects/${h.profile.target.projectId}/serviceAccounts/${h.profile.identities.builder}`,
        sourceProvenance: { resolvedStorageSource: { bucket, object: artifactSourceObject.uri.split('/').slice(3).join('/'), generation: artifactSourceObject.generation } },
        results: { images: [{ name: `${h.profile.artifact.uri}:release-${artifactSourceRevision}`, digest: 'sha256:' + 'd'.repeat(64) }] },
        options: { requestedVerifyOption: 'VERIFIED' } } }
  }
  await executeOwnerStage({ ...input, stage: 'prepare' })
  const deploymentRef = await executeOwnerStage({ ...input, stage: 'build' })
  const deployment = (await h.transport.readJson(deploymentRef.ref)).value
  assert.equal(deployment.artifactSourceRevision, artifactSourceRevision)
  assert.deepEqual(deployment.artifactSourceObject, artifactSourceObject)
  assert.deepEqual(deployment.appArtifactReuse, association)
  assert.equal(observedEvidenceSource, artifactSourceRevision)
})

test('native rotation prepare seals the summary and migrate requires exact live Job readback before any candidate', async () => {
  async function preparedRotationCase(releaseId) {
    const h = recordedHarness()
    const { input, intentResult } = await authorizedRecordedInput(h, releaseId)
    const intent = (await h.transport.readJson(intentResult.ref)).value
    const priorInfra = (await h.transport.readJson(intent.infraReceiptRef)).value
    const migrationRunnerDigest = priorInfra.migrationRunnerDigest
    const infra = {
      ...priorInfra,
      mutationProfile: 'APP_INFRA_IMAGE_ROTATION',
      toolRotation: { schemaVersion: 'orgmaster.ordinary-tool-image-rotation.v1' },
    }
    const infraResult = await h.transport.putJson(
      `gs://${bucket}/receipts/prerequisites/${releaseId}-tool-rotation-infra.json`, infra, { bucket, prefix: 'receipts' })
    const revisedIntent = { ...intent, infraReceiptRef: infraResult.ref }
    const capsule = await h.transport.putJson(
      `gs://${bucket}/receipts/intents/${releaseId}-tool-rotation.json`, revisedIntent, { bucket, prefix: 'receipts' })
    input.capsuleRef = capsule.ref.uri
    input.capsuleSha256 = capsule.ref.sha256
    input.verifyRoutineRelease = async ({ intent: currentIntent }) => ({
      ...(await verifiedBaseline({ intent: currentIntent })),
      toolImageRotation: {
        evidenceScope: 'OWNER_SEALED_TOOL_IMAGE_ROTATION',
        sourceRevision: currentIntent.sourceRevision,
        migrationRunnerDigest,
      },
    })
    await executeOwnerStage({ ...input, stage: 'prepare' })
    await executeOwnerStage({ ...input, stage: 'build' })
    return { h, input, infra, migrationRunnerDigest }
  }

  async function denyCandidateAfterMigrationGate(context, verifyToolJobReadback, expectedError) {
    let migrationJobs = 0
    let candidateCreates = 0
    const createCandidate = context.h.transport.createCandidate
    context.h.transport.runMigrationJob = async () => { migrationJobs += 1 }
    context.h.transport.createCandidate = async (...args) => {
      candidateCreates += 1
      return createCandidate(...args)
    }
    await assert.rejects(() => executeOwnerStage({
      ...context.input,
      stage: 'migrate',
      ...(verifyToolJobReadback ? { verifyToolJobReadback } : {}),
    }), error => error?.code === expectedError)
    assert.equal(migrationJobs, 0)
    assert.equal([...context.h.objects.keys()].some(uri => uri.endsWith('/migrate.json')), false)
    await assert.rejects(() => executeOwnerStage({ ...context.input, stage: 'candidate' }), error => error?.code === 'MISSING')
    assert.equal(candidateCreates, 0)
  }

  const accepted = await preparedRotationCase('TOOL-ROTATION-LIVE-READBACK')
  let liveReadbacks = 0
  let migrationJobs = 0
  accepted.h.transport.runMigrationJob = async () => { migrationJobs += 1 }
  const migration = await executeOwnerStage({
    ...accepted.input,
    stage: 'migrate',
    verifyToolJobReadback: async infra => {
      liveReadbacks += 1
      assert.equal(infra.mutationProfile, 'APP_INFRA_IMAGE_ROTATION')
      assert.equal(infra.migrationRunnerDigest, accepted.migrationRunnerDigest)
      return { migrationRunnerDigest: accepted.migrationRunnerDigest, generation: '12' }
    },
  })
  assert.equal(liveReadbacks, 1)
  assert.equal(migrationJobs, 0)
  assert.equal(migration.value.facts.toolImageLiveReadback.generation, '12')
  assert.equal(migration.value.facts.disposition, 'UNCHANGED_VERIFIED')

  const missing = await preparedRotationCase('TOOL-ROTATION-MISSING-LIVE-READBACK')
  await denyCandidateAfterMigrationGate(missing, null, 'TOOL_JOB_READBACK_REQUIRED')

  const drifted = await preparedRotationCase('TOOL-ROTATION-DRIFTED-LIVE-READBACK')
  let driftChecks = 0
  await denyCandidateAfterMigrationGate(drifted, async () => {
    driftChecks += 1
    throw Object.assign(new Error('TOOL_ROTATION_LIVE_JOB_DRIFT'), { code: 'TOOL_ROTATION_LIVE_JOB_DRIFT' })
  }, 'TOOL_ROTATION_LIVE_JOB_DRIFT')
  assert.equal(driftChecks, 1)
})

test('DEV-058 controlled append may consume the rotated runner only after exact live Job digest readback', async () => {
  async function preparedControlledRotationCase(releaseId) {
    const h = recordedHarness()
    const { input, intentResult } = await authorizedRecordedInput(h, releaseId)
    const intent = (await h.transport.readJson(intentResult.ref)).value
    const priorInfra = (await h.transport.readJson(intent.infraReceiptRef)).value
    const rotatedInfra = {
      ...priorInfra,
      mutationProfile: 'APP_INFRA_IMAGE_ROTATION',
      toolRotation: { schemaVersion: 'orgmaster.ordinary-tool-image-rotation.v1' },
    }
    const common = {
      releaseAuthority: true,
      evidenceScope: 'PROVIDER',
      status: 'PASS',
      environment: 'production',
      projectId: 'jenfu-platform-prod',
      remainingHumanAction: 0,
      expiresAt: '2999-01-01T00:00:00.000Z',
      ownerApplicationId: intent.ownerApplicationId,
      sourceRevision: intent.sourceRevision,
      releaseId: intent.releaseId,
      baselineIntentRef: intent.baselineIntentRef,
      devId: 'DEV-058',
      slice: '058-ROLE-POLICY',
      remediation: DEV058_ROLE_POLICY_REMEDIATION,
    }
    const authorization = await h.transport.putJson(
      `gs://${bucket}/receipts/prerequisites/${releaseId}-dev058-authorization.json`,
      { ...common, schemaVersion: 'orgmaster.routine-release-authorization.v1', authorizationBasis: 'OPERATOR_INVOKED_DEPLOY_PRODUCTION' },
      { bucket, prefix: 'receipts' })
    const readiness = await h.transport.putJson(
      `gs://${bucket}/receipts/prerequisites/${releaseId}-dev058-readiness.json`,
      { ...common, schemaVersion: 'orgmaster.routine-release-readiness.v1' },
      { bucket, prefix: 'receipts' })
    const infra = await h.transport.putJson(
      `gs://${bucket}/receipts/prerequisites/${releaseId}-dev058-infra.json`, rotatedInfra,
      { bucket, prefix: 'receipts' })
    const revisedIntent = { ...intent, authorizationPolicyRef: authorization.ref, readinessReceiptRef: readiness.ref, infraReceiptRef: infra.ref }
    const capsule = await h.transport.putJson(
      `gs://${bucket}/receipts/intents/${releaseId}-dev058-rotation.json`, revisedIntent,
      { bucket, prefix: 'receipts' })
    input.capsuleRef = capsule.ref.uri
    input.capsuleSha256 = capsule.ref.sha256
    input.verifyRoutineRelease = async ({ intent: currentIntent }) => ({
      baselineIntentRef: currentIntent.baselineIntentRef,
      baselineMigrationRef: { uri: `gs://${bucket}/receipts/baseline-migrate.json`, sha256: 'e'.repeat(64) },
      migrationDisposition: 'FORWARD_APPLY',
      pendingMigrationCount: DEV058_MIGRATION_ENTRIES.length,
      releaseMode: DEV058_RELEASE_MODE,
      controlledTransition: { releaseMode: DEV058_RELEASE_MODE },
      toolImageRotation: {
        evidenceScope: 'OWNER_SEALED_TOOL_IMAGE_ROTATION',
        sourceRevision: currentIntent.sourceRevision,
        migrationRunnerDigest: rotatedInfra.migrationRunnerDigest,
      },
    })
    await executeOwnerStage({ ...input, stage: 'prepare' })
    await executeOwnerStage({ ...input, stage: 'build' })
    return { h, input, infra: rotatedInfra }
  }

  const accepted = await preparedControlledRotationCase('DEV058-ROTATION-READBACK')
  let jobs = 0
  accepted.h.transport.runMigrationJob = async ({ deployment, outputUri }) => {
    jobs += 1
    const core = {
      schemaVersion: 'jenfu.dev012.migration-receipt.v1', ownerApplicationId: accepted.h.profile.application.id,
      sourceRevision: deployment.sourceRevision, database: 'jenfu_prod', ledger: 'orgmaster_core.schema_migrations',
      manifestSha256: accepted.h.migrationManifestSha256, baselineCount: 10, minimumLedgerCount: 10,
      ledgerCount: DEV058_MIGRATION_ENTRY_COUNT, applied: DEV058_MIGRATION_ENTRIES.length,
      replayed: DEV058_MIGRATION_ENTRY_COUNT - DEV058_MIGRATION_ENTRIES.length,
      crossDatabaseDenials: [{ database: 'jenfu_dev', denied: true }, { database: 'jenfu_stg', denied: true }],
      boundaryStatus: 'PASS', status: 'PASS',
    }
    await accepted.h.transport.putJson(outputUri, { ...core, receiptSha256: sha256(canonicalize(core)) }, { bucket, prefix: 'receipts' })
  }
  let readbacks = 0
  const migration = await executeOwnerStage({
    ...accepted.input,
    stage: 'migrate',
    verifyToolJobReadback: async infra => {
      readbacks += 1
      assert.equal(infra.migrationRunnerDigest, accepted.infra.migrationRunnerDigest)
      return { migrationRunnerDigest: accepted.infra.migrationRunnerDigest, generation: '12' }
    },
  })
  assert.equal(readbacks, 1)
  assert.equal(jobs, 1)
  assert.equal(migration.value.schemaVersion, 'jenfu.dev012.migration-receipt.v1')
  assert.equal(migration.value.ledgerCount, DEV058_MIGRATION_ENTRY_COUNT)
  assert.equal(migration.value.applied, DEV058_MIGRATION_ENTRIES.length)

  const mismatched = await preparedControlledRotationCase('DEV058-ROTATION-BAD-READBACK')
  mismatched.h.transport.runMigrationJob = async () => assert.fail('digest mismatch must stop before the migration Job')
  await assert.rejects(() => executeOwnerStage({
    ...mismatched.input,
    stage: 'migrate',
    verifyToolJobReadback: async () => ({ migrationRunnerDigest: 'wrong-digest' }),
  }), error => error?.code === 'TOOL_JOB_READBACK_REQUIRED')
  assert.equal([...mismatched.h.objects.keys()].some(uri => uri.endsWith('/migrate.json')), false)

  const ordinaryForward = recordedHarness()
  const ordinaryInput = await authorizedRecordedInput(ordinaryForward, 'ORDINARY-FORWARD-ROTATION')
  const ordinaryIntent = (await ordinaryForward.transport.readJson(ordinaryInput.intentResult.ref)).value
  const ordinaryInfra = (await ordinaryForward.transport.readJson(ordinaryIntent.infraReceiptRef)).value
  const ordinaryInfraResult = await ordinaryForward.transport.putJson(
    `gs://${bucket}/receipts/prerequisites/ORDINARY-FORWARD-ROTATION-rotated-infra.json`,
    { ...ordinaryInfra, mutationProfile: 'APP_INFRA_IMAGE_ROTATION', toolRotation: { schemaVersion: 'orgmaster.ordinary-tool-image-rotation.v1' } },
    { bucket, prefix: 'receipts' })
  const ordinaryCapsule = await ordinaryForward.transport.putJson(
    `gs://${bucket}/receipts/intents/ORDINARY-FORWARD-ROTATION-rotated.json`,
    { ...ordinaryIntent, infraReceiptRef: ordinaryInfraResult.ref }, { bucket, prefix: 'receipts' })
  ordinaryInput.input.capsuleRef = ordinaryCapsule.ref.uri
  ordinaryInput.input.capsuleSha256 = ordinaryCapsule.ref.sha256
  ordinaryInput.input.verifyRoutineRelease = async ({ intent: currentIntent }) => ({
    baselineIntentRef: currentIntent.baselineIntentRef,
    baselineMigrationRef: { uri: `gs://${bucket}/receipts/baseline-migrate.json`, sha256: 'e'.repeat(64) },
    migrationDisposition: 'FORWARD_APPLY', pendingMigrationCount: 4,
  })
  await executeOwnerStage({ ...ordinaryInput.input, stage: 'prepare' })
  await executeOwnerStage({ ...ordinaryInput.input, stage: 'build' })
  let ordinaryReadback = 0
  ordinaryForward.transport.runMigrationJob = async () => assert.fail('ordinary forward rotation must stop before the migration Job')
  await assert.rejects(() => executeOwnerStage({
    ...ordinaryInput.input,
    stage: 'migrate',
    verifyToolJobReadback: async () => { ordinaryReadback += 1; return { migrationRunnerDigest: ordinaryInfra.migrationRunnerDigest } },
  }), error => error?.code === 'TOOL_JOB_READBACK_REQUIRED')
  assert.equal(ordinaryReadback, 0)
  assert.equal([...ordinaryForward.objects.keys()].some(uri => uri.endsWith('/migrate.json')), false)
})

test('controlled forward migration completes before candidate and is preserved in terminal disposition', async () => {
  const h = recordedHarness()
  const { input } = await authorizedRecordedInput(h, 'CONTROLLED-FORWARD-MIGRATION')
  input.verifyRoutineRelease = async ({ intent }) => ({ baselineIntentRef: intent.baselineIntentRef, baselineMigrationRef: { uri: baselineRef.uri, sha256: baselineRef.sha256 }, migrationDisposition: 'FORWARD_APPLY', pendingMigrationCount: 4 })
  let executions = 0
  h.transport.runMigrationJob = async ({ deployment, outputUri }) => {
    executions += 1
    const core = { schemaVersion: 'jenfu.dev012.migration-receipt.v1', ownerApplicationId: h.profile.application.id, sourceRevision: deployment.sourceRevision, database: 'jenfu_prod', ledger: 'platform_core.schema_migrations', manifestSha256: h.migrationManifestSha256, baselineCount: 10, minimumLedgerCount: 10, ledgerCount: 15, applied: 4, replayed: 11, crossDatabaseDenials: [{ database: 'jenfu_dev', denied: true }, { database: 'jenfu_stg', denied: true }], boundaryStatus: 'PASS', executionName: 'projects/p/locations/r/jobs/j/executions/e', startedAt: '2026-09-18T00:00:00.000Z', completedAt: '2026-09-18T00:00:01.000Z', status: 'PASS' }
    await h.transport.putJson(outputUri, { ...core, receiptSha256: sha256(canonicalize(core)) }, { bucket, prefix: 'receipts' })
  }
  let terminal
  for (const stage of ['prepare', 'build', 'migrate', 'candidate', 'entrypoint', 'verify', 'decision', 'activate', 'canonical', 'finalize']) terminal = await executeOwnerStage({ ...input, stage })
  const result = JSON.parse((await h.transport.readBytes(terminal.ref.uri)).bytes)
  assert.equal(executions, 1)
  assert.equal(result.facts.databaseDisposition, 'FORWARD_APPLIED')
})

test('DEV-014 producer remediation accepts only the exact sixteen-row migration receipt', async () => {
  const h = recordedHarness()
  const { input } = await authorizedRecordedInput(h, 'DEV014-PRODUCER-REMEDIATION')
  input.verifyRoutineRelease = async ({ intent }) => ({ baselineIntentRef: intent.baselineIntentRef, baselineMigrationRef: { uri: baselineRef.uri, sha256: baselineRef.sha256 }, migrationDisposition: 'FORWARD_APPLY', pendingMigrationCount: 1, releaseMode: 'DEV014_PRODUCER_CONTRACT_REMEDIATION' })
  let executions = 0
  h.transport.runMigrationJob = async ({ deployment, outputUri }) => {
    executions += 1
    const core = { schemaVersion: 'jenfu.dev012.migration-receipt.v1', ownerApplicationId: h.profile.application.id, sourceRevision: deployment.sourceRevision, database: 'jenfu_prod', ledger: 'orgmaster_core.schema_migrations', manifestSha256: h.migrationManifestSha256, baselineCount: 10, minimumLedgerCount: 10, ledgerCount: 16, applied: 1, replayed: 15, crossDatabaseDenials: [{ database: 'jenfu_dev', denied: true }, { database: 'jenfu_stg', denied: true }], boundaryStatus: 'PASS', executionName: 'projects/p/locations/r/jobs/j/executions/e', startedAt: '2026-09-21T00:00:00.000Z', completedAt: '2026-09-21T00:00:01.000Z', status: 'PASS' }
    await h.transport.putJson(outputUri, { ...core, receiptSha256: sha256(canonicalize(core)) }, { bucket, prefix: 'receipts' })
  }
  let terminal
  for (const stage of ['prepare', 'build', 'migrate', 'candidate', 'entrypoint', 'verify', 'decision', 'activate', 'canonical', 'finalize']) terminal = await executeOwnerStage({ ...input, stage })
  const result = JSON.parse((await h.transport.readBytes(terminal.ref.uri)).bytes)
  assert.equal(executions, 1)
  assert.equal(result.facts.databaseDisposition, 'FORWARD_APPLIED')
})

test('DEV-014 application registration remediation accepts only the exact seventeen-row migration receipt', async () => {
  const h = recordedHarness()
  const { input } = await authorizedRecordedInput(h, 'DEV014-APPLICATION-REGISTRATION-REMEDIATION')
  input.verifyRoutineRelease = async ({ intent }) => ({ baselineIntentRef: intent.baselineIntentRef, baselineMigrationRef: { uri: baselineRef.uri, sha256: baselineRef.sha256 }, migrationDisposition: 'FORWARD_APPLY', pendingMigrationCount: 1, releaseMode: 'DEV014_APPLICATION_REGISTRATION_REMEDIATION' })
  let executions = 0
  h.transport.runMigrationJob = async ({ deployment, outputUri }) => {
    executions += 1
    const core = { schemaVersion: 'jenfu.dev012.migration-receipt.v1', ownerApplicationId: h.profile.application.id, sourceRevision: deployment.sourceRevision, database: 'jenfu_prod', ledger: 'orgmaster_core.schema_migrations', manifestSha256: h.migrationManifestSha256, baselineCount: 10, minimumLedgerCount: 10, ledgerCount: 17, applied: 1, replayed: 16, crossDatabaseDenials: [{ database: 'jenfu_dev', denied: true }, { database: 'jenfu_stg', denied: true }], boundaryStatus: 'PASS', executionName: 'projects/p/locations/r/jobs/j/executions/e', startedAt: '2026-09-21T00:00:00.000Z', completedAt: '2026-09-21T00:00:01.000Z', status: 'PASS' }
    await h.transport.putJson(outputUri, { ...core, receiptSha256: sha256(canonicalize(core)) }, { bucket, prefix: 'receipts' })
  }
  let terminal
  for (const stage of ['prepare', 'build', 'migrate', 'candidate', 'entrypoint', 'verify', 'decision', 'activate', 'canonical', 'finalize']) terminal = await executeOwnerStage({ ...input, stage })
  const result = JSON.parse((await h.transport.readBytes(terminal.ref.uri)).bytes)
  assert.equal(executions, 1)
  assert.equal(result.facts.databaseDisposition, 'FORWARD_APPLIED')
})

test('application-only intent cannot skip baseline verification by omitting the verifier', async () => {
  const h = recordedHarness()
  const { input, intentResult } = await authorizedRecordedInput(h, 'ROUTINE-NO-VERIFIER')
  const intent = JSON.parse((await h.transport.readBytes(intentResult.ref.uri)).bytes)
  intent.baselineIntentRef = { uri: `gs://${bucket}/receipts/baseline.json`, sha256: 'e'.repeat(64) }
  const next = await h.transport.putJson(`gs://${bucket}/receipts/routine-no-verifier.json`, intent)
  await assert.rejects(() => executeOwnerStage({ ...input, verifyRoutineRelease: undefined, capsuleRef: next.ref.uri, capsuleSha256: next.ref.sha256, stage: 'prepare' }), /ROUTINE_VERIFIER_REQUIRED/)
})

test('historical intent is readable for recovery but cannot re-enter any release stage', async () => {
  const h = recordedHarness()
  const { input, intentResult } = await authorizedRecordedInput(h, 'LEGACY-READ-ONLY')
  const intent = JSON.parse((await h.transport.readBytes(intentResult.ref.uri)).bytes)
  delete intent.baselineIntentRef
  const legacy = await h.transport.putJson(`gs://${bucket}/receipts/legacy-intent.json`, intent)
  const legacyInput = { ...input, capsuleRef: legacy.ref.uri, capsuleSha256: legacy.ref.sha256 }
  for (const stage of ['prepare', 'build', 'migrate', 'candidate', 'entrypoint', 'verify', 'decision', 'activate', 'canonical', 'finalize']) {
    await assert.rejects(() => executeOwnerStage({ ...legacyInput, stage }), /RELEASE_BASELINE_REQUIRED/)
  }
  const result = await executeOwnerStage({ ...legacyInput, stage: 'rollback' })
  assert.equal(JSON.parse((await h.transport.readBytes(result.ref.uri)).bytes).facts.databaseDisposition, 'NOT_APPLIED')
  assert.equal(h.transport.effectiveRevision(h.service()), previousRevision)
})

test('candidate smoke failure leaves production data and serving traffic unchanged', async () => {
  const h = recordedHarness()
  const { input } = await authorizedRecordedInput(h, 'CANDIDATE-SMOKE-FAIL')
  for (const stage of ['prepare', 'build', 'migrate', 'candidate', 'entrypoint']) await executeOwnerStage({ ...input, stage })
  h.transport.runInternalCandidateSmoke = async () => { throw new Error('CANDIDATE_SMOKE_FAILED') }
  await assert.rejects(() => executeOwnerStage({ ...input, stage: 'verify' }), /CANDIDATE_SMOKE_FAILED/)
  const result = await executeOwnerStage({ ...input, stage: 'rollback' })
  const terminal = JSON.parse((await h.transport.readBytes(result.ref.uri)).bytes)
  assert.equal(terminal.facts.result, 'PRE_ACTIVATION_ABORTED')
  assert.equal(terminal.facts.databaseDisposition, 'UNCHANGED_VERIFIED')
  assert.equal(h.transport.effectiveRevision(h.service()), previousRevision)
  assert.equal(h.service().trafficStatuses.some((row) => row.tag), false)
})


test('recorded provider transport executes the ten immutable owner stages without sibling state', async () => {
  const h = recordedHarness()
  const refFor = async (name, value) => (await h.transport.putJson(`gs://${bucket}/receipts/prerequisites/${name}.json`, value, { bucket, prefix: 'receipts' })).ref
  const common = { releaseAuthority: true, evidenceScope: 'PROVIDER' }
  const sourceLockRef = await refFor('source-lock', { ...common, status: 'SOURCE_FROZEN', sourceRevision: H40, clean: true })
  const authorizationPolicyRef = await refFor('authorization', { ...common, status: 'PASS', environment: 'production', remainingHumanAction: 0, expiresAt: '2999-01-01T00:00:00.000Z' })
  const readinessReceiptRef = await refFor('readiness', { ...common, status: 'PASS', environment: 'production', remainingHumanAction: 0, expiresAt: '2999-01-01T00:00:00.000Z', projectId: 'jenfu-platform-prod' })
  const foundationReceiptRef = await refFor('foundation', { ...common, status: 'APPLIED', projectId: 'jenfu-platform-prod' })
  const infraReceiptRef = await refFor('infra', { ...common, status: 'APPLIED', projectId: 'jenfu-platform-prod', migrationRunnerDigest })
  const runtimeConfigRef = await refFor('runtime', { ...common, status: 'VERIFIED', projectId: 'jenfu-platform-prod', ...buildRuntimeConfig(h.profile, { plainEnvironment: { NODE_ENV: 'production' }, secretVersions: { SESSION_SECRET: '1' } }) })
  const intent = { baselineIntentRef: baselineRef, schemaVersion: 'owner.intent.v2', ownerApplicationId: 'platform', releaseId: 'REL-RECORDED-001', sourceRevision: H40, sourceSha256: sha256(h.sourceIdentityBytes), sourceLockRef, authorizationPolicyRef, readinessReceiptRef, foundationReceiptRef, infraReceiptRef, runtimeConfigRef, migrationManifestSha256: h.migrationManifestSha256, previousRevision, deadlineAt: '2999-01-01T00:00:00.000Z' }
  const intentResult = await h.transport.putJson(`gs://${bucket}/receipts/intents/release.json`, intent, { bucket, prefix: 'receipts' })
  const input = { capsuleRef: intentResult.ref.uri, capsuleSha256: intentResult.ref.sha256, profile: h.profile, transport: h.transport, environment: h.environment, verifyRoutineRelease: verifiedBaseline, validateIntent: (value) => value, createSourceIdentity: async () => h.sourceIdentityBytes, createSourceArchive: async () => h.sourceArchiveBytes, buildMigrationBundle: async () => ({ bundle: { manifestSha256: h.migrationManifestSha256 }, bytes: h.migrationBytes, bundleSha256: sha256(h.migrationBytes) }) }
  for (const stage of ['prepare', 'build', 'migrate', 'candidate', 'entrypoint', 'verify', 'decision', 'activate', 'canonical', 'finalize']) await executeOwnerStage({ ...input, stage })
  const activation = [...h.objects.entries()].find(([uri]) => uri.endsWith('/activate.json'))
  assert.ok(activation)
  assert.equal(JSON.parse(activation[1].bytes.toString()).facts.defaultUriDisabled, false)
  const archivedSource = [...h.objects.entries()].find(([uri]) => uri.endsWith('/source.tar.gz'))
  assert.ok(archivedSource)
  assert.deepEqual(gunzipSync(archivedSource[1].bytes), h.sourceArchiveBytes)
  const terminal = [...h.objects.entries()].find(([uri]) => uri.endsWith('/terminal.json'))
  assert.ok(terminal)
  assert.equal(JSON.parse(terminal[1].bytes.toString()).facts.result, 'RELEASED')
  assert.equal(h.service().trafficStatuses.some((row) => row.tag), false)
  assert.equal(h.transport.effectiveRevision(h.service()), candidateRevision)
})
test('candidate tag readback accepts deterministic and provider-derived run.app URLs only', () => {
  const candidate = { tag: candidateTag, tagUri: candidateOrigin }
  const service = { uri: 'https://jenfu-platform-prod-56gnizku7q-de.a.run.app', urls: [canonicalOrigin, 'https://jenfu-platform-prod-56gnizku7q-de.a.run.app'] }
  assert.equal(candidateTagUriMatches(service, candidate, candidateOrigin), true)
  assert.equal(candidateTagUriMatches(service, candidate, `https://${candidateTag}---jenfu-platform-prod-56gnizku7q-de.a.run.app`), true)
  assert.equal(candidateTagUriMatches(service, candidate, `https://${candidateTag}---sibling-56gnizku7q-de.a.run.app`), false)
})

test('expired control is superseded only after terminal owner-run and settled baseline readback', () => {
  const profile = { application: { id: 'platform', repository: 'owner/repo' }, target: { serviceName: 'jenfu-platform-prod' }, artifact: { releaseBucket: bucket } }
  const core = {
    schemaVersion: 'jenfu.dev012.owner-control-head.v1', inputFingerprint: '1'.repeat(64), ownerApplicationId: 'platform',
    service: 'jenfu-platform-prod', controlBucket: bucket, releaseId: 'REL-OLD-001', sourceRevision: H40,
    sourceLockSha256: '2'.repeat(64), candidateRevision, previousRevision, ownerRunRef: 'https://api.github.com/repos/owner/repo/actions/runs/99',
    leaseExpiresAt: '2026-09-08T00:00:00.000Z', deadlineAt: '2026-09-08T02:00:00.000Z', state: 'GO', result: null,
  }
  const current = { ...core, controlSha256: sha256(canonicalize(core)) }
  const ownerRun = { id: '99', status: 'completed', conclusion: 'failure', event: 'workflow_dispatch', headSha: H40 }
  const service = { traffic: [{ revision: previousRevision, percent: 100 }], trafficStatuses: [{ revision: previousRevision, percent: 100 }] }
  const input = { current, profile, intent: { previousRevision }, ownerRun, service, activeRevision: previousRevision, now: '2026-09-08T01:00:00.000Z' }
  assert.equal(assertStaleControlSafeToSupersede(input), true)
  const newCandidate = { tag: 'candidate-newcontrol', candidateRevision: 'jenfu-platform-prod-newcontrol' }
  const taggedService = {
    traffic: [...service.traffic, { revision: newCandidate.candidateRevision, percent: 0, tag: newCandidate.tag }],
    trafficStatuses: [...service.trafficStatuses, { revision: newCandidate.candidateRevision, percent: 0, tag: newCandidate.tag }],
  }
  assert.equal(assertStaleControlSafeToSupersede({ ...input, service: taggedService, candidate: newCandidate, nextState: 'CANDIDATE_CREATED' }), true)
  assert.throws(() => assertStaleControlSafeToSupersede({ ...input, service: taggedService, candidate: { ...newCandidate, tag: 'candidate-wrong' }, nextState: 'CANDIDATE_CREATED' }), /CONTROL_HEAD_TAKEOVER_UNSAFE/u)
  assert.throws(() => assertStaleControlSafeToSupersede({ ...input, ownerRun: { ...ownerRun, status: 'in_progress', conclusion: null } }), /CONTROL_HEAD_TAKEOVER_UNSAFE/u)
  assert.throws(() => assertStaleControlSafeToSupersede({ ...input, service: { ...service, trafficStatuses: [...service.trafficStatuses, { revision: candidateRevision, tag: candidateTag }] } }), /CONTROL_HEAD_TAKEOVER_UNSAFE/u)
  assert.throws(() => assertStaleControlSafeToSupersede({ ...input, activeRevision: candidateRevision }), /CONTROL_HEAD_TAKEOVER_UNSAFE/u)
})

test('rollback reports no database mutation when migrate receipt was never produced', async () => {
  const h = recordedHarness()
  const refFor = async (name, value) => (await h.transport.putJson(`gs://${bucket}/receipts/prerequisites/rollback-${name}.json`, value, { bucket, prefix: 'receipts' })).ref
  const common = { releaseAuthority: true, evidenceScope: 'PROVIDER' }
  const sourceLockRef = await refFor('source-lock', { ...common, status: 'SOURCE_FROZEN', sourceRevision: H40, clean: true })
  const authorizationPolicyRef = await refFor('authorization', { ...common, status: 'PASS', environment: 'production', remainingHumanAction: 0, expiresAt: '2999-01-01T00:00:00.000Z' })
  const readinessReceiptRef = await refFor('readiness', { ...common, status: 'PASS', environment: 'production', remainingHumanAction: 0, expiresAt: '2999-01-01T00:00:00.000Z', projectId: 'jenfu-platform-prod' })
  const foundationReceiptRef = await refFor('foundation', { ...common, status: 'APPLIED', projectId: 'jenfu-platform-prod' })
  const infraReceiptRef = await refFor('infra', { ...common, status: 'APPLIED', projectId: 'jenfu-platform-prod', migrationRunnerDigest })
  const runtimeConfigRef = await refFor('runtime', { ...common, status: 'VERIFIED', projectId: 'jenfu-platform-prod', ...buildRuntimeConfig(h.profile, { plainEnvironment: { NODE_ENV: 'production' }, secretVersions: { SESSION_SECRET: '1' } }) })
  const intent = { baselineIntentRef: baselineRef, schemaVersion: 'owner.intent.v2', ownerApplicationId: 'platform', releaseId: 'REL-RECORDED-ROLLBACK', sourceRevision: H40, sourceSha256: sha256(h.sourceIdentityBytes), sourceLockRef, authorizationPolicyRef, readinessReceiptRef, foundationReceiptRef, infraReceiptRef, runtimeConfigRef, migrationManifestSha256: h.migrationManifestSha256, previousRevision, deadlineAt: '2999-01-01T00:00:00.000Z' }
  const intentResult = await h.transport.putJson(`gs://${bucket}/receipts/intents/rollback.json`, intent, { bucket, prefix: 'receipts' })
  const input = { capsuleRef: intentResult.ref.uri, capsuleSha256: intentResult.ref.sha256, profile: h.profile, transport: h.transport, environment: h.environment, verifyRoutineRelease: verifiedBaseline, validateIntent: (value) => value, createSourceIdentity: async () => h.sourceIdentityBytes, createSourceArchive: async () => h.sourceArchiveBytes, buildMigrationBundle: async () => ({ bundle: { manifestSha256: h.migrationManifestSha256 }, bytes: h.migrationBytes, bundleSha256: sha256(h.migrationBytes) }) }
  await executeOwnerStage({ ...input, stage: 'prepare' })
  await executeOwnerStage({ ...input, stage: 'rollback' })
  const terminal = [...h.objects.entries()].find(([uri]) => uri.includes(intentResult.ref.sha256) && uri.endsWith('/terminal.json'))
  assert.ok(terminal)
  const value = JSON.parse(terminal[1].bytes.toString())
  assert.equal(value.facts.result, 'PRE_ACTIVATION_ABORTED')
  assert.equal(value.facts.databaseDisposition, 'NOT_APPLIED')
})
test('post-activation rollback switches to the previous revision without rebinding the candidate tag', async () => {
  const h = recordedHarness()
  const { input, intentResult } = await authorizedRecordedInput(h, 'REL-RECORDED-ACTIVE-ROLLBACK')
  for (const stage of ['prepare', 'build', 'migrate', 'candidate', 'entrypoint', 'verify', 'decision', 'activate']) await executeOwnerStage({ ...input, stage })
  await executeOwnerStage({ ...input, stage: 'rollback' })
  const terminal = [...h.objects.entries()].find(([uri]) => uri.includes(intentResult.ref.sha256) && uri.endsWith('/terminal.json'))
  assert.ok(terminal)
  const value = JSON.parse(terminal[1].bytes.toString())
  assert.equal(value.facts.result, 'ROLLED_BACK')
  assert.equal(value.facts.databaseDisposition, 'UNCHANGED_VERIFIED')
  assert.equal(h.transport.effectiveRevision(h.service()), previousRevision)
  assert.equal(h.service().trafficStatuses.some((row) => row.tag), false)
  assert.equal(h.service().ingress, 'INGRESS_TRAFFIC_INTERNAL_ONLY')
  assert.equal(h.service().defaultUriDisabled, true)
})

test('DEV-057 grant v4 verifies exact 29-row receipt, replay and isolation',()=>{
 const profile={application:{id:'orgmaster'}},intent={sourceRevision:H40,migrationManifestSha256:'b'.repeat(64)},forwardPlan={releaseMode:'DEV057_PRINCIPAL_GRANTS_V4_REMEDIATION'};
 const core={schemaVersion:'jenfu.dev012.migration-receipt.v1',ownerApplicationId:'orgmaster',sourceRevision:H40,manifestSha256:intent.migrationManifestSha256,status:'PASS',boundaryStatus:'PASS',baselineCount:10,minimumLedgerCount:10,ledgerCount:29,applied:1,replayed:28,crossDatabaseDenials:[{database:'jenfu_dev',denied:true},{database:'jenfu_stg',denied:true}]};
 const check=value=>assertMigrationReceipt({...value,receiptSha256:sha256(canonicalize(value))},profile,intent,{allowForward:true,forwardPlan});
 assert.doesNotThrow(()=>check(core));assert.doesNotThrow(()=>check({...core,applied:0,replayed:29}));
 for(const changed of [{ledgerCount:28},{applied:2,replayed:27},{replayed:27},{crossDatabaseDenials:[{database:'jenfu_dev',denied:false},{database:'jenfu_stg',denied:true}]}])assert.throws(()=>check({...core,...changed}),/MIGRATION_RECEIPT_INVALID/);
});

test('DEV-057 employee number command v2 verifies exact 30-row receipt, replay and isolation',()=>{
 const profile={application:{id:'orgmaster'}},intent={sourceRevision:H40,migrationManifestSha256:'b'.repeat(64)},forwardPlan={releaseMode:'DEV057_EMPLOYEE_NUMBER_COMMAND_RECEIPT_V2_REMEDIATION'};
 const core={schemaVersion:'jenfu.dev012.migration-receipt.v1',ownerApplicationId:'orgmaster',sourceRevision:H40,manifestSha256:intent.migrationManifestSha256,status:'PASS',boundaryStatus:'PASS',baselineCount:10,minimumLedgerCount:10,ledgerCount:30,applied:1,replayed:29,crossDatabaseDenials:[{database:'jenfu_dev',denied:true},{database:'jenfu_stg',denied:true}]};
 const check=value=>assertMigrationReceipt({...value,receiptSha256:sha256(canonicalize(value))},profile,intent,{allowForward:true,forwardPlan});
 assert.doesNotThrow(()=>check(core));assert.doesNotThrow(()=>check({...core,applied:0,replayed:30}));
 for(const changed of [{ledgerCount:29},{applied:2,replayed:28},{replayed:28},{crossDatabaseDenials:[{database:'jenfu_dev',denied:false},{database:'jenfu_stg',denied:true}]}])assert.throws(()=>check({...core,...changed}),/MIGRATION_RECEIPT_INVALID/);
});

test('DEV-014 lifecycle v2 receipt proves 31 rows, at most one append and exact replay', () => {
  const profile = { application: { id: 'orgmaster' } }, intent = { sourceRevision: H40, migrationManifestSha256: 'b'.repeat(64) }, forwardPlan = { releaseMode: 'DEV014_PRINCIPAL_LIFECYCLE_V2_REMEDIATION' }
  const core = { schemaVersion: 'jenfu.dev012.migration-receipt.v1', ownerApplicationId: 'orgmaster', sourceRevision: H40, manifestSha256: intent.migrationManifestSha256, status: 'PASS', boundaryStatus: 'PASS', baselineCount: 10, minimumLedgerCount: 10, ledgerCount: 31, applied: 1, replayed: 30, crossDatabaseDenials: [{ database: 'jenfu_dev', denied: true }, { database: 'jenfu_stg', denied: true }] }
  const check = value => assertMigrationReceipt({ ...value, receiptSha256: sha256(canonicalize(value)) }, profile, intent, { allowForward: true, forwardPlan })
  assert.doesNotThrow(() => check(core)); assert.doesNotThrow(() => check({ ...core, applied: 0, replayed: 31 }))
  for (const changed of [{ ledgerCount: 30 }, { applied: 2, replayed: 29 }, { replayed: 29 }, { crossDatabaseDenials: [{ database: 'jenfu_dev', denied: false }, { database: 'jenfu_stg', denied: true }] }]) assert.throws(() => check({ ...core, ...changed }), /MIGRATION_RECEIPT_INVALID/)
})

test('DEV-058 role-policy append requires the native receipt, exact append counts, and isolation', () => {
  const profile = { application: { id: 'orgmaster' } }
  const intent = { sourceRevision: H40, migrationManifestSha256: 'b'.repeat(64) }
  const forwardPlan = { releaseMode: DEV058_RELEASE_MODE, pendingMigrationCount: DEV058_MIGRATION_ENTRIES.length }
  const core = {
    schemaVersion: 'jenfu.dev012.migration-receipt.v1', ownerApplicationId: 'orgmaster', sourceRevision: H40,
    manifestSha256: intent.migrationManifestSha256, status: 'PASS', boundaryStatus: 'PASS',
    database: 'jenfu_prod', ledger: 'orgmaster_core.schema_migrations', baselineCount: 10, minimumLedgerCount: 10,
    ledgerCount: DEV058_MIGRATION_ENTRY_COUNT, applied: 1, replayed: DEV058_MIGRATION_ENTRY_COUNT - 1,
    crossDatabaseDenials: [{ database: 'jenfu_dev', denied: true }, { database: 'jenfu_stg', denied: true }],
  }
  const receipt = (value) => ({ ...value, receiptSha256: sha256(canonicalize(value)) })
  const check = (value, plan = forwardPlan) => assertMigrationReceipt(receipt(value), profile, intent, { allowForward: true, forwardPlan: plan })

  for (let applied = 0; applied <= DEV058_MIGRATION_ENTRIES.length; applied += 1) {
    assert.doesNotThrow(() => check({ ...core, applied, replayed: DEV058_MIGRATION_ENTRY_COUNT - applied }))
  }
  for (const changed of [
    { ledgerCount: DEV058_MIGRATION_ENTRY_COUNT - 1 },
    { ledgerCount: DEV058_MIGRATION_ENTRY_COUNT + 1 },
    { applied: -1, replayed: DEV058_MIGRATION_ENTRY_COUNT + 1 },
    { applied: DEV058_MIGRATION_ENTRIES.length + 1, replayed: DEV058_MIGRATION_ENTRY_COUNT - DEV058_MIGRATION_ENTRIES.length - 1 },
    { replayed: DEV058_MIGRATION_ENTRY_COUNT },
    { database: 'jenfu_dev' },
    { ledger: 'platform_core.schema_migrations' },
    { crossDatabaseDenials: [{ database: 'jenfu_dev', denied: true }] },
    { crossDatabaseDenials: [{ database: 'jenfu_dev', denied: true }, { database: 'jenfu_dev', denied: true }] },
    { crossDatabaseDenials: [{ database: 'jenfu_dev', denied: false }, { database: 'jenfu_stg', denied: true }] },
  ]) {
    assert.throws(() => check({ ...core, ...changed }), /MIGRATION_RECEIPT_INVALID/)
  }
  assert.throws(() => check(core, { ...forwardPlan, pendingMigrationCount: DEV058_MIGRATION_ENTRIES.length - 1 }), /MIGRATION_RECEIPT_INVALID/)

  const stageReceipt = { schemaVersion: 'jenfu.dev012.stage-receipt.v1', ownerApplicationId: 'orgmaster', sourceRevision: H40, stage: 'migrate', status: 'PASS' }
  assert.throws(() => assertMigrationReceipt(stageReceipt, profile, intent, { allowForward: true, forwardPlan }), /MIGRATION_RECEIPT_INVALID/)
})

test('DEV-059 FMS authority append requires the 36-row native receipt and planned recovery count', () => {
  const profile = { application: { id: 'orgmaster' } }
  const intent = { sourceRevision: H40, migrationManifestSha256: 'b'.repeat(64) }
  const forwardPlan = { releaseMode: DEV059_RELEASE_MODE, pendingMigrationCount: DEV059_MIGRATION_ENTRY_COUNT - 31 }
  const core = {
    schemaVersion: 'jenfu.dev012.migration-receipt.v1', ownerApplicationId: 'orgmaster', sourceRevision: H40,
    manifestSha256: intent.migrationManifestSha256, status: 'PASS', boundaryStatus: 'PASS',
    database: 'jenfu_prod', ledger: 'orgmaster_core.schema_migrations', baselineCount: 10, minimumLedgerCount: 10,
    ledgerCount: DEV059_MIGRATION_ENTRY_COUNT, applied: 1, replayed: DEV059_MIGRATION_ENTRY_COUNT - 1,
    crossDatabaseDenials: [{ database: 'jenfu_dev', denied: true }, { database: 'jenfu_stg', denied: true }],
  }
  const receipt = value => ({ ...value, receiptSha256: sha256(canonicalize(value)) })
  const check = (value, plan = forwardPlan) => assertMigrationReceipt(receipt(value), profile, intent, { allowForward: true, forwardPlan: plan })
  for (let applied = 0; applied <= forwardPlan.pendingMigrationCount; applied += 1) {
    assert.doesNotThrow(() => check({ ...core, applied, replayed: DEV059_MIGRATION_ENTRY_COUNT - applied }))
  }
  for (const changes of [
    { ledgerCount: DEV059_MIGRATION_ENTRY_COUNT - 1 },
    { applied: forwardPlan.pendingMigrationCount + 1, replayed: DEV059_MIGRATION_ENTRY_COUNT - forwardPlan.pendingMigrationCount - 1 },
    { database: 'jenfu_dev' },
    { crossDatabaseDenials: [{ database: 'jenfu_dev', denied: true }] },
  ]) assert.throws(() => check({ ...core, ...changes }), /MIGRATION_RECEIPT_INVALID/u)
  for (const pendingMigrationCount of [0, DEV059_MIGRATION_ENTRY_COUNT - 30]) {
    assert.throws(() => check(core, { ...forwardPlan, pendingMigrationCount }), /MIGRATION_RECEIPT_INVALID/u)
  }
})

test('DEV-057 ProJED principal append requires exact 40-row native receipt and two pending migrations', () => {
  const profile = { application: { id: 'orgmaster' } }
  const intent = { sourceRevision: H40, migrationManifestSha256: 'b'.repeat(64) }
  const forwardPlan = { releaseMode: DEV057_PROJED_RELEASE_MODE, pendingMigrationCount: 2 }
  const core = {
    schemaVersion: 'jenfu.dev012.migration-receipt.v1', ownerApplicationId: 'orgmaster', sourceRevision: H40,
    manifestSha256: intent.migrationManifestSha256, status: 'PASS', boundaryStatus: 'PASS',
    database: 'jenfu_prod', ledger: 'orgmaster_core.schema_migrations', baselineCount: 10, minimumLedgerCount: 10,
    ledgerCount: DEV057_PROJED_MIGRATION_ENTRY_COUNT, applied: 1, replayed: DEV057_PROJED_MIGRATION_ENTRY_COUNT - 1,
    crossDatabaseDenials: [{ database: 'jenfu_dev', denied: true }, { database: 'jenfu_stg', denied: true }],
  }
  const receipt = value => ({ ...value, receiptSha256: sha256(canonicalize(value)) })
  const check = (value, plan = forwardPlan) => assertMigrationReceipt(receipt(value), profile, intent, { allowForward: true, forwardPlan: plan })
  for (let applied = 0; applied <= 2; applied += 1) {
    assert.doesNotThrow(() => check({ ...core, applied, replayed: DEV057_PROJED_MIGRATION_ENTRY_COUNT - applied }))
  }
  for (const changed of [
    { ledgerCount: 39 },
    { ledgerCount: 41 },
    { applied: 3, replayed: DEV057_PROJED_MIGRATION_ENTRY_COUNT - 3 },
    { ownerApplicationId: 'platform' },
    { database: 'jenfu_dev' },
    { manifestSha256: 'f'.repeat(64) },
    { sourceRevision: 'c'.repeat(40) },
    { crossDatabaseDenials: [{ database: 'jenfu_dev', denied: true }] },
    { crossDatabaseDenials: [{ database: 'jenfu_dev', denied: false }, { database: 'jenfu_stg', denied: true }] },
  ]) assert.throws(() => check({ ...core, ...changed }), /MIGRATION_RECEIPT_INVALID/u)
  for (const pendingMigrationCount of [1, 3]) {
    assert.throws(() => check(core, { ...forwardPlan, pendingMigrationCount }), /MIGRATION_RECEIPT_INVALID/u)
  }

  const stageReceipt = { schemaVersion: 'jenfu.dev012.stage-receipt.v1', ownerApplicationId: 'orgmaster', sourceRevision: H40, stage: 'migrate', status: 'PASS' }
  assert.throws(() => assertMigrationReceipt(stageReceipt, profile, intent, { allowForward: true, forwardPlan }), /MIGRATION_RECEIPT_INVALID/u)
})

test('DEV-057 ProJED fresh prepare binds exact recipe and migrate requires live runner digest readback', async () => {
  async function projedInput(releaseId, remediation = DEV057_PROJED_REMEDIATION) {
    const h = recordedHarness('orgmaster')
    const { input, intentResult } = await authorizedRecordedInput(h, releaseId)
    const intent = (await h.transport.readJson(intentResult.ref)).value
    const priorInfra = (await h.transport.readJson(intent.infraReceiptRef)).value
    const rotatedInfra = {
      ...priorInfra,
      mutationProfile: 'APP_INFRA_IMAGE_ROTATION',
      toolRotation: { schemaVersion: 'orgmaster.ordinary-tool-image-rotation.v1' },
    }
    const common = {
      releaseAuthority: true, evidenceScope: 'PROVIDER', status: 'PASS', environment: 'production',
      projectId: 'jenfu-platform-prod', remainingHumanAction: 0, expiresAt: '2999-01-01T00:00:00.000Z',
      ownerApplicationId: intent.ownerApplicationId, sourceRevision: intent.sourceRevision, releaseId: intent.releaseId,
      baselineIntentRef: intent.baselineIntentRef, devId: 'DEV-057', slice: '057-PROJED-PRINCIPAL', remediation,
    }
    const authorization = await h.transport.putJson(`gs://${bucket}/receipts/prerequisites/${releaseId}-projed-authorization.json`,
      { ...common, schemaVersion: 'orgmaster.routine-release-authorization.v1', authorizationBasis: 'OPERATOR_INVOKED_DEPLOY_PRODUCTION' }, { bucket, prefix: 'receipts' })
    const readiness = await h.transport.putJson(`gs://${bucket}/receipts/prerequisites/${releaseId}-projed-readiness.json`,
      { ...common, schemaVersion: 'orgmaster.routine-release-readiness.v1' }, { bucket, prefix: 'receipts' })
    const infra = await h.transport.putJson(`gs://${bucket}/receipts/prerequisites/${releaseId}-projed-infra.json`, rotatedInfra, { bucket, prefix: 'receipts' })
    const revisedIntent = { ...intent, authorizationPolicyRef: authorization.ref, readinessReceiptRef: readiness.ref, infraReceiptRef: infra.ref }
    const capsule = await h.transport.putJson(`gs://${bucket}/receipts/intents/${releaseId}-projed-principal.json`, revisedIntent, { bucket, prefix: 'receipts' })
    input.capsuleRef = capsule.ref.uri
    input.capsuleSha256 = capsule.ref.sha256
    input.verifyRoutineRelease = async ({ intent: currentIntent }) => ({
      baselineIntentRef: currentIntent.baselineIntentRef,
      baselineMigrationRef: { uri: `gs://${bucket}/receipts/baseline-migrate.json`, sha256: 'e'.repeat(64) },
      migrationDisposition: 'FORWARD_APPLY', pendingMigrationCount: 2,
      releaseMode: DEV057_PROJED_RELEASE_MODE,
      controlledTransition: { releaseMode: DEV057_PROJED_RELEASE_MODE },
      toolImageRotation: {
        evidenceScope: 'OWNER_SEALED_TOOL_IMAGE_ROTATION',
        sourceRevision: currentIntent.sourceRevision,
        migrationRunnerDigest: rotatedInfra.migrationRunnerDigest,
      },
    })
    return { h, input, intent, infra: rotatedInfra }
  }

  const accepted = await projedInput('DEV057-PROJED-PREPARE-EXACT')
  const firstPrepare = await executeOwnerStage({ ...accepted.input, stage: 'prepare' })
  const sameAuthorityPrepare = await executeOwnerStage({ ...accepted.input, stage: 'prepare' })
  assert.equal(sameAuthorityPrepare.ref.sha256, firstPrepare.ref.sha256)
  await executeOwnerStage({ ...accepted.input, stage: 'build' })

  let jobs = 0
  accepted.h.transport.runMigrationJob = async ({ deployment, outputUri }) => {
    jobs += 1
    const core = {
      schemaVersion: 'jenfu.dev012.migration-receipt.v1', ownerApplicationId: accepted.h.profile.application.id,
      sourceRevision: deployment.sourceRevision, database: 'jenfu_prod', ledger: 'orgmaster_core.schema_migrations',
      manifestSha256: accepted.h.migrationManifestSha256, baselineCount: 10, minimumLedgerCount: 10,
      ledgerCount: DEV057_PROJED_MIGRATION_ENTRY_COUNT, applied: 2, replayed: DEV057_PROJED_MIGRATION_ENTRY_COUNT - 2,
      crossDatabaseDenials: [{ database: 'jenfu_dev', denied: true }, { database: 'jenfu_stg', denied: true }],
      boundaryStatus: 'PASS', status: 'PASS',
    }
    await accepted.h.transport.putJson(outputUri, { ...core, receiptSha256: sha256(canonicalize(core)) }, { bucket, prefix: 'receipts' })
  }
  let readbacks = 0
  const migration = await executeOwnerStage({
    ...accepted.input,
    stage: 'migrate',
    verifyToolJobReadback: async infra => {
      readbacks += 1
      assert.equal(infra.migrationRunnerDigest, accepted.infra.migrationRunnerDigest)
      return { migrationRunnerDigest: accepted.infra.migrationRunnerDigest, generation: '14' }
    },
  })
  assert.equal(readbacks, 1)
  assert.equal(jobs, 1)
  assert.equal(migration.value.ledgerCount, DEV057_PROJED_MIGRATION_ENTRY_COUNT)

  const wrongRecipe = await projedInput('DEV057-PROJED-WRONG-RECIPE', { ...DEV057_PROJED_REMEDIATION, contractVersion: 'wrong-contract' })
  await assert.rejects(() => executeOwnerStage({ ...wrongRecipe.input, stage: 'prepare' }), error => error?.code === 'DEV057_PROJED_PRINCIPAL_AUTHORITY_INVALID')
  assert.equal([...wrongRecipe.h.objects.keys()].some(uri => uri.endsWith('/prepare.json')), false)

  const wrongDigest = await projedInput('DEV057-PROJED-WRONG-DIGEST')
  await executeOwnerStage({ ...wrongDigest.input, stage: 'prepare' })
  await executeOwnerStage({ ...wrongDigest.input, stage: 'build' })
  let wrongDigestJobs = 0
  wrongDigest.h.transport.runMigrationJob = async () => { wrongDigestJobs += 1 }
  const objectsBefore = wrongDigest.h.objects.size
  await assert.rejects(() => executeOwnerStage({
    ...wrongDigest.input,
    stage: 'migrate',
    verifyToolJobReadback: async () => ({ migrationRunnerDigest: 'wrong-digest', generation: '15' }),
  }), error => error?.code === 'TOOL_JOB_READBACK_REQUIRED')
  assert.equal(wrongDigestJobs, 0)
  assert.equal(wrongDigest.h.objects.size, objectsBefore)
  assert.equal([...wrongDigest.h.objects.keys()].some(uri => uri.endsWith('/migrate.json')), false)
})

test('DEV-059 rotated runner requires exact live digest readback before its migration Job', async () => {
  async function prepared(releaseId) {
    const h = recordedHarness()
    const { input, intentResult } = await authorizedRecordedInput(h, releaseId)
    const intent = (await h.transport.readJson(intentResult.ref)).value
    const priorInfra = (await h.transport.readJson(intent.infraReceiptRef)).value
    const rotatedInfra = { ...priorInfra, mutationProfile: 'APP_INFRA_IMAGE_ROTATION', toolRotation: { schemaVersion: 'orgmaster.ordinary-tool-image-rotation.v1' } }
    const common = {
      releaseAuthority: true, evidenceScope: 'PROVIDER', status: 'PASS', environment: 'production',
      projectId: 'jenfu-platform-prod', remainingHumanAction: 0, expiresAt: '2999-01-01T00:00:00.000Z',
      ownerApplicationId: intent.ownerApplicationId, sourceRevision: intent.sourceRevision, releaseId: intent.releaseId,
      baselineIntentRef: intent.baselineIntentRef, devId: 'DEV-059', slice: '059-FMS-AUTHORITY', remediation: DEV059_FMS_AUTHORITY_REMEDIATION,
    }
    const authorization = await h.transport.putJson(`gs://${bucket}/receipts/prerequisites/${releaseId}-dev059-authorization.json`,
      { ...common, schemaVersion: 'orgmaster.routine-release-authorization.v1', authorizationBasis: 'OPERATOR_INVOKED_DEPLOY_PRODUCTION' }, { bucket, prefix: 'receipts' })
    const readiness = await h.transport.putJson(`gs://${bucket}/receipts/prerequisites/${releaseId}-dev059-readiness.json`,
      { ...common, schemaVersion: 'orgmaster.routine-release-readiness.v1' }, { bucket, prefix: 'receipts' })
    const infra = await h.transport.putJson(`gs://${bucket}/receipts/prerequisites/${releaseId}-dev059-infra.json`, rotatedInfra, { bucket, prefix: 'receipts' })
    const revisedIntent = { ...intent, authorizationPolicyRef: authorization.ref, readinessReceiptRef: readiness.ref, infraReceiptRef: infra.ref }
    const capsule = await h.transport.putJson(`gs://${bucket}/receipts/intents/${releaseId}-dev059-rotation.json`, revisedIntent, { bucket, prefix: 'receipts' })
    input.capsuleRef = capsule.ref.uri
    input.capsuleSha256 = capsule.ref.sha256
    input.verifyRoutineRelease = async ({ intent: currentIntent }) => ({
      baselineIntentRef: currentIntent.baselineIntentRef,
      baselineMigrationRef: { uri: `gs://${bucket}/receipts/baseline-migrate.json`, sha256: 'e'.repeat(64) },
      migrationDisposition: 'FORWARD_APPLY', pendingMigrationCount: DEV059_MIGRATION_ENTRY_COUNT - 31,
      releaseMode: DEV059_RELEASE_MODE, controlledTransition: { releaseMode: DEV059_RELEASE_MODE },
      toolImageRotation: { evidenceScope: 'OWNER_SEALED_TOOL_IMAGE_ROTATION', sourceRevision: currentIntent.sourceRevision, migrationRunnerDigest: rotatedInfra.migrationRunnerDigest },
    })
    await executeOwnerStage({ ...input, stage: 'prepare' })
    await executeOwnerStage({ ...input, stage: 'build' })
    return { h, input, infra: rotatedInfra }
  }

  const accepted = await prepared('DEV059-ROTATION-READBACK')
  let jobs = 0
  accepted.h.transport.runMigrationJob = async ({ deployment, outputUri }) => {
    jobs += 1
    const core = {
      schemaVersion: 'jenfu.dev012.migration-receipt.v1', ownerApplicationId: accepted.h.profile.application.id,
      sourceRevision: deployment.sourceRevision, database: 'jenfu_prod', ledger: 'orgmaster_core.schema_migrations',
      manifestSha256: accepted.h.migrationManifestSha256, baselineCount: 10, minimumLedgerCount: 10,
      ledgerCount: DEV059_MIGRATION_ENTRY_COUNT, applied: DEV059_MIGRATION_ENTRY_COUNT - 31, replayed: 31,
      crossDatabaseDenials: [{ database: 'jenfu_dev', denied: true }, { database: 'jenfu_stg', denied: true }],
      boundaryStatus: 'PASS', status: 'PASS',
    }
    await accepted.h.transport.putJson(outputUri, { ...core, receiptSha256: sha256(canonicalize(core)) }, { bucket, prefix: 'receipts' })
  }
  const migration = await executeOwnerStage({ ...accepted.input, stage: 'migrate', verifyToolJobReadback: async () => ({ migrationRunnerDigest: accepted.infra.migrationRunnerDigest, generation: '13' }) })
  assert.equal(jobs, 1)
  assert.equal(migration.value.ledgerCount, DEV059_MIGRATION_ENTRY_COUNT)

  const mismatched = await prepared('DEV059-ROTATION-BAD-READBACK')
  mismatched.h.transport.runMigrationJob = async () => assert.fail('digest mismatch must stop before the migration Job')
  await assert.rejects(() => executeOwnerStage({ ...mismatched.input, stage: 'migrate', verifyToolJobReadback: async () => ({ migrationRunnerDigest: 'wrong-digest' }) }), error => error?.code === 'TOOL_JOB_READBACK_REQUIRED')
  assert.equal([...mismatched.h.objects.keys()].some(uri => uri.endsWith('/migrate.json')), false)
})

 test('unsealed failed candidate is cleaned before a terminal abort can be sealed',async()=>{
  const h=recordedHarness(),{input,intentResult}=await authorizedRecordedInput(h,'UNSEALED-FAILURE')
  for(const stage of ['prepare','build','migrate'])await executeOwnerStage({...input,stage})
  const intent=(await h.transport.readJson(intentResult.ref)).value
  const control={inputFingerprint:sha256(canonicalize({ownerApplicationId:h.profile.application.id,releaseId:intent.releaseId,sourceRevision:intent.sourceRevision,releaseIntentSha256:input.capsuleSha256}))}
  const tag='candidate-'+control.inputFingerprint.slice(0,12),revision=h.profile.target.serviceName+'-'+control.inputFingerprint.slice(0,12)
  let service={...h.service(),terminalCondition:{state:'CONDITION_FAILED'},traffic:[{revision:previousRevision,percent:100},{tag,revision,percent:0}],trafficStatuses:[{revision:previousRevision,percent:100}]}
  const patches=[]
  h.transport.getService=async()=>structuredClone(service)
  h.transport.getRevision=async()=>({conditions:[{type:'Ready',state:'CONDITION_FAILED'}]})
  h.transport.patchService=async(_profile,request,mask)=>{assert.equal(mask,'traffic');assert.equal(request.etag,service.etag);patches.push(request);service={...service,etag:'cleanup-e2',traffic:request.traffic,terminalCondition:{state:'CONDITION_SUCCEEDED'}};return {operationRef:{name:'operations/exact-cleanup'}}}
  const terminal=await executeOwnerStage({...input,stage:'rollback'})
  assert.equal(patches.length,1);assert.deepEqual(patches[0].traffic,[{revision:previousRevision,percent:100}])
  assert.equal(JSON.parse((await h.transport.readBytes(terminal.ref.uri)).bytes).facts.result,'PRE_ACTIVATION_ABORTED')
  assert.equal(JSON.parse(h.objects.get('gs://'+bucket+'/control/active.json').bytes).state,'FINALIZED')
})
