import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import pg from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { createOrgDocumentFile } from '../src/documentStorage'
import { readAiPdmRoleCatalog } from '../src/governance/aiPdmCatalog'
import { applyGovernanceCommandV3 } from '../src/governance/commands'
import { issuerFingerprintSha256, principalFingerprintSha256 } from '../src/governance/identityAdmission'
import { createSeedDocumentV2 } from '../src/governance/migrateGovernanceV1ToV2'
import { migrateGovernanceV2ToV3 } from '../src/governance/migrateGovernanceV2ToV3'
import type { GovernanceRoleAssignmentV2 } from '../src/governance/types'
import { validateDocumentV3 } from '../src/governance/validation'
import { screenshotOrganizationState } from '../src/screenshotData'
import { createWorkspaceManifest } from '../src/versionWorkspace'
import { createOrgmasterGovernanceMiddleware } from './orgmasterGovernanceApi'
import { closeOrgmasterPersistencePool } from './orgmasterPersistenceRepository'
import { readFinancialRoleCatalog } from './financialRoleCatalogRepository'
import { setVerifiedRequestIdentity } from './orgmasterRequestIdentity'
import type { OrgmasterSession } from './orgmasterSessionRepository'

const now = '2026-09-29T12:00:00.000Z'
const actor = { principalId: 'principal-legacy', employeeId: 'employee-legacy', issuer: 'issuer-legacy', subject: 'subject-legacy', bootstrap: false }
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

function productFixture() {
  const state = {
    ...screenshotOrganizationState,
    employees: [...screenshotOrganizationState.employees, {
      ...screenshotOrganizationState.employees[0], id: actor.employeeId,
      name: '合成驗證者', departmentIds: [], primaryAssignmentId: null,
    }],
  }
  const workspace = createOrgDocumentFile(state, 'document', now)
  const manifest = createWorkspaceManifest('current', now)
  const document = migrateGovernanceV2ToV3(createSeedDocumentV2(now), 'fixture-v2', readAiPdmRoleCatalog(), now)
  document.draft.identityLinks = [{ id: 'manager-link', principalId: actor.principalId,
    employeeId: actor.employeeId, issuer: actor.issuer, subject: actor.subject,
    status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null }]
  document.draft.principalAdmissions = [{
    id: 'manager-admission', identityLinkId: 'manager-link', accountType: 'human_personal',
    status: 'active', sharedRetirementState: 'not_applicable',
    principalFingerprintSha256: principalFingerprintSha256(actor.issuer, actor.subject),
    issuerFingerprintSha256: issuerFingerprintSha256(actor.issuer),
    evidenceRefSha256: 'a'.repeat(64), recordedAt: now,
  }]
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
    const admin = new pg.Client({ connectionString: adminUrl })
    const consumer = new pg.Client({ connectionString: consumerUrl })
    const priorMode = process.env.ORGMASTER_PERSISTENCE_MODE
    const priorUrl = process.env.ORGMASTER_POSTGRES_URL
    let server: ReturnType<typeof createServer> | null = null
    try {
      await admin.connect()
      await consumer.connect()
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
      const session: OrgmasterSession = {
        id: 'task-owned-session', identityIssuer: actor.issuer, identitySubject: actor.subject,
        principalId: actor.principalId, employeeId: actor.employeeId,
        authEpoch: 1, sessionSchemaVersion: 2, epochKind: 'principal', principalAuthEpoch: 1,
        issuedAt: now, authenticatedAt: now, expiresAt: '2027-01-01T00:00:00.000Z',
        revokedAt: null, assuranceLevel: 'aal2',
      }
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
      const sessionRead = await call('GET', '/session')
      expect(sessionRead).toMatchObject({ status: 200, body: { actor: { principalId: actor.principalId }, capabilities: { manage: true, publish: true } } })
      let revision = (await call('GET', '/')).body.revision as string
      const assignment = productRoleAssignment()
      const draft = await call('PATCH', '/draft', { expectedRevision: revision, command: {
        type: 'UPSERT_ROLE_ASSIGNMENT', commandId: 'product-assign', reason: 'task-owned Principal grant', value: assignment,
      } })
      expect(draft.status).toBe(200)
      revision = draft.body.revision
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
    } finally {
      if (server?.listening) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()))
      await consumer.end().catch(() => undefined)
      await admin.end().catch(() => undefined)
      await closeOrgmasterPersistencePool()
      if (priorMode === undefined) delete process.env.ORGMASTER_PERSISTENCE_MODE
      else process.env.ORGMASTER_PERSISTENCE_MODE = priorMode
      if (priorUrl === undefined) delete process.env.ORGMASTER_POSTGRES_URL
      else process.env.ORGMASTER_POSTGRES_URL = priorUrl
    }
  })
})
