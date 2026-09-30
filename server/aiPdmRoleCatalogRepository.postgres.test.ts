import { afterAll, describe, expect, it } from 'vitest'
import { closeOrgmasterDatabase, createOrgmasterDatabase } from './orgmasterDatabase'
import {
  readPublishedAiPdmRoleCatalog,
  readPublishedAiPdmRoleCatalogFromDatabase,
} from './aiPdmRoleCatalogRepository'

const connectionString = process.env.DEV057_PRODUCT_CATALOG_POSTGRES_URL

describe.skipIf(!connectionString)('DEV-057 published AI-PDM catalog product readback', () => {
  afterAll(async () => { await closeOrgmasterDatabase() })

  it('reads the exact v5 catalog through OrgMaster runtime privileges', async () => {
    if (!connectionString) throw new Error('DEV057_PRODUCT_CATALOG_POSTGRES_URL_REQUIRED')
    const database = createOrgmasterDatabase(connectionString)
    const actual = await readPublishedAiPdmRoleCatalogFromDatabase(database)
    const expected = await readPublishedAiPdmRoleCatalog()
    expect(actual).toEqual({ ...expected, sourcePath: 'postgres:ai_pdm_contract.v_application_role_catalog_v1' })
  })
})
