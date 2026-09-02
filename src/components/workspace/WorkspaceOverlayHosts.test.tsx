/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import {
  GlobalOverlayHost,
  PanelOverlayHost,
  resolvePanelAnchoredPosition,
  WorkspaceOverlayProvider,
  WorkspacePanelOverlayScope,
  WorkspacePortal,
} from './WorkspaceOverlayHosts'

describe('WorkspaceOverlayHosts', () => {
  it('keeps panel and global portals in their declared hosts', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => root.render(
      <WorkspaceOverlayProvider>
        <GlobalOverlayHost />
        <WorkspacePanelOverlayScope moduleId="duties">
          <PanelOverlayHost />
          <WorkspacePortal scope="panel"><button type="button">panel overlay</button></WorkspacePortal>
          <WorkspacePortal scope="global"><button type="button">global overlay</button></WorkspacePortal>
        </WorkspacePanelOverlayScope>
      </WorkspaceOverlayProvider>,
    ))
    expect(host.querySelector('[data-workspace-overlay-host="panel"]')?.textContent).toContain('panel overlay')
    expect(host.querySelector('[data-workspace-overlay-host="global"]')?.textContent).toContain('global overlay')
    expect(host.querySelector('[data-workspace-overlay-host="panel"] [data-workspace-overlay-host="global"]')).toBeNull()
    root.unmount()
    host.remove()
  })

  it('renders nothing while a registered host is pending instead of falling back to body', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => root.render(
      <WorkspaceOverlayProvider>
        <WorkspacePanelOverlayScope moduleId="duties">
          <WorkspacePortal scope="panel"><span>pending</span></WorkspacePortal>
        </WorkspacePanelOverlayScope>
      </WorkspaceOverlayProvider>,
    ))
    expect(host.textContent).not.toContain('pending')
    expect(document.body.textContent).not.toContain('pending')
    root.unmount()
    host.remove()
  })

  it('clamps anchored coordinates to the panel host with an eight pixel gap', () => {
    expect(resolvePanelAnchoredPosition(
      { left: 90, right: 110, top: 20, bottom: 40 },
      { left: 10, top: 10, width: 300, height: 240 },
      { width: 120, height: 80 },
    )).toEqual({ left: 108, top: 10 })
    expect(resolvePanelAnchoredPosition(
      { left: 280, right: 300, top: 210, bottom: 230 },
      { left: 10, top: 10, width: 300, height: 240 },
      { width: 120, height: 80 },
    )).toEqual({ left: 142, top: 140 })
  })
})
