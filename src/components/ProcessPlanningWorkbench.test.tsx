/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { screenshotOrganizationState } from '../screenshotData'
import type { OrgDirectoryState } from '../types'
import { ProcessPlanningWorkbench } from './ProcessPlanningWorkbench'

function planningState(): OrgDirectoryState {
  return {
    ...screenshotOrganizationState,
    processes: [{ id: 'p1', title: '出貨流程', description: null, order: 0 }],
    processNodes: [{ id: 'n1', processId: 'p1', title: '確認訂單', parentNodeId: null, order: 0 }],
    processEdges: [],
    processNodeDutyLinks: [],
  }
}

describe('ProcessPlanningWorkbench component harness', () => {
  it('renders both planning views and the organization projection from one state', async () => {
    if (!('ResizeObserver' in window)) {
      Object.defineProperty(window, 'ResizeObserver', { value: class { observe() {} unobserve() {} disconnect() {} } })
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(<ProcessPlanningWorkbench
        state={planningState()}
        location={{ active: true, view: 'mindmap', processId: 'p1', processNodeId: 'n1', dutyId: null }}
        editingEnabled={false}
        serverReady
        recoveryOpen={false}
        mobileReadOnly
        onCommand={() => undefined}
        onNavigate={() => undefined}
        onClose={() => undefined}
      />)
      await Promise.resolve()
    })
    expect(host.querySelector('[aria-label="流程與職掌規劃工作台"]')).not.toBeNull()
    expect(host.textContent).toContain('責任心智圖')
    expect(host.textContent).toContain('流程圖')
    expect(host.textContent).toContain('確認訂單')
    expect(host.textContent).toContain('組織責任視角')
    root.unmount()
    host.remove()
  })
})
