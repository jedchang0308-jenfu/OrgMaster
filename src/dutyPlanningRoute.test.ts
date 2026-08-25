import { describe, expect, it } from 'vitest'
import { buildDutyPlanningUrl, DUTY_ANOMALIES_PATH, DUTY_MATRIX_PATH, DUTY_PLANNING_PATH, readDutyPlanningLocation } from './dutyPlanningRoute'

describe('duty planning route', () => {
  it('builds a shareable page URL with an optional position focus', () => {
    expect(buildDutyPlanningUrl()).toBe(DUTY_PLANNING_PATH)
    expect(buildDutyPlanningUrl({ surface: 'matrix' })).toBe(DUTY_MATRIX_PATH)
    expect(buildDutyPlanningUrl({ surface: 'anomalies', focusPositionId: 'position-production-manager' })).toBe(`${DUTY_ANOMALIES_PATH}?position=position-production-manager`)
  })

  it('reads direct and focused page URLs', () => {
    expect(readDutyPlanningLocation({ pathname: '/duty-planning', search: '' })).toEqual({ isDutyPlanningPage: true, surface: 'workbench', focusPositionId: null })
    expect(readDutyPlanningLocation({ pathname: '/duty-planning', search: '?position=position-production-manager' })).toEqual({ isDutyPlanningPage: true, surface: 'workbench', focusPositionId: 'position-production-manager' })
    expect(readDutyPlanningLocation({ pathname: '/duty-planning/matrix', search: '' })).toEqual({ isDutyPlanningPage: true, surface: 'matrix', focusPositionId: null })
    expect(readDutyPlanningLocation({ pathname: '/duty-planning/anomalies', search: '' })).toEqual({ isDutyPlanningPage: true, surface: 'anomalies', focusPositionId: null })
    expect(readDutyPlanningLocation({ pathname: '/duty-planning/unknown', search: '' })).toEqual({ isDutyPlanningPage: false, surface: null, focusPositionId: null })
    expect(readDutyPlanningLocation({ pathname: '/', search: '' })).toEqual({ isDutyPlanningPage: false, surface: null, focusPositionId: null })
  })
})
