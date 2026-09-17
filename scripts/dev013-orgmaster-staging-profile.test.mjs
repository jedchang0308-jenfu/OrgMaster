import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { assertTerraformPlan, buildTargetBootstrapReceipt, canonicalize, createSourceFreezeReceipt, firebasePublicConfigSha256, loadProfile, sha256, verifyCanonicalContract, verifyPlatformManifest } from './lib/dev013-orgmaster-staging-release.mjs'
import { buildSecretVersionBootstrapReceipt, createSecretVersionBootstrapPlan } from './lib/dev013-orgmaster-secret-bootstrap.mjs'
import { parseSourceFreezeArgs } from './dev013-orgmaster-source-freeze.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const profile = loadProfile()
const sourceRevision = 'a'.repeat(40)
const sourceTree = 'b'.repeat(40)
const foundation = { uri: 'gs://tfstate-jenfu-platform-nonprod/receipts/dev-010/n1c/foundation.json', sha256: 'c'.repeat(64) }
const image = `${profile.artifact.uri}@sha256:${'d'.repeat(64)}`
const firebase = { apiKey: 'public-api-key-with-at-least-twenty', appId: '1:2:web:abcDEF123', projectId: profile.target.projectId }
const secretPlan = createSecretVersionBootstrapPlan(profile)

function firstSecretVersionReceipt() {
  return buildSecretVersionBootstrapReceipt({
    plan: secretPlan,
    providerReadback: { name: `projects/123456789/secrets/${profile.secret.references.ORGMASTER_SESSION_HASH_PEPPER}/versions/1`, state: 'ENABLED' },
    source: { sourceRevision, sourceTree, clean: true },
    observedAt: '2026-09-17T00:00:00.000Z',
  }, profile)
}

function freeze(stage) {
  return createSourceFreezeReceipt({
    stage,
    sourceRevision,
    sourceTree,
    sourceCreatedAt: '2026-09-17T08:00:00+08:00',
    clean: true,
    foundationReceipt: foundation,
    runtimeImage: stage === 'OWNER_RUNTIME_B' ? image : null,
    runtimeSecretVersionReceipt: stage === 'OWNER_RUNTIME_B' ? firstSecretVersionReceipt() : null,
    firebasePublicConfigSha256: stage === 'OWNER_RUNTIME_B' ? firebasePublicConfigSha256(firebase, profile) : null,
    createdAt: '2026-09-17T00:00:00.000Z',
  }, profile)
}

function variables(receipt) {
  return Object.fromEntries(Object.entries({
    project_id: profile.target.projectId,
    region: profile.target.region,
    source_revision: receipt.sourceRevision,
    source_tree: receipt.sourceTree,
    platform_manifest_sha256: receipt.platformManifestSha256,
    canonical_contract_sha256: receipt.canonicalContractSha256,
    foundation_manifest_sha256: receipt.foundationReceipt.sha256,
    runtime_enabled: receipt.stage === 'OWNER_RUNTIME_B',
    orgmaster_image: receipt.runtimeImage,
    runtime_config_secret_version: receipt.runtimeSecretVersions?.ORGMASTER_SESSION_HASH_PEPPER?.version ?? null,
    firebase_public_config_sha256: receipt.firebasePublicConfigSha256,
    firebase_public_api_key: receipt.stage === 'OWNER_RUNTIME_B' ? firebase.apiKey : null,
    firebase_public_app_id: receipt.stage === 'OWNER_RUNTIME_B' ? firebase.appId : null,
  }).map(([name, value]) => [name, { value }]))
}

function runtimeAfter(receipt) {
  const projectNumber = '123456789'
  const publicOrigin = `https://orgmaster-stg-${projectNumber}.asia-east1.run.app`
  const brokerOrigin = `https://jenfu-platform-stg-${projectNumber}.asia-east1.run.app`
  const plain = {
    NODE_ENV: 'production', JENFU_RUNTIME_ENVIRONMENT: 'production', ORGMASTER_PERSISTENCE_MODE: 'cloud-sql', ORGMASTER_PUBLIC_BASE_URL: publicOrigin,
    ORGMASTER_POSTGRES_URL: 'postgresql://dev010-stg-orgmaster-runtime%40jenfu-platform-nonprod.iam@127.0.0.1:5432/jenfu_stg', ORGMASTER_POSTGRES_POOL_MAX: '2',
    ORGMASTER_JENFU_SSO_HANDOFF_MODE: 'off', ORGMASTER_JENFU_SSO_BROKER_ORIGIN: brokerOrigin, DEV013_L3_SOURCE_REVISION: receipt.sourceRevision,
    DEV013_L3_SOURCE_TREE: receipt.sourceTree, DEV013_L3_PLATFORM_MANIFEST_SHA256: receipt.platformManifestSha256, DEV013_L3_CANONICAL_CONTRACT_SHA256: receipt.canonicalContractSha256,
    DEV013_L3_FOUNDATION_MANIFEST_SHA256: receipt.foundationReceipt.sha256, DEV013_L3_FIREBASE_PUBLIC_CONFIG_SHA256: receipt.firebasePublicConfigSha256,
  }
  return {
    project: profile.target.projectId, location: profile.target.region, name: profile.target.serviceName, deletion_protection: true,
    ingress: profile.target.entryPolicy.ingress, default_uri_disabled: false, invoker_iam_disabled: true,
    template: [{ service_account: profile.target.runtimeServiceAccount, max_instance_request_concurrency: 20, scaling: [{ min_instance_count: 0, max_instance_count: 1 }], containers: [
      { name: 'orgmaster', image: receipt.runtimeImage, env: [...Object.entries(plain).map(([name, value]) => ({ name, value })), { name: 'ORGMASTER_SESSION_HASH_PEPPER', value_source: [{ secret_key_ref: { secret: profile.secret.references.ORGMASTER_SESSION_HASH_PEPPER, version: receipt.runtimeSecretVersions.ORGMASTER_SESSION_HASH_PEPPER.version } }] }], startup_probe: [{ http_get: [{ path: profile.runtime.startupProbePath }] }], liveness_probe: [{ http_get: [{ path: profile.runtime.livenessProbePath }] }] },
      { name: 'cloud-sql-proxy', image: profile.runtime.cloudSqlProxyImage, args: ['--private-ip', '--auto-iam-authn', '--max-connections=2', profile.target.connectionName] },
    ] }],
  }
}

function plan(receipt) {
  const gate = profile.terraform.stages[receipt.stage]
  const changes = [...gate.dataAddresses, ...gate.resourceAddresses].map((address) => ({ address, change: { actions: [address.startsWith('data.') ? 'read' : 'create'], after: address === 'google_cloud_run_v2_service.orgmaster[0]' ? runtimeAfter(receipt) : {} } }))
  return { variables: variables(receipt), resource_changes: changes }
}

test('canonical contract and Platform machine manifest hashes are exact', () => {
  const contract = verifyCanonicalContract(root, profile)
  assert.equal(contract.aggregateSha256, profile.canonicalContract.sha256)
  const bytes = fs.readFileSync(path.resolve(root, '..', 'Jenfu-Platform', 'config', 'dev-013', 'l3-managed-staging.json'))
  const manifest = verifyPlatformManifest(bytes, profile)
  assert.equal(manifest.applications.orgmaster.state.prefix, profile.state.prefix)
})

test('OWNER_INFRA_A uses the complete eight-address create/read set and no runtime inputs', () => {
  const receipt = freeze('OWNER_INFRA_A')
  assert.deepEqual(receipt.imageBuildInput.arguments, {
    SOURCE_REVISION: sourceRevision,
    SOURCE_TREE: sourceTree,
    SOURCE_CREATED_AT: '2026-09-17T08:00:00+08:00',
    SOURCE_VERSION: `dev013-l3-${sourceRevision.slice(0, 12)}`,
    SOURCE_STATE: 'clean',
  })
  assert.match(receipt.imageBuildInput.dockerfileSha256, /^[0-9a-f]{64}$/u)
  const result = assertTerraformPlan(plan(receipt), receipt, profile)
  assert.deepEqual(result, { status: 'PASS', stage: 'OWNER_INFRA_A', sourceRevision, addressCount: 8, releaseAuthority: false })
  const widened = plan(receipt)
  widened.resource_changes.push({ address: 'google_cloud_run_v2_service.orgmaster[0]', change: { actions: ['create'], after: {} } })
  assert.throws(() => assertTerraformPlan(widened, receipt, profile), /PLAN_ADDRESS_SET_MISMATCH/u)
})

test('OWNER_RUNTIME_B binds source, tree, digest, foundation, exact origins and fourteen addresses', () => {
  const receipt = freeze('OWNER_RUNTIME_B')
  assert.equal(receipt.runtimeSecretVersions.ORGMASTER_SESSION_HASH_PEPPER.version, '1')
  assert.equal(receipt.runtimeSecretVersionReceiptSha256, firstSecretVersionReceipt().receiptSha256)
  const result = assertTerraformPlan(plan(receipt), receipt, profile)
  assert.equal(result.addressCount, 14)
  assert.equal(result.runtimeImage, image)
  assert.equal(result.orgmasterOrigin, 'https://orgmaster-stg-123456789.asia-east1.run.app')
  const update = plan(receipt)
  update.resource_changes[0].change.actions = ['update']
  assert.throws(() => assertTerraformPlan(update, receipt, profile), /PLAN_ACTION_DENIED/u)
  const custom = plan(receipt)
  const service = custom.resource_changes.find((row) => row.address.includes('cloud_run'))
  service.change.after.template[0].containers[0].env.find((row) => row.name === 'ORGMASTER_JENFU_SSO_BROKER_ORIGIN').value = 'https://login.example.com'
  assert.throws(() => assertTerraformPlan(custom, receipt, profile), /RUN_APP_ORIGIN_INVALID/u)
})

test('source freeze accepts only the self-hashed first-version receipt and rejects caller versions', () => {
  const base = {
    stage: 'OWNER_RUNTIME_B', sourceRevision, sourceTree, sourceCreatedAt: '2026-09-17T08:00:00+08:00', clean: true,
    foundationReceipt: foundation, runtimeImage: image, firebasePublicConfigSha256: firebasePublicConfigSha256(firebase, profile), createdAt: '2026-09-17T00:00:00.000Z',
  }
  assert.throws(() => createSourceFreezeReceipt({ ...base, runtimeSecretVersions: { ORGMASTER_SESSION_HASH_PEPPER: { secretId: profile.secret.references.ORGMASTER_SESSION_HASH_PEPPER, version: '1' } } }, profile), /CALLER_SECRET_VERSION_DENIED/u)
  const tampered = { ...firstSecretVersionReceipt(), sourceTree: 'f'.repeat(40) }
  assert.throws(() => createSourceFreezeReceipt({ ...base, runtimeSecretVersionReceipt: tampered }, profile), /SECRET_BOOTSTRAP_RECEIPT_INVALID/u)
  assert.throws(() => parseSourceFreezeArgs(['--runtime-secret-version', '1']), /Invalid argument: --runtime-secret-version/u)
})

test('provider hard join produces the Platform-compatible target bootstrap receipt without Secret material', async () => {
  const receipt = freeze('OWNER_RUNTIME_B')
  const origin = 'https://orgmaster-stg-123456789.asia-east1.run.app'
  const broker = 'https://jenfu-platform-stg-123456789.asia-east1.run.app'
  const output = { orgmaster_staging_manifest: { value: { project_id: profile.target.projectId, region: profile.target.region, service_name: profile.target.serviceName, provider_uri: origin, expected_orgmaster_origin: origin, expected_platform_origin: broker, runtime_service_account: profile.target.runtimeServiceAccount, runtime_service_subject: '100000000000000000001', application_image: image } } }
  const service = { uri: origin, projectId: profile.target.projectId, region: profile.target.region, serviceName: profile.target.serviceName, runtimeServiceAccount: profile.target.runtimeServiceAccount, image, deletionProtection: true, minInstances: 0, maxInstances: 1, entryPolicy: profile.target.entryPolicy, labels: profile.target.requiredLabels, etag: 'etag-orgmaster-off', latestCreatedRevision: 'orgmaster-stg-dev013-off', latestReadyRevision: 'orgmaster-stg-dev013-off', traffic: [{ revision: 'orgmaster-stg-dev013-off', percent: 100, tag: null }], containers: [{ name: 'orgmaster', env: [{ name: 'ORGMASTER_PUBLIC_BASE_URL', value: origin }, { name: 'ORGMASTER_JENFU_SSO_BROKER_ORIGIN', value: broker }, { name: 'ORGMASTER_JENFU_SSO_HANDOFF_MODE', value: 'off' }, { name: 'DEV013_L3_SOURCE_REVISION', value: sourceRevision }, { name: 'DEV013_L3_SOURCE_TREE', value: sourceTree }, { name: 'ORGMASTER_SESSION_HASH_PEPPER', valueSource: { secretKeyRef: { secret: profile.secret.references.ORGMASTER_SESSION_HASH_PEPPER, version: receipt.runtimeSecretVersions.ORGMASTER_SESSION_HASH_PEPPER.version } } }] }] }
  const bootstrap = buildTargetBootstrapReceipt({ freeze: receipt, terraformOutput: output, serviceReadback: service, identityReadback: { email: profile.target.runtimeServiceAccount, uniqueId: '100000000000000000001', disabled: false }, observedAt: '2026-09-17T01:00:00.000Z' }, profile)
  assert.equal(bootstrap.status, 'TARGET_BOOTSTRAP_READY')
  assert.equal(bootstrap.runtime.ssoHandoffMode, 'off')
  assert.equal(bootstrap.target.canonicalOrigin, origin)
  assert.equal(bootstrap.boundaries.secretValueRead, false)
  assert.deepEqual(bootstrap.boundaries.secretReferences, receipt.runtimeSecretVersions)
  assert.equal(bootstrap.receiptSha256, sha256(canonicalize(Object.fromEntries(Object.entries(bootstrap).filter(([key]) => key !== 'receiptSha256')))))
  const platformValidator = await import(pathToFileURL(path.resolve(root, '..', 'Jenfu-Platform', 'scripts', 'lib', 'dev013-l3-contract.mjs')))
  const platformManifest = JSON.parse(fs.readFileSync(path.resolve(root, '..', 'Jenfu-Platform', 'config', 'dev-013', 'l3-managed-staging.json'), 'utf8'))
  assert.equal(platformValidator.assertTargetBootstrapReceipt(bootstrap, 'orgmaster', platformManifest), bootstrap)
})

test('IaC contains the exact private proxy and no migration, production, sibling or custom-domain resource', () => {
  const terraform = ['versions.tf', 'variables.tf', 'locals.tf', 'main.tf', 'outputs.tf'].map((name) => fs.readFileSync(path.join(root, profile.terraform.root, name), 'utf8')).join('\n')
  assert.match(terraform, /--private-ip/u)
  assert.match(terraform, /--auto-iam-authn/u)
  assert.match(terraform, /--max-connections=2/u)
  assert.match(terraform, /deletion_protection\s*=\s*true/u)
  assert.match(terraform, /min_instance_count\s*=\s*0/u)
  for (const forbidden of ['jenfu-platform-prod', 'ai-pdm-stg', 'google_cloud_run_v2_job', 'migration_service_account', 'org.jenfu.com.tw', 'google_dns_', 'google_firebase_hosting']) assert.doesNotMatch(terraform, new RegExp(forbidden, 'u'))
})
