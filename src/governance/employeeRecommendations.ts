import type { OrgDirectoryState } from '../types'
import type { ExternalRoleCatalogRoleV1, GovernanceRoleAssignmentV2, GovernanceScopeV1 } from './types'

export type EmployeeRecommendationRequest = {
  applicationId: 'ai-pdm'
  roleId: string
  expectedRevision: string
  expectedOrganizationVersionId: string
  expectedOrganizationRevision: string
  expectedCatalogVersion: string
  expectedCatalogPayloadHash: string
  scope: GovernanceScopeV1
  validFrom: string
  validTo: string | null
}
export type EmployeeRecommendationCandidate = {
  employeeId: string
  name: string
  departmentName: string
  positionTitle: string
  positionId: string
  reason: string
  basis: 'position' | 'duty'
}
export type EmployeeRecommendationResponse = {
  method: 'rules' | 'ai-assisted'
  fallback: 'not-configured' | 'provider-unavailable' | 'context-limit' | null
  governanceRevision: string
  organizationVersionId: string
  organizationRevision: string
  sourceDataAt: string
  catalogVersion: string
  catalogPayloadHash: string
  candidates: EmployeeRecommendationCandidate[]
}
export type RecommendationPosition = {
  positionId: string
  title: string
  organizationRole: string
  department: string
  parentTitle: string | null
  duties: Array<{ dutyId: string; title: string; description: string; relation: 'execute' | 'review' }>
}
export type RecommendationMatch = { positionId: string; dutyIds: string[] }

export function employeeRecommendationAllowed(role: ExternalRoleCatalogRoleV1 | undefined) {
  return Boolean(role && role.status === 'active' && role.assignable && role.recommendationAllowed === true
    && role.subjectKind === 'employee' && role.code !== 'system_admin' && role.code !== 'external_specialist')
}

function effective(from: string, to: string | null, at: number) {
  const start = Date.parse(from), end = to === null ? Infinity : Date.parse(to)
  return Number.isFinite(start) && (to === null || Number.isFinite(end)) && start <= at && at < end
}
function overlaps(left: GovernanceRoleAssignmentV2, request: EmployeeRecommendationRequest) {
  const sameScope = left.scope.kind === 'global' || (left.scope.kind === request.scope.kind
    && left.scope.value === request.scope.value)
  return sameScope && Date.parse(left.validFrom) < (request.validTo === null ? Infinity : Date.parse(request.validTo))
    && Date.parse(request.validFrom) < (left.validTo === null ? Infinity : Date.parse(left.validTo))
}

/** Use saved, effective assignments; reporting titles never imply inherited application access. */
export function recommendationSources(state: OrgDirectoryState, assignments: GovernanceRoleAssignmentV2[], request: EmployeeRecommendationRequest, actorEmployeeId: string | null, at: number) {
  const assigned = new Set(assignments.filter(value => value.applicationId === request.applicationId
    && value.roleId === request.roleId && value.status === 'active' && overlaps(value, request)).map(value => value.employeeId))
  const employees = state.employees.filter(employee => employee.status === 'active' && !assigned.has(employee.id)
    && !(request.roleId === 'role-pdm-admin' && employee.id === actorEmployeeId))
  const eligibleEmployees = new Set(employees.map(employee => employee.id))
  const currentAssignments = state.assignments.filter(value => eligibleEmployees.has(value.employeeId) && effective(value.validFrom, value.validTo, at))
  const assignedPositions = new Set(currentAssignments.map(value => value.positionId))
  const positions = state.positions.filter(position => position.status === 'active' && assignedPositions.has(position.id)
    && (request.scope.kind !== 'department' || position.departmentId === request.scope.value))
  const context: RecommendationPosition[] = positions.map(position => ({
    positionId: position.id, title: position.title,
    organizationRole: state.roles.find(role => role.id === position.roleId)?.name ?? '',
    department: state.departments.find(department => department.id === position.departmentId)?.name ?? '',
    parentTitle: state.positions.find(parent => parent.id === position.parentPositionId && parent.status === 'active')?.title ?? null,
    duties: state.dutyPositionRelations.flatMap(relation => {
      if (relation.target.kind !== 'position' || relation.target.positionId !== position.id || (relation.relationType !== 'execute' && relation.relationType !== 'review')) return []
      const duty = state.duties.find(value => value.id === relation.dutyId)
      return duty ? [{ dutyId: duty.id, title: duty.title, description: duty.description ?? '', relation: relation.relationType }] : []
    }),
  }))
  return { employees, currentAssignments, positions, context }
}

// Negated responsibility clauses do not constitute positive administration evidence.
function positiveText(value: string) { return value.toLowerCase().split(/[。；;\n]/).filter(part => !/(不負責|不含|不涉及|無權|不得|禁止|毋須|不需)/.test(part)).join(' ') }
function explicitAdministration(value: string) {
  return /系統管理[員者]|(?:pdm|帳號|權限|資訊系統|資訊平台|it系統).{0,12}(?:管理|維護|設定|配置|administrat)|(?:管理|維護|設定|配置).{0,12}(?:pdm|帳號|權限|資訊系統|資訊平台|it系統)/i.test(positiveText(value))
}
export function administrationEvidence(position: RecommendationPosition) {
  return explicitAdministration(`${position.title} ${position.organizationRole}`)
    || position.duties.some(duty => explicitAdministration(`${duty.title} ${duty.description}`))
}
function businessMatch(code: string, value: string) {
  const text = positiveText(value)
  if (code === 'rd_manager') return /研發|工程|r&d/.test(text) && /主管|經理|課長|主任|管理|manager|lead/.test(text)
  if (code === 'rd') return /研發|設計|開發|工程|r&d/.test(text)
  if (code === 'qa') return /品保|品管|品質|檢驗|\bqa\b|\bqc\b/.test(text)
  if (code === 'production_planning') return /生管|生產管理|生產計[畫劃]|排程/.test(text)
  if (code === 'manufacturing') return /製造|生產|加工|組裝/.test(text) && !/生管|生產管理|生產計[畫劃]/.test(text)
  if (code === 'procurement') return /採購|供應商|購料/.test(text)
  return false
}
export function ruleRecommendationMatches(context: RecommendationPosition[], role: ExternalRoleCatalogRoleV1): RecommendationMatch[] {
  return context.flatMap(position => {
    const admin = role.code === 'pdm_admin'
    const dutyIds = position.duties.filter(duty => admin ? explicitAdministration(`${duty.title} ${duty.description}`) : businessMatch(role.code, `${duty.title} ${duty.description}`)).map(duty => duty.dutyId)
    const titleMatch = admin ? explicitAdministration(`${position.title} ${position.organizationRole}`)
      : businessMatch(role.code, `${position.title} ${position.organizationRole}`)
    return titleMatch || dutyIds.length ? [{ positionId: position.positionId, dutyIds }] : []
  })
}

export function expandRecommendationMatches(sources: ReturnType<typeof recommendationSources>, matches: RecommendationMatch[]) {
  const candidates = new Map<string, EmployeeRecommendationCandidate>()
  for (const match of matches) {
    const position = sources.context.find(value => value.positionId === match.positionId)
    if (!position) continue
    const duties = position.duties.filter(duty => match.dutyIds.includes(duty.dutyId))
    const reason = duties.length ? `職掌：${duties.slice(0, 2).map(duty => duty.title).join('、')}` : `職位：${position.title}${position.organizationRole && position.organizationRole !== position.title ? `（${position.organizationRole}）` : ''}`
    for (const assignment of sources.currentAssignments.filter(value => value.positionId === match.positionId)) {
      const employee = sources.employees.find(value => value.id === assignment.employeeId)
      if (!employee || candidates.has(employee.id)) continue
      candidates.set(employee.id, { employeeId: employee.id, name: employee.name, departmentName: position.department || '未設定部門', positionTitle: position.title, positionId: position.positionId, reason, basis: duties.length ? 'duty' : 'position' })
    }
  }
  return [...candidates.values()].slice(0, 8)
}
