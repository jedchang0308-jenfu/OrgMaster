import { describe, expect, it, vi } from 'vitest'
import { assertCurrentGovernanceWriteActor } from './orgmasterGovernanceWriteActor'
import type { OrgmasterDatabase } from './orgmasterDatabase'

const actor = { principalId: 'P', employeeId: 'E', issuer: 'issuer', subject: 'subject', bootstrap: false,
  sessionId: '00000000-0000-4000-8000-000000000057', principalAuthEpoch: 3,
  authenticatedAt: '2026-10-05T00:00:00.000Z', assuranceLevel: 'aal1' as const }
const session = { principal_id: 'P', employee_id: 'E', identity_issuer: 'issuer', identity_subject: 'subject',
  session_schema_version: 2, epoch_kind: 'principal', principal_auth_epoch: 3,
  authenticated_at: actor.authenticatedAt, expires_at: '2099-01-01T00:00:00.000Z', assurance_level: 'aal1', current_session: true }
const principal = { contract_version: 'orgmaster.session-principal.v2', principal_issuer: 'issuer',
  principal_subject: 'subject', principal_id: 'P', employee_id: 'E', employee_status: 'active',
  mapping_version: 1, published_at: actor.authenticatedAt }
function database(rows = [[session], [principal], [{ principal_id: 'P', auth_epoch: 3, revoked_before: null }]]) {
  const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: rows.shift() ?? [] }))
  return { query, db: { query } as unknown as Pick<OrgmasterDatabase, 'query'> }
}

describe('governance native write actor recheck', () => {
  it('binds the exact session row and uses only own identity plus the existing epoch contract', async () => {
    const { query, db } = database()
    await assertCurrentGovernanceWriteActor(db, actor, true)
    expect(query.mock.calls[0][0]).toContain('FOR SHARE')
    expect(query.mock.calls[0][1]).toEqual([actor.sessionId])
    expect(query.mock.calls[1][0]).toContain('v_orgmaster_session_principals_v2')
    expect(query.mock.calls[2][0]).toContain('platform_contract.read_principal_auth_state_v3')
  })
  it.each([
    { sessionId: undefined }, { sessionId: 'not-uuid' }, { principalId: '' }, { employeeId: null },
    { principalAuthEpoch: null }, { principalAuthEpoch: -1 }, { authenticatedAt: null }, { bootstrap: true },
  ])('rejects an untrusted actor before issuing any query (%j)', async mutation => {
    const { query, db } = database()
    await expect(assertCurrentGovernanceWriteActor(db, { ...actor, ...mutation }, true)).rejects.toMatchObject({ code: 'IDENTITY_CONTEXT_REQUIRED' })
    expect(query).not.toHaveBeenCalled()
  })
  it.each([
    { current_session: false }, { expires_at: '2026-01-01T00:00:00.000Z' }, { session_schema_version: 1 }, { epoch_kind: 'provider_pair' },
    { principal_auth_epoch: 2 }, { employee_id: 'other' }, { principal_id: 'other' },
    { identity_issuer: 'other' }, { identity_subject: 'other' }, { assurance_level: 'aal2' },
    { authenticated_at: '2026-10-04T00:00:00.000Z' },
  ])('rejects withdrawn or mismatched persisted session (%j)', async mutation => {
    const { db } = database([[{ ...session, ...mutation }]])
    await expect(assertCurrentGovernanceWriteActor(db, actor, true)).rejects.toMatchObject({ code: 'IDENTITY_CONTEXT_REQUIRED' })
  })
  it('rejects a current native mapping that resolves to another canonical Principal', async () => {
    const { db } = database([[session], [{ ...principal, principal_id: 'other' }]])
    await expect(assertCurrentGovernanceWriteActor(db, actor, true)).rejects.toMatchObject({ code: 'IDENTITY_CONTEXT_REQUIRED' })
  })
  it('rejects a withdrawn native mapping, even with an unchanged session', async () => {
    const { db } = database([[session], []])
    await expect(assertCurrentGovernanceWriteActor(db, actor, true)).rejects.toMatchObject({ code: 'IDENTITY_CONTEXT_REQUIRED' })
  })
  it('fails closed on ambiguous mappings or contract faults', async () => {
    for (const rows of [[principal, principal], [{ ...principal, contract_version: 'wrong' }]]) {
      const { db } = database([[session], rows])
      await expect(assertCurrentGovernanceWriteActor(db, actor, true)).rejects.toMatchObject({ code: 'IDENTITY_AUTHORITY_UNAVAILABLE' })
    }
  })
  it.each([{ auth_epoch: 4, revoked_before: null }, { auth_epoch: 3, revoked_before: actor.authenticatedAt }])(
    'rejects a principal epoch or revoked-before withdrawal (%j)', async mutation => {
      const { db } = database([[session], [principal], [{ principal_id: 'P', ...mutation }]])
      await expect(assertCurrentGovernanceWriteActor(db, actor, true)).rejects.toMatchObject({ code: 'IDENTITY_CONTEXT_REQUIRED' })
    })
  it('fails closed on a missing or unavailable epoch authority', async () => {
    const { db } = database([[session], [principal], []])
    await expect(assertCurrentGovernanceWriteActor(db, actor, true)).rejects.toMatchObject({ code: 'IDENTITY_AUTHORITY_UNAVAILABLE' })
    await expect(assertCurrentGovernanceWriteActor({ query: vi.fn().mockRejectedValue(new Error('offline')) } as unknown as Pick<OrgmasterDatabase, 'query'>, actor, true)).rejects.toMatchObject({ code: 'IDENTITY_AUTHORITY_UNAVAILABLE' })
  })
})
