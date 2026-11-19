import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { Connect, PreviewServer, ViteDevServer } from 'vite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { orgmasterManagedIdentityApiPlugin } from './orgmasterManagedIdentityApi'
import { ManagedIdentityServiceError, type ManagedIdentityServiceV1 } from './orgmasterManagedIdentityService'
import { setVerifiedRequestIdentity } from './orgmasterRequestIdentity'
import type { OrgmasterSession } from './orgmasterSessionRepository'

type Middleware = Connect.NextHandleFunction
const servers: Array<ReturnType<typeof createServer>> = []

const session = {
  id: 'session-test',
  principalId: 'principal-test',
  identityIssuer: 'https://accounts.google.com',
  identitySubject: 'subject-test-123456',
  employeeId: 'employee-test',
  assuranceLevel: 'aal1',
  authenticatedAt: '2026-10-31T00:00:00.000Z',
  principalAuthEpoch: 0,
} as unknown as OrgmasterSession

function captureMiddleware(
  hook: 'configureServer' | 'configurePreviewServer',
  serviceFactory: () => ManagedIdentityServiceV1 | undefined,
) {
  let installed: Middleware | undefined
  const plugin = orgmasterManagedIdentityApiPlugin(serviceFactory)
  const middlewares = { use: (middleware: Middleware) => { installed = middleware } }
  if (hook === 'configureServer') {
    plugin.configureServer?.({
      config: { root: process.cwd(), command: 'serve', mode: 'development' },
      middlewares,
    } as unknown as ViteDevServer)
  } else {
    plugin.configurePreviewServer?.({ middlewares } as unknown as PreviewServer)
  }
  if (!installed) throw new Error('managed identity middleware was not installed')
  return installed
}

async function listen(middleware: Middleware) {
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    setVerifiedRequestIdentity(request, session)
    middleware(request, response, () => {
      response.statusCode = 404
      response.end()
    })
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('test server unavailable')
  return `http://127.0.0.1:${address.port}`
}

afterEach(async () => Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
  server.closeAllConnections()
  server.close(() => resolve())
}))))

describe('managed identity API runtime wiring', () => {
  it.each(['configureServer', 'configurePreviewServer'] as const)(
    '%s routes candidate and confirm through the supplied auth runtime service', async (hook) => {
      const findCandidate = vi.fn(async () => ({ candidateToken: 'opaque-test-token', expiresAt: '2026-10-31T00:10:00.000Z' }))
      const confirmLink = vi.fn(async () => ({ identity: { state: 'directory_linked_pending_auth' } }))
      const service = { findCandidate, confirmLink } as unknown as ManagedIdentityServiceV1
      const serviceFactory = vi.fn(() => service)
      const origin = await listen(captureMiddleware(hook, serviceFactory))
      const prefix = `${origin}/api/orgmaster/employees/employee-test/managed-identity`

      const candidateResponse = await fetch(`${prefix}/candidate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin },
        body: JSON.stringify({
          primaryEmail: 'jed@example.test',
          expectedWorkspaceRevision: 'workspace-r1',
          expectedRegistryRevision: 'registry-r1',
        }),
      })
      expect(candidateResponse.status).toBe(200)
      expect(await candidateResponse.json()).toMatchObject({ candidateToken: 'opaque-test-token' })
      expect(findCandidate).toHaveBeenCalledWith('employee-test', expect.objectContaining({
        principalId: 'principal-test',
        employeeId: 'employee-test',
      }), {
        primaryEmail: 'jed@example.test',
        expectedWorkspaceRevision: 'workspace-r1',
        expectedRegistryRevision: 'registry-r1',
      })

      const confirmResponse = await fetch(`${prefix}/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin },
        body: JSON.stringify({
          commandId: 'command-test',
          candidateToken: 'opaque-test-token',
          expectedWorkspaceRevision: 'workspace-r1',
          expectedRegistryRevision: 'registry-r1',
        }),
      })
      expect(confirmResponse.status).toBe(200)
      expect(await confirmResponse.json()).toMatchObject({ identity: { state: 'directory_linked_pending_auth' } })
      expect(confirmLink).toHaveBeenCalledWith('employee-test', expect.objectContaining({
        principalId: 'principal-test',
        employeeId: 'employee-test',
      }), {
        commandId: 'command-test',
        candidateToken: 'opaque-test-token',
        expectedWorkspaceRevision: 'workspace-r1',
        expectedRegistryRevision: 'registry-r1',
      })

      findCandidate.mockRejectedValueOnce(new ManagedIdentityServiceError('DIRECTORY_READ_UNAVAILABLE'))
      const unavailableResponse = await fetch(`${prefix}/candidate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin },
        body: JSON.stringify({
          primaryEmail: 'jed@example.test',
          expectedWorkspaceRevision: 'workspace-r1',
          expectedRegistryRevision: 'registry-r1',
        }),
      })
      expect(unavailableResponse.status).toBe(503)
      expect(findCandidate).toHaveBeenCalledTimes(2)
      expect(serviceFactory).toHaveBeenCalledOnce()
    },
  )
})
