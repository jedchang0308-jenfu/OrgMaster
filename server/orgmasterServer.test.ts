import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request as httpRequest } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOrgmasterServer, startOrgmasterServer } from './orgmasterServer'
import type { OrgmasterAuthRuntime } from './orgmasterAuthApi'
import { ManagedIdentityServiceError } from './orgmasterManagedIdentityService'

const servers: Array<ReturnType<typeof createOrgmasterServer>> = []
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))) })

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
