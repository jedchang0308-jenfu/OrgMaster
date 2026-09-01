import { describe, expect, it } from 'vitest'
import { createOrgDocumentFile } from '../src/documentStorage'
import { screenshotOrganizationState } from '../src/screenshotData'
// @ts-expect-error The fixture CLI is intentionally plain ESM so it can run without the app bundle.
import { buildDev039S7Fixture, FIXTURE_IDS, inspectDev039S7Fixture } from './dev039-s7-fixture.mjs'

function draft() {
  return createOrgDocumentFile(screenshotOrganizationState, 'draft', '2026-08-31T00:00:00.000Z')
}

describe('DEV-039 S7 B16 fixture transformer', () => {
  it('is deterministic and idempotent for the same V7 draft', () => {
    const first = buildDev039S7Fixture(draft())
    const second = buildDev039S7Fixture(draft())
    expect(second).toEqual(first)
    expect(buildDev039S7Fixture(first.document)).toEqual(first)
    expect(inspectDev039S7Fixture(first.document)).toBe(true)
  })

  it('fails closed on stable-ID collisions and leaves the input unchanged', () => {
    const input = draft()
    input.state.roles.push({ id: FIXTURE_IDS.role, name: '不相容角色' })
    const before = JSON.stringify(input)
    expect(() => buildDev039S7Fixture(input)).toThrow('FIXTURE_ID_COLLISION_ROLE')
    expect(JSON.stringify(input)).toBe(before)
  })

  it('rejects non-V7 or non-draft documents before adding fixture data', () => {
    expect(() => buildDev039S7Fixture({ ...draft(), version: 6 })).toThrow('FIXTURE_DOCUMENT_INVALID_V7')
    expect(() => buildDev039S7Fixture({ ...draft(), kind: 'document' })).toThrow('FIXTURE_DOCUMENT_INVALID_V7')
  })

  it('keeps hierarchy, primary pointers and before-relations valid', () => {
    const result = buildDev039S7Fixture(draft())
    const state = result.document.state
    const source = state.positions.find((position) => position.id === FIXTURE_IDS.positionSource)
    const child = state.positions.find((position) => position.id === FIXTURE_IDS.positionEmpty)
    const single = state.employees.find((employee) => employee.id === FIXTURE_IDS.employeeSingle)
    expect(source?.parentPositionId).toBeNull()
    expect(child?.parentPositionId).toBe(FIXTURE_IDS.positionSource)
    expect(single?.primaryAssignmentId).toBe('assignment-dev039-b16-single-source')
    expect(state.dutyPositionRelations.find((relation) => relation.id === FIXTURE_IDS.dutyRelation)?.isPrimaryExecutor).toBe(true)
    expect(state.processNodeDutyLinks.find((link) => link.id === FIXTURE_IDS.processLink)?.dutyId).toBe(FIXTURE_IDS.dutyPrimary)
    expect(result.beforeRelationIds).toEqual({ dutyRelationId: FIXTURE_IDS.dutyRelation, processLinkId: FIXTURE_IDS.processLink })
  })
})
