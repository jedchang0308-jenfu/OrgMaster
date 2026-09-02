/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { ManagementMethodModuleAdapter } from './ManagementMethodModuleAdapter'

describe('ManagementMethodModuleAdapter', () => {
  it('projects document mode and lifecycle without owning document state', async () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => root.render(<ManagementMethodModuleAdapter mode="draft" visibility="hidden"><div>文件草稿</div></ManagementMethodModuleAdapter>))
    expect(host.querySelector('[data-mode="draft"][data-visibility="hidden"]')?.textContent).toContain('文件草稿')
    root.unmount()
  })
})
