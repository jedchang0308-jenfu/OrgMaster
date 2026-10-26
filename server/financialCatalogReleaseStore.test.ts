import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { validateAndNormalizeFinancialCatalogRelease } from './financialCatalogReleaseStore'

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`
}
function sha256(value: string) { return createHash('sha256').update(value).digest('hex') }

const roleBase = { stableRoleId: 'role-owner', code: 'owner', displayName: 'Owner', builtIn: true, capabilityIds: ['finance.dashboard.view'], allowedScopeKinds: ['workspace'], assignmentPolicy: 'open' as const }
const role = { ...roleBase, roleDefinitionHash: sha256(canonicalJson(roleBase)) }
const catalog = {
  formatVersion: 'jf.configuration-catalog.v1', applicationId: 'financial-management-system', catalogVersion: 'fms.catalog.2026-10-26.v1', registryVersion: 'fms.registry.v1',
  roles: [role], publishedAt: '2026-10-26T00:00:00.000Z', publishedBy: { principalId: 'verified-operator', employeeId: 'employee-1' },
}
const artifactUtf8 = `${canonicalJson(catalog)}\n`
const release = {
  applicationId: catalog.applicationId, version: catalog.catalogVersion, contentSha256: sha256(canonicalJson(catalog)), artifactSha256: sha256(artifactUtf8), artifactUtf8,
  sourceDraftId: 'draft-1', sourceDraftRevision: 3, createdBy: { principalId: 'verified-operator', employeeId: 'employee-1' }, createdAt: catalog.publishedAt,
}

describe('FMS catalog release owner producer', () => {
  it('retains immutable hashes and binds publisher to verified actor', () => {
    const snapshot = validateAndNormalizeFinancialCatalogRelease(release, { principalId: 'verified-operator', employeeId: 'employee-1', issuer: 'issuer', subject: 'subject', bootstrap: false })
    expect(snapshot.sourceKind).toBe('application-contract')
    expect(snapshot.contentSha256).toBe(release.contentSha256)
    expect(snapshot.artifactSha256).toBe(release.artifactSha256)
    expect(snapshot.publishedByPrincipalId).toBe('verified-operator')
    expect(snapshot.publishedByEmployeeId).toBe('employee-1')
    expect(snapshot.roles[0]).toMatchObject({ stableRoleId: 'role-owner', capabilityIds: ['finance.dashboard.view'], assignmentPolicy: 'open' })
  })

  it('rejects an artifact whose bytes do not match the declared hash', () => {
    expect(() => validateAndNormalizeFinancialCatalogRelease({ ...release, artifactUtf8: `${artifactUtf8} ` }, { principalId: 'verified-operator', employeeId: 'employee-1', issuer: 'issuer', subject: 'subject', bootstrap: false })).toThrow('FINANCIAL_CATALOG_RELEASE_INVALID')
  })

  it('rejects source publisher claims that are not the authenticated import actor', () => {
    const browserClaimed = { ...release, createdBy: { principalId: 'browser-claimed', employeeId: 'employee-1' } }
    expect(() => validateAndNormalizeFinancialCatalogRelease(browserClaimed, { principalId: 'verified-operator', employeeId: 'employee-1', issuer: 'issuer', subject: 'subject', bootstrap: false })).toThrow('FINANCIAL_CATALOG_RELEASE_INVALID')
  })
})
