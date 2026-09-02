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
  return <WorkspaceOverlayProvider><WorkspaceShell controller={controller} hydration={{ kind: 'ready' }} mobileSingleSurface={false} header={<div>global</div>} renderPanel={(moduleId) => <div>{moduleId}</div>} onRetry={() => undefined} /></WorkspaceOverlayProvider>
}

describe('WorkspaceShell', () => {
  it('renders opened modules directly in the composable workspace without a promotion drawer', async () => {
    window.history.replaceState({}, '', '/')
    let controller!: WorkspaceController
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => root.render(<Harness capture={(value) => { controller = value }} />))
    await act(async () => controller.openOrFocus('employees'))
    expect(host.querySelector('.workspace-quick-drawer')).toBeNull()
    expect(host.textContent).toContain('employees')
    expect(controller.state.route.openPanels).toContain('employees')
    root.unmount()
    host.remove()
  })
})
