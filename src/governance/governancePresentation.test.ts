import { describe, expect, it } from 'vitest'
import { createSeedDocument } from '../../server/orgmasterGovernanceStore'
import { describeGovernanceFailure, governancePublishBlockers, sameGlobalRoleAssignment } from './governancePresentation'

function readyDraft() {
  const draft = createSeedDocument('2026-08-26T00:00:00.000Z').draft
  draft.identityLinks.push({ id: 'identity-1', principalId: 'principal-1', issuer: 'issuer-1', subject: 'subject-1', employeeId: 'employee-1', status: 'active', validFrom: '2026-08-25T00:00:00.000Z', validTo: null })
  draft.roleAssignments.push({ id: 'assignment-1', employeeId: 'employee-1', roleId: 'role-orgmaster-admin', scope: { kind: 'global' }, status: 'active', validFrom: '2026-08-25T00:00:00.000Z', validTo: null })
  return draft as any
}

describe('governance presentation', () => {
  it('turns duplicate identity issues into one recoverable human message', () => {
    const failure = describeGovernanceFailure({ code: 'GOVERNANCE_VALIDATION_FAILED', issues: [
      { code: 'IDENTITY_CONFLICT', message: 'duplicate subject' },
      { code: 'IDENTITY_CONFLICT', message: 'duplicate employee' },
    ] })
    expect(failure.message).toBe('目前登入身分或該員工已建立有效連結；請先停用既有連結。')
    expect(failure.message).not.toContain('GOVERNANCE_')
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
