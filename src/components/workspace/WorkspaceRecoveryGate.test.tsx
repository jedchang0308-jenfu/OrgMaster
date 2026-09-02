/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceRecoveryGate } from './WorkspaceRecoveryGate'

describe('WorkspaceRecoveryGate', () => {
  it('blocks product content for invalid current version and offers retry', async () => {
    const retry = vi.fn()
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => root.render(<WorkspaceRecoveryGate state={{ kind: 'version-invalid', versionId: 'current-1', isCurrent: true, message: 'VERSION_INVALID' }} onRetry={retry}><span>domain</span></WorkspaceRecoveryGate>))
    expect(host.textContent).toContain('現行版本無法載入')
    expect(host.textContent).not.toContain('domain')
    await act(async () => (host.querySelector('button') as HTMLButtonElement).click())
    expect(retry).toHaveBeenCalledTimes(1)
    root.unmount()
  })

  it('preserves a conflict escape hatch before explicit reload', async () => {
    const retry = vi.fn()
    const download = vi.fn()
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => root.render(<WorkspaceRecoveryGate state={{ kind: 'conflict', message: 'CONFLICT' }} onRetry={retry} onDownloadCopy={download}><span>domain</span></WorkspaceRecoveryGate>))
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('button')]
    expect(buttons.map((button) => button.textContent)).toEqual(['下載目前副本', '重新載入'])
    await act(async () => buttons[0].click())
    expect(download).toHaveBeenCalledTimes(1)
    expect(retry).not.toHaveBeenCalled()
    root.unmount()
  })
})
