/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { MasterDataModuleAdapter } from './MasterDataModuleAdapter'

describe('MasterDataModuleAdapter', () => {
  it('keeps list and selected detail in one panel', async () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => {
      root.render(<MasterDataModuleAdapter moduleId="employees" visibility="active" list={<div>員工清單</div>} detail={<aside>員工明細</aside>} />)
    })
    expect(host.textContent).toContain('員工清單')
    expect(host.textContent).toContain('員工明細')
    expect(host.querySelector('[data-visibility="active"]')).not.toBeNull()
    const workspace = host.querySelector<HTMLElement>('[data-layout="adjacent-list-detail"]')
    expect(workspace).not.toBeNull()
    expect(workspace?.children[0].classList.contains('master-data-workspace__list')).toBe(true)
    expect(workspace?.children[1].classList.contains('master-data-workspace__detail')).toBe(true)
    root.unmount()
  })

  it('uses the full panel for levels without inventing a second detail surface', async () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => {
      root.render(<MasterDataModuleAdapter moduleId="levels" visibility="hidden" list={<div>層級清單</div>} />)
    })
    expect(host.querySelector('.is-detail-less')).not.toBeNull()
    expect(host.querySelector('[data-layout="list-only"]')).not.toBeNull()
    expect(host.querySelector('[data-layout="adjacent-list-detail"]')).toBeNull()
    expect(host.querySelector('.master-data-workspace__detail')).toBeNull()
    root.unmount()
  })
})
