import { describe, expect, it } from 'vitest'
import { validateDocument, validateDocumentV2, validatePolicyDataV2 } from './validation'
import { createSeedDocument } from '../../server/orgmasterGovernanceStore'
import { createSeedDocumentV2, } from './migrateGovernanceV1ToV2'
import { readAiPdmRoleCatalog } from './aiPdmCatalog'
describe('governance validation diagnostics', () => { it('accepts the V1 seed document', () => { const issues = validateDocument(createSeedDocument()); expect(issues, JSON.stringify(issues)).toEqual([]) }) })
describe('governance V2 validation diagnostics', () => {
  it('accepts internal and supported external assignment invariants', () => {
    const document = createSeedDocumentV2('2026-08-27T00:00:00.000Z', readAiPdmRoleCatalog('valid'))
    const catalog = readAiPdmRoleCatalog('valid')
    const external = catalog.roles.find((role) => role.stableRoleId === 'role-rd')!
    const assignment = { id: 'assignment-rd', employeeId: 'employee-1', applicationId: 'ai-pdm' as const, roleId: external.stableRoleId, roleCodeSnapshot: external.code, roleNameSnapshot: external.displayName, catalogVersion: catalog.catalogVersion, scope: { kind: 'department' as const, value: 'dept-rd' }, status: 'active' as const, validFrom: '2026-08-27T00:00:00.000Z', validTo: null, effectState: 'not-synchronized' as const }
    const next = { ...document, draft: { ...document.draft, roleAssignments: [assignment] } }
    expect(validateDocumentV2(next, undefined, [catalog])).toEqual([])
    expect(validatePolicyDataV2({ ...next.draft, roleAssignments: [{ ...assignment, scope: { kind: 'global' } }] }, undefined, [catalog]).some((issue) => issue.code === 'EXTERNAL_SCOPE_UNSUPPORTED')).toBe(true)
  })
})
