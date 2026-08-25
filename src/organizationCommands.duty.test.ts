import { describe, expect, it } from 'vitest'
import { screenshotOrganizationState } from './screenshotData'
import { executeOrganizationCommand } from './organizationCommands'
import { deriveDutyAnomalies } from './duties'

function baseState() {
  return {
    ...screenshotOrganizationState,
    duties: [{ id: 'duty-invoice', title: '發票審核', description: '確認發票與付款資料' }],
    dutyPositionRelations: [],
  }
}

describe('duty organization commands', () => {
  it('creates an explicit duty relation without inferring the supervisor', () => {
    const state = baseState()
    const source = state.positions.find((position) => position.status === 'active')!
    const result = executeOrganizationCommand(state, {
      type: 'UPSERT_DUTY_RELATION',
      relation: { id: 'rel-invoice', dutyId: 'duty-invoice', relationType: 'execute', target: { kind: 'position', positionId: source.id }, isPrimaryExecutor: true, order: 0 },
    })
    expect(result.status).toBe('applied')
    if (result.status !== 'applied') return
    expect(result.state.dutyPositionRelations[0].target).toEqual({ kind: 'position', positionId: source.id })
    expect(deriveDutyAnomalies(result.state)).toEqual([])
  })

  it('transfers only the primary execute relation', () => {
    const state = baseState()
    const [source, target] = state.positions.filter((position) => position.status === 'active')
    const withRelations = { ...state, dutyPositionRelations: [
      { id: 'rel-primary', dutyId: 'duty-invoice', relationType: 'execute' as const, target: { kind: 'position' as const, positionId: source.id }, isPrimaryExecutor: true, order: 0 },
      { id: 'rel-review', dutyId: 'duty-invoice', relationType: 'review' as const, target: { kind: 'position' as const, positionId: target.id }, isPrimaryExecutor: false, order: 0 },
    ] }
    const result = executeOrganizationCommand(withRelations, { type: 'TRANSFER_PRIMARY_DUTY_EXECUTOR', dutyId: 'duty-invoice', sourceRelationId: 'rel-primary', targetPositionId: target.id, targetRelationId: 'rel-target' })
    expect(result.status).toBe('applied')
    if (result.status !== 'applied') return
    expect(result.state.dutyPositionRelations.find((relation) => relation.id === 'rel-primary')).toBeUndefined()
    expect(result.state.dutyPositionRelations.find((relation) => relation.id === 'rel-target')?.isPrimaryExecutor).toBe(true)
    expect(result.state.dutyPositionRelations.find((relation) => relation.id === 'rel-review')?.relationType).toBe('review')
  })

  it('keeps relations as pending reassignment when a position is deleted', () => {
    const state = baseState()
    const source = state.positions.find((position) => position.status === 'active')!
    const withRelation = { ...state, dutyPositionRelations: [{ id: 'rel-pending', dutyId: 'duty-invoice', relationType: 'execute' as const, target: { kind: 'position' as const, positionId: source.id }, isPrimaryExecutor: true, order: 0 }] }
    const result = executeOrganizationCommand(withRelation, { type: 'DELETE_POSITION', positionId: source.id, mode: 'branch', asOf: '2026-08-18' })
    expect(result.status).toBe('applied')
    if (result.status !== 'applied') return
    expect(result.state.dutyPositionRelations[0].target).toMatchObject({ kind: 'pending-reassignment', formerPositionId: source.id, formerPositionTitle: source.title })
    expect(deriveDutyAnomalies(result.state).some((anomaly) => anomaly.type === 'pending-reassignment')).toBe(true)
  })

  it('commits one planning interaction directly to the organization state', () => {
    const state = baseState()
    const [source, target] = state.positions.filter((position) => position.status === 'active')
    const withRelation = {
      ...state,
      dutyPositionRelations: [{
        id: 'rel-direct',
        dutyId: 'duty-invoice',
        relationType: 'execute' as const,
        target: { kind: 'position' as const, positionId: source.id },
        isPrimaryExecutor: false,
        order: 0,
      }],
    }

    const result = executeOrganizationCommand(withRelation, {
      type: 'COMMIT_DUTY_PLANNING_CHANGE',
      intent: {
        planItemId: 'plan-direct',
        kind: 'place-relation',
        dutyId: 'duty-invoice',
        sourceRelationId: 'rel-direct',
        sourcePositionId: source.id,
        relationType: 'execute',
        sourceIsPrimaryExecutor: false,
        resolution: { mode: 'move', targetPositionId: target.id, newRelationId: null },
      },
    })

    expect(result.status).toBe('applied')
    if (result.status !== 'applied') return
    expect(result.state.dutyPositionRelations).toHaveLength(1)
    expect(result.state.dutyPositionRelations[0].target).toEqual({ kind: 'position', positionId: target.id })
    expect(withRelation.dutyPositionRelations[0].target).toEqual({ kind: 'position', positionId: source.id })
  })
})
