import { describe, expect, it } from 'vitest'
import { AI_PDM_ROLE_CATALOG_SHA256, AI_PDM_ROLE_CATALOG_VERSION, createAiPdmRoleCatalog, readAiPdmRoleCatalog, validateExternalRoleCatalog } from './aiPdmCatalog'

describe('AI-PDM external role catalog', () => {
  it('ships the pinned nine-role, read-only catalog with source metadata', () => {
    const catalog = readAiPdmRoleCatalog('valid')
    expect(catalog.catalogVersion).toBe(AI_PDM_ROLE_CATALOG_VERSION)
    expect(catalog.roles).toHaveLength(9)
    expect(catalog.sourceRefs).toHaveLength(3)
    expect(catalog.payloadHash).toBe(AI_PDM_ROLE_CATALOG_SHA256)
    expect(catalog.payloadHash).toBe('ebdaa2960960e0683b480c721d2c27df59031b4af23b124f2ac7e882309f6b6e')
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
    expect(catalog.roles.find((role) => role.code === 'system_admin')).toMatchObject({ riskLevel: 'critical', allowedScopeKinds: ['global'] })
  })

  it('fails closed when catalog payload is tampered or marked stale', () => {
    const catalog = createAiPdmRoleCatalog('valid')
    const tampered = { ...catalog, roles: catalog.roles.map((role, index) => index === 0 ? { ...role, displayName: 'tampered' } : role) }
    expect(validateExternalRoleCatalog(tampered).some((issue) => issue.code === 'EXTERNAL_CATALOG_INVALID')).toBe(true)
    expect(readAiPdmRoleCatalog('stale').validationState).toBe('stale')
  })
})
