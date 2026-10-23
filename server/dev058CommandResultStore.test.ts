import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readAiPdmRoleCatalog } from '../src/governance/aiPdmCatalog'
import { createSeedDocumentV2 } from '../src/governance/migrateGovernanceV1ToV2'
import { migrateGovernanceV2ToV3 } from '../src/governance/migrateGovernanceV2ToV3'
import type { GovernanceActorContext, GovernanceCommandV2, GovernanceExpectedCatalogV1 } from '../src/governance/types'
import { writeSyntheticWorkspaceFixture } from './syntheticWorkspaceFixture'

const catalogFault = vi.hoisted(() => ({ offline: false, reads: 0 }))
vi.mock('./applicationRoleCatalogRegistry', async importOriginal => {
  const original = await importOriginal<typeof import('./applicationRoleCatalogRegistry')>()
  return {
    ...original,
    readActiveAiPdmRoleCatalog: async (...args: Parameters<typeof original.readActiveAiPdmRoleCatalog>) => {
      catalogFault.reads++
      if (catalogFault.offline) throw new Error('TEST_ONLY_PDM_OFFLINE')
      return original.readActiveAiPdmRoleCatalog(...args)
    },
    readApplicationRoleCatalogs: async (...args: Parameters<typeof original.readApplicationRoleCatalogs>) => {
      catalogFault.reads++
      if (catalogFault.offline) throw new Error('TEST_ONLY_PDM_OFFLINE')
      return original.readApplicationRoleCatalogs(...args)
    },
  }
})

import {
  appendGovernanceAudit,
  applyDraftCommand,
  getGovernancePaths,
  loadOrganizationSource,
  publishGovernance,
  readGovernanceCommandResult,
  readGovernanceStore,
} from './orgmasterGovernanceStore'

const roots: string[] = []

beforeEach(() => {
  catalogFault.offline = false
  catalogFault.reads = 0
  vi.stubEnv('ORGMASTER_PERSISTENCE_MODE', 'local-json')
})

afterEach(async () => {
  catalogFault.offline = false
  vi.unstubAllEnvs()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

function revoke(commandId: string, reason = '撤銷角色指派'): GovernanceCommandV2 {
  return { type: 'REVOKE_ROLE_ASSIGNMENT', id: 'rd', commandId, reason }
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'orgmaster-dev058-command-result-'))
  roots.push(root)
  await writeSyntheticWorkspaceFixture(root)
  const source = await loadOrganizationSource(root)
  const employeeId = source.state.employees.find(employee => employee.status !== 'inactive')!.id
  const otherEmployeeId = source.state.employees.find(employee => employee.id !== employeeId)!.id
  const actor: GovernanceActorContext = {
    principalId: 'dev058-command-result-manager',
    employeeId,
    issuer: 'test-issuer',
    subject: 'test-subject',
    bootstrap: true,
  }
  const catalog = readAiPdmRoleCatalog('valid')
  const document = migrateGovernanceV2ToV3(createSeedDocumentV2(), 'test-v2', catalog)
  document.draft.identityLinks = []
  document.draft.principalAdmissions = []
  document.draft.managementGrants = []
  document.draft.roleAssignments = [{
    id: 'manager', employeeId, applicationId: 'orgmaster', roleId: 'role-orgmaster-admin',
    roleCodeSnapshot: 'orgmaster_admin', roleNameSnapshot: 'OrgMaster 管理者', catalogVersion: null,
    scope: { kind: 'global' }, status: 'active', validFrom: '2000-01-01T00:00:00.000Z', validTo: null,
    effectState: 'orgmaster-enforced', basis: 'manual', subjectKind: 'employee', targetPrincipalId: null,
    sources: [], createdByPrincipalId: actor.principalId,
  }, {
    id: 'rd', employeeId, applicationId: 'ai-pdm', roleId: 'role-rd', roleCodeSnapshot: 'rd',
    roleNameSnapshot: '研發人員', catalogVersion: catalog.catalogVersion,
    scope: { kind: 'workspace', value: 'test-company' }, status: 'active', validFrom: '2000-01-01T00:00:00.000Z',
    validTo: null, effectState: 'not-synchronized', basis: 'manual', subjectKind: 'employee',
    targetPrincipalId: null, sources: [], createdByPrincipalId: actor.principalId,
  }]
  await writeFile(getGovernancePaths(root).current, JSON.stringify(document))
  const initial = await readGovernanceStore(root)
  const published = await publishGovernance(root, initial.revision, 'setup-publication', 'test setup', source.workspaceVersionId, actor)
  actor.bootstrap = false
  const expectedCatalog: GovernanceExpectedCatalogV1 = {
    catalogVersion: catalog.catalogVersion,
    catalogSha256: catalog.catalogSha256 ?? catalog.payloadHash,
  }
  return { root, source, actor, otherEmployeeId, published, expectedCatalog }
}

describe('DEV-058 command result local Store', () => {
  it('queries a committed result and replays the original body after the CAS revision changes', async () => {
    const { root, source, actor, published, expectedCatalog } = await fixture()
    const command = revoke('command-result-applied')
    const context = { expectedOrganizationRevision: source.workspaceRevision, expectedCatalog }
    const applied = await applyDraftCommand(root, published.revision, command, actor, undefined, context)
    expect(applied.status).toBe('applied')

    const revisionChanged = await applyDraftCommand(root, applied.revision, revoke('revision-bump'), actor)
    expect(revisionChanged.status).toBe('noop')

    const replayed = await applyDraftCommand(root, published.revision, command, actor, undefined, context)
    expect(replayed.status).toBe('replayed')
    expect(replayed.revision).toBe(revisionChanged.revision)

    const result = await readGovernanceCommandResult(root, command.commandId, actor)
    expect(result).toMatchObject({
      status: 'committed',
      commandId: command.commandId,
      entityType: 'roleAssignment',
      entityId: 'rd',
      result: { operation: command.type, outcome: 'applied', entityType: 'roleAssignment', entityId: 'rd' },
    })
    expect(result.commandHash).toMatch(/^[a-f0-9]{64}$/u)
    expect(result.auditReference).toMatch(/^audit-/u)
    const stored = await readGovernanceStore(root)
    const event = stored.document.auditEvents.find(value => value.commandId === command.commandId)!
    expect(event.commandHashFormat).toBe('orgmaster.governance-command.v2')
    expect(event.commandHash).toBe(result.commandHash)
    expect(event.commandResult).toEqual(result.result)

    await expect(applyDraftCommand(root, replayed.revision, { ...command, reason: '改寫 payload' }, actor, undefined, context))
      .rejects.toMatchObject({ code: 'COMMAND_ID_REUSED' })
    await expect(applyDraftCommand(root, replayed.revision, command, { ...actor, principalId: 'different-principal' }, undefined, context))
      .rejects.toMatchObject({ code: 'COMMAND_ID_REUSED' })
    await expect(applyDraftCommand(root, 'different-cas', command, actor, undefined, context))
      .rejects.toMatchObject({ code: 'COMMAND_ID_REUSED' })
    await expect(applyDraftCommand(root, replayed.revision, command, actor, undefined, {
      ...context, expectedOrganizationRevision: 'different-organization-revision',
    })).rejects.toMatchObject({ code: 'COMMAND_ID_REUSED' })
    await expect(applyDraftCommand(root, replayed.revision, command, actor, undefined, {
      ...context, expectedCatalog: { ...expectedCatalog, catalogSha256: '0'.repeat(64) },
    })).rejects.toMatchObject({ code: 'COMMAND_ID_REUSED' })
  })

  it('persists and queries a noop exactly once, including its command result', async () => {
    const { root, actor, published } = await fixture()
    const applied = await applyDraftCommand(root, published.revision, revoke('noop-seed'), actor)
    const noopCommand = revoke('command-result-noop')
    const noop = await applyDraftCommand(root, applied.revision, noopCommand, actor)
    expect(noop.status).toBe('noop')

    const replayed = await applyDraftCommand(root, applied.revision, noopCommand, actor)
    expect(replayed.status).toBe('replayed')
    const first = await readGovernanceCommandResult(root, noopCommand.commandId, actor)
    const second = await readGovernanceCommandResult(root, noopCommand.commandId, actor)
    expect(second).toEqual(first)
    expect(first.result).toEqual({ operation: noopCommand.type, outcome: 'noop', entityType: 'roleAssignment', entityId: 'rd' })
    const stored = await readGovernanceStore(root)
    expect(stored.document.auditEvents.filter(value => value.commandId === noopCommand.commandId)).toHaveLength(1)
  })

  it('persists publish versionId and rejects publish command, CAS, context and actor rewrites on replay', async () => {
    const { root, source, actor, published, expectedCatalog } = await fixture()
    const context = { expectedOrganizationRevision: source.workspaceRevision, expectedCatalog }
    const first = await publishGovernance(root, published.revision, 'command-result-publish', 'publish command result', source.workspaceVersionId, actor, context)
    expect(first.status).toBe('applied')
    expect(first.versionId).toBeTruthy()

    const replayed = await publishGovernance(root, published.revision, 'command-result-publish', 'publish command result', source.workspaceVersionId, actor, context)
    expect(replayed.status).toBe('replayed')
    expect(replayed.versionId).toBe(first.versionId)

    const result = await readGovernanceCommandResult(root, 'command-result-publish', actor)
    expect(result.result).toEqual({
      operation: 'PUBLISH_ASSIGNMENTS', outcome: 'published', entityType: 'assignmentVersion',
      entityId: first.versionId, versionId: first.versionId,
    })
    expect(result.commandHash).toMatch(/^[a-f0-9]{64}$/u)
    const stored = await readGovernanceStore(root)
    const event = stored.document.auditEvents.find(value => value.commandId === 'command-result-publish')!
    expect(event.commandHashFormat).toBe('orgmaster.governance-command.v2')
    expect(event.commandHash).toBe(result.commandHash)

    await expect(publishGovernance(root, published.revision, 'command-result-publish', 'rewritten payload', source.workspaceVersionId, actor, context))
      .rejects.toMatchObject({ code: 'COMMAND_ID_REUSED' })
    await expect(publishGovernance(root, stored.revision, 'command-result-publish', 'publish command result', source.workspaceVersionId, actor, context))
      .rejects.toMatchObject({ code: 'COMMAND_ID_REUSED' })
    await expect(publishGovernance(root, published.revision, 'command-result-publish', 'publish command result', source.workspaceVersionId, actor, {
      ...context, expectedOrganizationRevision: 'rewritten-organization-revision',
    })).rejects.toMatchObject({ code: 'COMMAND_ID_REUSED' })
    await expect(publishGovernance(root, published.revision, 'command-result-publish', 'publish command result', source.workspaceVersionId, {
      ...actor, principalId: 'rewritten-principal',
    }, context)).rejects.toMatchObject({ code: 'COMMAND_ID_REUSED' })
  })

  it('returns null fields for an unknown command and keeps management authorization required while PDM is offline', async () => {
    const { root, actor, otherEmployeeId } = await fixture()
    catalogFault.offline = true
    catalogFault.reads = 0

    await expect(readGovernanceCommandResult(root, 'never-observed', actor)).resolves.toEqual({
      status: 'not_observed', commandId: 'never-observed', commandHash: null, auditReference: null,
      entityType: null, entityId: null, occurredAt: null, result: null,
    })
    expect(catalogFault.reads).toBe(0)
    const outsider: GovernanceActorContext = { ...actor, principalId: 'unmanaged-principal', employeeId: otherEmployeeId }
    await expect(readGovernanceCommandResult(root, 'never-observed', outsider))
      .rejects.toMatchObject({ code: 'GOVERNANCE_ADMIN_REQUIRED' })
    expect(catalogFault.reads).toBe(0)
  })

  it('fails closed when commandResult is tampered because it is part of the audit hash', async () => {
    const { root, actor, published } = await fixture()
    const command = revoke('command-result-tamper')
    await applyDraftCommand(root, published.revision, command, actor)
    const path = getGovernancePaths(root).current
    const document = JSON.parse(await readFile(path, 'utf8')) as { auditEvents: Array<{ commandId: string; commandResult?: { outcome: string } }> }
    const event = document.auditEvents.find(value => value.commandId === command.commandId)!
    event.commandResult!.outcome = 'noop'
    await writeFile(path, JSON.stringify(document))
    await expect(readGovernanceCommandResult(root, command.commandId, actor))
      .rejects.toMatchObject({ code: 'AUDIT_CHAIN_INVALID' })
  })

  it('keeps a legacy audit event readable without adding fields or rewriting its bytes', async () => {
    const { root, actor } = await fixture()
    const current = await readGovernanceStore(root)
    const legacyDocument = appendGovernanceAudit(current.document, {
      commandId: 'legacy-command-result', reason: 'legacy audit', type: 'REVOKE_ROLE_ASSIGNMENT',
    }, actor, {
      action: 'REVOKE_ROLE_ASSIGNMENT', entityType: 'roleAssignment', entityId: 'rd', beforeHash: null, afterHash: null,
    })
    const path = getGovernancePaths(root).current
    await writeFile(path, `${JSON.stringify(legacyDocument, null, 2)}\n`)
    const before = await readFile(path, 'utf8')
    const legacyEvent = legacyDocument.auditEvents.find(value => value.commandId === 'legacy-command-result')!
    expect(legacyEvent.commandHashFormat).toBeUndefined()
    expect(legacyEvent.commandResult).toBeUndefined()
    const result = await readGovernanceCommandResult(root, 'legacy-command-result', actor)
    expect(result).toMatchObject({
      status: 'committed', commandId: 'legacy-command-result', commandHash: legacyEvent.commandHash,
      auditReference: legacyEvent.id, entityType: 'roleAssignment', entityId: 'rd', result: null,
    })
    expect(await readFile(path, 'utf8')).toBe(before)
    expect((await readGovernanceStore(root)).document.auditEvents.at(-1)?.eventHash).toBe(legacyEvent.eventHash)
  })
})
