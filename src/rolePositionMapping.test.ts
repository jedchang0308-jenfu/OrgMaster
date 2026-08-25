import { describe, expect, it } from 'vitest'
import { resolvePositionRole } from './rolePositionMapping'

describe('position to Role mapping', () => {
  it('reuses an existing Role by normalized position title', () => {
    const result = resolvePositionRole([{ id: 'role-design', name: '設計專員' }], ' 設計專員 ', () => 'unused')
    expect(result).toEqual({ roleId: 'role-design' })
  })

  it('creates a new Role when the position title has no Role yet', () => {
    const result = resolvePositionRole([], '行政總務', () => 'role-admin')
    expect(result).toEqual({ roleId: 'role-admin', role: { id: 'role-admin', name: '行政總務' } })
  })

  it('normalizes an empty title into a safe Role name', () => {
    const result = resolvePositionRole([], '   ', () => 'role-unnamed')
    expect(result).toEqual({ roleId: 'role-unnamed', role: { id: 'role-unnamed', name: '未命名職位' } })
  })
})
