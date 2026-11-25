import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin } from 'vite'
import type { ManagedLoginCallerVerifier } from './orgmasterManagedLoginApi'
import { verifiedGovernanceActor } from './orgmasterRequestIdentity'
import { ProjedExternalError, type ProjedExternalService } from './orgmasterProjedExternal'
import type { createProjedUsersService } from './orgmasterProjedUsers'

export const PROJED_EXTERNAL_NOTIFICATION_PATH = '/api/internal/projed-external-requests/v1'
export const PROJED_EXTERNAL_MANAGEMENT_PATH = '/api/orgmaster/projed-external-requests/v1'
export const PROJED_USERS_MANAGEMENT_PATH = '/api/orgmaster/projed-users/v1'
async function body(request: IncomingMessage) {
  if (String(request.headers['content-type']).split(';')[0].trim() !== 'application/json') throw new ProjedExternalError(400, 'EXTERNAL_REQUEST_INVALID')
  let size = 0; const chunks: Buffer[] = []
  for await (const part of request) {
    const chunk = Buffer.from(part); size += chunk.length
    if (size > 12_000) throw new ProjedExternalError(400, 'EXTERNAL_REQUEST_INVALID')
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown }
  catch { throw new ProjedExternalError(400, 'EXTERNAL_REQUEST_INVALID') }
}
function send(response: ServerResponse, status: number, value: unknown) {
  response.statusCode = status; response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'private, no-store'); response.end(JSON.stringify(value))
}
const ownerErrorStatuses: Record<string, number> = {
  EXTERNAL_REQUEST_INVALID: 400, EXTERNAL_CALLER_INVALID: 401, IDENTITY_CONTEXT_REQUIRED: 401,
  EXTERNAL_ADMIN_REQUIRED: 403, EXTERNAL_ORIGIN_INVALID: 403, EXTERNAL_NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405, EXTERNAL_CONFLICT: 409, EXTERNAL_IDENTITY_CONFLICT: 409,
  EXTERNAL_QUALIFICATION_UNAVAILABLE: 503,
  PROJED_USER_REQUEST_INVALID: 400, PROJED_USER_ADMIN_REQUIRED: 403, PROJED_USER_NOT_FOUND: 404,
  PROJED_USER_CONFLICT: 409, PROJED_USER_DIRECTORY_UNAVAILABLE: 503,
}
function ownerFailure(error: unknown) {
  // An injected owner service and a compiled HTTP server need not share a class
  // constructor. Preserve only exact code/status pairs from the owner protocol.
  if (error && typeof error === 'object' && 'code' in error && 'status' in error
    && typeof error.code === 'string' && Object.hasOwn(ownerErrorStatuses, error.code)
    && error.status === ownerErrorStatuses[error.code]) return { status: error.status, code: error.code }
  return { status: 503, code: 'EXTERNAL_QUALIFICATION_UNAVAILABLE' }
}
export function createProjedExternalMiddleware(service?: ProjedExternalService | ReturnType<typeof createProjedUsersService>, verifier?: ManagedLoginCallerVerifier, mode: 'internal' | 'management' | 'users' = 'management'): Connect.NextHandleFunction {
  return (request, response, next) => {
    const url = new URL(request.url ?? '/', 'http://orgmaster.local')
    if (url.pathname !== (mode === 'internal' ? PROJED_EXTERNAL_NOTIFICATION_PATH : mode === 'users' ? PROJED_USERS_MANAGEMENT_PATH : PROJED_EXTERNAL_MANAGEMENT_PATH)) return next()
    const handle = async () => {
      if (!service) throw new ProjedExternalError(503, 'EXTERNAL_QUALIFICATION_UNAVAILABLE')
      if (url.search) throw new ProjedExternalError(400, 'EXTERNAL_REQUEST_INVALID')
      if (url.pathname === PROJED_EXTERNAL_NOTIFICATION_PATH) {
        if (request.method !== 'POST' || request.headers.cookie || request.headers.origin) throw new ProjedExternalError(400, 'EXTERNAL_REQUEST_INVALID')
        if (!verifier) throw new ProjedExternalError(503, 'EXTERNAL_QUALIFICATION_UNAVAILABLE')
        const authorization = request.headers.authorization
        if (!authorization?.startsWith('Bearer ') || authorization.length > 16384) throw new ProjedExternalError(401, 'EXTERNAL_CALLER_INVALID')
        await verifier.verify(authorization.slice(7)).catch(() => { throw new ProjedExternalError(401, 'EXTERNAL_CALLER_INVALID') })
        if (!('notify' in service)) throw new ProjedExternalError(503, 'EXTERNAL_QUALIFICATION_UNAVAILABLE')
        return service.notify(await body(request))
      }
      const actor = verifiedGovernanceActor(request)
      if (!actor) throw new ProjedExternalError(401, 'IDENTITY_CONTEXT_REQUIRED')
      if (request.method === 'GET') return service.manage(actor)
      if (request.method !== 'POST') throw new ProjedExternalError(405, 'METHOD_NOT_ALLOWED')
      try {
        const origin = new URL(String(request.headers.origin ?? ''))
        if (!['https:', 'http:'].includes(origin.protocol) || origin.host !== request.headers.host || request.headers['sec-fetch-site'] === 'cross-site') throw new Error()
      } catch { throw new ProjedExternalError(403, 'EXTERNAL_ORIGIN_INVALID') }
      return service.manage(actor, await body(request))
    }
    void handle().then(value => send(response, 200, value)).catch(error => {
      request.resume()
      const failure = ownerFailure(error)
      send(response, failure.status, { code: failure.code })
    })
  }
}
export function projedExternalApiPlugin(mode: 'internal' | 'management' | 'users', runtime: () => { projedExternal?: ProjedExternalService; projedUsers?: ReturnType<typeof createProjedUsersService>; projedExternalCallerVerifier?: ManagedLoginCallerVerifier }): Plugin {
  const use = (server: { middlewares: { use: (middleware: Connect.NextHandleFunction) => unknown } }) => {
    const value = runtime(); server.middlewares.use(createProjedExternalMiddleware(mode === 'users' ? value.projedUsers : value.projedExternal, value.projedExternalCallerVerifier, mode))
  }
  return { name: `orgmaster-projed-external-${mode}-api`, configureServer: use, configurePreviewServer: use }
}
