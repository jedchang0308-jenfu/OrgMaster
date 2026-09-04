/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceLauncher } from './WorkspaceLauncher'

describe('WorkspaceLauncher', () => {
  it('renders a persistent navigation list with checkmarks for opened modules', async () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => root.render(<WorkspaceLauncher openPanels={['organization']} onOpenModule={() => undefined} />))
    expect(host.querySelector('aside.workspace-launcher')?.getAttribute('aria-label')).toBe('功能導覽')
    expect(host.querySelectorAll('.workspace-launcher__item')).toHaveLength(10)
    expect(host.querySelector('.workspace-launcher__item.is-opened')?.textContent).toContain('組織架構圖')
    expect(host.querySelectorAll('.workspace-launcher__check svg')).toHaveLength(1)
    root.unmount()
  })

  it('can collapse and expand without changing the navigation list', async () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => root.render(<WorkspaceLauncher openPanels={[]} onOpenModule={() => undefined} />))
    const toggle = host.querySelector('#workspace-launcher-toggle') as HTMLButtonElement
    const menu = host.querySelector('#workspace-launcher-menu') as HTMLElement
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    await act(async () => toggle.click())
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(menu.hidden).toBe(true)
    await act(async () => toggle.click())
    expect(menu.hidden).toBe(false)
    root.unmount()
  })

  it('routes every module through the same open-or-focus handler', async () => {
    const onOpenModule = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => root.render(<WorkspaceLauncher openPanels={['organization']} onOpenModule={onOpenModule} />))
    expect(host.querySelectorAll('.workspace-launcher__item')).toHaveLength(10)
    const employees = [...host.querySelectorAll<HTMLButtonElement>('.workspace-launcher__item')].find((button) => button.textContent?.includes('員工'))!
    await act(async () => employees.click())
    expect(onOpenModule).toHaveBeenCalledWith('employees')
    const risks = [...host.querySelectorAll<HTMLButtonElement>('.workspace-launcher__item')].find((button) => button.textContent?.includes('兼任風險'))!
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
    const launcherItem = host.querySelector('.workspace-launcher__item') as HTMLButtonElement
    expect(launcherItem.disabled).toBe(true)
    await act(async () => launcherItem.click())
    expect(onOpenModule).not.toHaveBeenCalled()
    root.unmount()
  })
})
