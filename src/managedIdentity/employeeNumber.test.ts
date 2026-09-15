import { describe, expect, it } from 'vitest'
import {
  assignEmployeeNumber,
  createEmptyManagedIdentityRegistry,
  deriveManagedUsername,
  parseEmployeeNumber,
  readEmployeeNumber,
} from './employeeNumber'

describe('managed employee number contract', () => {
  it('normalizes the fixed JFS format and derives the provider username', () => {
    expect(parseEmployeeNumber(' jfs0007 ')).toEqual({ ok: true, value: 'JFS0007' })
    expect(deriveManagedUsername('JFS0007')).toBe('jfs0007@jenfu.com.tw')
  })

  it('rejects zero, malformed, and email aliases', () => {
    expect(parseEmployeeNumber('JFS0000').ok).toBe(false)
    expect(parseEmployeeNumber('JFS01').ok).toBe(false)
    expect(parseEmployeeNumber('jfs0001@jenfu.com.tw').ok).toBe(false)
  })

  it('assigns once and permanently retires the previous number', () => {
    const first = assignEmployeeNumber(createEmptyManagedIdentityRegistry(), 'employee-1', 'JFS0001', 'admin', '2026-09-15T00:00:00.000Z')
    const changed = assignEmployeeNumber(first.registry, 'employee-1', 'JFS0002', 'admin', '2026-09-15T01:00:00.000Z')
    expect(readEmployeeNumber(changed.registry, 'employee-1')?.employeeNumber).toBe('JFS0002')
    expect(() => assignEmployeeNumber(changed.registry, 'employee-2', 'JFS0001', 'admin')).toThrow('EMPLOYEE_NUMBER_RETIRED')
  })

  it('rejects cross-employee collision and treats same assignment as a no-op', () => {
    const first = assignEmployeeNumber(createEmptyManagedIdentityRegistry(), 'employee-1', 'JFS0001', 'admin')
    expect(() => assignEmployeeNumber(first.registry, 'employee-2', 'JFS0001', 'admin')).toThrow('EMPLOYEE_NUMBER_CONFLICT')
    const noop = assignEmployeeNumber(first.registry, 'employee-1', 'jfs0001', 'admin')
    expect(noop.status).toBe('noop')
    expect(noop.registry.revision).toBe(first.registry.revision)
  })
})
