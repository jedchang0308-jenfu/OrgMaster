import { createDefaultOrganizationLevels } from './organizationLevels'
import type { Assignment, Department, Employee, OrgMember, Position, Role } from './types'

export const initialOrganizationLevels = createDefaultOrganizationLevels()

export const initialEmployees: Employee[] = [
  // Restored from the user's saved local organization document (2026-08-11).
  { id: 'employee-lin', name: '張仕杰', status: 'active', departmentIds: ['department-executive'], primaryAssignmentId: 'assignment-ceo', administrativeApproverOverrideEmployeeId: null },
  { id: 'employee-chen', name: '陳思妤', status: 'active', departmentIds: ['department-operations'], primaryAssignmentId: 'assignment-operations', administrativeApproverOverrideEmployeeId: null },
  { id: 'employee-chou', name: '周柏廷', status: 'active', departmentIds: ['department-product-rd'], primaryAssignmentId: 'assignment-product', administrativeApproverOverrideEmployeeId: null },
  { id: 'employee-huang', name: '黃怡安', status: 'active', departmentIds: ['department-finance'], primaryAssignmentId: 'assignment-finance', administrativeApproverOverrideEmployeeId: null },
  { id: 'employee-wu', name: '吳佳穎', status: 'active', departmentIds: ['department-hr'], primaryAssignmentId: 'assignment-hr', administrativeApproverOverrideEmployeeId: null },
  { id: 'employee-chang', name: '張雅雯', status: 'active', departmentIds: ['department-admin'], primaryAssignmentId: 'assignment-admin', administrativeApproverOverrideEmployeeId: null },
  { id: 'employee-hsu', name: '許庭瑋', status: 'active', departmentIds: ['department-design'], primaryAssignmentId: 'assignment-design', administrativeApproverOverrideEmployeeId: null },
  { id: 'employee-wang', name: '王俊傑', status: 'active', departmentIds: ['department-engineering'], primaryAssignmentId: 'assignment-engineering', administrativeApproverOverrideEmployeeId: null },
  { id: 'employee-tseng', name: '曾郁婷', status: 'active', departmentIds: ['department-accounting'], primaryAssignmentId: 'assignment-accounting', administrativeApproverOverrideEmployeeId: null },
  { id: 'employee-chiang', name: '江承翰', status: 'active', departmentIds: ['department-supply'], primaryAssignmentId: 'assignment-procurement', administrativeApproverOverrideEmployeeId: null },
  { id: 'employee-li', name: '李冠廷', status: 'active', departmentIds: ['department-project'], primaryAssignmentId: null, administrativeApproverOverrideEmployeeId: null },
  { id: 'employee-liao', name: '廖婉如', status: 'active', departmentIds: ['department-customer-success'], primaryAssignmentId: null, administrativeApproverOverrideEmployeeId: null },
]

export const initialDepartments: Department[] = [
  { id: 'department-executive', name: '經營管理', parentId: null },
  { id: 'department-operations', name: '營運管理', parentId: 'department-executive' },
  { id: 'department-product-rd', name: '產品研發', parentId: 'department-executive' },
  { id: 'department-finance', name: '財務管理', parentId: 'department-executive' },
  { id: 'department-hr', name: '人力資源', parentId: 'department-executive' },
  { id: 'department-admin', name: '行政管理', parentId: 'department-executive' },
  { id: 'department-design', name: '產品設計', parentId: 'department-product-rd' },
  { id: 'department-engineering', name: '工程研發', parentId: 'department-product-rd' },
  { id: 'department-accounting', name: '財務會計', parentId: 'department-finance' },
  { id: 'department-supply', name: '供應管理', parentId: 'department-finance' },
  { id: 'department-project', name: '專案管理', parentId: 'department-operations' },
  { id: 'department-customer-success', name: '客戶成功', parentId: 'department-operations' },
]

export const initialRoles: Role[] = [
  { id: 'role-ceo', name: '執行長' },
  { id: 'role-coo', name: '營運長' },
  { id: 'role-cpo', name: '產品長' },
  { id: 'role-cfo', name: '財務長' },
  { id: 'role-hr-manager', name: '人資經理' },
  { id: 'role-admin-manager', name: '行政經理' },
  { id: 'role-design-manager', name: '設計主管' },
  { id: 'role-engineering-manager', name: '研發主管' },
  { id: 'role-accounting-manager', name: '會計經理' },
  { id: 'role-procurement-manager', name: '採購經理' },
]

export const initialPositions: Position[] = [
  { id: 'ceo', roleId: 'role-ceo', departmentId: 'department-executive', parentPositionId: null, organizationLevelId: 'level-executive', title: '執行長', status: 'active', allowMultipleAssignees: false },
  { id: 'operations', roleId: 'role-coo', departmentId: 'department-operations', parentPositionId: 'ceo', organizationLevelId: 'level-department', title: '總經理', status: 'active', allowMultipleAssignees: false },
  { id: 'product', roleId: 'role-cpo', departmentId: 'department-product-rd', parentPositionId: 'ceo', organizationLevelId: 'level-department', title: '產品長', status: 'active', allowMultipleAssignees: false },
  { id: 'finance', roleId: 'role-cfo', departmentId: 'department-finance', parentPositionId: 'ceo', organizationLevelId: 'level-department', title: '財務長', status: 'active', allowMultipleAssignees: false },
  { id: 'hr', roleId: 'role-hr-manager', departmentId: 'department-hr', parentPositionId: 'operations', organizationLevelId: 'level-team', title: '人資經理', status: 'active', allowMultipleAssignees: false },
  { id: 'admin', roleId: 'role-admin-manager', departmentId: 'department-admin', parentPositionId: 'operations', organizationLevelId: 'level-team', title: '行政經理', status: 'active', allowMultipleAssignees: false },
  { id: 'design', roleId: 'role-design-manager', departmentId: 'department-design', parentPositionId: 'product', organizationLevelId: 'level-team', title: '設計主管', status: 'active', allowMultipleAssignees: false },
  { id: 'engineering', roleId: 'role-engineering-manager', departmentId: 'department-engineering', parentPositionId: 'product', organizationLevelId: 'level-team', title: '研發主管', status: 'active', allowMultipleAssignees: false },
  { id: 'accounting', roleId: 'role-accounting-manager', departmentId: 'department-accounting', parentPositionId: 'finance', organizationLevelId: 'level-team', title: '會計經理', status: 'active', allowMultipleAssignees: false },
  { id: 'procurement', roleId: 'role-procurement-manager', departmentId: 'department-supply', parentPositionId: 'finance', organizationLevelId: 'level-team', title: '採購經理', status: 'active', allowMultipleAssignees: false },
]

// This relation is only for the canvas presentation tree. Reporting lines are
// intentionally deferred and are not represented in Position or Assignment.
export const initialMembers: OrgMember[] = [
  { id: 'ceo', order: 0, childrenAxis: 'horizontal' },
  { id: 'operations', order: 0, childrenAxis: 'vertical' },
  { id: 'product', order: 1, childrenAxis: 'horizontal' },
  { id: 'finance', order: 2, childrenAxis: 'vertical' },
  { id: 'hr', order: 0, childrenAxis: 'horizontal' },
  { id: 'admin', order: 1, childrenAxis: 'horizontal' },
  { id: 'design', order: 0, childrenAxis: 'vertical' },
  { id: 'engineering', order: 1, childrenAxis: 'vertical' },
  { id: 'accounting', order: 0, childrenAxis: 'horizontal' },
  { id: 'procurement', order: 1, childrenAxis: 'horizontal' },
]

export const initialAssignments: Assignment[] = [
  ['ceo', 'employee-lin'],
  ['operations', 'employee-chen'],
  ['product', 'employee-chou'],
  ['finance', 'employee-huang'],
  ['hr', 'employee-wu'],
  ['admin', 'employee-chang'],
  ['design', 'employee-hsu'],
  ['engineering', 'employee-wang'],
  ['accounting', 'employee-tseng'],
  ['procurement', 'employee-chiang'],
].map(([positionId, employeeId]) => ({
  id: `assignment-${positionId}`,
  positionId,
  employeeId,
  assignmentType: 'regular',
  validFrom: '2026-01-01',
  validTo: null,
}))
