/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { WORKSPACE_MODULE_ORDER } from '../../workspace/moduleRegistry'
import { WORKSPACE_MODULE_ADAPTERS, renderWorkspacePanel } from './WorkspaceModuleSurfaces'

describe('WorkspaceModuleSurfaces', () => {
  it('owns one typed adapter entry for every module and invokes only the requested renderer', async () => {
    expect(Object.keys(WORKSPACE_MODULE_ADAPTERS)).toEqual(WORKSPACE_MODULE_ORDER)
    let calls = 0
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => root.render(<>{renderWorkspacePanel('organization', 'active', { organization: () => { calls += 1; return <span>組織內容</span> } })}</>))
    expect(calls).toBe(1)
    expect(host.textContent).toContain('組織內容')
    root.unmount()
  })
})
