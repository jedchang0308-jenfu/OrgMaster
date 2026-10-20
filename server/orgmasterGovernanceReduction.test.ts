import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readAiPdmRoleCatalog } from '../src/governance/aiPdmCatalog'
import { createSeedDocumentV2 } from '../src/governance/migrateGovernanceV1ToV2'
import { migrateGovernanceV2ToV3 } from '../src/governance/migrateGovernanceV2ToV3'
import { isGovernanceReduction, storedGovernanceCatalogs, withStoredGovernanceHistory } from './governanceReduction'
import { writeSyntheticWorkspaceFixture } from './syntheticWorkspaceFixture'
import { applyDraftCommand, getGovernancePaths, loadOrganizationSource, publishGovernance, readGovernanceStore } from './orgmasterGovernanceStore'
import { createOrgmasterGovernanceMiddleware } from './orgmasterGovernanceApi'
import { setVerifiedRequestIdentity } from './orgmasterRequestIdentity'
import type { OrgmasterSession } from './orgmasterSessionRepository'
import { canonicalJson, sha256, GOVERNANCE_PUBLICATION_HASH_FORMAT } from '../src/governance/commands'

const fault = vi.hoisted(() => ({ offline: false, reads: 0 }))
vi.mock('./applicationRoleCatalogRegistry', async importOriginal => {
  const original = await importOriginal<typeof import('./applicationRoleCatalogRegistry')>()
  return { ...original,
    readActiveAiPdmRoleCatalog: async (...args: Parameters<typeof original.readActiveAiPdmRoleCatalog>) => {
      fault.reads++; if (fault.offline) throw new Error('TEST_ONLY_PDM_OFFLINE')
      return original.readActiveAiPdmRoleCatalog(...args)
    },
    readApplicationRoleCatalogs: async (...args: Parameters<typeof original.readApplicationRoleCatalogs>) => {
      fault.reads++; if (fault.offline) throw new Error('TEST_ONLY_PDM_OFFLINE')
      return original.readApplicationRoleCatalogs(...args)
    },
  }
})

const roots: string[] = []
beforeEach(() => { fault.offline = false; fault.reads = 0; vi.stubEnv('ORGMASTER_PERSISTENCE_MODE', 'local-json') })
afterEach(async () => { fault.offline = false; vi.unstubAllEnvs(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })

async function fixture(withRevokedDelegation = false) {
  const root = await mkdtemp(join(tmpdir(), 'orgmaster-dev058-reduction-')); roots.push(root)
  await writeSyntheticWorkspaceFixture(root)
  const source = await loadOrganizationSource(root)
  const employeeId = source.state.employees.find(employee => employee.status !== 'inactive')!.id
  const otherEmployeeId = source.state.employees.find(employee => employee.id !== employeeId)!.id
  const actor = { principalId: 'dev058-manager', employeeId, issuer: 'test-issuer', subject: 'test-subject', bootstrap: true }
  const catalog = readAiPdmRoleCatalog('valid')
  const document = migrateGovernanceV2ToV3(createSeedDocumentV2(), 'test-v2', catalog)
  document.draft.identityLinks = []; document.draft.principalAdmissions = []; document.draft.managementGrants = []
  document.draft.roleAssignments = [{ id: 'manager', employeeId, applicationId: 'orgmaster', roleId: 'role-orgmaster-admin',
    roleCodeSnapshot: 'orgmaster_admin', roleNameSnapshot: 'OrgMaster 管理者', catalogVersion: null, scope: { kind: 'global' },
    status: 'active', validFrom: '2000-01-01T00:00:00.000Z', validTo: null, effectState: 'orgmaster-enforced',
    basis: 'manual', subjectKind: 'employee', targetPrincipalId: null, sources: [], createdByPrincipalId: actor.principalId },
  { id: 'rd', employeeId, applicationId: 'ai-pdm', roleId: 'role-rd', roleCodeSnapshot: 'rd', roleNameSnapshot: '研發人員',
    catalogVersion: catalog.catalogVersion, scope: { kind: 'workspace', value: 'test-company' }, status: 'active',
    validFrom: '2000-01-01T00:00:00.000Z', validTo: null, effectState: 'not-synchronized', basis: 'manual',
    subjectKind: 'employee', targetPrincipalId: null, sources: [], createdByPrincipalId: actor.principalId }]
  if (withRevokedDelegation) document.draft.roleDelegations.push({ id: 'old-delegation', sourceAssignmentId: 'rd',
    fromEmployeeId: employeeId, toEmployeeId: otherEmployeeId, applicationId: 'ai-pdm', roleId: 'role-rd',
    catalogVersion: catalog.catalogVersion, scope: { kind: 'workspace', value: 'test-company' }, status: 'revoked',
    validFrom: '2000-01-01T00:00:00.000Z', validTo: '2100-01-01T00:00:00.000Z', reason: 'test history', effectState: 'not-synchronized' })
  await writeFile(getGovernancePaths(root).current, JSON.stringify(document))
  const initial = await readGovernanceStore(root)
  // A REAL owner publish creates the immutable, audit-bound reference used by the test.
  const published = await publishGovernance(root, initial.revision, 'setup-publication', 'test setup', source.workspaceVersionId, actor)
  actor.bootstrap = false
  return { root, source, actor, published, otherEmployeeId }
}

describe('DEV-058 catalog-independent reduction', () => {
  it('retains audit-bound provenance after jsonb reorders nested object keys', async () => {
    const { root, source, actor, published } = await fixture()
    const reordered = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(reordered)
      if (!value || typeof value !== 'object') return value
      return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reordered(item)]))
    }
    const document = reordered(published.document) as typeof published.document
    const active = document.publishedVersions.find(version => version.id === document.activePolicyVersionId)!
    expect(active.kind === 'assignment-governance-v3' && active.hashFormat).toBe(GOVERNANCE_PUBLICATION_HASH_FORMAT)
    expect(storedGovernanceCatalogs(document)).not.toBeNull()
    await writeFile(getGovernancePaths(root).current, JSON.stringify(document))
    fault.offline = true; fault.reads = 0
    const read = await readGovernanceStore(root)
    const draft = await applyDraftCommand(root, read.revision,
      { type: 'REVOKE_ROLE_ASSIGNMENT', id: 'rd', commandId: 'jsonb-revoke', reason: 'withdraw after jsonb read' }, actor)
    await publishGovernance(root, draft.revision, 'jsonb-publish', 'publish withdrawal', source.workspaceVersionId, actor)
    expect(fault.reads).toBe(0)
  })

  it('keeps exact legacy hash validation and rejects unknown formats or changed content', async () => {
    const { published } = await fixture()
    const document = structuredClone(published.document)
    const active = document.publishedVersions.find(version => version.id === document.activePolicyVersionId)!
    if (active.kind !== 'assignment-governance-v3') throw Error('test version')
    const payload = { kind: active.kind, policy: active.policy, externalRoleCatalogs: active.externalRoleCatalogs,
      organizationSnapshot: active.organizationSnapshot, effectState: active.effectState }
    const event = document.auditEvents.find(event => event.entityId === active.id)!
    delete active.hashFormat
    active.snapshotHash = sha256(canonicalJson(payload)); event.afterHash = active.snapshotHash
    expect(storedGovernanceCatalogs(document)).not.toBeNull()
    Object.assign(active, { hashFormat: 'unknown' })
    expect(storedGovernanceCatalogs(document)).toBeNull()
    delete active.hashFormat
    active.externalRoleCatalogs[0].roles[0].displayName = 'changed'
    expect(storedGovernanceCatalogs(document)).toBeNull()
  })

  it('preserves unmarked legacy audit hashes and rejects an unknown audit hash format', async () => {
    const { root, published } = await fixture()
    const document = structuredClone(published.document)
    let previousEventHash: string | null = null
    for (const event of document.auditEvents) {
      delete event.hashFormat
      event.previousEventHash = previousEventHash
      const input = { id: event.id, commandId: event.commandId, commandHash: event.commandHash,
        occurredAt: event.occurredAt, actorPrincipalId: event.actorPrincipalId, action: event.action,
        entityType: event.entityType, entityId: event.entityId, reason: event.reason,
        beforeHash: event.beforeHash, afterHash: event.afterHash, previousEventHash: event.previousEventHash }
      event.eventHash = sha256(canonicalJson(input)); previousEventHash = event.eventHash
    }
    await writeFile(getGovernancePaths(root).current, JSON.stringify(document))
    await expect(readGovernanceStore(root)).resolves.toBeDefined()
    Object.assign(document.auditEvents[0], { hashFormat: 'unknown' })
    await writeFile(getGovernancePaths(root).current, JSON.stringify(document))
    await expect(readGovernanceStore(root)).rejects.toMatchObject({ code: 'AUDIT_CHAIN_INVALID' })
  })

  it('keeps the normal HTTP workspace visible and permits withdrawal/publish during a catalog outage', async () => {
    const { root, source, actor, published } = await fixture()
    fault.offline = true
    const middleware = createOrgmasterGovernanceMiddleware(root, false)
    // Test-only verified boundary context; this does not prove provider authentication.
    const server = createServer((request, response) => {
      setVerifiedRequestIdentity(request, { principalId: actor.principalId, employeeId: actor.employeeId,
        identityIssuer: actor.issuer, identitySubject: actor.subject } as OrgmasterSession)
      middleware(request, response, () => { response.statusCode = 404; response.end() })
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as { port: number }).port
    const call = async (method: string, path: string, body?: unknown) => {
      const response = await fetch(`http://127.0.0.1:${port}/api/orgmaster/governance${path}`, { method,
        headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
      return { status: response.status, body: await response.json() }
    }
    try {
      const workspace = await call('GET', '/')
      expect(workspace.status).toBe(200)
      expect(workspace.body.catalogs[0].validationState).toBe('unavailable')
      fault.reads = 0
      const command = { type: 'REVOKE_ROLE_ASSIGNMENT', id: 'rd', commandId: 'http-revoke', reason: 'withdraw' }
      const withdrawn = await call('PATCH', '/draft', { expectedRevision: published.revision, command })
      expect(withdrawn.status).toBe(200)
      expect((await call('PATCH', '/draft', { expectedRevision: published.revision, command })).body.status).toBe('replayed')
      const result = await call('POST', '/versions', { expectedRevision: withdrawn.body.revision,
        commandId: 'http-publish', reason: 'publish withdrawal', organizationVersionId: source.workspaceVersionId })
      expect(result.status).toBe(201)
      const versionId = result.body.versionSummary.id
      const later = await call('POST', '/versions', { expectedRevision: result.body.revision,
        commandId: 'http-later', reason: 'later version', organizationVersionId: source.workspaceVersionId })
      expect(later.status).toBe(201)
      const replayed = await call('POST', '/versions', { expectedRevision: withdrawn.body.revision,
        commandId: 'http-publish', reason: 'publish withdrawal', organizationVersionId: source.workspaceVersionId })
      expect(replayed.status).toBe(200)
      expect(replayed.body.versionSummary.id).toBe(versionId)
      expect(fault.reads).toBe(0)
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
  })
  it('reads, revokes, publishes and replays with zero current-catalog reads during an outage', async () => {
    const { root, source, actor, published } = await fixture(true)
    fault.offline = true; fault.reads = 0
    const current = await readGovernanceStore(root)
    const command = { type: 'REVOKE_ROLE_ASSIGNMENT' as const, id: 'rd', commandId: 'revoke', reason: 'withdraw access' }
    const draft = await applyDraftCommand(root, current.revision, command, actor)
    expect(draft.document.draft.roleAssignments.find(value => value.id === 'rd')?.status).toBe('revoked')
    expect((await applyDraftCommand(root, 'stale-cas', command, actor)).status).toBe('replayed')
    const result = await publishGovernance(root, draft.revision, 'publish-revoke', 'publish withdrawal', source.workspaceVersionId, actor)
    expect(result.document.publishedVersions).toHaveLength(published.document.publishedVersions.length + 1)
    expect((await publishGovernance(root, 'stale-cas', 'publish-revoke', 'publish withdrawal', source.workspaceVersionId, actor)).status).toBe('replayed')
    expect((await readGovernanceStore(root)).document.auditEvents.filter(event => event.commandId === 'revoke')).toHaveLength(1)
    expect(fault.reads).toBe(0)
    await expect(applyDraftCommand(root, result.revision, { ...command, reason: 'different request' }, actor)).rejects.toMatchObject({ code: 'COMMAND_ID_REUSED' })
  })

  it('does not publish a mixed draft containing withdrawal plus a new grant while offline', async () => {
    const { root, source, actor, published, otherEmployeeId } = await fixture()
    const original = published.document.draft.roleAssignments.find(value => value.id === 'rd')!
    const { basis: _basis, subjectKind: _subject, targetPrincipalId: _principal, sources: _sources,
      createdByPrincipalId: _creator, ...value } = original
    const added = await applyDraftCommand(root, published.revision, { type: 'UPSERT_ROLE_ASSIGNMENT', commandId: 'add', reason: 'test mixed draft',
      value: { ...value, id: 'new-grant', employeeId: otherEmployeeId } }, actor)
    fault.offline = true
    const withdrawn = await applyDraftCommand(root, added.revision, { type: 'REVOKE_ROLE_ASSIGNMENT', commandId: 'withdraw', reason: 'withdraw', id: 'rd' }, actor)
    const path = getGovernancePaths(root).current
    const before = await readFile(path, 'utf8')
    await expect(publishGovernance(root, withdrawn.revision, 'mixed', 'must not grant offline', source.workspaceVersionId, actor)).rejects.toThrow()
    expect(await readFile(path, 'utf8')).toBe(before)
  })

  it('rejects restore and tampered owner references rather than using the outage as a bypass', async () => {
    const { root, actor, published } = await fixture()
    fault.offline = true
    await expect(applyDraftCommand(root, published.revision, { type: 'RESTORE_ROLE_ASSIGNMENT', commandId: 'restore', reason: 'not offline', id: 'rd' }, actor)).rejects.toThrow()
    const document = structuredClone(published.document)
    const active = document.publishedVersions.find(version => version.id === document.activePolicyVersionId)!
    if (active.kind !== 'assignment-governance-v3') throw Error('test version')
    active.externalRoleCatalogs[0].roles[0].displayName = 'tampered'
    await writeFile(getGovernancePaths(root).current, JSON.stringify(document))
    await expect(readGovernanceStore(root)).rejects.toMatchObject({ code: 'GOVERNANCE_READ_FAILED' })
  })

  it('classifies actual policy differences, preserving scope, validity, identity and internal authority', async () => {
    const { published } = await fixture()
    const before = published.document.draft
    const reduced = structuredClone(before); reduced.roleAssignments[1].status = 'revoked'
    expect(isGovernanceReduction(before, reduced)).toBe(true)
    for (const mutate of [
      (next: typeof before) => { next.roleAssignments.push({ ...next.roleAssignments[1], id: 'extra' }) },
      (next: typeof before) => { next.roleAssignments[1].scope = { kind: 'global' } },
      (next: typeof before) => { next.roleAssignments[1].validFrom = '1999-01-01T00:00:00.000Z' },
      (next: typeof before) => { next.roleAssignments[1].employeeId = 'someone-else' },
      (next: typeof before) => { next.rolePermissionGrants.pop() },
    ]) { const next = structuredClone(reduced); mutate(next); expect(isGovernanceReduction(before, next)).toBe(false) }
    const revoked = structuredClone(reduced); const restored = structuredClone(before)
    expect(isGovernanceReduction(revoked, restored)).toBe(false)
  })
  it('rejects a reused catalog version with a different hash against audit-bound owner history', async () => {
    const { published } = await fixture()
    const catalogs = storedGovernanceCatalogs(published.document)!
    expect(() => withStoredGovernanceHistory(published.document, [{ ...catalogs[0], payloadHash: '0'.repeat(64) }])).toThrow()
  })
})
