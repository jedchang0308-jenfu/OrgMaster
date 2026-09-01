/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceLauncher } from './WorkspaceLauncher'

describe('WorkspaceLauncher', () => {
  it('keeps a stable accessible name when the mobile layout hides visible copy', async () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => root.render(<WorkspaceLauncher openPanels={[]} onOpenDrawer={() => undefined} onOpenPanel={() => undefined} />))
    expect(host.querySelector('#workspace-launcher')?.getAttribute('aria-label')).toBe('功能')
    root.unmount()
  })

  it('shows all ten normal entries and routes drawer/direct modules correctly', async () => {
    const onOpenDrawer = vi.fn()
    const onOpenPanel = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => root.render(<WorkspaceLauncher openPanels={['organization']} onOpenDrawer={onOpenDrawer} onOpenPanel={onOpenPanel} />))
    await act(async () => (host.querySelector('#workspace-launcher') as HTMLButtonElement).click())
    expect(host.querySelectorAll('[role="menuitem"]')).toHaveLength(10)
    const employees = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((button) => button.textContent?.includes('員工'))!
    await act(async () => employees.click())
    expect(onOpenDrawer).toHaveBeenCalledWith('employees')
    await act(async () => (host.querySelector('#workspace-launcher') as HTMLButtonElement).click())
    const risks = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((button) => button.textContent?.includes('兼任風險'))!
    await act(async () => risks.click())
    expect(onOpenPanel).toHaveBeenCalledWith('role-risks')
    root.unmount()
    host.remove()
  })

  it('cannot open modules while workspace hydration blocks interaction', async () => {
    const onOpenDrawer = vi.fn()
    const onOpenPanel = vi.fn()
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => root.render(<WorkspaceLauncher openPanels={[]} onOpenDrawer={onOpenDrawer} onOpenPanel={onOpenPanel} disabled />))
    const launcher = host.querySelector('#workspace-launcher') as HTMLButtonElement
    expect(launcher.disabled).toBe(true)
    await act(async () => launcher.click())
    expect(host.querySelector('[role="menu"]')).toBeNull()
    expect(onOpenDrawer).not.toHaveBeenCalled()
    expect(onOpenPanel).not.toHaveBeenCalled()
    root.unmount()
  })
})
