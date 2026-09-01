#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto'
import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve, relative } from 'node:path'

export const CONTRACT_VERSION = 'jenfu.dev040.employee-rekey.v1'
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const canonical = (value) => JSON.stringify(value)
const has = async (path) => { try { await access(path); return true } catch { return false } }
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))
const writeJson = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8') }
const args = new Map()
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index]
  if (!value.startsWith('--')) continue
  const key = value.slice(2)
  const next = process.argv[index + 1]
  if (next && !next.startsWith('--')) { args.set(key, next); index += 1 } else args.set(key, true)
}
const mode = args.get('mode') ?? 'plan'
const sourceRoot = args.get('source-root')
const artifactRoot = args.get('artifact-root')
const planPath = args.get('plan')
const fail = (message) => { throw new Error(message) }
const requireAbsolute = (name, value) => { if (typeof value !== 'string' || !isAbsolute(value)) fail(`${name} must be an absolute path`) ; return resolve(value) }

let lastTimestamp = -1
let lastRandom = 0n
function uuidV7(now = Date.now()) {
  const timestamp = Math.max(0, Math.floor(now))
  let random = BigInt(`0x${randomBytes(10).toString('hex')}`)
  if (timestamp === lastTimestamp) random = lastRandom + 1n
  lastTimestamp = timestamp; lastRandom = random & ((1n << 80n) - 1n)
  const value = timestamp.toString(16).padStart(12, '0').slice(-12) + lastRandom.toString(16).padStart(20, '0')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-7${value.slice(13, 16)}-${(Number.parseInt(value[16], 16) & 3 | 8).toString(16)}${value.slice(17, 20)}-${value.slice(20)}`
}

function inventoryEntry(root, path, payload) {
  const bytes = canonical(payload)
  return { key: relative(root, path).replaceAll('\\', '/'), sha256: sha256(bytes), bytes: Buffer.byteLength(bytes), payload }
}
async function loadSource(root) {
  const data = join(root, 'data')
  const manifestPath = join(data, 'orgmaster-workspace.v1.json')
  const manifest = await readJson(manifestPath)
  if (!manifest.currentVersionId) fail('WORKSPACE_CURRENT_VERSION_MISSING')
  const versionPath = join(data, 'orgmaster-versions', `${manifest.currentVersionId}.json`)
  const workspace = await readJson(versionPath)
  const governanceVersion = await (async () => {
    const v3 = join(data, 'orgmaster-governance.v3.json'); const v2 = join(data, 'orgmaster-governance.v2.json')
    if (await has(v3) && await has(v2)) fail('MULTIPLE_CURRENT_GOVERNANCE_AUTHORITIES')
    if (await has(v3)) return { path: v3, document: await readJson(v3) }
    if (await has(v2)) return { path: v2, document: await readJson(v2) }
    fail('GOVERNANCE_CURRENT_MISSING')
  })()
  assertEmployeeScopedRuntimeStateEmpty(governanceVersion.document, 'governance')
  const methodsPath = join(data, 'orgmaster-management-methods.v1.json')
  const methods = await has(methodsPath) ? { path: methodsPath, document: await readJson(methodsPath) } : null
  const artifacts = [inventoryEntry(root, manifestPath, manifest), inventoryEntry(root, versionPath, workspace), inventoryEntry(root, governanceVersion.path, governanceVersion.document)]
  if (methods) artifacts.push(inventoryEntry(root, methods.path, methods.document))
  const employees = workspace?.state?.employees
  if (!Array.isArray(employees)) fail('WORKSPACE_EMPLOYEES_MISSING')
  const employeeIds = new Set(employees.map((employee) => employee.id).filter((id) => typeof id === 'string'))
  if (employeeIds.size !== employees.length) fail('DUPLICATE_OR_INVALID_EMPLOYEE_ID')
  const mapping = Object.fromEntries([...employeeIds].sort().map((id) => [id, UUID_V7.test(id) ? id : uuidV7()]))
  const frozenSourceRevision = sha256(artifacts.map(({ key, sha256: hash, bytes }) => `${key}\0${bytes}\0${hash}`).sort().join('\n'))
  return { data, manifestPath, versionPath, methodsPath, manifest, workspace, governance: governanceVersion, methods, artifacts, employeeIds, mapping, frozenSourceRevision }
}

const referenceKey = (key) => key === 'employeeId' || key.endsWith('EmployeeId') || key === 'fromEmployeeId' || key === 'toEmployeeId' || key === 'ownerEmployeeId'
function rewriteObject(value, mapping, employeeIds, path = '') {
  if (Array.isArray(value)) return value.map((item, index) => rewriteObject(item, mapping, employeeIds, `${path}[${index}]`))
  if (!value || typeof value !== 'object') return value
  const output = {}
  for (const [key, child] of Object.entries(value)) {
    if (referenceKey(key) && child !== null) {
      if (typeof child !== 'string' || !employeeIds.has(child)) fail(`UNKNOWN_EMPLOYEE_REFERENCE:${path}.${key}`)
      output[key] = mapping[child]
    } else output[key] = rewriteObject(child, mapping, employeeIds, `${path}.${key}`)
  }
  return output
}
const BLOCKED_RUNTIME_STATE_KEYS = new Set(['employeeAuthorityOverrides', 'authoritySwitchReceipts', 'outbox', 'entitlementChangeOutbox'])
function assertEmployeeScopedRuntimeStateEmpty(value, path = '') {
  if (Array.isArray(value)) { value.forEach((item, index) => assertEmployeeScopedRuntimeStateEmpty(item, `${path}[${index}]`)); return }
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    if (BLOCKED_RUNTIME_STATE_KEYS.has(key)) {
      const nonEmpty = Array.isArray(child) ? child.length > 0 : child && typeof child === 'object' ? Object.keys(child).length > 0 : Boolean(child)
      if (nonEmpty) fail(`EMPLOYEE_SCOPED_RUNTIME_STATE_NONEMPTY:${path}.${key}`)
    }
    assertEmployeeScopedRuntimeStateEmpty(child, `${path}.${key}`)
  }
}
function recommendationHash(employeeId, assignmentIds, policy, role, scope, catalogVersion, roleDefinitionHash) {
  return sha256([
    'ai-pdm', employeeId, assignmentIds.join(','), policy.id, policy.version, role.stableRoleId,
    `${scope.kind}:${scope.value}`, catalogVersion, roleDefinitionHash,
  ].join('|'))
}
function rewriteRecommendationDecisionHashes(data, sourceWorkspace, mapping, employeeIds, catalogs, path) {
  const decisions = data?.recommendationDecisions
  if (!Array.isArray(decisions) || decisions.length === 0) return data
  const assignments = Array.isArray(sourceWorkspace?.state?.assignments) ? sourceWorkspace.state.assignments : []
  const employees = [...employeeIds]
  const candidates = new Map()
  const workspaceKey = 'company-jenfu'
  for (const policy of Array.isArray(data.positionRolePolicies) ? data.positionRolePolicies : []) {
    if (policy.applicationId !== 'ai-pdm') continue
    const catalog = catalogs.find((entry) => entry.catalogVersion === policy.catalogVersion && entry.applicationId === 'ai-pdm')
    if (!catalog) continue
    for (const employeeId of employees) {
      const assignmentIds = assignments.filter((assignment) => assignment.employeeId === employeeId && assignment.positionId === policy.positionId).map((assignment) => assignment.id).sort()
      if (assignmentIds.length === 0) continue
      const scope = policy.defaultScopeSource === 'jenfu_workspace' ? { kind: 'workspace', value: workspaceKey } : policy.fixedScopeKey ? { kind: 'project', value: policy.fixedScopeKey } : null
      if (!scope) continue
      for (const role of catalog.roles ?? []) {
        if (!role?.stableRoleId) continue
        const roleDefinitionHash = role.roleDefinitionHash ?? role.role_definition_hash
        if (!roleDefinitionHash) continue
        const oldHash = recommendationHash(employeeId, assignmentIds, policy, role, scope, catalog.catalogVersion, roleDefinitionHash)
        const newHash = recommendationHash(mapping[employeeId], assignmentIds, policy, role, scope, catalog.catalogVersion, roleDefinitionHash)
        const mapped = candidates.get(oldHash) ?? new Set()
        mapped.add(newHash); candidates.set(oldHash, mapped)
      }
    }
  }
  const output = { ...data, recommendationDecisions: decisions.map((decision, index) => {
    if (typeof decision?.recommendationId !== 'string') fail(`RECOMMENDATION_DECISION_REWRITE_REQUIRED:${path}.recommendationDecisions[${index}]`)
    const matches = candidates.get(decision.recommendationId)
    if (!matches || matches.size !== 1) fail(`RECOMMENDATION_DECISION_REWRITE_REQUIRED:${path}.recommendationDecisions[${index}]`)
    return { ...decision, recommendationId: [...matches][0] }
  }) }
  return output
}
function organizationSnapshot(workspace, workspaceVersionId, workspaceRevision, capturedAt) {
  const state = workspace?.state ?? {}
  return {
    workspaceVersionId,
    workspaceRevision,
    capturedAt,
    employees: Array.isArray(state.employees) ? state.employees.map((employee) => ({ id: employee.id, primaryAssignmentId: employee.primaryAssignmentId ?? null })) : [],
    departments: Array.isArray(state.departments) ? state.departments.map((department) => ({ id: department.id, parentId: department.parentId ?? null })) : [],
    organizationRoles: Array.isArray(state.roles) ? state.roles.map((role) => ({ id: role.id })) : [],
    positions: Array.isArray(state.positions) ? state.positions.map((position) => ({ id: position.id, roleId: position.roleId, departmentId: position.departmentId ?? null, parentPositionId: position.parentPositionId ?? null, status: position.status })) : [],
    assignments: Array.isArray(state.assignments) ? state.assignments.map((assignment) => ({ id: assignment.id, employeeId: assignment.employeeId, positionId: assignment.positionId, assignmentType: assignment.assignmentType, validFrom: assignment.validFrom, validTo: assignment.validTo ?? null })) : [],
  }
}
function cleanGovernanceBaseline(source, governance, workspace) {
  const rewritten = rewriteObject(governance.document, source.mapping, source.employeeIds)
  const catalogs = (governance.document.publishedVersions ?? []).flatMap((version) => version.externalRoleCatalogs ?? [])
  rewritten.draft = rewriteRecommendationDecisionHashes(rewritten.draft, source.workspace, source.mapping, source.employeeIds, catalogs, 'draft')
  const activeSource = source.governance.document.activePolicyVersionId
    ? (source.governance.document.publishedVersions ?? []).find((version) => version.id === source.governance.document.activePolicyVersionId)
    : null
  if (source.governance.document.activePolicyVersionId && !activeSource) fail('ACTIVE_POLICY_VERSION_MISSING')
  if (activeSource && !['assignment-governance-v2', 'assignment-governance-v3'].includes(activeSource.kind)) fail('ACTIVE_POLICY_UNSUPPORTED')
  const workspaceRevision = sha256(canonical(workspace))
  const capturedAt = activeSource?.publishedAt ?? workspace.savedAt ?? '2026-01-01T00:00:00.000Z'
  const baselineVersion = activeSource ? rewriteObject(activeSource, source.mapping, source.employeeIds) : null
  if (baselineVersion?.policy) baselineVersion.policy = rewriteRecommendationDecisionHashes(baselineVersion.policy, source.workspace, source.mapping, source.employeeIds, catalogs, 'publishedVersions[].policy')
  if (baselineVersion) {
    baselineVersion.versionNumber = 1
    baselineVersion.organizationSnapshot = organizationSnapshot(workspace, source.manifest.currentVersionId, workspaceRevision, capturedAt)
    baselineVersion.policy ??= {}
    baselineVersion.policy.principalAdmissions ??= []
    const snapshotPayload = {
      kind: baselineVersion.kind,
      policy: baselineVersion.policy,
      externalRoleCatalogs: baselineVersion.externalRoleCatalogs ?? [],
      organizationSnapshot: baselineVersion.organizationSnapshot,
      effectState: baselineVersion.effectState ?? 'not-synchronized',
    }
    baselineVersion.snapshotHash = sha256(canonical(snapshotPayload))
  }
  rewritten.publishedVersions = baselineVersion ? [baselineVersion] : []
  rewritten.activePolicyVersionId = baselineVersion?.id ?? null
  if (rewritten.draft) {
    rewritten.draft.principalAdmissions ??= []
    rewritten.draft.basePolicyVersionId = baselineVersion?.id ?? null
  }
  const originalMigration = rewritten.migration ?? {}
  rewritten.migration = {
    ...originalMigration,
    sourceSchemaVersion: null,
    sourceRevision: null,
    migratedAt: null,
    legacyDraftHash: null,
    removedExternalDraftCounts: { roles: 0, permissions: 0, grants: 0, approvalPolicies: 0 },
    unresolvedAssignments: Array.isArray(originalMigration.unresolvedAssignments) ? originalMigration.unresolvedAssignments : [],
    unresolvedDelegations: Array.isArray(originalMigration.unresolvedDelegations) ? originalMigration.unresolvedDelegations : [],
  }
  const command = {
    commandId: `system-dev040-id1a-${source.frozenSourceRevision.slice(0, 16)}`,
    reason: 'DEV-040 一次性 Employee UUIDv7 direct rekey clean baseline',
    type: 'ONE_TIME_EMPLOYEE_UUIDV7_REKEY',
  }
  const auditBase = {
    id: `audit-dev040-id1a-${source.frozenSourceRevision.slice(0, 16)}`,
    commandId: command.commandId,
    commandHash: sha256(canonical(command)),
    occurredAt: capturedAt,
    actorPrincipalId: 'system',
    action: command.type,
    entityType: 'governance',
    entityId: null,
    reason: command.reason,
    beforeHash: sha256(canonical(source.governance.document)),
    afterHash: sha256(canonical(rewritten.draft)),
    previousEventHash: null,
  }
  rewritten.auditEvents = [{ ...auditBase, eventHash: sha256(canonical(auditBase)) }]
  return rewritten
}
function assertNoLegacyEmployeeIds(value, employeeIds, path = '') {
  if (typeof value === 'string') {
    if (employeeIds.has(value)) fail(`UNREWRITTEN_EMPLOYEE_REFERENCE:${path}`)
    return
  }
  if (Array.isArray(value)) { value.forEach((item, index) => assertNoLegacyEmployeeIds(item, employeeIds, `${path}[${index}]`)); return }
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) assertNoLegacyEmployeeIds(child, employeeIds, `${path}.${key}`)
}
function targetPayloads(source) {
  const workspace = rewriteObject(source.workspace, source.mapping, source.employeeIds)
  if (Array.isArray(workspace.state?.employees)) workspace.state.employees = workspace.state.employees.map((employee) => ({ ...employee, id: source.mapping[employee.id] ?? employee.id }))
  workspace.version = 8
  const manifest = { ...source.manifest, entries: source.manifest.entries?.filter((entry) => entry.id === source.manifest.currentVersionId).map((entry) => ({ ...entry, kind: 'current', status: 'active' })) ?? source.manifest.entries }
  const governance = cleanGovernanceBaseline(source, source.governance, workspace)
  const result = [
    { path: source.manifestPath, payload: manifest },
    { path: source.versionPath, payload: workspace },
    { path: source.governance.path, payload: governance },
  ]
  if (source.methods) result.push({ path: source.methods.path, payload: rewriteObject(source.methods.document, source.mapping, source.employeeIds) })
  for (const target of result) assertNoLegacyEmployeeIds(target.payload, source.employeeIds, target.path)
  return result
}
function redactedCounts(source, targets) {
  const targetBytes = targets.map(({ path, payload }) => ({ key: relative(source.data, path).replaceAll('\\', '/'), beforeSha256: source.artifacts.find((item) => item.key === relative(source.data, path).replaceAll('\\', '/'))?.sha256 ?? null, afterSha256: sha256(canonical(payload)), bytes: Buffer.byteLength(canonical(payload)) }))
  return { employees: source.employeeIds.size, changedEmployeeIds: Object.entries(source.mapping).filter(([oldId, newId]) => oldId !== newId).length, artifacts: targetBytes.length, references: targetBytes.reduce((sum, item) => sum + (item.bytes > 0 ? 1 : 0), 0), targetBytes }
}
async function makePlan(root, destination) {
  const source = await loadSource(root)
  const targets = targetPayloads(source)
  const targetInfo = targets.map(({ path, payload }) => ({ key: relative(root, path).replaceAll('\\', '/'), sha256: sha256(canonical(payload)), bytes: Buffer.byteLength(canonical(payload)), payload }))
  const execution = { contractVersion: CONTRACT_VERSION, frozenSourceRevision: source.frozenSourceRevision, sourceInventory: source.artifacts.map(({ key, sha256: hash, bytes }) => ({ key, sha256: hash, bytes })), mapping: source.mapping, targets: targetInfo }
  const executionPlanSha256 = sha256(canonical(execution))
  const planId = sha256(`${CONTRACT_VERSION}\0${source.frozenSourceRevision}\0${executionPlanSha256}`)
  const plan = { ...execution, planId, executionPlanSha256, createdAt: new Date().toISOString() }
  const dir = join(destination, 'OrgMaster', 'dev040-id1', planId)
  await writeJson(join(dir, 'execution-plan.json'), plan)
  const receipt = { contractVersion: CONTRACT_VERSION, planId, executionPlanSha256, sourceRevision: source.frozenSourceRevision, targetRevision: sha256(targetInfo.map((item) => `${item.key}\0${item.sha256}`).join('\n')), counts: redactedCounts(source, targets), status: 'PLANNED', containsDirectIdentifiers: false }
  await writeJson(join(dir, 'plan-receipt.json'), receipt)
  return { source, plan, receipt, planFile: join(dir, 'execution-plan.json') }
}
async function readAndValidatePlan(path) {
  const plan = await readJson(path)
  if (plan.contractVersion !== CONTRACT_VERSION || !plan.planId || !plan.executionPlanSha256) fail('EXECUTION_PLAN_INVALID')
  if (!Array.isArray(plan.targets) || plan.targets.length === 0) fail('EXECUTION_PLAN_INVALID')
  const copy = { ...plan }; delete copy.planId; delete copy.executionPlanSha256; delete copy.createdAt
  if (sha256(canonical(copy)) !== plan.executionPlanSha256) fail('EXECUTION_PLAN_SHA_MISMATCH')
  if (sha256(`${CONTRACT_VERSION}\0${plan.frozenSourceRevision}\0${plan.executionPlanSha256}`) !== plan.planId) fail('EXECUTION_PLAN_ID_MISMATCH')
  return plan
}
async function loadPlan(root, path) {
  const plan = await readAndValidatePlan(path)
  const source = await loadSource(root)
  if (source.frozenSourceRevision !== plan.frozenSourceRevision) fail('SOURCE_REVISION_DRIFT')
  return { source, plan }
}
async function replaceExact(path, raw) { const temp = `${path}.${process.pid}.dev040.tmp`; await writeFile(temp, raw, 'utf8'); if (await readFile(temp, 'utf8') !== raw) fail('TARGET_READBACK_FAILED'); await rename(temp, path) }
async function revokeLocalOrgmasterSessions(isFixture) {
  if (isFixture) return { status: 'SKIPPED_FIXTURE', count: 0 }
  const connectionString = process.env.ORGMASTER_DATABASE_URL
  if (!connectionString) fail('LOCAL_SESSION_REVOCATION_REQUIRED')
  let Pool
  try { ({ Pool } = await import('pg')) } catch { fail('LOCAL_SESSION_REVOCATION_DRIVER_MISSING') }
  const pool = new Pool({ connectionString, max: 1 })
  try {
    const result = await pool.query(`
      UPDATE orgmaster.app_sessions
      SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
          revoke_reason = COALESCE(revoke_reason, 'dev040_employee_rekey'),
          updated_at = CURRENT_TIMESTAMP
      WHERE app_id = 'orgmaster' AND revoked_at IS NULL
    `)
    return { status: 'REVOKED', count: result.rowCount ?? 0 }
  } finally { await pool.end() }
}
async function applyPlan(root, planFile, allowFixtureWrite, isFixture) {
  if (!allowFixtureWrite && isFixture) fail('FIXTURE_WRITE_REQUIRES_ALLOW_FIXTURE_WRITE')
  if (isFixture) {
    const marker = join(root, '.dev040-id1-fixture-root')
    if (!(await has(marker))) fail('FIXTURE_ROOT_NOT_TASK_OWNED')
    const markerPayload = await readJson(marker)
    if (markerPayload?.contractVersion !== CONTRACT_VERSION || markerPayload?.purpose !== 'isolated-qc') fail('FIXTURE_ROOT_MARKER_INVALID')
  }
  if (!isFixture && !args.get('allow-local-write')) fail('LOCAL_WRITE_REQUIRES_ALLOW_LOCAL_WRITE')
  const artifactBase = requireAbsolute('artifact-root', artifactRoot)
  const plan = await readAndValidatePlan(planFile)
  const sentinel = join(root, 'data', '.dev040-id1-migration-in-progress.json')
  if (await has(sentinel)) fail('MIGRATION_ALREADY_IN_PROGRESS')
  let allTargetsMatch = true
  for (const target of plan.targets) {
    try {
      const raw = await readFile(resolve(root, target.key), 'utf8')
      if (sha256(canonical(JSON.parse(raw))) !== target.sha256) { allTargetsMatch = false; break }
    } catch { allTargetsMatch = false; break }
  }
  if (allTargetsMatch) {
    return { contractVersion: CONTRACT_VERSION, planId: plan.planId, executionPlanSha256: plan.executionPlanSha256, sourceRevision: plan.frozenSourceRevision, targetRevision: sha256(plan.targets.map((item) => `${item.key}\0${item.sha256}`).join('\n')), counts: { artifacts: plan.targets.length }, status: 'NOOP', containsDirectIdentifiers: false, sessions: { status: 'ALREADY_REVOKED_OR_APPLIED', count: 0 } }
  }
  const { source } = await loadPlan(root, planFile)
  const planDir = join(artifactBase, 'OrgMaster', 'dev040-id1', plan.planId)
  const rollbackDir = join(planDir, 'rollback'); await mkdir(rollbackDir, { recursive: true })
  const journalPath = join(planDir, 'migration-journal.json')
  const journal = { contractVersion: CONTRACT_VERSION, planId: plan.planId, state: 'prepared', files: [] }
  for (const target of plan.targets) {
    const targetPath = resolve(root, target.key)
    const raw = await readFile(targetPath, 'utf8')
    const sourceArtifact = source.artifacts.find((item) => item.key === target.key)
    if (!sourceArtifact || sha256(canonical(JSON.parse(raw))) !== sourceArtifact.sha256) fail(`SOURCE_TARGET_DRIFT:${target.key}`)
    const rollbackPath = join(rollbackDir, target.key.replaceAll('/', '__'))
    await writeFile(rollbackPath, raw, 'utf8'); journal.files.push({ key: target.key, rollbackPath, beforeSha256: sha256(raw), afterSha256: target.sha256 })
  }
  await writeJson(journalPath, journal)
  try {
    await writeFile(sentinel, `${JSON.stringify({ contractVersion: CONTRACT_VERSION, planId: plan.planId, journalSha256: sha256(canonical(journal)) })}\n`, { flag: 'wx' })
    journal.state = 'applying'; await writeJson(journalPath, journal)
    for (const target of plan.targets) await replaceExact(resolve(root, target.key), `${JSON.stringify(target.payload, null, 2)}\n`)
    for (const target of plan.targets) { const raw = await readFile(resolve(root, target.key), 'utf8'); if (sha256(canonical(JSON.parse(raw))) !== target.sha256) fail(`TARGET_HASH_MISMATCH:${target.key}`) }
    const sessions = await revokeLocalOrgmasterSessions(isFixture)
    journal.state = 'applied'; await writeJson(journalPath, journal); await unlink(sentinel)
    return { contractVersion: CONTRACT_VERSION, planId: plan.planId, executionPlanSha256: plan.executionPlanSha256, sourceRevision: plan.frozenSourceRevision, targetRevision: sha256(plan.targets.map((item) => `${item.key}\0${item.sha256}`).join('\n')), counts: { artifacts: plan.targets.length }, status: 'APPLIED', containsDirectIdentifiers: false, sessions }
  } catch (error) {
    for (const file of journal.files) await replaceExact(resolve(root, file.key), await readFile(file.rollbackPath, 'utf8'))
    journal.state = 'rolled_back'; await writeJson(journalPath, journal); try { await unlink(sentinel) } catch {}
    throw error
  }
}
async function recover(root, planFile) {
  if (args.get('action') !== 'rollback') fail('RECOVER_ACTION_REQUIRED')
  const artifactBase = requireAbsolute('artifact-root', artifactRoot)
  const plan = await readAndValidatePlan(planFile); const journalPath = join(artifactBase, 'OrgMaster', 'dev040-id1', plan.planId, 'migration-journal.json'); const journal = await readJson(journalPath)
  if (!['prepared', 'applying'].includes(journal.state)) fail('NO_INCOMPLETE_MIGRATION')
  for (const file of journal.files) await replaceExact(resolve(root, file.key), await readFile(file.rollbackPath, 'utf8'))
  journal.state = 'rolled_back'; await writeJson(journalPath, journal); try { await unlink(join(root, 'data', '.dev040-id1-migration-in-progress.json')) } catch {}
  return { contractVersion: CONTRACT_VERSION, planId: plan.planId, status: 'ROLLED_BACK', containsDirectIdentifiers: false }
}

try {
  if (!['plan', 'apply-fixture', 'apply-local', 'recover-local'].includes(mode)) fail('UNSUPPORTED_MODE')
  if (mode === 'plan') { const root = requireAbsolute('source-root', sourceRoot); const destination = requireAbsolute('artifact-root', artifactRoot); const result = await makePlan(root, destination); process.stdout.write(`${JSON.stringify(result.receipt, null, 2)}\n`); process.exitCode = 0 }
  else if (mode === 'recover-local') { const root = requireAbsolute('source-root', sourceRoot); const result = await recover(root, requireAbsolute('plan', planPath)); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`) }
  else { const root = requireAbsolute('source-root', sourceRoot); const result = await applyPlan(root, requireAbsolute('plan', planPath), Boolean(args.get('allow-fixture-write')), mode === 'apply-fixture'); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`) }
} catch (error) { process.stderr.write(`DEV-040 ID1A failed: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1 }
