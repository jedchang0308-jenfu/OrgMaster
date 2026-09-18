import { GoogleAuth } from 'google-auth-library'
import type { DirectoryState } from '../src/managedIdentity/types'

export const GOOGLE_DIRECTORY_READ_SCOPE = 'https://www.googleapis.com/auth/admin.directory.user.readonly' as const

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

export function createGoogleDirectoryAuthPort(input: { delegatedSubject: string; getClient?: () => Promise<{ getRequestHeaders(url?: string): Promise<Headers | Record<string, string>> }> }): GoogleDirectoryAuthPort {
  if (!input.delegatedSubject.trim()) throw new Error('DIRECTORY_DELEGATED_SUBJECT_REQUIRED')
  const clientPromise = input.getClient ? input.getClient() : (async () => {
    const auth = new GoogleAuth({ scopes: [GOOGLE_DIRECTORY_READ_SCOPE], clientOptions: { subject: input.delegatedSubject } })
    return auth.getClient()
  })()
  return {
    async getRequestHeaders(url) {
      const headers = await (await clientPromise).getRequestHeaders(url)
      const result: Record<string, string> = {}
      for (const [key, value] of Object.entries(headers)) if (typeof value === 'string') result[key] = value
      result.Accept = 'application/json'
      return result
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
