import { mkdtemp, mkdir, rmdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request as httpRequest } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOrgmasterServer, startOrgmasterServer } from './orgmasterServer'
import type { OrgmasterAuthRuntime } from './orgmasterAuthApi'
import { ManagedIdentityServiceError } from './orgmasterManagedIdentityService'
import { ORGMASTER_MANAGED_LOGIN_API_PATH } from './orgmasterManagedLoginApi'
import { ORGMASTER_PROJED_PRINCIPAL_API_PATH, ORGMASTER_PROJED_PRINCIPAL_CONTRACT_VERSION } from './orgmasterProjedPrincipalApi'

const servers: Array<ReturnType<typeof createOrgmasterServer>> = []
const publicationTestRoots: string[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))))
  await Promise.all(publicationTestRoots.splice(0).map((root) => rmdir(root)))
})

const unavailable: OrgmasterAuthRuntime = { configResult: { configured: false, missing: ['ORGMASTER_POSTGRES_URL'], reason: 'test only' } }

async function listen(server: ReturnType<typeof createOrgmasterServer>, port = 0) {
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('missing address')
  return address.port
}

describe('OrgMaster production server', () => {
  it('fails production startup preflight when auth configuration is missing', () => {
    expect(() => startOrgmasterServer({ NODE_ENV: 'production' })).toThrow(/auth preflight failed/i)
  })

  it('serves employee-number reads with DWD off, preserves service errors, and denies unauthenticated reads', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orgmaster-number-capability-'))
    const readNumbers = vi.fn(async () => ({
      contractVersion: 'orgmaster.managed-identity-numbers.v1' as const,
      items: [{ employeeId: 'employee-1', employeeName: '測試員工', employeeNumber: 'JFS0001', status: 'active' as const }],
      registryRevision: 'registry-r1',
    }))
    const read = vi.fn(async () => ({
      contractVersion: 'orgmaster.managed-identity.v1' as const,
      managedDomain: 'jenfu.com.tw',
      employee: { id: 'employee-1', status: 'active' as const },
      employeeNumber: { status: 'unassigned' as const, value: null, revision: null },
      identity: { state: 'not_linked' as const, provider: 'google.com' as const, note: '尚未連結', directoryState: 'unknown' as const, freshness: 'unknown' as const },
      capabilities: { view: true as const, manageNumber: true, manageLink: false, refresh: false },
      registryRevision: 'registry-r1',
      workspaceRevision: 'workspace-r1',
      admissionEnabled: false,
    }))
    const findCandidate = vi.fn(async () => { throw new ManagedIdentityServiceError('DIRECTORY_READ_UNAVAILABLE') })
    const managedIdentity = { readNumbers, read, findCandidate } as unknown as NonNullable<OrgmasterAuthRuntime['managedIdentity']>
    const runtime = Object.assign({}, unavailable, {
      managedIdentity,
      managedLoginEnabled: false,
      employeeNumberManagementEnabled: true,
    })
    const server = createOrgmasterServer({ root, authRuntime: runtime, devIdentityEnabled: true })
    const port = await listen(server)
    const base = 'http://127.0.0.1:' + port
    const devHeaders = {
      'x-orgmaster-dev-issuer': 'urn:orgmaster:dev',
      'x-orgmaster-dev-subject': 'local-admin',
    }

    const unauthenticated = await fetch(base + '/api/orgmaster/employee-numbers')
    expect(unauthenticated.status).toBe(401)
    expect(readNumbers).not.toHaveBeenCalled()

    const numberResponse = await fetch(base + '/api/orgmaster/employee-numbers', { headers: devHeaders })
    expect(numberResponse.status).toBe(200)
    expect(await numberResponse.json()).toMatchObject({
      contractVersion: 'orgmaster.managed-identity-numbers.v1',
      items: [{ employeeId: 'employee-1', employeeNumber: 'JFS0001' }],
      registryRevision: 'registry-r1',
    })
    expect(readNumbers).toHaveBeenCalledTimes(1)

    const managedReadResponse = await fetch(base + '/api/orgmaster/employees/employee-1/managed-identity', { headers: devHeaders })
    expect(managedReadResponse.status).toBe(200)
    expect(await managedReadResponse.json()).toMatchObject({
      capabilities: { view: true, manageNumber: true, manageLink: false, refresh: false },
      identity: { state: 'not_linked' },
    })
    expect(read).toHaveBeenCalledTimes(1)

    const directoryUnavailableResponse = await fetch(base + '/api/orgmaster/employees/employee-1/managed-identity/candidate', {
      method: 'POST',
      headers: { ...devHeaders, origin: base, 'content-type': 'application/json' },
      body: JSON.stringify({ expectedWorkspaceRevision: 'workspace-r1', expectedRegistryRevision: 'registry-r1', primaryEmail: 'employee@jenfu.com.tw' }),
    })
    expect(directoryUnavailableResponse.status).toBe(503)
    expect(await directoryUnavailableResponse.json()).toMatchObject({ error: 'DIRECTORY_READ_UNAVAILABLE' })
    expect(findCandidate).toHaveBeenCalledTimes(1)
  })

  it('does not enable employee-number routes for an unconfigured development runtime', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orgmaster-number-capability-off-'))
    const runtime = { ...unavailable }
    const server = createOrgmasterServer({ root, authRuntime: runtime, devIdentityEnabled: true })
    const port = await listen(server)

    const response = await fetch('http://127.0.0.1:' + port + '/api/orgmaster/employee-numbers', {
      headers: {
        'x-orgmaster-dev-issuer': 'urn:orgmaster:dev',
        'x-orgmaster-dev-subject': 'local-admin',
      },
    })

    expect(response.status).toBe(404)
  })

  it('routes principal publication through its verified caller handler and preserves the existing auth APIs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orgmaster-principal-publication-server-'))
    publicationTestRoots.push(root)

    const publication = {
      contractVersion: ORGMASTER_PROJED_PRINCIPAL_CONTRACT_VERSION,
      principalId: 'principal-personal-1',
      principalKind: 'personal' as const,
      employeeId: null,
      identityIssuer: 'https://securetoken.google.com/jenfu-platform-nonprod',
      identitySubject: 'producer-firebase-subject',
      googleSubject: 'producer-google-subject',
      mappingRevision: '1',
      publishedAt: '2026-10-28T04:00:00.000Z',
    }
    const enroll = vi.fn(async () => publication)
    const resolveAlias = vi.fn(async (input: { requestId: string; employeeNumber: string | null }) => ({
      contractVersion: 'jenfu.managed-login.v1' as const,
      action: 'resolveAlias' as const,
      requestId: input.requestId,
      directoryCustomerId: 'C01',
      match: null,
    }))
    const callerVerify = vi.fn(async (token: string) => {
      if (token === 'invalid-caller-proof') throw new Error('caller proof rejected')
      return { email: 'platform@jenfu.example', subject: token }
    })
    const runtime = Object.assign({}, unavailable, {
      managedLoginOwner: { resolveAlias, verifyIdentity: vi.fn() },
      managedLoginCallerVerifier: { verify: callerVerify },
      projedPrincipalOwner: { enroll },
    }) as OrgmasterAuthRuntime
    const server = createOrgmasterServer({ root, authRuntime: runtime, devIdentityEnabled: true })
    const port = await listen(server)
    const base = `http://127.0.0.1:${port}`

    const publicationResponse = await fetch(base + ORGMASTER_PROJED_PRINCIPAL_API_PATH, {
      method: 'POST',
      headers: { authorization: 'Bearer caller-proof', 'content-type': 'application/json' },
      body: JSON.stringify({ contractVersion: ORGMASTER_PROJED_PRINCIPAL_CONTRACT_VERSION, requestId: '82b4d57e-ec70-4dc7-95c3-79c94ca028b8', idToken: 'producer-id-token' }),
    })
    expect(publicationResponse.status).toBe(200)
    expect(await publicationResponse.json()).toEqual(publication)
    expect(callerVerify).toHaveBeenCalledWith('caller-proof')
    expect(enroll).toHaveBeenCalledExactlyOnceWith({ requestId: '82b4d57e-ec70-4dc7-95c3-79c94ca028b8', idToken: 'producer-id-token' })

    const legacyManagedLoginResponse = await fetch(base + ORGMASTER_MANAGED_LOGIN_API_PATH, {
      method: 'POST',
      headers: { authorization: 'Bearer legacy-caller-proof', 'content-type': 'application/json' },
      body: JSON.stringify({ contractVersion: 'jenfu.managed-login.v1', action: 'resolveAlias', requestId: '82b4d57e-ec70-4dc7-95c3-79c94ca028b8', employeeNumber: 'JFS0005' }),
    })
    expect(legacyManagedLoginResponse.status).toBe(200)
    expect(await legacyManagedLoginResponse.json()).toMatchObject({ contractVersion: 'jenfu.managed-login.v1', action: 'resolveAlias', match: null })
    expect(resolveAlias).toHaveBeenCalledTimes(1)
    expect(callerVerify).toHaveBeenCalledWith('legacy-caller-proof')

    const invalidCallerResponse = await fetch(base + ORGMASTER_PROJED_PRINCIPAL_API_PATH, {
      method: 'POST',
      headers: { authorization: 'Bearer invalid-caller-proof', 'content-type': 'application/json' },
      body: JSON.stringify({ contractVersion: ORGMASTER_PROJED_PRINCIPAL_CONTRACT_VERSION, requestId: '82b4d57e-ec70-4dc7-95c3-79c94ca028b8', idToken: 'producer-id-token' }),
    })
    expect(invalidCallerResponse.status).toBe(401)
    expect(await invalidCallerResponse.json()).toMatchObject({ code: 'caller_or_token_invalid' })
    expect(enroll).toHaveBeenCalledTimes(1)

    const callerlessDevelopmentRequest = await fetch(base + ORGMASTER_PROJED_PRINCIPAL_API_PATH, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-orgmaster-dev-issuer': 'urn:orgmaster:dev',
        'x-orgmaster-dev-subject': 'local-admin',
      },
      body: JSON.stringify({ contractVersion: ORGMASTER_PROJED_PRINCIPAL_CONTRACT_VERSION, requestId: '82b4d57e-ec70-4dc7-95c3-79c94ca028b8', idToken: 'producer-id-token' }),
    })
    expect(callerlessDevelopmentRequest.status).toBe(401)
    expect(await callerlessDevelopmentRequest.json()).toMatchObject({ code: 'caller_or_token_invalid' })
    expect(enroll).toHaveBeenCalledTimes(1)

    const legacyAuthResponse = await fetch(base + '/api/auth/development/profiles')
    expect(legacyAuthResponse.status).toBe(200)
    expect(await legacyAuthResponse.json()).toMatchObject({ authMode: 'local_development' })
  })

  it('serves the SPA while denying unauthenticated APIs and releases its port for restart', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orgmaster-server-'))
    await mkdir(join(root, 'dist'))
    await writeFile(join(root, 'dist', 'index.html'), '<main>OrgMaster production shell</main>')
    const first = createOrgmasterServer({ root, authRuntime: unavailable, devIdentityEnabled: true })
    const port = await listen(first)
    expect(await (await fetch(`http://127.0.0.1:${port}/nested/route`)).text()).toContain('production shell')
    const denied = await fetch(`http://127.0.0.1:${port}/api/unknown`)
    expect(denied.status).toBe(401)
    await new Promise<void>((resolve) => first.close(() => resolve()))
    first.closeAllConnections()
    servers.splice(servers.indexOf(first), 1)

    const restarted = createOrgmasterServer({ root, authRuntime: unavailable, devIdentityEnabled: true })
    await listen(restarted, port)
    const authenticatedUnknownStatus = await new Promise<number>((resolve, reject) => {
      const request = httpRequest({ hostname: '127.0.0.1', port, path: '/api/unknown', agent: false, headers: { 'x-orgmaster-dev-issuer': 'urn:orgmaster:dev', 'x-orgmaster-dev-subject': 'local-admin' } }, (response) => {
        response.resume()
        response.on('end', () => resolve(response.statusCode ?? 0))
      })
      request.on('error', reject)
      request.end()
    })
    expect(authenticatedUnknownStatus).toBe(404)
  })
})
