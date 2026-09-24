import { spawnSync } from 'node:child_process'
import { assertImmutableRef, assertRuntimeConfig, canonicalize, releasePaths, resolvePlainEnvironment, sha256 } from './dev012-owner-release-runtime.mjs'
import { assertMigrationBundle } from './dev012-production-migration-runner.mjs'
import { assertDev040ReleaseIntent } from './dev040-orgmaster-independent-release.mjs'
import { assertDev013L4Predecessor, dev013L4SequenceStep } from './dev013-l4-transition-sequence.mjs'

function fail(code) { throw Object.assign(new Error(code), { code }) }
const same = (a, b) => canonicalize(a) === canonicalize(b)

const CONTROLLED_IMAGE_ROTATION_SOURCE_PATHS = new Set([
  'infra/google-cloud/dev-040-production-release/migration-runner.Dockerfile',
])

export function filterControlledInfrastructureTree(bytes) {
  const entries = Buffer.from(bytes).toString('utf8').split('\0').filter(Boolean)
  if (!entries.length) fail('ROUTINE_BASELINE_SOURCE_MISSING')
  const filtered = entries.filter((entry) => {
    const path = entry.split('\t').at(-1)
    return !CONTROLLED_IMAGE_ROTATION_SOURCE_PATHS.has(path)
  })
  return Buffer.from(`${filtered.join('\0')}\0`)
}

const DEV014_MANAGED_DIRECTORY_FIELDS = Object.freeze([
  'ORGMASTER_MANAGED_IDENTITY_ENABLED',
  'ORGMASTER_GOOGLE_DIRECTORY_CUSTOMER_ID',
  'ORGMASTER_GOOGLE_DIRECTORY_DOMAIN',
  'ORGMASTER_GOOGLE_DIRECTORY_DELEGATED_SUBJECT',
  'ORGMASTER_GOOGLE_DIRECTORY_DWD_SERVICE_ACCOUNT_EMAIL',
  'ORGMASTER_PLATFORM_LOGIN_CALLER_EMAIL',
  'ORGMASTER_PLATFORM_LOGIN_CALLER_SUBJECT',
])

export function assertDev013PredecessorReceipt(value, ref, profile, observedAt, currentStep) {
  return assertDev013L4Predecessor({ value, ref, profile, observedAt, currentStep })
}

// Only infrastructure/configuration inputs are reusable, not the application build or smoke results.
export function routineInfrastructureFingerprint(root, revision) {
  if (!/^[a-f0-9]{40}$/u.test(revision)) fail('ROUTINE_SOURCE_INVALID')
  const result = spawnSync('git', ['ls-tree', '-r', '-z', revision, '--',
    'infra/google-cloud/dev-040-production-release', 'config/dev-010/n1c-orgmaster.json',
  ], { cwd: root, encoding: null, windowsHide: true })
  if (result.status !== 0 || !result.stdout?.length) fail('ROUTINE_BASELINE_SOURCE_MISSING')
  const config = spawnSync('git', ['show', `${revision}:config/release/dev040-orgmaster-independent-production-v3.json`], { cwd: root, encoding: 'utf8', windowsHide: true })
  if (config.status !== 0) fail('ROUTINE_BASELINE_SOURCE_MISSING')
  return sha256(Buffer.concat([result.stdout, Buffer.from(canonicalize(releaseInfrastructureInputs(JSON.parse(config.stdout))))]))
}

// Historical initialization metadata is not a provisioned infrastructure input.
// Every other profile field remains covered, including unknown future fields.
export function releaseInfrastructureInputs({ productionData, ...profile }) { return profile }

function dev013NeutralInfrastructureInputs(profile) {
  const value = structuredClone(releaseInfrastructureInputs(profile))
  delete value.migrations
  const required = value.environment?.requiredPlainEnvironmentNames ?? []
  value.environment.requiredPlainEnvironmentNames = required.filter((name) => !['ORGMASTER_JENFU_SSO_HANDOFF_MODE', 'ORGMASTER_JENFU_SSO_BROKER_ORIGIN'].includes(name))
  delete value.environment?.fixedValues?.ORGMASTER_JENFU_SSO_BROKER_ORIGIN
  delete value.environment?.controlledValues?.ORGMASTER_JENFU_SSO_HANDOFF_MODE
  if (value.environment?.controlledValues && Object.keys(value.environment.controlledValues).length === 0) delete value.environment.controlledValues
  return value
}

export function controlledInfrastructureFingerprint(root, revision) {
  if (!/^[a-f0-9]{40}$/u.test(revision)) fail('ROUTINE_SOURCE_INVALID')
  const result = spawnSync('git', ['ls-tree', '-r', '-z', revision, '--',
    'infra/google-cloud/dev-040-production-release', 'config/dev-010/n1c-orgmaster.json',
  ], { cwd: root, encoding: null, windowsHide: true })
  if (result.status !== 0 || !result.stdout?.length) fail('ROUTINE_BASELINE_SOURCE_MISSING')
  const config = spawnSync('git', ['show', `${revision}:config/release/dev040-orgmaster-independent-production-v3.json`], { cwd: root, encoding: 'utf8', windowsHide: true })
  if (config.status !== 0) fail('ROUTINE_BASELINE_SOURCE_MISSING')
  const stableInfrastructureTree = filterControlledInfrastructureTree(result.stdout)
  return sha256(Buffer.concat([stableInfrastructureTree, Buffer.from(canonicalize(dev013NeutralInfrastructureInputs(JSON.parse(config.stdout))))]))
}

function assertSealedStage(value, profile, intent, stage) {
  const { receiptSha256, ...core } = value ?? {}
  if (value?.schemaVersion !== 'jenfu.dev012.stage-receipt.v1' || value.ownerApplicationId !== profile.application.id || value.releaseId !== intent.releaseId || value.sourceRevision !== intent.sourceRevision || value.stage !== stage || value.status !== 'PASS' || receiptSha256 !== sha256(canonicalize(core))) fail('ROUTINE_BASELINE_RECEIPT_INVALID')
}

export function assertRoutineMigrationUnchanged(before, after) {
  const stable = ({ sourceRevision, manifestSha256, ...inputs }) => inputs
  if (!same(stable(before), stable(after))) fail('ROUTINE_MIGRATION_CHANGED')
  return sha256(canonicalize(stable(after)))
}

export function assertDev013ControlledMigrationAppend(before, after) {
  const staticInputs = ({ sourceRevision, manifestSha256, entries, ...inputs }) => inputs
  const migrationInputs = ({ sourceRevision, manifestSha256, ...inputs }) => inputs
  if (!same(staticInputs(before), staticInputs(after)) || before.baselineCount !== 10 || before.entries?.length !== 11 || after.entries?.length !== 15) fail('DEV013_MIGRATION_APPEND_INVALID')
  if (!same(before.entries, after.entries.slice(0, before.entries.length))) fail('DEV013_MIGRATION_APPEND_INVALID')
  const expected = [
    ['dev047-orgmaster-012', 'db/migrations/012_dev047_managed_identity_bridge.sql', '87d49746d4c34fafadb877225f43f568256023f6572095696399b927c2af6dff', '892b7429dec215f859ef5eecb34d515d05559077a1a49324c3af1e9f4e5865d6'],
    ['dev049-orgmaster-013', 'db/migrations/013_dev049_existing_google_primary_account_link.sql', '0518b9d594457fde706cfc007dfa3538b2827256c753dce8ba5f994139716319', 'a13198ec053e928e82ebe3450d07bd46b351b5e6c950eb6deeb4d653d24fbf21'],
    ['dev050-orgmaster-014', 'db/migrations/014_dev050_orgmaster_session_admission.sql', '11d6f93916f7668890dc6e17fab27244ed87f35353bb9957374702725fd52bfd', '29bcd05fae8f9ac97e1927359c3aec2f3b4dcda574cdc25baa68662fc2241a84'],
    ['dev013-orgmaster-015', 'db/migrations/015_dev013_restore_runtime_session_dml.sql', 'd3a17f752b89138f4d636d1b21ae5a69a5ae29dc64960c61307398d7a234cc08', 'a5860ee157e87c87b9654e0151c156d9ddd0b06f3f46cf4380f5ddb8a6126b7f'],
  ]
  const appended = after.entries.slice(before.entries.length)
  if (!same(appended.map((entry) => [entry.version, entry.path, entry.sourceSha256, entry.appliedSha256]), expected)) fail('DEV013_MIGRATION_APPEND_INVALID')
  return { migrationDisposition: 'FORWARD_APPLY', pendingMigrationCount: appended.length, migrationInputsSha256: sha256(canonicalize(migrationInputs(after))) }
}

export function assertDev014ContractMigrationAppend(before, after) {
  const staticInputs = ({ sourceRevision, manifestSha256, entries, ...inputs }) => inputs
  const migrationInputs = ({ sourceRevision, manifestSha256, ...inputs }) => inputs
  if (!same(staticInputs(before), staticInputs(after)) || before.baselineCount !== 10 || before.entries?.length !== 15 || after.entries?.length !== 16) fail('DEV014_CONTRACT_MIGRATION_APPEND_INVALID')
  if (!same(before.entries, after.entries.slice(0, before.entries.length))) fail('DEV014_CONTRACT_MIGRATION_APPEND_INVALID')
  const appended = after.entries[15]
  const expected = [
    'dev014-orgmaster-016',
    'db/migrations/016_dev014_managed_identity_lifecycle_contract.sql',
    '447acb8ce030495cae20ac1d22be005ea265be75893676d165502c409c3db185',
    'a25aae3dd8c86af2ec5cfb5f943d97dd47d4d4934a230bc8838ebe1365065790',
  ]
  if (!same([appended.version, appended.path, appended.sourceSha256, appended.appliedSha256], expected)) fail('DEV014_CONTRACT_MIGRATION_APPEND_INVALID')
  return { migrationDisposition: 'FORWARD_APPLY', pendingMigrationCount: 1, migrationInputsSha256: sha256(canonicalize(migrationInputs(after))) }
}

export function assertDev014ApplicationRegistrationAppend(before, after) {
  const staticInputs = ({ sourceRevision, manifestSha256, entries, ...inputs }) => inputs
  const migrationInputs = ({ sourceRevision, manifestSha256, ...inputs }) => inputs
  if (!same(staticInputs(before), staticInputs(after)) || before.baselineCount !== 10 || before.entries?.length !== 16 || after.entries?.length !== 17) fail('DEV014_APPLICATION_REGISTRATION_APPEND_INVALID')
  if (!same(before.entries, after.entries.slice(0, before.entries.length))) fail('DEV014_APPLICATION_REGISTRATION_APPEND_INVALID')
  const appended = after.entries[16]
  const expected = [
    'dev014-orgmaster-017',
    'db/migrations/017_dev014_invalidation_application_registration.sql',
    '9d34f7047b536251a3125ddf77a1fd6d9c47b24868e13f4cbebed6b89d676643',
    '26a9c6a272e23390b65580a63d92d23fe4d005b88539c06cb4a650bb15a17efe',
  ]
  if (!same([appended.version, appended.path, appended.sourceSha256, appended.appliedSha256], expected)) fail('DEV014_APPLICATION_REGISTRATION_APPEND_INVALID')
  return { migrationDisposition: 'FORWARD_APPLY', pendingMigrationCount: 1, migrationInputsSha256: sha256(canonicalize(migrationInputs(after))) }
}

export function assertDev014ActivationContractAppend(before, after) {
  const staticInputs = ({ sourceRevision, manifestSha256, entries, ...inputs }) => inputs
  const migrationInputs = ({ sourceRevision, manifestSha256, ...inputs }) => inputs
  if (!same(staticInputs(before), staticInputs(after)) || before.baselineCount !== 10 || before.entries?.length !== 18 || after.entries?.length !== 19) fail('DEV014_ACTIVATION_CONTRACT_APPEND_INVALID')
  if (!same(before.entries, after.entries.slice(0, before.entries.length))) fail('DEV014_ACTIVATION_CONTRACT_APPEND_INVALID')
  const appended = after.entries[18]
  const expected = [
    'dev014-orgmaster-019',
    'db/migrations/019_dev014_workspace_revision_contract.sql',
    'ac8c9e04edf208613e2291ab227a5e13b5ecdcc386820b75a31afdef1e3a8ede',
    'ff5d792916d0b1576e0c8ed9db35d4943c1352b57897d57c38853f2e41d8af36',
  ]
  if (!same([appended.version, appended.path, appended.sourceSha256, appended.appliedSha256], expected)) fail('DEV014_ACTIVATION_CONTRACT_APPEND_INVALID')
  return { migrationDisposition: 'FORWARD_APPLY', pendingMigrationCount: 1, migrationInputsSha256: sha256(canonicalize(migrationInputs(after))) }
}

export function assertDev014ProjectionContractAppend(before, after) {
  const staticInputs = ({ sourceRevision, manifestSha256, entries, ...inputs }) => inputs
  const migrationInputs = ({ sourceRevision, manifestSha256, ...inputs }) => inputs
  if (!same(staticInputs(before), staticInputs(after)) || before.baselineCount !== 10 || before.entries?.length !== 19 || after.entries?.length !== 20) fail('DEV014_PROJECTION_CONTRACT_APPEND_INVALID')
  if (!same(before.entries, after.entries.slice(0, before.entries.length))) fail('DEV014_PROJECTION_CONTRACT_APPEND_INVALID')
  const appended = after.entries[19]
  const expected = [
    'dev014-orgmaster-020',
    'db/migrations/020_dev014_current_projection_contract.sql',
    '8bcf7f1528e581e281436efe509c26f845657be2d1767c500460f56ccd538d82',
    'b42426e7da0589012e6d4496a029524842dbd92e0e8314e67ecb8e655d191aa5',
  ]
  if (!same([appended.version, appended.path, appended.sourceSha256, appended.appliedSha256], expected)) fail('DEV014_PROJECTION_CONTRACT_APPEND_INVALID')
  return { migrationDisposition: 'FORWARD_APPLY', pendingMigrationCount: 1, migrationInputsSha256: sha256(canonicalize(migrationInputs(after))) }
}

export function assertDev057WriterFenceAppend(before, after) {
  const staticInputs = ({ sourceRevision, manifestSha256, entries, ...inputs }) => inputs
  const migrationInputs = ({ sourceRevision, manifestSha256, ...inputs }) => inputs
  if (!same(staticInputs(before), staticInputs(after)) || before.baselineCount !== 10 || before.entries?.length !== 20 || after.entries?.length !== 21) fail('DEV057_WRITER_FENCE_APPEND_INVALID')
  if (!same(before.entries, after.entries.slice(0, before.entries.length))) fail('DEV057_WRITER_FENCE_APPEND_INVALID')
  const appended = after.entries[20]
  const expected = [
    'dev057-orgmaster-021',
    'db/migrations/021_dev057_identity_grant_writer_fence.sql',
    '9c925bd36b357ef2d3997eb362cbbef566fbd4308acd22e647b72d1f2adb3d5e',
    'c8d9b2aa02988a6b0094795b392532548f3bb7e7b51112e752355fd616334a22',
  ]
  if (!same([appended.version, appended.path, appended.sourceSha256, appended.appliedSha256], expected)) fail('DEV057_WRITER_FENCE_APPEND_INVALID')
  return { migrationDisposition: 'FORWARD_APPLY', pendingMigrationCount: 1, migrationInputsSha256: sha256(canonicalize(migrationInputs(after))) }
}

export function assertDev014ManagedPrincipalProjectionAppend(before, after) {
  const staticInputs = ({ sourceRevision, manifestSha256, entries, ...inputs }) => inputs
  const migrationInputs = ({ sourceRevision, manifestSha256, ...inputs }) => inputs
  if (!same(staticInputs(before), staticInputs(after)) || before.baselineCount !== 10 || before.entries?.length !== 21 || after.entries?.length !== 23) fail('DEV014_MANAGED_PRINCIPAL_PROJECTION_APPEND_INVALID')
  if (!same(before.entries, after.entries.slice(0, before.entries.length))) fail('DEV014_MANAGED_PRINCIPAL_PROJECTION_APPEND_INVALID')
  const expected = [
    ['dev014-orgmaster-022', 'db/migrations/022_dev014_managed_login_session_admission.sql', 'af32dce7cac09c5319823b727b131ea23e84d6c0cd52250d93d7b93d9996b5c2', '0aa3e42451e362ee3ceab2dd0dfadb34769484c1cc7b4f58a312721e0392d1f1'],
    ['dev014-orgmaster-023', 'db/migrations/023_dev014_authority_principal_projection_contract.sql', '3bb3131d9021aba05f252b13d5f97f5dea81fa3bb1b8ae8e3700e670f8a36e13', '0388e8169aaf2b4e6e1e393237764ac99663add669eba3c3c9c470b7be106e87'],
  ]
  const appended = after.entries.slice(before.entries.length)
  if (!same(appended.map((entry) => [entry.version, entry.path, entry.sourceSha256, entry.appliedSha256]), expected)) fail('DEV014_MANAGED_PRINCIPAL_PROJECTION_APPEND_INVALID')
  return { migrationDisposition: 'FORWARD_APPLY', pendingMigrationCount: appended.length, migrationInputsSha256: sha256(canonicalize(migrationInputs(after))) }
}

export function assertDev014ActivationContractRemediation(readiness, authorization) {
  const remediation = {
    kind: 'LOGIN_FIXTURE_EMPLOYEE_ACTIVATION_CONTRACT',
    migrationVersion: 'dev014-orgmaster-019',
    functionSignature: 'orgmaster_core.assert_employee_activation_v1(text,text)',
    viewSignature: 'orgmaster_core.v_current_workspace_employees_v1',
    employeeIds: ['01a0c82b-11c6-77ab-887f-58df9d243e63', '01a0c82b-372c-7d20-ba3b-6e3b892d2f63'],
  }
  if (authorization?.schemaVersion !== 'orgmaster.routine-release-authorization.v1'
    || authorization.authorizationBasis !== 'OPERATOR_INVOKED_DEPLOY_PRODUCTION'
    || authorization.devId !== 'DEV-014' || authorization.slice !== '014-LOGIN-FIXTURE-CONTRACT'
    || readiness?.schemaVersion !== 'orgmaster.routine-release-readiness.v1'
    || readiness.devId !== 'DEV-014' || readiness.slice !== '014-LOGIN-FIXTURE-CONTRACT'
    || !same(authorization.remediation, remediation) || !same(readiness.remediation, remediation)) fail('DEV014_ACTIVATION_CONTRACT_AUTHORITY_INVALID')
  return { releaseMode: 'DEV014_ACTIVATION_CONTRACT_REMEDIATION', remediation }
}

export function assertDev014ProjectionContractRemediation(readiness, authorization) {
  const remediation = {
    kind: 'CURRENT_PROJECTION_CONTRACT_CORRECTION',
    migrationVersion: 'dev014-orgmaster-020',
    contractViews: [
      'orgmaster_contract.v_ai_pdm_entitlement_authority_v1',
      'orgmaster_contract.v_ai_pdm_effective_role_assignments_v1',
      'orgmaster_contract.v_portal_app_visibility_v1',
    ],
    applicationId: 'ai-pdm',
  }
  if (authorization?.schemaVersion !== 'orgmaster.routine-release-authorization.v1'
    || authorization.authorizationBasis !== 'OPERATOR_INVOKED_DEPLOY_PRODUCTION'
    || authorization.devId !== 'DEV-014' || authorization.slice !== '014-PROJECTION-CONTRACT'
    || readiness?.schemaVersion !== 'orgmaster.routine-release-readiness.v1'
    || readiness.devId !== 'DEV-014' || readiness.slice !== '014-PROJECTION-CONTRACT'
    || !same(authorization.remediation, remediation) || !same(readiness.remediation, remediation)) fail('DEV014_PROJECTION_CONTRACT_AUTHORITY_INVALID')
  return { releaseMode: 'DEV014_PROJECTION_CONTRACT_REMEDIATION', remediation }
}

export function assertDev057WriterFenceRemediation(readiness, authorization) {
  const remediation = {
    kind: 'IDENTITY_GRANT_WRITER_FENCE',
    migrationVersion: 'dev057-orgmaster-021',
    contractViews: ['orgmaster_contract.v_active_principal_mappings_v1', 'orgmaster_contract.v_portal_app_visibility_v1'],
    serializationRow: 'orgmaster_core.managed_identity_admission_authority.singleton',
    concurrencyCases: ['governance-publication-before-bind', 'bind-before-governance-publication'],
    applicationId: 'ai-pdm',
  }
  if (authorization?.schemaVersion !== 'orgmaster.routine-release-authorization.v1'
    || authorization.authorizationBasis !== 'OPERATOR_INVOKED_DEPLOY_PRODUCTION'
    || authorization.devId !== 'DEV-057' || authorization.slice !== '057-WRITER-FENCE'
    || readiness?.schemaVersion !== 'orgmaster.routine-release-readiness.v1'
    || readiness.devId !== 'DEV-057' || readiness.slice !== '057-WRITER-FENCE'
    || !same(authorization.remediation, remediation) || !same(readiness.remediation, remediation)) fail('DEV057_WRITER_FENCE_AUTHORITY_INVALID')
  return { releaseMode: 'DEV057_WRITER_FENCE_REMEDIATION', remediation }
}

export function assertDev014ManagedPrincipalProjectionRemediation(readiness, authorization) {
  const remediation = {
    kind: 'MANAGED_PRINCIPAL_PROJECTION_CONTRACT_CORRECTION',
    migrationVersions: ['dev014-orgmaster-022', 'dev014-orgmaster-023'],
    producerView: 'orgmaster_contract.v_active_principal_mappings_v1',
    adapterViews: ['orgmaster_contract.v_orgmaster_session_principals_v2', 'orgmaster_contract.v_active_principal_links_v1', 'access_governance.v_active_principal_links_v1'],
    applicationId: 'ai-pdm',
    employeeIds: ['01a0c82b-11c6-77ab-887f-58df9d243e63', '01a0c82b-372c-7d20-ba3b-6e3b892d2f63'],
  }
  if (authorization?.schemaVersion !== 'orgmaster.routine-release-authorization.v1'
    || authorization.authorizationBasis !== 'OPERATOR_INVOKED_DEPLOY_PRODUCTION'
    || authorization.devId !== 'DEV-014' || authorization.slice !== '014-MANAGED-PRINCIPAL-PROJECTION'
    || readiness?.schemaVersion !== 'orgmaster.routine-release-readiness.v1'
    || readiness.devId !== 'DEV-014' || readiness.slice !== '014-MANAGED-PRINCIPAL-PROJECTION'
    || !same(authorization.remediation, remediation) || !same(readiness.remediation, remediation)) fail('DEV014_MANAGED_PRINCIPAL_PROJECTION_AUTHORITY_INVALID')
  return { releaseMode: 'DEV014_MANAGED_PRINCIPAL_PROJECTION_REMEDIATION', remediation }
}

export function assertDev014LoginFixtureCorrection(readiness, authorization) {
  const correction = {
    kind: 'LOGIN_FIXTURE_ACTIVATION_CONTRACT_CORRECTION',
    applicationId: 'ai-pdm',
    employeeIds: ['01a0c82b-11c6-77ab-887f-58df9d243e63', '01a0c82b-372c-7d20-ba3b-6e3b892d2f63'],
    infrastructureBinding: 'EXACT_RECEIPT_SOURCE_FINGERPRINT',
  }
  if (authorization?.schemaVersion !== 'orgmaster.routine-release-authorization.v1'
    || authorization.authorizationBasis !== 'OPERATOR_INVOKED_DEPLOY_PRODUCTION'
    || authorization.devId !== 'DEV-014' || authorization.slice !== '014-LOGIN-FIXTURE-CORRECTION'
    || readiness?.schemaVersion !== 'orgmaster.routine-release-readiness.v1'
    || readiness.devId !== 'DEV-014' || readiness.slice !== '014-LOGIN-FIXTURE-CORRECTION'
    || !same(authorization.correction, correction) || !same(readiness.correction, correction)) fail('DEV014_LOGIN_FIXTURE_CORRECTION_AUTHORITY_INVALID')
  return { releaseMode: 'DEV014_LOGIN_FIXTURE_CORRECTION', correction }
}

export function assertDev013MigrationInfraReceipt(value, profile, sourceRevision) {
  const { receiptSha256, ...core } = value ?? {}
  if (value?.schemaVersion !== 'jenfu.dev012.app-infra-receipt.v1' || value.ownerApplicationId !== profile.application.id || value.sourceRevision !== sourceRevision
    || value.projectId !== profile.target.projectId || value.region !== profile.target.region || value.status !== 'APPLIED' || value.releaseAuthority !== true
    || !value.migrationRunnerDigest?.startsWith(`${profile.artifact.migrationRunnerUri}@sha256:`) || receiptSha256 !== sha256(canonicalize(core))) fail('DEV013_MIGRATION_INFRA_RECEIPT_INVALID')
  return value
}

export function assertRoutineRuntimeReadback(profile, runtimeConfig, revision) {
  const expected = assertRuntimeConfig(profile, runtimeConfig)
  const observed = revision.containers?.find((row) => row.name === profile.runtime.containerName)
  const expectedApp = expected.containers.find((row) => row.name === profile.runtime.containerName)
  const env = (observed?.env ?? []).filter((row) => row.name !== profile.environment.candidateOriginEnvironmentName)
  const sort = (rows) => [...rows].sort((a, b) => a.name.localeCompare(b.name))
  if (revision.serviceAccount !== expected.serviceAccount || !same(sort(env), sort(expectedApp.env))) fail('ROUTINE_RUNTIME_DRIFT')
  // The same immutable revision supplies the rest of the provider configuration; a
  // changed service template cannot silently become this routine release's baseline.
  return true
}

function assertHistoricalRuntimeReadback(profile, runtimeConfig, revision) {
  const expected = runtimeConfig?.template
  const observed = revision.containers?.find((row) => row.name === profile.runtime.containerName)
  const expectedApp = expected?.containers?.find((row) => row.name === profile.runtime.containerName)
  const env = (observed?.env ?? []).filter((row) => row.name !== profile.environment.candidateOriginEnvironmentName)
  const sort = (rows) => [...rows].sort((a, b) => a.name.localeCompare(b.name))
  if (!expected || expected.runtimeServiceAccount !== undefined || expected.serviceAccount !== profile.target.runtimeServiceAccount || !expectedApp || revision.serviceAccount !== expected.serviceAccount || !same(sort(env), sort(expectedApp.env))) fail('ROUTINE_RUNTIME_DRIFT')
  return true
}

function assertDev013ControlledRuntimeTransition(profile, baselineRuntime, runtimeConfig, readiness, authorization) {
  const field = 'ORGMASTER_JENFU_SSO_HANDOFF_MODE'
  const previousPlain = baselineRuntime?.plainEnvironment
  const nextPlain = runtimeConfig?.plainEnvironment
  const from = previousPlain?.[field] ?? null
  const to = nextPlain?.[field]
  const action = from === null && to === 'off' ? 'guard' : from === 'off' && to === 'on' ? 'activate' : from === 'on' && to === 'off' ? 'rollback' : null
  const expectedPlain = resolvePlainEnvironment(profile, previousPlain, { [field]: to })
  const previousControlledEnvironment = { [field]: from }
  const controlledEnvironment = { [field]: to }
  let expectedSequenceStep = null
  try { expectedSequenceStep = dev013L4SequenceStep(profile.application.id, readiness?.transition, previousControlledEnvironment, controlledEnvironment) } catch {}
  if (!action || !same(nextPlain, expectedPlain) || !same(runtimeConfig.secretVersions, baselineRuntime.secretVersions)) fail('ROUTINE_RUNTIME_CHANGED')
  assertRuntimeConfig(profile, runtimeConfig)
  const predecessor = readiness?.transition?.predecessorReceiptRef
  if (authorization?.schemaVersion !== 'jenfu.dev013.l4-owner-transition-authorization.v1' || authorization.authorizationBasis !== 'OPERATOR_INVOKED_DEV013_L4'
    || readiness?.schemaVersion !== 'jenfu.dev013.l4-owner-transition-readiness.v2' || readiness.devId !== 'DEV-013' || readiness.slice !== '013-R1' || readiness.ownerApplicationId !== profile.application.id
    || !same(readiness.sequenceStep, expectedSequenceStep) || readiness.sequenceRoot?.schemaVersion !== 'jenfu.dev013.l4-sequence-root.v2'
    || !Number.isFinite(Date.parse(readiness.observedAt)) || !Number.isFinite(Date.parse(readiness.expiresAt)) || !Number.isFinite(Date.parse(readiness.sequenceRoot.expiresAt)) || Date.parse(readiness.sequenceRoot.expiresAt) <= Date.parse(readiness.observedAt) || Date.parse(readiness.expiresAt) > Date.parse(readiness.sequenceRoot.expiresAt)
    || readiness.transition?.field !== field || readiness.transition.from !== from || readiness.transition.to !== to || readiness.transition.action !== action
    || !predecessor || canonicalize(Object.keys(predecessor).sort()) !== canonicalize(['sha256', 'uri']) || typeof predecessor.uri !== 'string' || predecessor.uri.length < 8 || !/^[a-f0-9]{64}$/u.test(predecessor.sha256 ?? '')) fail('DEV013_CONTROLLED_TRANSITION_AUTHORITY_INVALID')
  return { releaseMode: 'DEV013_CONTROLLED_ENVIRONMENT', field, from, to, action, predecessorReceiptRef: predecessor }
}

export function assertDev014ManagedDirectoryRuntimeTransition(profile, baselineRuntime, runtimeConfig, readiness, authorization) {
  const previousPlain = baselineRuntime?.plainEnvironment
  const nextPlain = runtimeConfig?.plainEnvironment
  let expectedPlain
  try { expectedPlain = resolvePlainEnvironment(profile, previousPlain, {}) } catch { fail('DEV014_RUNTIME_ACTIVATION_INVALID') }
  const activation = readiness?.activation
  const expectedActivation = {
    kind: 'MANAGED_DIRECTORY_RUNTIME_ACTIVATION',
    addedPlainEnvironmentNames: DEV014_MANAGED_DIRECTORY_FIELDS,
    directoryScope: 'https://www.googleapis.com/auth/admin.directory.user.readonly',
  }
  if (DEV014_MANAGED_DIRECTORY_FIELDS.some((name) => previousPlain?.[name] !== undefined || nextPlain?.[name] !== profile.environment?.fixedValues?.[name])
    || !same(nextPlain, expectedPlain) || !same(runtimeConfig.secretVersions, baselineRuntime.secretVersions)
    || authorization?.schemaVersion !== 'orgmaster.routine-release-authorization.v1' || authorization.authorizationBasis !== 'OPERATOR_INVOKED_DEPLOY_PRODUCTION'
    || authorization.devId !== 'DEV-014' || authorization.slice !== '014-LOGIN'
    || readiness?.schemaVersion !== 'orgmaster.routine-release-readiness.v1' || readiness.devId !== 'DEV-014' || readiness.slice !== '014-LOGIN'
    || !same(authorization.activation, expectedActivation) || !same(activation, expectedActivation)) fail('DEV014_RUNTIME_ACTIVATION_INVALID')
  assertRuntimeConfig(profile, runtimeConfig)
  return { releaseMode: 'DEV014_MANAGED_DIRECTORY_ACTIVATION', activation }
}

export function assertDev014ProducerContractRemediation(readiness, authorization) {
  const remediation = {
    kind: 'MANAGED_IDENTITY_LIFECYCLE_CONTRACT_COMPLETION',
    migrationVersion: 'dev014-orgmaster-016',
    contractVersion: 'jenfu.orgmaster-contract.managed-identity-lifecycle.v1',
    consumerApplicationId: 'platform',
  }
  if (authorization?.schemaVersion !== 'orgmaster.routine-release-authorization.v1' || authorization.authorizationBasis !== 'OPERATOR_INVOKED_DEPLOY_PRODUCTION'
    || authorization.devId !== 'DEV-014' || authorization.slice !== '014-PRODUCER-CONTRACT'
    || readiness?.schemaVersion !== 'orgmaster.routine-release-readiness.v1' || readiness.devId !== 'DEV-014' || readiness.slice !== '014-PRODUCER-CONTRACT'
    || !same(authorization.remediation, remediation) || !same(readiness.remediation, remediation)) fail('DEV014_CONTRACT_REMEDIATION_AUTHORITY_INVALID')
  return { releaseMode: 'DEV014_PRODUCER_CONTRACT_REMEDIATION', remediation }
}

export function assertDev014ApplicationRegistrationRemediation(readiness, authorization) {
  const remediation = {
    kind: 'MANAGED_IDENTITY_INVALIDATION_APPLICATION_REGISTRATION',
    migrationVersion: 'dev014-orgmaster-017',
    requiredApplications: ['ai-pdm', 'orgmaster', 'platform'],
    sourceIdFields: ['applicationId', 'id'],
  }
  if (authorization?.schemaVersion !== 'orgmaster.routine-release-authorization.v1' || authorization.authorizationBasis !== 'OPERATOR_INVOKED_DEPLOY_PRODUCTION'
    || authorization.devId !== 'DEV-014' || authorization.slice !== '014-APPLICATION-REGISTRATION'
    || readiness?.schemaVersion !== 'orgmaster.routine-release-readiness.v1' || readiness.devId !== 'DEV-014' || readiness.slice !== '014-APPLICATION-REGISTRATION'
    || !same(authorization.remediation, remediation) || !same(readiness.remediation, remediation)) fail('DEV014_APPLICATION_REGISTRATION_REMEDIATION_AUTHORITY_INVALID')
  return { releaseMode: 'DEV014_APPLICATION_REGISTRATION_REMEDIATION', remediation }
}

export async function readRoutineBaseline({ profile, transport, baselineIntentRef }) {
  const bucket = profile.artifact.releaseBucket
  assertImmutableRef(baselineIntentRef, bucket)
  const baseline = await transport.readJson(baselineIntentRef, bucket, ['receipts'])
  const intent = assertDev040ReleaseIntent(baseline.value, profile)
  const paths = releasePaths(profile, intent, baselineIntentRef.sha256)
  const read = async (uri) => {
    const result = await transport.readBytes(uri, { prefixes: ['receipts'] })
    return { ...result, value: JSON.parse(result.bytes.toString('utf8')) }
  }
  const [terminal, deployment, migration, candidate] = await Promise.all([read(paths.terminal), read(paths.deployment), read(paths.migrate), read(paths.candidate)])
  assertSealedStage(terminal.value, profile, intent, 'terminal')
  assertSealedStage(candidate.value, profile, intent, 'candidate')
  if (terminal.value.facts.result !== 'RELEASED' || terminal.value.facts.remainingHumanAction !== 0 || !same(candidate.value.facts.deploymentCapsuleRef, deployment.ref) || !same(candidate.value.facts.migrationReceiptRef, migration.ref) || !same(deployment.value.releaseIntentRef, baselineIntentRef) || deployment.value.sourceRevision !== intent.sourceRevision || terminal.value.facts.artifactDigest !== deployment.value.artifactDigest || terminal.value.facts.candidateRevision !== candidate.value.facts.candidateRevision) fail('ROUTINE_BASELINE_NOT_RELEASED')
  if (migration.value.schemaVersion === 'jenfu.dev012.stage-receipt.v1') {
    assertSealedStage(migration.value, profile, intent, 'migrate')
    if (migration.value.facts.disposition !== 'UNCHANGED_VERIFIED' || migration.value.facts.manifestSha256 !== intent.migrationManifestSha256) fail('ROUTINE_BASELINE_MIGRATION_INVALID')
  } else if (migration.value.schemaVersion !== 'jenfu.dev012.migration-receipt.v1' || migration.value.ownerApplicationId !== profile.application.id || migration.value.sourceRevision !== intent.sourceRevision || migration.value.manifestSha256 !== intent.migrationManifestSha256 || migration.value.status !== 'PASS' || migration.value.boundaryStatus !== 'PASS') fail('ROUTINE_BASELINE_MIGRATION_INVALID')
  const bundle = await transport.readJson(deployment.value.migrationBundleRef, bucket, [profile.artifact.migrationBundlePrefix])
  assertMigrationBundle(bundle.value, { target: { ownerApplicationId: profile.application.id, ledger: profile.migrations.ledger, baselineCount: profile.migrations.baselineCount }, sourceRevision: intent.sourceRevision, bytes: bundle.bytes, bundleSha256: bundle.ref.sha256 })
  if (bundle.value.manifestSha256 !== intent.migrationManifestSha256) fail('ROUTINE_BASELINE_MIGRATION_INVALID')
  const runtime = await transport.readJson(intent.runtimeConfigRef, bucket, ['receipts'])
  return { intent, terminal, deployment, migration, candidate, bundle, runtime }
}

// A safely finalized failed attempt is an audit record, not the new production
// baseline. Resolve its explicitly recorded prior intent; never guess a revision.
export async function resolveRoutineControlBaseline({ profile, transport, control, attempt }) {
  const { controlSha256, ...core } = control ?? {}
  if (controlSha256 !== sha256(canonicalize(core)) || control.state !== 'FINALIZED' || control.ownerApplicationId !== profile.application.id || control.service !== profile.target.serviceName) fail('ROUTINE_CONTROL_NOT_FINALIZED')
  const intent = assertDev040ReleaseIntent(attempt.value, profile)
  if (intent.releaseId !== control.releaseId || intent.sourceRevision !== control.sourceRevision) fail('ROUTINE_CONTROL_JOIN_INVALID')
  if (control.result === 'RELEASED') return attempt.ref
  if (!['PRE_ACTIVATION_ABORTED', 'ROLLED_BACK'].includes(control.result) || !intent.baselineIntentRef) fail('ROUTINE_CONTROL_NOT_RELEASED')
  const paths = releasePaths(profile, intent, attempt.ref.sha256)
  const result = await transport.readBytes(paths.terminal, { prefixes: ['receipts'] })
  const terminal = JSON.parse(result.bytes.toString('utf8'))
  assertSealedStage(terminal, profile, intent, 'terminal')
  if (terminal.facts.result !== control.result || terminal.facts.previousRevision !== intent.previousRevision) fail('ROUTINE_RECOVERY_NOT_VERIFIED')
  return intent.baselineIntentRef
}

export async function verifyRoutineRelease({ root, profile, transport, intent, values, service, buildMigrationBundle, fingerprint = routineInfrastructureFingerprint, transitionFingerprint = controlledInfrastructureFingerprint }) {
  const baseline = await readRoutineBaseline({ profile, transport, baselineIntentRef: intent.baselineIntentRef })
  if (baseline.terminal.value.facts.candidateRevision !== intent.previousRevision || transport.effectiveRevision(service) !== intent.previousRevision) fail('ROUTINE_BASELINE_NOT_ACTIVE')
  transport.assertServiceSettled(service)
  transport.assertCanonicalEntrypoint(profile, service)
  if ([...(service.traffic ?? []), ...(service.trafficStatuses ?? [])].some((row) => row.tag)) fail('ROUTINE_BASELINE_TAGGED')
  if (!same(intent.foundationReceiptRef, baseline.intent.foundationReceiptRef)) fail('ROUTINE_INFRA_REF_CHANGED')
  const runtimeConfig = values.runtimeConfig.runtimeConfig ?? values.runtimeConfig
  const baselineRuntime = baseline.runtime.value.runtimeConfig ?? baseline.runtime.value
  const controlledTransition = same(runtimeConfig, baselineRuntime)
    ? values.readiness?.devId === 'DEV-057'
      ? values.readiness?.slice === '057-WRITER-FENCE'
        ? assertDev057WriterFenceRemediation(values.readiness, values.authorization)
        : null
      : values.readiness?.devId === 'DEV-014'
      ? values.readiness?.slice === '014-PRODUCER-CONTRACT'
        ? assertDev014ProducerContractRemediation(values.readiness, values.authorization)
        : values.readiness?.slice === '014-APPLICATION-REGISTRATION'
          ? assertDev014ApplicationRegistrationRemediation(values.readiness, values.authorization)
          : values.readiness?.slice === '014-LOGIN-FIXTURE-CONTRACT'
            ? assertDev014ActivationContractRemediation(values.readiness, values.authorization)
          : values.readiness?.slice === '014-PROJECTION-CONTRACT'
            ? assertDev014ProjectionContractRemediation(values.readiness, values.authorization)
          : values.readiness?.slice === '014-MANAGED-PRINCIPAL-PROJECTION'
            ? assertDev014ManagedPrincipalProjectionRemediation(values.readiness, values.authorization)
          : values.readiness?.slice === '014-LOGIN-FIXTURE-CORRECTION'
            ? assertDev014LoginFixtureCorrection(values.readiness, values.authorization)
            : null
      : null
    : values.readiness?.devId === 'DEV-014'
      ? assertDev014ManagedDirectoryRuntimeTransition(profile, baselineRuntime, runtimeConfig, values.readiness, values.authorization)
      : assertDev013ControlledRuntimeTransition(profile, baselineRuntime, runtimeConfig, values.readiness, values.authorization)
  const infrastructureHash = ['DEV013_CONTROLLED_ENVIRONMENT', 'DEV014_PRODUCER_CONTRACT_REMEDIATION', 'DEV014_APPLICATION_REGISTRATION_REMEDIATION', 'DEV014_ACTIVATION_CONTRACT_REMEDIATION', 'DEV014_PROJECTION_CONTRACT_REMEDIATION', 'DEV014_MANAGED_PRINCIPAL_PROJECTION_REMEDIATION', 'DEV057_WRITER_FENCE_REMEDIATION'].includes(controlledTransition?.releaseMode) ? transitionFingerprint : fingerprint
  const infrastructureSha256 = infrastructureHash(root, intent.sourceRevision)
  const infrastructureBaselineRevision = controlledTransition?.releaseMode === 'DEV014_LOGIN_FIXTURE_CORRECTION'
    ? values.infra?.sourceRevision
    : baseline.intent.sourceRevision
  if (controlledTransition?.releaseMode !== 'DEV014_MANAGED_DIRECTORY_ACTIVATION' && infrastructureSha256 !== infrastructureHash(root, infrastructureBaselineRevision)) fail('ROUTINE_INFRA_CHANGED')
  const revision = await transport.getRevision(profile, intent.previousRevision)
  transport.assertRevisionReady(profile, revision, baseline.deployment.value.artifactDigest, baseline.candidate.value.facts.cloudSqlProxyResolvedImage)
  if (controlledTransition) assertHistoricalRuntimeReadback(profile, baselineRuntime, revision)
  else assertRoutineRuntimeReadback(profile, runtimeConfig, revision)
  const current = await buildMigrationBundle(intent.sourceRevision)
  if (current.bundle.manifestSha256 !== intent.migrationManifestSha256) fail('MIGRATION_MANIFEST_MISMATCH')
  let migration
  try {
    migration = { migrationDisposition: 'UNCHANGED_VERIFIED', pendingMigrationCount: 0, migrationInputsSha256: assertRoutineMigrationUnchanged(baseline.bundle.value, current.bundle) }
  } catch (error) {
    if (!controlledTransition || error?.code !== 'ROUTINE_MIGRATION_CHANGED') throw error
    migration = controlledTransition.releaseMode === 'DEV014_PRODUCER_CONTRACT_REMEDIATION'
      ? assertDev014ContractMigrationAppend(baseline.bundle.value, current.bundle)
      : controlledTransition.releaseMode === 'DEV014_APPLICATION_REGISTRATION_REMEDIATION'
        ? assertDev014ApplicationRegistrationAppend(baseline.bundle.value, current.bundle)
        : controlledTransition.releaseMode === 'DEV014_ACTIVATION_CONTRACT_REMEDIATION'
          ? assertDev014ActivationContractAppend(baseline.bundle.value, current.bundle)
        : controlledTransition.releaseMode === 'DEV014_PROJECTION_CONTRACT_REMEDIATION'
          ? assertDev014ProjectionContractAppend(baseline.bundle.value, current.bundle)
        : controlledTransition.releaseMode === 'DEV014_MANAGED_PRINCIPAL_PROJECTION_REMEDIATION'
          ? assertDev014ManagedPrincipalProjectionAppend(baseline.bundle.value, current.bundle)
          : controlledTransition.releaseMode === 'DEV057_WRITER_FENCE_REMEDIATION'
            ? assertDev057WriterFenceAppend(baseline.bundle.value, current.bundle)
        : assertDev013ControlledMigrationAppend(baseline.bundle.value, current.bundle)
  }
  const infraChanged = !same(intent.infraReceiptRef, baseline.intent.infraReceiptRef)
  if (migration.migrationDisposition === 'FORWARD_APPLY') {
    if (!infraChanged) fail('DEV013_MIGRATION_INFRA_RECEIPT_INVALID')
    assertDev013MigrationInfraReceipt(values.infra, profile, intent.sourceRevision)
  } else if (controlledTransition?.releaseMode === 'DEV014_MANAGED_DIRECTORY_ACTIVATION') {
    if (!infraChanged) fail('DEV014_RUNTIME_INFRA_RECEIPT_INVALID')
    try { assertDev013MigrationInfraReceipt(values.infra, profile, intent.sourceRevision) } catch { fail('DEV014_RUNTIME_INFRA_RECEIPT_INVALID') }
  } else if (controlledTransition?.releaseMode === 'DEV014_LOGIN_FIXTURE_CORRECTION') {
    if (!infraChanged) fail('DEV014_LOGIN_FIXTURE_INFRA_RECEIPT_INVALID')
    try { assertDev013MigrationInfraReceipt(values.infra, profile, values.infra?.sourceRevision) } catch { fail('DEV014_LOGIN_FIXTURE_INFRA_RECEIPT_INVALID') }
  } else if (infraChanged) fail('ROUTINE_INFRA_REF_CHANGED')
  for (const name of ['authorization', 'readiness']) {
    const value = values[name]
    if (value.ownerApplicationId !== profile.application.id || value.sourceRevision !== intent.sourceRevision || value.releaseId !== intent.releaseId || !same(value.baselineIntentRef, intent.baselineIntentRef)) fail('ROUTINE_AUTHORITY_MISMATCH')
  }
  return { baselineIntentRef: intent.baselineIntentRef, baselineTerminalRef: baseline.terminal.ref, baselineMigrationRef: baseline.migration.ref, infrastructureSha256, ...migration, previousRevision: intent.previousRevision, databaseVerification: migration.migrationDisposition === 'FORWARD_APPLY' ? 'OWNER_MIGRATION_JOB_REQUIRED_BEFORE_CANDIDATE' : 'PRIOR_RELEASE_EVIDENCE_PLUS_CURRENT_RUNTIME_SMOKE', liveLedgerRead: false, releaseMode: controlledTransition?.releaseMode ?? 'ROUTINE_UNCHANGED_RUNTIME', controlledTransition }
}
