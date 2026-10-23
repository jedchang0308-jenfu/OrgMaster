import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import vectors from '../config/catalogs/test-vectors/ai-pdm-dynamic-policy-v1.json'
import { decodeDynamicAiPdmRoleCatalog } from './aiPdmDynamicRoleCatalog'
import {
  readHistoricalAiPdmRoleCatalogFromDatabase,
  readPublishedAiPdmRoleCatalog,
} from './aiPdmRoleCatalogRepository'
import { writeSyntheticWorkspaceFixture } from './syntheticWorkspaceFixture'
import {
  applyDraftCommand,
  getGovernancePaths,
  loadOrganizationSource,
  readGovernanceStore,
} from './orgmasterGovernanceStore'
import { createAiPdmRoleCatalog, validateExternalRoleCatalog } from '../src/governance/aiPdmCatalog'
import { applyGovernanceCommandV3 } from '../src/governance/commands'
import { createSeedDocumentV2 } from '../src/governance/migrateGovernanceV1ToV2'
import { migrateGovernanceV2ToV3 } from '../src/governance/migrateGovernanceV2ToV3'
import { validatePolicyDataV3 } from '../src/governance/validation'
import type {
  ExternalRoleCatalogRoleV1,
  ExternalRoleCatalogSnapshotV1,
  GovernanceRoleAssignmentV2,
} from '../src/governance/types'

const override = vi.hoisted(() => ({ catalog: undefined as ExternalRoleCatalogSnapshotV1 | undefined }))
vi.mock('./applicationRoleCatalogRegistry', async importOriginal => {
  const original = await importOriginal<typeof import('./applicationRoleCatalogRegistry')>()
  return {
    ...original,
    readActiveAiPdmRoleCatalog: async (...args: Parameters<typeof original.readActiveAiPdmRoleCatalog>) =>
      override.catalog ?? original.readActiveAiPdmRoleCatalog(...args),
    readApplicationRoleCatalogs: async (...args: Parameters<typeof original.readApplicationRoleCatalogs>) =>
      override.catalog ? [override.catalog] : original.readApplicationRoleCatalogs(...args),
  }
})

const vector = vectors[2]
const now = '2026-10-23T12:00:00.000Z'
const workspaceKey = 'company-jenfu'
const rootPaths: string[] = []

function projection(lifecycle: 'active' | 'retired' = 'active'): Record<string, unknown>[] {
  const policy = vector.policy
  return policy.roles.map((role, index) => ({
    contract_version: 'jenfu.platform-entitlement.v1', application_id: 'ai-pdm',
    catalog_version: policy.candidateCatalogVersion, catalog_sha256: policy.contentHash,
    published_at: vector.publishedAt, display_order: index, stable_role_id: role.stableRoleId,
    role_code: role.roleCode, display_name: role.displayName, assignable: role.assignable,
    risk: role.risk, subject_kind: role.subjectKind, recommendation_allowed: role.recommendationAllowed,
    delegation_allowed: role.delegationAllowed, allowed_scope_kinds: role.allowedScopeKinds,
    assignment_tier: role.assignmentTier, metadata: role.metadata, permissions: role.permissions,
    role_definition_hash: role.roleDefinitionHash, role_status: role.roleStatus,
    publication_format: policy.format, canonicalization_version: 'jenfu.canonical-json.v1',
    role_schema_id: policy.roleSchemaId, role_profile_schema_id: policy.roleProfileSchemaId,
    baseline_role_identity_hash: policy.baselineRoleIdentityHash, role_identity_hash: policy.roleIdentityHash,
    registry_hash: policy.registryHash, protected_policy_hash: policy.protectedPolicyHash,
    role_profile_hash: policy.roleProfileHash, permission_role_id: policy.roleProfiles[index].permissionRoleId,
    presentation_name: policy.roleProfiles[index].presentationName, presentation_order: policy.roleProfiles[index].presentationOrder,
    assignment_disposition: policy.roleProfiles[index].assignmentDisposition, lifecycle,
  }))
}

let dynamicCatalog: ExternalRoleCatalogSnapshotV1

beforeAll(async () => {
  const baselineArtifact = await readPublishedAiPdmRoleCatalog(process.cwd(), vector.baselineCatalogVersion)
  const artifact = decodeDynamicAiPdmRoleCatalog(projection(), [baselineArtifact])
  dynamicCatalog = createAiPdmRoleCatalog('valid', artifact.publishedAt, artifact)
  override.catalog = dynamicCatalog
})

beforeEach(() => { vi.stubEnv('ORGMASTER_PERSISTENCE_MODE', 'local-json') })
afterEach(async () => {
  vi.unstubAllEnvs()
  override.catalog = dynamicCatalog
  for (const root of rootPaths.splice(0)) await rm(root, { recursive: true, force: true })
})

function role(catalog: ExternalRoleCatalogSnapshotV1, stableRoleId: string): ExternalRoleCatalogRoleV1 {
  const found = catalog.roles.find(candidate => candidate.stableRoleId === stableRoleId)
  if (!found) throw new Error(`missing role: ${stableRoleId}`)
  return found
}

function assignment(
  selectedRole: ExternalRoleCatalogRoleV1,
  id: string,
  employeeId: string,
  scope: GovernanceRoleAssignmentV2['scope'],
  status: GovernanceRoleAssignmentV2['status'] = 'active',
  validTo: string | null = null,
): GovernanceRoleAssignmentV2 {
  return {
    id, employeeId, applicationId: 'ai-pdm', roleId: selectedRole.stableRoleId,
    roleCodeSnapshot: selectedRole.code, roleNameSnapshot: selectedRole.displayName,
    catalogVersion: dynamicCatalog.catalogVersion, scope, status,
    validFrom: '2026-01-01T00:00:00.000Z', validTo, effectState: 'not-synchronized',
  }
}

function documentWithAssignments(employeeId: string, includeExpired = false) {
  const v2 = createSeedDocumentV2(now, dynamicCatalog)
  v2.draft.roleAssignments = [
    assignment(role(dynamicCatalog, 'role-procurement'), 'procurement-assignment', employeeId, { kind: 'workspace', value: workspaceKey }),
    assignment(role(dynamicCatalog, 'role-production-planning'), 'legacy-planning-assignment', employeeId, { kind: 'workspace', value: 'legacy-planning-scope' }, 'active', '2100-01-01T00:00:00.000Z'),
    assignment(role(dynamicCatalog, 'role-custom-30000000-0000-4000-8000-000000000001'), 'custom-assignment', employeeId, { kind: 'workspace', value: 'custom-scope' }, 'revoked'),
  ]
  if (includeExpired) v2.draft.roleAssignments.push(
    assignment(role(dynamicCatalog, 'role-procurement'), 'expired-assignment', employeeId, { kind: 'workspace', value: 'expired-scope' }, 'revoked', '2026-02-01T00:00:00.000Z'),
  )
  return migrateGovernanceV2ToV3(v2, 'dev058-provenance-fixture', dynamicCatalog, now)
}

describe('DEV-058 catalog provenance and lifecycle journey', () => {
  it('reads a retired publication as historical provenance while retaining canonical bytes and hashes', async () => {
    const queries: Array<{ sql: string; values?: unknown[] }> = []
    const historical = await readHistoricalAiPdmRoleCatalogFromDatabase({
      query: async (sql, values) => { queries.push({ sql, values }); return { rows: projection('retired') } },
    }, dynamicCatalog.catalogVersion)

    expect(queries[0]).toMatchObject({ values: ['ai-pdm', dynamicCatalog.catalogVersion] })
    expect(queries[0].sql).toContain('ai_pdm_contract.v_role_policy_publications_v1')
    expect(historical).toMatchObject({
      applicationId: 'ai-pdm', catalogVersion: dynamicCatalog.catalogVersion,
      catalogSha256: dynamicCatalog.catalogSha256,
    })
    expect(historical.roles.map(value => value.stableRoleId)).toEqual(dynamicCatalog.roles.map(value => value.stableRoleId))
    // The repository reader returns its published-role shape; decodeDynamicAiPdmRoleCatalog
    // already validated the complete producer preimage, including the retired lifecycle.
    expect(historical.roles.find(value => value.roleCode === 'procurement')).toMatchObject({
      stableRoleId: 'role-procurement', displayName: '採購',
      roleDefinitionHash: vector.policy.roles.find(value => value.stableRoleId === 'role-procurement')!.roleDefinitionHash,
    })
  })

  it('keeps identity and provenance readable when roles become inactive, but blocks invalid restores and keeps a valid custom restore', () => {
    // Domain-only status fixture. This does not claim that changing a signed
    // catalog's status without a new producer hash passes decoder validation.
    const currentInactive = structuredClone(dynamicCatalog)
    for (const stableRoleId of ['role-procurement', 'role-production-planning']) {
      currentInactive.roles.find(value => value.stableRoleId === stableRoleId)!.status = 'inactive'
    }
    expect(validateExternalRoleCatalog(currentInactive)).toEqual([])

    const document = documentWithAssignments('employee-1', true)
    const catalogs = [currentInactive, dynamicCatalog]
    expect(validatePolicyDataV3(document.draft, undefined, catalogs)).toEqual([])

    const revokedCanonical = applyGovernanceCommandV3(document, {
      type: 'REVOKE_ROLE_ASSIGNMENT', commandId: 'inactive-canonical-revoke', reason: '撤銷停用角色任用', id: 'procurement-assignment',
    }, 'principal-fixture', undefined, catalogs)
    const revokedLegacy = applyGovernanceCommandV3(revokedCanonical.document, {
      type: 'REVOKE_ROLE_ASSIGNMENT', commandId: 'inactive-legacy-revoke', reason: '撤銷停用舊生管任用', id: 'legacy-planning-assignment',
    }, 'principal-fixture', undefined, catalogs)
    expect(revokedLegacy.document.draft.roleAssignments).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'procurement-assignment', status: 'revoked', roleId: 'role-procurement', catalogVersion: dynamicCatalog.catalogVersion, scope: { kind: 'workspace', value: workspaceKey }, validFrom: '2026-01-01T00:00:00.000Z', validTo: null }),
      expect.objectContaining({ id: 'legacy-planning-assignment', status: 'revoked', roleId: 'role-production-planning', roleCodeSnapshot: 'production_planning', roleNameSnapshot: '生管人員', catalogVersion: dynamicCatalog.catalogVersion, scope: { kind: 'workspace', value: 'legacy-planning-scope' } }),
    ]))

    expect(() => applyGovernanceCommandV3(revokedLegacy.document, {
      type: 'RESTORE_ROLE_ASSIGNMENT', commandId: 'inactive-canonical-restore', reason: '不得恢復停用角色', id: 'procurement-assignment',
    }, 'principal-fixture', undefined, catalogs)).toThrowError(expect.objectContaining({ issues: expect.arrayContaining([expect.objectContaining({ code: 'EXTERNAL_ROLE_UNASSIGNABLE' })]) }))
    expect(() => applyGovernanceCommandV3(revokedLegacy.document, {
      type: 'RESTORE_ROLE_ASSIGNMENT', commandId: 'legacy-only-restore', reason: '不得新增舊生管回授', id: 'legacy-planning-assignment',
    }, 'principal-fixture', undefined, [dynamicCatalog])).toThrowError(expect.objectContaining({ issues: expect.arrayContaining([expect.objectContaining({ code: 'EXTERNAL_ROLE_UNASSIGNABLE' })]) }))
    expect(() => applyGovernanceCommandV3(revokedLegacy.document, {
      type: 'RESTORE_ROLE_ASSIGNMENT', commandId: 'expired-restore', reason: '不得恢復到期任用', id: 'expired-assignment',
    }, 'principal-fixture', undefined, [dynamicCatalog])).toThrowError(expect.objectContaining({ issues: expect.arrayContaining([expect.objectContaining({ code: 'ASSIGNMENT_EXPIRED' })]) }))

    const restoredCustom = applyGovernanceCommandV3(revokedLegacy.document, {
      type: 'RESTORE_ROLE_ASSIGNMENT', commandId: 'custom-valid-restore', reason: '恢復仍合法的 custom 任用', id: 'custom-assignment',
    }, 'principal-fixture', undefined, [dynamicCatalog])
    expect(restoredCustom.document.draft.roleAssignments.find(value => value.id === 'custom-assignment')).toMatchObject({
      status: 'active', roleId: 'role-custom-30000000-0000-4000-8000-000000000001',
      catalogVersion: dynamicCatalog.catalogVersion, scope: { kind: 'workspace', value: 'custom-scope' },
      validFrom: '2026-01-01T00:00:00.000Z', validTo: null,
    })
  })

  it('persists and reads back canonical procurement and legacy planning provenance unchanged through revoke', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orgmaster-dev058-provenance-'))
    rootPaths.push(root)
    await writeSyntheticWorkspaceFixture(root)
    const source = await loadOrganizationSource(root)
    const employeeId = source.state.employees.find(employee => employee.status !== 'inactive')!.id
    const document = documentWithAssignments(employeeId)
    await writeFile(getGovernancePaths(root).current, `${JSON.stringify(document)}\n`, 'utf8')

    const initial = await readGovernanceStore(root)
    const original = initial.document.draft.roleAssignments.filter(value => value.id.endsWith('assignment'))
    expect(original).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'procurement-assignment', roleId: 'role-procurement', roleCodeSnapshot: 'procurement', roleNameSnapshot: '採購', catalogVersion: dynamicCatalog.catalogVersion, scope: { kind: 'workspace', value: workspaceKey } }),
      expect.objectContaining({ id: 'legacy-planning-assignment', roleId: 'role-production-planning', roleCodeSnapshot: 'production_planning', roleNameSnapshot: '生管人員', catalogVersion: dynamicCatalog.catalogVersion, scope: { kind: 'workspace', value: 'legacy-planning-scope' } }),
    ]))
    expect(role(dynamicCatalog, 'role-procurement').presentationName).toBe('採購／生管')
    expect(role(dynamicCatalog, 'role-procurement').displayName).toBe('採購')

    const actor = { principalId: 'dev058-provenance-manager', employeeId, issuer: 'test-issuer', subject: 'test-subject', bootstrap: true }
    const revokedCanonical = await applyDraftCommand(root, initial.revision, {
      type: 'REVOKE_ROLE_ASSIGNMENT', commandId: 'persisted-procurement-revoke', reason: '撤銷採購任用', id: 'procurement-assignment',
    }, actor)
    const revokedLegacy = await applyDraftCommand(root, revokedCanonical.revision, {
      type: 'REVOKE_ROLE_ASSIGNMENT', commandId: 'persisted-legacy-revoke', reason: '撤銷舊生管任用', id: 'legacy-planning-assignment',
    }, actor)
    const readback = await readGovernanceStore(root)
    const assignments = readback.document.draft.roleAssignments
    expect(assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'procurement-assignment', status: 'revoked', roleId: 'role-procurement', roleCodeSnapshot: 'procurement', roleNameSnapshot: '採購', catalogVersion: dynamicCatalog.catalogVersion, scope: { kind: 'workspace', value: workspaceKey }, validFrom: '2026-01-01T00:00:00.000Z', validTo: null }),
      expect.objectContaining({ id: 'legacy-planning-assignment', status: 'revoked', roleId: 'role-production-planning', roleCodeSnapshot: 'production_planning', roleNameSnapshot: '生管人員', catalogVersion: dynamicCatalog.catalogVersion, scope: { kind: 'workspace', value: 'legacy-planning-scope' }, validFrom: '2026-01-01T00:00:00.000Z', validTo: '2100-01-01T00:00:00.000Z' }),
      expect.objectContaining({ id: 'custom-assignment', status: 'revoked', roleId: 'role-custom-30000000-0000-4000-8000-000000000001', scope: { kind: 'workspace', value: 'custom-scope' } }),
    ]))
    expect(assignments).toEqual(original.map(value =>
      ['procurement-assignment', 'legacy-planning-assignment'].includes(value.id)
        ? { ...value, status: 'revoked' }
        : value,
    ))
    expect(revokedLegacy.status).toBe('applied')
    expect(await readFile(getGovernancePaths(root).current, 'utf8')).toContain('persisted-legacy-revoke')
  })
})
