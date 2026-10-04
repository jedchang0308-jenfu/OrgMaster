import { describe, expect, it } from 'vitest'
import { createSeedDocumentV2 } from './migrateGovernanceV1ToV2'
import { migrateGovernanceV2ToV3 } from './migrateGovernanceV2ToV3'
import { evaluateVerifiedPrincipalPermission } from './evaluatePermission'
import { actorHasPolicyPermission } from '../../server/orgmasterGovernanceStore'
import type { GovernanceDocumentV3, GovernanceIdentityLinkV1 } from './types'

const now = '2026-09-02T12:00:00.000Z'
const actor = { principalId: 'principal-1', employeeId: 'employee-1' }
const options = { now }

function link(id: string, principalId: string, employeeId: string): GovernanceIdentityLinkV1 {
  return {
    id, principalId, employeeId, issuer: 'issuer', subject: id,
    status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null,
  }
}

function publishedFixture(): GovernanceDocumentV3 {
  const v2 = createSeedDocumentV2(now)
  v2.draft.roleAssignments = [{
    id: 'assignment-1', employeeId: actor.employeeId, applicationId: 'orgmaster',
    roleId: 'role-orgmaster-admin', roleCodeSnapshot: 'orgmaster_admin',
    roleNameSnapshot: 'OrgMaster 管理者', catalogVersion: null,
    scope: { kind: 'global' }, status: 'active', validFrom: '2026-01-01T00:00:00.000Z',
    validTo: null, effectState: 'not-synchronized',
  }]
  const document = migrateGovernanceV2ToV3(v2, 'fixture-v2', undefined, now)
  document.draft.identityLinks = [
    link('alias-1', actor.principalId, actor.employeeId),
    link('alias-2', actor.principalId, actor.employeeId),
  ]
  const { basePolicyVersionId: _base, updatedAt: _updated, ...policy } = document.draft
  const version = {
    kind: 'assignment-governance-v3' as const,
    id: 'published-v3', versionNumber: 1, publishedAt: now,
    publishedByPrincipalId: actor.principalId, publishReason: 'fixture',
    snapshotHash: 'fixture-hash', effectState: 'not-synchronized' as const,
    policy, externalRoleCatalogs: [], organizationSnapshot: {
      workspaceVersionId: 'workspace-v1', workspaceRevision: 'revision-1', capturedAt: now,
      employees: [{ id: actor.employeeId, primaryAssignmentId: null }],
      departments: [], organizationRoles: [], positions: [], assignments: [],
    },
  }
  document.activePolicyVersionId = version.id
  document.publishedVersions.push(version)
  return document
}

describe('verified principal runtime permission', () => {
  it('uses the verified principal with two active provider aliases for one employee', () => {
    const document = publishedFixture()
    const result = evaluateVerifiedPrincipalPermission(document, actor, 'orgmaster.governance.manage', options)
    expect(result).toMatchObject({ status: 'allowed', reason: 'ALLOWED_ROLE', principalId: actor.principalId })
  })

  it('applies Employee assignments to each verified Principal of that Employee and denies another Employee', () => {
    const document = publishedFixture()
    // Both inputs stand for independently verified canonical pairs. Forged P/E are
    // rejected by native auth/write-actor admission before this pure evaluator.
    expect(evaluateVerifiedPrincipalPermission(document, { principalId: 'principal-other', employeeId: actor.employeeId }, 'orgmaster.governance.manage', options).status).toBe('allowed')
    expect(evaluateVerifiedPrincipalPermission(document, { principalId: actor.principalId, employeeId: 'employee-other' }, 'orgmaster.governance.manage', options).status).toBe('denied')
    expect(evaluateVerifiedPrincipalPermission(document, { principalId: '', employeeId: actor.employeeId }, 'orgmaster.governance.manage', options).status).toBe('denied')
    expect(evaluateVerifiedPrincipalPermission(document, { principalId: actor.principalId, employeeId: null }, 'orgmaster.governance.manage', options).status).toBe('denied')
  })

  it('applies a principal-targeted role only to its target in runtime and publish checks', () => {
    const document = publishedFixture()
    const version = document.publishedVersions.find((candidate) => candidate.id === document.activePolicyVersionId)!
    if (version.kind !== 'assignment-governance-v3') throw new Error('fixture version')
    version.policy.identityLinks.push(link('other-principal', 'principal-2', actor.employeeId))
    const assignment = version.policy.roleAssignments[0]
    assignment.subjectKind = 'principal'
    assignment.targetPrincipalId = 'principal-2'
    const first = evaluateVerifiedPrincipalPermission(document, actor, 'orgmaster.governance.manage', options)
    const second = evaluateVerifiedPrincipalPermission(document, { principalId: 'principal-2', employeeId: actor.employeeId }, 'orgmaster.governance.manage', options)
    expect(first.status).toBe('denied')
    expect(second.status).toBe('allowed')
    expect(evaluateVerifiedPrincipalPermission(document, { principalId: 'principal-2', employeeId: 'employee-other' }, 'orgmaster.governance.manage', options).status).toBe('denied')
    expect(actorHasPolicyPermission(document.draft, {
      ...actor, issuer: 'issuer', subject: 'alias-1', bootstrap: false,
    }, 'orgmaster.governance.manage', now)).toBe(false)
  })

  it('denies revoked assignments and inactive roles without treating JSON aliases as native admission', () => {
    const document = publishedFixture()
    const version = document.publishedVersions.find((candidate) => candidate.id === document.activePolicyVersionId)!
    if (version.kind !== 'assignment-governance-v3') throw new Error('fixture version')
    version.policy.roleAssignments[0].status = 'revoked'
    expect(evaluateVerifiedPrincipalPermission(document, actor, 'orgmaster.governance.manage', options).status).toBe('denied')
    version.policy.roleAssignments[0].status = 'active'
    version.policy.applicationRoles[0].status = 'inactive'
    expect(evaluateVerifiedPrincipalPermission(document, actor, 'orgmaster.governance.manage', options).status).toBe('denied')
    version.policy.applicationRoles[0].status = 'active'
    version.policy.identityLinks.forEach((value) => { value.status = 'inactive' })
    expect(evaluateVerifiedPrincipalPermission(document, actor, 'orgmaster.governance.manage', options).reason).toBe('ALLOWED_ROLE')
    version.policy.identityLinks = []
    expect(evaluateVerifiedPrincipalPermission(document, actor, 'orgmaster.governance.manage', options).status).toBe('allowed')
  })

  it('fails closed on legacy policy documents', () => {
    expect(evaluateVerifiedPrincipalPermission(createSeedDocumentV2(now), actor, 'orgmaster.governance.manage', options).status).toBe('denied')
  })
})
