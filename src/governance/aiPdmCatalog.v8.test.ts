import { describe, expect, it } from 'vitest'
import { createAiPdmRoleCatalog, historicalAiPdmRoleSnapshotMatches, validateExternalRoleCatalog } from './aiPdmCatalog'
import { aiPdmStaticV8Catalog } from './aiPdmStaticV8Catalog'
import type { ExternalRoleCatalogSnapshotV1 } from './types'

const current = () => createAiPdmRoleCatalog('valid', '2026-11-06T15:00:00.000Z', aiPdmStaticV8Catalog)
describe('DEV070 closed static-v8 application-contract metadata', () => {
  it('preserves all nine native self profiles and the exact protected administrator', () => {
    const snapshot = current()
    expect(validateExternalRoleCatalog(snapshot)).toEqual([])
    expect(snapshot.roles).toHaveLength(10)
    expect(snapshot.roles.slice(0, 9).map(role => role.permissionRoleId)).toEqual(aiPdmStaticV8Catalog.roles.slice(0, 9).map(role => role.stableRoleId))
    expect(snapshot.roles[9]).toMatchObject({ stableRoleId: 'role-application-system-admin', code: 'application_system_admin',
      status: 'active', assignable: false, subjectKind: 'principal', allowedScopeKinds: ['global'],
      recommendationAllowed: false, delegationAllowed: false, presentationName: '系統管理員', presentationOrder: 9,
      assignmentDisposition: 'hidden-protected', roleDefinitionHash: 'e7ff57ed1ca6d2d99e6e052f1f48829365093a32a1d6bb9f8503490a3e7bcbfc' })
  })
  it.each([
    ['v1 view', (s: ExternalRoleCatalogSnapshotV1) => { s.sourceRefs[0].path = 'ai_pdm_contract.v_application_role_catalog_v1' }],
    ['v2 view', (s: ExternalRoleCatalogSnapshotV1) => { s.sourceRefs[0].path = 'ai_pdm_contract.v_application_role_catalog_v2' }],
    ['extra provenance', (s: ExternalRoleCatalogSnapshotV1) => { s.sourceRefs.push({ ...s.sourceRefs[0] }) }],
    ['bundled source', (s: ExternalRoleCatalogSnapshotV1) => { s.sourceKind = 'bundled-fixture' }],
    ['owner', (s: ExternalRoleCatalogSnapshotV1) => { s.applicationId = 'financial-management-system' }],
    ['hash', (s: ExternalRoleCatalogSnapshotV1) => { s.catalogSha256 = '0'.repeat(64) }],
    ['payload hash', (s: ExternalRoleCatalogSnapshotV1) => { s.payloadHash = '0'.repeat(64) }],
    ['stale', (s: ExternalRoleCatalogSnapshotV1) => { s.validationState = 'stale' }],
    ['missing role', (s: ExternalRoleCatalogSnapshotV1) => { s.roles.pop() }],
    ['extra role', (s: ExternalRoleCatalogSnapshotV1) => { s.roles.push({ ...s.roles[9] }) }],
    ['inactive admin', (s: ExternalRoleCatalogSnapshotV1) => { s.roles[9].status = 'inactive' }],
    ['admin hash', (s: ExternalRoleCatalogSnapshotV1) => { s.roles[9].roleDefinitionHash = '0'.repeat(64) }],
    ['admin scope', (s: ExternalRoleCatalogSnapshotV1) => { s.roles[9].allowedScopeKinds = ['workspace'] }],
    ['ordinary alias', (s: ExternalRoleCatalogSnapshotV1) => { s.roles[4].permissionRoleId = 'role-procurement' }],
    ['presentation', (s: ExternalRoleCatalogSnapshotV1) => { s.roles[4].presentationName = '採購／生管' }],
    ['selectable admin', (s: ExternalRoleCatalogSnapshotV1) => { s.roles[9].assignmentDisposition = 'selectable' }],
    ['dynamic metadata', (s: ExternalRoleCatalogSnapshotV1) => { s.publicationFormat = 'dynamic-policy-v2' }],
    ['invalid time', (s: ExternalRoleCatalogSnapshotV1) => { s.capturedAt = 'invalid' }],
  ] as const)('rejects %s', (_name, mutate) => {
    const snapshot = current(); mutate(snapshot)
    expect(validateExternalRoleCatalog(snapshot)).toContainEqual(expect.objectContaining({ code: 'EXTERNAL_CATALOG_INVALID' }))
  })
  it('rejects raw permission/hash drift before converting it into metadata', () => {
    const artifact = structuredClone(aiPdmStaticV8Catalog)
    artifact.roles[9].permissions = []
    expect(() => createAiPdmRoleCatalog('valid', artifact.publishedAt, artifact)).toThrow('EXTERNAL_CATALOG_INVALID')
    const hashDrift = { ...aiPdmStaticV8Catalog, catalogSha256: '0'.repeat(64) }
    expect(() => createAiPdmRoleCatalog('valid', hashDrift.publishedAt, hashDrift)).toThrow('EXTERNAL_CATALOG_INVALID')
    const mixed = { ...aiPdmStaticV8Catalog, publicationFormat: 'dynamic-policy-v2' as const }
    expect(() => createAiPdmRoleCatalog('valid', mixed.publishedAt, mixed)).toThrow('EXTERNAL_CATALOG_INVALID')
  })
  it.each(['v1', 'v2'])('rejects an explicit wrong raw producer view %s', version => {
    const artifact = { ...aiPdmStaticV8Catalog, sourcePath: `postgres:ai_pdm_contract.v_application_role_catalog_${version}` }
    expect(() => createAiPdmRoleCatalog('valid', artifact.publishedAt, artifact)).toThrow('EXTERNAL_CATALOG_INVALID')
  })
  it('retains exact static-v8 historical assignment identity without accepting an unknown version', () => {
    const role = current().roles[0]
    const assignment = { catalogVersion: aiPdmStaticV8Catalog.catalogVersion, roleId: role.stableRoleId,
      roleCodeSnapshot: role.code, roleNameSnapshot: role.displayName, scope: { kind: 'workspace' } }
    expect(historicalAiPdmRoleSnapshotMatches(assignment, role)).toBe(true)
    expect(historicalAiPdmRoleSnapshotMatches({ ...assignment, catalogVersion: 'ai-pdm.role-catalog.2026-11-07.v9' }, role)).toBe(false)
  })
})
