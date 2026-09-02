/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { screenshotOrganizationState } from '../screenshotData'
import { DirectoryDock } from './DirectoryDock'

function renderEmployeeDirectory() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const onRelationBegin = vi.fn()
  const onSelectEntity = vi.fn()

  act(() => root.render(<DirectoryDock
    employees={screenshotOrganizationState.employees}
    departments={screenshotOrganizationState.departments}
    members={[]}
    positions={screenshotOrganizationState.positions}
    assignments={screenshotOrganizationState.assignments}
    organizationLevels={screenshotOrganizationState.organizationLevels}
    levelIssue={null}
    editingEnabled
    selected={null}
    directorySelection={null}
    activeDirectory="employees"
    onActiveDirectoryChange={vi.fn()}
    onRelationBegin={onRelationBegin}
    onRelationCancel={vi.fn()}
    onAssignEmployee={vi.fn()}
    onSelectPosition={vi.fn()}
    onSelectEntity={onSelectEntity}
    onAddEmployee={vi.fn()}
    onAddPosition={vi.fn()}
    onAddDepartment={vi.fn()}
    onDeleteEmployee={vi.fn()}
    onDeletePosition={vi.fn()}
    onDeleteDepartment={vi.fn()}
    onEditEmployee={vi.fn()}
    onEditPosition={vi.fn()}
    onEditDepartment={vi.fn()}
    onAddOrganizationLevel={() => true}
    onRenameOrganizationLevel={() => true}
    onDeleteOrganizationLevel={() => true}
    onReorderOrganizationLevels={() => true}
    onPreviewOrganizationLevels={vi.fn()}
    workspaceEntityDragSource="employees"
  />))

  return { host, root, onRelationBegin, onSelectEntity }
}

describe('DirectoryDock employee drag surface', () => {
  it('uses the whole employee card as the relation source', () => {
    const { host, root, onRelationBegin } = renderEmployeeDirectory()
    const card = host.querySelector<HTMLElement>('[data-employee-id="employee-shijie"]')

    expect(card).not.toBeNull()
    expect(card?.getAttribute('draggable')).toBe('true')
    expect(card?.getAttribute('data-relation-placement-source-kind')).toBe('employee')
    expect(card?.querySelector('.directory-card__placement-action')).toBeNull()

    const setData = vi.fn()
    const dragEvent = new Event('dragstart', { bubbles: true })
    Object.defineProperty(dragEvent, 'dataTransfer', {
      value: { setData, effectAllowed: '' },
    })
    act(() => card?.dispatchEvent(dragEvent))

    expect(setData).toHaveBeenCalledWith(
      'application/x-orgmaster-entity',
      JSON.stringify({
        version: 1,
        kind: 'employee',
        sourceModuleId: 'employees',
        employeeId: 'employee-shijie',
        sourcePositionId: null,
      }),
    )
    expect(onRelationBegin).toHaveBeenCalledWith(
      {
        version: 1,
        kind: 'employee',
        sourceModuleId: 'employees',
        employeeId: 'employee-shijie',
        sourcePositionId: null,
      },
      'native-drag',
      card,
    )

    act(() => root.unmount())
    host.remove()
  })

  it('keeps Space as the keyboard relation trigger while Enter selects', () => {
    const { host, root, onRelationBegin, onSelectEntity } = renderEmployeeDirectory()
    const card = host.querySelector<HTMLElement>('[data-employee-id="employee-shijie"]')
    expect(card).not.toBeNull()

    act(() => card?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })))
    expect(onRelationBegin).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'employee', employeeId: 'employee-shijie' }),
      'keyboard',
      card,
    )
    expect(onSelectEntity).not.toHaveBeenCalled()

    act(() => card?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(onSelectEntity).toHaveBeenCalledWith({ kind: 'employees', id: 'employee-shijie' })

    act(() => root.unmount())
    host.remove()
  })
})
