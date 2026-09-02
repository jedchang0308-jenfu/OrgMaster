import { describe, expect, it } from 'vitest'
import { buildPositionRoleRecommendations } from './positionRoleRecommendations'

const catalog = {
  catalogVersion: 'ai-pdm.role-catalog.2026-09-02.v2',
  roles: [{ stableRoleId: 'role-rd-manager', code: 'rd_manager', displayName: '研發主管', status: 'active' as const, assignable: true, riskLevel: 'high' as const, allowedScopeKinds: ['workspace' as const, 'project' as const], recommendationAllowed: true, roleDefinitionHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }]
}

const organization = {
  workspaceVersionId: 'workspace-1', workspaceRevision: 'revision-1', capturedAt: '2026-09-01T00:00:00.000Z',
  employees: [{ id: 'employee-1', primaryAssignmentId: 'position-assignment-1' }], departments: [], organizationRoles: [],
  positions: [{ id: 'position-1', roleId: 'org-role-1', departmentId: null, parentPositionId: null, status: 'active' as const }],
  assignments: [{ id: 'position-assignment-1', employeeId: 'employee-1', positionId: 'position-1', assignmentType: 'regular' as const, validFrom: '2026-01-01T00:00:00.000Z', validTo: null }]
}

describe('Position-to-Role recommendations', () => {
  it('creates a recommendation without creating an assignment', () => {
    const result = buildPositionRoleRecommendations({
      employeeId: 'employee-1', organization, catalog, workspaceKey: 'company-jenfu',
      policies: [{ id: 'policy-1', version: 1, applicationId: 'ai-pdm', positionId: 'position-1', stableRoleId: 'role-rd-manager', catalogVersion: catalog.catalogVersion, defaultScopeSource: 'jenfu_workspace', fixedScopeKey: null, status: 'active', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'principal-admin', updatedAt: '2026-01-01T00:00:00.000Z', updatedBy: 'principal-admin', reason: 'test' }]
    })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ state: 'ready', scope: { kind: 'workspace', value: 'company-jenfu' } })
  })

  it('fails closed when the same role resolves to conflicting scopes', () => {
    const result = buildPositionRoleRecommendations({
      employeeId: 'employee-1', organization, catalog, workspaceKey: 'company-jenfu',
      policies: [
        { id: 'policy-1', version: 1, applicationId: 'ai-pdm', positionId: 'position-1', stableRoleId: 'role-rd-manager', catalogVersion: catalog.catalogVersion, defaultScopeSource: 'jenfu_workspace', fixedScopeKey: null, status: 'active', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'principal-admin', updatedAt: '2026-01-01T00:00:00.000Z', updatedBy: 'principal-admin', reason: 'test' },
        { id: 'policy-2', version: 1, applicationId: 'ai-pdm', positionId: 'position-1', stableRoleId: 'role-rd-manager', catalogVersion: catalog.catalogVersion, defaultScopeSource: 'fixed_project', fixedScopeKey: 'project-1', status: 'active', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'principal-admin', updatedAt: '2026-01-01T00:00:00.000Z', updatedBy: 'principal-admin', reason: 'test' }
      ]
    })
    expect(result).toHaveLength(2)
    expect(result.every((item) => item.state === 'scope_conflict')).toBe(true)
  })
})
