import { describe, expect, it } from 'vitest'
import { screenshotOrganizationState } from './screenshotData'
import { executeOrganizationCommand } from './organizationCommands'
import { resolveDutyConfigurationAssignmentCommand, resolveDutyConfigurationCommand, projectDutyConfiguration } from './dutyConfiguration'

function stateWithDuty() {
  return { ...screenshotOrganizationState, duties: [{ id: 'd1', title: '發票審核', description: null }], dutyPositionRelations: [] }
}

describe('duty configuration command resolver', () => {
  it('assigns without turning a second drop into a remove', () => {
    const state = stateWithDuty()
    const positionId = state.positions.find((position) => position.status === 'active')!.id
    const first = resolveDutyConfigurationAssignmentCommand(state, { dutyId: 'd1', positionId, lane: 'review', newRelationId: 'r1' })
    expect(first.status).toBe('command')
    if (first.status !== 'command') return
    const applied = executeOrganizationCommand(state, first.command)
    expect(applied.status).toBe('applied')
    if (applied.status !== 'applied') return
    const second = resolveDutyConfigurationAssignmentCommand(applied.state, { dutyId: 'd1', positionId, lane: 'review', newRelationId: 'r2' })
    expect(second.status).toBe('noop')
  })

  it('does not downgrade primary execute by dropping onto collaboration', () => {
    const state = stateWithDuty()
    const positionId = state.positions.find((position) => position.status === 'active')!.id
    const withPrimary = { ...state, dutyPositionRelations: [{ id: 'r1', dutyId: 'd1', relationType: 'execute' as const, target: { kind: 'position' as const, positionId }, isPrimaryExecutor: true, order: 0 }] }
    expect(resolveDutyConfigurationAssignmentCommand(withPrimary, { dutyId: 'd1', positionId, lane: 'collaborate', newRelationId: 'r2' })).toEqual({ status: 'noop', code: 'DUPLICATE_ASSIGNMENT' })
  })

  it('transfers primary atomically only when the primary lane is explicitly assigned', () => {
    const state = stateWithDuty()
    const [source, target] = state.positions.filter((position) => position.status === 'active')
    const withPrimary = { ...state, dutyPositionRelations: [{ id: 'r1', dutyId: 'd1', relationType: 'execute' as const, target: { kind: 'position' as const, positionId: source.id }, isPrimaryExecutor: true, order: 0 }] }
    const resolved = resolveDutyConfigurationAssignmentCommand(withPrimary, { dutyId: 'd1', positionId: target.id, lane: 'primary-execute', newRelationId: 'r2' })
    expect(resolved.status).toBe('command')
    if (resolved.status !== 'command') return
    expect(resolved.command.type).toBe('TRANSFER_PRIMARY_DUTY_EXECUTOR')
  })

  it('places a primary executor on the selected position', () => {
    const state = stateWithDuty()
    const positionId = state.positions.find((position) => position.status === 'active')!.id
    const resolved = resolveDutyConfigurationCommand(state, { dutyId: 'd1', positionId, lane: 'primary-execute', newRelationId: 'r1' })
    expect(resolved.status).toBe('command')
    if (resolved.status !== 'command') return
    const result = executeOrganizationCommand(state, resolved.command)
    expect(result.status).toBe('applied')
    expect(projectDutyConfiguration(result.status === 'applied' ? result.state : state, positionId, 'd1').laneLabels['primary-execute']).toEqual(['發票審核'])
  })

  it('moves primary to another position atomically when primary lane is clicked', () => {
    const state = stateWithDuty()
    const [source, target] = state.positions.filter((position) => position.status === 'active')
    const withPrimary = { ...state, dutyPositionRelations: [{ id: 'r1', dutyId: 'd1', relationType: 'execute' as const, target: { kind: 'position' as const, positionId: source.id }, isPrimaryExecutor: true, order: 0 }] }
    const resolved = resolveDutyConfigurationCommand(withPrimary, { dutyId: 'd1', positionId: target.id, lane: 'primary-execute', newRelationId: 'r2' })
    expect(resolved.status).toBe('command')
    if (resolved.status !== 'command') return
    expect(resolved.command.type).toBe('TRANSFER_PRIMARY_DUTY_EXECUTOR')
    const result = executeOrganizationCommand(withPrimary, resolved.command)
    expect(result.status).toBe('applied')
    if (result.status !== 'applied') return
    expect(result.state.dutyPositionRelations).toEqual([expect.objectContaining({ target: { kind: 'position', positionId: target.id }, isPrimaryExecutor: true })])
  })

  it('restores a pending collaboration relation into the execution group', () => {
    const state = stateWithDuty()
    const positionId = state.positions.find((position) => position.status === 'active')!.id
    const pending = { ...state, dutyPositionRelations: [{ id: 'pending', dutyId: 'd1', relationType: 'execute' as const, target: { kind: 'pending-reassignment' as const, formerPositionId: 'old', formerPositionTitle: '舊職位', formerDepartmentId: null, formerDepartmentName: null }, isPrimaryExecutor: false, order: 0 }] }
    const resolved = resolveDutyConfigurationCommand(pending, { dutyId: 'd1', positionId, lane: 'collaborate', sourceRelationId: 'pending' })
    expect(resolved.status).toBe('command')
    if (resolved.status !== 'command') return
    expect(resolved.command.type).toBe('UPSERT_DUTY_RELATION')
    if (resolved.command.type === 'UPSERT_DUTY_RELATION') expect(resolved.command.relation).toMatchObject({ relationType: 'execute', isPrimaryExecutor: false })
  })

  it('does not infer a position when the lane is invalid', () => {
    const state = stateWithDuty()
    expect(resolveDutyConfigurationCommand(state, { dutyId: 'missing', positionId: 'missing', lane: 'review' })).toEqual({ status: 'invalid', code: 'DUTY_NOT_FOUND' })
  })
})
