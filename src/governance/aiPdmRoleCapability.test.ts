import { describe, expect, it } from 'vitest'
import { createAiPdmRoleCatalog } from './aiPdmCatalog'
import { buildAiPdmRoleCapabilityProjection, recommendedRoleIdForPosition } from './aiPdmRoleCapability'

const catalog = createAiPdmRoleCatalog()

const organization = {
  versionId: 'workspace-v1',
  revision: 'workspace-rev-1',
  employees: [
    { id: 'employee-1', name: '王大明', status: 'active' as const, departmentIds: ['dept-rd'], primaryAssignmentId: 'assignment-1', administrativeApproverOverrideEmployeeId: null },
    { id: 'employee-2', name: '李雅芳', status: 'active' as const, departmentIds: ['dept-rd'], primaryAssignmentId: 'assignment-2', administrativeApproverOverrideEmployeeId: null },
  ],
  departments: [{ id: 'dept-rd', name: '研發部', parentId: null }],
  roles: [{ id: 'org-role-rd-manager', name: '研發主管' }],
  positions: [{ id: 'position-rd-manager', roleId: 'org-role-rd-manager', departmentId: 'dept-rd', parentPositionId: null, organizationLevelId: null, title: '研發主管', status: 'active' as const, allowMultipleAssignees: true }],
  assignments: [
    { id: 'assignment-1', employeeId: 'employee-1', positionId: 'position-rd-manager', assignmentType: 'regular' as const, validFrom: '2026-01-01', validTo: null },
    { id: 'assignment-2', employeeId: 'employee-2', positionId: 'position-rd-manager', assignmentType: 'acting' as const, validFrom: '2026-01-01', validTo: '2026-12-31' },
  ]
}

describe('AI-PDM role capability projection', () => {
  it('keeps recommendation separate from adoption and does not auto-select employees', () => {
    expect(recommendedRoleIdForPosition(organization.positions[0], organization.roles)).toBe('role-rd-manager')
    const projection = buildAiPdmRoleCapabilityProjection({
      stableRoleId: 'role-rd-manager',
      catalogRole: catalog.roles.find((role) => role.stableRoleId === 'role-rd-manager')!,
      organization,
      adoptedPositionIds: [],
      adoptionInitialized: false,
      assignmentSources: [],
      governanceRevision: 'governance-rev-1',
      changeCursor: 0,
      now: '2026-09-01T00:00:00Z'
    })
    expect(projection.adoptionState).toBe('uninitialized')
    expect(projection.positions[0]).toMatchObject({ recommended: true, adopted: false, recommendationVersion: 'position-role-recommendation.v1' })
    expect(projection.positions[0].employees.every((employee) => employee.sourceSelected === false && employee.effectiveHolder === false)).toBe(true)
  })

  it('deduplicates effective holders while preserving source count', () => {
    const projection = buildAiPdmRoleCapabilityProjection({
      stableRoleId: 'role-rd-manager',
      catalogRole: catalog.roles.find((role) => role.stableRoleId === 'role-rd-manager')!,
      organization,
      adoptedPositionIds: ['position-rd-manager'],
      assignmentSources: [{ positionId: 'position-rd-manager', employeeId: 'employee-1' }, { positionId: 'position-rd-manager', employeeId: 'employee-2' }],
      governanceRevision: 'governance-rev-2',
      changeCursor: 1,
      now: '2026-09-01T00:00:00Z'
    })
    expect(projection.adoptionState).toBe('published')
    expect(projection.positions[0].employees.map((employee) => employee.effectiveHolder)).toEqual([true, true])
    expect(projection.positions[0].employees.map((employee) => employee.sourceCount)).toEqual([1, 1])
  })

  it('maps production planning and production positions to their new role names', () => {
    const productionRoles = [
      { id: 'org-role-production-planning', name: '生管人員' },
      { id: 'org-role-production', name: '生產人員' },
    ]
    const productionPlanning = { ...organization.positions[0], id: 'position-production-planning', roleId: 'org-role-production-planning', title: '生管人員' }
    const production = { ...organization.positions[0], id: 'position-production', roleId: 'org-role-production', title: '生產人員' }
    expect(recommendedRoleIdForPosition(productionPlanning, productionRoles)).toBe('role-production-planning')
    expect(recommendedRoleIdForPosition(production, productionRoles)).toBe('role-manufacturing')
  })
})
