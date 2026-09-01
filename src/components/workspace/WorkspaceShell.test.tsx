/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { screenshotOrganizationState } from '../../screenshotData'
import { useWorkspaceController, type WorkspaceController } from '../../workspace/useWorkspaceController'
import { WorkspaceShell } from './WorkspaceShell'
import { WorkspaceOverlayProvider } from './WorkspaceOverlayHosts'

function Harness({ capture }: { capture: (controller: WorkspaceController) => void }) {
  const controller = useWorkspaceController({ organizationState: screenshotOrganizationState, initialLayout: null })
  capture(controller)
  return <WorkspaceOverlayProvider><WorkspaceShell controller={controller} hydration={{ kind: 'ready' }} mobileSingleSurface={false} header={<div>global</div>} renderPanel={(moduleId) => <div>{moduleId}</div>} renderDrawer={(moduleId) => <div>{moduleId} drawer</div>} onRetry={() => undefined} /></WorkspaceOverlayProvider>
}

describe('WorkspaceShell', () => {
  it('pushes one quick drawer beside the workspace and closes it after promotion', async () => {
    window.history.replaceState({}, '', '/')
    let controller!: WorkspaceController
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => root.render(<Harness capture={(value) => { controller = value }} />))
    await act(async () => controller.openDrawer('employees'))
    expect(host.querySelector('.workspace-quick-drawer')).not.toBeNull()
    expect(host.textContent).toContain('employees drawer')
    await act(async () => (host.querySelector('.workspace-quick-drawer__promote') as HTMLButtonElement).click())
    expect(host.querySelector('.workspace-quick-drawer')).toBeNull()
    expect(controller.state.route.openPanels).toContain('employees')
    root.unmount()
    host.remove()
  })
})
