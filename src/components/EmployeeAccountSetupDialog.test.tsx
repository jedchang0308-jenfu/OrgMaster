/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmployeeAccountSetupDialog } from './EmployeeAccountSetupDialog'
import { GlobalOverlayHost, WorkspaceOverlayProvider } from './workspace/WorkspaceOverlayHosts'

vi.mock('../accountEnrollment/apiClient', () => ({ inviteEmployeeAccount: vi.fn().mockResolvedValue({}), findExistingAccount: vi.fn(), linkExistingAccount: vi.fn(), AccountEnrollmentApiError: class AccountEnrollmentApiError extends Error { code = 'x'; status = 500 } }))
const employee = { id: 'e-1', name: '測試員工', status: 'active' as const, departmentIds: [], primaryAssignmentId: null, administrativeApproverOverrideEmployeeId: null }
const view = { contractVersion: 'orgmaster.employee-account-access.v1' as const, employee: { id: 'e-1', status: 'active' as const }, state: 'empty' as const, deliveryMode: 'simulated' as const, accounts: [], enrollments: [], capabilities: { view: true as const, invite: true, link: true, manageInvitation: true, manageLinkStatus: true }, governanceRevision: 'rev' }
describe('EmployeeAccountSetupDialog', () => { afterEach(() => document.body.replaceChildren()); it('shows one email field and mode choices', () => { const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); act(() => root.render(<WorkspaceOverlayProvider><GlobalOverlayHost /><EmployeeAccountSetupDialog employee={employee} view={view} open onClose={vi.fn()} onSuccess={vi.fn()} /></WorkspaceOverlayProvider>)); expect(host.querySelector('[role="dialog"]')).not.toBeNull(); expect(host.querySelectorAll('input[type="email"], input[inputmode="email"]')).toHaveLength(1); expect(host.textContent).toContain('邀請新帳號'); act(() => root.unmount()) }) })
