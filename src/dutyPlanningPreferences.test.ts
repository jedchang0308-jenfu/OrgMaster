import { describe, expect, it } from 'vitest'
import { DUTY_ANOMALY_PANEL_COLLAPSED_KEY, readDutyAnomalyPanelCollapsed, writeDutyAnomalyPanelCollapsed } from './dutyPlanningPreferences'

describe('duty planning preferences', () => {
  it('fails open when the preference is absent or storage throws', () => {
    expect(readDutyAnomalyPanelCollapsed({ getItem: () => null })).toBe(false)
    expect(readDutyAnomalyPanelCollapsed({ getItem: () => { throw new Error('blocked') } })).toBe(false)
  })

  it('round trips only a feature-scoped boolean', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }
    writeDutyAnomalyPanelCollapsed(true, storage)
    expect(values.get(DUTY_ANOMALY_PANEL_COLLAPSED_KEY)).toBe('true')
    expect(readDutyAnomalyPanelCollapsed(storage)).toBe(true)
  })
})
