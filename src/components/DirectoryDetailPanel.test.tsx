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
