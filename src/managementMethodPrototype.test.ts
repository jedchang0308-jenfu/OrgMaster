import { describe, expect, it } from 'vitest'
import {
  findPrototypeStep,
  getPrototypeStepNumber,
  initialManagementMethodPrototype,
  togglePrototypeResponsibility,
} from './managementMethodPrototype'

describe('DEV-032 management method prototype model', () => {
  it('keeps stages as context while numbering steps across the method', () => {
    expect(getPrototypeStepNumber(initialManagementMethodPrototype, 'step-demand-submit')).toBe('01')
    expect(getPrototypeStepNumber(initialManagementMethodPrototype, 'step-interview')).toBe('05')
    expect(findPrototypeStep(initialManagementMethodPrototype, 'step-interview')?.stage.title).toBe('面試')
  })

  it('allows the same work item to be referenced by more than one atomic step', () => {
    const references = initialManagementMethodPrototype.method.stages
      .flatMap((stage) => stage.steps)
      .filter((step) => step.workItemId === 'work-demand-confirmation')
    expect(references.map((step) => step.id)).toEqual(['step-demand-submit', 'step-demand-check'])
  })

  it('replaces the primary executor while other responsibility types remain', () => {
    const changed = togglePrototypeResponsibility(initialManagementMethodPrototype, {
      workItemId: 'work-demand-confirmation',
      positionId: 'position-hr-specialist',
      relationType: 'primary-execute',
    })
    const matches = changed.assignments.filter((assignment) => assignment.workItemId === 'work-demand-confirmation')
    expect(matches.filter((assignment) => assignment.relationType === 'primary-execute')).toEqual([
      expect.objectContaining({ positionId: 'position-hr-specialist' }),
    ])
    expect(matches).toContainEqual(expect.objectContaining({ positionId: 'position-general-manager', relationType: 'review' }))
  })

  it('toggles a selected relation without mutating the source fixture', () => {
    const changed = togglePrototypeResponsibility(initialManagementMethodPrototype, {
      workItemId: 'work-probation',
      positionId: 'position-management-manager',
      relationType: 'collaborate',
    })
    expect(changed.assignments).toHaveLength(initialManagementMethodPrototype.assignments.length + 1)
    expect(initialManagementMethodPrototype.assignments.some((assignment) => assignment.id.includes('work-probation-position-management-manager'))).toBe(false)
  })
})
