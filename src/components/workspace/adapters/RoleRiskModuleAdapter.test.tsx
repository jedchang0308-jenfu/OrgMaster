/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { RoleRiskModuleAdapter } from './RoleRiskModuleAdapter'

describe('RoleRiskModuleAdapter', () => {
  it('passes workspace visibility to the canonical risk surface', async () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => root.render(<RoleRiskModuleAdapter visibility="active"><div>風險規則</div></RoleRiskModuleAdapter>))
    expect(host.querySelector('[data-visibility="active"]')?.textContent).toContain('風險規則')
    root.unmount()
  })
})
