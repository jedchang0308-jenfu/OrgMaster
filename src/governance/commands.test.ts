import { describe, expect, it } from 'vitest'
import { applyGovernanceCommand, applyGovernanceCommandV2, commandHash } from './commands'
import { createSeedDocument } from '../../server/orgmasterGovernanceStore'
import { createSeedDocumentV2 } from './migrateGovernanceV1ToV2'
import { readAiPdmRoleCatalog } from './aiPdmCatalog'
import { GovernanceValidationError } from './validation'
describe('governance draft commands', () => {
  it('applies an upsert and produces deterministic command hash', () => {
    const document = createSeedDocument('2026-01-01T00:00:00.000Z')
    const command = { type: 'UPSERT_APPLICATION_ROLE' as const, commandId: 'cmd-1', reason: 'test', value: { id: 'role-test', applicationId: 'orgmaster' as const, code: 'test_role', name: 'Test', status: 'active' as const, systemDefined: false } }
    const result = applyGovernanceCommand(document, command)
    expect(result.status).toBe('applied')
    expect(result.document.draft.applicationRoles.some((role) => role.id === 'role-test')).toBe(true)
    expect(commandHash(command)).toBe(commandHash({ ...command }))
  })
  it('returns noop for an unchanged status command', () => {
    const document = createSeedDocument()
    const result = applyGovernanceCommand(document, { type: 'SET_APPLICATION_ROLE_STATUS', commandId: 'cmd-2', reason: 'test', id: 'role-orgmaster-admin', status: 'active' })
    expect(result.status).toBe('noop')
  })
  it('keeps external role and permission ownership read-only in V2', () => {
    const document = createSeedDocumentV2()
    expect(() => applyGovernanceCommandV2(document, { type: 'UPSERT_APPLICATION_ROLE', commandId: 'external-role', reason: 'test', value: { id: 'external-role', applicationId: 'ai-pdm', code: 'external', name: 'External', status: 'active', systemDefined: false } })).toThrow(GovernanceValidationError)
  })
  it('applies a catalog-backed V2 external assignment without importing permissions', () => {
    const document = createSeedDocumentV2()
    const catalog = readAiPdmRoleCatalog('valid'); const role = catalog.roles.find((entry) => entry.stableRoleId === 'role-rd')!
    const result = applyGovernanceCommandV2(document, { type: 'UPSERT_ROLE_ASSIGNMENT', commandId: 'assignment-1', reason: 'test', value: { id: 'assignment-1', employeeId: 'employee-1', applicationId: 'ai-pdm', roleId: role.stableRoleId, roleCodeSnapshot: role.code, roleNameSnapshot: role.displayName, catalogVersion: catalog.catalogVersion, scope: { kind: 'department', value: 'dept-rd' }, status: 'active', validFrom: '2026-08-27T00:00:00.000Z', validTo: null, effectState: 'not-synchronized' } }, undefined, [catalog])
    expect(result.document.draft.roleAssignments[0].applicationId).toBe('ai-pdm')
    expect(result.document.draft.permissions.every((permission) => permission.applicationId === 'orgmaster')).toBe(true)
  })
})
