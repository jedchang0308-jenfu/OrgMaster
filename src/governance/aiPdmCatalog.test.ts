import { describe, expect, it } from 'vitest'
import { AI_PDM_ROLE_CATALOG_VERSION, createAiPdmRoleCatalog, readAiPdmRoleCatalog, validateExternalRoleCatalog } from './aiPdmCatalog'

describe('AI-PDM external role catalog', () => {
  it('ships the pinned nine-role, read-only catalog with source metadata', () => {
    const catalog = readAiPdmRoleCatalog('valid')
    expect(catalog.catalogVersion).toBe(AI_PDM_ROLE_CATALOG_VERSION)
    expect(catalog.roles).toHaveLength(9)
    expect(catalog.sourceRefs).toHaveLength(3)
    expect(catalog.payloadHash).toBe('215030442AC3DD53B11A1DA4FCBC13FBF12DA5A27505499B18517A7C7C7B6A28')
    expect(catalog.roles.find((role) => role.code === 'external_specialist')).toMatchObject({ assignable: false, unassignableReason: 'INTEGRATION_METADATA_REQUIRED' })
  })

  it('fails closed when catalog payload is tampered or marked stale', () => {
    const catalog = createAiPdmRoleCatalog('valid')
    const tampered = { ...catalog, roles: catalog.roles.map((role, index) => index === 0 ? { ...role, displayName: 'tampered' } : role) }
    expect(validateExternalRoleCatalog(tampered).some((issue) => issue.code === 'EXTERNAL_CATALOG_INVALID')).toBe(true)
    expect(readAiPdmRoleCatalog('stale').validationState).toBe('stale')
  })
})
