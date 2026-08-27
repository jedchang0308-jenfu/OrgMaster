import { describe, expect, it } from 'vitest'
import { migrateGovernanceV1ToV2 } from './migrateGovernanceV1ToV2'
import { createSeedDocument } from '../../server/orgmasterGovernanceStore'
import { readAiPdmRoleCatalog } from './aiPdmCatalog'

describe('V1 to V2 governance migration', () => {
  it('keeps V1 bytes untouched, maps supported assignments, and records unresolved legacy data', () => {
    const legacy = createSeedDocument('2026-08-27T00:00:00.000Z')
    const externalPermission = legacy.draft.permissions.find((permission) => permission.applicationId === 'ai-pdm')!
    legacy.draft.roleAssignments.push({ id: 'assignment-rd', employeeId: 'employee-1', roleId: 'role-rd', scope: { kind: 'department', value: 'dept-rd' }, status: 'active', validFrom: '2026-08-27T00:00:00.000Z', validTo: null })
    legacy.draft.roleAssignments.push({ id: 'assignment-unknown', employeeId: 'employee-1', roleId: 'role-no-longer-exists', scope: { kind: 'global' }, status: 'active', validFrom: '2026-08-27T00:00:00.000Z', validTo: null })
    legacy.draft.delegations.push({ id: 'delegation-legacy', applicationId: 'ai-pdm', fromEmployeeId: 'employee-1', toEmployeeId: 'employee-2', permissionIds: [externalPermission.id], scope: { kind: 'department', value: 'dept-rd' }, status: 'active', validFrom: '2026-08-27T00:00:00.000Z', validTo: '2026-08-28T00:00:00.000Z', reason: 'legacy fixture' })
    const before = JSON.stringify(legacy)
    const migrated = migrateGovernanceV1ToV2(legacy, 'legacy-revision-1', [readAiPdmRoleCatalog('valid')], '2026-08-27T01:00:00.000Z')
    expect(JSON.stringify(legacy)).toBe(before)
    expect(migrated.schemaVersion).toBe(2)
    expect(migrated.draft.applicationRoles.every((role) => role.applicationId === 'orgmaster')).toBe(true)
    expect(migrated.draft.permissions.every((permission) => permission.applicationId === 'orgmaster')).toBe(true)
    expect(migrated.draft.roleAssignments).toHaveLength(1)
    expect(migrated.draft.roleAssignments[0]).toMatchObject({ applicationId: 'ai-pdm', roleId: 'role-rd', catalogVersion: 'ai-pdm-role-fixture-2026-08-27-v1', effectState: 'not-synchronized' })
    expect(migrated.migration.unresolvedAssignments[0].reason).toBe('ROLE_NOT_FOUND')
    expect(migrated.migration.unresolvedDelegations[0].reason).toBe('PERMISSION_DELEGATION_NOT_MIGRATABLE')
    expect(migrated.migration.removedExternalDraftCounts).toMatchObject({ permissions: legacy.draft.permissions.filter((permission) => permission.applicationId === 'ai-pdm').length, approvalPolicies: 0 })
  })
})
