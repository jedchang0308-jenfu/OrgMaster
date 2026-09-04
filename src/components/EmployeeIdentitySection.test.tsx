/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EmployeeIdentitySection } from './EmployeeIdentitySection'

const api = vi.hoisted(() => ({ loadEmployeeAccountAccess: vi.fn(), setEmployeeIdentityLinkStatus: vi.fn(), resendInvitation: vi.fn(), cancelInvitation: vi.fn() }))
vi.mock('../accountEnrollment/apiClient', () => ({ ...api, AccountEnrollmentApiError: class AccountEnrollmentApiError extends Error { code: string; status: number; field?: 'email'; constructor(code: string, status: number, field?: 'email') { super(code); this.code = code; this.status = status; this.field = field } } }))

const employee = { id: 'employee-1', name: '王小明', status: 'active' as const, departmentIds: [], primaryAssignmentId: null, administrativeApproverOverrideEmployeeId: null }
const base = { contractVersion: 'orgmaster.employee-account-access.v1' as const, employee: { id: employee.id, status: 'active' as const }, state: 'empty' as const, deliveryMode: 'simulated' as const, accounts: [], enrollments: [], capabilities: { view: true as const, invite: true, link: true, manageInvitation: true, manageLinkStatus: true }, governanceRevision: 'gov-1' }
function render(props: Partial<React.ComponentProps<typeof EmployeeIdentitySection>> = {}) { const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); act(() => root.render(<EmployeeIdentitySection employee={employee} accountMutationEnvironmentAllowed {...props} />)); return { host, root } }
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve() }) }

describe('EmployeeIdentitySection', () => {
  beforeEach(() => { vi.clearAllMocks(); api.loadEmployeeAccountAccess.mockResolvedValue({ ...base }) })
  afterEach(() => document.body.replaceChildren())
  it('renders the new account empty state and single setup action', async () => { const { host, root } = render(); await flush(); expect(host.textContent).toContain('尚未設定登入帳號'); expect(host.textContent).toContain('設定登入帳號'); expect(host.textContent).not.toContain('連結目前登入身分'); act(() => root.unmount()) })
  it('hides mutation controls outside the desktop boundary', async () => { const { host, root } = render({ accountMutationEnvironmentAllowed: false }); await flush(); expect(host.querySelector('.directory-detail__identity-primary')).toBeNull(); act(() => root.unmount()) })
  it('hides pending and link-status actions outside the desktop boundary', async () => { api.loadEmployeeAccountAccess.mockResolvedValue({ ...base, state: 'in_progress', accounts: [{ identityLinkId: 'identity-1', accountHint: '••••1234', providerLabel: '地端帳號', accountType: 'human_personal', status: 'active', linkStatusMutable: true }], enrollments: [{ id: 'enrollment-1', kind: 'invite_new', status: 'pending_acceptance', emailHint: 'w***g@orgmaster.test', statusReasonCode: 'provider_pending_acceptance', expiresAt: null, revision: 2, actions: ['resend', 'cancel'] }] }); const { host, root } = render({ accountMutationEnvironmentAllowed: false }); await flush(); expect(host.querySelectorAll('.directory-detail__identity-row .button')).toHaveLength(0); act(() => root.unmount()) })
  it('renders every account and pending enrollment row without raw identity data', async () => { api.loadEmployeeAccountAccess.mockResolvedValue({ ...base, state: 'in_progress', accounts: [{ identityLinkId: 'identity-1', accountHint: '••••1234', providerLabel: '地端帳號', accountType: 'human_personal', status: 'active', linkStatusMutable: false }], enrollments: [{ id: 'enrollment-1', kind: 'invite_new', status: 'pending_acceptance', emailHint: 'w***g@orgmaster.test', statusReasonCode: 'provider_pending_acceptance', expiresAt: '2026-09-07T00:00:00.000Z', revision: 2, actions: ['resend', 'cancel'] }] }); const { host, root } = render(); await flush(); expect(host.textContent).toContain('••••1234'); expect(host.textContent).toContain('w***g@orgmaster.test'); expect(host.querySelectorAll('.directory-detail__identity-row')).toHaveLength(2); expect(host.textContent).not.toContain('raw-subject'); act(() => root.unmount()) })
})
