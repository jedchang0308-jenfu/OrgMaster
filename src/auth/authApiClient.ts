export type AuthMode = {
  authMode: 'jenfu_firebase_bff'
  firebase: { apiKey: string; authDomain: string; projectId: string; appId: string }
  correlationId: string
}

export type AuthSessionView = {
  user: { principalId: string; employeeId: string }
  session: { expiresAt: string }
  assuranceLevel: 'aal1' | 'aal2'
  correlationId: string
}

export class AuthApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, public readonly correlationId?: string) {
    super(code)
  }
}

let developmentFetchInstalled = false

export function installDevelopmentApiIdentityHeaders() {
  if (!import.meta.env.DEV || developmentFetchInstalled || typeof window === 'undefined') return
  const originalFetch = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    const rawUrl = input instanceof Request ? input.url : String(input)
    const url = new URL(rawUrl, window.location.href)
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return originalFetch(input, init)
    const headers = new Headers(input instanceof Request ? input.headers : undefined)
    new Headers(init.headers).forEach((value, key) => headers.set(key, value))
    headers.set('X-OrgMaster-Dev-Issuer', 'urn:orgmaster:dev')
    headers.set('X-OrgMaster-Dev-Subject', 'local-admin')
    return originalFetch(input, { ...init, headers })
  }
  developmentFetchInstalled = true
}

async function json<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, { credentials: 'same-origin', ...init })
  const body = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) throw new AuthApiError(response.status, String(body.code ?? 'auth_request_invalid'), typeof body.correlationId === 'string' ? body.correlationId : undefined)
  return body as T
}

export function getAuthMode() {
  return json<AuthMode>('/api/auth/mode')
}

export function getCurrentSession() {
  return json<AuthSessionView>('/api/auth/me')
}

export function exchangeFirebaseToken(idToken: string) {
  return json<AuthSessionView>('/api/auth/firebase/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  })
}

export function logoutCurrentSession() {
  return json<{ status: 'completed'; correlationId: string }>('/api/auth/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
}
