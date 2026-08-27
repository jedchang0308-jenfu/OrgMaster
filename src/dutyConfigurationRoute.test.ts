import { describe, expect, it } from 'vitest'
import { buildDutyConfigurationUrl, normalizeDutyConfigurationLocation, readDutyConfigurationLocation } from './dutyConfigurationRoute'
import { screenshotOrganizationState } from './screenshotData'

describe('duty configuration route', () => {
  it('reads the root query mode and exact lane', () => {
    expect(readDutyConfigurationLocation({ pathname: '/', search: '?mode=duty-config&attention=1&duty=d1&lane=review&position=p1' })).toEqual({ active: true, attentionOnly: true, dutyId: 'd1', lane: 'review', focusPositionId: 'p1', sourceRelationId: null, legacySurface: null })
  })

  it('maps the removed other-execute URL alias into the execution collaboration lane', () => {
    expect(readDutyConfigurationLocation({ pathname: '/', search: '?mode=duty-config&duty=d1&lane=other-execute' }).lane).toBe('collaborate')
  })

  it('does not activate for legacy planning paths', () => {
    expect(readDutyConfigurationLocation({ pathname: '/duty-planning/matrix', search: '' })).toMatchObject({ active: false, legacySurface: 'matrix' })
  })

  it('builds stable deep links without empty query values', () => {
    expect(buildDutyConfigurationUrl({ dutyId: 'd1', lane: 'primary-execute', focusPositionId: 'p1' })).toBe('/?mode=duty-config&duty=d1&lane=primary-execute&position=p1')
  })

  it('normalizes removed duty and invalid position references', () => {
    const location = readDutyConfigurationLocation({ pathname: '/', search: '?mode=duty-config&duty=gone&lane=review&position=gone' })
    const normalized = normalizeDutyConfigurationLocation(location, screenshotOrganizationState)
    expect(normalized.location.dutyId).toBeNull()
    expect(normalized.location.lane).toBeNull()
    expect(normalized.location.focusPositionId).toBeNull()
    expect(normalized.replaceUrl).toBe('/?mode=duty-config')
  })
})
