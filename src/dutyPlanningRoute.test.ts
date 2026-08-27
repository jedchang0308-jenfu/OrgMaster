import { describe, expect, it } from 'vitest'
import { buildDutyPlanningUrl, DUTY_ANOMALIES_PATH, DUTY_MATRIX_PATH, DUTY_PLANNING_PATH, readDutyPlanningLocation } from './dutyPlanningRoute'

describe('duty planning route', () => {
  it('builds canonical shareable URLs for the two views', () => {
    expect(buildDutyPlanningUrl()).toBe(`${DUTY_PLANNING_PATH}?view=audit`)
    expect(buildDutyPlanningUrl({ view: 'distribution' })).toBe(`${DUTY_PLANNING_PATH}?view=distribution`)
    expect(buildDutyPlanningUrl({ view: 'audit', query: ' 生產 ', anomalyTypes: ['pending-reassignment', 'no-executor', 'no-executor'] })).toBe(`${DUTY_PLANNING_PATH}?view=audit&q=${encodeURIComponent('生產')}&status=no-executor%2Cpending-reassignment`)
    expect(buildDutyPlanningUrl({ surface: 'matrix' })).toBe(`${DUTY_PLANNING_PATH}?view=distribution`)
    expect(buildDutyPlanningUrl({ surface: 'anomalies' })).toBe(`${DUTY_PLANNING_PATH}?view=audit`)
  })

  it('reads canonical and legacy URLs with safe defaults', () => {
    expect(readDutyPlanningLocation({ pathname: DUTY_PLANNING_PATH, search: '' })).toEqual({ isDutyPlanningPage: true, view: 'audit', query: '', anomalyTypes: [] })
    expect(readDutyPlanningLocation({ pathname: DUTY_PLANNING_PATH, search: '?view=distribution&q=%E7%94%9F%E7%94%A2&status=no-executor' })).toEqual({ isDutyPlanningPage: true, view: 'distribution', query: '生產', anomalyTypes: [] })
    expect(readDutyPlanningLocation({ pathname: DUTY_PLANNING_PATH, search: '?view=audit&q=%20%E7%94%9F%E7%94%A2%20&status=pending-reassignment,no-executor,unknown,pending-reassignment' })).toEqual({ isDutyPlanningPage: true, view: 'audit', query: '生產', anomalyTypes: ['no-executor', 'pending-reassignment'] })
    expect(readDutyPlanningLocation({ pathname: DUTY_ANOMALIES_PATH, search: '?status=unknown&status=no-executor' })).toEqual({ isDutyPlanningPage: true, view: 'audit', query: '', anomalyTypes: ['no-executor'] })
    expect(readDutyPlanningLocation({ pathname: DUTY_MATRIX_PATH, search: '' })).toEqual({ isDutyPlanningPage: true, view: 'distribution', query: '', anomalyTypes: [] })
    expect(readDutyPlanningLocation({ pathname: DUTY_ANOMALIES_PATH, search: '' })).toEqual({ isDutyPlanningPage: true, view: 'audit', query: '', anomalyTypes: [] })
    expect(readDutyPlanningLocation({ pathname: DUTY_PLANNING_PATH, search: '?view=invalid&status=missing-primary-executor' })).toEqual({ isDutyPlanningPage: true, view: 'audit', query: '', anomalyTypes: ['missing-primary-executor'] })
    expect(readDutyPlanningLocation({ pathname: '/duty-planning/unknown', search: '' })).toEqual({ isDutyPlanningPage: false, view: null, query: '', anomalyTypes: [] })
  })
})
