/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { WorkspacePanelFrame } from './WorkspacePanelFrame'
import { GlobalOverlayHost, WorkspaceOverlayProvider, WorkspacePortal } from './WorkspaceOverlayHosts'

describe('WorkspacePanelFrame', () => {
  it('creates one owner root, one content root and one panel host', async () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => root.render(<WorkspaceOverlayProvider><GlobalOverlayHost /><WorkspacePanelFrame moduleId="duties" visibility="active"><WorkspacePortal scope="panel"><button type="button">inside</button></WorkspacePortal></WorkspacePanelFrame></WorkspaceOverlayProvider>))
    expect(host.querySelectorAll('.workspace-panel-frame[data-module="duties"]')).toHaveLength(1)
    expect(host.querySelectorAll('[data-workspace-panel-content="true"]')).toHaveLength(1)
    expect(host.querySelectorAll('[data-workspace-overlay-host="panel"][data-module="duties"]')).toHaveLength(1)
    expect(host.querySelector('[data-workspace-overlay-host="panel"]')?.textContent).toContain('inside')
    root.unmount()
  })

  it('isolates a child error to the panel frame', async () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    function Broken(): never { throw new Error('fixture') }
    await act(async () => root.render(<WorkspaceOverlayProvider><GlobalOverlayHost /><div data-module="employees"><WorkspacePanelFrame moduleId="duties" visibility="active"><Broken /></WorkspacePanelFrame></div></WorkspaceOverlayProvider>))
    expect(host.querySelector('[data-module="duties"] [role="alert"]')).not.toBeNull()
    expect(host.querySelector('[data-module="employees"]')).not.toBeNull()
    root.unmount()
  })
})
