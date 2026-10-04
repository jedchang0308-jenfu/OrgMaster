import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import pg from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { createOrgDocumentFile } from '../src/documentStorage'
import { readAiPdmRoleCatalog } from '../src/governance/aiPdmCatalog'
import { applyGovernanceCommandV3 } from '../src/governance/commands'
import { createSeedDocumentV2 } from '../src/governance/migrateGovernanceV1ToV2'
import { migrateGovernanceV2ToV3 } from '../src/governance/migrateGovernanceV2ToV3'
import type { GovernanceRoleAssignmentV2 } from '../src/governance/types'
import { validateDocumentV3 } from '../src/governance/validation'
import { screenshotOrganizationState } from '../src/screenshotData'
import { createWorkspaceManifest } from '../src/versionWorkspace'
import { createOrgmasterGovernanceMiddleware } from './orgmasterGovernanceApi'
import { closeOrgmasterPersistencePool, withPersistenceTransaction, writePersistenceArtifacts } from './orgmasterPersistenceRepository'
import { readFinancialRoleCatalog } from './financialRoleCatalogRepository'
import { setVerifiedRequestIdentity } from './orgmasterRequestIdentity'
import { createOrgmasterSessionRepository, type OrgmasterSession } from './orgmasterSessionRepository'
import { applyDraftCommand, readGovernanceStore } from './orgmasterGovernanceStore'
import { assertCurrentGovernanceWriteActor } from './orgmasterGovernanceWriteActor'
import { createPrincipalAdmissionRepository } from './orgmasterPrincipalAdmissionRepository'

const now = '2026-09-29T12:00:00.000Z'
const actor = {
  principalId: process.env.DEV057_PRODUCT_GOVERNANCE_PRINCIPAL ?? 'managed-principal-fixture',
  employeeId: process.env.DEV057_PRODUCT_GOVERNANCE_EMPLOYEE ?? 'employee-managed-fixture',
  issuer: process.env.DEV057_PRODUCT_GOVERNANCE_ISSUER ?? 'managed-issuer-fixture',
  subject: process.env.DEV057_PRODUCT_GOVERNANCE_SUBJECT ?? 'managed-subject-fixture', bootstrap: false,
}
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

function productFixture() {
  const state = {
    ...screenshotOrganizationState,
    employees: [...screenshotOrganizationState.employees.filter(employee => employee.id !== actor.employeeId), {
      ...screenshotOrganizationState.employees[0], id: actor.employeeId,
      name: '合成驗證者', status: 'active' as const, departmentIds: [], primaryAssignmentId: null,
    }],
  }
  const workspace = createOrgDocumentFile(state, 'document', now)
  const manifest = createWorkspaceManifest('current', now)
  const document = migrateGovernanceV2ToV3(createSeedDocumentV2(now), 'fixture-v2', readAiPdmRoleCatalog(), now)
  document.draft.identityLinks = []
  document.draft.principalAdmissions = []
  document.draft.roleAssignments = [{ id: 'manager-assignment', employeeId: actor.employeeId,
    applicationId: 'orgmaster', roleId: 'role-orgmaster-admin', roleCodeSnapshot: 'orgmaster_admin',
    roleNameSnapshot: 'OrgMaster 管理者', catalogVersion: null, scope: { kind: 'global' },
    status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null,
    effectState: 'orgmaster-enforced', basis: 'manual', sources: [], subjectKind: 'employee',
    targetPrincipalId: null, createdByPrincipalId: actor.principalId }]
  const { basePolicyVersionId: _base, updatedAt: _updated, ...policy } = document.draft
  const version = {
    kind: 'assignment-governance-v3' as const, id: 'product-seed', versionNumber: 1,
    publishedAt: now, publishedByPrincipalId: actor.principalId, publishReason: 'fixture',
    snapshotHash: 'fixture-hash', effectState: 'not-synchronized' as const,
    policy, externalRoleCatalogs: [], organizationSnapshot: {
      workspaceVersionId: 'current', workspaceRevision: sha256(JSON.stringify(workspace)),
      capturedAt: now, employees: [{ id: actor.employeeId, primaryAssignmentId: null }],
      departments: [], organizationRoles: [], positions: [], assignments: [],
    },
  }
  document.activePolicyVersionId = version.id
  document.publishedVersions.push(version)
  return { workspace, manifest, document, state }
}

function productRoleAssignment(): GovernanceRoleAssignmentV2 {
  const catalog = readAiPdmRoleCatalog()
  const role = catalog.roles.find((candidate) => candidate.code === 'rd_manager')
  if (!role) throw new Error('RD_MANAGER_CATALOG_ROLE_MISSING')
  return {
    id: 'product-rd-manager', employeeId: actor.employeeId, applicationId: 'ai-pdm',
    roleId: role.stableRoleId, roleCodeSnapshot: role.code, roleNameSnapshot: role.displayName,
    catalogVersion: catalog.catalogVersion, scope: { kind: 'workspace', value: 'company-jenfu' },
    status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null,
    effectState: 'not-synchronized',
  }
}

describe('DEV-057 management API fixture', () => {
  it('has a valid published Principal manager before PostgreSQL integration', async () => {
    const fixture = productFixture()
    const financial = await readFinancialRoleCatalog()
    expect(validateDocumentV3(fixture.document, {
      workspaceVersionId: 'current', workspaceRevision: sha256(JSON.stringify(fixture.workspace)),
      sourceDataAt: now, state: fixture.state,
    }, [readAiPdmRoleCatalog(), financial])).toEqual([])
  })

  it('accepts the V2-shaped management command that the product route normalizes', async () => {
    const fixture = productFixture()
    const financial = await readFinancialRoleCatalog()
    const applied = applyGovernanceCommandV3(fixture.document, {
      type: 'UPSERT_ROLE_ASSIGNMENT', commandId: 'product-assign',
      reason: 'task-owned Principal grant', value: productRoleAssignment(),
    }, actor.principalId, {
      workspaceVersionId: 'current', workspaceRevision: sha256(JSON.stringify(fixture.workspace)),
      sourceDataAt: now, state: fixture.state,
    }, [readAiPdmRoleCatalog(), financial])
    expect(applied.status).toBe('applied')
  })
})

const adminUrl = process.env.DEV057_PRODUCT_GOVERNANCE_ADMIN_URL
const runtimeUrl = process.env.DEV057_PRODUCT_GOVERNANCE_RUNTIME_URL
const consumerUrl = process.env.DEV057_PRODUCT_GOVERNANCE_CONSUMER_URL

describe.skipIf(!adminUrl || !runtimeUrl || !consumerUrl)('DEV-057 management HTTP to published PostgreSQL grant', () => {
  afterAll(async () => { await closeOrgmasterPersistencePool() })

  it('publishes and revokes a Principal grant through the product command', async () => {
    if (!adminUrl || !runtimeUrl || !consumerUrl) throw new Error('DEV057_PRODUCT_GOVERNANCE_URLS_REQUIRED')
    const fixture = productFixture()
    const startedAt = Date.now()
    // Fixed stages and scalar outcomes only: never emit identity, session, URL or SQL payload.
    const checkpoint = (stage: string, detail: Record<string, string | number | boolean> = {}) => {
      // Vitest's agent reporter suppresses passing console logs; stdout is the scalar protocol transport.
      process.stdout.write(JSON.stringify({ dev057GovernanceCheckpoint: { stage, elapsedMs: Date.now() - startedAt, ...detail } }) + '\n')
    }
    const admin = new pg.Client({ connectionString: adminUrl })
    const consumer = new pg.Client({ connectionString: consumerUrl })
    const priorMode = process.env.ORGMASTER_PERSISTENCE_MODE
    const priorUrl = process.env.ORGMASTER_POSTGRES_URL
    let server: ReturnType<typeof createServer> | null = null
    let runtime: pg.Client | null = null
    // Activity snapshots must not be polled from the transaction holding the race lock.
    const observer = new pg.Client({ connectionString: adminUrl, application_name: 'dev057-lock-observer' })
    try {
      await admin.connect()
      await consumer.connect()
      await observer.connect()
      const authority = await admin.query<{ active_batch_id: string }>('SELECT active_batch_id FROM orgmaster_core.persistence_authority WHERE singleton=true')
      expect(authority.rowCount).toBe(1)
      for (const [key, payload] of [
        ['orgmaster-workspace.v1.json', fixture.manifest],
        ['orgmaster-versions/current.json', fixture.workspace],
        ['orgmaster-governance.v3.json', fixture.document],
      ] as const) {
        const raw = JSON.stringify(payload)
        const digest = sha256(raw)
        const updated = await admin.query(`UPDATE orgmaster_core.persistence_artifacts
          SET payload=$1::jsonb, source_sha256=$2, canonical_sha256=$2, source_bytes=$3
          WHERE batch_id=$4::uuid AND artifact_key=$5`,
          [raw, digest, Buffer.byteLength(raw), authority.rows[0].active_batch_id, key])
        expect(updated.rowCount).toBe(1)
      }
      const typedBefore = await consumer.query(`SELECT principal_id, employee_id, account_type
        FROM orgmaster_contract.v_active_principal_accounts_v1
        WHERE principal_id=$1 AND principal_issuer=$2 AND principal_subject=$3`,
      [actor.principalId, actor.issuer, actor.subject])
      expect(typedBefore.rows).toEqual([{
        principal_id: actor.principalId, employee_id: actor.employeeId,
        account_type: 'human_personal',
      }])
      process.env.ORGMASTER_PERSISTENCE_MODE = 'cloud-sql'
      process.env.ORGMASTER_POSTGRES_URL = runtimeUrl
      runtime = new pg.Client({ connectionString: runtimeUrl, application_name: 'dev057-governance-session' })
      await runtime.connect()
      const initialized = await admin.query("SELECT * FROM platform_core.initialize_principal_security_state_v1($1)", [actor.principalId])
      expect(initialized.rowCount).toBe(1)
      const sessionHash = sha256('task-owned-governance-session')
      let session: OrgmasterSession = await createOrgmasterSessionRepository(runtime).create({
        sessionIdHash: sessionHash, identityIssuer: actor.issuer, identitySubject: actor.subject,
        principalId: actor.principalId, employeeId: actor.employeeId,
        authEpoch: 0, sessionSchemaVersion: 2, epochKind: 'principal',
        principalAuthEpoch: Number(initialized.rows[0].auth_epoch),
        issuedAt: new Date().toISOString(), authenticatedAt: new Date().toISOString(),
        expiresAt: '2027-01-01T00:00:00.000Z', assuranceLevel: 'aal1',
      })
      const middleware = createOrgmasterGovernanceMiddleware(process.cwd(), false)
      server = createServer((request, response) => {
        setVerifiedRequestIdentity(request, session)
        middleware(request, response, () => { response.statusCode = 404; response.end() })
      })
      await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('TASK_OWNED_HTTP_PORT_UNAVAILABLE')
      const origin = `http://127.0.0.1:${address.port}`
      const call = async (method: string, path: string, body?: unknown) => {
        const response = await fetch(`${origin}/api/orgmaster/governance${path}`, {
          method, headers: body === undefined ? undefined : { 'content-type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
        return { status: response.status, body: await response.json() as Record<string, any> }
      }
      checkpoint('read-before')
      const sessionRead = await call('GET', '/session')
      expect(sessionRead).toMatchObject({ status: 200, body: { actor: { principalId: actor.principalId, employeeId: actor.employeeId }, capabilities: { manage: true, publish: true } } })
      let revision = (await call('GET', '/')).body.revision as string
      checkpoint('read-after', { status: sessionRead.status })
      const assignment = productRoleAssignment()
      const draft = await call('PATCH', '/draft', { expectedRevision: revision, command: {
        type: 'UPSERT_ROLE_ASSIGNMENT', commandId: 'product-assign', reason: 'task-owned Principal grant', value: assignment,
      } })
      expect(draft.status).toBe(200)
      revision = draft.body.revision
      checkpoint('publish-before')
      const published = await call('POST', '/versions', { expectedRevision: revision,
        commandId: 'product-publish-assign', reason: 'task-owned Principal grant', organizationVersionId: 'current' })
      expect(published.status).toBe(201)
      revision = published.body.revision
      const typedAfter = await consumer.query(`SELECT principal_id, employee_id, account_type
        FROM orgmaster_contract.v_active_principal_accounts_v1
        WHERE principal_id=$1 AND principal_issuer=$2 AND principal_subject=$3`,
      [actor.principalId, actor.issuer, actor.subject])
      expect(typedAfter.rows).toEqual(typedBefore.rows)
      const assigned = await consumer.query(`SELECT role_code, scope_kind, scope_key
        FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v3
        WHERE principal_id=$1 AND assignment_id='product-rd-manager'`, [actor.principalId])
      expect(assigned.rows).toEqual([{ role_code: 'rd_manager', scope_kind: 'workspace', scope_key: 'company-jenfu' }])
      checkpoint('publish-after', { status: published.status })
      checkpoint('revoke-before')
      const revokedDraft = await call('PATCH', '/draft', { expectedRevision: revision, command: {
        type: 'REVOKE_ROLE_ASSIGNMENT', commandId: 'product-revoke', reason: 'task-owned revocation', id: assignment.id,
      } })
      expect(revokedDraft.status).toBe(200)
      const revokedPublish = await call('POST', '/versions', { expectedRevision: revokedDraft.body.revision,
        commandId: 'product-publish-revoke', reason: 'task-owned revocation', organizationVersionId: 'current' })
      expect(revokedPublish.status).toBe(201)
      const revoked = await consumer.query(`SELECT assignment_id
        FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v3
        WHERE principal_id=$1 AND assignment_id='product-rd-manager'`, [actor.principalId])
      expect(revoked.rowCount).toBe(0)
      checkpoint('revoke-after', { status: revokedPublish.status })

      // Task-owned disposable setup is read back; all raced withdrawals below use
      // their actual owner routines. The injected identity is still synthetic SSO evidence.
      // Each native writer creates a new active batch; never restore or inspect the retired seed batch.
      const readActiveFixtureArtifacts = async () => (await admin.query(`SELECT artifact.artifact_key,
        artifact.payload, artifact.source_sha256, artifact.canonical_sha256, artifact.source_bytes
        FROM orgmaster_core.persistence_artifacts artifact
        JOIN orgmaster_core.persistence_authority authority ON authority.active_batch_id=artifact.batch_id
        JOIN orgmaster_core.persistence_batches batch ON batch.id=artifact.batch_id AND batch.status='active'
        WHERE authority.singleton=true
          AND artifact.artifact_key IN ('orgmaster-governance.v3.json','orgmaster-versions/current.json')
        ORDER BY artifact.artifact_key`)).rows
      const artifactReadback = (rows: Awaited<ReturnType<typeof readActiveFixtureArtifacts>>) => rows.map(row => ({
        key: row.artifact_key, payloadSha256: sha256(JSON.stringify(row.payload)),
        sourceSha256: row.source_sha256.trim(), canonicalSha256: row.canonical_sha256.trim(),
        sourceBytes: row.source_bytes,
      }))
      const baselineArtifacts = await readActiveFixtureArtifacts()
      expect(baselineArtifacts).toHaveLength(2)
      const baselineReadback = artifactReadback(baselineArtifacts)
      const baselineGovernance = baselineArtifacts.find(row => row.artifact_key === 'orgmaster-governance.v3.json')!
      const baselineManaged = (await admin.query('SELECT identity_record_id,link_state FROM orgmaster_core.managed_daily_identities WHERE principal_id=$1 AND employee_id=$2', [actor.principalId, actor.employeeId])).rows[0]
      const baselineAdmission = (await admin.query('SELECT admission_enabled FROM orgmaster_core.managed_identity_admission_authority WHERE singleton=true')).rows[0]
      type LifecycleEvent = Record<string, unknown> & {
        event_id: string; operation_id: string; employee_id: string; application_id: string;
        event_kind: string; actor: string; reason_code: string; status: string;
        attempt_count: number; platform_receipt_id: string | null;
      }
      // Keep exact baseline events and bytes in RAM. Isolation cleanup never fabricates a completion receipt.
      const readLifecycleEvents = async () => (await admin.query<{ event: LifecycleEvent }>(
        'SELECT to_jsonb(lifecycle) AS event FROM orgmaster_core.managed_identity_lifecycle_outbox lifecycle ORDER BY event_id',
      )).rows.map(row => row.event)
      const lifecycleDigest = (events: LifecycleEvent[]) => sha256(JSON.stringify(events))
      const baselineLifecycle = await readLifecycleEvents()
      const baselineLifecycleDigest = lifecycleDigest(baselineLifecycle)
      const effects = async () => (await admin.query(`SELECT
        (SELECT jsonb_agg(jsonb_build_array(artifact_key,trim(canonical_sha256)) ORDER BY artifact_key)
          FROM orgmaster_core.persistence_artifacts WHERE batch_id=(
            SELECT active_batch_id FROM orgmaster_core.persistence_authority WHERE singleton=true)) AS artifacts,
        (SELECT active_batch_id::text FROM orgmaster_core.persistence_authority WHERE singleton=true) AS active_batch_id,
        (SELECT authority_version::text FROM orgmaster_core.persistence_authority WHERE singleton=true) AS authority_version,
        (SELECT count(*)::int FROM orgmaster_core.entitlement_change_outbox) AS entitlement_outbox,
        (SELECT count(*)::int FROM orgmaster_core.managed_identity_lifecycle_outbox) AS lifecycle_outbox`)).rows[0]
      const taskRoles = [new URL(runtimeUrl).username, new URL(consumerUrl).username]
      const safeStatementNames = ['write_active_persistence_artifacts_with_identity_fence_v1',
        'read_active_persistence_artifact_v1', 'read_active_persistence_authority_v1',
        'v_orgmaster_session_principals_v2', 'read_principal_auth_state_v3', 'app_sessions']
      const safeApiCodes = new Set(['IDENTITY_CONTEXT_REQUIRED', 'IDENTITY_AUTHORITY_UNAVAILABLE',
        'GOVERNANCE_ADMIN_REQUIRED', 'GOVERNANCE_PUBLISH_REQUIRED', 'GOVERNANCE_VALIDATION_FAILED',
        'GOVERNANCE_READ_FAILED', 'REVISION_CONFLICT', 'COMMAND_ID_REUSED', 'EMPLOYEE_NOT_ACTIVE',
        'INVALID_JSON', 'EXTERNAL_CATALOG_READ_ONLY', 'GOVERNANCE_WRITE_FAILED', 'ORGANIZATION_REVISION_CONFLICT'])
      const lockDiagnostic = async (stage: string, forStage: string, outcome: Record<string, string | number>) => {
        const active = await observer.query<{ usename: string; query: string; wait_event_type: string | null; wait_event: string | null }>(
          `SELECT usename, query, wait_event_type, wait_event FROM pg_stat_activity
           WHERE datname=current_database() AND pid<>pg_backend_pid()
             AND usename=ANY($1::text[]) AND state='active' ORDER BY pid`, [taskRoles])
        // SQL text is read only in RAM and converted to fixed source-owned names.
        const activity = active.rows.map(row => ({
          role: row.usename === taskRoles[0] ? 'own-runtime' : 'consumer-runtime',
          statement: safeStatementNames.find(name => row.query.includes(name)) ?? 'OTHER_TASK_QUERY',
          waitingForLock: row.wait_event_type === 'Lock',
          lockKind: row.wait_event_type !== 'Lock' ? 'NONE'
            : ['transactionid', 'tuple', 'relation', 'virtualxid', 'advisory', 'extend'].includes(row.wait_event ?? '') ? row.wait_event : 'OTHER_LOCK',
        }))
        process.stdout.write(JSON.stringify({ dev057GovernanceDiagnostic: {
          stage, forStage, elapsedMs: Date.now() - startedAt, http: outcome, activity,
        } }) + '\n')
      }
      const waitForLock = async (queryPattern: string, stage: string, httpOutcome = () => ({ state: 'NOT_HTTP' } as Record<string, string | number>)) => {
        checkpoint('lock-wait-before', { forStage: stage })
        const deadline = Date.now() + 5000
        await lockDiagnostic('before', stage, httpOutcome())
        while (Date.now() < deadline) {
          const waiting = await observer.query(`SELECT 1 FROM pg_stat_activity
            WHERE pid<>pg_backend_pid() AND datname=current_database() AND usename=ANY($2::text[])
              AND state='active' AND wait_event_type='Lock' AND query LIKE $1`, [queryPattern, taskRoles])
          if (waiting.rowCount) {
            checkpoint('lock-wait-observed', { forStage: stage })
            await lockDiagnostic('observed', stage, httpOutcome())
            return
          }
          await new Promise(resolve => setTimeout(resolve, 10))
        }
        checkpoint('lock-wait-expired', { forStage: stage })
        await lockDiagnostic('expired', stage, httpOutcome())
        throw new Error('EXPECTED_NATIVE_LOCK_WAIT_NOT_OBSERVED')
      }
      const makeSession = async () => {
        const state = (await runtime!.query('SELECT auth_epoch FROM platform_contract.read_principal_auth_state_v3($1)', [actor.principalId])).rows[0]
        await new Promise(resolve => setTimeout(resolve, 2))
        return createOrgmasterSessionRepository(runtime!).create({
          sessionIdHash: sha256('task-owned-session-' + Math.random()), identityIssuer: actor.issuer, identitySubject: actor.subject,
          principalId: actor.principalId, employeeId: actor.employeeId, authEpoch: 0,
          sessionSchemaVersion: 2, epochKind: 'principal', principalAuthEpoch: Number(state.auth_epoch),
          issuedAt: new Date().toISOString(), authenticatedAt: new Date().toISOString(),
          expiresAt: '2027-01-01T00:00:00.000Z', assuranceLevel: 'aal1',
        })
      }
      const assertNativeFixturePositive = async () => {
        const typed = await consumer.query(
          'SELECT principal_id,employee_id,account_type FROM orgmaster_contract.v_active_principal_accounts_v1 WHERE principal_id=$1 AND principal_issuer=$2 AND principal_subject=$3',
          [actor.principalId, actor.issuer, actor.subject])
        expect(sha256(JSON.stringify(typed.rows))).toBe(sha256(JSON.stringify(typedBefore.rows)))
        const principal = await createPrincipalAdmissionRepository(runtime!).resolveActivePrincipal(actor.issuer, actor.subject)
        expect(principal.principalId === actor.principalId && principal.employeeId === actor.employeeId).toBe(true)
        await assertCurrentGovernanceWriteActor(runtime!, { ...actor, sessionId: session.id,
          authenticatedAt: session.authenticatedAt, principalAuthEpoch: session.principalAuthEpoch,
          assuranceLevel: session.assuranceLevel }, false)
      }
      const restoreDisposableFixture = async (caseLifecycleEvents: LifecycleEvent[]) => {
        await admin.query('RESET ROLE')
        await admin.query('BEGIN')
        try {
          await admin.query('SELECT 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton=true FOR UPDATE')
          const active = await admin.query(`SELECT authority.active_batch_id FROM orgmaster_core.persistence_authority authority
            JOIN orgmaster_core.persistence_batches batch ON batch.id=authority.active_batch_id AND batch.status='active'
            WHERE authority.singleton=true FOR UPDATE OF authority`)
          expect(active.rowCount).toBe(1)
          for (const row of baselineArtifacts) {
            const restored = await admin.query(`UPDATE orgmaster_core.persistence_artifacts
              SET payload=$1::jsonb, source_sha256=$2, canonical_sha256=$3, source_bytes=$4
              WHERE batch_id=$5::uuid AND artifact_key=$6`,
              [JSON.stringify(row.payload), row.source_sha256, row.canonical_sha256, row.source_bytes, active.rows[0].active_batch_id, row.artifact_key])
            expect(restored.rowCount).toBe(1)
          }
          // The committed withdrawal and candidate no-effects assertions already ran. Delete only
          // exact new synthetic events from this case; preserve every baseline event and monotonic revisions.
          const expectedLifecycle = [...baselineLifecycle, ...caseLifecycleEvents]
            .sort((left, right) => left.event_id.localeCompare(right.event_id))
          expect(lifecycleDigest(await readLifecycleEvents())).toBe(lifecycleDigest(expectedLifecycle))
          for (const event of caseLifecycleEvents) {
            const removed = await admin.query(
              'DELETE FROM orgmaster_core.managed_identity_lifecycle_outbox lifecycle WHERE event_id=$1::uuid AND to_jsonb(lifecycle)=$2::jsonb',
              [event.event_id, JSON.stringify(event)])
            expect(removed.rowCount).toBe(1)
          }
          expect(lifecycleDigest(await readLifecycleEvents())).toBe(baselineLifecycleDigest)
          const managed = await admin.query('UPDATE orgmaster_core.managed_daily_identities SET link_state=$1 WHERE identity_record_id=$2::uuid AND principal_id=$3 AND employee_id=$4',
            [baselineManaged.link_state, baselineManaged.identity_record_id, actor.principalId, actor.employeeId])
          expect(managed.rowCount).toBe(1)
          const admission = await admin.query('UPDATE orgmaster_core.managed_identity_admission_authority SET admission_enabled=$1 WHERE singleton=true', [baselineAdmission.admission_enabled])
          expect(admission.rowCount).toBe(1)
          expect(artifactReadback(await readActiveFixtureArtifacts())).toEqual(baselineReadback)
          await admin.query('COMMIT')
        } catch (error) { await admin.query('ROLLBACK'); throw error }
        session = await makeSession()
        await assertNativeFixturePositive()
        // Prove the real runtime reader follows the restored current authority before the next race.
        expect((await readGovernanceStore(process.cwd())).revision).toBe(baselineGovernance.canonical_sha256.trim())
        expect((await call('GET', '/session')).body.capabilities).toMatchObject({ manage: true, publish: true })
      }
      const runtimeWrite = async (key: string, kind: 'governance' | 'workspace-version', payload: Record<string, unknown>, expected: string) => {
        await admin.query('SET LOCAL ROLE jenfu_orgmaster_runtime')
        await writePersistenceArtifacts([{ artifactKey: key, artifactKind: kind, payload,
          raw: JSON.stringify(payload), expectedRevision: expected, localPath: 'unused-cloud-sql' }],
          { database: admin, updatedBy: 'task-owned-withdrawal', reasonCode: 'task-owned-withdrawal' })
        await admin.query('SET LOCAL ROLE NONE')
      }
      for (const withdrawal of ['session', 'epoch', 'governance-cas', 'workspace', 'managed-quarantine', 'admission'] as const) {
        await assertNativeFixturePositive()
        checkpoint('race-before', { withdrawal })
        const observed = await readGovernanceStore(process.cwd())
        const commandId = 'race-' + withdrawal
        await admin.query('BEGIN')
        let attempt: ReturnType<typeof call> | undefined
        let httpOutcome: Record<string, string | number> = { state: 'PENDING' }
        let caseLifecycleEvents: LifecycleEvent[] = []
        let withdrawalProved = false
        try {
          await admin.query('SELECT 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton=true FOR UPDATE')
          attempt = call('PATCH', '/draft', { expectedRevision: observed.revision, command: {
            type: 'UPSERT_ROLE_ASSIGNMENT', commandId, reason: 'task-owned raced write',
            value: { ...assignment, id: commandId },
          } })
          void attempt.then(result => {
            const code = result.body.error ?? result.body.code
            httpOutcome = { state: 'RESPONSE', status: result.status,
              code: typeof code === 'string' && safeApiCodes.has(code) ? code : code === undefined ? 'NO_API_ERROR' : 'OTHER_API_ERROR' }
          }, () => { httpOutcome = { state: 'TRANSPORT_FAILURE' } })
          await waitForLock('%write_active_persistence_artifacts_with_identity_fence_v1%', withdrawal, () => httpOutcome)
          const lifecycleBefore = await readLifecycleEvents()
          expect(lifecycleDigest(lifecycleBefore)).toBe(baselineLifecycleDigest)
          const beforeIds = new Set(lifecycleBefore.map(event => event.event_id))
          let operationId: string | null = null
          let withdrawalEmployees: string[] = []
          let withdrawalApplications: string[] = []
          if (withdrawal === 'managed-quarantine' || withdrawal === 'admission') {
            const applications = (await admin.query<{ application_id: string; support_state: string }>(
              "SELECT application_id,support_state FROM orgmaster_core.managed_identity_invalidation_applications WHERE status='active' ORDER BY application_id",
            )).rows
            expect(applications.length > 0 && applications.every(row => row.support_state === 'verified')).toBe(true)
            withdrawalApplications = applications.map(row => row.application_id)
          }
          if (withdrawal === 'session') {
            await admin.query('SET LOCAL ROLE jenfu_orgmaster_runtime')
            await createOrgmasterSessionRepository(admin).revokeByHash(
              (await admin.query('SELECT session_id_hash::text AS hash FROM orgmaster_core.app_sessions WHERE id=$1::uuid', [session.id])).rows[0].hash.trim(), 'task-owned-revoke')
            await admin.query('SET LOCAL ROLE NONE')
          } else if (withdrawal === 'epoch') {
            await admin.query('SET LOCAL ROLE jenfu_platform_runtime')
            await admin.query("SELECT * FROM platform_core.bump_principal_auth_epoch_v1($1,$2,'task-owned','revoke')", [actor.issuer, actor.subject])
            await admin.query('SET LOCAL ROLE NONE')
          } else if (withdrawal === 'governance-cas') {
            const changed = structuredClone(observed.document)
            const active = changed.publishedVersions.find(version => version.id === changed.activePolicyVersionId)
            if (!active || active.kind !== 'assignment-governance-v3') throw Error('CURRENT_NATIVE_POLICY_REQUIRED')
            const next = { ...structuredClone(active), id: 'current-role-withdrawn', versionNumber: changed.publishedVersions.length + 1 }
            next.policy.roleAssignments = []
            changed.publishedVersions.push(next)
            changed.activePolicyVersionId = next.id
            await runtimeWrite('orgmaster-governance.v3.json', 'governance', changed as unknown as Record<string, unknown>, observed.revision)
          } else if (withdrawal === 'workspace') {
            const row = baselineArtifacts.find(row => row.artifact_key === 'orgmaster-versions/current.json')
            const changed = structuredClone(row.payload)
            changed.state.employees.find((employee: { id: string; status: string }) => employee.id === actor.employeeId).status = 'inactive'
            await runtimeWrite(row.artifact_key, 'workspace-version', changed, row.canonical_sha256.trim())
          } else if (withdrawal === 'managed-quarantine') {
            const identity = (await admin.query('SELECT identity_record_id,revision FROM orgmaster_core.managed_daily_identities WHERE principal_id=$1', [actor.principalId])).rows[0]
            expect(identity.identity_record_id).toBe(baselineManaged.identity_record_id)
            operationId = 'managed-quarantine:' + identity.identity_record_id
            withdrawalEmployees = [actor.employeeId]
            await admin.query('SET LOCAL ROLE jenfu_orgmaster_migrator')
            await admin.query("SELECT * FROM orgmaster_core.quarantine_managed_identity_v1($1::uuid,$2,'task-owned','known-negative','task-owned-incident')", [identity.identity_record_id, identity.revision])
            await admin.query('SET LOCAL ROLE NONE')
          } else {
            const admission = (await admin.query('SELECT revision FROM orgmaster_core.managed_identity_admission_authority WHERE singleton=true')).rows[0]
            withdrawalEmployees = (await admin.query<{ employee_id: string }>(
              "SELECT employee_id FROM orgmaster_core.managed_daily_identities WHERE link_state='active' ORDER BY employee_id",
            )).rows.map(row => row.employee_id)
            expect(withdrawalEmployees.includes(actor.employeeId)).toBe(true)
            await admin.query('SET LOCAL ROLE jenfu_orgmaster_migrator')
            const disabled = await admin.query("SELECT * FROM orgmaster_core.set_managed_identity_admission_v1($1,false,'task-owned','test-withdrawal')", [admission.revision])
            expect(disabled.rowCount).toBe(1)
            operationId = 'managed-admission:' + disabled.rows[0].revision
            await admin.query('SET LOCAL ROLE NONE')
          }
          const winnerLifecycle = await readLifecycleEvents()
          caseLifecycleEvents = winnerLifecycle.filter(event => !beforeIds.has(event.event_id))
          const expectedEventCount = withdrawalEmployees.length * withdrawalApplications.length
          expect(caseLifecycleEvents.length).toBe(expectedEventCount)
          const expectedActor = withdrawal === 'managed-quarantine' ? 'known-negative' : 'task-owned'
          const expectedReason = withdrawal === 'managed-quarantine' ? 'task-owned-incident' : 'test-withdrawal'
          expect(caseLifecycleEvents.every(event => event.operation_id === operationId
            && withdrawalEmployees.includes(event.employee_id) && withdrawalApplications.includes(event.application_id)
            && event.actor === expectedActor && event.reason_code === expectedReason
            && event.event_kind === 'managed_identity_lifecycle_changed' && event.status === 'pending'
            && event.attempt_count === 0 && event.platform_receipt_id === null)).toBe(true)
          expect(new Set(caseLifecycleEvents.map(event => event.employee_id + '/' + event.application_id)).size).toBe(expectedEventCount)
          const winnerLifecycleDigest = lifecycleDigest(winnerLifecycle)
          const winnerEffects = await effects()
          await admin.query('COMMIT')
          checkpoint('race-withdrawal-committed', { withdrawal })
          const rejected = await attempt
          expect(rejected.status, withdrawal).toBe(withdrawal === 'governance-cas' || withdrawal === 'workspace' ? 409 : 401)
          expect(await effects(), withdrawal + ' must add no candidate/audit/outbox effect').toEqual(winnerEffects)
          expect(lifecycleDigest(await readLifecycleEvents())).toBe(winnerLifecycleDigest)
          const after = await readGovernanceStore(process.cwd())
          expect(after.document.auditEvents.some(event => event.commandId === commandId)).toBe(false)
          if (withdrawal === 'governance-cas') {
            expect((await call('GET', '/session')).body.capabilities.manage).toBe(false)
            expect((await call('PATCH', '/draft', { expectedRevision: after.revision, command: {
              type: 'UPSERT_ROLE_ASSIGNMENT', commandId: commandId + '-fresh', reason: 'missing role',
              value: { ...assignment, id: commandId + '-fresh' },
            } })).status).toBe(403)
          }
          withdrawalProved = true
          checkpoint('race-assertions-after', { withdrawal, status: rejected.status })
        } finally {
          await admin.query('ROLLBACK').catch(() => undefined)
          if (attempt) await attempt.catch(() => undefined)
          if (withdrawalProved) {
            await restoreDisposableFixture(caseLifecycleEvents)
            checkpoint('race-after', { withdrawal })
          }
        }
      }

      // An already-authorized own write owns its session shared lock through COMMIT.
      checkpoint('write-first-before')
      const observed = await readGovernanceStore(process.cwd())
      const writeActor = { ...actor, sessionId: session.id, authenticatedAt: session.authenticatedAt,
        principalAuthEpoch: session.principalAuthEpoch, assuranceLevel: session.assuranceLevel }
      let releaseCommit!: () => void
      let markReady!: () => void
      const commitGate = new Promise<void>(resolve => { releaseCommit = resolve })
      const ready = new Promise<void>(resolve => { markReady = resolve })
      const writer = withPersistenceTransaction(async () => {
        const applied = await applyDraftCommand(process.cwd(), observed.revision, {
          type: 'UPSERT_ROLE_ASSIGNMENT', commandId: 'write-wins', reason: 'write first',
          value: { ...assignment, id: 'write-wins' },
        }, writeActor)
        markReady()
        await commitGate
        return applied
      })
      void writer.catch(() => { markReady() })
      let revoker: pg.Client | null = null
      try {
        await ready
        checkpoint('write-first-ready')
        revoker = new pg.Client({ connectionString: runtimeUrl, application_name: 'dev057-session-revoker' })
        await revoker.connect()
        const revocation = revoker.query("UPDATE orgmaster_core.app_sessions SET revoked_at=clock_timestamp(),revoke_reason='task-owned' WHERE id=$1::uuid", [session.id])
        await waitForLock('%UPDATE orgmaster_core.app_sessions%', 'write-first-revoker')
        checkpoint('write-first-commit-before')
        releaseCommit()
        expect((await writer).status).toBe('applied')
        checkpoint('write-first-commit-after')
        await revocation
        const current = await readGovernanceStore(process.cwd())
        expect(current.document.auditEvents.filter(event => event.commandId === 'write-wins')).toHaveLength(1)
        await expect(applyDraftCommand(process.cwd(), current.revision, {
          type: 'UPSERT_ROLE_ASSIGNMENT', commandId: 'after-revoke', reason: 'must reject',
          value: { ...assignment, id: 'after-revoke' },
        }, writeActor)).rejects.toMatchObject({ code: 'IDENTITY_CONTEXT_REQUIRED' })
        checkpoint('write-first-after')
      } finally {
        releaseCommit()
        await writer.catch(() => undefined)
        await revoker?.end()
      }

    } finally {
      if (server?.listening) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()))
      await observer.end().catch(() => undefined)
      await runtime?.end().catch(() => undefined)
      await consumer.end().catch(() => undefined)
      await admin.end().catch(() => undefined)
      await closeOrgmasterPersistencePool()
      if (priorMode === undefined) delete process.env.ORGMASTER_PERSISTENCE_MODE
      else process.env.ORGMASTER_PERSISTENCE_MODE = priorMode
      if (priorUrl === undefined) delete process.env.ORGMASTER_POSTGRES_URL
      else process.env.ORGMASTER_POSTGRES_URL = priorUrl
      checkpoint('cleanup-after')
    }
  }, 30_000)
})
