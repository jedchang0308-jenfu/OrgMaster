import { readAiPdmRoleCatalog } from '../src/governance/aiPdmCatalog'
import type { ExternalRoleCatalogSnapshotV1 } from '../src/governance/types'
import { readPublishedAiPdmRoleCatalogFromDatabase } from './aiPdmRoleCatalogRepository'
import { readFinancialRoleCatalog } from './financialRoleCatalogRepository'
import { createOrgmasterDatabase } from './orgmasterDatabase'
import { usesCloudSqlPersistence } from './orgmasterPersistenceRepository'

export class ApplicationRoleCatalogRegistryError extends Error {
  constructor(readonly code: 'CATALOG_REGISTRY_UNAVAILABLE' | 'CATALOG_APPLICATION_DUPLICATE') {
    super(code)
    this.name = 'ApplicationRoleCatalogRegistryError'
  }
}

export async function readApplicationRoleCatalogs(root = process.cwd()): Promise<ExternalRoleCatalogSnapshotV1[]> {
  try {
    // The bundled snapshot is a reviewed consumer contract, not proof that the
    // producer has published it. Cloud SQL operations require provider readback.
    if (usesCloudSqlPersistence()) {
      const pool = createOrgmasterDatabase(process.env.ORGMASTER_POSTGRES_URL ?? '')
      await readPublishedAiPdmRoleCatalogFromDatabase({ query: (sql) => pool.query(sql) })
    }
    const catalogs = [readAiPdmRoleCatalog(), await readFinancialRoleCatalog('valid', root)]
    const applications = new Set<string>()
    for (const catalog of catalogs) {
      if (applications.has(catalog.applicationId)) throw new ApplicationRoleCatalogRegistryError('CATALOG_APPLICATION_DUPLICATE')
      applications.add(catalog.applicationId)
    }
    return catalogs
  } catch (error) {
    if (error instanceof ApplicationRoleCatalogRegistryError) throw error
    throw new ApplicationRoleCatalogRegistryError('CATALOG_REGISTRY_UNAVAILABLE')
  }
}
