/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceLauncher } from './WorkspaceLauncher'

describe('WorkspaceLauncher', () => {
  it('keeps a stable accessible name when the mobile layout hides visible copy', async () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => root.render(<WorkspaceLauncher openPanels={[]} onOpenModule={() => undefined} />))
    expect(host.querySelector('#workspace-launcher')?.getAttribute('aria-label')).toBe('功能')
    root.unmount()
  })

  it('shows all ten entries and routes every module through the same open-or-focus handler', async () => {
    const onOpenModule = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => root.render(<WorkspaceLauncher openPanels={['organization']} onOpenModule={onOpenModule} />))
    await act(async () => (host.querySelector('#workspace-launcher') as HTMLButtonElement).click())
    expect(host.querySelectorAll('[role="menuitem"]')).toHaveLength(10)
    const employees = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((button) => button.textContent?.includes('員工'))!
    await act(async () => employees.click())
    expect(onOpenModule).toHaveBeenCalledWith('employees')
    await act(async () => (host.querySelector('#workspace-launcher') as HTMLButtonElement).click())
    const risks = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((button) => button.textContent?.includes('兼任風險'))!
    await act(async () => risks.click())
    expect(onOpenModule).toHaveBeenCalledWith('role-risks')
    root.unmount()
    host.remove()
  })

  it('cannot open modules while workspace hydration blocks interaction', async () => {
    const onOpenModule = vi.fn()
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => root.render(<WorkspaceLauncher openPanels={[]} onOpenModule={onOpenModule} disabled />))
    const launcher = host.querySelector('#workspace-launcher') as HTMLButtonElement
    expect(launcher.disabled).toBe(true)
    await act(async () => launcher.click())
    expect(host.querySelector('[role="menu"]')).toBeNull()
    expect(onOpenModule).not.toHaveBeenCalled()
    root.unmount()
  })
})
