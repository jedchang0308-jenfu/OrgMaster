/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { ReactFlowProvider } from '@xyflow/react'
import { screenshotOrganizationState } from '../screenshotData'
import type { PositionView } from '../types'
import { OrgNode } from './OrgNode'

function renderNode({ active = false, editingEnabled = true }: { active?: boolean; editingEnabled?: boolean } = {}) {
  const state = screenshotOrganizationState
  const position = state.positions.find((item) => item.id === 'position-general-manager')!
  const member = state.members.find((item) => item.id === position.id)!
  const view: PositionView = {
    ...position,
    ...member,
    activeAssignments: state.assignments.filter((assignment) => assignment.positionId === position.id),
  }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const onRelationBegin = vi.fn()
  const onRelationCommit = vi.fn()
  const render = () => act(() => root.render(<ReactFlowProvider><OrgNode
    data={{
      member: view,
      employees: state.employees.filter((employee) => employee.id === 'employee-shijie'),
      childCount: 0,
      onToggle: vi.fn(),
      onSelectPosition: vi.fn(),
      onSelectEmployee: vi.fn(),
      onRelationBegin,
      onRelationCommit,
      onRelationCancel: vi.fn(),
      onRelationPreview: () => active ? { target: { kind: 'position', positionId: view.id }, status: 'intent', effect: 'assign-additional', code: null } : null,
      relationPlacementActive: active,
      relationPlacementCandidate: active ? { target: { kind: 'position', positionId: view.id }, status: 'intent', effect: 'assign-additional', code: null } : null,
      employeeHighlighted: false,
      riskRelated: false,
      onRiskInteraction: vi.fn(),
      editingEnabled,
    }}
    id={view.id}
    type="org"
    draggable={false}
    selectable={false}
    deletable={false}
    selected={false}
    dragging={false}
    zIndex={0}
    isConnectable={false}
    positionAbsoluteX={0}
    positionAbsoluteY={0}
  /></ReactFlowProvider>))
  render()
  return { host, root, onRelationBegin, onRelationCommit }
}

describe('OrgNode relation drag surface', () => {
  it('uses the employee row as the complete source and the position card as a target', () => {
    const view = renderNode({ active: true })
    const row = view.host.querySelector<HTMLElement>('[data-relation-placement-source-kind="employee"]')
    const card = view.host.querySelector<HTMLElement>('[data-relation-placement-target="position"]')
    expect(row?.getAttribute('draggable')).toBe('true')
    expect(card?.getAttribute('data-relation-placement-state')).toBe('valid')
    expect(view.host.querySelector('.org-node__relation-placement-handle')).toBeNull()

    const setData = vi.fn()
    const dragStart = new Event('dragstart', { bubbles: true })
    Object.defineProperty(dragStart, 'dataTransfer', { value: { setData, effectAllowed: '', clearData: vi.fn() } })
    act(() => row?.dispatchEvent(dragStart))
    expect(setData).toHaveBeenCalledWith('application/x-orgmaster-entity', expect.stringContaining('employee-shijie'))
    expect(view.onRelationBegin).toHaveBeenCalledWith(expect.objectContaining({ kind: 'employee', employeeId: 'employee-shijie', sourcePositionId: view.host.querySelector('[data-position-id]')?.getAttribute('data-position-id') }), 'native-drag', row)

    view.root.unmount()
    view.host.remove()
  })

  it('keeps the position target fail-closed when no placement session is active', () => {
    const view = renderNode()
    const card = view.host.querySelector<HTMLElement>('[data-relation-placement-target="position"]')
    expect(card?.getAttribute('data-relation-placement-state')).toBe('idle')
    const drop = new Event('drop', { bubbles: true })
    Object.defineProperty(drop, 'dataTransfer', { value: { types: [] } })
    act(() => card?.dispatchEvent(drop))
    expect(view.onRelationCommit).not.toHaveBeenCalled()
    view.root.unmount()
    view.host.remove()
  })

  it('keeps a cross-panel position target available while local position editing is locked', () => {
    const view = renderNode({ active: true, editingEnabled: false })
    const card = view.host.querySelector<HTMLElement>('[data-relation-placement-target="position"]')
    expect(card?.getAttribute('data-relation-placement-state')).toBe('valid')
    view.root.unmount()
    view.host.remove()
  })
})
