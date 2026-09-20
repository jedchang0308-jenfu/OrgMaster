import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { assertAuthorityOperation, buildAuthorityOperation, canonicalize, DEV013_AUTHORITY_TARGET, executeAuthorityOperation, sha256 } from './lib/dev013-production-authority-switch.mjs'

const sourceRevision = 'a'.repeat(40)
const baseNow = new Date('2026-09-21T01:00:00.000Z')

function rawOperation(operationKind = 'switch', authorityVersion = operationKind === 'rollback' ? 2 : 1) {
  const switchOperation = operationKind === 'switch'
  const preflight = operationKind === 'preflight'
  return {
    schemaVersion: 'jenfu.dev013.production-authority-operation.v1', operationKind, sourceRevision,
    projectId: 'jenfu-platform-prod', region: 'asia-east1', instance: 'jenfu-platform-prod-pg', database: 'jenfu_prod',
    applicationId: 'ai-pdm', employeeId: 'employee-shijie',
    fromAuthoritySource: switchOperation || preflight ? 'legacy_authority' : 'orgmaster_authority',
    toAuthoritySource: switchOperation ? 'orgmaster_authority' : 'legacy_authority',
    expectedAuthorityVersion: authorityVersion,
    expectedNextAuthorityVersion: preflight ? authorityVersion : authorityVersion + 1,
    expectedAssignmentVersionId: preflight ? null : 'assignment-policy-prod',
    expectedRoleCodes: preflight ? [] : ['rd', 'system_admin'],
    operationId: `dev013-p-both-employee-shijie-${operationKind}-v1`, batchId: 'DEV-013-P_BOTH-20260921',
    actor: 'jedchang0308@jenfu.com.tw', reason: `DEV-013 P_BOTH ${operationKind} single employee authority`,
    deadlineAt: '2026-09-21T03:00:00.000Z',
  }
}

function encode(raw) {
  const bytes = Buffer.from(`${canonicalize(raw)}\n`, 'utf8')
  return { bytes, hash: sha256(bytes) }
}

function governanceVersion({ systemAdmin = true } = {}) {
  const roles = [{ applicationId: 'ai-pdm', employeeId: 'employee-shijie', roleId: 'role-rd', roleCodeSnapshot: 'rd', catalogVersion: 'ai-pdm.role-catalog.2026-09-03.v3', subjectKind: 'employee', targetPrincipalId: null, scope: { kind: 'workspace', value: 'current' }, basis: 'manual', sources: [], status: 'active', validFrom: '2026-09-01T00:00:00.000Z', validTo: null }]
  if (systemAdmin) roles.push({ applicationId: 'ai-pdm', employeeId: 'employee-shijie', roleId: 'role-system-admin', roleCodeSnapshot: 'system_admin', catalogVersion: 'ai-pdm.role-catalog.2026-09-03.v3', subjectKind: 'principal', targetPrincipalId: 'principal-privileged', scope: { kind: 'global', value: null }, basis: 'manual', sources: [], status: 'active', validFrom: '2026-09-01T00:00:00.000Z', validTo: null })
  return {
    kind: 'assignment-governance-v3', id: 'assignment-policy-prod', versionNumber: 3, publishedAt: '2026-09-20T15:00:00.000Z',
    policy: {
      roleAssignments: roles,
      identityLinks: [{ id: 'link-privileged', employeeId: 'employee-shijie', principalId: 'principal-privileged', status: 'active', validFrom: '2026-09-01T00:00:00.000Z', validTo: null }],
      principalAdmissions: [{ identityLinkId: 'link-privileged', accountType: 'human_privileged', status: 'active' }],
      managementGrants: [{ employeeId: 'employee-shijie', principalId: 'principal-privileged', applicationId: 'ai-pdm', capability: 'orgmaster.cross_app_override', status: 'active', validFrom: '2026-09-01T00:00:00.000Z', validTo: null }],
    },
  }
}

function fakeDatabase({ systemAdmin = true, catalog = true, initialSource = 'legacy_authority', initialVersion = 1 } = {}) {
  const state = { source: initialSource, version: initialVersion, receipt: null, outbox: null }
  return {
    state,
    async query(sql, params = []) {
      if (sql.startsWith('SELECT current_database()')) return { rows: [{ database: 'jenfu_prod', user: DEV013_AUTHORITY_TARGET.login, postgresMajor: 17, migratorMember: true }] }
      if (sql.includes('FROM access_governance.application_authority_state')) return { rows: [{ authority_source: state.source, authority_version: state.version, override_operation_id: state.receipt?.operation_id ?? null }] }
      if (sql.includes('WITH active_batch AS')) return { rows: [{ batch_id: 'batch-prod', governance_hash: 'governance-hash', active_version_id: 'assignment-policy-prod', active_version: governanceVersion({ systemAdmin }) }] }
      if (sql.includes('FROM ai_pdm_contract.v_application_role_catalog_v1')) return { rows: catalog ? [
        { catalog_version: 'ai-pdm.role-catalog.2026-09-03.v3', stable_role_id: 'role-rd', role_code: 'rd', assignable: true, subject_kind: 'employee', allowed_scope_kinds: ['workspace'] },
        { catalog_version: 'ai-pdm.role-catalog.2026-09-03.v3', stable_role_id: 'role-system-admin', role_code: 'system_admin', assignable: true, subject_kind: 'principal', allowed_scope_kinds: ['global'] },
      ] : [] }
      if (sql.includes('FROM access_governance.v_active_principal_links_v1')) return { rows: [
        { principal_id: 'principal-personal', account_type: 'human_personal' },
        { principal_id: 'principal-privileged', account_type: 'human_privileged' },
      ] }
      if (sql.includes('FROM access_governance.v_effective_role_assignments_v1')) return { rows: state.source === 'orgmaster_authority' ? [{ role_code: 'rd' }, { role_code: 'system_admin' }] : [] }
      if (sql.includes('FROM access_governance.authority_switch_receipts')) return { rows: state.receipt ? [state.receipt] : [] }
      if (sql.includes('FROM access_governance.entitlement_change_outbox')) return { rows: state.outbox ? [state.outbox] : [] }
      if (sql.includes('switch_employee_entitlement_authority_v1')) {
        assert.deepEqual(params.slice(0, 2), ['ai-pdm', 'employee-shijie'])
        assert.equal(params[3], state.receipt ? state.receipt.authority_version - 1 : state.version)
        const replayed = state.receipt !== null
        if (!replayed) {
          const from = state.source
          state.source = params[2]; state.version = params[3] + 1
          state.receipt = { receipt_id: '00000000-0000-4000-8000-000000000001', operation_id: params[4], batch_id: params[5], application_id: params[0], employee_id: params[1], from_authority_source: from, to_authority_source: params[2], authority_version: state.version, assignment_version_id: params[6], session_refresh_state: 'pending', actor: params[7], reason: params[8], switched_at: '2026-09-21T01:00:01.000Z' }
          state.outbox = { event_id: '00000000-0000-4000-8000-000000000002', operation_id: params[4], employee_id: params[1], application_id: params[0], event_kind: 'authority_switch', actor: params[7], reason_code: 'entitlement_authority_switch', status: 'pending', attempt_count: 0, platform_receipt_id: null, created_at: '2026-09-21T01:00:01.000Z', completed_at: null }
        }
        return { rows: [{ receipt_id: state.receipt.receipt_id, authority_version: state.version, outbox_event_id: state.outbox.event_id, session_refresh_state: state.receipt.session_refresh_state, replayed }] }
      }
      if (sql.startsWith('BEGIN') || sql.startsWith('COMMIT') || sql.startsWith('ROLLBACK') || sql.includes('pg_advisory_xact_lock')) return { rows: [] }
      throw new Error(`unexpected query: ${sql}`)
    },
  }
}

test('operation manifest is source, target, employee, role-set and deadline bound', () => {
  const raw = rawOperation()
  const { bytes, hash } = encode(raw)
  assert.equal(assertAuthorityOperation(raw, { bytes, operationSha256: hash, sourceRevision, now: baseNow }).employeeId, 'employee-shijie')
  const wrong = { ...raw, employeeId: 'employee-other' }
  const encodedWrong = encode(wrong)
  assert.throws(() => assertAuthorityOperation(wrong, { bytes: encodedWrong.bytes, operationSha256: encodedWrong.hash, sourceRevision, now: baseNow }), /DEV013_AUTHORITY_OPERATION_INVALID/u)
  const noSystemAdmin = { ...raw, expectedRoleCodes: ['rd'] }
  const encodedNoSystemAdmin = encode(noSystemAdmin)
  assert.throws(() => assertAuthorityOperation(noSystemAdmin, { bytes: encodedNoSystemAdmin.bytes, operationSha256: encodedNoSystemAdmin.hash, sourceRevision, now: baseNow }), /DEV013_AUTHORITY_BINDING_INVALID/u)
})

test('manifest builder derives switch and rollback bindings only from matching immutable evidence', () => {
  const preflight = { schemaVersion: 'jenfu.dev013.production-authority-preflight.v1', sourceRevision, target: { projectId: 'jenfu-platform-prod', database: 'jenfu_prod', applicationId: 'ai-pdm', employeeId: 'employee-shijie' }, state: { authoritySource: 'legacy_authority', authorityVersion: 1, assignmentVersionId: 'assignment-policy-prod', roles: ['rd', 'system_admin'], projectionReady: true, projectedRoleCodes: ['rd', 'system_admin'] }, mutationCount: 0, status: 'PASS' }
  const switchOperation = buildAuthorityOperation({ operationKind: 'switch', sourceRevision, deadlineAt: '2026-09-21T03:00:00.000Z', evidence: preflight })
  assert.deepEqual(switchOperation.expectedRoleCodes, ['rd', 'system_admin'])
  assert.equal(switchOperation.expectedAssignmentVersionId, 'assignment-policy-prod')
  const switchReceipt = { schemaVersion: 'jenfu.dev013.production-authority-switch-receipt.v1', sourceRevision, operationKind: 'switch', target: preflight.target, transition: { toAuthoritySource: 'orgmaster_authority', toAuthorityVersion: 2 }, governance: { assignmentVersionId: 'assignment-policy-prod', roles: ['rd', 'system_admin'] }, databaseEffect: 'APPLIED_ONCE', replaySafe: true, status: 'PASS' }
  const rollback = buildAuthorityOperation({ operationKind: 'rollback', sourceRevision, deadlineAt: '2026-09-21T03:00:00.000Z', evidence: switchReceipt })
  assert.equal(rollback.fromAuthoritySource, 'orgmaster_authority')
  assert.equal(rollback.toAuthoritySource, 'legacy_authority')
  assert.equal(rollback.expectedAuthorityVersion, 2)
  const retryPreflight = { ...preflight, state: { ...preflight.state, authorityVersion: 3 } }
  const retrySwitch = buildAuthorityOperation({ operationKind: 'switch', sourceRevision, deadlineAt: '2026-09-21T03:00:00.000Z', evidence: retryPreflight })
  assert.equal(retrySwitch.expectedAuthorityVersion, 3)
  assert.equal(retrySwitch.expectedNextAuthorityVersion, 4)
  const retryRollback = buildAuthorityOperation({ operationKind: 'rollback', sourceRevision, deadlineAt: '2026-09-21T03:00:00.000Z', evidence: { ...switchReceipt, transition: { toAuthoritySource: 'orgmaster_authority', toAuthorityVersion: 4 } } })
  assert.equal(retryRollback.expectedAuthorityVersion, 4)
  assert.equal(retryRollback.expectedNextAuthorityVersion, 5)
})

test('operator profile and image build stay inside the exact one-time job boundary', () => {
  const profile = JSON.parse(fs.readFileSync(new URL('../config/release/dev013-p-both-authority-switch.json', import.meta.url), 'utf8'))
  assert.equal(profile.projectId, 'jenfu-platform-prod')
  assert.equal(profile.jobName, 'orgmaster-prod-dev013-p-both-employee-shijie')
  assert.equal(profile.serviceAccount, DEV013_AUTHORITY_TARGET.serviceAccount)
  assert.equal(profile.employeeId, 'employee-shijie')
  assert.deepEqual(profile.allowedTransitions, ['legacy_authority:1->orgmaster_authority:2', 'orgmaster_authority:2->legacy_authority:3', 'legacy_authority:3->orgmaster_authority:4', 'orgmaster_authority:4->legacy_authority:5'])
  const dockerfile = fs.readFileSync(new URL('../infra/google-cloud/dev-040-production-release/authority-switch-runner.Dockerfile', import.meta.url), 'utf8')
  const cloudBuild = fs.readFileSync(new URL('../infra/google-cloud/dev-040-production-release/authority-switch-cloudbuild.yaml', import.meta.url), 'utf8')
  assert.match(dockerfile, /ENTRYPOINT \["node", "scripts\/dev013-production-authority-switch-runner\.mjs"\]/u)
  assert.match(dockerfile, /org\.opencontainers\.image\.revision=\$SOURCE_REVISION/u)
  assert.doesNotMatch(`${dockerfile}\n${cloudBuild}`, /terraform|gcloud run services|set-traffic|secret versions|migration-bundle/u)
})

test('preflight proves exact legacy state and current privileged policy without mutation', async () => {
  const database = fakeDatabase()
  const receipt = await executeAuthorityOperation({ database, operation: rawOperation('preflight'), now: () => '2026-09-21T01:00:00.000Z' })
  assert.equal(receipt.schemaVersion, 'jenfu.dev013.production-authority-preflight.v1')
  assert.equal(receipt.state.authoritySource, 'legacy_authority')
  assert.deepEqual(receipt.state.roles, ['rd', 'system_admin'])
  assert.equal(receipt.mutationCount, 0)
  assert.equal(database.state.receipt, null)
})

test('switch calls the existing CAS function, verifies receipt/outbox and is replayable', async () => {
  const database = fakeDatabase()
  const operation = rawOperation('switch')
  const first = await executeAuthorityOperation({ database, operation, now: (() => { let tick = 0; return () => `2026-09-21T01:00:0${tick++}.000Z` })() })
  assert.equal(first.transition.toAuthoritySource, 'orgmaster_authority')
  assert.equal(first.transition.toAuthorityVersion, 2)
  assert.equal(first.outbox.status, 'pending')
  assert.equal(first.replaySafe, true)
  assert.equal(first.mutationCount, 3)
  const replay = await executeAuthorityOperation({ database, operation, now: (() => { let tick = 4; return () => `2026-09-21T01:00:0${tick++}.000Z` })() })
  assert.equal(replay.replaySafe, true)
  assert.equal(replay.mutationCount, 3)
  assert.equal(replay.databaseReceipt.receiptId, first.databaseReceipt.receiptId)
  assert.equal(canonicalize(replay), canonicalize(first))
})

test('missing active privileged system admin fails before the CAS function', async () => {
  const database = fakeDatabase({ systemAdmin: false })
  await assert.rejects(executeAuthorityOperation({ database, operation: rawOperation('switch'), now: () => '2026-09-21T01:00:00.000Z' }), /DEV013_AUTHORITY_SYSTEM_ADMIN_INVALID/u)
  assert.equal(database.state.source, 'legacy_authority')
})

test('missing active AI-PDM role catalog fails during zero-mutation preflight', async () => {
  const database = fakeDatabase({ catalog: false })
  await assert.rejects(executeAuthorityOperation({ database, operation: rawOperation('preflight'), now: () => '2026-09-21T01:00:00.000Z' }), /DEV013_AUTHORITY_PROJECTION_NOT_READY/u)
  assert.equal(database.state.source, 'legacy_authority')
  assert.equal(database.state.receipt, null)
})

test('post-rollback authority version can retry through the exact 3 to 4 transition', async () => {
  const database = fakeDatabase({ initialVersion: 3 })
  const operation = rawOperation('switch', 3)
  const receipt = await executeAuthorityOperation({ database, operation, now: (() => { let tick = 0; return () => `2026-09-21T01:00:0${tick++}.000Z` })() })
  assert.equal(receipt.transition.fromAuthorityVersion, 3)
  assert.equal(receipt.transition.toAuthorityVersion, 4)
  assert.deepEqual(receipt.governance.effectiveRoleCodes, ['rd', 'system_admin'])
})
