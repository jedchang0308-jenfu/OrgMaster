/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { ProcessModuleAdapter } from './ProcessModuleAdapter'

describe('ProcessModuleAdapter', () => {
  it('passes lifecycle visibility without creating another domain owner', async () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => { root.render(<ProcessModuleAdapter visibility="active"><div>流程圖</div></ProcessModuleAdapter>) })
    expect(host.querySelector('[data-visibility="active"]')?.textContent).toContain('流程圖')
    root.unmount()
  })
})
