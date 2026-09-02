/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { GovernanceModuleAdapter } from './GovernanceModuleAdapter'

describe('GovernanceModuleAdapter', () => {
  it('passes hidden lifecycle to the canonical governance surface', async () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => root.render(<GovernanceModuleAdapter visibility="hidden"><div>治理資料</div></GovernanceModuleAdapter>))
    expect(host.querySelector('[data-visibility="hidden"]')?.textContent).toContain('治理資料')
    root.unmount()
  })
})
