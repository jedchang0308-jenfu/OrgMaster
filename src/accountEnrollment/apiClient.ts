import type {
  AccountEnrollmentErrorCodeV1, EmployeeAccountAccessViewV1, ExistingCandidateRequestV1,
  ExistingAccountCandidateViewV1, InviteAccountRequestV1, LinkExistingAccountRequestV1,
  ManageInvitationRequestV1, SetIdentityLinkStatusRequestV1,
} from './types'

export const ACCOUNT_ENROLLMENT_API_PATH = '/api/orgmaster/account-enrollments'

export class AccountEnrollmentApiError extends Error {
  constructor(readonly code: AccountEnrollmentErrorCodeV1, readonly status: number, readonly field?: 'email', readonly conflictingEmployee?: { id: string; name: string }) { super(code); this.name = 'AccountEnrollmentApiError' }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', ...init, headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...(init?.headers ?? {}) } })
  let body: any = null; try { body = await response.json() } catch { /* handled below */ }
  if (!response.ok) throw new AccountEnrollmentApiError(body?.error ?? 'GOVERNANCE_READ_FAILED', response.status, body?.field, body?.conflictingEmployee)
  return body as T
}
function json(body: unknown): RequestInit { return { method: 'POST', body: JSON.stringify(body) } }

export function loadEmployeeAccountAccess(employeeId: string) { return request<EmployeeAccountAccessViewV1>(`${ACCOUNT_ENROLLMENT_API_PATH}/employees/${encodeURIComponent(employeeId)}`) }
export function inviteEmployeeAccount(body: InviteAccountRequestV1) { return request<EmployeeAccountAccessViewV1>(`${ACCOUNT_ENROLLMENT_API_PATH}/invitations`, json(body)) }
export function findExistingAccount(body: ExistingCandidateRequestV1) { return request<ExistingAccountCandidateViewV1>(`${ACCOUNT_ENROLLMENT_API_PATH}/existing-candidates`, json(body)) }
export function linkExistingAccount(body: LinkExistingAccountRequestV1) { return request<EmployeeAccountAccessViewV1>(`${ACCOUNT_ENROLLMENT_API_PATH}/existing-links`, json(body)) }
export function resendInvitation(enrollmentId: string, body: Omit<ManageInvitationRequestV1, 'enrollmentId'>) { return request<EmployeeAccountAccessViewV1>(`${ACCOUNT_ENROLLMENT_API_PATH}/invitations/${encodeURIComponent(enrollmentId)}/resend`, json({ ...body, enrollmentId })) }
export function cancelInvitation(enrollmentId: string, body: Omit<ManageInvitationRequestV1, 'enrollmentId'>) { return request<EmployeeAccountAccessViewV1>(`${ACCOUNT_ENROLLMENT_API_PATH}/invitations/${encodeURIComponent(enrollmentId)}/cancel`, json({ ...body, enrollmentId })) }
export function setEmployeeIdentityLinkStatus(identityLinkId: string, body: Omit<SetIdentityLinkStatusRequestV1, 'identityLinkId'>) { return request<EmployeeAccountAccessViewV1>(`${ACCOUNT_ENROLLMENT_API_PATH}/identity-links/${encodeURIComponent(identityLinkId)}/status`, json({ ...body, identityLinkId })) }

export const loadAccountAccess = loadEmployeeAccountAccess
export const inviteAccount = inviteEmployeeAccount
export const findExistingCandidate = findExistingAccount
export const linkExisting = linkExistingAccount
