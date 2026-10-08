import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { crc32cBase64 } from './lib/dev012-production-migration-runner.mjs'
import { assertControllerImageResolutionProof, assertRuntimeConfig, buildRuntimeConfig, createOwnerTransport, sha256 } from './lib/dev012-owner-release-runtime.mjs'

const H40 = 'a'.repeat(40)
const H64 = 'b'.repeat(64)
const bucket = 'jenfu-platform-prod-platform-release'
const profile = {
  application: { id: 'platform', repository: 'owner/repo', branch: 'main' },
  target: { projectId: 'jenfu-platform-prod', projectNumber: '9536592944', region: 'asia-east1', serviceName: 'jenfu-platform-prod', runtimeServiceAccount: 'platform-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com', canonicalOrigin: 'https://jenfu-platform-prod-9536592944.asia-east1.run.app', entryPolicy: { ingress: 'INGRESS_TRAFFIC_ALL', defaultUriDisabled: false, invokerIamDisabled: true } },
  runtime: { containerName: 'platform', cloudSqlProxyContainer: 'cloud-sql-proxy', cloudSqlProxyImage: `proxy@sha256:${'c'.repeat(64)}`, cloudSqlProxyPort: 5432, cloudSqlProxyMaximumConnections: 24, cloudSqlConnectionName: 'p:r:i', network: 'runtime-vpc', subnet: 'runtime-subnet', port: 8080, startupProbePath: '/ready', cpu: '1', memory: '512Mi', concurrency: 20, timeoutSeconds: 60, maxInstances: 1 },
  artifact: { releaseBucket: bucket, repository: 'platform-release', uri: 'asia-east1-docker.pkg.dev/jenfu-platform-prod/platform-release/platform' },
  identities: { builder: 'platform-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com' },
  build: { dockerBuilderImage: 'gcr.io/cloud-builders/docker@sha256:3d00b6c1a9b862621c30fc74d4f2abfc62bcbdee631ed3febd31e7edbdf6252c', dockerfile: 'Dockerfile', dockerTarget: 'runner' },
  migrations: { jobName: 'platform-prod-migration-runner', serviceAccount: 'platform-prod-migrator@jenfu-platform-prod.iam.gserviceaccount.com' },
  environment: { requiredPlainEnvironmentNames: ['NODE_ENV'], requiredSecretNames: ['SESSION_SECRET'], allowedSecretIds: { SESSION_SECRET: 'platform-prod-session-pepper' }, candidateOriginEnvironmentName: 'PORTAL_RELEASE_CANDIDATE_ORIGIN', fixedValues: { NODE_ENV: 'production' } },
}

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })

function ownerBuildFixture({ invisibleListReads = 0, unknownBuildPost = false } = {}) {
  const sourceUri = `gs://${bucket}/source/releases/R/source.tgz`
  const buildId = '5554e6a9-1c0f-48bd-877a-7f04d651915e'
  const buildsEndpoint = `https://cloudbuild.googleapis.com/v1/projects/${profile.target.projectId}/locations/${profile.target.region}/builds`
  const objects = new Map()
  const builds = new Map()
  const seen = []
  let listCalls = 0
  let buildPosts = 0
  let unknownPostThrown = false
  const fetchImpl = async (uri, options = {}) => {
    const value = new URL(String(uri))
    seen.push({ url: value.href, method: options.method ?? 'GET', body: options.body && typeof options.body === 'string' ? JSON.parse(options.body) : null })
    if (value.hostname === 'storage.googleapis.com' && value.pathname.startsWith('/upload/storage/v1/')) {
      const object = value.searchParams.get('name')
      const bytes = Buffer.from(options.body)
      const record = { bytes, metadata: { generation: '1', crc32c: crc32cBase64(bytes) } }
      objects.set(object, record)
      return json(record.metadata)
    }
    if (value.hostname === 'storage.googleapis.com' && value.pathname.startsWith('/storage/v1/')) {
      const marker = `/b/${encodeURIComponent(bucket)}/o/`
      const index = value.pathname.indexOf(marker)
      assert.notEqual(index, -1)
      const object = decodeURIComponent(value.pathname.slice(index + marker.length))
      const record = objects.get(object)
      if (!record) return json({ error: { status: 'NOT_FOUND' } }, 404)
      return value.searchParams.get('alt') === 'media' ? new Response(record.bytes) : json(record.metadata)
    }
    if (options.method !== 'POST' && value.href.startsWith(buildsEndpoint) && !value.pathname.endsWith(`/${buildId}`)) {
      listCalls += 1
      if (listCalls <= invisibleListReads) return json({ builds: [] })
      return json({ builds: [...builds.values()] })
    }
    if (value.href === buildsEndpoint && options.method === 'POST') {
      buildPosts += 1
      const request = JSON.parse(options.body)
      const build = {
        id: buildId, status: 'SUCCESS', projectId: profile.target.projectId,
        serviceAccount: request.serviceAccount, steps: request.steps, source: request.source,
        images: request.images, tags: request.tags, timeout: request.timeout, queueTtl: request.queueTtl,
        logsBucket: request.logsBucket, options: request.options,
        sourceProvenance: { resolvedStorageSource: { bucket, object: 'source/releases/R/source.tgz', generation: '9' } },
        results: { images: [{ name: request.images[0], digest: `sha256:${H64}` }] },
      }
      builds.set(buildId, build)
      if (unknownBuildPost && !unknownPostThrown) { unknownPostThrown = true; throw new Error('provider response lost') }
      return json({ name: `operations/build/${buildId}`, metadata: { build: { id: buildId } } })
    }
    if (value.href === `${buildsEndpoint}/${buildId}`) return json(builds.get(buildId))
    throw new Error(`unexpected request ${value.href}`)
  }
  return { sourceUri, buildId, buildsEndpoint, fetchImpl, seen, get buildPosts() { return buildPosts } }
}

function controllerResolutionHarness({ changeIndex = () => {}, childMediaType = 'application/vnd.oci.image.manifest.v1+json' } = {}) {
  const owner = JSON.parse(fs.readFileSync('config/release/dev040-orgmaster-independent-production-v3.json'))
  const imageUri = 'asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster-abort-controller'
  const child = { schemaVersion: 2, mediaType: childMediaType, config: { digest: 'sha256:' + 'e'.repeat(64) },
    layers: [{ digest: 'sha256:' + 'f'.repeat(64) }] }
  const childBytes = Buffer.from(JSON.stringify(child) + '\n')
  const index = { schemaVersion: 2, mediaType: 'application/vnd.oci.image.index.v1+json', manifests: [{
    digest: 'sha256:' + sha256(childBytes), mediaType: childMediaType, size: childBytes.length, platform: { os: 'linux', architecture: 'amd64' } }] }
  changeIndex(index)
  const parentBytes = Buffer.from(JSON.stringify(index) + '\n')
  const parentImage = imageUri + '@sha256:' + sha256(parentBytes), servingImage = imageUri + '@sha256:' + sha256(childBytes)
  const url = (image) => 'https://asia-east1-docker.pkg.dev/v2/jenfu-platform-prod/orgmaster-release/orgmaster-abort-controller/manifests/' + image.split('@')[1]
  const replies = new Map([[url(parentImage), { bytes: parentBytes, mediaType: index.mediaType, contentDigest: parentImage.split('@')[1] }],
    [url(servingImage), { bytes: childBytes, mediaType: child.mediaType, contentDigest: servingImage.split('@')[1] }]])
  const requests = []
  const transport = createOwnerTransport({ token: 'controller-synthetic-secret-token', fetchImpl: async (uri, options) => {
    requests.push({ uri, method: options.method, redirect: options.redirect })
    assert.equal(options.method, 'GET')
    assert.equal(options.redirect, 'error')
    const value = replies.get(uri)
    assert.ok(value, 'Only exact own parent/child manifest URLs may be requested')
    if (value.error) throw new Error('controller-synthetic-secret-token')
    return new Response(value.bytes, { status: value.status ?? 200, headers: { 'content-type': value.mediaType,
      'docker-content-digest': value.contentDigest, ...(value.status === 302 ? { location: 'https://sibling.invalid' } : {}) } })
  } })
  return { owner, parentImage, servingImage, transport, requests, replies, url }
}

test('controller immutable direct image proof needs no registry GET and rejects wrong owner/repository/tag before credentials are used', async () => {
  const h = controllerResolutionHarness()
  const proof = await h.transport.readControllerImageResolution(h.owner, h.parentImage, h.parentImage)
  assert.equal(proof.mode, 'DIRECT_DIGEST_MATCH')
  assert.equal(proof.parentManifest, null)
  assert.equal(h.requests.length, 0)
  for (const image of [h.parentImage.replace('orgmaster-release', 'platform-release'), h.parentImage.replace('orgmaster-abort-controller@', 'orgmaster@'),
    h.parentImage.replace('@sha256:', ':latest@sha256:'), h.parentImage.replace('jenfu-platform-prod/', 'jenfu-platform-nonprod/')])
    await assert.rejects(() => h.transport.readControllerImageResolution(h.owner, image, h.servingImage), /CONTROLLER_IMAGE_RESOLUTION_INVALID/u)
  await assert.rejects(() => h.transport.readControllerImageResolution({ ...h.owner, application: { ...h.owner.application, id: 'platform' } }, h.parentImage, h.servingImage), /CONTROLLER_IMAGE_RESOLUTION_INVALID/u)
  assert.equal(h.requests.length, 0)
})

test('controller OCI index proves raw parent and unique amd64 child bytes with matching registry headers and offline membership', async () => {
  const h = controllerResolutionHarness()
  const proof = await h.transport.readControllerImageResolution(h.owner, h.parentImage, h.servingImage)
  assert.equal(proof.mode, 'OCI_INDEX_LINUX_AMD64')
  assert.equal(proof.parentManifest.sha256, h.parentImage.split('@sha256:')[1])
  assert.equal(proof.childManifest.sha256, h.servingImage.split('@sha256:')[1])
  assert.equal(h.requests.length, 2)
  assert.ok(!JSON.stringify(proof).includes('controller-synthetic-secret-token'))
  assert.equal(assertControllerImageResolutionProof({ profile: h.owner, parentImage: h.parentImage, servingImage: h.servingImage, proof }), proof)
  const changed = structuredClone(proof); changed.childManifest.rawBytesBase64 = Buffer.from('different bytes').toString('base64')
  assert.throws(() => assertControllerImageResolutionProof({ profile: h.owner, parentImage: h.parentImage, servingImage: h.servingImage, proof: changed }), /CONTROLLER_IMAGE_RESOLUTION_INVALID/u)
})

test('controller registry GET rejects raw hash/header/media/redirect/transport faults without exposing credentials', async () => {
  for (const defect of ['parentHash', 'childHash', 'header', 'media', 'redirect', 'transport', 'bodySize']) {
    const h = controllerResolutionHarness()
    const parent = h.replies.get(h.url(h.parentImage)), child = h.replies.get(h.url(h.servingImage))
    if (defect === 'parentHash') parent.bytes = Buffer.from('wrong parent')
    if (defect === 'childHash') child.bytes = Buffer.from('wrong child')
    if (defect === 'header') child.contentDigest = 'sha256:' + '0'.repeat(64)
    if (defect === 'media') parent.mediaType = 'text/html'
    if (defect === 'redirect') parent.status = 302
    if (defect === 'transport') parent.error = true
    if (defect === 'bodySize') parent.bytes = Buffer.alloc(4 * 1024 * 1024 + 1)
    await assert.rejects(() => h.transport.readControllerImageResolution(h.owner, h.parentImage, h.servingImage), (error) => {
      assert.match(error.code, /^CONTROLLER_(IMAGE_RESOLUTION_INVALID|MANIFEST_READ_FAILED)$/u)
      assert.ok(!error.message.includes('controller-synthetic-secret-token'))
      return true
    })
  }
})

test('controller OCI resolution rejects wrong size, ambiguous or foreign platform descriptors, wrong child and nested index', async () => {
  for (const changeIndex of [(index) => { index.manifests[0].size++ }, (index) => { index.manifests.push({ ...index.manifests[0] }) },
    (index) => { index.manifests[0].platform.architecture = 'arm64' }, (index) => { index.manifests[0].platform.os = 'windows' },
    (index) => { index.manifests[0].platform.variant = 'unknown' }, (index) => { index.manifests[0].digest = 'sha256:' + '0'.repeat(64) }]) {
    const h = controllerResolutionHarness({ changeIndex })
    await assert.rejects(() => h.transport.readControllerImageResolution(h.owner, h.parentImage, h.servingImage), /CONTROLLER_IMAGE_RESOLUTION_INVALID/u)
  }
  const nested = controllerResolutionHarness({ childMediaType: 'application/vnd.oci.image.index.v1+json' })
  await assert.rejects(() => nested.transport.readControllerImageResolution(nested.owner, nested.parentImage, nested.servingImage), /CONTROLLER_IMAGE_RESOLUTION_INVALID/u)
})

test('production runner is pinned, non-root, and removes the unused vulnerable OS zlib', () => {
  const dockerfile = fs.readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8')
  const runtimeImage = 'gcr.io/distroless/nodejs24-debian13:nonroot-amd64@sha256:7924c53f56526359d0f491c22517306d8d92f1b285656a6094398e2c55bbaeca'
  const sanitizerImage = 'alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce'
  assert.ok(dockerfile.includes(`ARG RUNTIME_NODE_IMAGE=${runtimeImage}`))
  assert.ok(dockerfile.includes(`ARG RUNTIME_SANITIZER_IMAGE=${sanitizerImage}`))
  assert.match(dockerfile, /FROM \$\{RUNTIME_NODE_IMAGE\} AS runtime-base/u)
  assert.match(dockerfile, /FROM \$\{RUNTIME_SANITIZER_IMAGE\} AS runtime-sanitizer/u)
  assert.match(dockerfile, /\/rootfs\/usr\/lib\/x86_64-linux-gnu\/libz\.so\.1\.3\.1/u)
  assert.match(dockerfile, /\/rootfs\/var\/lib\/dpkg\/status\.d\/zlib1g\.md5sums/u)
  assert.match(dockerfile, /COPY --from=runtime-sanitizer \/rootfs \//u)
  assert.match(dockerfile, /^FROM scratch AS runner$/mu)
  assert.doesNotMatch(dockerfile, /FROM \$\{NODE_IMAGE\} AS runner/u)
  assert.match(dockerfile, /USER 65532:65532/u)
  assert.match(dockerfile, /ENTRYPOINT \["\/nodejs\/bin\/node"\]/u)
  assert.doesNotMatch(dockerfile.split('AS runner')[1] ?? '', /groupadd|useradd|\/usr\/local\/lib\/node_modules\/npm/u)
})

test('owner transport reads a generation-bound object from any explicitly allowed prefix', async () => {
  const bytes = Buffer.from('{"ok":true}\n')
  const fetchImpl = async (url) => url.includes('alt=media')
    ? new Response(bytes)
    : json({ generation: '7', crc32c: crc32cBase64(bytes) })
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl })
  const result = await transport.readBytes(`gs://${bucket}/source/releases/source.tgz`, { prefixes: ['receipts', 'source'] })
  assert.equal(result.metadata.generation, '7')
  assert.equal(result.bytes.equals(bytes), true)
})

test('Cloud Build gets the exact regional build resource, pinned builder, source generation and verified provenance', async () => {
  const fixture = ownerBuildFixture()
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: fixture.fetchImpl, sleep: async () => undefined })
  const result = await transport.createBuild({ profile, intent: { sourceRevision: H40, sourceSha256: H64, releaseId: 'REL-001' }, sourceObject: { ref: { uri: fixture.sourceUri, sha256: H64 }, metadata: { generation: '9' } }, deadlineAt: '2999-01-01T00:00:00.000Z' })
  assert.equal(result.artifactDigest, `${profile.artifact.uri}@sha256:${H64}`)
  assert.equal(fixture.seen.find(request => request.url === `${fixture.buildsEndpoint}/${fixture.buildId}`).url, 'https://cloudbuild.googleapis.com/v1/projects/jenfu-platform-prod/locations/asia-east1/builds/5554e6a9-1c0f-48bd-877a-7f04d651915e')
  const submission = fixture.seen.find(request => request.url === fixture.buildsEndpoint && request.method === 'POST').body
  assert.equal(submission.steps[0].name, profile.build.dockerBuilderImage)
  assert.equal(submission.steps[0].dir, 'source')
  assert.equal(submission.source.storageSource.generation, '9')
  assert.ok(submission.tags.some(tag => tag.startsWith('owner-build-')))
  assert.ok(submission.tags.includes('owner-submission-1'))
  assert.ok(submission.steps[0].args.includes(`SOURCE_VERSION=${H40}`))
  assert.equal(result.disposition, 'BUILT')
  assert.equal(fixture.buildPosts, 1)
})

test('an unknown Cloud Build POST outcome reads back its durable fence and never submits twice', async () => {
  const fixture = ownerBuildFixture({ invisibleListReads: 2, unknownBuildPost: true })
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: fixture.fetchImpl, sleep: async () => undefined })
  const sourceObject = { ref: { uri: fixture.sourceUri, sha256: H64 }, metadata: { generation: '9' } }
  const deadlineAt = '2999-01-01T00:00:00.000Z'
  await assert.rejects(() => transport.createBuild({ profile, intent: { sourceRevision: H40, sourceSha256: H64, releaseId: 'REL-001' }, sourceObject, deadlineAt }), error => error.code === 'OUTCOME_UNKNOWN')
  const result = await transport.createBuild({ profile, intent: { sourceRevision: H40, sourceSha256: H64, releaseId: 'REL-002' }, sourceObject, deadlineAt })
  assert.equal(result.disposition, 'REUSED_PROVIDER_BUILD')
  assert.equal(result.reused, true)
  assert.equal(fixture.buildPosts, 1)
})

test('Artifact Registry, provenance, SBOM and vulnerability evidence fail closed', async () => {
  const digest = `${profile.artifact.uri}@sha256:${H64}`
  const resourceUri = `https://${digest}`
  const rowsByKind = {
    BUILD: [{ name: 'projects/jenfu-platform-prod/occurrences/build', resourceUri, kind: 'BUILD' }],
    DISCOVERY: [{ name: 'projects/jenfu-platform-prod/locations/asia-east1/occurrences/sbom-discovery', resourceUri, kind: 'DISCOVERY', discovery: { analysisStatus: 'FINISHED_SUCCESS' } }],
    SBOM_REFERENCE: [{ name: 'projects/jenfu-platform-prod/occurrences/sbom', resourceUri, kind: 'SBOM_REFERENCE' }],
    VULNERABILITY: [{ name: 'projects/jenfu-platform-prod/occurrences/low', resourceUri, kind: 'VULNERABILITY', vulnerability: { effectiveSeverity: 'LOW' } }],
  }
  const requestedKinds = []
  let exportCalls = 0
  const fetchImpl = async (url, options = {}) => {
    const value = String(url)
    if (value.includes('/dockerImages?')) return json({ dockerImages: [{ name: 'projects/p/locations/r/repositories/x/dockerImages/platform@sha256:abc', uri: digest }] })
    if (value.endsWith(':exportSBOM') && options.method === 'POST') {
      assert.match(value, /containeranalysis\.googleapis\.com\/v1beta1\/projects\/jenfu-platform-prod\/locations\/asia-east1\/resources\//)
      assert.equal(options.body, '{}')
      exportCalls += 1
      if (exportCalls === 1) return json({ error: { status: 'INVALID_ARGUMENT' } }, 400)
      return json({ discoveryOccurrenceId: 'projects/jenfu-platform-prod/locations/asia-east1/occurrences/sbom-discovery' })
    }
    if (value.includes('/occurrences?')) {
      assert.match(value, /\/v1\/projects\/jenfu-platform-prod\/occurrences\?/u)
      const filter = new URL(value).searchParams.get('filter') ?? ''
      const match = /^kind="(BUILD|DISCOVERY|SBOM_REFERENCE|VULNERABILITY)" AND resourceUrl="([^"]+)"$/u.exec(filter)
      assert.equal(match?.[2], resourceUri)
      requestedKinds.push(match[1])
      return json({ occurrences: rowsByKind[match[1]] })
    }
    throw new Error(`unexpected ${value}`)
  }
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl, sleep: async () => undefined })
  assert.equal((await transport.readArtifactImage(profile, digest)).uri, digest)
  const evidence = await transport.waitArtifactEvidence({ profile, artifactDigest: digest, deadlineAt: '2999-01-01T00:00:00.000Z' })
  assert.equal(evidence.status, 'PASS')
  assert.equal(evidence.blockingVulnerabilityCount, 0)
  assert.equal(exportCalls, 2)
  assert.deepEqual(requestedKinds, ['BUILD', 'DISCOVERY', 'SBOM_REFERENCE', 'VULNERABILITY', 'BUILD', 'DISCOVERY', 'SBOM_REFERENCE', 'VULNERABILITY'])

  let invalidExportCalls = 0
  const invalidTransport = createOwnerTransport({ token: 'x'.repeat(32), sleep: async () => undefined, fetchImpl: async (url, options = {}) => {
    if (String(url).endsWith(':exportSBOM') && options.method === 'POST') {
      invalidExportCalls += 1
      return json({ error: { status: 'UNPROCESSABLE_ENTITY' } }, 422)
    }
    const kind = /^kind="([A-Z_]+)"/u.exec(new URL(String(url)).searchParams.get('filter') ?? '')?.[1]
    return json({ occurrences: rowsByKind[kind] ?? [] })
  } })
  await assert.rejects(() => invalidTransport.waitArtifactEvidence({ profile, artifactDigest: digest, deadlineAt: '2999-01-01T00:00:00.000Z' }), /PROVIDER_REQUEST_FAILED:422/u)
  assert.equal(invalidExportCalls, 1)

  const blockedTransport = createOwnerTransport({ token: 'x'.repeat(32), sleep: async () => undefined, fetchImpl: async (url, options = {}) => {
    if (String(url).endsWith(':exportSBOM') && options.method === 'POST') return json({ discoveryOccurrenceId: 'projects/jenfu-platform-prod/locations/asia-east1/occurrences/sbom-discovery' })
    const kind = /^kind="([A-Z_]+)"/u.exec(new URL(String(url)).searchParams.get('filter') ?? '')?.[1]
    const occurrences = kind === 'VULNERABILITY'
      ? [{ name: 'projects/jenfu-platform-prod/occurrences/critical', resourceUri, kind, vulnerability: { effectiveSeverity: 'CRITICAL' } }]
      : rowsByKind[kind] ?? []
    return json({ occurrences })
  } })
  await assert.rejects(() => blockedTransport.waitArtifactEvidence({ profile, artifactDigest: digest, deadlineAt: '2999-01-01T00:00:00.000Z' }), /ARTIFACT_POLICY_FAILED/u)
})

test('migration job readback rejects mutable target fields before jobs.run', async () => {
  const jobName = 'projects/jenfu-platform-prod/locations/asia-east1/jobs/platform-prod-migration-runner'
  const environment = {
    OWNER_APPLICATION_ID: 'platform', RELEASE_BUCKET: bucket, GOOGLE_CLOUD_PROJECT: 'jenfu-platform-prod', GOOGLE_CLOUD_REGION: 'asia-east1',
    CLOUD_SQL_INSTANCE_CONNECTION_NAME: 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg', POSTGRES_DATABASE: 'jenfu_prod',
    POSTGRES_IAM_LOGIN: 'platform-prod-migrator@jenfu-platform-prod.iam', POSTGRES_SOCKET: '/cloudsql/jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
  }
  const job = { name: jobName, template: { taskCount: 1, parallelism: 1, template: { serviceAccount: profile.migrations.serviceAccount, maxRetries: 0, timeout: '1800s', containers: [{ name: 'migration', image: `runner@sha256:${H64}`, env: Object.entries(environment).map(([name, value]) => ({ name, value })), volumeMounts: [{ name: 'cloudsql', mountPath: '/cloudsql' }] }], volumes: [{ name: 'cloudsql', cloudSqlInstance: { instances: ['jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg'] } }] } } }
  let runCalls = 0
  let listCalls = 0
  const requestedArgs = ['--bundle-ref', `gs://${bucket}/source/migration-bundles/b.json`, '--bundle-sha256', H64, '--source-revision', H40, '--output-ref', `gs://${bucket}/receipts/migrate.json`]
  const executionName = `${jobName}/executions/e1`
  const execution = { name: executionName, template: { containers: [{ name: 'migration', args: requestedArgs }] }, succeededCount: 1, failedCount: 0, completionTime: '2026-09-08T00:00:00Z', conditions: [{ type: 'Completed', state: 'CONDITION_SUCCEEDED' }] }
  const requestedUrls = []
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async (url, options = {}) => {
    requestedUrls.push(String(url))
    if (options.method === 'POST') { runCalls += 1; return json({ name: 'projects/p/locations/r/operations/run-1', done: true, response: { name: 'projects/p/locations/r/executions/e1' } }) }
    if (String(url).endsWith('/executions?pageSize=100')) return json({ executions: listCalls++ === 0 ? [] : [execution] })
    if (String(url).endsWith('/executions/e1')) return json(execution)
    return json(job)
  } })
  const deployment = { migrationRunnerDigest: `runner@sha256:${H64}`, migrationBundleRef: { uri: `gs://${bucket}/source/migration-bundles/b.json`, sha256: H64 }, sourceRevision: H40 }
  await transport.runMigrationJob({ profile, deployment, outputUri: `gs://${bucket}/receipts/migrate.json`, deadlineAt: '2999-01-01T00:00:00.000Z' })
  assert.equal(runCalls, 1)
  assert.equal(requestedUrls.some((url) => url.includes('/operations/')), false)
  const drifted = structuredClone(job)
  drifted.template.template.containers[0].env.find((row) => row.name === 'POSTGRES_DATABASE').value = 'jenfu_stg'
  const denied = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async () => json(drifted) })
  await assert.rejects(() => denied.runMigrationJob({ profile, deployment, outputUri: `gs://${bucket}/receipts/migrate.json`, deadlineAt: '2999-01-01T00:00:00.000Z' }), /MIGRATION_JOB_READBACK_MISMATCH/u)
})

test('schema migration transport rejects initialization inputs before any provider request', async () => {
  let calls = 0
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async () => { calls += 1; assert.fail('must not call provider') } })
  for (const field of ['productionDataRef', 'firstPrincipalBootstrapRef']) {
    await assert.rejects(() => transport.runMigrationJob({ profile, deployment: { [field]: { uri: 'gs://old/input.json', sha256: H64 } }, outputUri: `gs://${bucket}/receipts/migrate.json`, deadlineAt: '2999-01-01T00:00:00.000Z' }), /MIGRATION_BOOTSTRAP_INPUT_DENIED/u)
  }
  assert.equal(calls, 0)
})

test('candidate-tag cleanup distinguishes the candidate from the active rollback target', async () => {
  const before = { name: 'projects/jenfu-platform-prod/locations/asia-east1/services/jenfu-platform-prod', etag: 'e1', reconciling: false, generation: '1', observedGeneration: '1', terminalCondition: { state: 'CONDITION_SUCCEEDED' }, traffic: [{ revision: 'previous-1', percent: 100 }, { revision: 'candidate-1', percent: 0, tag: 'candidate-abc' }], trafficStatuses: [{ revision: 'previous-1', percent: 100 }, { revision: 'candidate-1', percent: 0, tag: 'candidate-abc' }] }
  const after = { ...before, etag: 'e2', traffic: [{ revision: 'previous-1', percent: 100 }], trafficStatuses: [{ revision: 'previous-1', percent: 100 }] }
  let gets = 0
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async (_url, options = {}) => {
    if (options.method === 'PATCH') return json({ name: 'projects/p/locations/r/operations/patch-1', done: true, response: {} })
    gets += 1
    return json(gets === 1 ? before : after)
  } })
  const readback = await transport.removeCandidateTag({ profile, tag: 'candidate-abc', candidateRevision: 'candidate-1', expectedActiveRevision: 'previous-1', deadlineAt: '2999-01-01T00:00:00.000Z' })
  assert.equal(transport.effectiveRevision(readback), 'previous-1')
})

test('effective revision accepts a provider-coalesced tagged status only when the explicit 100% target agrees', () => {
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async () => json({}) })
  const coalesced = {
    traffic: [
      { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: 'candidate-1', percent: 100 },
      { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: 'candidate-1', percent: 0, tag: 'candidate-abc' },
    ],
    trafficStatuses: [{ type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: 'candidate-1', percent: 100, tag: 'candidate-abc', uri: 'https://candidate.example.invalid' }],
  }
  assert.equal(transport.effectiveRevision(coalesced), 'candidate-1')
  assert.throws(() => transport.effectiveRevision({ ...coalesced, trafficStatuses: [{ revision: 'other-1', percent: 100, tag: 'candidate-abc' }] }), /EFFECTIVE_REVISION_AMBIGUOUS/u)
  assert.throws(() => transport.effectiveRevision({ ...coalesced, traffic: [{ revision: 'candidate-1', percent: 100, tag: 'candidate-abc' }] }), /EFFECTIVE_REVISION_AMBIGUOUS/u)
  assert.throws(() => transport.effectiveRevision({ ...coalesced, trafficStatuses: [{ latestRevision: true, percent: 100 }] }), /EFFECTIVE_REVISION_AMBIGUOUS/u)
})

test('Cloud Run service readback requires a reconciled successful observed generation', () => {
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async () => json({}) })
  const settled = { reconciling: false, generation: '8', observedGeneration: '8', terminalCondition: { state: 'CONDITION_SUCCEEDED' } }
  assert.equal(transport.assertServiceSettled(settled), settled)
  const omittedFalse = { ...settled }; delete omittedFalse.reconciling
  assert.equal(transport.assertServiceSettled(omittedFalse), omittedFalse)
  assert.throws(() => transport.assertServiceSettled({ ...settled, observedGeneration: '7' }), /RUN_SERVICE_NOT_SETTLED/u)
  assert.throws(() => transport.assertServiceSettled({ ...settled, terminalCondition: { state: 'CONDITION_FAILED' } }), /RUN_SERVICE_NOT_SETTLED/u)
})

test('Cloud Run revision readback stays bound to the exact service path', async () => {
  const revision = 'jenfu-platform-prod-candidate'
  const endpoint = `/services/${profile.target.serviceName}/revisions/${revision}`
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async (url) => {
    assert.equal(String(url).endsWith(endpoint), true)
    return json({ name: `projects/${profile.target.projectId}/locations/${profile.target.region}${endpoint}`, service: profile.target.serviceName })
  } })
  assert.equal((await transport.getRevision(profile, revision)).name.endsWith(`/revisions/${revision}`), true)
  await assert.rejects(() => transport.getRevision(profile, 'latest'), /REVISION_TARGET_INVALID/u)
  const artifact = `${profile.artifact.uri}@sha256:${H64}`
  const resolvedProxyImage = `proxy@sha256:${'d'.repeat(64)}`
  const ready = { containers: [{ name: 'platform', image: artifact }, { name: 'cloud-sql-proxy', image: resolvedProxyImage }], conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }] }
  assert.equal(transport.assertRevisionReady(profile, ready, artifact), ready)
  assert.equal(transport.assertRevisionReady(profile, ready, artifact, resolvedProxyImage), ready)
  assert.throws(() => transport.assertRevisionReady(profile, ready, artifact, `proxy@sha256:${'e'.repeat(64)}`), /CANDIDATE_REVISION_READBACK_MISMATCH/u)
  const wrongRepository = structuredClone(ready)
  wrongRepository.containers[1].image = `other-proxy@sha256:${'d'.repeat(64)}`
  assert.throws(() => transport.assertRevisionReady(profile, wrongRepository, artifact), /CANDIDATE_REVISION_READBACK_MISMATCH/u)
  assert.throws(() => transport.assertRevisionReady(profile, { containers: ready.containers, conditions: [] }, artifact), /CANDIDATE_REVISION_READBACK_MISMATCH/u)
})

test('runtime config carries a complete secret-safe two-container template', () => {
  const runtimeConfig = buildRuntimeConfig(profile, { plainEnvironment: { NODE_ENV: 'production' }, secretVersions: { SESSION_SECRET: '1' } })
  assert.deepEqual(assertRuntimeConfig(profile, runtimeConfig), runtimeConfig.template)
  assert.throws(() => buildRuntimeConfig(profile, { plainEnvironment: { NODE_ENV: 'development' }, secretVersions: { SESSION_SECRET: '1' } }), /RUNTIME_CONFIG_READBACK_MISMATCH/u)
  const mutable = structuredClone(runtimeConfig)
  mutable.template.containers[1].image = 'proxy:latest'
  assert.throws(() => assertRuntimeConfig(profile, mutable), /RUNTIME_CONFIG_READBACK_MISMATCH/u)
})

for (const tagFormat of ['canonical', 'provider', 'untrusted']) test(`candidate zero-traffic template and ${tagFormat} tag hostname readback`, async () => {
  const artifact = `${profile.artifact.uri}@sha256:${H64}`
  const candidateRevision = `${profile.target.serviceName}-${H64.slice(0, 12)}`
  const candidateTag = `candidate-${H64.slice(0, 12)}`
  const candidateUri = `https://${candidateTag}---jenfu-platform-prod-9536592944.asia-east1.run.app`
  const providerUri = 'https://jenfu-platform-prod-providerhash-de.a.run.app'
  const observedTagUri = tagFormat === 'canonical' ? candidateUri : tagFormat === 'provider' ? `https://${candidateTag}---${new URL(providerUri).hostname}` : `https://${candidateTag}---unrelated.run.app`
  const serviceName = `projects/${profile.target.projectId}/locations/${profile.target.region}/services/${profile.target.serviceName}`
  const settled = { name: serviceName, uri: providerUri, urls: [providerUri, profile.target.canonicalOrigin], reconciling: false, generation: '1', observedGeneration: '1', terminalCondition: { state: 'CONDITION_SUCCEEDED' } }
  const before = { ...settled, etag: 'e1', template: { serviceAccount: 'holding@example.invalid', containers: [{ name: 'holding', image: 'holding@sha256:' + '0'.repeat(64) }] }, traffic: [{ revision: 'holding-1', percent: 100 }], trafficStatuses: [{ revision: 'holding-1', percent: 100 }] }
  const created = { ...before, etag: 'e2', latestCreatedRevision: candidateRevision }
  const tagged = { ...created, etag: 'e3', traffic: [...before.traffic, { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: candidateRevision, percent: 0, tag: candidateTag }], trafficStatuses: [...before.trafficStatuses, { revision: candidateRevision, percent: 0, tag: candidateTag, uri: observedTagUri }] }
  const reads = [before, created, created, tagged, tagged]
  const patches = []
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async (url, options = {}) => {
    if (options.method === 'PATCH') { patches.push(JSON.parse(options.body)); return json({ name: `projects/${profile.target.projectId}/locations/${profile.target.region}/operations/patch-${patches.length}`, done: true, response: {} }) }
    if (String(url).includes('/revisions/')) return json({ ...structuredClone(patches[0].template), name: `${serviceName}/revisions/${candidateRevision}`, service: serviceName, conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }] })
    return json(reads.shift())
  } })
  const runtimeConfig = buildRuntimeConfig(profile, { plainEnvironment: { NODE_ENV: 'production' }, secretVersions: { SESSION_SECRET: '1' } })
  if (tagFormat === 'untrusted') {
    await assert.rejects(() => transport.createCandidate({ profile, artifactDigest: artifact, runtimeConfig, fingerprint: H64, deadlineAt: '2999-01-01T00:00:00.000Z' }), /CANDIDATE_TAG_READBACK_MISMATCH/)
    return
  }
  const result = await transport.createCandidate({ profile, artifactDigest: artifact, runtimeConfig, fingerprint: H64, deadlineAt: '2999-01-01T00:00:00.000Z' })
  assert.equal(result.tagUri, candidateUri)
  assert.equal(result.previousRevision, 'holding-1')
  assert.equal(patches[0].template.containers.find((row) => row.name === 'platform').image, artifact)
  assert.equal(patches[0].template.containers.length, 2)
  assert.deepEqual(patches[1].traffic.filter((row) => !row.tag), before.traffic)
})

test('candidate accepts an omitted provider tag URI only while the default URI is disabled', async () => {
  const fingerprint = H64
  const candidateRevision = `jenfu-platform-prod-${fingerprint.slice(0, 12)}`
  const tag = `candidate-${fingerprint.slice(0, 12)}`
  const tagUri = `https://${tag}---jenfu-platform-prod-9536592944.asia-east1.run.app`
  const artifactDigest = `${profile.artifact.uri}@sha256:${H64}`
  const settled = { reconciling: false, generation: '1', observedGeneration: '1', terminalCondition: { state: 'CONDITION_SUCCEEDED' } }
  const before = { ...settled, name: `projects/${profile.target.projectId}/locations/${profile.target.region}/services/${profile.target.serviceName}`, etag: 'e1', defaultUriDisabled: true, template: { serviceAccount: profile.target.runtimeServiceAccount, containers: [{ image: 'old@sha256:' + H64, env: [{ name: 'KEEP', value: 'yes' }] }] }, traffic: [{ revision: 'previous-1', percent: 100 }], trafficStatuses: [{ revision: 'previous-1', percent: 100 }] }
  const runtimeConfig = buildRuntimeConfig(profile, { plainEnvironment: { NODE_ENV: 'production' }, secretVersions: { SESSION_SECRET: '1' } })
  const expectedTemplate = structuredClone(runtimeConfig.template)
  expectedTemplate.revision = candidateRevision
  const expectedApp = expectedTemplate.containers.find((container) => container.name === profile.runtime.containerName)
  expectedApp.image = artifactDigest
  expectedApp.env.push({ name: profile.environment.candidateOriginEnvironmentName, value: tagUri })
  const created = { ...before, generation: '2', observedGeneration: '2', etag: 'e2', template: expectedTemplate, latestCreatedRevision: candidateRevision }
  const tagged = { ...created, generation: '3', observedGeneration: '3', etag: 'e3', traffic: [...before.traffic, { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: candidateRevision, tag }], trafficStatuses: [...before.trafficStatuses, { revision: candidateRevision, tag }] }
  let serviceGets = 0
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async (url, options = {}) => {
    const value = String(url)
    if (options.method === 'PATCH') {
      const body = JSON.parse(options.body)
      if (value.includes('updateMask=template')) assert.deepEqual(body.template, expectedTemplate)
      return json({ name: 'projects/p/locations/r/operations/patch', done: true, response: {} })
    }
    if (value.includes('/revisions/')) return json({ ...structuredClone(expectedTemplate), name: `${before.name}/revisions/${candidateRevision}`, service: before.name, conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }] })
    return json([before, created, created, tagged, tagged][serviceGets++])
  } })
  const result = await transport.createCandidate({ profile, artifactDigest, runtimeConfig, fingerprint, deadlineAt: '2999-01-01T00:00:00.000Z' })
  assert.equal(result.tagUri, tagUri)
  assert.equal(result.previousRevision, 'previous-1')
})

test('entrypoint patch uses the exact mask, preserves template/traffic, and unknown outcome is read back once', async () => {
  const tag = 'candidate-bbbbbbbbbbbb'
  const tagUri = `https://${tag}---jenfu-platform-prod-9536592944.asia-east1.run.app`
  const base = { name: `projects/${profile.target.projectId}/locations/${profile.target.region}/services/${profile.target.serviceName}`, etag: 'e1', reconciling: false, generation: '1', observedGeneration: '1', terminalCondition: { state: 'CONDITION_SUCCEEDED' }, ingress: 'INGRESS_TRAFFIC_INTERNAL_ONLY', defaultUriDisabled: true, invokerIamDisabled: false, uri: null, urls: [], template: { containers: [{ image: 'old' }] }, traffic: [{ revision: 'previous-1', percent: 100 }, { revision: 'candidate-1', percent: 0, tag }], trafficStatuses: [{ revision: 'previous-1', percent: 100 }, { revision: 'candidate-1', percent: 0, tag }] }
  const providerUri = 'https://jenfu-platform-prod-provider-de.a.run.app'
  const direct = { ...base, etag: 'e2', generation: '2', observedGeneration: '2', ingress: 'INGRESS_TRAFFIC_ALL', defaultUriDisabled: undefined, invokerIamDisabled: true, uri: providerUri, urls: [profile.target.canonicalOrigin, providerUri], trafficStatuses: base.trafficStatuses.map((row) => row.tag === tag ? { ...row, uri: tagUri } : row) }
  let gets = 0
  let patchCalls = 0
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async (url, options = {}) => {
    if (options.method === 'PATCH') {
      patchCalls += 1
      assert.match(String(url), /updateMask=ingress%2CdefaultUriDisabled%2CinvokerIamDisabled/u)
      assert.deepEqual(Object.keys(JSON.parse(options.body)).sort(), ['defaultUriDisabled', 'etag', 'ingress', 'invokerIamDisabled', 'name'])
      throw new TypeError('recorded timeout')
    }
    return json(gets++ === 0 ? base : direct)
  } })
  const result = await transport.configureEntrypoint({ profile, candidate: { candidateRevision: 'candidate-1', tag, tagUri }, previousRevision: 'previous-1', deadlineAt: '2999-01-01T00:00:00.000Z' })
  assert.equal(result.changed, true)
  assert.equal(result.templateSha256Before, result.templateSha256After)
  assert.equal(result.trafficSha256Before, result.trafficSha256After)
  assert.equal(result.providerOperationRef.name, 'OUTCOME_UNKNOWN_READBACK_CONFIRMED')
  assert.equal(patchCalls, 1)

  const noOp = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async () => json(direct) })
  assert.equal((await noOp.configureEntrypoint({ profile, candidate: { candidateRevision: 'candidate-1', tag, tagUri }, previousRevision: 'previous-1', deadlineAt: '2999-01-01T00:00:00.000Z' })).changed, false)
  const providerAlias = { ...direct, trafficStatuses: direct.trafficStatuses.map((row) => row.tag === tag ? { ...row, uri: `https://${tag}---${new URL(providerUri).hostname}` } : row) }
  const aliasTransport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async () => json(providerAlias) })
  assert.equal((await aliasTransport.configureEntrypoint({ profile, candidate: { candidateRevision: 'candidate-1', tag, tagUri }, previousRevision: 'previous-1', deadlineAt: '2999-01-01T00:00:00.000Z' })).changed, false)
  providerAlias.trafficStatuses.find((row) => row.tag === tag).uri = `https://${tag}---unrelated.run.app`
  await assert.rejects(() => aliasTransport.configureEntrypoint({ profile, candidate: { candidateRevision: 'candidate-1', tag, tagUri }, previousRevision: 'previous-1', deadlineAt: '2999-01-01T00:00:00.000Z' }), /ENTRYPOINT_CANDIDATE_JOIN_INVALID/)
})

test('entrypoint recovery covers pre-patch, 412, candidate-live and already-direct baselines', async () => {
  const tag = 'candidate-cccccccccccc'
  const tagUri = `https://${tag}---jenfu-platform-prod-9536592944.asia-east1.run.app`
  const baseline = {
    name: `projects/${profile.target.projectId}/locations/${profile.target.region}/services/${profile.target.serviceName}`,
    etag: 'e1', reconciling: false, generation: '1', observedGeneration: '1',
    terminalCondition: { state: 'CONDITION_SUCCEEDED' },
    ingress: 'INGRESS_TRAFFIC_INTERNAL_ONLY', defaultUriDisabled: true, invokerIamDisabled: false, uri: null, urls: [],
    template: { containers: [{ image: 'old' }] },
    traffic: [{ revision: 'previous-1', percent: 100 }, { revision: 'candidate-1', percent: 0, tag }],
    trafficStatuses: [{ revision: 'previous-1', percent: 100 }, { revision: 'candidate-1', percent: 0, tag, uri: tagUri }],
  }
  const providerUri = 'https://jenfu-platform-prod-provider-de.a.run.app'
  const direct = { ...baseline, etag: 'e2', generation: '2', observedGeneration: '2', ingress: 'INGRESS_TRAFFIC_ALL', defaultUriDisabled: undefined, invokerIamDisabled: true, uri: providerUri, urls: [profile.target.canonicalOrigin, providerUri] }

  let prePatchCalls = 0
  const prePatch = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async (_url, options = {}) => {
    if (options.method === 'PATCH') prePatchCalls += 1
    return json(baseline)
  } })
  await assert.rejects(prePatch.configureEntrypoint({ profile, candidate: { candidateRevision: 'candidate-1', tag: 'candidate-dddddddddddd', tagUri }, previousRevision: 'previous-1', deadlineAt: '2999-01-01T00:00:00.000Z' }), /ENTRYPOINT_CANDIDATE_JOIN_INVALID/u)
  assert.equal(prePatchCalls, 0)

  let conflictPatchCalls = 0
  const conflict = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async (_url, options = {}) => {
    if (options.method === 'PATCH') { conflictPatchCalls += 1; return json({ error: { code: 412 } }, 412) }
    return json(baseline)
  } })
  await assert.rejects(conflict.configureEntrypoint({ profile, candidate: { candidateRevision: 'candidate-1', tag, tagUri }, previousRevision: 'previous-1', deadlineAt: '2999-01-01T00:00:00.000Z' }), /CONFLICT/u)
  assert.equal(conflictPatchCalls, 1)

  let restoreGets = 0
  let restorePatches = 0
  const restoredService = { ...baseline, etag: 'e3', generation: '3', observedGeneration: '3' }
  const restore = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async (_url, options = {}) => {
    if (options.method === 'PATCH') {
      restorePatches += 1
      const body = JSON.parse(options.body)
      assert.deepEqual({ ingress: body.ingress, defaultUriDisabled: body.defaultUriDisabled, invokerIamDisabled: body.invokerIamDisabled }, { ingress: baseline.ingress, defaultUriDisabled: baseline.defaultUriDisabled, invokerIamDisabled: baseline.invokerIamDisabled })
      return json({ name: 'projects/p/locations/r/operations/restore', done: true, response: {} })
    }
    return json(restoreGets++ === 0 ? direct : restoredService)
  } })
  const restored = await restore.restoreEntrypoint({ profile, baseline: restore.entrypointSnapshot(baseline), deadlineAt: '2999-01-01T00:00:00.000Z' })
  assert.equal(restored.changed, true)
  assert.equal(restorePatches, 1)
  assert.equal(restored.after.ingress, baseline.ingress)

  let alreadyDirectPatches = 0
  const alreadyDirect = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async (_url, options = {}) => {
    if (options.method === 'PATCH') alreadyDirectPatches += 1
    return json(direct)
  } })
  const noChange = await alreadyDirect.restoreEntrypoint({ profile, baseline: alreadyDirect.entrypointSnapshot(direct), deadlineAt: '2999-01-01T00:00:00.000Z' })
  assert.equal(noChange.changed, false)
  assert.equal(alreadyDirectPatches, 0)
})

test('authenticated smoke refreshes a short-lived Firebase ID token without exposing it', async () => {
  let meCalls = 0
  let refreshAuthorization
  const idToken = 'header.payload.' + 'x'.repeat(120)
  const fetchImpl = async (url, options = {}) => {
    const value = String(url)
    if (value.startsWith('https://securetoken.googleapis.com/')) {
      refreshAuthorization = options.headers?.authorization
      assert.match(String(options.body), /grant_type=refresh_token/u)
      return json({ id_token: idToken, expires_in: '3600', user_id: 'smoke-user' })
    }
    const path = new URL(value).pathname
    if (path === '/api/auth/firebase/session') return new Response('{}', { status: 200, headers: { 'set-cookie': 'jenfu_session=opaque; Secure; HttpOnly; SameSite=Lax' } })
    if (path === '/api/auth/me') { meCalls += 1; return json({}, meCalls === 1 ? 200 : 401) }
    if (path === '/api/auth/logout' || path === '/api/auth/mode' || path === '/api/data') return json({})
    if (path === '/api/private') return json({}, 401)
    throw new Error('unexpected ' + value)
  }
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl })
  const smokeProfile = {
    verification: {
      refreshTokenEnvironmentName: 'FIREBASE_REFRESH_TOKEN',
      firebaseApiKeyEnvironmentName: 'FIREBASE_API_KEY',
      authModePath: '/api/auth/mode', sessionPath: '/api/auth/firebase/session', mePath: '/api/auth/me', logoutPath: '/api/auth/logout',
      authenticatedProbes: [{ id: 'database-read', path: '/api/data', expectedStatus: 200 }],
      negativeProbes: [{ id: 'unauthenticated', path: '/api/private', expectedStatus: 401 }],
    },
  }
  const result = await transport.runAuthenticatedSmoke({ profile: smokeProfile, origin: 'https://candidate.example.test', environment: { FIREBASE_REFRESH_TOKEN: 'r'.repeat(80), FIREBASE_API_KEY: 'A'.repeat(39) } })
  assert.equal(result.status, 'PASS')
  assert.equal(result.tokenSource, 'FIREBASE_REFRESH_TOKEN')
  assert.equal(refreshAuthorization, undefined)
  assert.doesNotMatch(JSON.stringify(result), /header\.payload/u)
})


test('internal candidate smoke executes only the app-owned Workflow and returns redacted proof', async () => {
  const tag = 'candidate-' + 'a'.repeat(12)
  const revision = 'jenfu-platform-prod-' + 'a'.repeat(12)
  const digest = 'asia-east1-docker.pkg.dev/jenfu-platform-prod/platform-release/platform@sha256:' + H64
  const workflow = 'projects/jenfu-platform-prod/locations/asia-east1/workflows/platform-prod-candidate-smoke'
  const canonicalWorkflow = 'projects/9536592944/locations/asia-east1/workflows/platform-prod-candidate-smoke'
  const executionName = canonicalWorkflow + '/executions/execution-1'
  let createBody
  const result = {
    schemaVersion: 'jenfu.dev012.internal-candidate-smoke.v1',
    ownerApplicationId: 'platform',
    candidateRevision: revision,
    artifactDigest: digest,
    tokenSource: 'SECRET_MANAGER_EXACT_VERSION',
    tokenExpiresInSeconds: '3600',
    observations: [
      { id: 'auth-mode', status: 200 },
      { id: 'session-create', status: 200 },
      { id: 'session-reload', status: 200 },
      { id: 'authenticated-probe', status: 200 },
      { id: 'unauthenticated-probe', status: 401 },
      { id: 'session-revoked', status: 401 },
    ],
    status: 'PASS',
  }
  const fetchImpl = async (url, options = {}) => {
    if (String(url).startsWith('https://run.googleapis.com/v2/projects/jenfu-platform-prod/locations/asia-east1/services/jenfu-platform-prod')) {
      return json({ uri: 'https://jenfu-platform-prod-abc-de.a.run.app' })
    }
    if (options.method === 'POST') {
      createBody = JSON.parse(options.body)
      return json({ name: executionName, state: 'ACTIVE' })
    }
    assert.equal(String(url), 'https://workflowexecutions.googleapis.com/v1/' + executionName)
    return json({ name: executionName, state: 'SUCCEEDED', result: JSON.stringify(result) })
  }
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl, sleep: async () => undefined })
  const smokeProfile = {
    application: { id: 'platform' },
    target: { projectId: 'jenfu-platform-prod', projectNumber: '9536592944', region: 'asia-east1', serviceName: 'jenfu-platform-prod', canonicalOrigin: 'https://jenfu-platform-prod-9536592944.asia-east1.run.app' },
    artifact: { uri: 'asia-east1-docker.pkg.dev/jenfu-platform-prod/platform-release/platform' },
    verification: {
      firebaseApiKeyEnvironmentName: 'FIREBASE_API_KEY',
      candidateSmokeMode: 'WORKFLOWS_INTERNAL_OIDC_V1',
      candidateWorkflowName: 'platform-prod-candidate-smoke',
      candidateRefreshTokenSecretId: 'platform-prod-smoke-firebase-refresh-token',
    },
  }
  const smoke = await transport.runInternalCandidateSmoke({
    profile: smokeProfile,
    origin: 'https://' + tag + '---jenfu-platform-prod-9536592944.asia-east1.run.app',
    candidateTag: tag,
    candidateRevision: revision,
    artifactDigest: digest,
    deadlineAt: '2999-01-01T00:00:00.000Z',
    environment: { FIREBASE_API_KEY: 'A'.repeat(39) },
  })
  assert.equal(smoke.status, 'PASS')
  assert.equal(smoke.executionName, executionName)
  assert.equal(JSON.parse(createBody.argument).candidateRevision, revision)
  assert.equal(JSON.parse(createBody.argument).candidateOrigin, 'https://' + tag + '---jenfu-platform-prod-abc-de.a.run.app')
  assert.doesNotMatch(JSON.stringify(smoke), /firebaseApiKey|refreshToken|idToken|sessionCookie/u)
})

test('OrgMaster candidate smoke requires the governance allow and deny observations', async () => {
  const tag = 'candidate-' + 'a'.repeat(12)
  const revision = 'orgmaster-prod-' + 'a'.repeat(12)
  const digest = 'asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster@sha256:' + H64
  const executionName = 'projects/9536592944/locations/asia-east1/workflows/orgmaster-prod-candidate-smoke/executions/execution-1'
  const observations = [
    ['auth-mode', 200], ['platform-principal-session', 200],
    ['orgmaster-sso-start', 303], ['orgmaster-sso-authorize', 303], ['orgmaster-sso-callback', 303],
    ['session-reload', 200], ['authenticated-probe', 200], ['governance-session', 200],
    ['managed-identity-read', 200], ['governance-unauthenticated', 401],
    ['managed-identity-unauthenticated', 401], ['unauthenticated-probe', 401],
    ['session-revoked', 401],
  ].map(([id, status]) => ({ id, status }))
  const result = {
    schemaVersion: 'jenfu.dev015.internal-candidate-principal-smoke.v2',
    ownerApplicationId: 'orgmaster', candidateRevision: revision,
    artifactDigest: digest, tokenSource: 'SECRET_MANAGER_EXACT_VERSION',
    observations, status: 'PASS',
  }
  const fetchImpl = async (url, options = {}) => {
    if (String(url).startsWith('https://run.googleapis.com/v2/projects/jenfu-platform-prod/locations/asia-east1/services/orgmaster-prod')) {
      return json({ uri: 'https://orgmaster-prod-abc-de.a.run.app' })
    }
    if (options.method === 'POST') return json({ name: executionName, state: 'ACTIVE' })
    assert.equal(String(url), 'https://workflowexecutions.googleapis.com/v1/' + executionName)
    return json({ name: executionName, state: 'SUCCEEDED', result: JSON.stringify(result) })
  }
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl, sleep: async () => undefined })
  const profile = {
    application: { id: 'orgmaster' },
    target: { projectId: 'jenfu-platform-prod', projectNumber: '9536592944', region: 'asia-east1', serviceName: 'orgmaster-prod', canonicalOrigin: 'https://orgmaster-prod-9536592944.asia-east1.run.app' },
    artifact: { uri: 'asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster' },
    verification: { firebaseApiKeyEnvironmentName: 'FIREBASE_API_KEY', candidateSmokeMode: 'WORKFLOWS_INTERNAL_OIDC_V2_PRINCIPAL_SSO', candidateWorkflowName: 'orgmaster-prod-candidate-smoke', candidateRefreshTokenSecretId: 'orgmaster-prod-smoke-firebase-refresh-token' },
  }
  const input = { profile, origin: 'https://' + tag + '---orgmaster-prod-9536592944.asia-east1.run.app', candidateTag: tag, candidateRevision: revision, artifactDigest: digest, deadlineAt: '2999-01-01T00:00:00.000Z', environment: { FIREBASE_API_KEY: 'A'.repeat(39) } }
  assert.equal((await transport.runInternalCandidateSmoke(input)).observations.length, 13)
  result.observations = observations.filter((row) => row.id !== 'managed-identity-unauthenticated')
  await assert.rejects(() => transport.runInternalCandidateSmoke(input), /INTERNAL_CANDIDATE_SMOKE_RESULT_INVALID/u)
  result.observations = observations.map((row) => row.id === 'managed-identity-unauthenticated' ? { ...row, status: 200 } : row)
  await assert.rejects(() => transport.runInternalCandidateSmoke(input), /INTERNAL_CANDIDATE_SMOKE_RESULT_INVALID/u)
})


test('legacy one-field endpoint mutations are not exposed by the V3 transport', () => {
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async () => json({}) })
  assert.equal(transport.prepareCandidateEndpoint, undefined)
  assert.equal(transport.enableCanonicalIngress, undefined)
})

test('candidate readback verifies exact workload environment, Secret versions and absence of loader overrides', () => {
  const runtimeConfig = buildRuntimeConfig(profile, { plainEnvironment: { NODE_ENV: 'production' }, secretVersions: { SESSION_SECRET: '1' } })
  const artifact = profile.artifact.uri + '@sha256:' + H64
  const origin = 'https://candidate-bbbbbbbbbbbb---jenfu-platform-prod-9536592944.asia-east1.run.app'
  const expected = structuredClone(runtimeConfig.template)
  expected.containers[0].image = artifact
  expected.containers[0].env.push({ name: profile.environment.candidateOriginEnvironmentName, value: origin })
  const ready = { ...expected, conditions: [{ type:'Ready',state:'CONDITION_SUCCEEDED' }] }
  const transport = createOwnerTransport({ token:'x'.repeat(32) })
  const binding = { runtimeConfig, origin }
  assert.equal(transport.assertRevisionReady(profile, ready, artifact, null, binding), ready)
  const reordered = structuredClone(ready)
  reordered.containers.reverse()
  reordered.containers.find(row => row.name === profile.runtime.containerName).env.reverse()
  assert.equal(transport.assertRevisionReady(profile, reordered, artifact, null, binding), reordered)
  const qualified = structuredClone(ready)
  qualified.containers[0].env.find(row => row.valueSource).valueSource.secretKeyRef.secret = 'projects/' + profile.target.projectNumber + '/secrets/' + profile.environment.allowedSecretIds.SESSION_SECRET
  assert.equal(transport.assertRevisionReady(profile, qualified, artifact, null, binding), qualified)
  const changes = [
    row => row.containers[0].env.push({name:'LD_PRELOAD',value:'/tmp/untrusted.so'}),
    row => row.containers[0].env.push({name:'NODE_OPTIONS',value:'--require=/tmp/untrusted.cjs'}),
    row => row.containers[0].env.pop(),
    row => row.containers[0].env.push(row.containers[0].env[0]),
    row => { row.containers[0].env.find(value => value.valueSource).valueSource.secretKeyRef.version = 'latest' },
    row => { row.containers[0].env.find(value => value.valueSource).valueSource.secretKeyRef.secret = 'orgmaster-prod-session-current' },
    row => { row.containers[0].command = ['/untrusted'] },
    row => { row.containers[0].args = ['--require=/tmp/untrusted.cjs'] },
    row => { row.containers[1].args = ['--unsafe'] },
    row => { row.containers[0].volumeMounts = [{name:'extra',mountPath:'/app'}] },
    row => { row.volumes = [{name:'extra',emptyDir:{}}] },
    row => { row.serviceAccount = 'orgmaster-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com' },
  ]
  for (const change of changes) {
    const drifted = structuredClone(ready)
    change(drifted)
    assert.throws(() => transport.assertRevisionReady(profile, drifted, artifact, null, binding), { code:'CANDIDATE_RUNTIME_READBACK_MISMATCH' })
  }
})

test('runtime config cannot inject alternate native loaders through plain or Secret bindings', () => {
  for (const name of ['LD_PRELOAD', 'LD_LIBRARY_PATH', 'LD_AUDIT', 'NODE_OPTIONS', 'NODE_PATH', 'GLIBC_TUNABLES', 'GCONV_PATH', 'VIPS_PATH', 'SHARP_FORCE_GLOBAL_LIBVIPS']) {
    for (const kind of ['plain', 'secret']) {
      const changed = structuredClone(profile)
      const plainEnvironment = { NODE_ENV: 'production' }
      const secretVersions = { SESSION_SECRET: '1' }
      if (kind === 'plain') {
        changed.environment.requiredPlainEnvironmentNames.push(name)
        plainEnvironment[name] = '/unreviewed/loader.so'
      } else {
        changed.environment.requiredSecretNames.push(name)
        changed.environment.allowedSecretIds[name] = 'platform-prod-injected-loader'
        secretVersions[name] = '1'
      }
      assert.throws(() => buildRuntimeConfig(changed, { plainEnvironment, secretVersions }), /RUNTIME_CONFIG_READBACK_MISMATCH/u)
    }
  }
})

test('aligned-new assessment requires source identity; unrelated or escalated scanner findings still reject before inspection', async () => {
  const digest = `${profile.artifact.uri}@sha256:${H64}`
  const occurrence = { name: 'projects/jenfu-platform-prod/occurrences/aligned-new', resourceUri: `https://${digest}`, kind: 'VULNERABILITY', noteName: 'projects/goog-vulnz/notes/CVE-2026-95619', vulnerability: { effectiveSeverity: 'HIGH', shortDescription: 'CVE-2026-95619', packageIssue: [{ affectedPackage: 'gcc-14', packageType: 'OS', affectedCpeUri: 'cpe:/o:debian:debian_linux:13', affectedVersion: { fullName: '14.2.0-19' } }] } }
  let writes = 0
  const make = (finding) => createOwnerTransport({ token: 'x'.repeat(32), sleep: async () => undefined, fetchImpl: async (url, options = {}) => {
    if (options.method === 'POST') { writes += 1; throw new Error('UNEXPECTED_WRITE') }
    const kind = /^kind="([A-Z_]+)"/u.exec(new URL(String(url)).searchParams.get('filter') ?? '')?.[1]
    return json({ occurrences: kind === 'VULNERABILITY' ? [finding] : kind === 'DISCOVERY' ? [{ kind, resourceUri: `https://${digest}`, discovery: { analysisStatus: 'FINISHED_SUCCESS' } }] : [] })
  } })
  await assert.rejects(() => make(occurrence).waitArtifactEvidence({ profile, artifactDigest: digest, deadlineAt: '2999-01-01T00:00:00.000Z' }), /ARTIFACT_POLICY_FAILED/u)
  for (const mutate of [
    row => row.vulnerability.effectiveSeverity = 'CRITICAL',
    row => row.noteName = 'projects/goog-vulnz/notes/CVE-OTHER',
    row => row.vulnerability.packageIssue[0].affectedPackage = 'unrelated-package',
    row => row.vulnerability.packageIssue[0].affectedVersion.fullName = '14.2.0-20',
  ]) {
    const changed = structuredClone(occurrence); mutate(changed)
    await assert.rejects(() => make(changed).waitArtifactEvidence({ profile, sourceRevision: H40, artifactDigest: digest, deadlineAt: '2999-01-01T00:00:00.000Z' }), /ARTIFACT_POLICY_FAILED/u)
  }
  assert.equal(writes, 0)
})
