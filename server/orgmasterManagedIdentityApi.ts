import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin, PreviewServer, ViteDevServer } from 'vite'
import type { AssignEmployeeNumberRequestV1, ConfirmManagedIdentityLinkRequestV1, FindManagedIdentityCandidateRequestV1, ManagedIdentityRefreshRequestV1 } from '../src/managedIdentity/types'
import { verifiedGovernanceActor } from './orgmasterRequestIdentity'
import { createManagedIdentityService, ManagedIdentityServiceError, type ManagedIdentityServiceV1 } from './orgmasterManagedIdentityService'
import { createLocalDeterministicDirectoryPort, createGoogleDirectoryAuthPort, createGoogleDirectoryReadOnlyPort } from './orgmasterManagedDirectoryPort'

export const MANAGED_IDENTITY_API_PATH = '/api/orgmaster/employees'
const MAX_BODY_BYTES = 8 * 1024

function sendJson(response: ServerResponse, status: number, payload: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(payload))
}

function statusFor(code: string) {
  if (code === 'IDENTITY_CONTEXT_REQUIRED') return 401
  if (['IDENTITY_VIEW_REQUIRED', 'IDENTITY_NUMBER_MANAGE_REQUIRED', 'IDENTITY_LINK_REQUIRED', 'IDENTITY_REFRESH_REQUIRED', 'DB_ADMISSION_DISABLED', 'HUMAN_PRIVILEGED_REQUIRED'].includes(code)) return 403
  if (code === 'EMPLOYEE_NOT_FOUND') return 404
  if (['EMPLOYEE_NUMBER_INVALID', 'EMPLOYEE_NUMBER_REQUIRED', 'INVALID_REQUEST', 'EMPLOYEE_NUMBER_REQUIRED'].includes(code)) return 422
  if (['EMPLOYEE_NUMBER_CONFLICT', 'EMPLOYEE_NUMBER_RETIRED', 'REVISION_CONFLICT', 'CANDIDATE_INVALID', 'DIRECTORY_CANDIDATE_MISMATCH', 'DIRECTORY_CANDIDATE_NOT_FOUND', 'DIRECTORY_IDENTITY_CONFLICT'].includes(code)) return 409
  if (code === 'IDENTITY_ORIGIN_INVALID') return 403
  return 503
}

function readBody(request: IncomingMessage) {
  return new Promise<Record<string, unknown>>((resolveBody, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (part: Buffer | string) => {
      const chunk = Buffer.from(part)
      size += chunk.byteLength
      if (size > MAX_BODY_BYTES) return reject(new ManagedIdentityServiceError('INVALID_REQUEST'))
      chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
        resolveBody(value as Record<string, unknown>)
      } catch { reject(new ManagedIdentityServiceError('INVALID_REQUEST')) }
    })
    request.on('error', reject)
  })
}

function employeeIdFromPath(pathname: string) {
  const prefix = MANAGED_IDENTITY_API_PATH + '/'
  if (!pathname.startsWith(prefix)) return null
  const rest = pathname.slice(prefix.length)
  const marker = rest.indexOf('/')
  if (marker < 1) return null
  try { return { employeeId: decodeURIComponent(rest.slice(0, marker)), action: rest.slice(marker + 1) } } catch { return null }
}

function assertSameOrigin(request: IncomingMessage) {
  const origin = request.headers.origin
  const host = request.headers.host
  if (!origin || !host) throw new ManagedIdentityServiceError('IDENTITY_ORIGIN_INVALID')
  const parsed = new URL(origin)
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.host !== host) throw new ManagedIdentityServiceError('IDENTITY_ORIGIN_INVALID')
}

async function handle(request: IncomingMessage, response: ServerResponse, service: ManagedIdentityServiceV1) {
  const identity = verifiedGovernanceActor(request)
  if (!identity) { sendJson(response, 401, { error: 'IDENTITY_CONTEXT_REQUIRED' }); return true }
  const target = employeeIdFromPath(new URL(request.url ?? '/', 'http://orgmaster.local').pathname)
  if (!target || !['managed-identity', 'employee-number', 'managed-identity/candidate', 'managed-identity/confirm', 'managed-identity/refresh', 'activation-check'].includes(target.action)) return false
  try {
    if (target.action === 'managed-identity' && request.method === 'GET') {
      sendJson(response, 200, await service.read(target.employeeId, identity))
      return true
    }
    if (target.action === 'employee-number' && request.method === 'PUT') {
      assertSameOrigin(request)
      const body = await readBody(request)
      const input: AssignEmployeeNumberRequestV1 = {
        commandId: String(body.commandId ?? ''),
        expectedRegistryRevision: body.expectedRegistryRevision === null || body.expectedRegistryRevision === undefined ? null : String(body.expectedRegistryRevision),
        employeeNumber: String(body.employeeNumber ?? ''),
        expectedWorkspaceRevision: body.expectedWorkspaceRevision === null || body.expectedWorkspaceRevision === undefined ? null : String(body.expectedWorkspaceRevision),
      }
      sendJson(response, 200, await service.assignNumber(target.employeeId, identity, input))
      return true
    }
    if (target.action === 'managed-identity/candidate' && request.method === 'POST') {
      assertSameOrigin(request)
      const body = await readBody(request)
      const input: FindManagedIdentityCandidateRequestV1 = {
        expectedWorkspaceRevision: body.expectedWorkspaceRevision === null || body.expectedWorkspaceRevision === undefined ? null : String(body.expectedWorkspaceRevision),
        expectedRegistryRevision: body.expectedRegistryRevision === null || body.expectedRegistryRevision === undefined ? null : String(body.expectedRegistryRevision),
      }
      sendJson(response, 200, await service.findCandidate(target.employeeId, identity, input))
      return true
    }
    if (target.action === 'managed-identity/confirm' && request.method === 'POST') {
      assertSameOrigin(request)
      const body = await readBody(request)
      const input: ConfirmManagedIdentityLinkRequestV1 = {
        commandId: String(body.commandId ?? ''), candidateToken: String(body.candidateToken ?? ''),
        expectedWorkspaceRevision: body.expectedWorkspaceRevision === null || body.expectedWorkspaceRevision === undefined ? null : String(body.expectedWorkspaceRevision),
        expectedRegistryRevision: body.expectedRegistryRevision === null || body.expectedRegistryRevision === undefined ? null : String(body.expectedRegistryRevision),
      }
      sendJson(response, 200, await service.confirmLink(target.employeeId, identity, input))
      return true
    }
    if (target.action === 'managed-identity/refresh' && request.method === 'POST') {
      assertSameOrigin(request)
      const body = await readBody(request)
      const input: ManagedIdentityRefreshRequestV1 = { commandId: String(body.commandId ?? ''), trigger: body.trigger === 'domain' || body.trigger === 'periodic' ? body.trigger : 'manual' }
      sendJson(response, 202, await service.enqueueRefresh(target.employeeId, identity, input.trigger, input.commandId))
      return true
    }
    if (target.action === 'activation-check' && request.method === 'POST') {
      assertSameOrigin(request)
      const body = await readBody(request)
      const workspaceRevision = typeof body.workspaceRevision === 'string' ? body.workspaceRevision : ''
      sendJson(response, 200, await service.activationCheck(target.employeeId, workspaceRevision))
      return true
    }
    sendJson(response, 405, { error: 'METHOD_NOT_ALLOWED' })
    return true
  } catch (error) {
    const code = error instanceof ManagedIdentityServiceError ? error.code : 'MANAGED_IDENTITY_READ_FAILED'
    sendJson(response, statusFor(code), { error: code })
    return true
  }
}

export function createOrgmasterManagedIdentityMiddleware(root = process.cwd(), devEnabled = false, service?: ManagedIdentityServiceV1): Connect.NextHandleFunction {
  const directory = devEnabled
    ? createLocalDeterministicDirectoryPort()
    : process.env.ORGMASTER_MANAGED_IDENTITY_ENABLED === 'true' && process.env.ORGMASTER_DIRECTORY_CUSTOMER_ID && process.env.ORGMASTER_DIRECTORY_DWD_SUBJECT
      ? createGoogleDirectoryReadOnlyPort({ customerId: process.env.ORGMASTER_DIRECTORY_CUSTOMER_ID, domain: process.env.ORGMASTER_MANAGED_DOMAIN ?? 'jenfu.com.tw', auth: createGoogleDirectoryAuthPort({ delegatedSubject: process.env.ORGMASTER_DIRECTORY_DWD_SUBJECT }) })
      : undefined
  const runtime = service ?? createManagedIdentityService({ root, devEnabled, directory })
  return (request, response, next) => {
    if (!request.url?.startsWith(MANAGED_IDENTITY_API_PATH)) return next()
    void handle(request, response, runtime).then((handled) => { if (!handled) next() }).catch(() => { if (!response.writableEnded) sendJson(response, 503, { error: 'MANAGED_IDENTITY_READ_FAILED' }) })
  }
}

export function orgmasterManagedIdentityApiPlugin(): Plugin {
  return {
    name: 'orgmaster-managed-identity-api',
    configureServer(server: ViteDevServer) { server.middlewares.use(createOrgmasterManagedIdentityMiddleware(server.config.root, server.config.command === 'serve' && server.config.mode === 'development')) },
    configurePreviewServer(server: PreviewServer) { server.middlewares.use(createOrgmasterManagedIdentityMiddleware(process.cwd(), false)) },
  }
}
