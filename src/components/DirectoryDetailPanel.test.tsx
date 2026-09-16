/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { buildPositionViews } from '../organization'
import {
  screenshotAssignments,
  screenshotDepartments,
  screenshotEmployees,
  screenshotMembers,
  screenshotOrganizationLevels,
  screenshotPositions,
} from '../screenshotData'
import { DirectoryDetailPanel } from './DirectoryDetailPanel'

const auth = vi.hoisted(() => ({ managedIdentityEnabled: false }))
vi.mock('../auth/AuthGate', () => ({ useAuthSession: () => auth }))
vi.mock('./EmployeeManagedIdentitySection', () => ({ EmployeeManagedIdentitySection: () => <div>managed identity enabled</div> }))
vi.mock('./EmployeeIdentitySection', () => ({ EmployeeIdentitySection: ({ accountMutationEnvironmentAllowed }: { accountMutationEnvironmentAllowed: boolean }) => <div>{`legacy identity mutable:${accountMutationEnvironmentAllowed}`}</div> }))

function renderDepartmentDetail() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const onSelectEntity = vi.fn()

  act(() => root.render(<DirectoryDetailPanel
    selection={{ kind: 'departments', id: 'department-production' }}
    employees={screenshotEmployees}
    departments={screenshotDepartments}
    organizationLevels={screenshotOrganizationLevels}
    members={buildPositionViews(screenshotMembers, screenshotPositions, screenshotAssignments, '2026-03-01')}
    onSetPrimaryAssignment={vi.fn()}
    onSelectPosition={vi.fn()}
    onSelectEntity={onSelectEntity}
    onClose={vi.fn()}
  />))

  return { host, root, onSelectEntity }
}

describe('DirectoryDetailPanel department positions', () => {
  it('uses legacy read-only identity until the backend enables managed identity', () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    const render = () => root.render(<DirectoryDetailPanel selection={{ kind: 'employees', id: screenshotEmployees[0].id }} employees={screenshotEmployees} departments={screenshotDepartments} organizationLevels={screenshotOrganizationLevels} members={[]} onSetPrimaryAssignment={vi.fn()} onSelectPosition={vi.fn()} onSelectEntity={vi.fn()} onClose={vi.fn()} identityMutationAllowed />)
    act(render)
    expect(host.textContent).toContain('legacy identity mutable:false')
    expect(host.textContent).not.toContain('managed identity enabled')
    auth.managedIdentityEnabled = true
    act(render)
    expect(host.textContent).toContain('managed identity enabled')
    expect(host.textContent).not.toContain('legacy identity')
    act(() => root.unmount())
    auth.managedIdentityEnabled = false
  })
  it('expands assigned employees below a position when clicked', () => {
    const { host, root, onSelectEntity } = renderDepartmentDetail()
    const positionToggle = Array.from(host.querySelectorAll<HTMLButtonElement>('.directory-detail__position-toggle'))
      .find((button) => button.textContent?.includes('生產部經理'))

    expect(positionToggle).toBeDefined()
    expect(positionToggle?.getAttribute('aria-expanded')).toBe('false')
    expect(host.querySelector('.directory-detail__position-member')).toBeNull()

    act(() => positionToggle?.click())

    expect(positionToggle?.getAttribute('aria-expanded')).toBe('true')
    expect(host.querySelector('.directory-detail__position-member')?.textContent).toContain('張成漢')

    act(() => host.querySelector<HTMLButtonElement>('.directory-detail__position-member')?.click())
    expect(onSelectEntity).toHaveBeenCalledWith({ kind: 'employees', id: 'employee-chenghan' })

    act(() => positionToggle?.click())
    expect(positionToggle?.getAttribute('aria-expanded')).toBe('false')
    expect(host.querySelector('.directory-detail__position-member')).toBeNull()

    act(() => root.unmount())
    host.remove()
  })
})
