import { GoogleAuth } from 'google-auth-library'
import type { DirectoryState } from '../src/managedIdentity/types'

export const GOOGLE_DIRECTORY_READ_SCOPE = 'https://www.googleapis.com/auth/admin.directory.user.readonly' as const
export const GOOGLE_IAM_CREDENTIALS_SCOPE = 'https://www.googleapis.com/auth/cloud-platform' as const
export const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token' as const

const DWD_ASSERTION_LIFETIME_SECONDS = 3_600
const ACCESS_TOKEN_REFRESH_SKEW_SECONDS = 60

export type ManagedDirectoryUserV1 = {
  customerId: string
  userId: string
  primaryEmail: string
  directoryState: Exclude<DirectoryState, 'unknown' | 'missing'>
  sourceEtag: string | null
}

export type ManagedDirectoryReadResult =
  | { ok: true; user: ManagedDirectoryUserV1; observedAt: string }
  | { ok: false; kind: 'not_found' | 'candidate_miss' | 'retryable_error' | 'permanent_error'; code: string; observedAt: string }

export type GoogleDirectoryAuthPort = { getRequestHeaders(url: string): Promise<Record<string, string>> }
export type GoogleDirectoryTransport = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ status: number; headers: Headers; json(): Promise<unknown> }>
export type GoogleDirectoryCredentialTransport = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ status: number; json(): Promise<unknown> }>

export type GoogleDirectoryRuntimeConfig =
  | { enabled: false; state: 'disabled' | 'invalid' }
  | { enabled: true; state: 'enabled'; customerId: string; domain: string; delegatedSubject: string; serviceAccountEmail: string }

export class GoogleDirectoryAuthError extends Error {
  constructor(public readonly code: 'DIRECTORY_AUTH_UNAVAILABLE' | 'DIRECTORY_DELEGATION_INVALID', public readonly retryable: boolean) {
    super(code)
  }
}

export interface ManagedDirectoryPortV1 {
  readonly mode: 'disabled' | 'local-deterministic' | 'mocked-google' | 'google-admin-readonly'
  readonly writeOperations: 0
  findExactCandidate(expectedPrimaryEmail: string): Promise<ManagedDirectoryReadResult>
  readByDirectoryKey(customerId: string, userId: string): Promise<ManagedDirectoryReadResult>
}

function normalizedEmail(value: string) { return value.trim().toLowerCase() }
function observedAt() { return new Date().toISOString() }

class DisabledDirectoryPort implements ManagedDirectoryPortV1 {
  readonly mode = 'disabled' as const
  readonly writeOperations = 0 as const
  async findExactCandidate(_expectedPrimaryEmail: string): Promise<ManagedDirectoryReadResult> { return { ok: false, kind: 'permanent_error', code: 'DIRECTORY_ADAPTER_DISABLED', observedAt: observedAt() } }
  async readByDirectoryKey(_customerId: string, _userId: string): Promise<ManagedDirectoryReadResult> { return { ok: false, kind: 'permanent_error', code: 'DIRECTORY_ADAPTER_DISABLED', observedAt: observedAt() } }
}

export function createDisabledManagedDirectoryPort(): ManagedDirectoryPortV1 { return new DisabledDirectoryPort() }

export type LocalDirectoryFixture = {
  customerId?: string
  domain?: string
  users?: Record<string, Omit<ManagedDirectoryUserV1, 'customerId' | 'primaryEmail'> & { primaryEmail?: string; customerId?: string }>
  outcomes?: { expectedEmail?: 'candidate-miss' | 'alias-hit' | 'not-found' | 'archived' | 'customer-mismatch' | '429' | '500' | 'timeout'; readByKey?: 'not-found' | '429' | '500' | 'timeout' }
}

export function createLocalDeterministicDirectoryPort(fixture: LocalDirectoryFixture = {}): ManagedDirectoryPortV1 {
  const customerId = fixture.customerId ?? 'local-customer'
  const domain = (fixture.domain ?? 'orgmaster.test').toLowerCase()
  const users = fixture.users ?? {}
  const make = (email: string): ManagedDirectoryUserV1 => {
    const existing = users[email]
    return existing
      ? { customerId: existing.customerId ?? customerId, userId: existing.userId, primaryEmail: normalizedEmail(existing.primaryEmail ?? email), directoryState: existing.directoryState, sourceEtag: existing.sourceEtag }
      : { customerId, userId: `local-directory-${Buffer.from(email).toString('base64url')}`, primaryEmail: email, directoryState: 'present', sourceEtag: `local-${Buffer.from(email).toString('base64url')}` }
  }
  const outcome = (kind: 'expectedEmail' | 'readByKey') => fixture.outcomes?.[kind]
  return {
    mode: 'local-deterministic', writeOperations: 0,
    async findExactCandidate(expectedPrimaryEmail) {
      const email = normalizedEmail(expectedPrimaryEmail)
      const expectedDomain = email.split('@')[1]
      if (expectedDomain !== domain) return { ok: false, kind: 'candidate_miss', code: 'DIRECTORY_DOMAIN_MISMATCH', observedAt: observedAt() }
      const selected = outcome('expectedEmail')
      if (selected === 'candidate-miss' || selected === 'not-found') return { ok: false, kind: selected === 'not-found' ? 'not_found' : 'candidate_miss', code: 'DIRECTORY_CANDIDATE_NOT_FOUND', observedAt: observedAt() }
      if (selected === '429') return { ok: false, kind: 'retryable_error', code: 'DIRECTORY_RATE_LIMITED', observedAt: observedAt() }
      if (selected === '500' || selected === 'timeout') return { ok: false, kind: 'retryable_error', code: 'DIRECTORY_READ_UNAVAILABLE', observedAt: observedAt() }
      const user = make(email)
      const resolved = selected === 'alias-hit' ? { ...user, primaryEmail: 'alias+' + email } : selected === 'archived' ? { ...user, directoryState: 'archived' as const } : selected === 'customer-mismatch' ? { ...user, customerId: 'other-customer' } : user
      if (resolved.directoryState !== 'present') return { ok: false, kind: 'candidate_miss', code: 'DIRECTORY_USER_INELIGIBLE', observedAt: observedAt() }
      if (resolved.customerId !== customerId || resolved.primaryEmail !== email) return { ok: false, kind: 'candidate_miss', code: 'DIRECTORY_CANDIDATE_MISMATCH', observedAt: observedAt() }
      return { ok: true, user: resolved, observedAt: observedAt() }
    },
    async readByDirectoryKey(requestedCustomerId, requestedUserId) {
      const selected = outcome('readByKey')
      if (selected === 'not-found') return { ok: false, kind: 'not_found', code: 'DIRECTORY_NOT_FOUND', observedAt: observedAt() }
      if (selected === '429' || selected === '500' || selected === 'timeout') return { ok: false, kind: 'retryable_error', code: selected === '429' ? 'DIRECTORY_RATE_LIMITED' : 'DIRECTORY_READ_UNAVAILABLE', observedAt: observedAt() }
      const user = Object.entries(users).map(([email, entry]) => ({ customerId: entry.customerId ?? customerId, userId: entry.userId, primaryEmail: normalizedEmail(entry.primaryEmail ?? email), directoryState: entry.directoryState, sourceEtag: entry.sourceEtag })).find((entry) => entry.customerId === requestedCustomerId && entry.userId === requestedUserId)
      if (!user) return { ok: false, kind: 'not_found', code: 'DIRECTORY_NOT_FOUND', observedAt: observedAt() }
      return { ok: true, user, observedAt: observedAt() }
    },
  }
}

function normalizedDomain(value: string) { return value.trim().toLowerCase() }
function normalizedServiceAccountEmail(value: string) { return value.trim().toLowerCase() }

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+$/.test(value)
}

function validDomain(value: string) {
  return value.includes('.') && !value.includes('@') && !/[\s/:]/.test(value)
}

export function readGoogleDirectoryRuntimeConfig(environment: NodeJS.ProcessEnv): GoogleDirectoryRuntimeConfig {
  if (environment.ORGMASTER_MANAGED_IDENTITY_ENABLED !== 'true') return { enabled: false, state: 'disabled' }
  const customerId = environment.ORGMASTER_GOOGLE_DIRECTORY_CUSTOMER_ID?.trim() ?? ''
  const domain = normalizedDomain(environment.ORGMASTER_GOOGLE_DIRECTORY_DOMAIN ?? '')
  const delegatedSubject = normalizedEmail(environment.ORGMASTER_GOOGLE_DIRECTORY_DELEGATED_SUBJECT ?? '')
  const serviceAccountEmail = normalizedServiceAccountEmail(environment.ORGMASTER_GOOGLE_DIRECTORY_DWD_SERVICE_ACCOUNT_EMAIL ?? '')
  const valid = Boolean(customerId)
    && !/[\s/]/.test(customerId)
    && validDomain(domain)
    && validEmail(delegatedSubject)
    && delegatedSubject.endsWith(`@${domain}`)
    && /^[a-z0-9][a-z0-9-]*@[a-z0-9][a-z0-9-]*\.iam\.gserviceaccount\.com$/.test(serviceAccountEmail)
  return valid
    ? { enabled: true, state: 'enabled', customerId, domain, delegatedSubject, serviceAccountEmail }
    : { enabled: false, state: 'invalid' }
}

function defaultCredentialTransport(): GoogleDirectoryCredentialTransport {
  return async (url, init) => {
    const response = await fetch(url, { method: init.method, headers: init.headers, body: init.body, signal: init.signal })
    return { status: response.status, json: async () => response.json().catch(() => null) }
  }
}

export function createGoogleDirectoryAuthPort(input: {
  delegatedSubject: string
  serviceAccountEmail: string
  getSourceAccessToken?: () => Promise<string | null | undefined>
  transport?: GoogleDirectoryCredentialTransport
  now?: () => number
  timeoutMs?: number
}): GoogleDirectoryAuthPort {
  const delegatedSubject = normalizedEmail(input.delegatedSubject)
  const serviceAccountEmail = normalizedServiceAccountEmail(input.serviceAccountEmail)
  if (!validEmail(delegatedSubject)) throw new Error('DIRECTORY_DELEGATED_SUBJECT_REQUIRED')
  if (!/^[a-z0-9][a-z0-9-]*@[a-z0-9][a-z0-9-]*\.iam\.gserviceaccount\.com$/.test(serviceAccountEmail)) throw new Error('DIRECTORY_DWD_SERVICE_ACCOUNT_REQUIRED')

  const transport = input.transport ?? defaultCredentialTransport()
  const now = input.now ?? Date.now
  const sourceAuth = input.getSourceAccessToken ? undefined : new GoogleAuth({ scopes: [GOOGLE_IAM_CREDENTIALS_SCOPE] })
  const getSourceAccessToken = input.getSourceAccessToken ?? (() => sourceAuth!.getAccessToken())
  let cachedToken: { value: string; expiresAt: number } | undefined
  let tokenRefresh: Promise<string> | undefined

  const post = async (url: string, headers: Record<string, string>, body: string) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 5_000)
    try {
      return await transport(url, { method: 'POST', headers, body, signal: controller.signal })
    } catch {
      throw new GoogleDirectoryAuthError('DIRECTORY_AUTH_UNAVAILABLE', true)
    } finally {
      clearTimeout(timer)
    }
  }

  const obtainDelegatedToken = async () => {
    const sourceToken = (await getSourceAccessToken())?.trim().replace(/^Bearer\s+/i, '')
    if (!sourceToken) throw new GoogleDirectoryAuthError('DIRECTORY_AUTH_UNAVAILABLE', true)
    const issuedAt = Math.floor(now() / 1_000)
    const claims = {
      iss: serviceAccountEmail,
      sub: delegatedSubject,
      scope: GOOGLE_DIRECTORY_READ_SCOPE,
      aud: GOOGLE_OAUTH_TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + DWD_ASSERTION_LIFETIME_SECONDS,
    }
    const signUrl = `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccountEmail)}:signJwt`
    const signedResponse = await post(signUrl, { Authorization: `Bearer ${sourceToken}`, 'Content-Type': 'application/json', Accept: 'application/json' }, JSON.stringify({ payload: JSON.stringify(claims) }))
    const signedBody = await signedResponse.json()
    const signedJwt = signedBody && typeof signedBody === 'object' && !Array.isArray(signedBody) && typeof (signedBody as Record<string, unknown>).signedJwt === 'string'
      ? String((signedBody as Record<string, unknown>).signedJwt)
      : ''
    if (signedResponse.status < 200 || signedResponse.status >= 300 || !signedJwt) {
      throw new GoogleDirectoryAuthError(signedResponse.status >= 500 || signedResponse.status === 429 ? 'DIRECTORY_AUTH_UNAVAILABLE' : 'DIRECTORY_DELEGATION_INVALID', signedResponse.status >= 500 || signedResponse.status === 429)
    }

    const tokenBody = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signedJwt }).toString()
    const tokenResponse = await post(GOOGLE_OAUTH_TOKEN_URL, { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, tokenBody)
    const tokenJson = await tokenResponse.json()
    const value = tokenJson && typeof tokenJson === 'object' && !Array.isArray(tokenJson) && typeof (tokenJson as Record<string, unknown>).access_token === 'string'
      ? String((tokenJson as Record<string, unknown>).access_token).trim()
      : ''
    const expiresIn = tokenJson && typeof tokenJson === 'object' && !Array.isArray(tokenJson) && typeof (tokenJson as Record<string, unknown>).expires_in === 'number'
      ? Number((tokenJson as Record<string, unknown>).expires_in)
      : 0
    if (tokenResponse.status < 200 || tokenResponse.status >= 300 || !value || !Number.isFinite(expiresIn) || expiresIn <= ACCESS_TOKEN_REFRESH_SKEW_SECONDS) {
      throw new GoogleDirectoryAuthError(tokenResponse.status >= 500 || tokenResponse.status === 429 ? 'DIRECTORY_AUTH_UNAVAILABLE' : 'DIRECTORY_DELEGATION_INVALID', tokenResponse.status >= 500 || tokenResponse.status === 429)
    }
    cachedToken = { value, expiresAt: now() + expiresIn * 1_000 }
    return value
  }

  const delegatedToken = () => {
    if (cachedToken && now() < cachedToken.expiresAt - ACCESS_TOKEN_REFRESH_SKEW_SECONDS * 1_000) return Promise.resolve(cachedToken.value)
    if (!tokenRefresh) tokenRefresh = obtainDelegatedToken().finally(() => { tokenRefresh = undefined })
    return tokenRefresh
  }

  return {
    async getRequestHeaders(_url) {
      const token = await delegatedToken()
      return { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    },
  }
}

function parseGoogleUser(body: unknown, customerId: string): ManagedDirectoryUserV1 | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const value = body as Record<string, unknown>
  const id = typeof value.id === 'string' ? value.id.trim() : ''
  const primaryEmail = typeof value.primaryEmail === 'string' ? normalizedEmail(value.primaryEmail) : ''
  const bodyCustomer = typeof value.customerId === 'string' ? value.customerId.trim() : ''
  if (!id || !primaryEmail || bodyCustomer !== customerId) return null
  const state: ManagedDirectoryUserV1['directoryState'] = value.archived === true ? 'archived' : value.suspended === true ? 'suspended' : 'present'
  return { customerId: bodyCustomer, userId: id, primaryEmail, directoryState: state, sourceEtag: typeof value.etag === 'string' ? value.etag : null }
}

export function createGoogleDirectoryReadOnlyPort(input: { customerId: string; domain: string; auth: GoogleDirectoryAuthPort; transport?: GoogleDirectoryTransport; timeoutMs?: number }): ManagedDirectoryPortV1 {
  const customerId = input.customerId.trim()
  const domain = input.domain.trim().toLowerCase()
  if (!customerId || !domain || domain.includes('@')) throw new Error('DIRECTORY_CONFIG_INVALID')
  const transport = input.transport ?? (async (url, init) => {
    const response = await fetch(url, { method: 'GET', headers: init.headers, signal: init.signal })
    return { status: response.status, headers: response.headers, json: () => response.json() }
  })
  const request = async (userKey: string): Promise<ManagedDirectoryReadResult> => {
    const observed = observedAt()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 5_000)
    try {
      const url = `https://admin.googleapis.com/admin/directory/v1/users/${encodeURIComponent(userKey)}?projection=full`
      const headers = await input.auth.getRequestHeaders(url)
      const response = await transport(url, { headers, signal: controller.signal })
      if (response.status === 404) return { ok: false, kind: 'not_found', code: 'DIRECTORY_NOT_FOUND', observedAt: observed }
      if (response.status === 429 || response.status >= 500) return { ok: false, kind: 'retryable_error', code: response.status === 429 ? 'DIRECTORY_RATE_LIMITED' : 'DIRECTORY_READ_UNAVAILABLE', observedAt: observed }
      if (response.status < 200 || response.status >= 300) return { ok: false, kind: 'permanent_error', code: `DIRECTORY_HTTP_${response.status}`, observedAt: observed }
      const user = parseGoogleUser(await response.json(), customerId)
      if (!user) return { ok: false, kind: 'permanent_error', code: 'DIRECTORY_RESPONSE_INVALID', observedAt: observed }
      return { ok: true, user, observedAt: observed }
    } catch (error) {
      if (error instanceof GoogleDirectoryAuthError) return { ok: false, kind: error.retryable ? 'retryable_error' : 'permanent_error', code: error.code, observedAt: observed }
      return { ok: false, kind: 'retryable_error', code: error instanceof DOMException && error.name === 'AbortError' ? 'DIRECTORY_TIMEOUT' : 'DIRECTORY_READ_UNAVAILABLE', observedAt: observed }
    } finally { clearTimeout(timer) }
  }
  return {
    mode: 'google-admin-readonly', writeOperations: 0,
    async findExactCandidate(expectedPrimaryEmail) {
      const email = normalizedEmail(expectedPrimaryEmail)
      if (!email.endsWith('@' + domain)) return { ok: false, kind: 'candidate_miss', code: 'DIRECTORY_DOMAIN_MISMATCH', observedAt: observedAt() }
      const result = await request(email)
      if (!result.ok) return result
      if (result.user.directoryState !== 'present') return { ok: false, kind: 'candidate_miss', code: 'DIRECTORY_USER_INELIGIBLE', observedAt: result.observedAt }
      if (result.user.primaryEmail !== email) return { ok: false, kind: 'candidate_miss', code: 'DIRECTORY_CANDIDATE_MISMATCH', observedAt: result.observedAt }
      return result
    },
    async readByDirectoryKey(customer, user) {
      if (customer !== customerId || !user.trim()) return Promise.resolve({ ok: false, kind: 'permanent_error', code: 'DIRECTORY_KEY_MISMATCH', observedAt: observedAt() })
      const result = await request(user)
      if (!result.ok) return result
      if (result.user.userId !== user || result.user.customerId !== customer) return { ok: false, kind: 'candidate_miss', code: 'DIRECTORY_CANDIDATE_MISMATCH', observedAt: result.observedAt }
      if (result.user.directoryState !== 'present') return { ok: false, kind: 'candidate_miss', code: 'DIRECTORY_USER_INELIGIBLE', observedAt: result.observedAt }
      return result
    },
  }
}

export function createMockedGoogleDirectoryPort(results: { findExactCandidate?: ManagedDirectoryReadResult; readByDirectoryKey?: ManagedDirectoryReadResult }): ManagedDirectoryPortV1 {
  return {
    mode: 'mocked-google', writeOperations: 0,
    async findExactCandidate(_email) { return results.findExactCandidate ?? { ok: false, kind: 'not_found', code: 'DIRECTORY_NOT_FOUND', observedAt: observedAt() } },
    async readByDirectoryKey(_customer, _user) { return results.readByDirectoryKey ?? { ok: false, kind: 'not_found', code: 'DIRECTORY_NOT_FOUND', observedAt: observedAt() } },
  }
}
