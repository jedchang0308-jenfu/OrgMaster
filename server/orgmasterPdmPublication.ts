import { AsyncLocalStorage } from 'node:async_hooks'
import { createOrgmasterPdmRevocationClient } from './orgmasterPdmRevocationClient'
import { createOrgmasterFmsRevocationClient } from './orgmasterFmsRevocationClient'
import {
  PdmPublicationError,
  publishAfterOrgmasterPdmRevocation as publish,
  reconcileOrgmasterPdmPublications as reconcile,
  type PdmPublicationOptions,
  type Database,
} from '../scripts/lib/orgmaster-pdm-publication.mts'

export { PdmPublicationError }

type Client = ReturnType<typeof createOrgmasterPdmRevocationClient>
const configuredClient = new AsyncLocalStorage<Client>()

export function withOrgmasterPdmRevocationClient<T>(client: Client, run: () => T): T {
  return configuredClient.run(client, run)
}

export function orgmasterFmsPublicationConfigured(environment: NodeJS.ProcessEnv = process.env) {
  return environment.ORGMASTER_FMS_SESSION_REVOCATION_ENABLED === 'true'
}

export async function readOrgmasterFmsPublicationControl(database: Database) {
  const { rows } = await database.query<{ enabled: boolean }>(
    'SELECT orgmaster_core.fms_session_publication_enabled_v1() AS enabled',
  )
  if (rows.length !== 1 || typeof rows[0].enabled !== 'boolean') throw new Error('FMS_PUBLICATION_CONTROL_UNAVAILABLE')
  return rows[0].enabled
}

export function publishAfterOrgmasterPdmRevocation<T>(options: PdmPublicationOptions<T>) {
  const client = options.client ?? configuredClient.getStore() ??
    (options.enabled && process.env.ORGMASTER_DEPLOYMENT_ENV === 'production' ? createOrgmasterPdmRevocationClient() : undefined)
  const fms = options.fms ?? (orgmasterFmsPublicationConfigured() ? {
    enabled: readOrgmasterFmsPublicationControl,
    client: process.env.ORGMASTER_DEPLOYMENT_ENV === 'production' ? createOrgmasterFmsRevocationClient() : undefined,
  } : undefined)
  return publish({ ...options, client, fms })
}

export function reconcileOrgmasterPdmPublications(database: Database, client = configuredClient.getStore() ?? createOrgmasterPdmRevocationClient(),
  fms = orgmasterFmsPublicationConfigured() ? createOrgmasterFmsRevocationClient() : undefined) {
  return reconcile(database, client, fms)
}
