import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
export const projectRoot = path.resolve(moduleDir, '..', '..')
export const profilePath = path.join(projectRoot, 'config', 'dev-013', 'l3-orgmaster-staging.json')

const H40 = /^[0-9a-f]{40}$/u
const H64 = /^[0-9a-f]{64}$/u
const IMAGE = /^asia-east1-docker[.]pkg[.]dev\/jenfu-platform-nonprod\/dev013-orgmaster-staging\/orgmaster@sha256:[0-9a-f]{64}$/u
const UNIQUE_ID = /^[0-9]{8,32}$/u
const STAGES = new Set(['OWNER_INFRA_A', 'OWNER_RUNTIME_B'])
const SESSION_SECRET_ENV = 'ORGMASTER_SESSION_HASH_PEPPER'

export class Dev013OrgmasterError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code)
    this.code = code
  }
}

function fail(code, detail = '') {
  throw new Dev013OrgmasterError(code, detail)
}

function object(value, code, detail) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, detail)
  return value
}

export function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function receiptHash(value) {
  const core = { ...value }
  delete core.receiptSha256
  return sha256(canonicalize(core))
}

function planHash(value) {
  const core = { ...value }
  delete core.planSha256
  return sha256(canonicalize(core))
}

function exactRunAppOrigin(value, serviceName, region = 'asia-east1', numericProject = false) {
  let parsed
  try { parsed = new URL(value) } catch { fail('DEV013_ORGMASTER_RUN_APP_ORIGIN_INVALID', `${serviceName}:parse`) }
  const suffix = `.${region}.run.app`
  const prefix = `${serviceName}-`
  const projectPart = parsed.hostname.endsWith(suffix) && parsed.hostname.startsWith(prefix)
    ? parsed.hostname.slice(prefix.length, -suffix.length)
    : ''
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash || !projectPart || (numericProject && !/^[0-9]+$/u.test(projectPart))) fail('DEV013_ORGMASTER_RUN_APP_ORIGIN_INVALID', `${serviceName}:${value}`)
  return parsed.origin
}

export function assertProfile(profile) {
  object(profile, 'DEV013_ORGMASTER_PROFILE_INVALID', 'root')
  if (profile.schemaVersion !== 'jenfu.dev013.orgmaster-staging-release.v2' || profile.devId !== 'DEV-013' || profile.slice !== '013-S4-L3-ORGMASTER-ENV' || profile.status !== 'READY_FOR_NONPROD_APPLY' || profile.releaseAuthority !== false) fail('DEV013_ORGMASTER_PROFILE_IDENTITY_INVALID')
  if (profile.platformManifest?.sha256 !== 'bc51a29b28a34a6316f41e3a2cfb0bc399c07befc8fc61334014f24627bae30d' || profile.platformManifest.schemaVersion !== 'jenfu.dev013.l3-managed-staging.v2' || profile.canonicalContract?.sha256 !== 'e6307a6a1ab9ddfc15f918992d640b625fcd70a688c52e8ce712489d9ff86483') fail('DEV013_ORGMASTER_CONTRACT_HASH_INVALID')
  const target = profile.target
  if (target?.projectId !== 'jenfu-platform-nonprod' || target.projectNumber !== '1055054506544' || target.region !== 'asia-east1' || target.serviceName !== 'orgmaster-stg' || target.cloudSqlInstance !== 'jenfu-platform-nonprod-pg' || target.database !== 'jenfu_stg' || target.connectionName !== 'jenfu-platform-nonprod:asia-east1:jenfu-platform-nonprod-pg' || target.runtimeServiceAccount !== 'dev010-stg-orgmaster-runtime@jenfu-platform-nonprod.iam.gserviceaccount.com') fail('DEV013_ORGMASTER_TARGET_INVALID')
  if (profile.state?.bucket !== 'tfstate-jenfu-platform-nonprod' || profile.state?.prefix !== 'dev-013/orgmaster-staging' || profile.artifact?.uri !== 'asia-east1-docker.pkg.dev/jenfu-platform-nonprod/dev013-orgmaster-staging/orgmaster' || profile.artifact?.dockerfile !== 'Dockerfile' || profile.artifact?.sourceFreeze?.contextAuthority !== 'EXACT_GIT_TREE_AT_SOURCE_REVISION' || profile.artifact.sourceFreeze.dockerfileSha256Required !== true || profile.artifact.sourceFreeze.sourceCreatedAtAuthority !== 'GIT_COMMITTER_DATE_ISO_8601' || profile.artifact.sourceFreeze.sourceVersionRule !== 'dev013-l3 plus first 12 hexadecimal characters of source revision' || profile.artifact.sourceFreeze.sourceState !== 'clean' || canonicalize(profile.secret?.references) !== canonicalize({ [SESSION_SECRET_ENV]: 'dev010-stg-orgmaster-runtime-config' }) || canonicalize(profile.secret?.versionBootstrap) !== canonicalize({ mode: 'OWNER_GENERATED_IF_EMPTY', minimumEntropyBytes: 64 }) || profile.secret?.numericVersionRequired !== true || profile.secret?.payloadMayAppearInEvidence !== false) fail('DEV013_ORGMASTER_BOUNDARY_INVALID')
  const runtime = profile.runtime
  if (runtime?.minInstances !== 0 || runtime.maxInstances !== 1 || runtime.databasePoolMax !== 2 || runtime.deletionProtection !== true || runtime.initialSsoMode !== 'off' || runtime.network !== 'jenfu-platform-nonprod-vpc' || runtime.subnetwork !== 'jenfu-platform-nonprod-qc' || runtime.cloudSqlProxyMaximumConnections !== 2 || !String(runtime.cloudSqlProxyImage).includes('@sha256:')) fail('DEV013_ORGMASTER_RUNTIME_INVALID')
  for (const stage of STAGES) {
    const gate = profile.terraform?.stages?.[stage]
    if (!gate || !Array.isArray(gate.dataAddresses) || !Array.isArray(gate.resourceAddresses) || new Set([...gate.dataAddresses, ...gate.resourceAddresses]).size !== gate.dataAddresses.length + gate.resourceAddresses.length) fail('DEV013_ORGMASTER_ADDRESS_SET_INVALID', stage)
  }
  if (profile.terraform.stages.OWNER_INFRA_A.runtimeEnabled !== false || profile.terraform.stages.OWNER_RUNTIME_B.runtimeEnabled !== true || profile.terraform.root !== 'infra/google-cloud/dev-013-l3-orgmaster') fail('DEV013_ORGMASTER_TERRAFORM_INVALID')
  if (profile.release?.securityFloor?.id !== 'DEV013_AUTH_STATE_V2_ORIGINAL_AUTH_TIME' || profile.release.securityFloor.authStateVersion !== 'v2' || profile.release.securityFloor.originalAuthTimeGuardRequired !== true || profile.release.securityFloor.protectedRequestEpochGuardRequired !== true || profile.release.securityFloor.preDev013ImageAllowed !== false) fail('DEV013_ORGMASTER_ROLLBACK_FLOOR_INVALID')
  return profile
}

export function loadProfile() {
  return assertProfile(JSON.parse(fs.readFileSync(profilePath, 'utf8')))
}

export function verifyPlatformManifest(manifestBytes, profile = loadProfile()) {
  const bytes = Buffer.isBuffer(manifestBytes) ? manifestBytes : Buffer.from(manifestBytes)
  if (sha256(bytes) !== profile.platformManifest.sha256) fail('DEV013_ORGMASTER_PLATFORM_MANIFEST_HASH_MISMATCH')
  const manifest = JSON.parse(bytes.toString('utf8'))
  const owner = manifest.applications?.orgmaster
  if (manifest.schemaVersion !== profile.platformManifest.schemaVersion || manifest.contractStatus !== profile.platformManifest.contractStatus || manifest.target?.projectId !== profile.target.projectId || manifest.target?.projectNumber !== profile.target.projectNumber || manifest.target?.region !== profile.target.region || manifest.target?.database !== profile.target.database || owner?.serviceName !== profile.target.serviceName || owner?.runtimeServiceAccount !== profile.target.runtimeServiceAccount || owner?.state?.bucket !== profile.state.bucket || owner?.state?.prefix !== profile.state.prefix || owner?.artifact?.repository !== profile.artifact.repository || canonicalize(owner?.secret) !== canonicalize(profile.secret) || owner?.evidence?.bucket !== profile.evidence.bucket || owner?.evidence?.prefix !== profile.evidence.prefix) fail('DEV013_ORGMASTER_PLATFORM_MANIFEST_BOUNDARY_MISMATCH')
  if (manifest.platformRelease?.urlAuthority?.bootstrapTemplate !== 'https://jenfu-platform-stg-${PROJECT_NUMBER}.asia-east1.run.app' || manifest.platformRelease?.urlAuthority?.postCreateHardJoinRequired !== true || manifest.platformRelease?.urlAuthority?.wildcardsAllowed !== false) fail('DEV013_ORGMASTER_PLATFORM_ORIGIN_AUTHORITY_MISMATCH')
  return manifest
}

function secretReferences(version, profile) {
  if (!/^[1-9][0-9]*$/u.test(String(version ?? ''))) fail('DEV013_ORGMASTER_SECRET_VERSION_INVALID')
  return { [SESSION_SECRET_ENV]: { secretId: profile.secret.references[SESSION_SECRET_ENV], version: String(version) } }
}

function assertSecretReferences(value, profile) {
  object(value, 'DEV013_ORGMASTER_SECRET_REFERENCES_INVALID', 'secretReferences')
  const reference = value[SESSION_SECRET_ENV]
  if (canonicalize(Object.keys(value)) !== canonicalize([SESSION_SECRET_ENV]) || reference?.secretId !== profile.secret.references[SESSION_SECRET_ENV] || !/^[1-9][0-9]*$/u.test(String(reference?.version ?? ''))) fail('DEV013_ORGMASTER_SECRET_REFERENCES_INVALID')
  return value
}

export function assertFirstSecretVersionReceipt(receipt, expectedSource, profile = loadProfile()) {
  object(receipt, 'DEV013_ORGMASTER_SECRET_BOOTSTRAP_RECEIPT_INVALID', 'receipt')
  const allowedKeys = ['applicationId', 'clean', 'cloudMutations', 'mutationExecuted', 'observedAt', 'platformManifestSha256', 'receiptSha256', 'releaseAuthority', 'result', 'schemaVersion', 'secretPayloadCaptured', 'sourceRevision', 'sourceTree', 'status', 'target']
  if (canonicalize(Object.keys(receipt).sort()) !== canonicalize(allowedKeys) || receipt.schemaVersion !== 'jenfu.dev013.secret-version-bootstrap-receipt.v1' || receipt.applicationId !== 'orgmaster' || receipt.platformManifestSha256 !== profile.platformManifest.sha256 || receipt.sourceRevision !== expectedSource?.sourceRevision || receipt.sourceTree !== expectedSource?.sourceTree || !H40.test(receipt.sourceRevision ?? '') || !H40.test(receipt.sourceTree ?? '') || receipt.clean !== true || canonicalize(receipt.target) !== canonicalize({ projectId: profile.target.projectId, secretId: profile.secret.references[SESSION_SECRET_ENV], environmentName: SESSION_SECRET_ENV }) || canonicalize(receipt.result) !== canonicalize({ numericVersion: '1', state: 'ENABLED' }) || receipt.status !== 'FIRST_VERSION_CREATED' || receipt.mutationExecuted !== true || receipt.cloudMutations !== 1 || receipt.secretPayloadCaptured !== false || receipt.releaseAuthority !== false || !Number.isFinite(Date.parse(receipt.observedAt ?? '')) || receipt.receiptSha256 !== receiptHash(receipt)) fail('DEV013_ORGMASTER_SECRET_BOOTSTRAP_RECEIPT_INVALID')
  return receipt
}

export const ORGMASTER_SECRET_CONTINUITY_CHANGED_PATHS = Object.freeze([
  'AGENTS.md',
  'ai-doc/specs/DEV-013-orgmaster-sso-consumer.md',
  'scripts/dev013-orgmaster-secret-bootstrap.mjs',
  'scripts/dev013-orgmaster-secret-bootstrap.test.mjs',
  'scripts/dev013-orgmaster-staging-profile.test.mjs',
  'scripts/lib/dev013-orgmaster-secret-bootstrap.mjs',
  'scripts/lib/dev013-orgmaster-staging-release.mjs',
])

export function assertSecretVersionAuthorityReceipt(receipt, expectedSource, profile = loadProfile()) {
  if (receipt?.schemaVersion === 'jenfu.dev013.secret-version-bootstrap-receipt.v1') return assertFirstSecretVersionReceipt(receipt, expectedSource, profile)
  object(receipt, 'DEV013_ORGMASTER_SECRET_CONTINUITY_RECEIPT_INVALID', 'receipt')
  const allowedKeys = ['applicationId', 'changedPaths', 'clean', 'cloudMutations', 'mutationExecuted', 'observedAt', 'originalReceiptSha256', 'originalSourceRevision', 'originalSourceTree', 'platformManifestSha256', 'providerReadback', 'receiptSha256', 'releaseAuthority', 'result', 'schemaVersion', 'secretPayloadCaptured', 'sourceRevision', 'sourceTree', 'status', 'target']
  if (canonicalize(Object.keys(receipt).sort()) !== canonicalize(allowedKeys) || receipt.schemaVersion !== 'jenfu.dev013.secret-version-continuity-receipt.v1' || receipt.applicationId !== 'orgmaster' || receipt.platformManifestSha256 !== profile.platformManifest.sha256 || receipt.sourceRevision !== expectedSource?.sourceRevision || receipt.sourceTree !== expectedSource?.sourceTree || !H40.test(receipt.sourceRevision ?? '') || !H40.test(receipt.sourceTree ?? '') || !H40.test(receipt.originalSourceRevision ?? '') || !H40.test(receipt.originalSourceTree ?? '') || receipt.clean !== true || !H64.test(receipt.originalReceiptSha256 ?? '') || canonicalize(receipt.changedPaths) !== canonicalize(ORGMASTER_SECRET_CONTINUITY_CHANGED_PATHS) || canonicalize(receipt.target) !== canonicalize({ projectId: profile.target.projectId, secretId: profile.secret.references[SESSION_SECRET_ENV], environmentName: SESSION_SECRET_ENV }) || canonicalize(receipt.result) !== canonicalize({ numericVersion: '1', state: 'ENABLED' }) || receipt.status !== 'EXISTING_FIRST_VERSION_REATTESTED' || receipt.mutationExecuted !== false || receipt.cloudMutations !== 0 || receipt.providerReadback !== true || receipt.secretPayloadCaptured !== false || receipt.releaseAuthority !== false || !Number.isFinite(Date.parse(receipt.observedAt ?? '')) || receipt.receiptSha256 !== receiptHash(receipt)) fail('DEV013_ORGMASTER_SECRET_CONTINUITY_RECEIPT_INVALID')
  return receipt
}

export function verifyCanonicalContract(root = projectRoot, profile = loadProfile()) {
  const contractRoot = path.join(root, profile.canonicalContract.sourcePath)
  const manifest = JSON.parse(fs.readFileSync(path.join(contractRoot, 'contract-manifest.json'), 'utf8'))
  const lock = JSON.parse(fs.readFileSync(path.join(contractRoot, 'contract-lock.json'), 'utf8'))
  const rows = [...manifest.files].sort((a, b) => a.path.localeCompare(b.path)).map((entry) => {
    const actual = sha256(fs.readFileSync(path.join(contractRoot, entry.path)))
    if (actual !== entry.sha256) fail('DEV013_ORGMASTER_CANONICAL_FILE_HASH_MISMATCH', entry.path)
    return `${entry.path}\0${actual}\n`
  }).join('')
  const aggregate = sha256(rows)
  if (aggregate !== profile.canonicalContract.sha256 || manifest.sha256 !== aggregate || lock.manifestSha256 !== aggregate || lock.contractVersion !== profile.canonicalContract.version) fail('DEV013_ORGMASTER_CANONICAL_CONTRACT_HASH_MISMATCH')
  return { contractVersion: manifest.contractVersion, aggregateSha256: aggregate, fileCount: manifest.fileCount }
}

export function firebasePublicConfigSha256(value, profile = loadProfile()) {
  object(value, 'DEV013_ORGMASTER_FIREBASE_PUBLIC_CONFIG_INVALID', 'config')
  const keys = Object.keys(value).sort()
  if (canonicalize(keys) !== canonicalize(['apiKey', 'appId', 'projectId']) || value.projectId !== profile.target.projectId || typeof value.apiKey !== 'string' || value.apiKey.trim().length < 20 || !/^[0-9]+:[0-9]+:web:[0-9A-Za-z]+$/u.test(value.appId ?? '')) fail('DEV013_ORGMASTER_FIREBASE_PUBLIC_CONFIG_INVALID')
  return sha256(canonicalize(value))
}

function assertRef(value, code) {
  if (!value || !/^gs:\/\//u.test(value.uri ?? '') || !H64.test(value.sha256 ?? '') || canonicalize(Object.keys(value).sort()) !== canonicalize(['sha256', 'uri'])) fail(code)
  return value
}

export function createSourceFreezeReceipt(input, profile = loadProfile()) {
  if (!STAGES.has(input.stage) || !H40.test(input.sourceRevision ?? '') || !H40.test(input.sourceTree ?? '') || input.clean !== true) fail('DEV013_ORGMASTER_SOURCE_INPUT_INVALID')
  if (typeof input.sourceCreatedAt !== 'string' || !Number.isFinite(Date.parse(input.sourceCreatedAt))) fail('DEV013_ORGMASTER_SOURCE_CREATED_AT_INVALID')
  assertRef(input.foundationReceipt, 'DEV013_ORGMASTER_FOUNDATION_REF_INVALID')
  const runtime = input.stage === 'OWNER_RUNTIME_B'
  if (input.runtimeConfigSecretVersion != null || input.runtimeSecretVersions != null) fail('DEV013_ORGMASTER_CALLER_SECRET_VERSION_DENIED')
  const secretVersionReceipt = runtime ? assertSecretVersionAuthorityReceipt(input.runtimeSecretVersionReceipt, { sourceRevision: input.sourceRevision, sourceTree: input.sourceTree }, profile) : null
  const runtimeSecretVersions = runtime ? secretReferences(secretVersionReceipt.result.numericVersion, profile) : null
  if (runtime && (!IMAGE.test(input.runtimeImage ?? '') || !H64.test(input.firebasePublicConfigSha256 ?? ''))) fail('DEV013_ORGMASTER_RUNTIME_FREEZE_INPUT_INVALID')
  if (!runtime && (input.runtimeImage != null || input.runtimeSecretVersionReceipt != null || input.firebasePublicConfigSha256 != null)) fail('DEV013_ORGMASTER_INFRA_FREEZE_WIDENED')
  const gate = profile.terraform.stages[input.stage]
  const core = {
    schemaVersion: 'jenfu.dev013.orgmaster-source-freeze.v2',
    slice: profile.slice,
    stage: input.stage,
    sourceRevision: input.sourceRevision,
    sourceTree: input.sourceTree,
    clean: true,
    platformManifestSha256: profile.platformManifest.sha256,
    canonicalContractSha256: profile.canonicalContract.sha256,
    foundationReceipt: input.foundationReceipt,
    imageBuildInput: {
      contextAuthority: 'EXACT_GIT_TREE_AT_SOURCE_REVISION',
      dockerfilePath: profile.artifact.dockerfile,
      dockerfileSha256: sha256(fs.readFileSync(path.join(projectRoot, profile.artifact.dockerfile))),
      arguments: {
        SOURCE_REVISION: input.sourceRevision,
        SOURCE_TREE: input.sourceTree,
        SOURCE_CREATED_AT: input.sourceCreatedAt,
        SOURCE_VERSION: `dev013-l3-${input.sourceRevision.slice(0, 12)}`,
        SOURCE_STATE: 'clean',
      },
    },
    terraformRoot: profile.terraform.root,
    terraformAddressSetSha256: sha256(canonicalize([...gate.dataAddresses, ...gate.resourceAddresses].sort())),
    runtimeImage: runtime ? input.runtimeImage : null,
    runtimeSecretVersions,
    runtimeSecretVersionReceiptSha256: runtime ? secretVersionReceipt.receiptSha256 : null,
    firebasePublicConfigSha256: runtime ? input.firebasePublicConfigSha256 : null,
    securityFloor: profile.release.securityFloor,
    status: runtime ? 'READY_FOR_OWNER_RUNTIME_B_PLAN' : 'READY_FOR_OWNER_INFRA_A_PLAN',
    releaseAuthority: false,
    createdAt: input.createdAt ?? new Date().toISOString(),
  }
  return assertSourceFreezeReceipt({ ...core, receiptSha256: sha256(canonicalize(core)) }, profile)
}

export function assertSourceFreezeReceipt(receipt, profile = loadProfile()) {
  object(receipt, 'DEV013_ORGMASTER_SOURCE_FREEZE_INVALID', 'receipt')
  if (receipt.schemaVersion !== 'jenfu.dev013.orgmaster-source-freeze.v2' || !STAGES.has(receipt.stage) || !H40.test(receipt.sourceRevision ?? '') || !H40.test(receipt.sourceTree ?? '') || receipt.clean !== true || receipt.platformManifestSha256 !== profile.platformManifest.sha256 || receipt.canonicalContractSha256 !== profile.canonicalContract.sha256 || receipt.terraformRoot !== profile.terraform.root || receipt.releaseAuthority !== false || receipt.receiptSha256 !== receiptHash(receipt)) fail('DEV013_ORGMASTER_SOURCE_FREEZE_INVALID')
  assertRef(receipt.foundationReceipt, 'DEV013_ORGMASTER_FOUNDATION_REF_INVALID')
  const expectedBuildInput = {
    contextAuthority: 'EXACT_GIT_TREE_AT_SOURCE_REVISION',
    dockerfilePath: profile.artifact.dockerfile,
    dockerfileSha256: sha256(fs.readFileSync(path.join(projectRoot, profile.artifact.dockerfile))),
    arguments: {
      SOURCE_REVISION: receipt.sourceRevision,
      SOURCE_TREE: receipt.sourceTree,
      SOURCE_CREATED_AT: receipt.imageBuildInput?.arguments?.SOURCE_CREATED_AT,
      SOURCE_VERSION: `dev013-l3-${receipt.sourceRevision.slice(0, 12)}`,
      SOURCE_STATE: 'clean',
    },
  }
  if (!Number.isFinite(Date.parse(receipt.imageBuildInput?.arguments?.SOURCE_CREATED_AT ?? '')) || canonicalize(receipt.imageBuildInput) !== canonicalize(expectedBuildInput)) fail('DEV013_ORGMASTER_IMAGE_BUILD_INPUT_INVALID')
  const gate = profile.terraform.stages[receipt.stage]
  if (receipt.terraformAddressSetSha256 !== sha256(canonicalize([...gate.dataAddresses, ...gate.resourceAddresses].sort())) || canonicalize(receipt.securityFloor) !== canonicalize(profile.release.securityFloor)) fail('DEV013_ORGMASTER_SOURCE_FREEZE_CONTRACT_MISMATCH')
  const runtime = receipt.stage === 'OWNER_RUNTIME_B'
  if (runtime) {
    if (!IMAGE.test(receipt.runtimeImage ?? '') || canonicalize(assertSecretReferences(receipt.runtimeSecretVersions, profile)) !== canonicalize(secretReferences(receipt.runtimeSecretVersions?.[SESSION_SECRET_ENV]?.version, profile)) || !H64.test(receipt.runtimeSecretVersionReceiptSha256 ?? '') || !H64.test(receipt.firebasePublicConfigSha256 ?? '') || receipt.status !== 'READY_FOR_OWNER_RUNTIME_B_PLAN') fail('DEV013_ORGMASTER_RUNTIME_FREEZE_INVALID')
  } else if (receipt.runtimeImage !== null || receipt.runtimeSecretVersions !== null || receipt.runtimeSecretVersionReceiptSha256 !== null || receipt.firebasePublicConfigSha256 !== null || receipt.status !== 'READY_FOR_OWNER_INFRA_A_PLAN') fail('DEV013_ORGMASTER_INFRA_FREEZE_INVALID')
  return receipt
}

function planVariable(plan, name) {
  const entry = plan?.variables?.[name]
  return entry && Object.hasOwn(entry, 'value') ? entry.value : undefined
}

function action(change) {
  const actions = change?.change?.actions
  return Array.isArray(actions) && actions.length === 1 ? actions[0] : 'replace'
}

function first(value) {
  return Array.isArray(value) ? value[0] : value
}

function terraformResources(module, rows = []) {
  if (!module || typeof module !== 'object') return rows
  for (const resource of module.resources ?? []) rows.push(resource)
  for (const child of module.child_modules ?? []) terraformResources(child, rows)
  return rows
}

function unindexedAddress(address) {
  return String(address).replace(/\[[^\]]+\]$/u, '')
}

function completePlanChanges(plan) {
  const changes = Array.isArray(plan.resource_changes) ? [...plan.resource_changes] : []
  const seen = new Set(changes.map((change) => change.address))
  const configuredData = new Set(terraformResources(plan?.configuration?.root_module).filter((row) => row.mode === 'data').map((row) => row.address))
  const stateData = terraformResources(plan?.prior_state?.values?.root_module).filter((row) => row.mode === 'data')
  for (const resource of stateData) {
    if (!seen.has(resource.address) && configuredData.has(unindexedAddress(resource.address))) {
      changes.push({ address: resource.address, change: { actions: ['read'], after: resource.values } })
      seen.add(resource.address)
    }
  }
  return changes
}

function envMap(container) {
  return Object.fromEntries((container?.env ?? []).filter((entry) => Object.hasOwn(entry, 'value')).map((entry) => [entry.name, entry.value]))
}

function probePath(container, probeName) {
  return first(first(container?.[probeName])?.http_get)?.path
}

export function assertTerraformPlan(plan, freeze, profile = loadProfile()) {
  assertSourceFreezeReceipt(freeze, profile)
  object(plan, 'DEV013_ORGMASTER_PLAN_INVALID', 'plan')
  const gate = profile.terraform.stages[freeze.stage]
  const expectedAddresses = [...gate.dataAddresses, ...gate.resourceAddresses].sort()
  const changes = completePlanChanges(plan)
  const actualAddresses = changes.map((change) => change.address).sort()
  if (canonicalize(actualAddresses) !== canonicalize(expectedAddresses)) fail('DEV013_ORGMASTER_PLAN_ADDRESS_SET_MISMATCH')
  const allowed = new Set(profile.terraform.allowedActions)
  for (const change of changes) if (!allowed.has(action(change))) fail('DEV013_ORGMASTER_PLAN_ACTION_DENIED', `${change.address}:${action(change)}`)
  const expectedVariables = {
    project_id: profile.target.projectId,
    region: profile.target.region,
    source_revision: freeze.sourceRevision,
    source_tree: freeze.sourceTree,
    platform_manifest_sha256: freeze.platformManifestSha256,
    canonical_contract_sha256: freeze.canonicalContractSha256,
    foundation_manifest_sha256: freeze.foundationReceipt.sha256,
    runtime_enabled: gate.runtimeEnabled,
    orgmaster_image: freeze.runtimeImage,
    runtime_config_secret_version: freeze.runtimeSecretVersions?.[SESSION_SECRET_ENV]?.version ?? null,
    firebase_public_config_sha256: freeze.firebasePublicConfigSha256,
  }
  for (const [name, expected] of Object.entries(expectedVariables)) {
    const observed = planVariable(plan, name)
    const matches = name === 'runtime_enabled' ? String(observed) === String(expected) : observed === expected
    if (!matches) fail('DEV013_ORGMASTER_PLAN_VARIABLE_MISMATCH', name)
  }
  if (freeze.stage === 'OWNER_INFRA_A') return { status: 'PASS', stage: freeze.stage, sourceRevision: freeze.sourceRevision, addressCount: actualAddresses.length, releaseAuthority: false }
  const plannedFirebaseConfig = { apiKey: planVariable(plan, 'firebase_public_api_key'), appId: planVariable(plan, 'firebase_public_app_id'), projectId: profile.target.projectId }
  if (firebasePublicConfigSha256(plannedFirebaseConfig, profile) !== freeze.firebasePublicConfigSha256) fail('DEV013_ORGMASTER_PLAN_FIREBASE_PUBLIC_CONFIG_MISMATCH')

  const service = changes.find((change) => change.address === 'google_cloud_run_v2_service.orgmaster[0]')?.change?.after
  const template = first(service?.template)
  const app = (template?.containers ?? []).find((container) => container.name === 'orgmaster')
  const proxy = (template?.containers ?? []).find((container) => container.name === 'cloud-sql-proxy')
  const env = envMap(app)
  const publicOrigin = exactRunAppOrigin(env.ORGMASTER_PUBLIC_BASE_URL, profile.target.serviceName, profile.target.region, true)
  const brokerOrigin = exactRunAppOrigin(env.ORGMASTER_JENFU_SSO_BROKER_ORIGIN, 'jenfu-platform-stg', profile.target.region, true)
  const publicProjectNumber = new URL(publicOrigin).hostname.split('.')[0].slice('orgmaster-stg-'.length)
  const brokerProjectNumber = new URL(brokerOrigin).hostname.split('.')[0].slice('jenfu-platform-stg-'.length)
  const secret = (app?.env ?? []).find((entry) => entry.name === 'ORGMASTER_SESSION_HASH_PEPPER')
  const secretRef = first(secret?.value_source)?.secret_key_ref
  const proxyArgs = new Set(proxy?.args ?? [])
  if (publicProjectNumber !== brokerProjectNumber || service?.project !== profile.target.projectId || service?.location !== profile.target.region || service?.name !== profile.target.serviceName || service?.deletion_protection !== true || service?.ingress !== profile.target.entryPolicy.ingress || service?.default_uri_disabled !== false || service?.invoker_iam_disabled !== true || template?.service_account !== profile.target.runtimeServiceAccount || first(template?.scaling)?.min_instance_count !== 0 || first(template?.scaling)?.max_instance_count !== 1 || template?.max_instance_request_concurrency !== 20 || app?.image !== freeze.runtimeImage || env.ORGMASTER_JENFU_SSO_HANDOFF_MODE !== 'off' || env.ORGMASTER_PERSISTENCE_MODE !== 'cloud-sql' || env.ORGMASTER_POSTGRES_POOL_MAX !== '2' || env.DEV013_L3_SOURCE_REVISION !== freeze.sourceRevision || env.DEV013_L3_SOURCE_TREE !== freeze.sourceTree || env.DEV013_L3_PLATFORM_MANIFEST_SHA256 !== freeze.platformManifestSha256 || env.DEV013_L3_CANONICAL_CONTRACT_SHA256 !== freeze.canonicalContractSha256 || env.DEV013_L3_FOUNDATION_MANIFEST_SHA256 !== freeze.foundationReceipt.sha256 || env.DEV013_L3_FIREBASE_PUBLIC_CONFIG_SHA256 !== freeze.firebasePublicConfigSha256 || probePath(app, 'startup_probe') !== profile.runtime.startupProbePath || probePath(app, 'liveness_probe') !== profile.runtime.livenessProbePath || secretRef?.secret !== profile.secret.references[SESSION_SECRET_ENV] || String(secretRef?.version ?? '') !== freeze.runtimeSecretVersions[SESSION_SECRET_ENV].version || proxy?.image !== profile.runtime.cloudSqlProxyImage || !proxyArgs.has('--private-ip') || !proxyArgs.has('--auto-iam-authn') || !proxyArgs.has('--max-connections=2') || !proxyArgs.has(profile.target.connectionName)) fail('DEV013_ORGMASTER_PLAN_RUNTIME_INVALID')
  return { status: 'PASS', stage: freeze.stage, sourceRevision: freeze.sourceRevision, sourceTree: freeze.sourceTree, runtimeImage: freeze.runtimeImage, orgmasterOrigin: publicOrigin, platformBrokerOrigin: brokerOrigin, addressCount: actualAddresses.length, releaseAuthority: false }
}

function normalizedTraffic(serviceReadback) {
  const traffic = (serviceReadback?.traffic ?? []).map((item) => ({ revision: item.revision ?? item.revisionName ?? null, percent: Number(item.percent ?? 0), tag: item.tag ?? null, latestRevision: item.latestRevision === true || item.type === 'TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST' }))
  if (traffic.length !== 1 || !traffic[0].revision || traffic[0].percent !== 100 || traffic[0].tag !== null || traffic[0].latestRevision) fail('DEV013_ORGMASTER_TRAFFIC_NOT_REVISION_PINNED')
  return traffic[0]
}

function normalizeServiceReadback(serviceReadback, identityReadback, profile) {
  const canonicalOrigin = exactRunAppOrigin(serviceReadback?.uri, profile.target.serviceName, profile.target.region, true)
  const identity = {
    email: identityReadback?.email,
    uniqueId: String(identityReadback?.uniqueId ?? ''),
  }
  const containerEnv = serviceReadback?.containers?.find((row) => row.name === profile.runtime.containerName)?.env ?? []
  const env = Object.fromEntries(containerEnv.filter((row) => Object.hasOwn(row, 'value')).map((row) => [row.name, String(row.value)]))
  const secretEntry = containerEnv.find((row) => row.name === SESSION_SECRET_ENV)
  const providerSecretRef = secretEntry?.valueSource?.secretKeyRef ?? first(secretEntry?.value_source)?.secret_key_ref
  const observedSecretReferences = providerSecretRef
    ? { [SESSION_SECRET_ENV]: { secretId: providerSecretRef.secret ?? providerSecretRef.secretId, version: String(providerSecretRef.version ?? '') } }
    : null
  const traffic = normalizedTraffic(serviceReadback)
  const latestCreatedRevision = serviceReadback?.latestCreatedRevision ?? null
  const latestReadyRevision = serviceReadback?.latestReadyRevision ?? null
  const etag = serviceReadback?.etag ?? null
  if (serviceReadback?.projectId !== profile.target.projectId || serviceReadback?.region !== profile.target.region || serviceReadback?.serviceName !== profile.target.serviceName || serviceReadback?.runtimeServiceAccount !== profile.target.runtimeServiceAccount || serviceReadback?.deletionProtection !== true || serviceReadback?.minInstances !== 0 || serviceReadback?.maxInstances !== 1 || canonicalize(serviceReadback?.entryPolicy) !== canonicalize(profile.target.entryPolicy) || canonicalize(serviceReadback?.labels) !== canonicalize(profile.target.requiredLabels) || identity.email !== profile.target.runtimeServiceAccount || identityReadback?.disabled === true || !UNIQUE_ID.test(identity.uniqueId) || typeof etag !== 'string' || etag.trim().length < 4 || !latestCreatedRevision || latestReadyRevision !== latestCreatedRevision) fail('DEV013_ORGMASTER_SERVICE_READBACK_INVALID')
  return { canonicalOrigin, identity, env, secretReferences: observedSecretReferences, traffic, latestCreatedRevision, latestReadyRevision, etag, image: serviceReadback?.image }
}

function buildRollbackFloor({ freeze, service }) {
  const core = {
    schemaVersion: 'jenfu.dev013.orgmaster-rollback-floor.v2',
    serviceName: 'orgmaster-stg',
    revision: service.latestReadyRevision,
    providerEtag: service.etag,
    artifactDigest: freeze.runtimeImage,
    sourceRevision: freeze.sourceRevision,
    sourceTree: freeze.sourceTree,
    secretReferences: freeze.runtimeSecretVersions,
    authStateVersion: 'v2',
    originalAuthTimeGuard: true,
    protectedRequestEpochGuard: true,
    securityFloor: 'DEV013_AUTH_STATE_V2_ORIGINAL_AUTH_TIME',
    preDev013Image: false,
    status: 'SECURITY_FLOOR_READY',
    releaseAuthority: false,
  }
  return { ...core, receiptSha256: sha256(canonicalize(core)) }
}

export function buildTargetBootstrapReceipt({ freeze, terraformOutput, serviceReadback, identityReadback, observedAt = new Date().toISOString() }, profile = loadProfile()) {
  assertSourceFreezeReceipt(freeze, profile)
  if (freeze.stage !== 'OWNER_RUNTIME_B') fail('DEV013_ORGMASTER_TARGET_BOOTSTRAP_STAGE_INVALID')
  const output = terraformOutput?.orgmaster_staging_manifest?.value ?? terraformOutput?.orgmaster_staging_manifest ?? terraformOutput
  const service = normalizeServiceReadback(serviceReadback, identityReadback, profile)
  const canonicalOrigin = service.canonicalOrigin
  const platformOrigin = exactRunAppOrigin(output?.expected_platform_origin, 'jenfu-platform-stg', profile.target.region, true)
  if (output?.provider_uri !== canonicalOrigin || output?.expected_orgmaster_origin !== canonicalOrigin || output?.project_id !== profile.target.projectId || output?.region !== profile.target.region || output?.service_name !== profile.target.serviceName || output?.application_image !== freeze.runtimeImage || output?.runtime_service_account !== profile.target.runtimeServiceAccount || String(output?.runtime_service_subject) !== String(identityReadback?.uniqueId) || identityReadback?.email !== profile.target.runtimeServiceAccount || identityReadback?.disabled === true || !UNIQUE_ID.test(String(identityReadback?.uniqueId ?? ''))) fail('DEV013_ORGMASTER_PROVIDER_HARD_JOIN_INVALID')
  const env = service.env
  if (service.image !== freeze.runtimeImage || canonicalize(service.secretReferences) !== canonicalize(freeze.runtimeSecretVersions) || env.ORGMASTER_PUBLIC_BASE_URL !== canonicalOrigin || env.ORGMASTER_JENFU_SSO_BROKER_ORIGIN !== platformOrigin || env.ORGMASTER_JENFU_SSO_HANDOFF_MODE !== 'off' || env.DEV013_L3_SOURCE_REVISION !== freeze.sourceRevision || env.DEV013_L3_SOURCE_TREE !== freeze.sourceTree) fail('DEV013_ORGMASTER_TARGET_BOOTSTRAP_RUNTIME_INVALID')
  const rollbackFloor = buildRollbackFloor({ freeze, service })
  const core = {
    schemaVersion: 'jenfu.dev013.l3-target-bootstrap-receipt.v2',
    ownerApplicationId: 'orgmaster',
    platformManifestSha256: freeze.platformManifestSha256,
    target: {
      projectId: profile.target.projectId,
      region: profile.target.region,
      serviceName: profile.target.serviceName,
      canonicalOrigin,
      labels: profile.target.requiredLabels,
      runtimeServiceAccount: { email: identityReadback.email, uniqueId: String(identityReadback.uniqueId) },
      entryPolicy: profile.target.entryPolicy,
      deletionProtection: true,
      minInstances: 0,
    },
    runtime: { ssoHandoffMode: 'off', platformBrokerOrigin: platformOrigin, authStateVersion: 'v2', originalAuthTimeGuard: true, protectedRequestEpochGuard: true },
    bootstrap: { providerReadback: true, providerEtag: service.etag, activeRevision: service.traffic.revision, trafficPercent: service.traffic.percent },
    boundaries: { stateBucket: profile.state.bucket, statePrefix: profile.state.prefix, artifactRepository: profile.artifact.repository, secretReferences: freeze.runtimeSecretVersions, evidenceBucket: profile.evidence.bucket, evidencePrefix: profile.evidence.prefix, secretValueRead: false },
    rollbackFloor,
    status: 'TARGET_BOOTSTRAP_READY',
    releaseAuthority: false,
    productionMutations: 0,
    siblingMutations: 0,
    observedAt,
  }
  return { ...core, receiptSha256: sha256(canonicalize(core)) }
}

function assertFloor(floor, profile) {
  if (floor?.schemaVersion !== 'jenfu.dev013.orgmaster-rollback-floor.v2' || floor.serviceName !== profile.target.serviceName || !/^orgmaster-stg-[a-z0-9-]+$/u.test(floor.revision ?? '') || typeof floor.providerEtag !== 'string' || floor.providerEtag.trim().length < 4 || !IMAGE.test(floor.artifactDigest ?? '') || !H40.test(floor.sourceRevision ?? '') || !H40.test(floor.sourceTree ?? '') || floor.authStateVersion !== 'v2' || floor.originalAuthTimeGuard !== true || floor.protectedRequestEpochGuard !== true || floor.securityFloor !== profile.release.securityFloor.id || floor.preDev013Image !== false || floor.status !== 'SECURITY_FLOOR_READY' || floor.releaseAuthority !== false || floor.receiptSha256 !== receiptHash(floor)) fail('DEV013_ORGMASTER_RELEASE_FLOOR_INVALID')
  assertSecretReferences(floor.secretReferences, profile)
  return floor
}

export function assertCandidateReceipt(receipt, floor, profile = loadProfile()) {
  assertFloor(floor, profile)
  if (receipt?.schemaVersion !== 'jenfu.dev013.orgmaster-candidate-hard-join.v1' || receipt.ownerApplicationId !== 'orgmaster' || receipt.status !== 'ENABLED_REVISION_READY' || receipt.handoffMode !== 'on' || receipt.sourceRevision !== floor.sourceRevision || receipt.sourceTree !== floor.sourceTree || receipt.artifactDigest !== floor.artifactDigest || canonicalize(receipt.secretReferences) !== canonicalize(floor.secretReferences) || receipt.rollbackFloorReceiptSha256 !== floor.receiptSha256 || !String(receipt.revision ?? '').startsWith(`${profile.target.serviceName}-`) || typeof receipt.providerEtag !== 'string' || !UNIQUE_ID.test(String(receipt.runtimeServiceAccount?.uniqueId ?? '')) || receipt.releaseAuthority !== false || receipt.receiptSha256 !== receiptHash(receipt)) fail('DEV013_ORGMASTER_CANDIDATE_RECEIPT_INVALID')
  if (receipt.canonicalOrigin !== exactRunAppOrigin(receipt.canonicalOrigin, profile.target.serviceName, profile.target.region, true) || receipt.brokerOrigin !== exactRunAppOrigin(receipt.brokerOrigin, 'jenfu-platform-stg', profile.target.region, true) || receipt.callback !== `${receipt.canonicalOrigin}/api/auth/jenfu-sso/callback` || receipt.runtimeServiceAccount.email !== profile.target.runtimeServiceAccount) fail('DEV013_ORGMASTER_CANDIDATE_TARGET_INVALID')
  return receipt
}

export function createReleasePlan(request, profile = loadProfile()) {
  object(request, 'DEV013_ORGMASTER_RELEASE_REQUEST_INVALID', 'request')
  if (request.schemaVersion !== 'jenfu.dev013.orgmaster-staging-release-request.v2' || request.projectId !== profile.target.projectId || request.region !== profile.target.region || request.serviceName !== profile.target.serviceName || !['candidate', 'activate', 'rollback'].includes(request.operation)) fail('DEV013_ORGMASTER_RELEASE_TARGET_INVALID')
  if (request.productionMutations !== 0 || request.siblingMutations !== 0 || request.databaseMutations !== 0 || request.migrationExecutions !== 0) fail('DEV013_ORGMASTER_RELEASE_BOUNDARY_INVALID')
  const floor = assertFloor(request.rollbackFloor, profile)
  const common = ['run', 'services']
  let args
  let mutationTypes
  let candidate = null
  if (request.operation === 'candidate') {
    if (!H40.test(request.sourceRevision ?? '') || !H40.test(request.sourceTree ?? '') || !IMAGE.test(request.artifactDigest ?? '') || request.ssoHandoffMode !== 'on' || request.publicBaseUrl !== exactRunAppOrigin(request.publicBaseUrl, profile.target.serviceName, profile.target.region, true) || request.brokerOrigin !== exactRunAppOrigin(request.brokerOrigin, 'jenfu-platform-stg', profile.target.region, true) || request.previousRevision !== floor.revision || request.sourceRevision !== floor.sourceRevision || request.sourceTree !== floor.sourceTree || request.artifactDigest !== floor.artifactDigest || request.platformManifestSha256 !== profile.platformManifest.sha256 || request.canonicalContractSha256 !== profile.canonicalContract.sha256) fail('DEV013_ORGMASTER_CANDIDATE_INVALID')
    const tag = `candidate-${request.sourceRevision.slice(0, 12)}`
    const vars = [
      `ORGMASTER_PUBLIC_BASE_URL=${request.publicBaseUrl}`,
      `ORGMASTER_JENFU_SSO_BROKER_ORIGIN=${request.brokerOrigin}`,
      `ORGMASTER_JENFU_SSO_HANDOFF_MODE=${request.ssoHandoffMode}`,
      `DEV013_L3_SOURCE_REVISION=${request.sourceRevision}`,
      `DEV013_L3_SOURCE_TREE=${request.sourceTree}`,
      `DEV013_L3_PLATFORM_MANIFEST_SHA256=${request.platformManifestSha256}`,
      `DEV013_L3_CANONICAL_CONTRACT_SHA256=${request.canonicalContractSha256}`,
    ].join(',')
    args = [...common, 'update', profile.target.serviceName, '--project', profile.target.projectId, '--region', profile.target.region, '--image', request.artifactDigest, '--no-traffic', '--tag', tag, '--update-env-vars', vars, '--quiet']
    mutationTypes = ['revision', 'runtime-env']
    candidate = { sourceRevision: request.sourceRevision, sourceTree: request.sourceTree, artifactDigest: request.artifactDigest, secretReferences: floor.secretReferences, handoffMode: 'on', publicBaseUrl: request.publicBaseUrl, brokerOrigin: request.brokerOrigin, callback: `${request.publicBaseUrl}/api/auth/jenfu-sso/callback`, previousRevision: floor.revision, beforeEtag: floor.providerEtag }
  } else {
    if (request.operation === 'activate') candidate = assertCandidateReceipt(request.candidateReceipt, floor, profile)
    const revision = request.operation === 'rollback' ? floor.revision : candidate?.revision
    if (!/^orgmaster-stg-[a-z0-9-]+$/u.test(revision ?? '') || (request.operation === 'activate' && revision === floor.revision)) fail('DEV013_ORGMASTER_TRAFFIC_TARGET_INVALID')
    args = [...common, 'update-traffic', profile.target.serviceName, '--project', profile.target.projectId, '--region', profile.target.region, '--to-revisions', `${revision}=100`, '--quiet']
    mutationTypes = ['traffic']
  }
  if (canonicalize(mutationTypes) !== canonicalize(profile.release.allowedMutationTypes[request.operation])) fail('DEV013_ORGMASTER_RELEASE_MUTATION_TYPE_INVALID')
  const candidateBinding = request.operation === 'candidate' ? candidate : request.operation === 'activate' ? { sourceRevision: candidate.sourceRevision, sourceTree: candidate.sourceTree, artifactDigest: candidate.artifactDigest, secretReferences: candidate.secretReferences, revision: candidate.revision, providerEtag: candidate.providerEtag, canonicalOrigin: candidate.canonicalOrigin, brokerOrigin: candidate.brokerOrigin, callback: candidate.callback, runtimeServiceAccount: candidate.runtimeServiceAccount, candidateReceiptSha256: candidate.receiptSha256 } : null
  const core = { schemaVersion: 'jenfu.dev013.orgmaster-release-plan.v2', operation: request.operation, projectId: profile.target.projectId, region: profile.target.region, serviceName: profile.target.serviceName, mutationTypes, candidate: candidateBinding, gcloud: { command: 'gcloud', args }, rollbackSecurityFloor: floor, status: 'READY_FOR_EXPLICIT_OWNER_EXECUTION', releaseAuthority: false }
  return { ...core, planSha256: sha256(canonicalize(core)) }
}

export function hardJoinCandidate({ plan, serviceReadback, identityReadback, observedAt = new Date().toISOString() }, profile = loadProfile()) {
  if (plan?.schemaVersion !== 'jenfu.dev013.orgmaster-release-plan.v2' || plan.operation !== 'candidate' || plan.status !== 'READY_FOR_EXPLICIT_OWNER_EXECUTION' || plan.releaseAuthority !== false || plan.planSha256 !== planHash(plan) || plan.candidate?.handoffMode !== 'on') fail('DEV013_ORGMASTER_CANDIDATE_PLAN_INVALID')
  const floor = assertFloor(plan.rollbackSecurityFloor, profile)
  const service = normalizeServiceReadback(serviceReadback, identityReadback, profile)
  const expected = plan.candidate
  if (service.etag === expected.beforeEtag || service.image !== expected.artifactDigest || canonicalize(service.secretReferences) !== canonicalize(expected.secretReferences) || service.latestCreatedRevision === floor.revision || service.traffic.revision !== floor.revision || service.canonicalOrigin !== expected.publicBaseUrl || service.env.ORGMASTER_PUBLIC_BASE_URL !== expected.publicBaseUrl || service.env.ORGMASTER_JENFU_SSO_BROKER_ORIGIN !== expected.brokerOrigin || service.env.ORGMASTER_JENFU_SSO_HANDOFF_MODE !== 'on' || service.env.DEV013_L3_SOURCE_REVISION !== expected.sourceRevision || service.env.DEV013_L3_SOURCE_TREE !== expected.sourceTree) fail('DEV013_ORGMASTER_CANDIDATE_HARD_JOIN_INVALID')
  const core = {
    schemaVersion: 'jenfu.dev013.orgmaster-candidate-hard-join.v1',
    ownerApplicationId: 'orgmaster',
    sourceRevision: expected.sourceRevision,
    sourceTree: expected.sourceTree,
    artifactDigest: expected.artifactDigest,
    secretReferences: expected.secretReferences,
    revision: service.latestCreatedRevision,
    providerEtag: service.etag,
    canonicalOrigin: service.canonicalOrigin,
    brokerOrigin: expected.brokerOrigin,
    callback: expected.callback,
    runtimeServiceAccount: service.identity,
    handoffMode: 'on',
    rollbackFloorReceiptSha256: floor.receiptSha256,
    status: 'ENABLED_REVISION_READY',
    releaseAuthority: false,
    observedAt,
  }
  return assertCandidateReceipt({ ...core, receiptSha256: sha256(canonicalize(core)) }, floor, profile)
}

export function buildOwnerReceipt({ activationPlan, candidateReceipt, serviceReadback, identityReadback, observedAt = new Date().toISOString() }, profile = loadProfile()) {
  if (activationPlan?.schemaVersion !== 'jenfu.dev013.orgmaster-release-plan.v2' || activationPlan.operation !== 'activate' || activationPlan.status !== 'READY_FOR_EXPLICIT_OWNER_EXECUTION' || activationPlan.releaseAuthority !== false || activationPlan.planSha256 !== planHash(activationPlan)) fail('DEV013_ORGMASTER_ACTIVATION_PLAN_INVALID')
  const floor = assertFloor(activationPlan.rollbackSecurityFloor, profile)
  const candidate = assertCandidateReceipt(candidateReceipt, floor, profile)
  if (activationPlan.candidate?.candidateReceiptSha256 !== candidate.receiptSha256 || activationPlan.candidate?.revision !== candidate.revision) fail('DEV013_ORGMASTER_ACTIVATION_CANDIDATE_MISMATCH')
  const service = normalizeServiceReadback(serviceReadback, identityReadback, profile)
  if (service.etag === candidate.providerEtag || service.latestCreatedRevision !== candidate.revision || service.latestReadyRevision !== candidate.revision || service.traffic.revision !== candidate.revision || service.traffic.percent !== 100 || service.image !== candidate.artifactDigest || canonicalize(service.secretReferences) !== canonicalize(candidate.secretReferences) || service.canonicalOrigin !== candidate.canonicalOrigin || service.env.ORGMASTER_JENFU_SSO_HANDOFF_MODE !== 'on' || service.env.ORGMASTER_JENFU_SSO_BROKER_ORIGIN !== candidate.brokerOrigin || service.env.ORGMASTER_PUBLIC_BASE_URL !== candidate.canonicalOrigin || service.env.DEV013_L3_SOURCE_REVISION !== candidate.sourceRevision || service.env.DEV013_L3_SOURCE_TREE !== candidate.sourceTree) fail('DEV013_ORGMASTER_ACTIVE_HARD_JOIN_INVALID')
  const core = {
    schemaVersion: 'jenfu.dev013.l3-owner-receipt.v2',
    ownerApplicationId: 'orgmaster',
    sourceRevision: candidate.sourceRevision,
    sourceTree: candidate.sourceTree,
    artifactDigest: candidate.artifactDigest,
    target: { projectId: profile.target.projectId, region: profile.target.region, serviceName: profile.target.serviceName, canonicalOrigin: service.canonicalOrigin, labels: profile.target.requiredLabels, runtimeServiceAccount: service.identity, entryPolicy: profile.target.entryPolicy, deletionProtection: true, minInstances: 0 },
    runtime: { ssoHandoffMode: 'on', platformBrokerOrigin: candidate.brokerOrigin, authStateVersion: 'v2', originalAuthTimeGuard: true, protectedRequestEpochGuard: true },
    hardJoin: { providerReadback: true, providerEtag: service.etag, activeRevision: candidate.revision, trafficPercent: 100, handoffMode: 'on', brokerOrigin: candidate.brokerOrigin, callback: candidate.callback },
    boundaries: { stateBucket: profile.state.bucket, statePrefix: profile.state.prefix, artifactRepository: profile.artifact.repository, secretReferences: candidate.secretReferences, evidenceBucket: profile.evidence.bucket, evidencePrefix: profile.evidence.prefix, secretValueRead: false },
    rollback: { status: 'READY', securityFloorReceiptSha256: floor.receiptSha256, siblingMutations: 0 },
    capacity: { databasePoolMax: profile.runtime.databasePoolMax, maxInstancesPerRevision: profile.runtime.maxInstances },
    status: 'OWNER_READY_FOR_L3_BROWSER',
    releaseAuthority: false,
    observedAt,
  }
  return { ...core, receiptSha256: sha256(canonicalize(core)) }
}

export const constants = Object.freeze({ H40, H64, IMAGE, UNIQUE_ID, STAGES: [...STAGES] })
