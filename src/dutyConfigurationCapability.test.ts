import { describe, expect, it, vi } from 'vitest'
import { canMutateDutyConfiguration, observeDutyConfigurationCapability } from './dutyConfigurationCapability'

describe('duty configuration capability', () => {
  const base = { editingEnabled: true, serverReady: true, recoveryOpen: false, mobileReadOnly: false, viewportWidth: 1440, hoverCapable: true, finePointer: true }

  it.each([
    ['desktop editing', base, true],
    ['not editing', { ...base, editingEnabled: false }, false],
    ['server unavailable', { ...base, serverReady: false }, false],
    ['recovery open', { ...base, recoveryOpen: true }, false],
    ['mobile', { ...base, mobileReadOnly: true }, false],
    ['narrow viewport', { ...base, viewportWidth: 1023 }, false],
    ['touch-only', { ...base, hoverCapable: false, finePointer: false }, false],
  ])('%s', (_label, environment, expected) => expect(canMutateDutyConfiguration(environment)).toBe(expected))

  it('announces the current capability and cleans up safely', () => {
    const listener = vi.fn()
    const stop = observeDutyConfigurationCapability(base, listener)
    expect(listener).toHaveBeenCalledWith(true)
    stop()
    expect(() => stop()).not.toThrow()
  })
})
