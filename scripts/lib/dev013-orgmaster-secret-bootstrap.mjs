import crypto from 'node:crypto'
import { canonicalize, loadProfile, sha256 } from './dev013-orgmaster-staging-release.mjs'

const ENVIRONMENT_NAME = 'ORGMASTER_SESSION_HASH_PEPPER'
const PLAN_SCHEMA = 'jenfu.dev013.orgmaster-secret-version-bootstrap-plan.v1'
const RECEIPT_SCHEMA = 'jenfu.dev013.orgmaster-secret-version-bootstrap-receipt.v1'
const VERSION_NAME = /^projects\/[^/]+\/secrets\/([^/]+)\/versions\/([1-9][0-9]*)$/u

export class Dev013OrgmasterSecretBootstrapError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code)
    this.code = code
  }
}

function fail(code, detail = '') {
  throw new Dev013OrgmasterSecretBootstrapError(code, detail)
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

function target(profile) {
  return {
    projectId: profile.target.projectId,
    environment: profile.target.environment,
    secretId: profile.secret.references[ENVIRONMENT_NAME],
  }
}

export function createSecretVersionBootstrapPlan(profile = loadProfile()) {
  const exact = target(profile)
  if (exact.projectId !== 'jenfu-platform-nonprod' || exact.environment !== 'staging' || exact.secretId !== 'dev010-stg-orgmaster-runtime-config' || profile.secret.versionBootstrap?.mode !== 'OWNER_GENERATED_IF_EMPTY' || profile.secret.versionBootstrap.minimumEntropyBytes !== 64 || profile.secret.payloadMayAppearInEvidence !== false) fail('DEV013_ORGMASTER_SECRET_BOOTSTRAP_PROFILE_INVALID')
  const core = {
    schemaVersion: PLAN_SCHEMA,
    ownerApplicationId: 'orgmaster',
    platformManifestSha256: profile.platformManifest.sha256,
    target: exact,
    secretReferences: { [ENVIRONMENT_NAME]: { secretId: exact.secretId } },
    versionBootstrap: profile.secret.versionBootstrap,
    providerCommands: {
      preflight: {
        command: 'gcloud',
        args: ['secrets', 'versions', 'list', exact.secretId, '--project', exact.projectId, '--format=json(name,state)'],
      },
      execute: {
        command: 'gcloud',
        args: ['secrets', 'versions', 'add', exact.secretId, '--project', exact.projectId, '--data-file=-', '--format=json(name,state)'],
        stdinOnly: true,
      },
      readback: {
        command: 'gcloud',
        args: ['secrets', 'versions', 'describe', '<NUMERIC_VERSION>', '--secret', exact.secretId, '--project', exact.projectId, '--format=json(name,state)'],
      },
    },
    guards: {
      requiresExplicitExecute: true,
      requiresEmptyVersionHistory: true,
      generatedEntropyBytes: 64,
      payloadEncoding: 'base64url',
      secretPayloadMayBeRead: false,
      secretPayloadMayBePersisted: false,
      secretPayloadMayAppearInEvidence: false,
    },
    status: 'READY_FOR_READ_ONLY_PREFLIGHT',
    releaseAuthority: false,
  }
  return { ...core, planSha256: sha256(canonicalize(core)) }
}

export function assertSecretVersionBootstrapPlan(plan, profile = loadProfile()) {
  const expected = createSecretVersionBootstrapPlan(profile)
  if (plan?.schemaVersion !== PLAN_SCHEMA || plan.planSha256 !== planHash(plan) || canonicalize(plan) !== canonicalize(expected)) fail('DEV013_ORGMASTER_SECRET_BOOTSTRAP_PLAN_INVALID')
  return plan
}

function parseProviderJson(value, code) {
  try { return JSON.parse(value || 'null') } catch { fail(code, 'invalid-json') }
}

function invokeProvider(invoke, command, args, input = undefined) {
  const result = invoke(command, args, input)
  if (!result || result.status !== 0) fail('DEV013_ORGMASTER_SECRET_PROVIDER_COMMAND_FAILED', String(result?.stderr ?? '').trim().slice(0, 500))
  return String(result.stdout ?? '')
}

function assertEmptyVersionHistory(stdout) {
  const rows = parseProviderJson(stdout, 'DEV013_ORGMASTER_SECRET_VERSION_LIST_INVALID')
  if (!Array.isArray(rows)) fail('DEV013_ORGMASTER_SECRET_VERSION_LIST_INVALID', 'not-array')
  if (rows.length !== 0) fail('DEV013_ORGMASTER_SECRET_ALREADY_VERSIONED', `count=${rows.length}`)
}

function providerVersion(value, profile) {
  const row = Array.isArray(value) ? value[0] : value
  if (!row || (Array.isArray(value) && value.length !== 1)) fail('DEV013_ORGMASTER_SECRET_VERSION_ADD_INVALID', 'row-count')
  const match = VERSION_NAME.exec(String(row.name ?? ''))
  if (!match || match[1] !== profile.secret.references[ENVIRONMENT_NAME] || match[2] !== '1' || row.state !== 'ENABLED') fail('DEV013_ORGMASTER_SECRET_VERSION_ADD_INVALID', 'metadata')
  return { secretId: match[1], version: match[2], state: row.state }
}

export function buildSecretVersionBootstrapReceipt({ plan, providerReadback, observedAt = new Date().toISOString() }, profile = loadProfile()) {
  assertSecretVersionBootstrapPlan(plan, profile)
  const reference = providerVersion(providerReadback, profile)
  if (!Number.isFinite(Date.parse(observedAt))) fail('DEV013_ORGMASTER_SECRET_BOOTSTRAP_TIME_INVALID')
  const core = {
    schemaVersion: RECEIPT_SCHEMA,
    ownerApplicationId: 'orgmaster',
    platformManifestSha256: profile.platformManifest.sha256,
    target: plan.target,
    secretReferences: { [ENVIRONMENT_NAME]: reference },
    evidence: {
      providerMetadataReadback: true,
      payloadRead: false,
      payloadPersisted: false,
      payloadInEvidence: false,
    },
    status: 'SECRET_VERSION_READY',
    releaseAuthority: false,
    observedAt,
  }
  return { ...core, receiptSha256: sha256(canonicalize(core)) }
}

export function assertSecretVersionBootstrapReceipt(receipt, profile = loadProfile()) {
  if (receipt?.schemaVersion !== RECEIPT_SCHEMA || receipt.ownerApplicationId !== 'orgmaster' || receipt.platformManifestSha256 !== profile.platformManifest.sha256 || receipt.target?.projectId !== profile.target.projectId || receipt.target?.environment !== profile.target.environment || receipt.target?.secretId !== profile.secret.references[ENVIRONMENT_NAME] || receipt.status !== 'SECRET_VERSION_READY' || receipt.releaseAuthority !== false || receipt.receiptSha256 !== receiptHash(receipt)) fail('DEV013_ORGMASTER_SECRET_BOOTSTRAP_RECEIPT_INVALID')
  const reference = receipt.secretReferences?.[ENVIRONMENT_NAME]
  if (canonicalize(Object.keys(receipt.secretReferences ?? {})) !== canonicalize([ENVIRONMENT_NAME]) || reference?.secretId !== profile.secret.references[ENVIRONMENT_NAME] || reference?.version !== '1' || reference?.state !== 'ENABLED') fail('DEV013_ORGMASTER_SECRET_BOOTSTRAP_RECEIPT_INVALID', 'secret-reference')
  if (canonicalize(receipt.evidence) !== canonicalize({ providerMetadataReadback: true, payloadRead: false, payloadPersisted: false, payloadInEvidence: false })) fail('DEV013_ORGMASTER_SECRET_BOOTSTRAP_RECEIPT_INVALID', 'evidence')
  return receipt
}

export function runSecretVersionBootstrap({ execute = false, requestedProjectId, requestedSecretId, invoke, entropySource = crypto.randomBytes, observedAt }, profile = loadProfile()) {
  const plan = createSecretVersionBootstrapPlan(profile)
  if (requestedProjectId != null && requestedProjectId !== plan.target.projectId) fail('DEV013_ORGMASTER_SECRET_BOOTSTRAP_TARGET_INVALID', 'project')
  if (requestedSecretId != null && requestedSecretId !== plan.target.secretId) fail('DEV013_ORGMASTER_SECRET_BOOTSTRAP_TARGET_INVALID', 'secret')
  if (typeof invoke !== 'function') fail('DEV013_ORGMASTER_SECRET_PROVIDER_INVALID')
  const preflight = plan.providerCommands.preflight
  assertEmptyVersionHistory(invokeProvider(invoke, preflight.command, preflight.args))
  if (!execute) return { executed: false, plan, preflight: { existingVersionCount: 0, status: 'EMPTY' } }

  const entropy = entropySource(plan.guards.generatedEntropyBytes)
  if (!Buffer.isBuffer(entropy) || entropy.length < profile.secret.versionBootstrap.minimumEntropyBytes) {
    if (Buffer.isBuffer(entropy)) entropy.fill(0)
    fail('DEV013_ORGMASTER_SECRET_ENTROPY_INVALID')
  }
  const payload = Buffer.from(entropy.toString('base64url'), 'utf8')
  let stdout
  try {
    const add = plan.providerCommands.execute
    stdout = invokeProvider(invoke, add.command, add.args, payload)
  } finally {
    entropy.fill(0)
    payload.fill(0)
  }
  const created = providerVersion(parseProviderJson(stdout, 'DEV013_ORGMASTER_SECRET_VERSION_ADD_INVALID'), profile)
  const readback = plan.providerCommands.readback
  const readbackArgs = readback.args.map((value) => value === '<NUMERIC_VERSION>' ? created.version : value)
  const providerReadback = parseProviderJson(invokeProvider(invoke, readback.command, readbackArgs), 'DEV013_ORGMASTER_SECRET_VERSION_ADD_INVALID')
  const receipt = buildSecretVersionBootstrapReceipt({ plan, providerReadback, observedAt }, profile)
  return { executed: true, plan, receipt }
}

export const constants = Object.freeze({ ENVIRONMENT_NAME, PLAN_SCHEMA, RECEIPT_SCHEMA })
