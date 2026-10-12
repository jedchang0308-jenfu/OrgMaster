import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { createOrgmasterGovernanceMiddleware } from './orgmasterGovernanceApi'
import { ensureGovernanceStore, readGovernanceStore } from './orgmasterGovernanceStore'

it('routes restore/remove through managed draft CAS, audit, idempotent replay and persistent readback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orgmaster-assignment-lifecycle-'))
  await ensureGovernanceStore(root)
  const middleware = createOrgmasterGovernanceMiddleware(root, true)
  const server = createServer((request, response) => middleware(request, response, () => { response.statusCode = 404; response.end() }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const origin = `http://127.0.0.1:${port}/api/orgmaster/governance`
  const headers = { 'content-type': 'application/json', 'x-orgmaster-dev-issuer': 'urn:orgmaster:dev', 'x-orgmaster-dev-subject': 'local-admin' }
  let revision = (await readGovernanceStore(root)).revision
  const request = async (command: unknown, expectedRevision = revision, requestHeaders: Record<string, string> = headers) => {
    const response = await fetch(origin + '/draft', { method: 'PATCH', headers: requestHeaders, body: JSON.stringify({ expectedRevision, command }) })
    const body = await response.json()
    if (response.ok) revision = body.revision
    return { response, body }
  }
  try {
    const initial = await readGovernanceStore(root)
    const role = initial.document.draft.applicationRoles.find(role => role.id === 'role-orgmaster-admin')!
    const value = { id: 'restore-target', employeeId: 'employee-1', applicationId: 'orgmaster', roleId: role.id, roleCodeSnapshot: role.code, roleNameSnapshot: role.name, catalogVersion: null, scope: { kind: 'global' }, status: 'revoked', validFrom: '2026-01-01T00:00:00Z', validTo: null, effectState: 'orgmaster-enforced' }
    expect((await request({ type: 'UPSERT_ROLE_ASSIGNMENT', value, commandId: 'seed', reason: 'setup' })).response.status).toBe(200)
    const frozen = await readGovernanceStore(root)
    const restore = { type: 'RESTORE_ROLE_ASSIGNMENT', id: value.id, commandId: 'restore', reason: '啟用指派' }
    expect((await request(restore, revision, { 'content-type': 'application/json', cookie: 'orgmaster_dev_profile=employee' })).response.status).toBe(403)
    expect((await request(restore, 'stale')).response.status).toBe(409)
    const result = await request(restore)
    expect(result.response.status).toBe(200)
    expect(result.body.document.draft.roleAssignments[0]).toEqual({ ...frozen.document.draft.roleAssignments[0], status: 'active' })
    expect((await request(restore)).body.status).toBe('replayed')
    const remove = { type: 'REMOVE_ROLE_ASSIGNMENT', id: value.id, commandId: 'remove', reason: '刪除指派' }
    expect((await request(remove)).response.status).toBe(422)
    expect((await request({ type: 'REVOKE_ROLE_ASSIGNMENT', id: value.id, commandId: 'revoke', reason: '撤銷指派' })).response.status).toBe(200)
    expect((await request(remove)).response.status).toBe(200)
    expect((await request(remove)).body.status).toBe('replayed')
    expect((await request({ ...remove, reason: 'conflicting command reuse' })).response.status).toBe(409)
    const persisted = await readGovernanceStore(root)
    expect(persisted.document.draft.roleAssignments).toEqual([])
    expect(persisted.document.publishedVersions).toEqual(frozen.document.publishedVersions)
    expect(persisted.document.activePolicyVersionId).toBe(frozen.document.activePolicyVersionId)
    expect(persisted.document.auditEvents.filter(event => event.commandId === 'restore')).toHaveLength(1)
    expect(persisted.document.auditEvents.filter(event => event.commandId === 'remove')).toHaveLength(1)
    expect(persisted.document.auditEvents.at(-1)).toMatchObject({ entityId: value.id, action: 'REMOVE_ROLE_ASSIGNMENT', actorPrincipalId: 'dev-principal-local-admin' })
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await rm(root, { recursive: true, force: true })
  }
})
