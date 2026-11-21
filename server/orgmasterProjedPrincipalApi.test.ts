import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOrgmasterProjedPrincipalMiddleware, ORGMASTER_PROJED_PRINCIPAL_API_PATH, ORGMASTER_PROJED_PRINCIPAL_CONTRACT_VERSION, type OrgmasterProjedPrincipalApiService } from './orgmasterProjedPrincipalApi'
import type { ManagedLoginCallerVerifier } from './orgmasterManagedLoginApi'

const requestId = '82b4d57e-ec70-4dc7-95c3-79c94ca028b8'
const body = { contractVersion: ORGMASTER_PROJED_PRINCIPAL_CONTRACT_VERSION, requestId, idToken: 'verified-producer-id-token' }
const servers: Array<ReturnType<typeof createServer>> = []

async function listen(service: OrgmasterProjedPrincipalApiService | undefined, verifier?: ManagedLoginCallerVerifier | null) {
  const effectiveVerifier = verifier === undefined ? { verify: vi.fn(async () => ({ email: 'platform@jenfu.example', subject: 'platform-subject' })) } : verifier ?? undefined
  const middleware = createOrgmasterProjedPrincipalMiddleware(service, effectiveVerifier)
  const server = createServer({ maxHeaderSize: 32 * 1024 }, (request, response) => middleware(request, response, () => { response.statusCode = 404; response.end() }))
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('server unavailable')
  return `http://127.0.0.1:${address.port}`
}

async function post(origin: string, payload: unknown = body, authorization = 'Bearer platform-service-token') {
  return fetch(`${origin}${ORGMASTER_PROJED_PRINCIPAL_API_PATH}`, {
    method: 'POST',
    headers: { ...(authorization ? { authorization } : {}), 'content-type': 'application/json' },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  })
}

afterEach(async () => Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))))

describe('DEV-057 ProJED principal API', () => {
  it('verifies the service caller, enrolls the producer identity, and returns the publication', async () => {
    const publication = { contractVersion: 'projed.principal-publication.v1', principalId: 'prj_123', issuer: 'https://accounts.google.com', subject: 'producer-subject' }
    const enroll = vi.fn(async () => publication)
    const verifier = { verify: vi.fn(async () => ({ email: 'platform@jenfu.example', subject: 'platform-subject' })) }
    const origin = await listen({ enroll }, verifier)

    const response = await post(origin)

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toEqual(publication)
    expect(verifier.verify).toHaveBeenCalledWith('platform-service-token')
    expect(enroll).toHaveBeenCalledExactlyOnceWith({ requestId, idToken: body.idToken })
  })

  it('rejects a missing service caller before reading identity input', async () => {
    const enroll = vi.fn()
    const origin = await listen({ enroll })

    const response = await post(origin, body, '')

    expect(response.status).toBe(401)
    expect(enroll).not.toHaveBeenCalled()
    expect(await response.json()).toMatchObject({ code: 'caller_or_token_invalid' })
  })

  it('rejects an unverified service caller without exposing verifier details', async () => {
    const enroll = vi.fn()
    const origin = await listen({ enroll }, { verify: vi.fn(async () => { throw new Error('sensitive verifier detail') }) })

    const response = await post(origin)

    expect(response.status).toBe(401)
    expect(enroll).not.toHaveBeenCalled()
    expect(await response.text()).not.toContain('sensitive verifier detail')
  })

  it('rejects caller-supplied identity fields', async () => {
    const enroll = vi.fn()
    const origin = await listen({ enroll })

    const response = await post(origin, { ...body, issuer: 'https://accounts.google.com', subject: 'chosen-subject', principalId: 'chosen-principal' })

    expect(response.status).toBe(400)
    expect(enroll).not.toHaveBeenCalled()
  })

  it('rejects oversized body, caller bearer, and producer id token', async () => {
    const enroll = vi.fn()
    const origin = await listen({ enroll })

    const oversizedBody = await post(origin, { padding: 'x'.repeat(33 * 1024) })
    expect(oversizedBody.status).toBe(400)

    const oversizedBearer = await post(origin, body, `Bearer ${'x'.repeat(16 * 1024 + 1)}`)
    expect(oversizedBearer.status).toBe(401)

    const oversizedIdToken = await post(origin, { ...body, idToken: 'x'.repeat(16 * 1024 + 1) })
    expect(oversizedIdToken.status).toBe(400)
    expect(enroll).not.toHaveBeenCalled()
  })

  it('rejects malformed JSON', async () => {
    const enroll = vi.fn()
    const origin = await listen({ enroll })

    const response = await post(origin, '{malformed-json')

    expect(response.status).toBe(400)
    expect(enroll).not.toHaveBeenCalled()
  })

  it('fails closed when the service or caller verifier is not configured', async () => {
    const noService = await listen(undefined)
    const serviceResponse = await post(noService)
    expect(serviceResponse.status).toBe(503)

    const noVerifier = await listen({ enroll: vi.fn() }, null)
    const verifierResponse = await post(noVerifier)
    expect(verifierResponse.status).toBe(503)
  })
})
