/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { WORKSPACE_MODULE_ORDER, getWorkspaceModule } from '../../workspace/moduleRegistry'
import { WorkspaceLauncher } from './WorkspaceLauncher'
import { WorkspaceListDetailSurface } from './WorkspaceSurfacePrimitives'

describe('DEV-042 single-layer workspace contract', () => {
  it('routes every launcher item through one open-or-focus callback', async () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    const onOpenModule = vi.fn()
    await act(async () => root.render(<WorkspaceLauncher openPanels={[]} onOpenModule={onOpenModule} />))
    await act(async () => (host.querySelector('#workspace-launcher') as HTMLButtonElement).click())
    expect(host.querySelectorAll('[role="menuitem"]')).toHaveLength(WORKSPACE_MODULE_ORDER.length)
    for (let index = 0; index < WORKSPACE_MODULE_ORDER.length; index += 1) {
      if (index > 0) await act(async () => (host.querySelector('#workspace-launcher') as HTMLButtonElement).click())
      const entry = host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[index]
      await act(async () => entry.click())
    }
    expect(onOpenModule.mock.calls.map(([moduleId]) => moduleId)).toEqual([...WORKSPACE_MODULE_ORDER])
    root.unmount()
  })

  it('uses the registry detail capability without manufacturing a detail for embedded modules', () => {
    expect(getWorkspaceModule('employees').supportsCollapsibleDetail).toBe(true)
    expect(getWorkspaceModule('processes').supportsCollapsibleDetail).toBe(false)
    const host = document.createElement('div')
    const root = createRoot(host)
    act(() => root.render(<WorkspaceListDetailSurface detailVisible={false} listLabel="清單" detailLabel="明細" list={<span>清單</span>} detail={<span>不應顯示</span>} />))
    expect(host.querySelector('[data-layout="list-only"]')).not.toBeNull()
    expect(host.querySelector('[data-workspace-slot="detail"]')).toBeNull()
    root.unmount()
  })
})
