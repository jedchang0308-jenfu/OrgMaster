import { createHash } from 'node:crypto'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const SAFE_ID = /^[A-Za-z0-9._:@/-]+$/u
const SOURCES = new Set(['legacy_authority', 'orgmaster_authority'])

function isPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0
}

function isLegacyAuthorityVersion(value) {
  return isPositiveSafeInteger(value) && value % 2 === 1
}

function isOrgMasterAuthorityVersion(value) {
  return isPositiveSafeInteger(value) && value % 2 === 0
}

export const DEV013_AUTHORITY_TARGET = Object.freeze({
  projectId: 'jenfu-platform-prod',
  region: 'asia-east1',
  instance: 'jenfu-platform-prod-pg',
  connectionName: 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
  database: 'jenfu_prod',
  applicationId: 'ai-pdm',
  employeeId: 'employee-shijie',
  jobName: 'orgmaster-prod-dev013-p-both-employee-shijie',
  serviceAccount: 'orgmaster-prod-migrator@jenfu-platform-prod.iam.gserviceaccount.com',
  login: 'orgmaster-prod-migrator@jenfu-platform-prod.iam',
  releaseBucket: 'jenfu-platform-prod-orgmaster-release',
  actor: 'jedchang0308@jenfu.com.tw',
})

export class Dev013AuthoritySwitchError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code)
    this.code = code
  }
}

function fail(code, detail = '') { throw new Dev013AuthoritySwitchError(code, detail) }
export function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
export function sha256(value) { return createHash('sha256').update(value).digest('hex') }

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && canonicalize(Object.keys(value).sort()) === canonicalize([...keys].sort())
}

export function parseAuthorityRunnerArgs(argv) {
  const required = ['--operation-ref', '--operation-sha256', '--source-revision', '--output-ref']
  const allowed = new Set(required)
  const parsed = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const name = key?.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())
    if (!allowed.has(key) || !argv[index + 1] || parsed[name]) fail('DEV013_AUTHORITY_ARGUMENT_INVALID', String(key))
    parsed[name] = argv[index + 1]
  }
  if (Object.keys(parsed).length !== required.length || !H40.test(parsed.sourceRevision ?? '') || !H64.test(parsed.operationSha256 ?? '')) fail('DEV013_AUTHORITY_ARGUMENT_INVALID')
  return parsed
}

export function assertAuthorityRunnerTarget(environment, target = DEV013_AUTHORITY_TARGET) {
  const observed = {
    projectId: environment.GOOGLE_CLOUD_PROJECT,
    region: environment.GOOGLE_CLOUD_REGION,
    connectionName: environment.CLOUD_SQL_INSTANCE_CONNECTION_NAME,
    database: environment.POSTGRES_DATABASE,
    login: environment.POSTGRES_IAM_LOGIN,
    socket: environment.POSTGRES_SOCKET,
    job: environment.CLOUD_RUN_JOB,
    sourceRevision: environment.SOURCE_REVISION,
  }
  const expected = {
    projectId: target.projectId,
    region: target.region,
    connectionName: target.connectionName,
    database: target.database,
    login: target.login,
    socket: `/cloudsql/${target.connectionName}`,
    job: target.jobName,
    sourceRevision: environment.SOURCE_REVISION,
  }
  if (!H40.test(observed.sourceRevision ?? '') || canonicalize(observed) !== canonicalize(expected)) fail('DEV013_AUTHORITY_TARGET_MISMATCH')
  return observed
}

export function assertAuthorityOperation(value, { bytes, operationSha256, sourceRevision, now = new Date() }) {
  const keys = ['schemaVersion', 'operationKind', 'sourceRevision', 'projectId', 'region', 'instance', 'database', 'applicationId', 'employeeId', 'fromAuthoritySource', 'toAuthoritySource', 'expectedAuthorityVersion', 'expectedNextAuthorityVersion', 'expectedAssignmentVersionId', 'expectedRoleCodes', 'targetIdentity', 'operationId', 'batchId', 'actor', 'reason', 'deadlineAt']
  if (!Buffer.isBuffer(bytes) || sha256(bytes) !== operationSha256 || !exactKeys(value, keys)) fail('DEV013_AUTHORITY_OPERATION_INVALID')
  if (value.schemaVersion !== 'jenfu.dev013.production-authority-operation.v2'
    || !['preflight', 'switch', 'rollback'].includes(value.operationKind)
    || value.sourceRevision !== sourceRevision || !H40.test(value.sourceRevision)
    || value.projectId !== DEV013_AUTHORITY_TARGET.projectId || value.region !== DEV013_AUTHORITY_TARGET.region
    || value.instance !== DEV013_AUTHORITY_TARGET.instance || value.database !== DEV013_AUTHORITY_TARGET.database
    || value.applicationId !== DEV013_AUTHORITY_TARGET.applicationId || value.employeeId !== DEV013_AUTHORITY_TARGET.employeeId
    || value.actor !== DEV013_AUTHORITY_TARGET.actor || !SAFE_ID.test(value.operationId ?? '') || !SAFE_ID.test(value.batchId ?? '')
    || typeof value.reason !== 'string' || value.reason.trim().length < 8 || value.reason.length > 240
    || !Number.isFinite(Date.parse(value.deadlineAt)) || Date.parse(value.deadlineAt) <= now.getTime()
    || Date.parse(value.deadlineAt) - now.getTime() > 8 * 60 * 60 * 1000) fail('DEV013_AUTHORITY_OPERATION_INVALID')
  if (!Array.isArray(value.expectedRoleCodes) || new Set(value.expectedRoleCodes).size !== value.expectedRoleCodes.length
    || value.expectedRoleCodes.some((role) => typeof role !== 'string' || !/^[a-z][a-z0-9_]{1,63}$/u.test(role))
    || canonicalize(value.expectedRoleCodes) !== canonicalize([...value.expectedRoleCodes].sort())) fail('DEV013_AUTHORITY_ROLE_SET_INVALID')
  const allowed = value.operationKind === 'preflight'
    ? value.fromAuthoritySource === 'legacy_authority'
      && value.toAuthoritySource === 'legacy_authority'
      && isLegacyAuthorityVersion(value.expectedAuthorityVersion)
      && value.expectedNextAuthorityVersion === value.expectedAuthorityVersion
    : value.operationKind === 'switch'
      ? value.fromAuthoritySource === 'legacy_authority'
        && value.toAuthoritySource === 'orgmaster_authority'
        && isLegacyAuthorityVersion(value.expectedAuthorityVersion)
        && value.expectedNextAuthorityVersion === value.expectedAuthorityVersion + 1
      : value.fromAuthoritySource === 'orgmaster_authority'
        && value.toAuthoritySource === 'legacy_authority'
        && isOrgMasterAuthorityVersion(value.expectedAuthorityVersion)
        && value.expectedNextAuthorityVersion === value.expectedAuthorityVersion + 1
  if (!SOURCES.has(value.fromAuthoritySource) || !SOURCES.has(value.toAuthoritySource) || !allowed) fail('DEV013_AUTHORITY_TRANSITION_INVALID')
  if (value.operationKind === 'preflight') {
    if (value.expectedAssignmentVersionId !== null || value.expectedRoleCodes.length !== 0 || value.targetIdentity !== null) fail('DEV013_AUTHORITY_PREFLIGHT_INVALID')
  } else if (typeof value.expectedAssignmentVersionId !== 'string' || !SAFE_ID.test(value.expectedAssignmentVersionId)
    || !value.expectedRoleCodes.includes('system_admin')
    || !exactKeys(value.targetIdentity, ['principalId', 'issuer', 'subject'])
    || Object.values(value.targetIdentity).some((field) => typeof field !== 'string' || field.length < 1 || field.length > 255)) fail('DEV013_AUTHORITY_BINDING_INVALID')
  return structuredClone(value)
}

function baseOperation({ operationKind, sourceRevision, deadlineAt }) {
  if (!H40.test(sourceRevision ?? '') || !Number.isFinite(Date.parse(deadlineAt))) fail('DEV013_AUTHORITY_OPERATION_BUILD_INPUT_INVALID')
  return {
    schemaVersion: 'jenfu.dev013.production-authority-operation.v2', operationKind, sourceRevision,
    projectId: DEV013_AUTHORITY_TARGET.projectId, region: DEV013_AUTHORITY_TARGET.region,
    instance: DEV013_AUTHORITY_TARGET.instance, database: DEV013_AUTHORITY_TARGET.database,
    applicationId: DEV013_AUTHORITY_TARGET.applicationId, employeeId: DEV013_AUTHORITY_TARGET.employeeId,
    operationId: `dev013-p-both-employee-shijie-${operationKind}-${sourceRevision.slice(0, 12)}`,
    batchId: 'DEV-013-P_BOTH-20260921', actor: DEV013_AUTHORITY_TARGET.actor, deadlineAt,
  }
}

function versionBoundOperationId(base, expectedAuthorityVersion, expectedNextAuthorityVersion) {
  return `${base.operationId}-v${expectedAuthorityVersion}-v${expectedNextAuthorityVersion}`
}

export function buildAuthorityOperation({ operationKind, sourceRevision, deadlineAt, evidence = null, expectedAuthorityVersion = 1 }) {
  const base = baseOperation({ operationKind, sourceRevision, deadlineAt })
  if (operationKind === 'preflight') {
    if (!isLegacyAuthorityVersion(expectedAuthorityVersion)) fail('DEV013_AUTHORITY_OPERATION_BUILD_INPUT_INVALID')
    return { ...base, operationId: versionBoundOperationId(base, expectedAuthorityVersion, expectedAuthorityVersion), fromAuthoritySource: 'legacy_authority', toAuthoritySource: 'legacy_authority', expectedAuthorityVersion, expectedNextAuthorityVersion: expectedAuthorityVersion, expectedAssignmentVersionId: null, expectedRoleCodes: [], targetIdentity: null, reason: 'DEV-013 P_BOTH read-only Production authority preflight' }
  }
  if (operationKind === 'switch') {
    if (evidence?.schemaVersion !== 'jenfu.dev013.production-authority-preflight.v1' || evidence.sourceRevision !== sourceRevision
      || evidence.target?.projectId !== DEV013_AUTHORITY_TARGET.projectId || evidence.target?.database !== DEV013_AUTHORITY_TARGET.database
      || evidence.target?.applicationId !== DEV013_AUTHORITY_TARGET.applicationId || evidence.target?.employeeId !== DEV013_AUTHORITY_TARGET.employeeId
      || evidence.state?.authoritySource !== 'legacy_authority' || !isLegacyAuthorityVersion(evidence.state?.authorityVersion)
      || typeof evidence.state?.assignmentVersionId !== 'string' || !Array.isArray(evidence.state?.roles) || !evidence.state.roles.includes('system_admin')
      || evidence.state?.projectionReady !== true || !Array.isArray(evidence.state?.projectedRoleCodes) || !evidence.state.projectedRoleCodes.includes('system_admin')
      || !exactKeys(evidence.state?.targetIdentity, ['principalId', 'issuer', 'subject'])
      || evidence.mutationCount !== 0 || evidence.status !== 'PASS') fail('DEV013_AUTHORITY_PREFLIGHT_EVIDENCE_INVALID')
    return { ...base, operationId: versionBoundOperationId(base, evidence.state.authorityVersion, evidence.state.authorityVersion + 1), fromAuthoritySource: 'legacy_authority', toAuthoritySource: 'orgmaster_authority', expectedAuthorityVersion: evidence.state.authorityVersion, expectedNextAuthorityVersion: evidence.state.authorityVersion + 1, expectedAssignmentVersionId: evidence.state.assignmentVersionId, expectedRoleCodes: [...evidence.state.roles].sort(), targetIdentity: evidence.state.targetIdentity, reason: 'DEV-013 P_BOTH switch employee-shijie to OrgMaster authority' }
  }
  if (operationKind === 'rollback') {
    if (evidence?.schemaVersion !== 'jenfu.dev013.production-authority-switch-receipt.v1' || evidence.sourceRevision !== sourceRevision
      || evidence.operationKind !== 'switch' || evidence.target?.projectId !== DEV013_AUTHORITY_TARGET.projectId || evidence.target?.database !== DEV013_AUTHORITY_TARGET.database
      || evidence.target?.applicationId !== DEV013_AUTHORITY_TARGET.applicationId || evidence.target?.employeeId !== DEV013_AUTHORITY_TARGET.employeeId
      || evidence.transition?.toAuthoritySource !== 'orgmaster_authority' || !isOrgMasterAuthorityVersion(evidence.transition?.toAuthorityVersion)
      || typeof evidence.governance?.assignmentVersionId !== 'string' || !Array.isArray(evidence.governance?.roles) || !evidence.governance.roles.includes('system_admin')
      || !exactKeys(evidence.governance?.targetIdentity, ['principalId', 'issuer', 'subject'])
      || evidence.databaseEffect !== 'APPLIED_ONCE' || evidence.replaySafe !== true || evidence.status !== 'PASS') fail('DEV013_AUTHORITY_SWITCH_EVIDENCE_INVALID')
    return { ...base, operationId: versionBoundOperationId(base, evidence.transition.toAuthorityVersion, evidence.transition.toAuthorityVersion + 1), fromAuthoritySource: 'orgmaster_authority', toAuthoritySource: 'legacy_authority', expectedAuthorityVersion: evidence.transition.toAuthorityVersion, expectedNextAuthorityVersion: evidence.transition.toAuthorityVersion + 1, expectedAssignmentVersionId: evidence.governance.assignmentVersionId, expectedRoleCodes: [...evidence.governance.roles].sort(), targetIdentity: evidence.governance.targetIdentity, reason: 'DEV-013 P_BOTH rollback employee-shijie to legacy authority' }
  }
  fail('DEV013_AUTHORITY_OPERATION_KIND_INVALID')
}

export function encodeAuthorityOperation(operation) {
  const bytes = Buffer.from(`${canonicalize(operation)}\n`, 'utf8')
  return { bytes, sha256: sha256(bytes) }
}

function activeAt(value, now) {
  return value?.status === 'active' && Number.isFinite(Date.parse(value.validFrom)) && Date.parse(value.validFrom) <= now.getTime()
    && (value.validTo == null || (Number.isFinite(Date.parse(value.validTo)) && Date.parse(value.validTo) > now.getTime()))
}

function roleSummary(version, employeeId, now) {
  const policy = version?.policy
  if (!policy || !Array.isArray(policy.roleAssignments) || !Array.isArray(policy.identityLinks)
    || !Array.isArray(policy.principalAdmissions) || !Array.isArray(policy.managementGrants)) fail('DEV013_AUTHORITY_GOVERNANCE_INVALID')
  const assignments = policy.roleAssignments.filter((entry) => entry.applicationId === 'ai-pdm' && entry.employeeId === employeeId && activeAt(entry, now))
  const roles = [...new Set(assignments.map((entry) => entry.roleCodeSnapshot))].sort()
  const systemAdmins = assignments.filter((entry) => entry.roleCodeSnapshot === 'system_admin' && entry.subjectKind === 'principal' && typeof entry.targetPrincipalId === 'string' && entry.scope?.kind === 'global')
  if (systemAdmins.length !== 1) fail('DEV013_AUTHORITY_SYSTEM_ADMIN_INVALID')
  const systemAdmin = systemAdmins[0]
  const links = policy.identityLinks.filter((entry) => entry.employeeId === employeeId && entry.principalId === systemAdmin.targetPrincipalId && activeAt(entry, now))
  if (links.length !== 1) fail('DEV013_AUTHORITY_PRIVILEGED_LINK_INVALID')
  const admissions = policy.principalAdmissions.filter((entry) => entry.identityLinkId === links[0].id && entry.accountType === 'human_privileged' && entry.status === 'active')
  if (admissions.length !== 1) fail('DEV013_AUTHORITY_PRIVILEGED_ADMISSION_INVALID')
  const grants = policy.managementGrants.filter((entry) => entry.employeeId === employeeId && entry.principalId === systemAdmin.targetPrincipalId && entry.applicationId === 'ai-pdm' && entry.capability === 'orgmaster.cross_app_override' && activeAt(entry, now))
  if (grants.length !== 1) fail('DEV013_AUTHORITY_OVERRIDE_GRANT_INVALID')
  return { roles, assignmentCount: assignments.length, privilegedPrincipalSha256: sha256(systemAdmin.targetPrincipalId) }
}

async function readProjectionReadiness(database, version, employeeId, now) {
  const assignments = version.policy.roleAssignments.filter((entry) => entry.applicationId === 'ai-pdm' && entry.employeeId === employeeId && activeAt(entry, now))
  const catalog = (await database.query(`SELECT catalog_version,stable_role_id,role_code,assignable,subject_kind,allowed_scope_kinds
    FROM ai_pdm_contract.v_application_role_catalog_v1
    WHERE application_id='ai-pdm'`)).rows
  const principals = (await database.query(`SELECT employee_id,principal_id,principal_issuer,principal_subject,account_type
    FROM orgmaster_contract.v_active_principal_accounts_v1
    WHERE employee_id=$1
    ORDER BY principal_id,principal_issuer,principal_subject`, [employeeId])).rows
  const personal = principals.filter((principal) => principal.account_type === 'human_personal')
  const personalIds = new Set(personal.map((principal) => principal.principal_id))
  const personalPairs = new Set(personal.map((principal) => canonicalize([principal.principal_issuer, principal.principal_subject])))
  if (personal.length === 0 || personalIds.size !== 1 || personalPairs.size !== personal.length
    || personal.some((principal) => principal.employee_id !== employeeId || !principal.principal_id
      || !principal.principal_issuer || !principal.principal_subject)) fail('DEV013_AUTHORITY_TARGET_IDENTITY_INVALID')
  const eligible = assignments.filter((assignment) => {
    const role = catalog.find((candidate) => candidate.catalog_version === assignment.catalogVersion
      && candidate.stable_role_id === assignment.roleId && candidate.role_code === assignment.roleCodeSnapshot
      && candidate.assignable === true && Array.isArray(candidate.allowed_scope_kinds)
      && candidate.allowed_scope_kinds.includes(assignment.scope?.kind))
    if (!role || assignment.basis !== 'manual' || !Array.isArray(assignment.sources) || assignment.sources.length !== 0) return false
    if (assignment.scope?.kind === 'global' ? assignment.scope?.value != null : typeof assignment.scope?.value !== 'string' || assignment.scope.value.length === 0) return false
    if (assignment.subjectKind === 'employee') return assignment.targetPrincipalId == null && role.subject_kind === 'employee' && principals.some((principal) => principal.account_type === 'human_personal')
    return assignment.subjectKind === 'principal' && role.subject_kind === 'principal'
      && principals.some((principal) => principal.account_type === 'human_privileged' && principal.principal_id === assignment.targetPrincipalId)
  })
  const catalogVersions = [...new Set(catalog.map((entry) => entry.catalog_version))].sort()
  return {
    targetIdentity: { principalId: personal[0].principal_id, issuer: personal[0].principal_issuer, subject: personal[0].principal_subject },
    catalogVersions,
    catalogRoleCount: catalog.length,
    activePrincipalCount: principals.length,
    projectedRoleCodes: [...new Set(eligible.map((entry) => entry.roleCodeSnapshot))].sort(),
    projectionReady: eligible.some((entry) => entry.roleCodeSnapshot === 'system_admin'),
  }
}

async function readEffectiveRoles(database, employeeId) {
  const rows = (await database.query(`SELECT role_code
    FROM orgmaster_contract.v_ai_pdm_effective_role_assignments_v1
    WHERE application_id='ai-pdm' AND employee_id=$1
    ORDER BY role_code`, [employeeId])).rows
  return [...new Set(rows.map((row) => row.role_code))].sort()
}

async function readBoundary(database, target) {
  const row = (await database.query("SELECT current_database() AS database, current_user AS \"user\", current_setting('server_version_num')::integer / 10000 AS \"postgresMajor\", pg_has_role(current_user, $1, 'MEMBER') AS \"migratorMember\"", ['jenfu_orgmaster_migrator'])).rows[0]
  if (row?.database !== target.database || row?.user !== target.login || Number(row?.postgresMajor) !== 17 || row?.migratorMember !== true) fail('DEV013_AUTHORITY_DATABASE_BOUNDARY_FAILED')
  return row
}

async function readState(database, operation, now) {
  const authority = (await database.query(`SELECT authority_source, authority_version,
      operation_id AS override_operation_id
    FROM orgmaster_contract.v_ai_pdm_entitlement_authority_v1
    WHERE application_id = $1 AND employee_id = $2`, [operation.applicationId, operation.employeeId])).rows
  if (authority.length !== 1 || !SOURCES.has(authority[0].authority_source) || !Number.isSafeInteger(Number(authority[0].authority_version))) fail('DEV013_AUTHORITY_STATE_INVALID')
  const governance = (await database.query(`WITH active_batch AS (
      SELECT batch.id
      FROM orgmaster.persistence_authority AS authority
      JOIN orgmaster.persistence_batches AS batch ON batch.id = authority.active_batch_id AND batch.status = 'active'
      WHERE authority.singleton = true
    ), governance AS (
      SELECT batch.id AS batch_id, artifact.payload
      FROM active_batch AS batch
      JOIN orgmaster.persistence_artifacts AS artifact ON artifact.batch_id = batch.id
       AND artifact.artifact_kind = 'governance'
       AND artifact.artifact_key IN ('orgmaster-governance.v2.json', 'orgmaster-governance.v3.json')
    )
    SELECT governance.batch_id, md5(governance.payload::text) AS governance_hash,
      governance.payload->>'activePolicyVersionId' AS active_version_id, version.value AS active_version
    FROM governance
    CROSS JOIN LATERAL jsonb_array_elements(governance.payload->'publishedVersions') AS version(value)
    WHERE version.value->>'id' = governance.payload->>'activePolicyVersionId'`, [])).rows
  if (governance.length !== 1 || governance[0].active_version?.kind !== 'assignment-governance-v3' || governance[0].active_version_id !== governance[0].active_version.id) fail('DEV013_AUTHORITY_ACTIVE_VERSION_INVALID')
  const summary = roleSummary(governance[0].active_version, operation.employeeId, now)
  const projection = await readProjectionReadiness(database, governance[0].active_version, operation.employeeId, now)
  const effectiveRoleCodes = await readEffectiveRoles(database, operation.employeeId)
  return {
    authoritySource: authority[0].authority_source,
    authorityVersion: Number(authority[0].authority_version),
    overrideOperationId: authority[0].override_operation_id ?? null,
    persistenceBatchId: String(governance[0].batch_id),
    governanceHash: governance[0].governance_hash,
    assignmentVersionId: governance[0].active_version_id,
    assignmentVersion: Number(governance[0].active_version.versionNumber),
    publishedAt: governance[0].active_version.publishedAt,
    ...summary,
    ...projection,
    effectiveRoleCodes,
  }
}

async function readOperationRows(database, operation) {
  const rows = (await database.query(`SELECT receipt,outbox
    FROM orgmaster_contract.read_employee_authority_operation_v1($1,$2,$3)`, [
    operation.applicationId, operation.employeeId, operation.operationId,
  ])).rows
  if (rows.length > 1) fail('DEV013_AUTHORITY_OPERATION_CARDINALITY_INVALID')
  const receipt = rows[0]?.receipt
  const outbox = rows[0]?.outbox
  return {
    receipt: receipt ? {
      receipt_id: receipt.receiptId, operation_id: receipt.operationId,
      batch_id: receipt.batchId, application_id: receipt.applicationId,
      employee_id: receipt.employeeId, from_authority_source: receipt.fromAuthoritySource,
      to_authority_source: receipt.toAuthoritySource, authority_version: receipt.authorityVersion,
      assignment_version_id: receipt.assignmentVersionId, session_refresh_state: receipt.sessionRefreshState,
      actor: receipt.actor, reason: receipt.reason, switched_at: receipt.switchedAt,
      request_contract_version: receipt.requestContractVersion, request_hash: receipt.requestHash,
      target_principal_id: receipt.targetPrincipalId,
      target_identity_issuer: receipt.targetIdentityIssuer,
      target_identity_subject: receipt.targetIdentitySubject,
    } : null,
    outbox: outbox ? {
      event_id: outbox.eventId, operation_id: outbox.operationId,
      employee_id: outbox.employeeId, application_id: outbox.applicationId,
      event_kind: outbox.eventKind, actor: outbox.actor, reason_code: outbox.reasonCode,
      status: outbox.status, attempt_count: outbox.attemptCount,
      platform_receipt_id: outbox.platformReceiptId, created_at: outbox.createdAt,
      completed_at: outbox.completedAt,
    } : null,
  }
}

function assertExistingOperation(existing, operation) {
  if (!existing.receipt && !existing.outbox) return false
  const receipt = existing.receipt
  const outbox = existing.outbox
  if (!receipt || !outbox || receipt.operation_id !== operation.operationId || receipt.batch_id !== operation.batchId
    || receipt.application_id !== operation.applicationId || receipt.employee_id !== operation.employeeId
    || receipt.from_authority_source !== operation.fromAuthoritySource || receipt.to_authority_source !== operation.toAuthoritySource
    || Number(receipt.authority_version) !== operation.expectedNextAuthorityVersion
    || receipt.assignment_version_id !== operation.expectedAssignmentVersionId || receipt.actor !== operation.actor || receipt.reason !== operation.reason
    || receipt.request_contract_version !== 'orgmaster.employee-authority-switch.v2'
    || !H64.test(String(receipt.request_hash ?? ''))
    || receipt.target_principal_id !== operation.targetIdentity.principalId
    || receipt.target_identity_issuer !== operation.targetIdentity.issuer
    || receipt.target_identity_subject !== operation.targetIdentity.subject
    || outbox.operation_id !== operation.operationId || outbox.application_id !== operation.applicationId || outbox.employee_id !== operation.employeeId
    || outbox.event_kind !== 'authority_switch' || outbox.actor !== operation.actor || outbox.reason_code !== 'entitlement_authority_switch') fail('DEV013_AUTHORITY_OPERATION_REUSED')
  return true
}

function assertBoundState(state, operation, { replayed = false } = {}) {
  const expectedSource = replayed ? operation.toAuthoritySource : operation.fromAuthoritySource
  const expectedVersion = replayed ? operation.expectedNextAuthorityVersion : operation.expectedAuthorityVersion
  if (state.authoritySource !== expectedSource || state.authorityVersion !== expectedVersion
    || (operation.operationKind !== 'preflight' && state.assignmentVersionId !== operation.expectedAssignmentVersionId)
    || (operation.operationKind !== 'preflight' && canonicalize(state.targetIdentity) !== canonicalize(operation.targetIdentity))
    || (operation.operationKind !== 'preflight' && canonicalize(state.roles) !== canonicalize(operation.expectedRoleCodes))) fail('DEV013_AUTHORITY_PRECONDITION_DRIFT')
  if (state.projectionReady !== true || !state.projectedRoleCodes.includes('system_admin')) fail('DEV013_AUTHORITY_PROJECTION_NOT_READY')
  const expectedEffective = state.authoritySource === 'orgmaster_authority' ? state.projectedRoleCodes : []
  if (canonicalize(state.effectiveRoleCodes) !== canonicalize(expectedEffective)) fail('DEV013_AUTHORITY_EFFECTIVE_PROJECTION_DRIFT')
}

export async function executeAuthorityOperation({ database, operation, target = DEV013_AUTHORITY_TARGET, now = () => new Date().toISOString() }) {
  const nowDate = new Date(now())
  const boundary = await readBoundary(database, target)
  if (operation.operationKind === 'preflight') {
    const state = await readState(database, operation, nowDate)
    assertBoundState(state, operation)
    const core = { schemaVersion: 'jenfu.dev013.production-authority-preflight.v1', sourceRevision: operation.sourceRevision, operationId: operation.operationId, manifestDeadlineAt: operation.deadlineAt, target: { projectId: target.projectId, region: target.region, instance: target.instance, database: target.database, applicationId: target.applicationId, employeeId: target.employeeId }, boundary, state, mutationCount: 0, status: 'PASS' }
    return { ...core, receiptSha256: sha256(canonicalize(core)) }
  }

  await database.query('BEGIN ISOLATION LEVEL READ COMMITTED')
  let before
  let result
  let after
  let operationRows
  try {
    before = await readState(database, operation, nowDate)
    const existing = await readOperationRows(database, operation)
    const replayed = assertExistingOperation(existing, operation)
    assertBoundState(before, operation, { replayed })
    const returned = await database.query(`SELECT receipt_id, authority_version, outbox_event_id, session_refresh_state, replayed
      FROM orgmaster_contract.switch_employee_entitlement_authority_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [
      operation.applicationId, operation.employeeId, operation.toAuthoritySource, operation.expectedAuthorityVersion,
      operation.operationId, operation.batchId, operation.expectedAssignmentVersionId, operation.actor, operation.reason,
      operation.targetIdentity.principalId, operation.targetIdentity.issuer, operation.targetIdentity.subject,
    ])
    if (returned.rows.length !== 1) fail('DEV013_AUTHORITY_FUNCTION_RESULT_INVALID')
    result = returned.rows[0]
    operationRows = await readOperationRows(database, operation)
    assertExistingOperation(operationRows, operation)
    after = await readState(database, operation, new Date(now()))
    if (after.authoritySource !== operation.toAuthoritySource || after.authorityVersion !== operation.expectedNextAuthorityVersion
      || after.assignmentVersionId !== before.assignmentVersionId || after.governanceHash !== before.governanceHash
      || canonicalize(after.targetIdentity) !== canonicalize(before.targetIdentity)
      || canonicalize(after.roles) !== canonicalize(before.roles)
      || (operation.toAuthoritySource === 'orgmaster_authority' && canonicalize(after.effectiveRoleCodes) !== canonicalize(after.projectedRoleCodes))
      || (operation.toAuthoritySource === 'legacy_authority' && after.effectiveRoleCodes.length !== 0)
      || String(result.receipt_id) !== String(operationRows.receipt.receipt_id)
      || String(result.outbox_event_id) !== String(operationRows.outbox.event_id)
      || Number(result.authority_version) !== operation.expectedNextAuthorityVersion
      || result.session_refresh_state !== operationRows.receipt.session_refresh_state
      || !['pending', 'completed'].includes(operationRows.receipt.session_refresh_state)
      || !['pending', 'processing', 'completed', 'failed'].includes(operationRows.outbox.status)) fail('DEV013_AUTHORITY_POSTCONDITION_FAILED')
    await database.query('COMMIT')
  } catch (error) {
    await database.query('ROLLBACK').catch(() => undefined)
    throw error
  }
  const committed = await readState(database, operation, new Date(now()))
  const committedRows = await readOperationRows(database, operation)
  if (committed.authoritySource !== after.authoritySource || committed.authorityVersion !== after.authorityVersion
    || canonicalize(committed.targetIdentity) !== canonicalize(before.targetIdentity)
    || committed.governanceHash !== before.governanceHash || canonicalize(committedRows) !== canonicalize(operationRows)) fail('DEV013_AUTHORITY_COMMIT_READBACK_FAILED')
  const core = {
    schemaVersion: 'jenfu.dev013.production-authority-switch-receipt.v1', sourceRevision: operation.sourceRevision,
    operationKind: operation.operationKind, operationId: operation.operationId, batchId: operation.batchId,
    target: { projectId: target.projectId, region: target.region, instance: target.instance, database: target.database, applicationId: target.applicationId, employeeId: target.employeeId },
    boundary,
    transition: { fromAuthoritySource: operation.fromAuthoritySource, fromAuthorityVersion: operation.expectedAuthorityVersion, toAuthoritySource: operation.toAuthoritySource, toAuthorityVersion: operation.expectedNextAuthorityVersion },
    governance: { persistenceBatchId: committed.persistenceBatchId, governanceHash: committed.governanceHash, assignmentVersionId: committed.assignmentVersionId, assignmentVersion: committed.assignmentVersion, publishedAt: committed.publishedAt, roles: committed.roles, assignmentCount: committed.assignmentCount, privilegedPrincipalSha256: committed.privilegedPrincipalSha256, targetIdentity: committed.targetIdentity, catalogVersions: committed.catalogVersions, catalogRoleCount: committed.catalogRoleCount, activePrincipalCount: committed.activePrincipalCount, projectedRoleCodes: committed.projectedRoleCodes, effectiveRoleCodes: committed.effectiveRoleCodes },
    databaseReceipt: { receiptId: String(committedRows.receipt.receipt_id), authorityVersion: Number(committedRows.receipt.authority_version), sessionRefreshState: committedRows.receipt.session_refresh_state, switchedAt: new Date(committedRows.receipt.switched_at).toISOString() },
    outbox: { eventId: String(committedRows.outbox.event_id), status: committedRows.outbox.status, attemptCount: Number(committedRows.outbox.attempt_count), platformReceiptId: committedRows.outbox.platform_receipt_id == null ? null : String(committedRows.outbox.platform_receipt_id) },
    databaseEffect: 'APPLIED_ONCE', replaySafe: true, mutationCount: 3,
    committedAt: new Date(committedRows.receipt.switched_at).toISOString(), status: 'PASS',
  }
  return { ...core, receiptSha256: sha256(canonicalize(core)) }
}
