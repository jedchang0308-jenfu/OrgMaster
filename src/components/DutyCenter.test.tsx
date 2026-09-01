/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { screenshotOrganizationState } from '../screenshotData'
import { DutyCenter } from './DutyCenter'

const state = {
  ...screenshotOrganizationState,
  duties: [{ id: 'duty-test', title: '測試職掌', description: null }],
  dutyPositionRelations: [],
}

function renderCenter(view: 'audit' | 'distribution' = 'audit') {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => root.render(<div data-module="duties"><DutyCenter
    state={state}
    view={view}
    query=""
    anomalyTypes={[]}
    onNavigateView={vi.fn()}
    onQueryChange={vi.fn()}
    onAnomalyTypesChange={vi.fn()}
    onClearFilters={vi.fn()}
    onOpenDutyConfiguration={vi.fn()}
    displayMode="panel"
  /></div>))
  return { host, root }
}

describe('DutyCenter panel ownership', () => {
  it('mounts one panel-owned detail after selecting a duty', () => {
    const { host, root } = renderCenter()
    const trigger = [...host.querySelectorAll('button')].find((button) => button.textContent === '測試職掌')
    expect(trigger).not.toBeUndefined()
    act(() => trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    const detail = host.querySelector('.duty-drawer--panel')
    expect(detail).not.toBeNull()
    expect(detail?.closest('[data-module]')?.getAttribute('data-module')).toBe('duties')
    expect(host.querySelectorAll('.duty-drawer--panel')).toHaveLength(1)
    act(() => root.unmount())
    host.remove()
  })

  it('does not leave a stale detail when the distribution view is rendered', () => {
    const { host, root } = renderCenter('distribution')
    expect(host.querySelector('.duty-drawer--panel')).toBeNull()
    expect(host.querySelector('.duty-planning-distribution')).not.toBeNull()
    act(() => root.unmount())
    host.remove()
  })
})
