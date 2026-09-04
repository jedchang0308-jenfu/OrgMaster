/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { screenshotOrganizationState } from '../screenshotData'
import { DutyDetailDrawer } from './DutyDetailDrawer'

describe('DutyDetailDrawer panel detail', () => {
  it('uses the shared panel dismiss control and closes the detail', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const onClose = vi.fn()
    const duty = { id: 'duty-test', title: '公司策略規劃', description: null }

    act(() => root.render(<DutyDetailDrawer
      duty={duty}
      state={{ ...screenshotOrganizationState, duties: [duty] }}
      editingEnabled={false}
      displayMode="panel"
      onClose={onClose}
    />))

    const detail = host.querySelector<HTMLElement>('.duty-drawer--panel')
    const closeButton = host.querySelector<HTMLButtonElement>('[aria-label="關閉工作執掌明細"]')
    expect(detail?.getAttribute('data-workspace-panel')).toBe('detail')
    expect(closeButton?.querySelector('svg')).not.toBeNull()

    act(() => closeButton?.click())
    expect(onClose).toHaveBeenCalledOnce()

    act(() => root.unmount())
    host.remove()
  })
})
