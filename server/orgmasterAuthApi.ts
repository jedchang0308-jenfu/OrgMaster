import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin, PreviewServer, ViteDevServer } from 'vite'
import { createAuthEpochRepository, AuthEpochUnavailableError, type AuthEpochRepository } from './orgmasterAuthEpochRepository'
import { clearSessionCookie, createOpaqueSessionToken, hashSessionToken, readSessionToken, sessionCookie } from './orgmasterAuthCookies'
import { readOrgmasterAuthConfig, type OrgmasterAuthConfig, type OrgmasterAuthConfigResult } from './orgmasterAuthConfig'
import { createOrgmasterDatabase } from './orgmasterDatabase'
import { createFirebaseIdentityProvider, type FirebaseIdentityProvider } from './orgmasterFirebaseIdentityProvider'
import { DEV_ISSUER, DEV_PRINCIPAL_ID, DEV_SUBJECT, resolveDevelopmentIdentity } from './orgmasterGovernanceIdentity'
import { createPrincipalAdmissionRepository, PrincipalAdmissionError, type PrincipalAdmissionRepository } from './orgmasterPrincipalAdmissionRepository'
import { setVerifiedRequestIdentity } from './orgmasterRequestIdentity'
import { createOrgmasterSessionRepository, type OrgmasterSession, type OrgmasterSessionRepository } from './orgmasterSessionRepository'

export const ORGMASTER_AUTH_API_PATH = '/api/auth'
const MAX_BODY_BYTES = 32 * 1024
const MAX_ID_TOKEN_BYTES = 16 * 1024
const RATE_WINDOW_MS = 60_000
const RATE_LIMIT = 10

export type AuthDecisionCode =
  | 'auth_request_invalid'
  | 'auth_token_invalid'
  | 'auth_session_invalid'
  | 'auth_epoch_stale'
  | 'principal_not_active'
  | 'principal_ambiguous'
  | 'auth_origin_invalid'
  | 'auth_contract_mismatch'
  | 'auth_request_too_large'
  | 'auth_json_required'
  | 'auth_rate_limited'
  | 'principal_directory_unavailable'
  | 'auth_epoch_unavailable'
  | 'auth_server_not_configured'

export class OrgmasterAuthError extends Error {
  constructor(public readonly status: number, public readonly code: AuthDecisionCode, public readonly clearCookie = false) {
    super(code)
  }
}

export type OrgmasterAuthRuntime = {
  configResult: OrgmasterAuthConfigResult
  firebase?: FirebaseIdentityProvider
  principals?: PrincipalAdmissionRepository
  epochs?: AuthEpochRepository
  sessions?: OrgmasterSessionRepository
}

type RuntimeFactory = () => OrgmasterAuthRuntime

const statusForCode: Record<AuthDecisionCode, number> = {
  auth_request_invalid: 400,
  auth_token_invalid: 401,
  auth_session_invalid: 401,
  auth_epoch_stale: 401,
  principal_not_active: 403,
  principal_ambiguous: 403,
  auth_origin_invalid: 403,
  auth_contract_mismatch: 409,
  auth_request_too_large: 413,
  auth_json_required: 415,
  auth_rate_limited: 429,
  principal_directory_unavailable: 503,
  auth_epoch_unavailable: 503,
  auth_server_not_configured: 503,
}

function correlationId(request: IncomingMessage) {
  const candidate = request.headers['x-correlation-id']
  return typeof candidate === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(candidate) ? candidate : randomUUID()
}

function sendJson(response: ServerResponse, status: number, payload: unknown, id: string, cookie?: string) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Correlation-Id', id)
  if (cookie) response.setHeader('Set-Cookie', cookie)
  response.end(JSON.stringify(payload))
}

function asAuthError(error: unknown) {
  if (error instanceof OrgmasterAuthError) return error
  if (error instanceof PrincipalAdmissionError) return new OrgmasterAuthError(statusForCode[error.code], error.code)
  if (error instanceof AuthEpochUnavailableError) return new OrgmasterAuthError(503, 'auth_epoch_unavailable')
  return new OrgmasterAuthError(503, 'auth_server_not_configured')
}

function dependencies(runtime: OrgmasterAuthRuntime) {
  if (!runtime.configResult.configured || !runtime.firebase || !runtime.principals || !runtime.epochs || !runtime.sessions) {
    throw new OrgmasterAuthError(503, 'auth_server_not_configured')
  }
  return {
    config: runtime.configResult.config,
    firebase: runtime.firebase,
    principals: runtime.principals,
    epochs: runtime.epochs,
    sessions: runtime.sessions,
  }
}

function requireOrigin(request: IncomingMessage, config: OrgmasterAuthConfig) {
  if (request.headers.origin !== config.publicBaseUrl.origin) throw new OrgmasterAuthError(403, 'auth_origin_invalid')
}

async function readJsonBody(request: IncomingMessage) {
  if (!String(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
    throw new OrgmasterAuthError(415, 'auth_json_required')
  }
  const contentLength = Number(request.headers['content-length'] ?? 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) throw new OrgmasterAuthError(413, 'auth_request_too_large')
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let tooLarge = false
    request.on('data', (value: Buffer | string) => {
      const chunk = Buffer.from(value)
      size += chunk.byteLength
      if (size > MAX_BODY_BYTES) {
        tooLarge = true
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      if (tooLarge) {
        reject(new OrgmasterAuthError(413, 'auth_request_too_large'))
        return
      }
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid body')
        resolve(parsed as Record<string, unknown>)
      } catch {
        reject(new OrgmasterAuthError(400, 'auth_request_invalid'))
      }
    })
    request.on('error', reject)
  })
}

function publicUser(session: OrgmasterSession) {
  return { principalId: session.principalId, employeeId: session.employeeId }
}

async function verifySession(request: IncomingMessage, runtime: OrgmasterAuthRuntime) {
  const { config, principals, epochs, sessions } = dependencies(runtime)
  const token = readSessionToken(request.headers.cookie)
  if (!token) throw new OrgmasterAuthError(401, 'auth_session_invalid', true)
  let session: OrgmasterSession | null
  try {
    session = await sessions.findByHash(hashSessionToken(config.sessionHashPepper, token))
  } catch {
    throw new OrgmasterAuthError(503, 'auth_server_not_configured')
  }
  if (!session || session.revokedAt || Date.parse(session.expiresAt) <= Date.now()) throw new OrgmasterAuthError(401, 'auth_session_invalid', true)
  const principal = await principals.resolveActivePrincipal(session.identityIssuer, session.identitySubject)
  if (principal.principalId !== session.principalId || principal.employeeId !== session.employeeId) {
    throw new OrgmasterAuthError(401, 'auth_session_invalid', true)
  }
  const epoch = await epochs.read(session.identityIssuer, session.identitySubject)
  if (epoch !== session.authEpoch) throw new OrgmasterAuthError(401, 'auth_epoch_stale', true)
  setVerifiedRequestIdentity(request, session)
  return session
}

function developmentSession(request: IncomingMessage, enabled: boolean): OrgmasterSession | null {
  const actor = resolveDevelopmentIdentity(request, enabled)
  if (!actor) return null
  const now = new Date()
  return {
    id: 'development-loopback', identityIssuer: DEV_ISSUER, identitySubject: DEV_SUBJECT,
    principalId: DEV_PRINCIPAL_ID, employeeId: 'development-loopback', authEpoch: 0,
    issuedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 60_000).toISOString(), revokedAt: null, assuranceLevel: 'aal1',
  }
}

function createRateLimiter() {
  const attempts = new Map<string, number[]>()
  return (request: IncomingMessage) => {
    const key = request.socket.remoteAddress ?? 'unknown'
    const now = Date.now()
    const recent = (attempts.get(key) ?? []).filter((time) => now - time < RATE_WINDOW_MS)
    if (recent.length >= RATE_LIMIT) throw new OrgmasterAuthError(429, 'auth_rate_limited')
    recent.push(now)
    attempts.set(key, recent)
  }
}

export function createOrgmasterAuthRuntime(environment: NodeJS.ProcessEnv = process.env): OrgmasterAuthRuntime {
  const configResult = readOrgmasterAuthConfig(environment)
  if (!configResult.configured) return { configResult }
  const database = createOrgmasterDatabase(configResult.config.postgresUrl)
  return {
    configResult,
    firebase: createFirebaseIdentityProvider(configResult.config.identityIssuer, configResult.config.identityAudience),
    principals: createPrincipalAdmissionRepository(database),
    epochs: createAuthEpochRepository(database),
    sessions: createOrgmasterSessionRepository(database),
  }
}

export function createOrgmasterAuthMiddleware(runtimeFactory: RuntimeFactory = () => createOrgmasterAuthRuntime(), devEnabled = false): Connect.NextHandleFunction {
  const runtime = runtimeFactory()
  const rateLimit = createRateLimiter()
  return (request, response, next) => {
    const pathname = new URL(request.url ?? '/', 'http://orgmaster.local').pathname
    if (!pathname.startsWith('/api/')) return next()
    const id = correlationId(request)
    const handle = async () => {
      if (pathname === `${ORGMASTER_AUTH_API_PATH}/mode` && request.method === 'GET') {
        if (!runtime.configResult.configured) throw new OrgmasterAuthError(503, 'auth_server_not_configured')
        sendJson(response, 200, { authMode: 'jenfu_firebase_bff', firebase: runtime.configResult.config.firebasePublicConfig, correlationId: id }, id)
        return
      }
      if (pathname === `${ORGMASTER_AUTH_API_PATH}/firebase/session` && request.method === 'POST') {
        const { config, firebase, principals, epochs, sessions } = dependencies(runtime)
        requireOrigin(request, config)
        rateLimit(request)
        const body = await readJsonBody(request)
        if (typeof body.idToken !== 'string' || Buffer.byteLength(body.idToken) > MAX_ID_TOKEN_BYTES || !body.idToken.trim()) {
          throw new OrgmasterAuthError(400, 'auth_request_invalid')
        }
        let identity
        try { identity = await firebase.verifyIdToken(body.idToken) } catch { throw new OrgmasterAuthError(401, 'auth_token_invalid') }
        const principal = await principals.resolveActivePrincipal(identity.issuer, identity.subject)
        const epoch = await epochs.read(identity.issuer, identity.subject)
        const token = createOpaqueSessionToken()
        const issuedAt = new Date()
        const expiresAt = new Date(issuedAt.getTime() + 8 * 60 * 60 * 1000)
        let session
        try {
          session = await sessions.create({
            sessionIdHash: hashSessionToken(config.sessionHashPepper, token),
            identityIssuer: identity.issuer, identitySubject: identity.subject,
            principalId: principal.principalId, employeeId: principal.employeeId,
            authEpoch: epoch, issuedAt: issuedAt.toISOString(), expiresAt: expiresAt.toISOString(), assuranceLevel: identity.assuranceLevel,
          })
        } catch {
          throw new OrgmasterAuthError(503, 'auth_server_not_configured')
        }
        sendJson(response, 200, { user: publicUser(session), session: { expiresAt: session.expiresAt }, assuranceLevel: session.assuranceLevel, correlationId: id }, id, sessionCookie(token, config.secureCookie))
        return
      }
      if (pathname === `${ORGMASTER_AUTH_API_PATH}/logout` && request.method === 'POST') {
        const { config, sessions } = dependencies(runtime)
        requireOrigin(request, config)
        await readJsonBody(request)
        const token = readSessionToken(request.headers.cookie)
        if (token) {
          try { await sessions.revokeByHash(hashSessionToken(config.sessionHashPepper, token), 'local_logout') }
          catch { throw new OrgmasterAuthError(503, 'auth_server_not_configured') }
        }
        sendJson(response, 200, { status: 'completed', correlationId: id }, id, clearSessionCookie(config.secureCookie))
        return
      }
      if (pathname.startsWith(ORGMASTER_AUTH_API_PATH)) {
        if (pathname !== `${ORGMASTER_AUTH_API_PATH}/me` || request.method !== 'GET') {
          sendJson(response, 404, { code: 'auth_request_invalid', correlationId: id }, id)
          return
        }
        const devSession = developmentSession(request, devEnabled)
        const session = devSession ?? await verifySession(request, runtime)
        if (devSession) setVerifiedRequestIdentity(request, devSession)
        sendJson(response, 200, { user: publicUser(session), session: { expiresAt: session.expiresAt }, assuranceLevel: session.assuranceLevel, correlationId: id }, id)
        return
      }
      const devSession = developmentSession(request, devEnabled)
      if (devSession) setVerifiedRequestIdentity(request, devSession)
      else await verifySession(request, runtime)
      next()
    }
    void handle().catch((unknownError) => {
      if (response.writableEnded) return
      const error = asAuthError(unknownError)
      const secure = runtime.configResult.configured ? runtime.configResult.config.secureCookie : true
      sendJson(response, error.status, { code: error.code, correlationId: id }, id, error.clearCookie ? clearSessionCookie(secure) : undefined)
    })
  }
}

export function orgmasterAuthApiPlugin(): Plugin {
  return {
    name: 'orgmaster-auth-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(createOrgmasterAuthMiddleware(() => createOrgmasterAuthRuntime(), server.config.command === 'serve' && server.config.mode === 'development'))
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use(createOrgmasterAuthMiddleware(() => createOrgmasterAuthRuntime(), false))
    },
  }
}
