import { describe, expect, it } from 'vitest'
import { createAiPdmRoleCatalog } from './aiPdmCatalog'
import { classifyAssignmentSurface, genericV2AssignmentSurfaceIssue } from './assignmentSurface'

describe('assignment surface classifier', () => {
  const catalog = createAiPdmRoleCatalog()
  const systemAdmin = catalog.roles.find((role) => role.stableRoleId === 'role-system-admin')!
  const ordinary = catalog.roles.find((role) => role.stableRoleId === 'role-rd')!

  it('classifies complete ordinary and privileged role policy through one resolver', () => {
    expect(classifyAssignmentSurface('ai-pdm', ordinary)).toBe('ordinary')
    expect(classifyAssignmentSurface('ai-pdm', systemAdmin)).toBe('privileged_system_admin')
    expect(classifyAssignmentSurface('orgmaster', { id: 'role-orgmaster-admin', applicationId: 'orgmaster', code: 'orgmaster_admin', name: 'Admin', status: 'active', systemDefined: true })).toBe('ordinary')
  })

  it.each([
    ['stableRoleId', 'role-drifted'],
    ['code', 'system_admin_drifted'],
    ['status', 'inactive'],
    ['assignable', false],
    ['riskLevel', 'high'],
    ['subjectKind', 'employee'],
    ['assignmentTier', 'app_admin'],
    ['recommendationAllowed', true],
    ['delegationAllowed', true],
    ['allowedScopeKinds', ['workspace']],
  ] as const)('fails closed when system admin %s drifts', (field, value) => {
    expect(classifyAssignmentSurface('ai-pdm', { ...systemAdmin, [field]: value })).toBe('unsupported_principal_role')
  })

  it.each(['subjectKind', 'assignmentTier', 'recommendationAllowed', 'delegationAllowed'] as const)('keeps legacy snapshots with missing %s read-only', (field) => {
    const historical = { ...systemAdmin }
    delete historical[field]
    expect(classifyAssignmentSurface('ai-pdm', historical)).toBe('unsupported_principal_role')
  })

  it('routes system admin and any principal-only role away from generic V2', () => {
    expect(genericV2AssignmentSurfaceIssue('ai-pdm', { stableRoleId: systemAdmin.stableRoleId, code: systemAdmin.code }, systemAdmin)).toBe('PRIVILEGED_ASSIGNMENT_SURFACE_REQUIRED')
    expect(genericV2AssignmentSurfaceIssue('ai-pdm', { stableRoleId: 'role-principal', code: 'principal_role' }, { ...systemAdmin, stableRoleId: 'role-principal', code: 'principal_role' })).toBe('PRIVILEGED_ASSIGNMENT_SURFACE_REQUIRED')
    expect(genericV2AssignmentSurfaceIssue('ai-pdm', { stableRoleId: ordinary.stableRoleId, code: ordinary.code }, ordinary)).toBeNull()
  })
})
