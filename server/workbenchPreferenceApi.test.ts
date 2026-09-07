import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { createOrgmasterAuthMiddleware } from './orgmasterAuthApi'
import { createWorkbenchPreferenceMiddleware } from './workbenchPreferenceApi'
import type { OrgmasterAuthRuntime } from './orgmasterAuthApi'

const servers: Array<ReturnType<typeof createServer>> = []
const unavailable: OrgmasterAuthRuntime = { configResult: { configured: false, missing: ['ORGMASTER_POSTGRES_URL'], reason: 'test only' } }

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))))
})

async function listen(root: string) {
  const auth = createOrgmasterAuthMiddleware(() => unavailable, true)
  const preference = createWorkbenchPreferenceMiddleware(root)
  const server = createServer((request, response) => auth(request, response, () => preference(request, response, () => { response.statusCode = 404; response.end() })))
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('missing address')
  return `http://127.0.0.1:${address.port}`
}

const identityHeaders = { 'x-orgmaster-dev-issuer': 'urn:orgmaster:dev', 'x-orgmaster-dev-subject': 'local-admin' }

describe('workbench preference API', () => {
  it('uses the authenticated development identity and rejects invalid writes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orgmaster-workbench-api-'))
    const base = await listen(root)
    const unauthenticated = await fetch(`${base}/api/orgmaster/preferences/workbench`)
    expect(unauthenticated.status).toBe(401)

    const initial = await fetch(`${base}/api/orgmaster/preferences/workbench`, { headers: identityHeaders })
    expect(initial.status).toBe(200)
    expect(await initial.json()).toMatchObject({ version: 1, listWidths: {} })

    const saved = await fetch(`${base}/api/orgmaster/preferences/workbench/employees`, { method: 'PUT', headers: { ...identityHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ version: 1, listWidthPx: 286 }) })
    expect(saved.status).toBe(200)
    expect(await saved.json()).toMatchObject({ moduleId: 'employees', listWidth: { preferredPx: 286 } })

    const readback = await fetch(`${base}/api/orgmaster/preferences/workbench`, { headers: identityHeaders })
    expect(await readback.json()).toMatchObject({ listWidths: { employees: { preferredPx: 286 } } })

    const invalid = await fetch(`${base}/api/orgmaster/preferences/workbench/employees`, { method: 'PUT', headers: { ...identityHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ version: 1, listWidthPx: 1 }) })
    expect(invalid.status).toBe(400)
    const unknown = await fetch(`${base}/api/orgmaster/preferences/workbench/unknown`, { method: 'PUT', headers: { ...identityHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ version: 1, listWidthPx: 286 }) })
    expect(unknown.status).toBe(404)
  })
})
