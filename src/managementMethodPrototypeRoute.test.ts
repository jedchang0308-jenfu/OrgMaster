import { describe, expect, it } from 'vitest'
import {
  MANAGEMENT_METHOD_PROTOTYPE_PATH,
  buildManagementMethodPrototypeUrl,
  buildPrototypeResponsibilityUrl,
  readManagementMethodPrototypeLocation,
} from './managementMethodPrototypeRoute'

describe('DEV-032 management method prototype route', () => {
  it('builds the single editor page with an optional step return context', () => {
    expect(buildManagementMethodPrototypeUrl()).toBe(MANAGEMENT_METHOD_PROTOTYPE_PATH)
    expect(buildManagementMethodPrototypeUrl('step-interview')).toBe('/management-methods?step=step-interview')
  })

  it('round-trips the organization responsibility context', () => {
    const url = buildPrototypeResponsibilityUrl({
      methodId: 'method-personnel-requisition',
      stageId: 'stage-interview',
      stepId: 'step-interview',
      workItemId: 'work-interview',
      relationType: 'review',
    })
    const [pathname, search = ''] = url.split('?')
    expect(readManagementMethodPrototypeLocation({ pathname, search: `?${search}` }).responsibilityContext).toEqual({
      methodId: 'method-personnel-requisition',
      stageId: 'stage-interview',
      stepId: 'step-interview',
      workItemId: 'work-interview',
      relationType: 'review',
    })
  })

  it('rejects incomplete or unsupported responsibility deep links', () => {
    expect(readManagementMethodPrototypeLocation({ pathname: '/', search: '?mode=responsibility&relation=owner' }).responsibilityContext).toBeNull()
  })
})
