import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GovernanceCommandQueryResultV1 } from '../src/governance/types'
import { GovernanceStoreError } from './orgmasterGovernanceStore'
import { createOrgmasterGovernanceMiddleware } from './orgmasterGovernanceApi'
import { setVerifiedRequestIdentity } from './orgmasterRequestIdentity'
import type { OrgmasterSession } from './orgmasterSessionRepository'

const storeMocks = vi.hoisted(() => ({
  readCommandResult: vi.fn(),
  readCurrentStore: vi.fn(),
}))
const catalogMocks = vi.hoisted(() => ({ readCurrentCatalog: vi.fn() }))

vi.mock('./applicationRoleCatalogRegistry', async importOriginal => {
  const original = await importOriginal<typeof import('./applicationRoleCatalogRegistry')>()
  return {
    ...original,
    readActiveAiPdmRoleCatalog: vi.fn(async (...args: Parameters<typeof original.readActiveAiPdmRoleCatalog>) => {
      catalogMocks.readCurrentCatalog()
      return original.readActiveAiPdmRoleCatalog(...args)
    }),
  }
})

vi.mock('./orgmasterGovernanceStore', async importOriginal => {
  const original = await importOriginal<typeof import('./orgmasterGovernanceStore')>()
  return {
    ...original,
    readGovernanceCommandResult: storeMocks.readCommandResult,
    readGovernanceStore: storeMocks.readCurrentStore,
  }
})

const root = 'command-result-api-fixture'
const actorSession: OrgmasterSession = {
  id: 'session-command-result', identityIssuer: 'issuer-command-result', identitySubject: 'subject-command-result',
  principalId: 'principal-command-result', employeeId: 'employee-command-result', authEpoch: 0,
  sessionSchemaVersion: 2, epochKind: 'principal', principalAuthEpoch: 0,
  issuedAt: '2026-10-23T00:00:00.000Z', authenticatedAt: '2026-10-23T00:00:00.000Z',
  expiresAt: '2099-01-01T00:00:00.000Z', revokedAt: null, assuranceLevel: 'aal1',
}
const otherActorSession: OrgmasterSession = { ...actorSession, id: 'session-other', principalId: 'principal-other', employeeId: 'employee-other' }
const servers: Server[] = []

afterEach(async () => {
  vi.clearAllMocks()
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
})

async function listen(identity: 'actor' | 'other' | 'none' = 'actor') {
  storeMocks.readCurrentStore.mockRejectedValue(new Error('CURRENT_STORE_MUST_NOT_BE_READ'))
  const middleware = createOrgmasterGovernanceMiddleware(root, true)
  const server = createServer((request, response) => {
    if (identity === 'actor') setVerifiedRequestIdentity(request, actorSession)
    if (identity === 'other') setVerifiedRequestIdentity(request, otherActorSession)
    middleware(request, response, () => { response.statusCode = 404; response.end() })
  })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('COMMAND_RESULT_TEST_SERVER_ADDRESS_MISSING')
  return `http://127.0.0.1:${address.port}`
}

function committed(commandId: string): GovernanceCommandQueryResultV1 {
  return {
    status: 'committed', commandId, commandHash: 'a'.repeat(64), auditReference: 'audit-command-result',
    entityType: 'roleAssignment', entityId: 'assignment-command-result', occurredAt: '2026-10-23T00:00:00.000Z',
    result: { operation: 'REVOKE_ROLE_ASSIGNMENT', outcome: 'applied', entityType: 'roleAssignment', entityId: 'assignment-command-result' },
  }
}

describe('DEV-058 governance command result API', () => {
  it('allows a manager to query an encoded original command ID without reading current/PDM state', async () => {
    const commandId = 'command/with space'
    storeMocks.readCommandResult.mockResolvedValue(committed(commandId))
    const base = await listen()

    const response = await fetch(`${base}/api/orgmaster/governance/commands/${encodeURIComponent(commandId)}`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(committed(commandId))
    expect(storeMocks.readCommandResult).toHaveBeenCalledWith(root, commandId, expect.objectContaining({ principalId: actorSession.principalId }))
    expect(storeMocks.readCurrentStore).not.toHaveBeenCalled()
    expect(catalogMocks.readCurrentCatalog).not.toHaveBeenCalled()
  })

  it('returns not_observed as a query result for an unknown command without treating it as a current read', async () => {
    const commandId = 'not-observed-command'
    storeMocks.readCommandResult.mockResolvedValue({
      status: 'not_observed', commandId, commandHash: null, auditReference: null,
      entityType: null, entityId: null, occurredAt: null, result: null,
    } satisfies GovernanceCommandQueryResultV1)
    const base = await listen()

    const response = await fetch(`${base}/api/orgmaster/governance/commands/${commandId}`)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'not_observed', commandId })
    expect(storeMocks.readCurrentStore).not.toHaveBeenCalled()
    expect(catalogMocks.readCurrentCatalog).not.toHaveBeenCalled()
  })

  it('fails closed for a missing actor and propagates a Store authorization denial', async () => {
    const noActorBase = await listen('none')
    const noActor = await fetch(`${noActorBase}/api/orgmaster/governance/commands/command-1`)
    expect(noActor.status).toBe(401)
    expect(storeMocks.readCommandResult).not.toHaveBeenCalled()

    storeMocks.readCommandResult.mockRejectedValue(new GovernanceStoreError('GOVERNANCE_ADMIN_REQUIRED'))
    const deniedBase = await listen('other')
    const denied = await fetch(`${deniedBase}/api/orgmaster/governance/commands/command-1`)
    expect(denied.status).toBe(403)
    expect(await denied.json()).toEqual({ error: 'GOVERNANCE_ADMIN_REQUIRED' })
    expect(storeMocks.readCurrentStore).not.toHaveBeenCalled()
  })
})
