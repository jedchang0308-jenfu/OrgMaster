export type AuthMode = {
  authMode: 'jenfu_firebase_bff'
  firebase: { apiKey: string; authDomain: string; projectId: string; appId: string }
  correlationId: string
}

export type DevelopmentAuthProfileView = {
  id: 'administrator' | 'governance-manager' | 'method-manager' | 'employee'
  roleCode: string
  roleName: string
  employeeId: string
  employeeName: string
  description: string
}

export type DevelopmentAuthMode = {
  authMode: 'local_development'
  profiles: DevelopmentAuthProfileView[]
  session: AuthSessionView | null
  correlationId: string
}

export type AuthSessionView = {
  user: { principalId: string; employeeId: string }
  session: { expiresAt: string }
  assuranceLevel: 'aal1' | 'aal2'
  developmentProfile?: DevelopmentAuthProfileView
  correlationId: string
}

export class AuthApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, public readonly correlationId?: string) {
    super(code)
  }
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

export function getDevelopmentAuthMode() {
  return json<DevelopmentAuthMode>('/api/auth/development/profiles')
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

export function loginDevelopmentProfile(profileId: DevelopmentAuthProfileView['id']) {
  return json<AuthSessionView>('/api/auth/development/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profileId }),
  })
}

export function logoutCurrentSession() {
  return json<{ status: 'completed'; correlationId: string }>('/api/auth/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
}
