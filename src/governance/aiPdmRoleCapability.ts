import type { Department, Employee, Position, Role, Assignment } from '../types'
import type { ExternalRoleCatalogRoleV1 } from './types'

export const AI_PDM_ROLE_CAPABILITY_CONTRACT_VERSION = 'orgmaster.role-capability-projection.v1' as const
export const AI_PDM_APPLICATION_ID = 'ai-pdm' as const
export const AI_PDM_RECOMMENDATION_VERSION = 'position-role-recommendation.v1' as const

export type RoleCapabilityAssignmentSource = {
  employeeId: string
  positionId: string
}

export type AiPdmRoleCapabilityEmployee = {
  employeeId: string
  displayName: string
  assignmentType: Assignment['assignmentType']
  assignmentValidUntil: string | null
  sourceSelected: boolean
  effectiveHolder: boolean
  sourceCount: number
  status: 'active' | 'inactive'
}

export type AiPdmRoleCapabilityPosition = {
  positionId: string
  displayName: string
  departmentName: string | null
  status: 'active' | 'inactive'
  recommended: boolean
  adopted: boolean
  recommendationVersion: typeof AI_PDM_RECOMMENDATION_VERSION | null
  employees: AiPdmRoleCapabilityEmployee[]
}

export type AiPdmRoleCapabilityProjection = {
  contractVersion: typeof AI_PDM_ROLE_CAPABILITY_CONTRACT_VERSION
  applicationId: typeof AI_PDM_APPLICATION_ID
  stableRoleId: string
  role: {
    stableRoleId: string
    roleCode: string
    displayName: string
    assignable: boolean
    riskLevel: ExternalRoleCatalogRoleV1['riskLevel']
    recommendationAllowed: boolean
  }
  governanceRevision: string
  organizationVersionId: string
  organizationRevision: string
  changeCursor: number
  adoptionState: 'uninitialized' | 'published'
  positions: AiPdmRoleCapabilityPosition[]
  manualAssignments: []
}

export type RoleCapabilityProjectionInput = {
  stableRoleId: string
  catalogRole: ExternalRoleCatalogRoleV1
  organization: {
    versionId: string
    revision: string
    employees: Employee[]
    departments: Department[]
    roles: Role[]
    positions: Position[]
    assignments: Assignment[]
  }
  adoptedPositionIds: string[]
  adoptionInitialized?: boolean
  assignmentSources: RoleCapabilityAssignmentSource[]
  governanceRevision: string
  changeCursor: number
  now?: string
}

function isActiveWindow(from: string, to: string | null, now: string) {
  const at = Date.parse(now)
  return Number.isFinite(at) && Date.parse(from) <= at && (to === null || at < Date.parse(to))
}

function normalizedText(value: string) {
  return value.trim().toLocaleLowerCase('zh-TW')
}

export function recommendedRoleIdForPosition(position: Position, organizationRoles: Role[]) {
  const organizationRole = organizationRoles.find((role) => role.id === position.roleId)
  const text = normalizedText(`${position.title} ${organizationRole?.name ?? ''}`)
  if (text.includes('研發主管') || text.includes('工程主管') || (text.includes('研發') && (text.includes('經理') || text.includes('管理') || text.includes('manager')))) return 'role-rd-manager'
  if (text.includes('研發') || text.includes('工程')) return 'role-rd'
  if (text.includes('品保') || text.includes('品質') || text.includes('qa')) return 'role-qa'
  if (text.includes('生管') || text.includes('生產管理') || text.includes('生產計畫') || text.includes('排程')) return 'role-production-planning'
  if (text.includes('製造') || text.includes('生產')) return 'role-manufacturing'
  if (text.includes('採購') || text.includes('供應')) return 'role-procurement'
  return null
}

function sourceKey(positionId: string, employeeId: string) {
  return `${positionId}\0${employeeId}`
}

export function buildAiPdmRoleCapabilityProjection(input: RoleCapabilityProjectionInput): AiPdmRoleCapabilityProjection {
  const now = input.now ?? new Date().toISOString()
  const adopted = new Set(input.adoptedPositionIds)
  const selectedSources = new Set(input.assignmentSources.map((source) => sourceKey(source.positionId, source.employeeId)))
  const departmentNames = new Map(input.organization.departments.map((department) => [department.id, department.name]))
  const employeesById = new Map(input.organization.employees.map((employee) => [employee.id, employee]))
  const activeAssignments = input.organization.assignments.filter((assignment) => {
    const employee = employeesById.get(assignment.employeeId)
    return employee?.status === 'active' && isActiveWindow(assignment.validFrom, assignment.validTo, now)
  })
  const sourcesByEmployee = new Map<string, Assignment[]>()
  for (const source of input.assignmentSources) {
    const assignment = activeAssignments.find((candidate) => candidate.positionId === source.positionId && candidate.employeeId === source.employeeId)
    if (!assignment) continue
    const list = sourcesByEmployee.get(source.employeeId) ?? []
    list.push(assignment)
    sourcesByEmployee.set(source.employeeId, list)
  }

  const positions = input.organization.positions
    .filter((position) => position.status === 'active')
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-Hant') || a.id.localeCompare(b.id))
    .map((position) => {
      const assignments = activeAssignments
        .filter((assignment) => assignment.positionId === position.id)
        .sort((a, b) => a.employeeId.localeCompare(b.employeeId))
      return {
        positionId: position.id,
        displayName: position.title,
        departmentName: position.departmentId ? departmentNames.get(position.departmentId) ?? null : null,
        status: position.status,
        recommended: recommendedRoleIdForPosition(position, input.organization.roles) === input.stableRoleId,
        adopted: adopted.has(position.id),
        recommendationVersion: recommendedRoleIdForPosition(position, input.organization.roles) === input.stableRoleId ? AI_PDM_RECOMMENDATION_VERSION : null,
        employees: assignments.map((assignment) => {
          const employee = employeesById.get(assignment.employeeId)
          const sources = sourcesByEmployee.get(assignment.employeeId) ?? []
          const selected = selectedSources.has(sourceKey(position.id, assignment.employeeId))
          return {
            employeeId: assignment.employeeId,
            displayName: employee?.name ?? '未命名人員',
            assignmentType: assignment.assignmentType,
            assignmentValidUntil: assignment.validTo,
            sourceSelected: selected,
            effectiveHolder: selected && sources.length > 0,
            sourceCount: sources.length,
            status: (employee?.status === 'active' ? 'active' : 'inactive') as 'active' | 'inactive'
          }
        })
      }
    })

  return {
    contractVersion: AI_PDM_ROLE_CAPABILITY_CONTRACT_VERSION,
    applicationId: AI_PDM_APPLICATION_ID,
    stableRoleId: input.stableRoleId,
    role: {
      stableRoleId: input.catalogRole.stableRoleId,
      roleCode: input.catalogRole.code,
      displayName: input.catalogRole.displayName,
      assignable: input.catalogRole.assignable,
      riskLevel: input.catalogRole.riskLevel,
      recommendationAllowed: input.catalogRole.assignable
    },
    governanceRevision: input.governanceRevision,
    organizationVersionId: input.organization.versionId,
    organizationRevision: input.organization.revision,
    changeCursor: input.changeCursor,
    adoptionState: (input.adoptionInitialized ?? input.adoptedPositionIds.length > 0) ? 'published' : 'uninitialized',
    positions,
    manualAssignments: []
  }
}

export function selectedEmployeeSourceKeys(projection: AiPdmRoleCapabilityProjection) {
  return projection.positions.flatMap((position) => position.employees.filter((employee) => employee.sourceSelected).map((employee) => sourceKey(position.positionId, employee.employeeId)))
}

export function roleCapabilitySourceKey(positionId: string, employeeId: string) {
  return sourceKey(positionId, employeeId)
}
