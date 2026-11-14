import { AsyncLocalStorage } from 'node:async_hooks'
import { createOrgmasterPdmRevocationClient } from './orgmasterPdmRevocationClient'
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

export function publishAfterOrgmasterPdmRevocation<T>(options: PdmPublicationOptions<T>) {
  const client = options.client ?? configuredClient.getStore() ??
    (options.enabled && process.env.ORGMASTER_DEPLOYMENT_ENV === 'production' ? createOrgmasterPdmRevocationClient() : undefined)
  return publish({ ...options, client })
}

export function reconcileOrgmasterPdmPublications(database: Database, client = configuredClient.getStore() ?? createOrgmasterPdmRevocationClient()) {
  return reconcile(database, client)
}
