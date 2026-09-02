import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const DEV_HEADERS = Object.freeze({
  'x-orgmaster-dev-issuer': 'urn:orgmaster:dev',
  'x-orgmaster-dev-subject': 'local-admin',
})

export const FIXTURE_IDS = Object.freeze({
  department: 'department-dev039-b16',
  role: 'role-dev039-b16',
  level: 'level-dev039-b16',
  process: 'process-dev039-b16',
  employeeUnassigned: 'employee-dev039-b16-unassigned',
  employeeSingle: 'employee-dev039-b16-single',
  employeeMulti: 'employee-dev039-b16-multi',
  employeeSharedOccupant: 'employee-dev039-b16-shared-occupant',
  employeeExclusiveOccupant: 'employee-dev039-b16-exclusive-occupant',
  positionSource: 'position-dev039-b16-source',
  positionMulti: 'position-dev039-b16-multi',
  positionEmpty: 'position-dev039-b16-empty',
  positionShared: 'position-dev039-b16-shared',
  positionExclusive: 'position-dev039-b16-exclusive',
  dutyNew: 'duty-dev039-b16-new',
  dutyPrimary: 'duty-dev039-b16-primary',
  processNodeOpen: 'process-node-dev039-b16-open',
  processNodeLinked: 'process-node-dev039-b16-linked',
  processLink: 'process-link-dev039-b16-linked-primary',
  dutyRelation: 'duty-relation-dev039-b16-primary-source',
})

const DATE = '2026-08-31'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function requireV7Draft(document) {
  if (!document || typeof document !== 'object' || document.app !== 'OrgMaster' || document.version !== 7 || document.kind !== 'draft') {
    throw new Error('FIXTURE_DOCUMENT_INVALID_V7')
  }
  const state = document.state
  const requiredArrays = ['employees', 'departments', 'roles', 'positions', 'assignments', 'members', 'roleCombinationRiskRules', 'organizationLevels', 'duties', 'dutyPositionRelations', 'processes', 'processNodes', 'processEdges', 'processNodeDutyLinks']
  if (!state || typeof state !== 'object' || requiredArrays.some((key) => !Array.isArray(state[key]))) throw new Error('FIXTURE_STATE_INVALID_V7')
  return state
}

function addStable(list, value, label) {
  const existing = list.find((candidate) => candidate.id === value.id)
  if (existing) {
    if (canonical(existing) !== canonical(value)) throw new Error(`FIXTURE_ID_COLLISION_${label}`)
    return
  }
  list.push(value)
}

function nextOrder(list) {
  return list.reduce((max, item) => Math.max(max, Number.isFinite(item.order) ? item.order : -1), -1) + 1
}

function fixtureAssignments() {
  return [
    ['single-source', FIXTURE_IDS.employeeSingle, FIXTURE_IDS.positionSource],
    ['multi-source', FIXTURE_IDS.employeeMulti, FIXTURE_IDS.positionSource],
    ['multi-multi', FIXTURE_IDS.employeeMulti, FIXTURE_IDS.positionMulti],
    ['shared-occupant-shared', FIXTURE_IDS.employeeSharedOccupant, FIXTURE_IDS.positionShared],
    ['exclusive-occupant-exclusive', FIXTURE_IDS.employeeExclusiveOccupant, FIXTURE_IDS.positionExclusive],
  ].map(([suffix, employeeId, positionId]) => ({
    id: `assignment-dev039-b16-${suffix}`,
    employeeId,
    positionId,
    assignmentType: 'regular',
    validFrom: DATE,
    validTo: null,
  }))
}

export function buildDev039S7Fixture(inputDocument) {
  const document = clone(inputDocument)
  const state = requireV7Draft(document)
  const roleId = FIXTURE_IDS.role
  const levelId = FIXTURE_IDS.level
  const sourceLevel = state.organizationLevels.find((level) => level.id === 'level-team') ?? state.organizationLevels[0]
  const childLevel = state.organizationLevels.find((level) => level.id === 'level-execution') ?? state.organizationLevels.find((level) => level.order > (sourceLevel?.order ?? -1))
  if (!sourceLevel || !childLevel || sourceLevel.order >= childLevel.order) throw new Error('FIXTURE_LEVEL_CATALOG_INCOMPLETE')
  const sourceLevelId = sourceLevel.id
  const childLevelId = childLevel.id
  const processId = FIXTURE_IDS.process
  const assignmentByEmployee = new Map()
  for (const assignment of fixtureAssignments()) {
    if (!assignmentByEmployee.has(assignment.employeeId)) assignmentByEmployee.set(assignment.employeeId, [])
    assignmentByEmployee.get(assignment.employeeId).push(assignment)
  }

  addStable(state.departments, { id: FIXTURE_IDS.department, name: 'DEV-039 B16 測試部門', parentId: null }, 'DEPARTMENT')
  addStable(state.roles, { id: roleId, name: 'DEV-039 B16 測試職位' }, 'ROLE')
  addStable(state.organizationLevels, { id: levelId, name: 'DEV-039 B16 測試層級', order: state.organizationLevels.find((level) => level.id === levelId)?.order ?? nextOrder(state.organizationLevels) }, 'LEVEL')
  addStable(state.processes, { id: processId, title: 'DEV-039 B16 測試流程', description: '僅供跨面板關聯配置驗證', order: state.processes.find((process) => process.id === processId)?.order ?? nextOrder(state.processes) }, 'PROCESS')

  const positions = [
    [FIXTURE_IDS.positionSource, 'B16 關係來源職位', null, sourceLevelId, true],
    [FIXTURE_IDS.positionMulti, 'B16 多任職職位', FIXTURE_IDS.positionSource, childLevelId, true],
    [FIXTURE_IDS.positionEmpty, 'B16 空職位', FIXTURE_IDS.positionSource, childLevelId, true],
    [FIXTURE_IDS.positionShared, 'B16 可多人職位', FIXTURE_IDS.positionSource, childLevelId, true],
    [FIXTURE_IDS.positionExclusive, 'B16 單人職位', FIXTURE_IDS.positionSource, childLevelId, false],
  ]
  positions.forEach(([id, title, parentPositionId, organizationLevelId, allowMultipleAssignees]) => {
    addStable(state.positions, { id, roleId, departmentId: FIXTURE_IDS.department, parentPositionId, organizationLevelId, title, status: 'active', allowMultipleAssignees }, 'POSITION')
    addStable(state.members, { id, order: state.members.find((member) => member.id === id)?.order ?? state.members.filter((member) => member.id.startsWith('position-dev039-b16-')).length, childrenAxis: 'horizontal' }, 'MEMBER')
  })

  const employees = [
    [FIXTURE_IDS.employeeUnassigned, 'B16 無任職員工', null],
    [FIXTURE_IDS.employeeSingle, 'B16 單一任職員工', `assignment-dev039-b16-single-source`],
    [FIXTURE_IDS.employeeMulti, 'B16 多任職員工', `assignment-dev039-b16-multi-source`],
    [FIXTURE_IDS.employeeSharedOccupant, 'B16 可多人職位既有人員', `assignment-dev039-b16-shared-occupant-shared`],
    [FIXTURE_IDS.employeeExclusiveOccupant, 'B16 單人職位既有人員', `assignment-dev039-b16-exclusive-occupant-exclusive`],
  ]
  employees.forEach(([id, name, primaryAssignmentId]) => addStable(state.employees, { id, name, status: 'active', departmentIds: [FIXTURE_IDS.department], primaryAssignmentId, administrativeApproverOverrideEmployeeId: null }, 'EMPLOYEE'))
  fixtureAssignments().forEach((assignment) => addStable(state.assignments, assignment, 'ASSIGNMENT'))

  addStable(state.duties, { id: FIXTURE_IDS.dutyNew, title: 'B16 新工作職掌', description: '未預建目標關係' }, 'DUTY')
  addStable(state.duties, { id: FIXTURE_IDS.dutyPrimary, title: 'B16 既有主執行職掌', description: '位於來源職位的既有主執行' }, 'DUTY')
  addStable(state.dutyPositionRelations, { id: FIXTURE_IDS.dutyRelation, dutyId: FIXTURE_IDS.dutyPrimary, relationType: 'execute', target: { kind: 'position', positionId: FIXTURE_IDS.positionSource }, isPrimaryExecutor: true, order: 0 }, 'DUTY_RELATION')
  addStable(state.processNodes, { id: FIXTURE_IDS.processNodeOpen, processId, title: 'B16 未連結節點', parentNodeId: null, order: 0 }, 'PROCESS_NODE')
  addStable(state.processNodes, { id: FIXTURE_IDS.processNodeLinked, processId, title: 'B16 已連結節點', parentNodeId: null, order: 1 }, 'PROCESS_NODE')
  addStable(state.processNodeDutyLinks, { id: FIXTURE_IDS.processLink, processNodeId: FIXTURE_IDS.processNodeLinked, dutyId: FIXTURE_IDS.dutyPrimary, order: 0 }, 'PROCESS_LINK')

  for (const employeeId of [FIXTURE_IDS.employeeSingle, FIXTURE_IDS.employeeMulti, FIXTURE_IDS.employeeSharedOccupant, FIXTURE_IDS.employeeExclusiveOccupant]) {
    const assignments = assignmentByEmployee.get(employeeId) ?? []
    const employee = state.employees.find((candidate) => candidate.id === employeeId)
    if (employee && employee.primaryAssignmentId !== assignments[0]?.id) throw new Error(`FIXTURE_PRIMARY_POINTER_INVALID_${employeeId}`)
  }
  if (state.dutyPositionRelations.filter((relation) => relation.id === FIXTURE_IDS.dutyRelation).length !== 1) throw new Error('FIXTURE_DUTY_RELATION_INVALID')
  if (state.processNodeDutyLinks.filter((link) => link.id === FIXTURE_IDS.processLink).length !== 1) throw new Error('FIXTURE_PROCESS_LINK_INVALID')
  return { document, fixtureIds: clone(FIXTURE_IDS), beforeRelationIds: { dutyRelationId: FIXTURE_IDS.dutyRelation, processLinkId: FIXTURE_IDS.processLink } }
}

export function inspectDev039S7Fixture(document) {
  const state = requireV7Draft(document)
  const required = ['department', 'role', 'level', 'process', 'employeeUnassigned', 'employeeSingle', 'employeeMulti', 'employeeSharedOccupant', 'employeeExclusiveOccupant', 'positionSource', 'positionMulti', 'positionEmpty', 'positionShared', 'positionExclusive', 'dutyNew', 'dutyPrimary', 'processNodeOpen', 'processNodeLinked']
  for (const key of required) {
    const collection = key.startsWith('employee') ? state.employees : key.startsWith('position') ? state.positions : key.startsWith('duty') ? state.duties : key.startsWith('processNode') ? state.processNodes : key === 'process' ? state.processes : key === 'department' ? state.departments : key === 'role' ? state.roles : state.organizationLevels
    if (!collection.some((item) => item.id === FIXTURE_IDS[key])) throw new Error(`FIXTURE_MISSING_${key}`)
  }
  if (!state.dutyPositionRelations.some((relation) => relation.id === FIXTURE_IDS.dutyRelation)) throw new Error('FIXTURE_MISSING_dutyRelation')
  if (!state.processNodeDutyLinks.some((link) => link.id === FIXTURE_IDS.processLink)) throw new Error('FIXTURE_MISSING_processLink')
  return true
}

async function requestJson(origin, path, options = {}) {
  const response = await fetch(new URL(path, origin), { ...options, headers: { ...DEV_HEADERS, 'content-type': 'application/json', ...(options.headers ?? {}) } })
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = { raw: text } }
  if (!response.ok) throw new Error(`HTTP_${response.status}_${body?.error ?? 'UNKNOWN'}`)
  return body
}

async function prepare(origin) {
  const index = await requestJson(origin, '/api/orgmaster/workspace')
  const created = await requestJson(origin, '/api/orgmaster/workspace/versions', { method: 'POST', body: JSON.stringify({ sourceVersionId: index.currentVersionId, name: `DEV-039-S7-B16-${Date.now()}`, expectedManifestRevision: index.manifestRevision }) })
  const versionId = created.createdVersionId
  const loaded = await requestJson(origin, `/api/orgmaster/workspace/versions/${encodeURIComponent(versionId)}`)
  const fixture = buildDev039S7Fixture(loaded.document)
  const saved = await requestJson(origin, `/api/orgmaster/workspace/versions/${encodeURIComponent(versionId)}`, { method: 'PUT', body: JSON.stringify({ document: fixture.document, expectedVersionRevision: loaded.version.revision, mode: 'draft-edit' }) })
  const output = { versionId, versionRevision: saved.version.revision, manifestRevision: created.workspace.manifestRevision, fixtureIds: fixture.fixtureIds, beforeRelationIds: fixture.beforeRelationIds, cleanup: `node scripts/dev039-s7-fixture.mjs cleanup --origin ${origin} --version-id ${versionId}` }
  console.log(JSON.stringify(output, null, 2))
}

async function inspect(origin, versionId) {
  const result = await requestJson(origin, `/api/orgmaster/workspace/versions/${encodeURIComponent(versionId)}`)
  inspectDev039S7Fixture(result.document)
  console.log(JSON.stringify({ versionId, revision: result.version.revision, fixture: 'valid' }, null, 2))
}

async function cleanup(origin, versionId) {
  const index = await requestJson(origin, '/api/orgmaster/workspace')
  const archived = await requestJson(origin, `/api/orgmaster/workspace/versions/${encodeURIComponent(versionId)}`, { method: 'PATCH', body: JSON.stringify({ action: 'archive', expectedManifestRevision: index.manifestRevision }) })
  const entry = archived.versions.find((candidate) => candidate.id === versionId)
  if (!entry || entry.status !== 'archived') throw new Error('FIXTURE_CLEANUP_READBACK_FAILED')
  console.log(JSON.stringify({ versionId, status: entry.status, manifestRevision: archived.manifestRevision }, null, 2))
}

export async function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv
  const originIndex = rest.indexOf('--origin')
  const origin = originIndex >= 0 ? rest[originIndex + 1] : 'http://localhost:5000'
  const versionIndex = rest.indexOf('--version-id')
  const versionId = versionIndex >= 0 ? rest[versionIndex + 1] : null
  if (!command || !['prepare', 'inspect', 'cleanup'].includes(command)) throw new Error('USAGE: prepare|inspect|cleanup --origin <url> [--version-id <id>]')
  if ((command === 'inspect' || command === 'cleanup') && !versionId) throw new Error('VERSION_ID_REQUIRED')
  if (command === 'prepare') return prepare(origin)
  if (command === 'inspect') return inspect(origin, versionId)
  return cleanup(origin, versionId)
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
}
