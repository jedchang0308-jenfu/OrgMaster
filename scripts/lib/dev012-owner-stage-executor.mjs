import { spawnSync } from 'node:child_process'
import { gzipSync } from 'node:zlib'
import { assertImmutableRef, assertProtectedGitHubContext, assertRuntimeConfig, candidateTagUriMatches, canonicalize, releasePaths, sha256, stageReceipt } from './dev012-owner-release-runtime.mjs'
import { dev013L4SequenceStep, dev013TerminalTransitionFact } from './dev013-l4-transition-sequence.mjs'
import { buildDev014ConsumerConformance } from './dev014-consumer-conformance.mjs'
export { candidateTagUriMatches } from './dev012-owner-release-runtime.mjs'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const STAGES = new Set(['prepare', 'build', 'migrate', 'candidate', 'entrypoint', 'verify', 'decision', 'activate', 'canonical', 'finalize', 'rollback'])
const CONTROL_STATES = new Set(['CANDIDATE_CREATED', 'ENTRYPOINT_CONFIGURED', 'CANDIDATE_VERIFIED', 'GO', 'ACTIVE', 'CANONICAL_VERIFIED', 'ABORT_REQUESTED', 'FINALIZED'])
const DEV014_MANAGED_DIRECTORY_FIELDS = Object.freeze([
  'ORGMASTER_MANAGED_IDENTITY_ENABLED',
  'ORGMASTER_GOOGLE_DIRECTORY_CUSTOMER_ID',
  'ORGMASTER_GOOGLE_DIRECTORY_DOMAIN',
  'ORGMASTER_GOOGLE_DIRECTORY_DELEGATED_SUBJECT',
  'ORGMASTER_GOOGLE_DIRECTORY_DWD_SERVICE_ACCOUNT_EMAIL',
  'ORGMASTER_PLATFORM_LOGIN_CALLER_EMAIL',
  'ORGMASTER_PLATFORM_LOGIN_CALLER_SUBJECT',
])

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}:${detail}` : code)
  error.code = code
  throw error
}

export function readGitBlob(root, repositoryPath, revision = 'HEAD') {
  if ((!H40.test(revision) && revision !== 'HEAD') || !/^[A-Za-z0-9._/-]+$/u.test(repositoryPath ?? '') || repositoryPath.startsWith('/') || repositoryPath.includes('../')) fail('GIT_BLOB_REF_INVALID')
  const result = spawnSync('git', ['show', `${revision}:${repositoryPath}`], { cwd: root, encoding: null, maxBuffer: 32 * 1024 * 1024, windowsHide: true })
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) fail('GIT_SOURCE_INSPECTION_FAILED', repositoryPath)
  return result.stdout
}

export function parseOwnerStageArgs(argv, expectedBucket) {
  const value = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    if (!['--stage', '--capsule-ref', '--capsule-sha256'].includes(key) || !argv[index + 1]) fail('INVALID_ARGUMENTS', key)
    value[key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())] = argv[index + 1]
  }
  if (Object.keys(value).length !== 3 || !STAGES.has(value.stage) || !new RegExp(`^gs://${expectedBucket}/receipts/[A-Za-z0-9._/-]+\\.json$`, 'u').test(value.capsuleRef ?? '') || !H64.test(value.capsuleSha256 ?? '')) fail('INVALID_ARGUMENTS')
  return value
}

export function createGitArchive(root, sourceRevision) {
  if (!H40.test(sourceRevision ?? '')) fail('SOURCE_REVISION_INVALID')
  const run = (args, encoding = 'utf8') => {
    const result = spawnSync('git', args, { cwd: root, encoding, maxBuffer: 256 * 1024 * 1024, windowsHide: true })
    if (result.error || result.status !== 0) fail('GIT_SOURCE_INSPECTION_FAILED', args.join(' '))
    return result.stdout
  }
  if (String(run(['rev-parse', 'HEAD'])).trim() !== sourceRevision || String(run(['status', '--porcelain=v1', '--untracked-files=no'])).trim() !== '') fail('SOURCE_CHECKOUT_NOT_FROZEN')
  const bytes = run(['archive', '--format=tar', '--prefix=source/', sourceRevision], null)
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) fail('SOURCE_ARCHIVE_FAILED')
  return bytes
}

export function createGitSourceIdentity(root, sourceRevision) {
  if (!H40.test(sourceRevision ?? '')) fail('SOURCE_REVISION_INVALID')
  const run = (args, encoding = 'utf8') => {
    const result = spawnSync('git', args, { cwd: root, encoding, maxBuffer: 256 * 1024 * 1024, windowsHide: true })
    if (result.error || result.status !== 0) fail('GIT_SOURCE_INSPECTION_FAILED', args.join(' '))
    return result.stdout
  }
  if (String(run(['rev-parse', 'HEAD'])).trim() !== sourceRevision || String(run(['status', '--porcelain=v1', '--untracked-files=no'])).trim() !== '') fail('SOURCE_CHECKOUT_NOT_FROZEN')
  const bytes = run(['ls-tree', '-r', '-z', '--full-tree', sourceRevision], null)
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) fail('SOURCE_IDENTITY_FAILED')
  return bytes
}

function assertIntentBase(intent, profile, intentRef, intentSha256) {
  const exact = ['schemaVersion', 'ownerApplicationId', 'releaseId', 'sourceRevision', 'sourceSha256', 'sourceLockRef', 'authorizationPolicyRef', 'readinessReceiptRef', 'foundationReceiptRef', 'infraReceiptRef', 'runtimeConfigRef', 'migrationManifestSha256', 'previousRevision', 'deadlineAt'].sort()
  if (intent?.baselineIntentRef) { exact.push('baselineIntentRef'); exact.sort(); assertImmutableRef(intent.baselineIntentRef, profile.artifact.releaseBucket, ['receipts']) }
  if (!intent || JSON.stringify(Object.keys(intent).sort()) !== JSON.stringify(exact) || intent.schemaVersion !== profile.schemas.releaseIntent || intent.ownerApplicationId !== profile.application.id || !/^[A-Z0-9][A-Z0-9-]{5,63}$/u.test(intent.releaseId ?? '') || !H40.test(intent.sourceRevision ?? '') || !H64.test(intent.sourceSha256 ?? '') || !H64.test(intent.migrationManifestSha256 ?? '') || !intent.previousRevision || intent.previousRevision === 'latest' || !Number.isFinite(Date.parse(intent.deadlineAt)) || Date.parse(intent.deadlineAt) <= Date.now()) fail('RELEASE_INTENT_INVALID')
  if (intentRef.uri.split('/')[2] !== profile.artifact.releaseBucket || intentRef.sha256 !== intentSha256) fail('RELEASE_INTENT_REF_INVALID')
  for (const name of ['sourceLockRef', 'authorizationPolicyRef', 'readinessReceiptRef', 'foundationReceiptRef', 'infraReceiptRef', 'runtimeConfigRef']) {
    const ref = intent[name]
    if (!ref || ref.uri?.split('/')[2] !== profile.artifact.releaseBucket || !ref.uri?.startsWith(`gs://${profile.artifact.releaseBucket}/receipts/`) || !H64.test(ref.sha256 ?? '')) fail('RELEASE_INTENT_REF_INVALID', name)
  }
  return intent
}

function acceptedStatus(value, statuses) {
  return value && statuses.includes(value.status) && value.releaseAuthority === true && value.evidenceScope !== 'LOCAL_SYNTHETIC'
}

function assertControlledEnvironmentAuthority({ intent, profile, values, runtime }) {
  const rules = profile.environment?.controlledValues ?? {}
  const controlledEnvironment = Object.fromEntries(Object.keys(rules).sort().map((name) => [name, runtime.plainEnvironment?.[name]]))
  const isDev013 = values.readiness?.schemaVersion === 'jenfu.dev013.l4-owner-transition-readiness.v2'
  const isDev014 = values.readiness?.devId === 'DEV-014'
  const usesNonDefaultValue = Object.entries(rules).some(([name, rule]) => controlledEnvironment[name] !== rule.defaultValue)
  if (!isDev013) {
    if (isDev014) {
      if (values.readiness?.slice === '014-PRODUCER-CONTRACT') {
        const expectedRemediation = {
          kind: 'MANAGED_IDENTITY_LIFECYCLE_CONTRACT_COMPLETION',
          migrationVersion: 'dev014-orgmaster-016',
          contractVersion: 'jenfu.orgmaster-contract.managed-identity-lifecycle.v1',
          consumerApplicationId: 'platform',
        }
        if (!intent.baselineIntentRef
          || values.authorization?.schemaVersion !== 'orgmaster.routine-release-authorization.v1'
          || values.authorization.authorizationBasis !== 'OPERATOR_INVOKED_DEPLOY_PRODUCTION'
          || values.authorization.devId !== 'DEV-014' || values.authorization.slice !== '014-PRODUCER-CONTRACT'
          || values.readiness?.schemaVersion !== 'orgmaster.routine-release-readiness.v1'
          || values.authorization.ownerApplicationId !== profile.application.id || values.readiness.ownerApplicationId !== profile.application.id
          || values.authorization.sourceRevision !== intent.sourceRevision || values.readiness.sourceRevision !== intent.sourceRevision
          || values.authorization.releaseId !== intent.releaseId || values.readiness.releaseId !== intent.releaseId
          || canonicalize(values.authorization.baselineIntentRef) !== canonicalize(intent.baselineIntentRef)
          || canonicalize(values.readiness.baselineIntentRef) !== canonicalize(intent.baselineIntentRef)
          || canonicalize(values.authorization.remediation) !== canonicalize(expectedRemediation)
          || canonicalize(values.readiness.remediation) !== canonicalize(expectedRemediation)) fail('CONTROLLED_ENVIRONMENT_AUTHORITY_INVALID')
        return { releaseMode: 'DEV014_PRODUCER_CONTRACT_REMEDIATION', remediation: expectedRemediation }
      }
      const expectedActivation = {
        kind: 'MANAGED_DIRECTORY_RUNTIME_ACTIVATION',
        addedPlainEnvironmentNames: DEV014_MANAGED_DIRECTORY_FIELDS,
        directoryScope: 'https://www.googleapis.com/auth/admin.directory.user.readonly',
      }
      if (!intent.baselineIntentRef
        || values.authorization?.schemaVersion !== 'orgmaster.routine-release-authorization.v1'
        || values.authorization.authorizationBasis !== 'OPERATOR_INVOKED_DEPLOY_PRODUCTION'
        || values.authorization.devId !== 'DEV-014' || values.authorization.slice !== '014-LOGIN'
        || values.readiness?.schemaVersion !== 'orgmaster.routine-release-readiness.v1'
        || values.readiness.slice !== '014-LOGIN'
        || values.authorization.ownerApplicationId !== profile.application.id || values.readiness.ownerApplicationId !== profile.application.id
        || values.authorization.sourceRevision !== intent.sourceRevision || values.readiness.sourceRevision !== intent.sourceRevision
        || values.authorization.releaseId !== intent.releaseId || values.readiness.releaseId !== intent.releaseId
        || canonicalize(values.authorization.baselineIntentRef) !== canonicalize(intent.baselineIntentRef)
        || canonicalize(values.readiness.baselineIntentRef) !== canonicalize(intent.baselineIntentRef)
        || canonicalize(values.authorization.activation) !== canonicalize(expectedActivation)
        || canonicalize(values.readiness.activation) !== canonicalize(expectedActivation)) fail('CONTROLLED_ENVIRONMENT_AUTHORITY_INVALID')
      return { releaseMode: 'DEV014_MANAGED_DIRECTORY_ACTIVATION', activation: expectedActivation }
    }
    if (!usesNonDefaultValue) return { releaseMode: 'DEFAULT_CONTROLLED_ENVIRONMENT' }
    if (!intent.baselineIntentRef
      || values.authorization?.schemaVersion !== 'orgmaster.routine-release-authorization.v1'
      || values.authorization.authorizationBasis !== 'OPERATOR_INVOKED_DEPLOY_PRODUCTION'
      || values.readiness?.schemaVersion !== 'orgmaster.routine-release-readiness.v1'
      || values.authorization.ownerApplicationId !== profile.application.id || values.readiness.ownerApplicationId !== profile.application.id
      || values.authorization.sourceRevision !== intent.sourceRevision || values.readiness.sourceRevision !== intent.sourceRevision
      || values.authorization.releaseId !== intent.releaseId || values.readiness.releaseId !== intent.releaseId
      || canonicalize(values.authorization.baselineIntentRef) !== canonicalize(intent.baselineIntentRef)
      || canonicalize(values.readiness.baselineIntentRef) !== canonicalize(intent.baselineIntentRef)) fail('CONTROLLED_ENVIRONMENT_AUTHORITY_INVALID')
    return { releaseMode: 'ROUTINE_CONTROLLED_ENVIRONMENT_CARRY_FORWARD' }
  }
  const transition = values.readiness?.transition
  const predecessor = transition?.predecessorReceiptRef
  const previousControlledEnvironment = values.readiness?.previousControlledEnvironment
  let expectedSequenceStep = null
  try { expectedSequenceStep = dev013L4SequenceStep(profile.application.id, transition, previousControlledEnvironment, controlledEnvironment) } catch {}
  if (values.authorization?.schemaVersion !== 'jenfu.dev013.l4-owner-transition-authorization.v1' || values.authorization.authorizationBasis !== 'OPERATOR_INVOKED_DEV013_L4'
    || values.readiness?.schemaVersion !== 'jenfu.dev013.l4-owner-transition-readiness.v2' || values.readiness.devId !== 'DEV-013' || values.readiness.slice !== '013-R1'
    || values.authorization.ownerApplicationId !== profile.application.id || values.readiness.ownerApplicationId !== profile.application.id
    || values.authorization.sourceRevision !== intent.sourceRevision || values.readiness.sourceRevision !== intent.sourceRevision || values.authorization.releaseId !== intent.releaseId || values.readiness.releaseId !== intent.releaseId
    || canonicalize(values.readiness.controlledEnvironment) !== canonicalize(controlledEnvironment)
    || canonicalize(values.readiness.sequenceStep) !== canonicalize(expectedSequenceStep)
    || values.readiness.sequenceRoot?.schemaVersion !== 'jenfu.dev013.l4-sequence-root.v2'
    || !Object.hasOwn(rules, transition?.field) || transition.to !== controlledEnvironment[transition.field] || (transition.from !== null && !rules[transition.field].allowedValues.includes(transition.from)) || !rules[transition.field].allowedValues.includes(transition.to) || transition.from === transition.to
    || !['guard', 'activate', 'rollback'].includes(transition.action)
    || transition.from !== previousControlledEnvironment?.[transition.field]
    || (transition.action === 'guard' && (transition.from !== null || transition.to !== rules[transition.field].defaultValue))
    || !predecessor || canonicalize(Object.keys(predecessor).sort()) !== canonicalize(['sha256', 'uri']) || typeof predecessor.uri !== 'string' || predecessor.uri.length < 8 || !H64.test(predecessor.sha256 ?? '')) fail('CONTROLLED_ENVIRONMENT_AUTHORITY_INVALID')
  return { releaseMode: 'DEV013_CONTROLLED_ENVIRONMENT' }
}

export function assertPreparePrerequisites({ intent, profile, values }) {
  const revision = values.sourceLock.sourceRevision ?? values.sourceLock.headRevision ?? values.sourceLock.head
  const clean = values.sourceLock.clean ?? values.sourceLock.workingTree?.isClean
  if (!acceptedStatus(values.sourceLock, ['PASS', 'SOURCE_FROZEN']) || revision !== intent.sourceRevision || clean !== true) fail('SOURCE_LOCK_NOT_RELEASE_AUTHORITY')
  for (const name of ['authorization', 'readiness']) {
    const value = values[name]
    if (!acceptedStatus(value, ['PASS', 'READY']) || value.environment !== 'production' || value.remainingHumanAction !== 0 || !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= Date.now()) fail('PREPARE_PREREQUISITE_INVALID', name)
  }
  for (const name of ['foundation', 'infra', 'runtimeConfig']) if (!acceptedStatus(values[name], ['PASS', 'APPLIED', 'VERIFIED'])) fail('PREPARE_PREREQUISITE_INVALID', name)
  const project = (value) => value.projectId ?? value.targetProjectId
  if ([values.readiness, values.foundation, values.infra, values.runtimeConfig].some((value) => project(value) !== profile.target.projectId)) fail('PREPARE_TARGET_MISMATCH')
  const runtime = values.runtimeConfig.runtimeConfig ?? values.runtimeConfig
  assertRuntimeConfig(profile, runtime)
  const controlledEnvironmentAuthority = assertControlledEnvironmentAuthority({ intent, profile, values, runtime })
  const migrationRunnerDigest = values.infra.migrationRunnerDigest ?? values.infra.artifacts?.migrationRunnerDigest
  if (!migrationRunnerDigest?.startsWith(`${profile.artifact.migrationRunnerUri}@sha256:`)) fail('MIGRATION_RUNNER_PROVENANCE_MISSING')
  return { runtimeConfig: runtime, migrationRunnerDigest, controlledEnvironmentAuthority }
}

function assertStage(value, profile, intent, stage) {
  if (value?.schemaVersion !== 'jenfu.dev012.stage-receipt.v1' || value.ownerApplicationId !== profile.application.id || value.sourceRevision !== intent.sourceRevision || value.stage !== stage || value.status !== 'PASS') fail('STAGE_RECEIPT_INVALID', stage)
  const core = { ...value }
  delete core.receiptSha256
  if (value.receiptSha256 !== sha256(canonicalize(core))) fail('STAGE_RECEIPT_HASH_INVALID', stage)
  return value
}

async function readNamedJson(transport, uri, profile, expectedSha256 = null, prefixes = ['receipts']) {
  const readback = await transport.readBytes(uri, { prefixes, expectedSha256 })
  let value
  try { value = JSON.parse(readback.bytes.toString('utf8')) } catch { fail('GCS_JSON_INVALID') }
  if (readback.ref.uri.split('/')[2] !== profile.artifact.releaseBucket) fail('OWNER_BUCKET_MISMATCH')
  return { ...readback, value }
}

async function optionalNamedJson(transport, uri, profile, prefixes = ['receipts']) {
  try { return await readNamedJson(transport, uri, profile, null, prefixes) } catch (error) { if (error?.code === 'MISSING') return null; throw error }
}

async function readStage(transport, paths, profile, intent, stage) {
  const result = await readNamedJson(transport, paths[stage], profile)
  assertStage(result.value, profile, intent, stage)
  return result
}

async function writeStage(transport, paths, profile, intent, stage, previousReceiptRef, facts) {
  const value = stageReceipt({ profile, intent, stage, previousReceiptRef, facts, observedAt: transport.now() })
  const result = await transport.putJson(paths[stage], value, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
  return { ...result, value }
}

function assertMigrationReceipt(value, profile, intent, { historical = false, allowForward = false, forwardPlan = null } = {}) {
  if (value?.schemaVersion === 'jenfu.dev012.stage-receipt.v1') {
    assertStage(value, profile, intent, 'migrate')
    if (value.facts?.disposition !== 'UNCHANGED_VERIFIED' || value.facts?.manifestSha256 !== intent.migrationManifestSha256 || canonicalize(value.facts?.baselineIntentRef) !== canonicalize(intent.baselineIntentRef)) fail('MIGRATION_RECEIPT_INVALID')
    // Legacy migration receipts remain readable for rollback, never executable.
  } else {
    if ((!historical && !allowForward) || value?.schemaVersion !== 'jenfu.dev012.migration-receipt.v1' || value.ownerApplicationId !== profile.application.id || value.sourceRevision !== intent.sourceRevision || value.manifestSha256 !== intent.migrationManifestSha256 || value.status !== 'PASS' || value.boundaryStatus !== 'PASS') fail('MIGRATION_RECEIPT_INVALID')
    if (allowForward) {
      const { receiptSha256, ...core } = value
      const producerContractRemediation = forwardPlan?.releaseMode === 'DEV014_PRODUCER_CONTRACT_REMEDIATION'
      const expectedLedgerCount = producerContractRemediation ? 16 : 15
      const maximumAppliedCount = producerContractRemediation ? 1 : 4
      const recoveryCountsValid = Number.isInteger(value.applied) && value.applied >= 0 && value.applied <= maximumAppliedCount && value.replayed === expectedLedgerCount - value.applied
      if (receiptSha256 !== sha256(canonicalize(core)) || value.baselineCount !== 10 || value.minimumLedgerCount !== 10 || value.ledgerCount !== expectedLedgerCount || !recoveryCountsValid || value.crossDatabaseDenials?.length !== 2 || value.crossDatabaseDenials.some((row) => !['jenfu_dev', 'jenfu_stg'].includes(row.database) || row.denied !== true)) fail('MIGRATION_RECEIPT_INVALID')
    }
  }
}

function assertDeployment(value, profile, intent, intentRef, intentSha256) {
  if (value?.schemaVersion !== profile.schemas.deploymentCapsule || value.ownerApplicationId !== profile.application.id || value.releaseIntentRef?.uri !== intentRef.uri || value.releaseIntentRef?.sha256 !== intentRef.sha256 || value.releaseIntentSha256 !== intentSha256 || value.sourceRevision !== intent.sourceRevision || value.deadlineAt !== intent.deadlineAt) fail('DEPLOYMENT_CAPSULE_JOIN_INVALID')
  if (!value.artifactDigest?.startsWith(`${profile.artifact.uri}@sha256:`) || !value.migrationRunnerDigest?.startsWith(`${profile.artifact.migrationRunnerUri}@sha256:`)) fail('DEPLOYMENT_ARTIFACT_INVALID')
  if (!H64.test(value.sourceObject?.sha256 ?? '') || !/^[1-9][0-9]*$/u.test(String(value.sourceObject?.generation ?? '')) || typeof value.sourceObject?.crc32c !== 'string') fail('DEPLOYMENT_SOURCE_INVALID')
  for (const name of ['migrationBundleRef', 'buildReceiptRef', 'provenanceReceiptRef', 'sbomReceiptRef', 'scanReceiptRef']) if (!value[name]?.uri || !H64.test(value[name]?.sha256 ?? '')) fail('DEPLOYMENT_EVIDENCE_REF_INVALID', name)
  return value
}

async function readDeployment(transport, paths, profile, intent, intentRef, intentSha256) {
  const result = await readNamedJson(transport, paths.deployment, profile)
  assertDeployment(result.value, profile, intent, intentRef, intentSha256)
  return result
}

async function readIntentAndPaths({ transport, profile, capsuleRef, capsuleSha256, validateIntent }) {
  const intentRef = { uri: capsuleRef, sha256: capsuleSha256 }
  const result = await transport.readJson(intentRef, profile.artifact.releaseBucket, ['receipts'])
  if (validateIntent) validateIntent(result.value, profile)
  const intent = assertIntentBase(result.value, profile, intentRef, capsuleSha256)
  return { intent, intentRef, intentReadback: result, paths: releasePaths(profile, intent, capsuleSha256) }
}

export function assertStaleControlSafeToSupersede({ current, profile, intent, ownerRun, service, activeRevision, now, candidate = null, nextState = null }) {
  const expected = ['schemaVersion', 'inputFingerprint', 'ownerApplicationId', 'service', 'controlBucket', 'releaseId', 'sourceRevision', 'sourceLockSha256', 'candidateRevision', 'previousRevision', 'ownerRunRef', 'leaseExpiresAt', 'deadlineAt', 'state', 'result', 'controlSha256'].sort()
  if (!current || JSON.stringify(Object.keys(current).sort()) !== JSON.stringify(expected)) fail('CONTROL_HEAD_INVALID')
  const { controlSha256, ...core } = current
  const runPrefix = `https://api.github.com/repos/${profile.application.repository}/actions/runs/`
  const runId = current.ownerRunRef?.startsWith(runPrefix) ? current.ownerRunRef.slice(runPrefix.length) : ''
  if (controlSha256 !== sha256(canonicalize(core)) || current.schemaVersion !== 'jenfu.dev012.owner-control-head.v1'
    || current.ownerApplicationId !== profile.application.id || current.service !== profile.target.serviceName
    || current.controlBucket !== profile.artifact.releaseBucket || !H64.test(current.inputFingerprint ?? '')
    || !H40.test(current.sourceRevision ?? '') || !H64.test(current.sourceLockSha256 ?? '')
    || !CONTROL_STATES.has(current.state) || !/^[1-9][0-9]*$/u.test(runId)
    || !Number.isFinite(Date.parse(current.leaseExpiresAt)) || !Number.isFinite(Date.parse(now))) fail('CONTROL_HEAD_INVALID')
  if (Date.parse(current.leaseExpiresAt) >= Date.parse(now)
    || ownerRun?.id !== runId || ownerRun.status !== 'completed' || !ownerRun.conclusion
    || ownerRun.event !== 'workflow_dispatch' || ownerRun.headSha !== current.sourceRevision
    || current.previousRevision !== intent.previousRevision || activeRevision !== intent.previousRevision) fail('CONTROL_HEAD_TAKEOVER_UNSAFE')
  const configuredTags = (service?.traffic ?? []).filter((row) => row?.tag)
  const observedTags = (service?.trafficStatuses ?? []).filter((row) => row?.tag)
  if (nextState === 'CANDIDATE_CREATED') {
    const matches = (row) => row.tag === candidate?.tag && row.revision === candidate?.candidateRevision && Number(row.percent ?? 0) === 0
    if (!candidate?.tag || !candidate?.candidateRevision || configuredTags.length !== 1 || observedTags.length !== 1
      || !configuredTags.every(matches) || !observedTags.every(matches)) fail('CONTROL_HEAD_TAKEOVER_UNSAFE')
  } else if (configuredTags.length !== 0 || observedTags.length !== 0) fail('CONTROL_HEAD_TAKEOVER_UNSAFE')
  return true
}

async function writeControl({ transport, paths, profile, intent, fingerprint, candidate, state, result = null, environment }) {
  const current = await optionalNamedJson(transport, paths.control, profile, ['control'])
  if (current && current.value.inputFingerprint !== fingerprint && current.value.state !== 'FINALIZED') {
    const [ownerRun, service] = await Promise.all([
      transport.readOwnerRun(profile, current.value.ownerRunRef),
      transport.getService(profile),
    ])
    transport.assertServiceSettled(service, 'CONTROL_HEAD_TAKEOVER_UNSAFE')
    assertStaleControlSafeToSupersede({ current: current.value, profile, intent, ownerRun, service, activeRevision: transport.effectiveRevision(service), now: transport.now(), candidate, nextState: state })
  }
  if (current?.value.inputFingerprint === fingerprint) {
    const transitions = {
      CANDIDATE_CREATED: ['ENTRYPOINT_CONFIGURED', 'FINALIZED'],
      ENTRYPOINT_CONFIGURED: ['CANDIDATE_VERIFIED', 'FINALIZED'],
      CANDIDATE_VERIFIED: ['GO', 'FINALIZED'],
      GO: ['ACTIVE', 'FINALIZED'],
      ACTIVE: ['CANONICAL_VERIFIED', 'FINALIZED'],
      CANONICAL_VERIFIED: ['FINALIZED'],
      ABORT_REQUESTED: ['FINALIZED'],
      FINALIZED: [],
    }
    if (current.value.state === state && current.value.result === result) return current
    if (!(transitions[current.value.state] ?? []).includes(state)) fail('CONTROL_HEAD_TRANSITION_DENIED', `${current.value.state}->${state}`)
  }
  const expires = new Date(Math.min(Date.parse(intent.deadlineAt), Date.now() + 120_000)).toISOString()
  const core = {
    schemaVersion: 'jenfu.dev012.owner-control-head.v1', inputFingerprint: fingerprint, ownerApplicationId: profile.application.id,
    service: profile.target.serviceName, controlBucket: profile.artifact.releaseBucket, releaseId: intent.releaseId,
    sourceRevision: intent.sourceRevision, sourceLockSha256: intent.sourceLockRef.sha256, candidateRevision: candidate?.candidateRevision ?? null,
    previousRevision: intent.previousRevision, ownerRunRef: `https://api.github.com/repos/${profile.application.repository}/actions/runs/${environment.GITHUB_RUN_ID}`,
    leaseExpiresAt: expires, deadlineAt: intent.deadlineAt, state, result,
  }
  const value = { ...core, controlSha256: sha256(canonicalize(core)) }
  return transport.putJson(paths.control, value, { bucket: profile.artifact.releaseBucket, prefix: 'control', ifGenerationMatch: current ? String(current.metadata.generation) : '0' })
}

function publicBuildReceipt(build) {
  return { name: build.name, id: build.id, projectId: build.projectId, status: build.status, serviceAccount: build.serviceAccount, createTime: build.createTime, startTime: build.startTime, finishTime: build.finishTime, sourceProvenance: build.sourceProvenance, results: build.results, options: build.options }
}

export async function executeOwnerStage({ stage, capsuleRef, capsuleSha256, profile, profileSha256 = profile?.contractSha256, transport, environment = process.env, validateIntent, createSourceIdentity, createSourceArchive, buildMigrationBundle, verifyRoutineRelease }) {
  if (!STAGES.has(stage)) fail('STAGE_DENIED')
  const { intent, intentRef, paths } = await readIntentAndPaths({ transport, profile, capsuleRef, capsuleSha256, validateIntent })
  const fingerprint = sha256(canonicalize({ ownerApplicationId: profile.application.id, releaseId: intent.releaseId, sourceRevision: intent.sourceRevision, releaseIntentSha256: capsuleSha256 }))

  if (stage !== 'rollback') {
    assertProtectedGitHubContext(profile, intent, environment)
    if (!intent.baselineIntentRef) fail('RELEASE_BASELINE_REQUIRED')
  }

  if (stage === 'prepare') {
    const existing = await optionalNamedJson(transport, paths.prepare, profile)
    if (existing) {
      assertStage(existing.value, profile, intent, 'prepare')
      return existing
    }
    const names = { sourceLock: 'sourceLockRef', authorization: 'authorizationPolicyRef', readiness: 'readinessReceiptRef', foundation: 'foundationReceiptRef', infra: 'infraReceiptRef', runtimeConfig: 'runtimeConfigRef' }
    const entries = await Promise.all(Object.entries(names).map(async ([name, field]) => [name, (await transport.readJson(intent[field], profile.artifact.releaseBucket, ['receipts'])).value]))
    const values = Object.fromEntries(entries)
    const derived = assertPreparePrerequisites({ intent, profile, values })
    const service = await transport.getService(profile)
    transport.assertServiceSettled(service, 'PREPARE_BASELINE_MISMATCH')
    if (transport.effectiveRevision(service) !== intent.previousRevision) fail('PREPARE_BASELINE_MISMATCH')
    if (!verifyRoutineRelease) fail('ROUTINE_VERIFIER_REQUIRED')
    const routine = await verifyRoutineRelease({ intent, values, service })
    if (derived.controlledEnvironmentAuthority.releaseMode === 'ROUTINE_CONTROLLED_ENVIRONMENT_CARRY_FORWARD' && routine.releaseMode !== 'ROUTINE_UNCHANGED_RUNTIME') fail('CONTROLLED_ENVIRONMENT_BASELINE_MISMATCH')
    return writeStage(transport, paths, profile, intent, 'prepare', null, { prerequisiteRefs: Object.fromEntries(Object.entries(names).map(([name, field]) => [name, intent[field]])), previousRevision: intent.previousRevision, runtimeServiceAccount: derived.runtimeConfig.runtimeServiceAccount, migrationRunnerDigest: derived.migrationRunnerDigest, routine, entrypointBaseline: transport.entrypointSnapshot(service), remainingHumanAction: 0 })
  }

  if (stage === 'build') {
    const prepare = await readStage(transport, paths, profile, intent, 'prepare')
    const existing = await optionalNamedJson(transport, paths.deployment, profile)
    if (existing) {
      assertDeployment(existing.value, profile, intent, intentRef, capsuleSha256)
      await readStage(transport, paths, profile, intent, 'build')
      return existing
    }
    const sourceIdentityBytes = await createSourceIdentity(intent.sourceRevision)
    if (!Buffer.isBuffer(sourceIdentityBytes) || sha256(sourceIdentityBytes) !== intent.sourceSha256) fail('SOURCE_IDENTITY_HASH_MISMATCH')
    const sourceBytes = await createSourceArchive(intent.sourceRevision)
    if (!Buffer.isBuffer(sourceBytes) || sourceBytes.length === 0) fail('SOURCE_ARCHIVE_FAILED')
    const sourceUri = `gs://${profile.artifact.releaseBucket}/source/releases/${intent.releaseId}/${capsuleSha256}/source.tar.gz`
    const sourceArchive = gzipSync(sourceBytes, { level: 9 })
    const source = await transport.putBytes(sourceUri, sourceArchive, { bucket: profile.artifact.releaseBucket, prefix: 'source', contentType: 'application/gzip' })
    const migration = await buildMigrationBundle(intent.sourceRevision)
    if (migration.bundle?.manifestSha256 !== intent.migrationManifestSha256 || sha256(migration.bytes) !== migration.bundleSha256) fail('MIGRATION_MANIFEST_MISMATCH')
    const bundleUri = `gs://${profile.artifact.releaseBucket}/${profile.artifact.migrationBundlePrefix}/${intent.sourceRevision}/${migration.bundle.manifestSha256}.json`
    const bundle = await transport.putBytes(bundleUri, migration.bytes, { bucket: profile.artifact.releaseBucket, prefix: profile.artifact.migrationBundlePrefix, contentType: 'application/json' })
    const build = await transport.createBuild({ profile, intent, sourceObject: source, deadlineAt: intent.deadlineAt })
    const artifact = await transport.readArtifactImage(profile, build.artifactDigest)
    const analysis = await transport.waitArtifactEvidence({ profile, artifactDigest: build.artifactDigest, deadlineAt: intent.deadlineAt })
    const provenance = await transport.putJson(paths.provenance, { schemaVersion: 'jenfu.dev012.build-provenance-receipt.v1', ownerApplicationId: profile.application.id, sourceRevision: intent.sourceRevision, sourceObject: { ...source.ref, generation: String(source.metadata.generation), crc32c: source.metadata.crc32c }, artifactDigest: build.artifactDigest, cloudBuild: publicBuildReceipt(build.build), artifactRegistry: artifact, status: 'PASS' }, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
    const sbom = await transport.putJson(paths.sbom, { schemaVersion: 'jenfu.dev012.sbom-receipt.v1', ownerApplicationId: profile.application.id, sourceRevision: intent.sourceRevision, artifactDigest: build.artifactDigest, ...analysis.sbomExport, occurrenceNames: analysis.sbomOccurrenceNames, status: 'PASS' }, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
    const scan = await transport.putJson(paths.scan, { schemaVersion: 'jenfu.dev012.scan-receipt.v1', ownerApplicationId: profile.application.id, sourceRevision: intent.sourceRevision, artifactDigest: build.artifactDigest, buildOccurrenceNames: analysis.buildOccurrenceNames, discoveryOccurrenceNames: analysis.discoveryOccurrenceNames, vulnerabilityCount: analysis.vulnerabilityCount, blockingVulnerabilityCount: analysis.blockingVulnerabilityCount, maximumAllowedSeverity: profile.build.maximumAllowedSeverity, observedAt: analysis.observedAt, status: 'PASS' }, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
    const buildStage = await writeStage(transport, paths, profile, intent, 'build', prepare.ref, { artifactDigest: build.artifactDigest, sourceObject: { ...source.ref, generation: String(source.metadata.generation), crc32c: source.metadata.crc32c }, migrationBundleRef: bundle.ref, provenanceReceiptRef: provenance.ref, sbomReceiptRef: sbom.ref, scanReceiptRef: scan.ref })
    const deployment = { schemaVersion: profile.schemas.deploymentCapsule, ownerApplicationId: profile.application.id, releaseIntentRef: intentRef, releaseIntentSha256: capsuleSha256, sourceRevision: intent.sourceRevision, sourceObject: { ...source.ref, generation: String(source.metadata.generation), crc32c: source.metadata.crc32c }, artifactDigest: build.artifactDigest, migrationBundleRef: bundle.ref, migrationRunnerDigest: prepare.value.facts.migrationRunnerDigest, buildReceiptRef: buildStage.ref, provenanceReceiptRef: provenance.ref, sbomReceiptRef: sbom.ref, scanReceiptRef: scan.ref, deadlineAt: intent.deadlineAt }
    assertDeployment(deployment, profile, intent, intentRef, capsuleSha256)
    return transport.putJson(paths.deployment, deployment, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
  }

  if (stage === 'migrate') {
    const deployment = await readDeployment(transport, paths, profile, intent, intentRef, capsuleSha256)
    const existing = await optionalNamedJson(transport, paths.migrate, profile)
    const prepare = await readStage(transport, paths, profile, intent, 'prepare')
    if (!prepare.value.facts.routine?.baselineMigrationRef || canonicalize(prepare.value.facts.routine.baselineIntentRef) !== canonicalize(intent.baselineIntentRef)) fail('ROUTINE_VERIFICATION_MISSING')
    const allowForward = prepare.value.facts.routine.migrationDisposition === 'FORWARD_APPLY'
    if (!allowForward && prepare.value.facts.routine.migrationDisposition !== 'UNCHANGED_VERIFIED') fail('ROUTINE_MIGRATION_DISPOSITION_INVALID')
    let receipt = existing
    if (allowForward) {
      if (!receipt) {
        await transport.runMigrationJob({ profile, deployment: deployment.value, outputUri: paths.migrate, deadlineAt: intent.deadlineAt })
        receipt = await readNamedJson(transport, paths.migrate, profile)
      }
    } else receipt ??= await writeStage(transport, paths, profile, intent, 'migrate', prepare.ref, { ...prepare.value.facts.routine, disposition: 'UNCHANGED_VERIFIED', manifestSha256: intent.migrationManifestSha256, migrationsExecuted: 0, dataImportsExecuted: 0 })
    assertMigrationReceipt(receipt.value, profile, intent, { allowForward, forwardPlan: prepare.value.facts.routine })
    return receipt
  }

  if (stage === 'candidate') {
    const deployment = await readDeployment(transport, paths, profile, intent, intentRef, capsuleSha256)
    const migration = await readNamedJson(transport, paths.migrate, profile)
    const prepare = await readStage(transport, paths, profile, intent, 'prepare')
    assertMigrationReceipt(migration.value, profile, intent, { allowForward: prepare.value.facts.routine?.migrationDisposition === 'FORWARD_APPLY', forwardPlan: prepare.value.facts.routine })
    const runtimeReceipt = await transport.readJson(intent.runtimeConfigRef, profile.artifact.releaseBucket, ['receipts'])
    const runtimeConfig = runtimeReceipt.value.runtimeConfig ?? runtimeReceipt.value
    const candidate = await transport.createCandidate({ profile, artifactDigest: deployment.value.artifactDigest, runtimeConfig, fingerprint, deadlineAt: intent.deadlineAt })
    if (candidate.previousRevision !== intent.previousRevision) fail('CANDIDATE_BASELINE_MISMATCH')
    const result = await writeStage(transport, paths, profile, intent, 'candidate', migration.ref, { deploymentCapsuleRef: deployment.ref, migrationReceiptRef: migration.ref, ...candidate })
    await writeControl({ transport, paths, profile, intent, fingerprint, candidate, state: 'CANDIDATE_CREATED', environment })
    return result
  }

  if (stage === 'entrypoint') {
    if (!H64.test(profileSha256 ?? '')) fail('OWNER_PROFILE_SHA256_INVALID')
    const candidate = await readStage(transport, paths, profile, intent, 'candidate')
    const entrypoint = await transport.configureEntrypoint({ profile, candidate: candidate.value.facts, previousRevision: intent.previousRevision, deadlineAt: intent.deadlineAt })
    const result = await writeStage(transport, paths, profile, intent, 'entrypoint', candidate.ref, { profileSha256, canonicalOrigin: profile.target.canonicalOrigin, ...entrypoint })
    await writeControl({ transport, paths, profile, intent, fingerprint, candidate: candidate.value.facts, state: 'ENTRYPOINT_CONFIGURED', environment })
    return result
  }

  if (stage === 'verify') {
    const candidate = await readStage(transport, paths, profile, intent, 'candidate')
    const entrypoint = await readStage(transport, paths, profile, intent, 'entrypoint')
    if (entrypoint.value.previousReceiptRef?.uri !== candidate.ref.uri || entrypoint.value.previousReceiptRef?.sha256 !== candidate.ref.sha256 || entrypoint.value.facts.profileSha256 !== profileSha256) fail('ENTRYPOINT_RECEIPT_JOIN_INVALID')
    const service = await transport.getService(profile)
    transport.assertCanonicalEntrypoint(profile, service)
    const tag = service.trafficStatuses?.find((row) => row.tag === candidate.value.facts.tag)
    if (tag?.revision !== candidate.value.facts.candidateRevision || Number(tag.percent ?? 0) !== 0 || !candidateTagUriMatches(service, candidate.value.facts, tag.uri) || transport.effectiveRevision(service) !== intent.previousRevision) fail('CANDIDATE_TAG_READBACK_MISMATCH')
    const revision = await transport.getRevision(profile, candidate.value.facts.candidateRevision)
    transport.assertRevisionReady(profile, revision, candidate.value.facts.artifactDigest, candidate.value.facts.cloudSqlProxyResolvedImage)
    const smoke = await transport.runInternalCandidateSmoke({ profile, origin: candidate.value.facts.tagUri, candidateTag: candidate.value.facts.tag, candidateRevision: candidate.value.facts.candidateRevision, artifactDigest: candidate.value.facts.artifactDigest, deadlineAt: intent.deadlineAt, environment })
    const result = await writeStage(transport, paths, profile, intent, 'verify', entrypoint.ref, { candidateReceiptRef: candidate.ref, entrypointReceiptRef: entrypoint.ref, candidateRevision: candidate.value.facts.candidateRevision, artifactDigest: candidate.value.facts.artifactDigest, tagUri: candidate.value.facts.tagUri, providerTagUri: tag.uri, smoke, sideEffects: profile.sideEffects })
    await writeControl({ transport, paths, profile, intent, fingerprint, candidate: candidate.value.facts, state: 'CANDIDATE_VERIFIED', environment })
    return result
  }

  if (stage === 'decision') {
    const verify = await readStage(transport, paths, profile, intent, 'verify')
    if (verify.value.facts.smoke?.status !== 'PASS' || Object.values(profile.sideEffects).some((value) => !String(value).startsWith('DISABLED'))) fail('MACHINE_DECISION_NO_GO')
    const result = await writeStage(transport, paths, profile, intent, 'decision', verify.ref, { decision: 'GO', candidateRevision: verify.value.facts.candidateRevision, artifactDigest: verify.value.facts.artifactDigest, verifyReceiptRef: verify.ref, remainingHumanAction: 0 })
    await writeControl({ transport, paths, profile, intent, fingerprint, candidate: verify.value.facts, state: 'GO', environment })
    return result
  }

  if (stage === 'activate') {
    const decision = await readStage(transport, paths, profile, intent, 'decision')
    if (decision.value.facts.decision !== 'GO') fail('MACHINE_DECISION_NO_GO')
    const candidate = await readStage(transport, paths, profile, intent, 'candidate')
    const service = await transport.setTraffic({ profile, revision: candidate.value.facts.candidateRevision, candidateTag: candidate.value.facts.tag, deadlineAt: intent.deadlineAt })
    transport.assertCanonicalEntrypoint(profile, service)
    const result = await writeStage(transport, paths, profile, intent, 'activate', decision.ref, { decisionReceiptRef: decision.ref, candidateRevision: candidate.value.facts.candidateRevision, artifactDigest: candidate.value.facts.artifactDigest, effectiveRevision: transport.effectiveRevision(service), serviceEtag: service.etag, canonicalOrigin: profile.target.canonicalOrigin, ingress: service.ingress, defaultUriDisabled: service.defaultUriDisabled === true, invokerIamDisabled: service.invokerIamDisabled === true })
    await writeControl({ transport, paths, profile, intent, fingerprint, candidate: candidate.value.facts, state: 'ACTIVE', environment })
    return result
  }

  if (stage === 'canonical') {
    const activate = await readStage(transport, paths, profile, intent, 'activate')
    const candidate = await readStage(transport, paths, profile, intent, 'candidate')
    const service = await transport.getService(profile)
    if (transport.effectiveRevision(service) !== candidate.value.facts.candidateRevision) fail('CANONICAL_REVISION_MISMATCH')
    transport.assertCanonicalEntrypoint(profile, service)
    const revision = await transport.getRevision(profile, candidate.value.facts.candidateRevision)
    try { transport.assertRevisionReady(profile, revision, candidate.value.facts.artifactDigest, candidate.value.facts.cloudSqlProxyResolvedImage) } catch { fail('CANONICAL_ARTIFACT_MISMATCH') }
    const smoke = await transport.runAuthenticatedSmoke({ profile, origin: profile.target.canonicalOrigin, environment })
    const result = await writeStage(transport, paths, profile, intent, 'canonical', activate.ref, { activationReceiptRef: activate.ref, origin: profile.target.canonicalOrigin, candidateRevision: candidate.value.facts.candidateRevision, artifactDigest: candidate.value.facts.artifactDigest, smoke })
    await writeControl({ transport, paths, profile, intent, fingerprint, candidate: candidate.value.facts, state: 'CANONICAL_VERIFIED', environment })
    return result
  }

  if (stage === 'finalize') {
    const canonical = await readStage(transport, paths, profile, intent, 'canonical')
    const candidate = await readStage(transport, paths, profile, intent, 'candidate')
    const migration = await readNamedJson(transport, paths.migrate, profile)
    const databaseDisposition = migration.value.schemaVersion === 'jenfu.dev012.migration-receipt.v1' ? 'FORWARD_APPLIED' : 'UNCHANGED_VERIFIED'
    await transport.removeCandidateTag({ profile, tag: candidate.value.facts.tag, candidateRevision: candidate.value.facts.candidateRevision, expectedActiveRevision: candidate.value.facts.candidateRevision, deadlineAt: intent.deadlineAt })
    const finalized = await writeStage(transport, paths, profile, intent, 'finalize', canonical.ref, { canonicalReceiptRef: canonical.ref, candidateRevision: candidate.value.facts.candidateRevision, artifactDigest: candidate.value.facts.artifactDigest, temporaryCandidateTags: 0, result: 'RELEASED' })
    const conformance = buildDev014ConsumerConformance({ appId: profile.application.id, sourceRevision: intent.sourceRevision, artifactDigest: candidate.value.facts.artifactDigest.split('@').at(-1), failSeekingEvidenceRef: canonical.ref.uri, verifiedAt: transport.now() })
    const conformanceResult = await transport.putJson(`gs://${profile.artifact.releaseBucket}/${paths.root}/dev014-consumer-conformance.json`, conformance, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
    const readiness = await readNamedJson(transport, intent.readinessReceiptRef.uri, profile, intent.readinessReceiptRef.sha256, ['receipts'])
    const dev013Transition = dev013TerminalTransitionFact(readiness.value, intent)
    const terminal = stageReceipt({ profile, intent, stage: 'terminal', previousReceiptRef: finalized.ref, facts: { result: 'RELEASED', candidateRevision: candidate.value.facts.candidateRevision, artifactDigest: candidate.value.facts.artifactDigest, databaseDisposition, remainingHumanAction: 0, dev014ConsumerConformanceRef: conformanceResult.ref, ...(dev013Transition ? { dev013Transition } : {}) }, observedAt: transport.now() })
    const terminalResult = await transport.putJson(paths.terminal, terminal, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
    await writeControl({ transport, paths, profile, intent, fingerprint, candidate: candidate.value.facts, state: 'FINALIZED', result: 'RELEASED', environment })
    return terminalResult
  }

  const candidate = await optionalNamedJson(transport, paths.candidate, profile)
  const entrypoint = await optionalNamedJson(transport, paths.entrypoint, profile)
  const prepare = await optionalNamedJson(transport, paths.prepare, profile)
  const migration = await optionalNamedJson(transport, paths.migrate, profile)
  if (migration) assertMigrationReceipt(migration.value, profile, intent, { historical: true })
  const databaseDisposition = migration ? (migration.value.facts?.disposition ?? 'FORWARD_APPLIED') : 'NOT_APPLIED'
  let disposition = 'PRE_ACTIVATION_ABORTED'
  let entrypointRecovery = { changed: false, result: 'NOT_REQUIRED' }
  if (candidate) {
    assertStage(candidate.value, profile, intent, 'candidate')
    const facts = candidate.value.facts
    let service = await transport.getService(profile)
    if (transport.effectiveRevision(service) === facts.candidateRevision) {
      service = await transport.setTraffic({ profile, revision: intent.previousRevision, deadlineAt: intent.deadlineAt })
      disposition = 'ROLLED_BACK'
    }
    await transport.removeCandidateTag({ profile, tag: facts.tag, candidateRevision: facts.candidateRevision, expectedActiveRevision: intent.previousRevision, deadlineAt: intent.deadlineAt })
    if (!prepare) fail('PREPARE_RECEIPT_MISSING')
    assertStage(prepare.value, profile, intent, 'prepare')
    if (entrypoint) assertStage(entrypoint.value, profile, intent, 'entrypoint')
    const restored = await transport.restoreEntrypoint({ profile, baseline: prepare.value.facts.entrypointBaseline, deadlineAt: intent.deadlineAt })
    entrypointRecovery = { changed: restored.changed, result: restored.changed ? 'BASELINE_RESTORED' : 'BASELINE_ALREADY_ACTIVE', providerOperationRef: restored.providerOperationRef }
  } else {
    const deterministicRevision = `${profile.target.serviceName}-${fingerprint.slice(0, 12)}`
    const deterministicTag = `candidate-${fingerprint.slice(0, 12)}`
    const service = await transport.getService(profile)
    const tagged = service.trafficStatuses?.find((row) => row.tag === deterministicTag)
    if (tagged) await transport.removeCandidateTag({ profile, tag: deterministicTag, candidateRevision: deterministicRevision, expectedActiveRevision: intent.previousRevision, deadlineAt: intent.deadlineAt })
  }
  const rollback = await writeStage(transport, paths, profile, intent, 'rollback', entrypoint?.ref ?? candidate?.ref ?? migration?.ref ?? null, { result: disposition, previousRevision: intent.previousRevision, recoveryOrder: ['TRAFFIC_ROLLBACK', 'TAG_CLEANUP', 'ENTRYPOINT_BASELINE_RESTORE'], entrypointRecovery, databaseDisposition })
  const terminal = stageReceipt({ profile, intent, stage: 'terminal', previousReceiptRef: rollback.ref, facts: { result: disposition, previousRevision: intent.previousRevision, entrypointRecovery, databaseDisposition }, observedAt: transport.now() })
  const terminalResult = await transport.putJson(paths.terminal, terminal, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
  await transport.publishIncident(profile, { correlationId: `${intent.releaseId}-${environment.GITHUB_RUN_ATTEMPT ?? '1'}`, ownerApplicationId: profile.application.id, sourceLockSha256: intent.sourceLockRef.sha256, eventRef: terminalResult.ref, occurredAt: transport.now() })
  await writeControl({ transport, paths, profile, intent, fingerprint, candidate: candidate?.value?.facts ?? null, state: 'FINALIZED', result: disposition, environment })
  return terminalResult
}
