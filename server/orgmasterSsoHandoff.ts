import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { GoogleAuth } from 'google-auth-library'
import type { OrgmasterAuthRuntime } from './orgmasterAuthApi'
import { ORGMASTER_SESSION_MAX_AGE_SECONDS } from './orgmasterAuthConfig'
import { createOpaqueSessionToken, hashSessionToken, readSessionToken, sessionCookie } from './orgmasterAuthCookies'

const COOKIE = '__Host-jenfu_sso_tx'
const MAX_RETURN_TO = 1024

type Tx = { state: string; verifier: string; returnTo: string; issuer: string; clientId: 'orgmaster'; expiresAt: number }
type Handoff = {
  contractVersion: 'jenfu.sso-handoff.v1'
  issuer: string
  audience: string
  identity: { identityIssuer: string; identitySubject: string; principalId: string; employeeId: string }
  authorization: { applicationId: string; assignmentVersion: number }
  authentication: { authenticatedAt: string; email: string; emailVerified: boolean; signInProvider: string; secondFactor: 'totp' | null; assuranceLevel: 'aal1' | 'aal2' }
  authState: { authEpoch: number; revokedBefore: string | null }
  sourceSessionExpiresAt: string
  issuedAt: string
  expiresAt: string
}

export type OrgmasterSsoHandoffDependencies = {
  environment?: NodeJS.ProcessEnv
  now?: () => number
  randomBytes?: (size: number) => Buffer
  fetch?: typeof fetch
  serviceToken?: (audience: string) => Promise<string>
}

function write(response: ServerResponse, status: number, body: unknown, id: string, cookies?: string[]) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Correlation-Id', id)
  if (cookies?.length) response.setHeader('Set-Cookie', cookies)
  response.end(JSON.stringify(body))
}

function error(response: ServerResponse, status: number, code: string, id: string, cookies?: string[]) { write(response, status, { code, correlationId: id }, id, cookies) }

function exactObject(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const object = value as Record<string, unknown>
  return Object.keys(object).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(object, key))
}

function callbackFailure(errorValue: unknown) {
  const code = errorValue instanceof Error ? errorValue.message : ''
  if (code === 'handoff invalid' || code === 'handoff expired' || code === 'exchange failed') return { status: 400, code: 'sso_code_invalid' }
  if (code === 'stale handoff') return { status: 403, code: 'sso_principal_stale' }
  if (code === 'handoff factor invalid') return { status: 401, code: 'auth_token_invalid' }
  return { status: 502, code: 'sso_dependency_unavailable' }
}

function cookieValue(header: string | undefined) {
  const item = header?.split(';').map((value) => value.trim()).find((value) => value.startsWith(`${COOKIE}=`))
  if (!item) return null
  try { return decodeURIComponent(item.slice(COOKIE.length + 1)) } catch { return null }
}

function sign(value: string, secret: string) {
  return createHmac('sha256', secret).update('jenfu-sso-transaction-v1\0').update(value).digest('base64url')
}

function encodeTx(tx: Tx, secret: string) {
  const payload = Buffer.from(JSON.stringify(tx), 'utf8').toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

function decodeTx(value: string | null, secret: string, now: number): Tx | null {
  if (!value) return null
  const separator = value.lastIndexOf('.')
  if (separator <= 0) return null
  const payload = value.slice(0, separator)
  const expected = Buffer.from(sign(payload, secret))
  const actual = Buffer.from(value.slice(separator + 1))
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  try {
    const tx = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Tx
    if (tx.clientId !== 'orgmaster' || !/^[A-Za-z0-9_-]{22,256}$/u.test(tx.state) || !/^[A-Za-z0-9_-]{43,128}$/u.test(tx.verifier) || !Number.isSafeInteger(tx.expiresAt) || tx.expiresAt < now) return null
    if (!tx.returnTo.startsWith('/') || tx.returnTo.startsWith('//') || tx.returnTo.includes('\\') || tx.returnTo.length > MAX_RETURN_TO) return null
    return tx
  } catch { return null }
}

function clearCookie(secure: boolean) { return `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}` }
function transactionCookie(value: string, secure: boolean, maxAge = 300) { return `${COOKIE}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}` }

function baseConfig(runtime: OrgmasterAuthRuntime, environment: NodeJS.ProcessEnv) {
  if (!runtime.configResult.configured || !runtime.epochs || !runtime.principals || !runtime.sessions) throw new Error('not configured')
  const env = environment
  const brokerOrigin = String(env.ORGMASTER_JENFU_SSO_BROKER_ORIGIN ?? '').trim()
  const phase = String(env.ORGMASTER_JENFU_SSO_HANDOFF_MODE ?? 'off').trim()
  if (!brokerOrigin || !['off', 'on'].includes(phase)) throw new Error('sso config invalid')
  const broker = new URL(brokerOrigin)
  if (broker.protocol !== 'https:' && !(environment.NODE_ENV === 'development' || environment.NODE_ENV === 'test') ) throw new Error('sso broker must use https')
  return { config: runtime.configResult.config, brokerOrigin: broker.origin, issuer: `${broker.origin}/api/sso`, phase: phase as 'off' | 'on', principals: runtime.principals, epochs: runtime.epochs, sessions: runtime.sessions }
}

async function defaultServiceToken(audience: string) {
  const auth = new GoogleAuth()
  const client = await auth.getIdTokenClient(audience)
  return client.idTokenProvider.fetchIdToken(audience)
}

function parseHandoff(value: unknown, expectedIssuer: string, now: number): Handoff {
  const handoff = value as Handoff
  if (!exactObject(handoff, ['contractVersion', 'issuer', 'audience', 'identity', 'authorization', 'authentication', 'authState', 'sourceSessionExpiresAt', 'issuedAt', 'expiresAt']) || !exactObject(handoff.identity, ['identityIssuer', 'identitySubject', 'principalId', 'employeeId']) || !exactObject(handoff.authorization, ['applicationId', 'assignmentVersion']) || !exactObject(handoff.authentication, ['authenticatedAt', 'email', 'emailVerified', 'signInProvider', 'secondFactor', 'assuranceLevel']) || !exactObject(handoff.authState, ['authEpoch', 'revokedBefore']) || handoff.contractVersion !== 'jenfu.sso-handoff.v1' || handoff.issuer !== expectedIssuer || handoff.audience !== 'orgmaster' || !handoff.identity?.identityIssuer || !handoff.identity.identitySubject || !handoff.identity.principalId || !handoff.identity.employeeId || handoff.authorization?.applicationId !== 'orgmaster' || !Number.isSafeInteger(handoff.authorization.assignmentVersion) || !handoff.authentication?.authenticatedAt || !handoff.authentication.email || handoff.authentication.emailVerified !== true || !handoff.authentication.signInProvider || !['aal1', 'aal2'].includes(handoff.authentication.assuranceLevel) || !Number.isSafeInteger(handoff.authState?.authEpoch) || !handoff.sourceSessionExpiresAt || !handoff.expiresAt || (handoff.authentication.secondFactor !== null && handoff.authentication.secondFactor !== 'totp')) throw new Error('handoff invalid')
  const authenticatedAt = Date.parse(handoff.authentication.authenticatedAt)
  const sourceExpiresAt = Date.parse(handoff.sourceSessionExpiresAt)
  const expiresAt = Date.parse(handoff.expiresAt)
  if (![authenticatedAt, sourceExpiresAt, expiresAt].every(Number.isFinite) || authenticatedAt > now + 60_000 || expiresAt <= now || sourceExpiresAt <= now) throw new Error('handoff expired')
  if (handoff.authentication.secondFactor !== null && handoff.authentication.secondFactor !== 'totp') throw new Error('handoff factor invalid')
  return handoff
}

export async function handleOrgmasterSsoRequest(request: IncomingMessage, response: ServerResponse, runtime: OrgmasterAuthRuntime, id: string, dependencies: OrgmasterSsoHandoffDependencies = {}) {
  const url = new URL(request.url ?? '/', 'http://orgmaster.local')
  if (url.pathname !== '/api/auth/jenfu-sso/start' && url.pathname !== '/api/auth/jenfu-sso/callback') return false
  const environment = dependencies.environment ?? process.env
  const now = dependencies.now ?? Date.now
  const random = dependencies.randomBytes ?? randomBytes
  const fetchImpl = dependencies.fetch ?? fetch
  const getServiceToken = dependencies.serviceToken ?? defaultServiceToken
  let setup
  try { setup = baseConfig(runtime, environment) } catch { error(response, 503, 'sso_server_not_configured', id); return true }
  if (setup.phase !== 'on') { error(response, 404, 'sso_request_invalid', id); return true }
  if (url.pathname.endsWith('/start')) {
    if (request.method !== 'GET') { error(response, 405, 'sso_request_invalid', id); return true }
    const returnToRaw = url.searchParams.get('returnTo') ?? '/'
    let returnTo = returnToRaw
    try { const parsed = decodeURIComponent(returnToRaw); if (parsed.startsWith('/') && !parsed.startsWith('//') && !parsed.startsWith('/login') && !parsed.startsWith('/api/auth/') && !parsed.includes('\\') && !/[\u0000-\u001f\u007f]/u.test(parsed) && parsed.length <= MAX_RETURN_TO) returnTo = parsed; else returnTo = '/' } catch { returnTo = '/' }
    const state = random(16).toString('base64url')
    const verifier = random(32).toString('base64url')
    const callback = `${setup.config.publicBaseUrl.origin}/api/auth/jenfu-sso/callback`
    const authorize = new URL('/api/sso/authorize', setup.brokerOrigin)
    for (const [key, value] of [['response_type', 'code'], ['client_id', 'orgmaster'], ['redirect_uri', callback], ['state', state], ['code_challenge', createHash('sha256').update(verifier, 'ascii').digest('base64url')], ['code_challenge_method', 'S256']] as const) authorize.searchParams.set(key, value)
    const tx: Tx = { state, verifier, returnTo, issuer: setup.issuer, clientId: 'orgmaster', expiresAt: now() + 300_000 }
    response.statusCode = 303
    response.setHeader('Location', authorize.toString())
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('X-Correlation-Id', id)
    response.setHeader('Set-Cookie', transactionCookie(encodeTx(tx, setup.config.sessionHashPepper), setup.config.secureCookie))
    response.end()
    return true
  }
  if (request.method !== 'GET') { error(response, 405, 'sso_request_invalid', id); return true }
  const tx = decodeTx(cookieValue(request.headers.cookie), setup.config.sessionHashPepper, now())
  const state = url.searchParams.get('state')
  const code = url.searchParams.get('code')
  const issuer = url.searchParams.get('iss')
  if (!tx || !state || state !== tx.state || issuer !== tx.issuer || !code || url.searchParams.getAll('state').length !== 1 || url.searchParams.getAll('code').length !== 1) { error(response, 400, 'sso_request_invalid', id, [clearCookie(setup.config.secureCookie)]); return true }
  try {
    const token = await getServiceToken(setup.brokerOrigin)
    const body = new URLSearchParams({ grant_type: 'authorization_code', code, client_id: 'orgmaster', redirect_uri: `${setup.config.publicBaseUrl.origin}/api/auth/jenfu-sso/callback`, code_verifier: tx.verifier })
    const brokerResponse = await fetchImpl(`${setup.brokerOrigin}/api/sso/token`, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Jenfu-Service-Identity': `Bearer ${token}` }, body })
    if (!brokerResponse.ok) throw new Error('exchange failed')
    const handoff = parseHandoff(await brokerResponse.json(), setup.issuer, now())
    const principal = await setup.principals.resolveActivePrincipal(handoff.identity.identityIssuer, handoff.identity.identitySubject)
    const authState = await setup.epochs.readState(handoff.identity.identityIssuer, handoff.identity.identitySubject)
    if (principal.principalId !== handoff.identity.principalId || principal.employeeId !== handoff.identity.employeeId || authState.authEpoch !== handoff.authState.authEpoch || (authState.revokedBefore && Date.parse(handoff.authentication.authenticatedAt) <= Date.parse(authState.revokedBefore))) throw new Error('stale handoff')
    const existingToken = readSessionToken(request.headers.cookie)
    if (existingToken) {
      const existing = await setup.sessions.findByHash(hashSessionToken(setup.config.sessionHashPepper, existingToken))
      if (existing && !existing.revokedAt && existing.identitySubject !== handoff.identity.identitySubject) { error(response, 409, 'sso_account_conflict', id, [clearCookie(setup.config.secureCookie)]); return true }
    }
    const nowMs = now()
    const maxExpiry = Math.min(nowMs + ORGMASTER_SESSION_MAX_AGE_SECONDS * 1000, Date.parse(handoff.sourceSessionExpiresAt), Date.parse(handoff.expiresAt))
    if (!Number.isFinite(maxExpiry) || maxExpiry <= nowMs) throw new Error('handoff expired')
    const localToken = createOpaqueSessionToken()
    await setup.sessions.create({ sessionIdHash: hashSessionToken(setup.config.sessionHashPepper, localToken), identityIssuer: handoff.identity.identityIssuer, identitySubject: handoff.identity.identitySubject, principalId: handoff.identity.principalId, employeeId: handoff.identity.employeeId, authEpoch: handoff.authState.authEpoch, issuedAt: new Date(nowMs).toISOString(), authenticatedAt: handoff.authentication.authenticatedAt, expiresAt: new Date(maxExpiry).toISOString(), assuranceLevel: handoff.authentication.secondFactor === 'totp' ? 'aal2' : 'aal1' })
    const location = new URL(tx.returnTo, setup.config.publicBaseUrl.origin).toString()
    response.statusCode = 303
    response.setHeader('Location', location)
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('X-Correlation-Id', id)
    response.setHeader('Set-Cookie', [sessionCookie(localToken, setup.config.secureCookie, Math.max(1, Math.floor((maxExpiry - nowMs) / 1000))), clearCookie(setup.config.secureCookie)])
    response.end()
  } catch (errorValue) {
    const failure = callbackFailure(errorValue)
    error(response, failure.status, failure.code, id, [clearCookie(setup.config.secureCookie)])
  }
  return true
}
