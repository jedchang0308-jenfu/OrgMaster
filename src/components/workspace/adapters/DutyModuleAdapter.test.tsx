/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { DutyModuleAdapter } from './DutyModuleAdapter'

describe('DutyModuleAdapter', () => {
  it('keeps the duty list and its detail adjacent inside the duty panel', async () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => {
      root.render(<DutyModuleAdapter mode="configuration" visibility="active" detail={<aside aria-label="工作執掌明細">職掌明細</aside>}><div>職掌清單</div></DutyModuleAdapter>)
    })
    const workspace = host.querySelector<HTMLElement>('[data-layout="adjacent-list-detail"]')
    expect(workspace).not.toBeNull()
    expect(workspace?.children[0].classList.contains('duty-configuration-workspace__list')).toBe(true)
    expect(workspace?.children[1].classList.contains('duty-configuration-workspace__detail')).toBe(true)
    expect(workspace?.children[1].firstElementChild?.getAttribute('aria-label')).toBe('工作執掌明細')
    expect(host.querySelector('.duty-configuration-workspace__detail-content')).toBeNull()
    expect(host.querySelector('[aria-label="工作職掌明細"]')?.closest('[aria-label="工作職掌完整工作台"]')).not.toBeNull()
    root.unmount()
  })

  it('uses the full duty panel when no detail is selected', async () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => {
      root.render(<DutyModuleAdapter mode="configuration" visibility="active"><div>職掌清單</div></DutyModuleAdapter>)
    })
    expect(host.querySelector('[data-layout="list-only"]')).not.toBeNull()
    expect(host.querySelector('.duty-configuration-workspace__detail')).toBeNull()
    root.unmount()
  })

  it('preserves the selected duty view as adapter metadata', async () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => { root.render(<DutyModuleAdapter mode="audit" visibility="hidden"><div>責任盤點</div></DutyModuleAdapter>) })
    expect(host.querySelector('[data-mode="audit"][data-visibility="hidden"]')).not.toBeNull()
    root.unmount()
  })
})
