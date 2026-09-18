import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { OAuth2Client } from 'google-auth-library'
import type { Connect, Plugin, PreviewServer, ViteDevServer } from 'vite'
import { MANAGED_LOGIN_CONTRACT_VERSION, ManagedLoginContractError, parseManagedLoginRequest } from './orgmasterManagedLoginContract'
import { ManagedLoginOwnerError, type ManagedLoginCaller, type ManagedLoginOwnerServiceV1 } from './orgmasterManagedLoginService'

export const ORGMASTER_MANAGED_LOGIN_API_PATH = '/api/internal/managed-login/v1'
const MAX_BODY_BYTES = 32 * 1024
const MAX_BEARER_BYTES = 16 * 1024

export interface ManagedLoginCallerVerifier {
  verify(token: string): Promise<ManagedLoginCaller>
}

export function createGoogleManagedLoginCallerVerifier(input: { audience: string; expectedEmail: string; expectedSubject: string; client?: OAuth2Client }): ManagedLoginCallerVerifier {
  const audience = input.audience.trim()
  const expectedEmail = input.expectedEmail.trim().toLowerCase()
  const expectedSubject = input.expectedSubject.trim()
  const client = input.client ?? new OAuth2Client()
  if (!audience || !expectedEmail || !expectedSubject) throw new Error('MANAGED_LOGIN_CALLER_CONFIG_INVALID')
  return {
    async verify(token) {
      const ticket = await client.verifyIdToken({ idToken: token, audience })
      const payload = ticket.getPayload()
      const issuer = payload?.iss
      const email = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : ''
      const subject = typeof payload?.sub === 'string' ? payload.sub.trim() : ''
      if ((issuer !== 'accounts.google.com' && issuer !== 'https://accounts.google.com') || payload?.email_verified !== true || email !== expectedEmail || subject !== expectedSubject) {
        throw new Error('CALLER_IDENTITY_INVALID')
      }
      return { email, subject }
    },
  }
}

function sendJson(response: ServerResponse, status: number, payload: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(payload))
}

function errorResponse(response: ServerResponse, error: ManagedLoginOwnerError, requestId: string) {
  sendJson(response, error.status, { contractVersion: MANAGED_LOGIN_CONTRACT_VERSION, requestId, code: error.code })
}

function bearer(request: IncomingMessage) {
  const header = request.headers.authorization
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) throw new ManagedLoginOwnerError(401, 'caller_or_token_invalid')
  const token = header.slice(7)
  if (!token || new TextEncoder().encode(token).byteLength > MAX_BEARER_BYTES) throw new ManagedLoginOwnerError(401, 'caller_or_token_invalid')
  return token
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  if (!String(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) throw new ManagedLoginOwnerError(400, 'request_invalid')
  const declared = Number(request.headers['content-length'] ?? 0)
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new ManagedLoginOwnerError(400, 'request_invalid')
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let tooLarge = false
    request.on('data', (value: Buffer | string) => {
      const chunk = Buffer.from(value)
      size += chunk.byteLength
      if (size > MAX_BODY_BYTES) tooLarge = true
      else chunks.push(chunk)
    })
    request.on('end', () => {
      if (tooLarge) return reject(new ManagedLoginOwnerError(400, 'request_invalid'))
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { reject(new ManagedLoginOwnerError(400, 'request_invalid')) }
    })
    request.on('error', () => reject(new ManagedLoginOwnerError(400, 'request_invalid')))
  })
}

function asOwnerError(error: unknown) {
  if (error instanceof ManagedLoginOwnerError) return error
  if (error instanceof ManagedLoginContractError) return new ManagedLoginOwnerError(400, 'request_invalid')
  return new ManagedLoginOwnerError(503, 'managed_login_unavailable')
}

export function createOrgmasterManagedLoginMiddleware(service: ManagedLoginOwnerServiceV1 | undefined, verifier: ManagedLoginCallerVerifier | undefined): Connect.NextHandleFunction {
  return (request, response, next) => {
    const pathname = new URL(request.url ?? '/', 'http://orgmaster.local').pathname
    if (pathname !== ORGMASTER_MANAGED_LOGIN_API_PATH) return next()
    let responseRequestId: string = randomUUID()
    const handle = async () => {
      if (request.method !== 'POST') throw new ManagedLoginOwnerError(400, 'request_invalid')
      if (!service || !verifier) throw new ManagedLoginOwnerError(503, 'managed_login_unavailable')
      const callerToken = bearer(request)
      const caller = await verifier.verify(callerToken).catch(() => { throw new ManagedLoginOwnerError(401, 'caller_or_token_invalid') })
      const parsed = parseManagedLoginRequest(await readBody(request))
      responseRequestId = parsed.requestId
      const result = parsed.action === 'resolveAlias'
        ? await service.resolveAlias({ requestId: parsed.requestId, employeeNumber: parsed.employeeNumber, caller })
        : await service.verifyIdentity({ requestId: parsed.requestId, directoryCustomerId: parsed.directoryCustomerId, idToken: parsed.idToken, expected: parsed.expected, caller })
      sendJson(response, 200, result)
    }
    void handle().catch((error) => errorResponse(response, asOwnerError(error), responseRequestId))
  }
}

export function orgmasterManagedLoginApiPlugin(runtime: () => { service?: ManagedLoginOwnerServiceV1; verifier?: ManagedLoginCallerVerifier }): Plugin {
  let middleware: Connect.NextHandleFunction | undefined
  const use = (server: ViteDevServer | PreviewServer) => {
    const value = runtime()
    middleware ??= createOrgmasterManagedLoginMiddleware(value.service, value.verifier)
    server.middlewares.use(middleware)
  }
  return { name: 'orgmaster-managed-login-owner-api', configureServer: use, configurePreviewServer: use }
}
