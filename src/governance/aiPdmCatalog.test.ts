import { describe, expect, it } from 'vitest'
import { AI_PDM_ROLE_CATALOG_SHA256, AI_PDM_ROLE_CATALOG_VERSION, createAiPdmRoleCatalog, readAiPdmRoleCatalog, validateExternalRoleCatalog } from './aiPdmCatalog'

describe('AI-PDM external role catalog', () => {
  it('ships the pinned nine-role, read-only catalog with source metadata', () => {
    const catalog = readAiPdmRoleCatalog('valid')
    expect(catalog.catalogVersion).toBe(AI_PDM_ROLE_CATALOG_VERSION)
    expect(catalog.roles).toHaveLength(9)
    expect(catalog.sourceRefs).toHaveLength(3)
    expect(catalog.payloadHash).toBe(AI_PDM_ROLE_CATALOG_SHA256)
    expect(catalog.payloadHash).toBe('46376639b7aec06798786b9d1a113ba604cf90ca31541a9464ecce7a49d116c8')
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
