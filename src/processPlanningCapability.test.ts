import { describe, expect, it } from 'vitest'
import { canMutateProcessPlanning } from './processPlanningCapability'

describe('process planning capability gate', () => {
  const base = { editingEnabled: true, serverReady: true, recoveryOpen: false, mobileReadOnly: false, viewportWidth: 1280, hoverCapable: true, finePointer: true }
  it('allows desktop draft editing only when all gates pass', () => expect(canMutateProcessPlanning(base)).toBe(true))
  it('keeps mobile, read-only and touch contexts safe', () => {
    expect(canMutateProcessPlanning({ ...base, mobileReadOnly: true })).toBe(false)
    expect(canMutateProcessPlanning({ ...base, editingEnabled: false })).toBe(false)
    expect(canMutateProcessPlanning({ ...base, finePointer: false })).toBe(false)
  })
})
