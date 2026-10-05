import { beforeEach, describe, expect, it, vi } from 'vitest'
import v5 from '../config/catalogs/ai-pdm-role-catalog.v5.json'
import v6 from '../config/catalogs/ai-pdm-role-catalog.v6.json'

const mocks = vi.hoisted(() => ({
  cloudSql: vi.fn(), query: vi.fn(), readback: vi.fn(),
}))
vi.mock('./orgmasterPersistenceRepository', () => ({
  usesCloudSqlPersistence: mocks.cloudSql,
  currentPersistenceTransactionDatabase: () => ({ query: mocks.query }),
  withPersistenceTransaction: async (callback: () => Promise<unknown>) => callback(),
}))
vi.mock('./aiPdmRoleCatalogRepository', () => ({
  readPublishedAiPdmRoleCatalogFromDatabase: mocks.readback,
}))
import { readApplicationRoleCatalogs } from './applicationRoleCatalogRegistry'

describe('application role catalog registry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.readback.mockResolvedValue({ ...v5, sourcePath: 'postgres:ai_pdm_contract.v_application_role_catalog_v1' })
  })
  it.each([v5, v6])('exposes only the active producer artifact $catalogVersion in its persistence transaction', async (publication) => {
    mocks.cloudSql.mockReturnValue(true)
    mocks.readback.mockResolvedValue({ ...publication, sourcePath: 'postgres:ai_pdm_contract.v_application_role_catalog_v1' })
    const catalogs = await readApplicationRoleCatalogs()
    expect(mocks.readback).toHaveBeenCalledOnce()
    expect(mocks.readback).toHaveBeenCalledWith({ query: mocks.query })
    const catalog = catalogs.find(value => value.applicationId === 'ai-pdm')
    expect(catalog?.catalogVersion).toBe(publication.catalogVersion)
    expect(catalog?.payloadHash).toBe(publication.catalogSha256)
  })
  it('fails closed when the published producer catalog is stale or unavailable', async () => {
    mocks.cloudSql.mockReturnValue(true)
    mocks.readback.mockRejectedValue(new Error('EXTERNAL_CATALOG_STALE'))
    await expect(readApplicationRoleCatalogs()).rejects.toMatchObject({ code: 'CATALOG_REGISTRY_UNAVAILABLE' })
  })
  it('does not require a provider connection for local fixture validation', async () => {
    mocks.cloudSql.mockReturnValue(false)
    await readApplicationRoleCatalogs()
    expect(mocks.readback).not.toHaveBeenCalled()
  })
})
