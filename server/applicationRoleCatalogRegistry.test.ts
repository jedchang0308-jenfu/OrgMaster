import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cloudSql: vi.fn(),
  query: vi.fn(),
  readback: vi.fn(),
}))

vi.mock('./orgmasterPersistenceRepository', () => ({ usesCloudSqlPersistence: mocks.cloudSql }))
vi.mock('./orgmasterDatabase', () => ({ createOrgmasterDatabase: () => ({ query: mocks.query }) }))
vi.mock('./aiPdmRoleCatalogRepository', () => ({
  readPublishedAiPdmRoleCatalogFromDatabase: mocks.readback,
}))

import { readApplicationRoleCatalogs } from './applicationRoleCatalogRegistry'

describe('application role catalog registry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.readback.mockResolvedValue({})
  })

  it('requires producer readback before exposing the bundled catalog on Cloud SQL', async () => {
    mocks.cloudSql.mockReturnValue(true)
    const catalogs = await readApplicationRoleCatalogs()
    expect(mocks.readback).toHaveBeenCalledOnce()
    expect(catalogs.find((catalog) => catalog.applicationId === 'ai-pdm')?.catalogVersion)
      .toBe('ai-pdm.role-catalog.2026-09-25.v4')
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
