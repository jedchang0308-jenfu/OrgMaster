import { describe, expect, it } from 'vitest'
import { validateDocument, validateDocumentV2, validateGenericV2AssignmentSurface, validatePolicyDataV2 } from './validation'
import { createSeedDocument } from '../../server/orgmasterGovernanceStore'
import { createSeedDocumentV2, } from './migrateGovernanceV1ToV2'
import { readAiPdmRoleCatalog } from './aiPdmCatalog'
describe('governance validation diagnostics', () => { it('accepts the V1 seed document', () => { const issues = validateDocument(createSeedDocument()); expect(issues, JSON.stringify(issues)).toEqual([]) }) })
describe('governance V2 validation diagnostics', () => {
  it('accepts internal and supported external assignment invariants', () => {
    const document = createSeedDocumentV2('2026-08-27T00:00:00.000Z', readAiPdmRoleCatalog('valid'))
    const catalog = readAiPdmRoleCatalog('valid')
    const external = catalog.roles.find((role) => role.stableRoleId === 'role-rd')!
    const assignment = { id: 'assignment-rd', employeeId: 'employee-1', applicationId: 'ai-pdm' as const, roleId: external.stableRoleId, roleCodeSnapshot: external.code, roleNameSnapshot: external.displayName, catalogVersion: catalog.catalogVersion, scope: { kind: 'workspace' as const, value: 'workspace-1' }, status: 'active' as const, validFrom: '2026-08-27T00:00:00.000Z', validTo: null, effectState: 'not-synchronized' as const }
    const next = { ...document, draft: { ...document.draft, roleAssignments: [assignment] } }
    expect(validateDocumentV2(next, undefined, [catalog])).toEqual([])
    expect(validatePolicyDataV2({ ...next.draft, roleAssignments: [{ ...assignment, scope: { kind: 'global' } }] }, undefined, [catalog]).some((issue) => issue.code === 'EXTERNAL_SCOPE_UNSUPPORTED')).toBe(true)
  })
  it('rejects system admin from every generic V2 assignment validation path', () => {
    const document = createSeedDocumentV2()
    const catalog = readAiPdmRoleCatalog('valid')
    const role = catalog.roles.find((entry) => entry.stableRoleId === 'role-system-admin')!
    const assignment = { id: 'assignment-system-admin', employeeId: 'employee-1', applicationId: 'ai-pdm' as const, roleId: role.stableRoleId, roleCodeSnapshot: role.code, roleNameSnapshot: role.displayName, catalogVersion: catalog.catalogVersion, scope: { kind: 'global' as const }, status: 'active' as const, validFrom: '2026-09-02T00:00:00.000Z', validTo: null, effectState: 'not-synchronized' as const }
    const issues = validateGenericV2AssignmentSurface(assignment, catalog)
    expect(issues.some((issue) => issue.code === 'PRIVILEGED_ASSIGNMENT_SURFACE_REQUIRED')).toBe(true)
  })
  it('allows multiple distinct identities for one employee and rejects active principal or issuer-subject duplicates', () => {
    const document = createSeedDocumentV2()
    const first = { id: 'identity-1', principalId: 'principal-1', issuer: 'issuer-1', subject: 'subject-1', employeeId: 'employee-1', status: 'active' as const, validFrom: '2026-09-03T00:00:00.000Z', validTo: null }
    const second = { ...first, id: 'identity-2', principalId: 'principal-2', subject: 'subject-2' }
    expect(validatePolicyDataV2({ ...document.draft, identityLinks: [first, second] }).filter((issue) => issue.code === 'IDENTITY_CONFLICT')).toEqual([])
    expect(validatePolicyDataV2({ ...document.draft, identityLinks: [first, { ...second, principalId: first.principalId }] }).some((issue) => issue.code === 'IDENTITY_CONFLICT')).toBe(true)
    expect(validatePolicyDataV2({ ...document.draft, identityLinks: [first, { ...second, issuer: first.issuer, subject: first.subject }] }).some((issue) => issue.code === 'IDENTITY_CONFLICT')).toBe(true)
  })
})
