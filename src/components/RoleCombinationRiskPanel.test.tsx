// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RoleCombinationRiskPanel } from './RoleCombinationRiskPanel'
import type { Role, RoleCombinationRiskRule } from '../types'

const roles: Role[] = [
  { id: 'role-a', name: '角色 A' },
  { id: 'role-b', name: '角色 B' },
]

const rules: RoleCombinationRiskRule[] = [{
  id: 'rule-1',
  roleAId: 'role-a',
  roleBId: 'role-b',
  level: 'medium',
  reason: '測試',
  enabled: true,
}]

afterEach(() => {
  document.body.innerHTML = ''
})

describe('RoleCombinationRiskPanel readonly capability', () => {
  it('keeps risk information visible but removes mutation controls', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)

    await act(async () => root.render(
      <RoleCombinationRiskPanel
        roles={roles}
        rules={rules}
        onUpsert={vi.fn()}
        onSetEnabled={vi.fn()}
        onDelete={vi.fn()}
        editingEnabled={false}
      />,
    ))

    expect(host.textContent).toContain('角色 A')
    expect(host.querySelector('button[aria-label="編輯規則"]')).toBeNull()
    expect(host.querySelector('button[aria-label="刪除規則"]')).toBeNull()
    expect([...host.querySelectorAll('button')].some((button) => button.textContent?.includes('新增規則'))).toBe(false)
    expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.disabled).toBe(true)

    await act(async () => root.unmount())
  })
})
