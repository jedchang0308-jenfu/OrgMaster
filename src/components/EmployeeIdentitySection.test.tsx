/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EmployeeIdentitySection } from './EmployeeIdentitySection'

const api = vi.hoisted(() => ({
  loadGovernance: vi.fn(),
  loadGovernanceSession: vi.fn(),
  linkCurrentGovernanceIdentity: vi.fn(),
  patchGovernanceDraft: vi.fn(),
}))
vi.mock('../governance/apiClient', () => api)

const employee = { id: 'employee-1', name: '王小明', status: 'active' as const, departmentIds: [], primaryAssignmentId: null, administrativeApproverOverrideEmployeeId: null }
const session = { runtimeMode: 'local-development', actor: { principalId: 'principal-current', subjectHint: '••••rent' }, capabilities: { manage: true, publish: true, simulate: true } }
function snapshot(identityLinks: unknown[] = [], principalAdmissions: unknown[] = []) {
  return { payload: { document: { draft: { identityLinks, principalAdmissions } } }, revision: 'revision-1' }
}
function render(props: Partial<React.ComponentProps<typeof EmployeeIdentitySection>> = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => root.render(<EmployeeIdentitySection employee={employee} mutationBoundaryAllowed {...props} />))
  return { host, root }
}
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve() }) }

describe('EmployeeIdentitySection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.loadGovernance.mockResolvedValue(snapshot())
    api.loadGovernanceSession.mockResolvedValue({ payload: session })
    api.linkCurrentGovernanceIdentity.mockResolvedValue({ payload: { status: 'applied', document: { draft: { identityLinks: [] } } }, revision: 'revision-2' })
    api.patchGovernanceDraft.mockResolvedValue({ payload: { status: 'applied', document: { draft: { identityLinks: [] } } }, revision: 'revision-2' })
  })
  afterEach(() => { document.body.replaceChildren() })

  it('shows the employee-scoped empty state and only the current-identity action', async () => {
    const { host, root } = render()
    await flush()
    expect(host.textContent).toContain('尚未連結登入身分')
    expect(host.textContent).toContain('連結目前登入身分')
    expect(host.querySelector('[data-raw-subject]')).toBeNull()
    act(() => host.querySelector<HTMLButtonElement>('.directory-detail__identity-primary')?.click())
    await flush()
    expect(api.linkCurrentGovernanceIdentity).toHaveBeenCalledWith('revision-1', expect.any(String), 'employee-1')
    act(() => root.unmount())
  })

  it('never renders mutation controls outside the desktop mutation boundary', async () => {
    const { host, root } = render({ mutationBoundaryAllowed: false })
    await flush()
    expect(host.querySelector('.directory-detail__identity-primary')).toBeNull()
    expect(host.textContent).toContain('尚未連結登入身分')
    act(() => root.unmount())
  })

  it('keeps active admission links read-only and only displays redacted identity metadata', async () => {
    const rawSubject = 'raw-subject-must-not-render'
    api.loadGovernance.mockResolvedValue(snapshot([
      { id: 'identity-1', principalId: 'principal-other', issuer: 'urn:provider', subjectHint: '••••1234', employeeId: employee.id, status: 'active' },
    ], [
      { id: 'admission-1', principalFingerprintSha256: 'a'.repeat(64), issuerFingerprintSha256: 'b'.repeat(64), accountType: 'human_personal', identityLinkId: 'identity-1', sharedRetirementState: 'not_applicable', status: 'active', recordedAt: '2026-09-03T00:00:00.000Z', evidenceRefSha256: 'c'.repeat(64) },
    ]))
    const { host, root } = render()
    await flush()
    expect(host.textContent).toContain('••••1234')
    expect(host.textContent).toContain('已有帳號准入')
    expect(host.querySelector('button:not(.directory-detail__identity-primary)')).toBeNull()
    expect(host.querySelector('.directory-detail__identity-primary')).not.toBeNull()
    expect(host.textContent).not.toContain(rawSubject)
    act(() => root.unmount())
  })
})
