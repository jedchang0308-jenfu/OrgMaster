import { describe, expect, it } from 'vitest'
import { applyGovernanceCommandV2, applyGovernanceCommandV3 } from './commands'
import { createSeedDocumentV2 } from './migrateGovernanceV1ToV2'
import { migrateGovernanceV2ToV3 } from './migrateGovernanceV2ToV3'
import { readAiPdmRoleCatalog } from './aiPdmCatalog'
import type { GovernanceCommandV2, GovernanceRoleAssignmentV3 } from './types'

const catalog = readAiPdmRoleCatalog()
function fixture() {
  const document = migrateGovernanceV2ToV3(createSeedDocumentV2(), 'fixture', catalog)
  const role = document.draft.applicationRoles.find(role => role.id === 'role-orgmaster-admin')!
  const assignment: GovernanceRoleAssignmentV3 = { id: 'revoked-1', employeeId: 'employee-1', applicationId: 'orgmaster', roleId: role.id, roleCodeSnapshot: role.code, roleNameSnapshot: role.name, catalogVersion: null, scope: { kind: 'global' }, status: 'revoked', validFrom: '2026-01-01T00:00:00Z', validTo: null, effectState: 'orgmaster-enforced', basis: 'manual', subjectKind: 'employee', targetPrincipalId: null, sources: [], metadata: { sponsorEmployeeId: 'employee-2', reviewDueAt: null }, createdByPrincipalId: 'original-actor', createdReason: 'original reason' }
  document.draft.roleAssignments = [assignment]
  return { document, assignment }
}
const command = (type: 'RESTORE_ROLE_ASSIGNMENT' | 'REMOVE_ROLE_ASSIGNMENT', id = 'revoked-1'): GovernanceCommandV2 => ({ type, id, commandId: 'cmd-' + type, reason: 'test' })
const apply = (document: ReturnType<typeof fixture>['document'], cmd: GovernanceCommandV2) => applyGovernanceCommandV3(document, cmd, 'operator', undefined, [catalog])
const error = (code: string) => expect.objectContaining({ issues: expect.arrayContaining([expect.objectContaining({ code })]) })

describe('ordinary assignment lifecycle commands', () => {
  it('restores only status, preserving provenance, scope and original document', () => {
    const { document, assignment } = fixture()
    const before = JSON.stringify(document)
    const result = apply(document, command('RESTORE_ROLE_ASSIGNMENT'))
    expect(result.document.draft.roleAssignments[0]).toEqual({ ...assignment, status: 'active' })
    expect(JSON.stringify(document)).toBe(before)
    expect(result.document.publishedVersions).toBe(document.publishedVersions)
    expect(result.document.auditEvents).toBe(document.auditEvents)
  })
  it('removes the exact revoked ID from draft without touching another record or history', () => {
    const { document, assignment } = fixture()
    document.draft.roleAssignments.push({ ...assignment, id: 'other' })
    const result = apply(document, command('REMOVE_ROLE_ASSIGNMENT'))
    expect(result.document.draft.roleAssignments.map(v => v.id)).toEqual(['other'])
    expect(document.draft.roleAssignments).toHaveLength(2)
    expect(result.document.publishedVersions).toBe(document.publishedVersions)
  })
  it('rejects deleting active, missing and delegated assignments', () => {
    const { document } = fixture()
    expect(() => apply(document, command('REMOVE_ROLE_ASSIGNMENT', 'missing'))).toThrowError(error('ASSIGNMENT_NOT_FOUND'))
    document.draft.roleAssignments[0].status = 'active'
    expect(() => apply(document, command('REMOVE_ROLE_ASSIGNMENT'))).toThrowError(error('ASSIGNMENT_REVOKE_REQUIRED'))
    document.draft.roleAssignments[0].status = 'revoked'
    document.draft.roleDelegations = [{ sourceAssignmentId: 'revoked-1' } as typeof document.draft.roleDelegations[number]]
    expect(() => apply(document, command('REMOVE_ROLE_ASSIGNMENT'))).toThrowError(error('ASSIGNMENT_IN_USE'))
  })
  it.each(['RESTORE_ROLE_ASSIGNMENT', 'REMOVE_ROLE_ASSIGNMENT'] as const)('blocks non-manual and exact Principal owners for %s', type => {
    const { document } = fixture()
    document.draft.roleAssignments[0].basis = 'position_adoption'
    expect(() => apply(document, command(type))).toThrowError(error('ASSIGNMENT_OWNER_COMMAND_REQUIRED'))
    document.draft.roleAssignments[0].basis = 'manual'
    document.draft.roleAssignments[0].subjectKind = 'principal'
    expect(() => apply(document, command(type))).toThrowError(error('ASSIGNMENT_OWNER_COMMAND_REQUIRED'))
  })
  it('rejects expired, inactive-role and duplicate active restoration', () => {
    const { document, assignment } = fixture()
    document.draft.roleAssignments[0].validTo = '2026-02-01T00:00:00Z'
    expect(() => apply(document, command('RESTORE_ROLE_ASSIGNMENT'))).toThrowError(error('ASSIGNMENT_EXPIRED'))
    document.draft.roleAssignments[0].validTo = null
    document.draft.applicationRoles.find(v => v.id === assignment.roleId)!.status = 'inactive'
    expect(() => apply(document, command('RESTORE_ROLE_ASSIGNMENT'))).toThrowError(error('REFERENCE_NOT_FOUND'))
    document.draft.applicationRoles.find(v => v.id === assignment.roleId)!.status = 'active'
    document.draft.roleAssignments.push({ ...assignment, id: 'active-other', status: 'active' })
    expect(() => apply(document, command('RESTORE_ROLE_ASSIGNMENT'))).toThrowError(error('DUPLICATE_ACTIVE_ASSIGNMENT'))
  })
  it('preserves future periods and rejects old catalog restoration', () => {
    const { document } = fixture()
    document.draft.roleAssignments[0].validFrom = '2099-01-01T00:00:00Z'
    expect(apply(document, command('RESTORE_ROLE_ASSIGNMENT')).document.draft.roleAssignments[0].validFrom).toBe('2099-01-01T00:00:00Z')
    const role = catalog.roles.find(v => v.code === 'rd')!
    document.draft.roleAssignments[0] = { ...document.draft.roleAssignments[0], applicationId: 'ai-pdm', roleId: role.stableRoleId, roleCodeSnapshot: role.code, roleNameSnapshot: role.displayName, catalogVersion: 'old', effectState: 'not-synchronized' }
    expect(() => apply(document, command('RESTORE_ROLE_ASSIGNMENT'))).toThrowError(error('EXTERNAL_CATALOG_STALE'))
  })
  it('rejects restoration for an inactive Employee in the actual organization source', () => {
    const { document } = fixture()
    const source = { workspaceVersionId: 'current', workspaceRevision: 'r1', state: { employees: [{ id: 'employee-1', status: 'inactive' }], departments: [], roles: [], positions: [], assignments: [] } } as unknown as NonNullable<Parameters<typeof applyGovernanceCommandV3>[3]>
    expect(() => applyGovernanceCommandV3(document, command('RESTORE_ROLE_ASSIGNMENT'), 'operator', source, [catalog])).toThrowError(error('EMPLOYEE_NOT_ACTIVE'))
  })
  it('supports the compatibility V2 command without changing original scope', () => {
    const { assignment } = fixture()
    const document = createSeedDocumentV2()
    document.draft.roleAssignments = [assignment]
    expect(applyGovernanceCommandV2(document, command('RESTORE_ROLE_ASSIGNMENT'), undefined, [catalog]).document.draft.roleAssignments[0]).toEqual({ ...assignment, status: 'active' })
    expect(applyGovernanceCommandV2(document, command('REMOVE_ROLE_ASSIGNMENT'), undefined, [catalog]).document.draft.roleAssignments).toEqual([])
  })
})
