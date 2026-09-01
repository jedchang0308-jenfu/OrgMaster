import type { Assignment, Department, Employee, OrgDirectoryState, OrgMember, Position, Role } from './types'
import { createDefaultOrganizationLevels } from './organizationLevels'

export const screenshotOrganizationLevels = createDefaultOrganizationLevels()

const departmentIds = {
  executive: 'department-executive-room',
  production: 'department-production',
  marketing: 'department-marketing',
  management: 'department-management',
  research: 'department-research',
  finance: 'department-finance',
} as const

export const screenshotEmployees: Employee[] = [
  { id: 'employee-shijie', name: '張仕杰', status: 'active', departmentIds: [departmentIds.executive, departmentIds.research, departmentIds.finance], primaryAssignmentId: 'assignment-general-manager-shijie', administrativeApproverOverrideEmployeeId: null },
  { id: 'employee-youhao', name: '張祐豪', status: 'active', departmentIds: [departmentIds.management, departmentIds.marketing], primaryAssignmentId: 'assignment-management-manager-youhao', administrativeApproverOverrideEmployeeId: null },
  { id: 'employee-chenghan', name: '張成漢', status: 'active', departmentIds: [departmentIds.production, departmentIds.marketing], primaryAssignmentId: 'assignment-production-manager-chenghan', administrativeApproverOverrideEmployeeId: null },
]

export const screenshotDepartments: Department[] = [
  { id: departmentIds.executive, name: '總經理室', parentId: null },
  { id: departmentIds.production, name: '生產部', parentId: null },
  { id: departmentIds.marketing, name: '營銷部', parentId: null },
  { id: departmentIds.management, name: '管理部', parentId: null },
  { id: departmentIds.research, name: '研發部', parentId: null },
  { id: departmentIds.finance, name: '財務部', parentId: null },
]

const titles = [
  '總經理',
  '生產部經理',
  '營銷部經理',
  '管理部經理',
  '研發部經理',
  '財務部經理',
  '製造組主管',
  '工務組主管',
  '組立人員',
  '設備技師',
  '生管專員',
  '業務人員',
  '行銷專員',
  '資訊專員',
  '人資專員',
  '採購專員',
  '機械工程師',
  '品保工程師',
  '出納專員',
  '會計專員',
] as const

export const screenshotRoles: Role[] = titles.map((title, index) => ({
  id: `role-screenshot-${index + 1}`,
  name: title,
}))

const positionDefinitions: Array<{
  id: string
  title: typeof titles[number]
  departmentId: string
  parentPositionId: string | null
}> = [
  { id: 'position-general-manager', title: '總經理', departmentId: departmentIds.executive, parentPositionId: null },
  { id: 'position-production-manager', title: '生產部經理', departmentId: departmentIds.production, parentPositionId: 'position-general-manager' },
  { id: 'position-marketing-manager', title: '營銷部經理', departmentId: departmentIds.marketing, parentPositionId: 'position-general-manager' },
  { id: 'position-management-manager', title: '管理部經理', departmentId: departmentIds.management, parentPositionId: 'position-general-manager' },
  { id: 'position-research-manager', title: '研發部經理', departmentId: departmentIds.research, parentPositionId: 'position-general-manager' },
  { id: 'position-finance-manager', title: '財務部經理', departmentId: departmentIds.finance, parentPositionId: 'position-general-manager' },
  { id: 'position-manufacturing-lead', title: '製造組主管', departmentId: departmentIds.production, parentPositionId: 'position-production-manager' },
  { id: 'position-utility-lead', title: '工務組主管', departmentId: departmentIds.production, parentPositionId: 'position-production-manager' },
  { id: 'position-assembly-worker', title: '組立人員', departmentId: departmentIds.production, parentPositionId: 'position-manufacturing-lead' },
  { id: 'position-equipment-technician', title: '設備技師', departmentId: departmentIds.production, parentPositionId: 'position-utility-lead' },
  { id: 'position-production-control', title: '生管專員', departmentId: departmentIds.marketing, parentPositionId: 'position-marketing-manager' },
  { id: 'position-sales-staff', title: '業務人員', departmentId: departmentIds.marketing, parentPositionId: 'position-marketing-manager' },
  { id: 'position-marketing-specialist', title: '行銷專員', departmentId: departmentIds.marketing, parentPositionId: 'position-marketing-manager' },
  { id: 'position-information-specialist', title: '資訊專員', departmentId: departmentIds.management, parentPositionId: 'position-management-manager' },
  { id: 'position-hr-specialist', title: '人資專員', departmentId: departmentIds.management, parentPositionId: 'position-management-manager' },
  { id: 'position-procurement-specialist', title: '採購專員', departmentId: departmentIds.management, parentPositionId: 'position-management-manager' },
  { id: 'position-mechanical-engineer', title: '機械工程師', departmentId: departmentIds.research, parentPositionId: 'position-research-manager' },
  { id: 'position-quality-engineer', title: '品保工程師', departmentId: departmentIds.research, parentPositionId: 'position-research-manager' },
  { id: 'position-cashier', title: '出納專員', departmentId: departmentIds.finance, parentPositionId: 'position-finance-manager' },
  { id: 'position-accounting-specialist', title: '會計專員', departmentId: departmentIds.finance, parentPositionId: 'position-finance-manager' },
]

export const screenshotPositions: Position[] = positionDefinitions.map((definition, index) => ({
  ...definition,
  roleId: screenshotRoles[index].id,
  status: 'active',
  allowMultipleAssignees: false,
  organizationLevelId: definition.id === 'position-general-manager'
    ? 'level-executive'
    : definition.title.endsWith('經理')
      ? 'level-department'
      : definition.title.endsWith('主管')
        ? 'level-team'
        : 'level-execution',
}))

const verticalIds = new Set([
  'position-marketing-manager',
  'position-management-manager',
  'position-research-manager',
  'position-finance-manager',
  'position-manufacturing-lead',
  'position-utility-lead',
])

export const screenshotMembers: OrgMember[] = positionDefinitions.map((definition, index) => ({
  id: definition.id,
  order: definition.parentPositionId === 'position-general-manager'
    ? index - 1
    : definition.parentPositionId === 'position-production-manager'
      ? index - 6
      : definition.parentPositionId === 'position-marketing-manager'
        ? index - 10
        : definition.parentPositionId === 'position-management-manager'
          ? index - 13
          : definition.parentPositionId === 'position-research-manager'
            ? index - 16
            : definition.parentPositionId === 'position-finance-manager'
              ? index - 18
              : definition.parentPositionId === 'position-manufacturing-lead' || definition.parentPositionId === 'position-utility-lead'
                ? 0
                : 0,
  childrenAxis: verticalIds.has(definition.id) ? 'vertical' : 'horizontal',
}))

const activeAssignment = (id: string, employeeId: string, positionId: string): Assignment => ({
  id,
  employeeId,
  positionId,
  assignmentType: 'regular',
  validFrom: '2026-01-01',
  validTo: null,
})

export const screenshotAssignments: Assignment[] = [
  activeAssignment('assignment-general-manager-shijie', 'employee-shijie', 'position-general-manager'),
  activeAssignment('assignment-production-manager-chenghan', 'employee-chenghan', 'position-production-manager'),
  activeAssignment('assignment-marketing-manager-chenghan', 'employee-chenghan', 'position-marketing-manager'),
  activeAssignment('assignment-management-manager-youhao', 'employee-youhao', 'position-management-manager'),
  activeAssignment('assignment-marketing-specialist-youhao', 'employee-youhao', 'position-marketing-specialist'),
  activeAssignment('assignment-research-manager-shijie', 'employee-shijie', 'position-research-manager'),
  activeAssignment('assignment-finance-manager-shijie', 'employee-shijie', 'position-finance-manager'),
]

export const screenshotOrganizationState: OrgDirectoryState = {
  employees: screenshotEmployees,
  departments: screenshotDepartments,
  roles: screenshotRoles,
  positions: screenshotPositions,
  assignments: screenshotAssignments,
  members: screenshotMembers,
  roleCombinationRiskRules: [],
  organizationLevels: screenshotOrganizationLevels,
  organizationLayout: { mode: 'tree', showLevelGuides: true, positionYOverrides: {} },
  duties: [],
  dutyPositionRelations: [],
  processes: [],
  processNodes: [],
  processEdges: [],
  processNodeDutyLinks: [],
}
