import { describe, expect, it } from 'vitest'
import {
  DUTY_ANOMALY_LONG_PRESS_MS,
  DUTY_ANOMALY_PRESS_MOVE_TOLERANCE_PX,
  activateDutyAnomalyLongPress,
  canActivateDutyAnomalyLongPress,
  cancelDutyAnomalyPress,
  createDutyAnomalyPressState,
  resetDutyAnomalyPress,
  startDutyAnomalyPress,
  updateDutyAnomalyPress,
} from './dutyAnomalyPressInteraction'

const origin = { x: 100, y: 100 }

describe('duty anomaly press interaction', () => {
  it('activates at exactly 450ms and remains within the six pixel tolerance', () => {
    const state = startDutyAnomalyPress('anomaly-a', 1, origin, 1000)
    expect(canActivateDutyAnomalyLongPress(state, 1000 + DUTY_ANOMALY_LONG_PRESS_MS - 1)).toBe(false)
    expect(canActivateDutyAnomalyLongPress(state, 1000 + DUTY_ANOMALY_LONG_PRESS_MS)).toBe(true)
    expect(canActivateDutyAnomalyLongPress(updateDutyAnomalyPress(state, 1, { x: 106, y: 100 }), 1450)).toBe(true)
    expect(activateDutyAnomalyLongPress(state, 1450).phase).toBe('picked-up')
  })

  it('cancels before activation when movement exceeds the tolerance', () => {
    const state = startDutyAnomalyPress('anomaly-a', 1, origin, 1000)
    expect(updateDutyAnomalyPress(state, 1, { x: 106.01, y: 100 }).phase).toBe('cancelled')
    expect(canActivateDutyAnomalyLongPress(updateDutyAnomalyPress(state, 1, { x: 106.01, y: 100 }), 1450)).toBe(false)
  })

  it('does not update or release for a different pointer', () => {
    const state = startDutyAnomalyPress('anomaly-a', 1, origin, 1000)
    expect(updateDutyAnomalyPress(state, 2, { x: 200, y: 200 })).toBe(state)
    expect(cancelDutyAnomalyPress(state, 2)).toBe(state)
  })

  it('updates latest point after pickup and cancels cleanly', () => {
    const picked = activateDutyAnomalyLongPress(startDutyAnomalyPress('anomaly-a', 1, origin, 1000), 1450)
    const moved = updateDutyAnomalyPress(picked, 1, { x: 260, y: 320 })
    expect(moved).toMatchObject({ phase: 'picked-up', latest: { x: 260, y: 320 } })
    expect(cancelDutyAnomalyPress(moved)).toMatchObject({ phase: 'cancelled', anomalyId: 'anomaly-a', pointerId: 1 })
    expect(resetDutyAnomalyPress()).toEqual(createDutyAnomalyPressState())
  })

  it('keeps the exact six pixel boundary valid', () => {
    expect(DUTY_ANOMALY_PRESS_MOVE_TOLERANCE_PX).toBe(6)
    const state = startDutyAnomalyPress('anomaly-a', 1, origin, 0)
    expect(updateDutyAnomalyPress(state, 1, { x: 100, y: 106 }).phase).toBe('pressing')
  })
})
