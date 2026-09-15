import type { AssignEmployeeNumberRequestV1, ConfirmManagedIdentityLinkRequestV1, FindManagedIdentityCandidateRequestV1, ManagedIdentityCandidateResponseV1, ManagedIdentityReadModelV1, ManagedIdentityRefreshRequestV1, ManagedIdentityRefreshResultV1 } from './types'

export const MANAGED_IDENTITY_API_PATH = '/api/orgmaster/employees'

export class ManagedIdentityApiError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code)
    this.name = 'ManagedIdentityApiError'
  }
}

async function request<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...(init?.headers ?? {}) },
  })
  const body = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) throw new ManagedIdentityApiError(String(body.error ?? 'MANAGED_IDENTITY_READ_FAILED'), response.status)
  return body as T
}

function employeePath(employeeId: string) {
  return MANAGED_IDENTITY_API_PATH + '/' + encodeURIComponent(employeeId) + '/managed-identity'
}

export function loadManagedIdentity(employeeId: string) {
  return request<ManagedIdentityReadModelV1>(employeePath(employeeId))
}

export function assignManagedEmployeeNumber(employeeId: string, body: AssignEmployeeNumberRequestV1) {
  return request<ManagedIdentityReadModelV1>(MANAGED_IDENTITY_API_PATH + '/' + encodeURIComponent(employeeId) + '/employee-number', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export function findManagedIdentityCandidate(employeeId: string, body: FindManagedIdentityCandidateRequestV1) {
  return request<ManagedIdentityCandidateResponseV1>(MANAGED_IDENTITY_API_PATH + '/' + encodeURIComponent(employeeId) + '/managed-identity/candidate', { method: 'POST', body: JSON.stringify(body) })
}

export function confirmManagedIdentityLink(employeeId: string, body: ConfirmManagedIdentityLinkRequestV1) {
  return request<ManagedIdentityReadModelV1>(MANAGED_IDENTITY_API_PATH + '/' + encodeURIComponent(employeeId) + '/managed-identity/confirm', { method: 'POST', body: JSON.stringify(body) })
}

export function enqueueManagedIdentityRefresh(employeeId: string, body: ManagedIdentityRefreshRequestV1) {
  return request<{ disposition: 'queued' | 'deduplicated'; requestId: string }>(MANAGED_IDENTITY_API_PATH + '/' + encodeURIComponent(employeeId) + '/managed-identity/refresh', { method: 'POST', body: JSON.stringify(body) })
}

export function checkManagedIdentityActivation(employeeId: string, workspaceRevision: string) {
  return request<{ allowed: boolean; correctionRequired: boolean }>(MANAGED_IDENTITY_API_PATH + '/' + encodeURIComponent(employeeId) + '/activation-check', { method: 'POST', body: JSON.stringify({ workspaceRevision }) })
}
