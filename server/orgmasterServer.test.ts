import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request as httpRequest } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { createOrgmasterServer, startOrgmasterServer } from './orgmasterServer'
import type { OrgmasterAuthRuntime } from './orgmasterAuthApi'

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
