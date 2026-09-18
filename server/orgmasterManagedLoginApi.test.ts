import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOrgmasterManagedLoginMiddleware } from './orgmasterManagedLoginApi'
import type { ManagedLoginOwnerServiceV1 } from './orgmasterManagedLoginService'

const requestId = '82b4d57e-ec70-4dc7-95c3-79c94ca028b8'
const servers: Array<ReturnType<typeof createServer>> = []

async function listen(service: ManagedLoginOwnerServiceV1 | undefined, verifier = { verify: vi.fn(async () => ({ email: 'platform@jenfu.example', subject: 'platform-subject' })) }) {
  const middleware = createOrgmasterManagedLoginMiddleware(service, verifier)
  const server = createServer((request, response) => middleware(request, response, () => { response.statusCode = 404; response.end() }))
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('server unavailable')
  return `http://127.0.0.1:${address.port}`
}

afterEach(async () => Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))))

describe('DEV-049 managed login owner API', () => {
  it('requires the exact caller token and returns the owner response', async () => {
    const resolveAlias = vi.fn(async (input) => ({ contractVersion: 'jenfu.managed-login.v1' as const, action: 'resolveAlias' as const, requestId: input.requestId, directoryCustomerId: 'C01', match: null }))
    const service = { resolveAlias, verifyIdentity: vi.fn() } as unknown as ManagedLoginOwnerServiceV1
    const origin = await listen(service)
    const response = await fetch(`${origin}/api/internal/managed-login/v1`, { method: 'POST', headers: { authorization: 'Bearer caller-token', 'content-type': 'application/json' }, body: JSON.stringify({ contractVersion: 'jenfu.managed-login.v1', action: 'resolveAlias', requestId, employeeNumber: null }) })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ requestId, directoryCustomerId: 'C01', match: null })
    expect(resolveAlias).toHaveBeenCalledWith(expect.objectContaining({ requestId, caller: { email: 'platform@jenfu.example', subject: 'platform-subject' } }))
  })

  it('fails closed without caller authorization and does not leak error detail', async () => {
    const origin = await listen({ resolveAlias: vi.fn(), verifyIdentity: vi.fn() } as unknown as ManagedLoginOwnerServiceV1)
    const response = await fetch(`${origin}/api/internal/managed-login/v1`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contractVersion: 'jenfu.managed-login.v1', action: 'resolveAlias', requestId, employeeNumber: null }) })
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ contractVersion: 'jenfu.managed-login.v1', code: 'caller_or_token_invalid' })
  })

  it('rejects over-limit bodies before invoking the service', async () => {
    const resolveAlias = vi.fn()
    const origin = await listen({ resolveAlias, verifyIdentity: vi.fn() } as unknown as ManagedLoginOwnerServiceV1)
    const response = await fetch(`${origin}/api/internal/managed-login/v1`, { method: 'POST', headers: { authorization: 'Bearer caller-token', 'content-type': 'application/json' }, body: JSON.stringify({ padding: 'x'.repeat(33 * 1024) }) })
    expect(response.status).toBe(400)
    expect(resolveAlias).not.toHaveBeenCalled()
  })
})
