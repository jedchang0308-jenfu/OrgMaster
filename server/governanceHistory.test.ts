import v6 from '../config/catalogs/ai-pdm-role-catalog.v6.json'
import v7 from '../config/catalogs/ai-pdm-role-catalog.v7.json'
import { describe, expect, it, vi } from 'vitest'
import { createAiPdmRoleCatalog } from '../src/governance/aiPdmCatalog'
import { createSeedDocumentV2 } from '../src/governance/migrateGovernanceV1ToV2'
import { migrateGovernanceV2ToV3 } from '../src/governance/migrateGovernanceV2ToV3'
import { FINANCIAL_CATALOG_VERSION } from '../src/governance/financialCatalog'
import { publicationSnapshotHash, GOVERNANCE_PUBLICATION_HASH_FORMAT } from '../src/governance/commands'
import type { ExternalRoleCatalogSnapshotV1, GovernanceDocumentV3, GovernanceRoleAssignmentV3 } from '../src/governance/types'
import { readFinancialRoleCatalog } from './financialRoleCatalogRepository'
import { withPublishedGovernanceHistory } from './governanceReduction'

const d4 = createAiPdmRoleCatalog('valid', v6.publishedAt, v6)
const d5 = createAiPdmRoleCatalog('valid', v7.publishedAt, v7)

function assignment(id: string, applicationId: GovernanceRoleAssignmentV3['applicationId'], catalogVersion: string | null, roleId: string, roleCodeSnapshot: string, roleNameSnapshot: string): GovernanceRoleAssignmentV3 {
  return {
    id, employeeId: 'employee-1', applicationId, roleId, roleCodeSnapshot, roleNameSnapshot, catalogVersion,
    scope: { kind: 'workspace', value: 'workspace-1' }, status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null,
    effectState: applicationId === 'orgmaster' ? 'orgmaster-enforced' : 'not-synchronized', basis: 'manual', subjectKind: 'employee',
    targetPrincipalId: null, sources: [], metadata: { sponsorEmployeeId: null, reviewDueAt: null },
    createdByPrincipalId: 'owner-principal', createdReason: 'history fixture',
  }
}

function ownerPublication(document: GovernanceDocumentV3, id: string, catalog: ExternalRoleCatalogSnapshotV1, versionNumber: number) {
  const { basePolicyVersionId: _base, updatedAt: _updated, ...policy } = structuredClone(document.draft)
  const payload = {
    kind: 'assignment-governance-v3' as const,
    policy,
    externalRoleCatalogs: [catalog],
    organizationSnapshot: {
      workspaceVersionId: `workspace-${versionNumber}`,
      workspaceRevision: `workspace-revision-${versionNumber}`,
      capturedAt: '2026-10-23T00:00:00.000Z',
      employees: [], departments: [], organizationRoles: [], positions: [], assignments: [],
    },
    effectState: 'not-synchronized' as const,
  }
  return {
    ...payload, id, versionNumber, publishedAt: '2026-10-23T00:00:00.000Z', publishedByPrincipalId: 'owner-principal',
    publishReason: 'history fixture', hashFormat: GOVERNANCE_PUBLICATION_HASH_FORMAT, snapshotHash: publicationSnapshotHash(payload),
  }
}

async function fixture(includeOwnedD4 = false) {
  const document = migrateGovernanceV2ToV3(createSeedDocumentV2(), 'history-fixture', d5)
  const d4Assignment = assignment('assignment-d4', 'ai-pdm', d4.catalogVersion, 'role-rd', 'rd', '研發人員')
  document.draft.roleAssignments = [
    d4Assignment,
    assignment('assignment-orgmaster', 'orgmaster', null, 'role-orgmaster-admin', 'orgmaster_admin', 'OrgMaster 管理者'),
    assignment('assignment-finance', 'financial-management-system', FINANCIAL_CATALOG_VERSION, 'role-procurement', 'procurement', '採購'),
  ]
  document.draft.roleDelegations = [{
    id: 'delegation-d4', sourceAssignmentId: d4Assignment.id, fromEmployeeId: 'employee-1', toEmployeeId: 'employee-2',
    applicationId: 'ai-pdm', roleId: 'role-rd', catalogVersion: d4.catalogVersion, scope: d4Assignment.scope,
    status: 'active', validFrom: d4Assignment.validFrom, validTo: '2099-01-01T00:00:00.000Z', reason: 'history fixture', effectState: 'not-synchronized',
  }]
  const d5Version = ownerPublication(document, 'publication-d5', d5, 5)
  const d4Version = ownerPublication(document, 'publication-d4', d4, 4)
  document.activePolicyVersionId = d5Version.id
  document.publishedVersions = includeOwnedD4 ? [d5Version, d4Version] : [d5Version]
  document.auditEvents = document.publishedVersions.map(version => ({
    id: `audit-${version.id}`, commandId: version.id, commandHash: `hash-${version.id}`, occurredAt: version.publishedAt,
    actorPrincipalId: 'owner-principal', action: 'PUBLISH_ASSIGNMENTS', entityType: 'assignmentVersion', entityId: version.id,
    reason: 'history fixture', beforeHash: null, afterHash: version.snapshotHash, previousEventHash: null, eventHash: `event-${version.id}`,
  }))
  const finance = await readFinancialRoleCatalog('valid')
  return { document, current: [d5, finance], d4, d5, finance }
}

describe('governance published catalog history composition', () => {
  it('supplements an unpublished D4 draft reference while preserving D5/current first and deduplicating one loader read', async () => {
    const { document, current, d4: historical, d5: latest, finance } = await fixture()
    const loadedVersions: string[] = []
    const result = await withPublishedGovernanceHistory(document, current, async catalogVersion => {
      loadedVersions.push(catalogVersion)
      return historical
    })

    expect(result).toEqual([latest, finance, historical])
    expect(loadedVersions).toEqual([historical.catalogVersion])
  })

  it('uses an owner-bound D4 publication without consulting the historical producer', async () => {
    const { document, current, d4: historical, d5: latest, finance } = await fixture(true)
    const loadHistorical = vi.fn(async (_catalogVersion: string) => historical)

    const result = await withPublishedGovernanceHistory(document, current, loadHistorical)

    expect(result).toEqual([latest, finance, historical])
    expect(loadHistorical).not.toHaveBeenCalled()
  })

  it('loads multiple missing historical catalogs sequentially for one transaction client', async () => {
    const { document, current, d4: historical } = await fixture()
    const earlierVersion = 'ai-pdm.role-catalog.2026-09-01.v3'
    document.draft.roleAssignments.push({
      ...document.draft.roleAssignments[0], id: 'assignment-d3', catalogVersion: earlierVersion,
    })
    let activeReads = 0
    const loadedVersions: string[] = []
    const result = await withPublishedGovernanceHistory(document, current, async catalogVersion => {
      activeReads += 1
      if (activeReads !== 1) throw new Error('CONCURRENT_TRANSACTION_QUERY')
      try {
        await new Promise(resolve => setTimeout(resolve, 0))
        loadedVersions.push(catalogVersion)
        return { ...historical, catalogVersion }
      } finally {
        activeReads -= 1
      }
    })

    expect(loadedVersions).toEqual([historical.catalogVersion, earlierVersion])
    expect(result.slice(-2).map(catalog => catalog.catalogVersion)).toEqual(loadedVersions)
  })

  it.each([
    ['wrong application', async () => readFinancialRoleCatalog('valid')],
    ['wrong catalog version', async () => d5],
    ['invalid source snapshot', async () => ({ ...d4, validationState: 'invalid' as const })],
  ])('rejects a %s historical source', async (_label, loader) => {
    const { document, current } = await fixture()
    await expect(withPublishedGovernanceHistory(document, current, async version => loader().then(value => {
      if (value.applicationId === 'financial-management-system') return value
      return value as ExternalRoleCatalogSnapshotV1
    }))).rejects.toThrow()
  })

  it('propagates missing or tampered producer errors instead of silently falling back', async () => {
    const { document, current } = await fixture()
    const missing = new Error('HISTORICAL_CATALOG_MISSING')
    await expect(withPublishedGovernanceHistory(document, current, async () => { throw missing })).rejects.toBe(missing)
    const tampered = new Error('HISTORICAL_CATALOG_TAMPERED')
    await expect(withPublishedGovernanceHistory(document, current, async () => { throw tampered })).rejects.toBe(tampered)
  })
})
