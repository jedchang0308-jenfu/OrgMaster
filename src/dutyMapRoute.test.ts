import { describe, expect, it } from 'vitest'
import { readDutyMapView, writeDutyMapView, sanitizeDutyMapView } from './dutyMapRoute'
import { createDutyMapSeed } from './dutyMapSeed'
import { screenshotOrganizationState } from './screenshotData'
import { WORKSPACE_MODULES } from './workspace/moduleRegistry'

describe('duty map route restoration', () => {
  it('round-trips all map view fields through the normal module registry', () => {
    const state = createDutyMapSeed(screenshotOrganizationState)
    const map = state.dutyMap!
    const departmentId = map.groups[0].departmentId
    const groupId = map.groups[0].id
    const params = new URLSearchParams({ dutyView: 'map', dutyDepartment: departmentId, dutyChapter: '04', dutyFlywheel: 'flywheel-customer', dutyMapLevel: 'details', dutyMapChapters: '0', dutyMapNode: 'group:' + groupId })
    params.append('dutyExpanded', groupId)
    const view = sanitizeDutyMapView(readDutyMapView(params), state)
    const written = new URLSearchParams()
    writeDutyMapView(view, written)
    expect(readDutyMapView(written)).toEqual(view)
    expect(view).toMatchObject({ departmentId, level: 'details', showChapters: false, selectedNode: { kind: 'group', id: groupId } })
    expect(WORKSPACE_MODULES.duties.readRouteContext(params, '').view).toBe('map')
  })

  it('drops stale references while keeping valid chapter and display choices', () => {
    const params = new URLSearchParams('dutyDepartment=missing&dutyChapter=04&dutyFlywheel=missing&dutyExpanded=missing&dutyMapNode=duty:missing')
    const value = sanitizeDutyMapView(readDutyMapView(params), screenshotOrganizationState)
    expect(value).toMatchObject({ departmentId: null, chapterId: '04', flywheelId: null, expandedGroupIds: [], selectedNode: null })
  })
})
