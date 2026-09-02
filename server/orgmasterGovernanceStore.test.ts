import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { actorHasPolicyPermission, applyDraftCommand, createSeedDocument, ensureGovernanceStore, getGovernancePaths, readGovernanceStore, validateAssignmentCandidate, GovernanceStoreError } from './orgmasterGovernanceStore'
import { readAiPdmRoleCatalog } from '../src/governance/aiPdmCatalog'
describe('governance store', () => {
  it('seeds once and preserves revision on repeat read', async () => { const root = await mkdtemp(join(tmpdir(), 'orgmaster-dev027-')); const first = await ensureGovernanceStore(root); const second = await readGovernanceStore(root); expect(first.revision).toBe(second.revision); expect(second.document.auditEvents[0].action).toBe('GOVERNANCE_INITIALIZED') })
  it('fails closed when audit chain is tampered', async () => { const root = await mkdtemp(join(tmpdir(), 'orgmaster-dev027-')); await ensureGovernanceStore(root); const path = getGovernancePaths(root).current; const value = JSON.parse(await readFile(path, 'utf8')); value.auditEvents[0].reason = 'tampered'; await writeFile(path, JSON.stringify(value)); await expect(readGovernanceStore(root)).rejects.toMatchObject<GovernanceStoreError>({ code: 'AUDIT_CHAIN_INVALID' }) })
  it('requires an active global role and applies deny precedence for publish continuity', () => {
    const policy = createSeedDocument('2026-08-26T00:00:00.000Z').draft
    const actor = { principalId: 'principal-1', issuer: 'issuer-1', subject: 'subject-1', employeeId: 'employee-1', bootstrap: false }
    policy.identityLinks.push({ id: 'identity-1', principalId: actor.principalId, issuer: actor.issuer, subject: actor.subject, employeeId: actor.employeeId, status: 'active', validFrom: '2026-08-25T00:00:00.000Z', validTo: null })
    policy.roleAssignments.push({ id: 'assignment-1', employeeId: actor.employeeId, roleId: 'role-orgmaster-admin', scope: { kind: 'global' }, status: 'active', validFrom: '2026-08-25T00:00:00.000Z', validTo: null })
    expect(actorHasPolicyPermission(policy, actor, 'orgmaster.governance.manage', '2026-08-26T00:00:00.000Z')).toBe(true)
    policy.rolePermissionGrants.push({ id: 'deny-manage', roleId: 'role-orgmaster-admin', permissionId: 'permission-orgmaster-governance-manage', effect: 'deny' })
    expect(actorHasPolicyPermission(policy, actor, 'orgmaster.governance.manage', '2026-08-26T00:00:00.000Z')).toBe(false)
  })
  it('migrates a legacy V1 file into V2 without changing the V1 source', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orgmaster-dev037-migration-'))
    const legacy = createSeedDocument()
    const legacyRaw = `${JSON.stringify(legacy)}\n`
    await mkdir(join(root, 'data'), { recursive: true })
    await writeFile(getGovernancePaths(root).legacyV1, legacyRaw)
    const result = await ensureGovernanceStore(root)
    expect(result.document.schemaVersion).toBe(2)
    expect(result.document.migration.sourceSchemaVersion).toBe(1)
    expect(result.document.auditEvents.at(-1)?.action).toBe('GOVERNANCE_MIGRATED_V1_TO_V2')
    expect(await readFile(getGovernancePaths(root).legacyV1, 'utf8')).toBe(legacyRaw)
  })
  it('supports V2 assignment command idempotency and non-persisting candidate validation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orgmaster-dev037-command-'))
    const initial = await ensureGovernanceStore(root)
    const catalog = readAiPdmRoleCatalog('valid'); const role = catalog.roles.find((entry) => entry.stableRoleId === 'role-rd')!
    const command = { type: 'UPSERT_ROLE_ASSIGNMENT' as const, commandId: 'assignment-command-1', reason: 'test external assignment', value: { id: 'assignment-rd', employeeId: 'employee-1', applicationId: 'ai-pdm' as const, roleId: role.stableRoleId, roleCodeSnapshot: role.code, roleNameSnapshot: role.displayName, catalogVersion: catalog.catalogVersion, scope: { kind: 'workspace' as const, value: 'workspace-1' }, status: 'active' as const, validFrom: '2026-08-27T00:00:00.000Z', validTo: null, effectState: 'not-synchronized' as const } }
    const actor = { principalId: 'dev-principal-local-admin', issuer: 'urn:orgmaster:dev', subject: 'local-admin', employeeId: null, bootstrap: true }
    const applied = await applyDraftCommand(root, initial.revision, command, actor)
    expect(applied.status).toBe('applied')
    const replay = await applyDraftCommand(root, applied.revision, command, actor)
    expect(replay.status).toBe('replayed')
    expect(replay.revision).toBe(applied.revision)
    const candidate = await validateAssignmentCandidate(root, { ...command.value, id: undefined, catalogVersion: null })
    expect(candidate.status).toBe('invalid')
    expect(candidate.issues.some((issue) => issue.code === 'EXTERNAL_ASSIGNMENT_SNAPSHOT_INVALID')).toBe(true)
    const persisted = await readGovernanceStore(root)
    expect(persisted.document.draft.roleAssignments).toHaveLength(1)
    expect(persisted.document.auditEvents.filter((event) => event.commandId === command.commandId)).toHaveLength(1)
  })
})
