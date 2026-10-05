import { createAiPdmRoleCatalog, readAiPdmRoleCatalog } from '../src/governance/aiPdmCatalog'
import type { ExternalRoleCatalogSnapshotV1 } from '../src/governance/types'
import { readPublishedAiPdmRoleCatalog, readPublishedAiPdmRoleCatalogFromDatabase } from './aiPdmRoleCatalogRepository'
import { readFinancialRoleCatalog } from './financialRoleCatalogRepository'
import { currentPersistenceTransactionDatabase, usesCloudSqlPersistence, withPersistenceTransaction } from './orgmasterPersistenceRepository'

export class ApplicationRoleCatalogRegistryError extends Error {
  constructor(readonly code: 'CATALOG_REGISTRY_UNAVAILABLE' | 'CATALOG_APPLICATION_DUPLICATE') {
    super(code)
    this.name = 'ApplicationRoleCatalogRegistryError'
  }
}

/** Exactly one active producer artifact per operation; no version fallback or grant union. */
export async function readActivePublishedAiPdmRoleCatalog() {
  if (!usesCloudSqlPersistence()) return readPublishedAiPdmRoleCatalog()
  return withPersistenceTransaction(async () =>
    readPublishedAiPdmRoleCatalogFromDatabase(currentPersistenceTransactionDatabase()))
}

export async function readActiveAiPdmRoleCatalog(_root = process.cwd()) {
  if (!usesCloudSqlPersistence()) return readAiPdmRoleCatalog()
  const publication = await readActivePublishedAiPdmRoleCatalog()
  return createAiPdmRoleCatalog('valid', publication.publishedAt, publication)
}

export async function readApplicationRoleCatalogs(root = process.cwd()): Promise<ExternalRoleCatalogSnapshotV1[]> {
  try {
    const catalogs = [await readActiveAiPdmRoleCatalog(root), await readFinancialRoleCatalog('valid', root)]
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
