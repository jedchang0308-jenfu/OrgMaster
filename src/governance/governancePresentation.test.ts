import { describe, expect, it, vi } from 'vitest'
import { createSeedDocument } from '../../server/orgmasterGovernanceStore'
import { describeGovernanceFailure, formatGovernanceDateTime, governancePublishBlockers, sameGlobalRoleAssignment } from './governancePresentation'

function readyDraft() {
  const draft = createSeedDocument('2026-08-26T00:00:00.000Z').draft
  draft.identityLinks.push({ id: 'identity-1', principalId: 'principal-1', issuer: 'issuer-1', subject: 'subject-1', employeeId: 'employee-1', status: 'active', validFrom: '2026-08-25T00:00:00.000Z', validTo: null })
  draft.roleAssignments.push({ id: 'assignment-1', employeeId: 'employee-1', roleId: 'role-orgmaster-admin', scope: { kind: 'global' }, status: 'active', validFrom: '2026-08-25T00:00:00.000Z', validTo: null })
  return draft as any
}

describe('governance presentation', () => {
  it('renders publication timestamps in Taipei even across a UTC date boundary and tolerates missing dates', () => {
    expect(formatGovernanceDateTime('2026-10-04T23:06:30.062Z')).toBe('2026/10/05 07:06')
    expect(formatGovernanceDateTime('invalid')).toBe('時間未記錄')
  })
  it('uses an ASCII space regardless of Intl date-time literals', () => {
    const formatToParts = vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts').mockReturnValue([
      { type: 'month', value: '10' },
      { type: 'literal', value: '/' },
      { type: 'day', value: '05' },
      { type: 'literal', value: '/' },
      { type: 'year', value: '2026' },
      { type: 'literal', value: ' at ' },
      { type: 'hour', value: '07' },
      { type: 'literal', value: String.fromCharCode(0x2009) },
      { type: 'minute', value: '06' },
    ])
    try {
      expect(formatGovernanceDateTime('2026-10-04T23:06:30.062Z')).toBe('2026/10/05 07:06')
    } finally {
      formatToParts.mockRestore()
    }
  })
  it('turns duplicate identity issues into one recoverable human message', () => {
    const failure = describeGovernanceFailure({ code: 'GOVERNANCE_VALIDATION_FAILED', issues: [
      { code: 'IDENTITY_CONFLICT', message: 'duplicate subject' },
      { code: 'IDENTITY_CONFLICT', message: 'duplicate employee' },
    ] })
    expect(failure.message).toBe('目前登入身分或該員工已建立有效連結；請先停用既有連結。')
    expect(failure.message).not.toContain('GOVERNANCE_')
  })

  it('presents OrgMaster unavailability as an explicit reloadable failure', () => {
    const failure = describeGovernanceFailure({ code: 'ORGMASTER_UNAVAILABLE' })
    expect(failure).toEqual({
      code: 'ORGMASTER_UNAVAILABLE',
      message: 'OrgMaster 暫時無法使用；請稍後重新載入。',
      canReload: true,
    })
  })

  it('requires an identity and both management permissions before publishing', () => {
    const empty = createSeedDocument('2026-08-26T00:00:00.000Z').draft as any
    expect(governancePublishBlockers(empty, 'principal-1', 'workspace-1', '2026-08-26T00:00:00.000Z').map((item) => item.code)).toEqual(['IDENTITY_LINK_REQUIRED'])
    expect(governancePublishBlockers(readyDraft(), 'principal-1', 'workspace-1', '2026-08-26T00:00:00.000Z')).toEqual([])
  })

  it('uses deny precedence in the publish readiness check', () => {
    const draft = readyDraft()
    draft.rolePermissionGrants.push({ id: 'deny-manage', roleId: 'role-orgmaster-admin', permissionId: 'permission-orgmaster-governance-manage', effect: 'deny' })
    expect(governancePublishBlockers(draft, 'principal-1', 'workspace-1', '2026-08-26T00:00:00.000Z').map((item) => item.code)).toContain('GOVERNANCE_MANAGE_REQUIRED')
  })

  it('detects an existing semantic global assignment', () => {
    expect(sameGlobalRoleAssignment(readyDraft().roleAssignments[0], 'employee-1', 'role-orgmaster-admin')).toBe(true)
    expect(sameGlobalRoleAssignment(readyDraft().roleAssignments[0], 'employee-2', 'role-orgmaster-admin')).toBe(false)
  })
})
