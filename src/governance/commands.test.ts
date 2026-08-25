import { describe, expect, it } from 'vitest'
import { applyGovernanceCommand, commandHash } from './commands'
import { createSeedDocument } from '../../server/orgmasterGovernanceStore'
describe('governance draft commands', () => {
  it('applies an upsert and produces deterministic command hash', () => {
    const document = createSeedDocument('2026-01-01T00:00:00.000Z')
    const command = { type: 'UPSERT_APPLICATION_ROLE' as const, commandId: 'cmd-1', reason: 'test', value: { id: 'role-test', applicationId: 'orgmaster' as const, code: 'test_role', name: 'Test', status: 'active' as const, systemDefined: false } }
    const result = applyGovernanceCommand(document, command)
    expect(result.status).toBe('applied')
    expect(result.document.draft.applicationRoles.some((role) => role.id === 'role-test')).toBe(true)
    expect(commandHash(command)).toBe(commandHash({ ...command }))
  })
  it('returns noop for an unchanged status command', () => {
    const document = createSeedDocument()
    const result = applyGovernanceCommand(document, { type: 'SET_APPLICATION_ROLE_STATUS', commandId: 'cmd-2', reason: 'test', id: 'role-orgmaster-admin', status: 'active' })
    expect(result.status).toBe('noop')
  })
})
