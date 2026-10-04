import { describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { createSeedDocumentV2 } from '../src/governance/migrateGovernanceV1ToV2'
import { migrateGovernanceV2ToV3 } from '../src/governance/migrateGovernanceV2ToV3'
import type { GovernanceDocumentV3 } from '../src/governance/types'
import { createOrgDocumentFile } from '../src/documentStorage'
import { screenshotOrganizationState } from '../src/screenshotData'
import { validateDocumentV3 } from '../src/governance/validation'
import { readApplicationRoleCatalogs } from './applicationRoleCatalogRegistry'
import { assertActivationContinuity, assertCurrentPublicationAuthority, getGovernancePaths, GovernanceStoreError, loadOrganizationSource, publishGovernance, readGovernanceStore } from './orgmasterGovernanceStore'
import { createOrgmasterGovernanceMiddleware } from './orgmasterGovernanceApi'
import { DEV_ISSUER, DEV_SUBJECT } from './orgmasterGovernanceIdentity'

const now = '2026-09-29T12:00:00.000Z'
const actor = {
  principalId: 'principal-manager', employeeId: 'employee-shijie',
  issuer: 'issuer', subject: 'subject', bootstrap: false,
}

function publishedDocument(): GovernanceDocumentV3 {
  const document = migrateGovernanceV2ToV3(createSeedDocumentV2(now), 'fixture-v2', undefined, now)
  document.draft.identityLinks = [{
    id: 'manager-link', principalId: actor.principalId, employeeId: actor.employeeId,
    issuer: actor.issuer, subject: actor.subject,
    status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null,
  }]
  document.draft.roleAssignments = [{
    id: 'manager-assignment', employeeId: actor.employeeId, applicationId: 'orgmaster',
    roleId: 'role-orgmaster-admin', roleCodeSnapshot: 'orgmaster_admin',
    roleNameSnapshot: 'OrgMaster 管理者', catalogVersion: null,
    scope: { kind: 'global' }, status: 'active',
    validFrom: '2026-01-01T00:00:00.000Z', validTo: null,
    effectState: 'orgmaster-enforced', basis: 'manual', sources: [], subjectKind: 'employee',
    targetPrincipalId: null, createdByPrincipalId: actor.principalId,
  }]
  const { basePolicyVersionId: _base, updatedAt: _updated, ...policy } = document.draft
  const version = {
    kind: 'assignment-governance-v3' as const,
    id: 'published-version', versionNumber: 1, publishedAt: now,
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

describe('governance publication authority', () => {
  it('fails closed when the Cloud SQL workspace source cannot be read', async () => {
    const previousMode = process.env.ORGMASTER_PERSISTENCE_MODE
    const previousUrl = process.env.ORGMASTER_POSTGRES_URL
    process.env.ORGMASTER_PERSISTENCE_MODE = 'cloud-sql'
    delete process.env.ORGMASTER_POSTGRES_URL
    try {
      await expect(loadOrganizationSource('missing-task-owned-workspace'))
        .rejects.toThrow()
    } finally {
      if (previousMode === undefined) delete process.env.ORGMASTER_PERSISTENCE_MODE
      else process.env.ORGMASTER_PERSISTENCE_MODE = previousMode
      if (previousUrl === undefined) delete process.env.ORGMASTER_POSTGRES_URL
      else process.env.ORGMASTER_POSTGRES_URL = previousUrl
    }
  })

  it('returns a governance read failure over HTTP when Cloud SQL is unavailable', async () => {
    const previousMode = process.env.ORGMASTER_PERSISTENCE_MODE
    const previousUrl = process.env.ORGMASTER_POSTGRES_URL
    process.env.ORGMASTER_PERSISTENCE_MODE = 'cloud-sql'
    delete process.env.ORGMASTER_POSTGRES_URL
    const middleware = createOrgmasterGovernanceMiddleware('missing-task-owned-workspace', true)
    const server = createServer((request, response) => middleware(request, response, () => {
      response.statusCode = 404
      response.end()
    }))
    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('task-owned HTTP port unavailable')
      const response = await fetch(`http://127.0.0.1:${address.port}/api/orgmaster/governance/session`, {
        headers: { 'x-orgmaster-dev-issuer': DEV_ISSUER, 'x-orgmaster-dev-subject': DEV_SUBJECT },
      })
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({ error: 'GOVERNANCE_READ_FAILED' })
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
      if (previousMode === undefined) delete process.env.ORGMASTER_PERSISTENCE_MODE
      else process.env.ORGMASTER_PERSISTENCE_MODE = previousMode
      if (previousUrl === undefined) delete process.env.ORGMASTER_POSTGRES_URL
      else process.env.ORGMASTER_POSTGRES_URL = previousUrl
    }
  })

  it('does not let a manager obtain publish authority by editing the draft', () => {
    const document = publishedDocument()
    const active = document.publishedVersions[0]
    if (active.kind !== 'assignment-governance-v3') throw new Error('fixture version')
    active.policy.rolePermissionGrants = active.policy.rolePermissionGrants.filter((grant) =>
      grant.permissionId !== 'permission-orgmaster-governance-publish')
    expect(() => assertCurrentPublicationAuthority(document, actor, now))
      .toThrowError(expect.objectContaining<Partial<GovernanceStoreError>>({ code: 'GOVERNANCE_PUBLISH_REQUIRED' }))
    expect(document.draft.rolePermissionGrants.some((grant) =>
      grant.permissionId === 'permission-orgmaster-governance-publish')).toBe(true)
  })

  it('accepts a verified publisher without a JSON alias and rejects a withdrawn current grant', () => {
    const document = publishedDocument()
    expect(() => assertCurrentPublicationAuthority(document, actor, now)).not.toThrow()
    const active = document.publishedVersions[0]
    if (active.kind !== 'assignment-governance-v3') throw new Error('fixture version')
    active.policy.identityLinks = []
    document.draft.identityLinks = []
    expect(() => assertCurrentPublicationAuthority(document, actor, now)).not.toThrow()
    active.policy.roleAssignments[0].status = 'revoked'
    expect(() => assertCurrentPublicationAuthority(document, actor, now))
      .toThrowError(expect.objectContaining<Partial<GovernanceStoreError>>({ code: 'GOVERNANCE_ADMIN_REQUIRED' }))
  })

  it('requires current manage authority even when publish remains granted', () => {
    const document = publishedDocument()
    const active = document.publishedVersions[0]
    if (active.kind !== 'assignment-governance-v3') throw new Error('fixture version')
    active.policy.rolePermissionGrants = active.policy.rolePermissionGrants.filter((grant) =>
      grant.permissionId !== 'permission-orgmaster-governance-manage')
    expect(() => assertCurrentPublicationAuthority(document, actor, now))
      .toThrowError(expect.objectContaining<Partial<GovernanceStoreError>>({ code: 'GOVERNANCE_ADMIN_REQUIRED' }))
  })

  it('allows only the explicit initial bootstrap without an active version', () => {
    const document = publishedDocument()
    document.activePolicyVersionId = null
    expect(() => assertCurrentPublicationAuthority(document, actor, now))
      .toThrowError(expect.objectContaining<Partial<GovernanceStoreError>>({ code: 'GOVERNANCE_ADMIN_REQUIRED' }))
    expect(() => assertCurrentPublicationAuthority(document, { ...actor, bootstrap: true }, now)).not.toThrow()
  })

  it('cannot deactivate the only active policy or reactivate one without an administrator', () => {
    const document = publishedDocument()
    const active = document.publishedVersions[0]
    expect(() => assertActivationContinuity(active, actor, now)).not.toThrow()
    expect(() => assertActivationContinuity(null, actor, now))
      .toThrowError(expect.objectContaining<Partial<GovernanceStoreError>>({ code: 'GOVERNANCE_ADMIN_CONTINUITY_REQUIRED' }))
    if (active.kind !== 'assignment-governance-v3') throw new Error('fixture version')
    active.policy.roleAssignments[0].status = 'revoked'
    expect(() => assertActivationContinuity(active, actor, now))
      .toThrowError(expect.objectContaining<Partial<GovernanceStoreError>>({ code: 'GOVERNANCE_ADMIN_CONTINUITY_REQUIRED' }))
  })

  it('rejects a draft self-grant through the owner publish command without changing the artifact', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orgmaster-dev057-publish-authority-'))
    try {
      const document = publishedDocument()
      const active = document.publishedVersions[0]
      if (active.kind !== 'assignment-governance-v3') throw new Error('fixture version')
      active.policy.rolePermissionGrants = active.policy.rolePermissionGrants.filter((grant) =>
        grant.permissionId !== 'permission-orgmaster-governance-publish')
      await mkdir(join(root, 'data'), { recursive: true })
      const governancePath = getGovernancePaths(root).current
      await writeFile(governancePath, `${JSON.stringify(document)}\n`)
      await writeFile(join(root, 'data', 'orgmaster-document.v4.json'),
        `${JSON.stringify(createOrgDocumentFile(screenshotOrganizationState, 'document', now))}\n`)
      const source = await loadOrganizationSource(root)
      expect(validateDocumentV3(document, source, await readApplicationRoleCatalogs(root))).toEqual([])
      const current = await readGovernanceStore(root)
      await expect(publishGovernance(root, current.revision, 'self-grant-command', 'try to publish', source.workspaceVersionId, actor))
        .rejects.toMatchObject({ code: 'GOVERNANCE_PUBLISH_REQUIRED' })
      expect(await readFile(governancePath, 'utf8')).toBe(`${JSON.stringify(document)}\n`)
      active.policy.rolePermissionGrants.push(document.draft.rolePermissionGrants.find((grant) =>
        grant.permissionId === 'permission-orgmaster-governance-publish')!)
      await writeFile(governancePath, `${JSON.stringify(document)}\n`)
      const authorized = await readGovernanceStore(root)
      const published = await publishGovernance(root, authorized.revision, 'authorized-command',
        'publish assignment', source.workspaceVersionId, actor)
      expect(published.status).toBe('applied')
      expect(published.document.publishedVersions).toHaveLength(2)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
