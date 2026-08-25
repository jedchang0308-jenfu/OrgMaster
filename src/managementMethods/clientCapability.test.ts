import { describe, expect, it } from 'vitest'
import { canMutateManagementMethods } from './clientCapability'

describe('management method device boundary', () => {
  const environment = (matches: Record<string, boolean>) => ({ matchMedia: (query: string) => ({ matches: Boolean(matches[query]), addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList })
  it('requires desktop width, hover and fine pointer together', () => {
    expect(canMutateManagementMethods(environment({ '(min-width: 1024px)': true, '(hover: hover)': true, '(pointer: fine)': true }))).toBe(true)
    expect(canMutateManagementMethods(environment({ '(min-width: 1024px)': true, '(hover: hover)': true, '(pointer: fine)': false }))).toBe(false)
  })
})
