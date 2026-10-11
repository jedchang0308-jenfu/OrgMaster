import { describe, expect, it } from 'vitest'
import v6 from '../../config/catalogs/ai-pdm-role-catalog.v6.json'
import v7 from '../../config/catalogs/ai-pdm-role-catalog.v7.json'
import { AI_PDM_ROLE_CATALOG_SHA256, AI_PDM_ROLE_CATALOG_VERSION, createAiPdmRoleCatalog, historicalAiPdmRoleSnapshotMatches, readAiPdmRoleCatalog, validateExternalRoleCatalog } from './aiPdmCatalog'

describe('AI-PDM external role catalog', () => {
  it('ships the pinned nine-role, read-only catalog with source metadata', () => {
    const catalog = readAiPdmRoleCatalog('valid')
    expect(catalog.catalogVersion).toBe(AI_PDM_ROLE_CATALOG_VERSION)
    expect(catalog.roles).toHaveLength(9)
    expect(catalog.sourceRefs).toHaveLength(3)
    expect(catalog.payloadHash).toBe(AI_PDM_ROLE_CATALOG_SHA256)
    expect(catalog.payloadHash).toBe('4f05dd4228b51e5086f30886330f48f1f137e37d383a26114bb34f5874d39197')
    expect(catalog.roles.map((role) => role.stableRoleId)).toEqual([
      'role-rd', 'role-rd-manager', 'role-qa', 'role-manufacturing', 'role-production-planning',
      'role-procurement', 'role-external-specialist', 'role-pdm-admin', 'role-system-admin'
    ])
    expect(catalog.roles.find((role) => role.code === 'qa')?.displayName).toBe('QA/QC')
    expect(catalog.roles.find((role) => role.code === 'manufacturing')?.displayName).toBe('生產人員')
    expect(catalog.roles.find((role) => role.code === 'production_planning')?.displayName).toBe('生管人員')
    expect(catalog.roles.find((role) => role.code === 'document_admin')).toBeUndefined()
    expect(catalog.roles.find((role) => role.code === 'rd')).toMatchObject({ displayName: '研發人員', allowedScopeKinds: ['workspace'] })
    expect(catalog.roles.find((role) => role.code === 'external_specialist')).toMatchObject({ assignable: true, allowedScopeKinds: ['project'] })
    expect(catalog.roles.find((role) => role.code === 'pdm_admin')).toMatchObject({ displayName: 'PDM管理員', allowedScopeKinds: ['workspace'] })
    expect(catalog.roles.find((role) => role.code === 'system_admin')).toMatchObject({
      stableRoleId: 'role-system-admin',
      status: 'active',
      assignable: true,
      riskLevel: 'critical',
      subjectKind: 'principal',
      assignmentTier: 'cross_app_override',
      recommendationAllowed: false,
      delegationAllowed: false,
      allowedScopeKinds: ['global'],
    })
  })

  it('fails closed when catalog payload is tampered or marked stale', () => {
    const catalog = createAiPdmRoleCatalog('valid')
    const tampered = { ...catalog, roles: catalog.roles.map((role, index) => index === 0 ? { ...role, displayName: 'tampered' } : role) }
    expect(validateExternalRoleCatalog(tampered).some((issue) => issue.code === 'EXTERNAL_CATALOG_INVALID')).toBe(true)
    expect(readAiPdmRoleCatalog('stale').validationState).toBe('stale')
  })
})


describe('DEV-057 active v7 downstream governance compatibility', () => {
  it('accepts the exact active v7 metadata with the matching source reference', () => {
    const catalog = createAiPdmRoleCatalog('valid', v7.publishedAt, v7)
    expect(validateExternalRoleCatalog(catalog)).toEqual([])
    expect(catalog.sourceRefs[0]).toEqual({ path: 'AI_PDM/config/access-control/jenfu-role-catalog.v7.json', range: 'canonical artifact', sha256: '121ca7cd424b9d919cb9217516c0c5f6dcec3879ee389b0d676b9dd62cb0d94d' })
    expect(validateExternalRoleCatalog({ ...catalog, payloadHash: '0'.repeat(64) })).toContainEqual(expect.objectContaining({ code: 'EXTERNAL_CATALOG_INVALID' }))
    expect(validateExternalRoleCatalog({ ...catalog, roles: catalog.roles.map((role, index) => index === 0 ? { ...role, subjectKind: 'principal' as const } : role) })).toContainEqual(expect.objectContaining({ code: 'EXTERNAL_CATALOG_INVALID' }))
  })

  it.each(v6.roles)('preserves exact v6 $roleCode assignment identity without rewriting it', (role) => {
    const current = createAiPdmRoleCatalog('valid', v7.publishedAt, v7).roles.find(value => value.stableRoleId === role.stableRoleId)!
    const assignment = { catalogVersion: v6.catalogVersion, roleId: role.stableRoleId, roleCodeSnapshot: role.roleCode, roleNameSnapshot: role.displayName, scope: { kind: role.allowedScopeKinds[0] } }
    expect(historicalAiPdmRoleSnapshotMatches(assignment, current)).toBe(true)
    expect(historicalAiPdmRoleSnapshotMatches({ ...assignment, roleCodeSnapshot: 'conflicting-role' }, current)).toBe(false)
    expect(historicalAiPdmRoleSnapshotMatches({ ...assignment, catalogVersion: 'unapproved.v8' }, current)).toBe(false)
    expect(historicalAiPdmRoleSnapshotMatches(assignment, { ...current, subjectKind: current.subjectKind === 'employee' ? 'principal' : 'employee' })).toBe(false)
    expect(historicalAiPdmRoleSnapshotMatches({ ...assignment, scope: { kind: 'unknown' } }, current)).toBe(false)
  })
})
