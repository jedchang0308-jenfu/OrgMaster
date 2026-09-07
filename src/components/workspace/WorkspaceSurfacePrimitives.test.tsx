/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceListDetailSurface, WorkspaceListOnlySurface } from './WorkspaceSurfacePrimitives'

describe('WorkspaceSurfacePrimitives', () => {
  it('renders one adjacent list/detail surface with an empty detail slot', async () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => root.render(<WorkspaceListDetailSurface listLabel="清單" detailLabel="明細" list={<span>list</span>} detail={null} emptyDetail={<span data-workspace-focus-fallback tabIndex={-1}>empty</span>} />))
    expect(host.querySelector('[data-workspace-surface="list-detail"]')).not.toBeNull()
    expect(host.querySelectorAll('[data-workspace-slot="list"]')).toHaveLength(1)
    expect(host.querySelectorAll('[data-workspace-slot="detail"]')).toHaveLength(1)
    expect(host.textContent).toContain('empty')
    root.unmount()
  })

  it('does not manufacture a detail slot for list-only modules', async () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => root.render(<WorkspaceListOnlySurface label="層級" dataVisibility="hidden"><span>levels</span></WorkspaceListOnlySurface>))
    expect(host.querySelector('[data-workspace-surface="list-only"]')).not.toBeNull()
    expect(host.querySelector('[data-workspace-slot="detail"]')).toBeNull()
    expect(host.querySelector('[data-visibility="hidden"]')).not.toBeNull()
    root.unmount()
  })

  it('routes arrow navigation through the shared list-detail surface', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const onListRowNavigate = vi.fn(() => ({ kind: 'allow' as const }))
    await act(async () => root.render(<WorkspaceListDetailSurface onListRowNavigate={onListRowNavigate} detailVisible={false} listLabel="清單" detailLabel="明細" list={<div><button type="button" data-workbench-row-id="one">一</button><button type="button" data-workbench-row-id="two">二</button></div>} detail={null} />))
    const rows = host.querySelectorAll<HTMLButtonElement>('[data-workbench-row-id]')
    rows[0].focus()
    await act(async () => rows[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
    expect(onListRowNavigate).toHaveBeenCalledWith('two', 'down')
    expect(document.activeElement).toBe(rows[1])
    root.unmount()
  })
})
