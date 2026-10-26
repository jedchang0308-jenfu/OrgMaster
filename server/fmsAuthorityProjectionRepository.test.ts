import { describe, expect, it, vi } from 'vitest'
import { FMS_AUTHORITY_CONTRACT_VERSION, FMS_AUTHORITY_MANIFEST_HASH, FMS_AUTHORITY_VIEW, createFmsAuthorityProjectionRepository, normalizeFmsAuthorityRow } from './fmsAuthorityProjectionRepository'

const row = {
  contract_version: FMS_AUTHORITY_CONTRACT_VERSION,
  manifest_hash: FMS_AUTHORITY_MANIFEST_HASH, application_id: 'financial-management-system', principal_id: 'principal-1', employee_id: 'employee-1', principal_binding_version: '17',
  read_at: '2026-10-26T00:00:00.000Z', governance_revision: 'b'.repeat(64), assignment_version: 'assignment-policy-17', workspace_version_id: 'current-17', workspace_revision: 'c'.repeat(64),
  catalog_version: 'fms.catalog.v1', catalog_content_sha256: 'd'.repeat(64), catalog_artifact_sha256: 'e'.repeat(64),
  assignments: [{ principalId: 'principal-1', employeeId: 'employee-1', assignmentId: 'assignment-1', stableRoleId: 'role-owner', scope: { kind: 'workspace', key: 'company-jenfu' }, validFrom: '2026-10-01T00:00:00.000Z', validUntil: null, revokedAt: null, catalogVersion: 'fms.catalog.v1', catalogSha256: 'd'.repeat(64), assignmentVersion: 'assignment-policy-17', sourceAssignmentId: 'assignment-1', authoringCatalogVersion: 'fms.catalog.v1', authoringCatalogSha256: 'd'.repeat(64) }],
  protected_grants: [{ grantId: 'grant-1', applicationId: 'financial-management-system', principalId: 'principal-1', operation: 'catalog.read', revision: 'b'.repeat(64), validFrom: '2026-10-01T00:00:00.000Z', validUntil: null }],
}

describe('FMS authority projection reader', () => {
  it('reads one exact Principal row from the owner contract view', async () => {
    const query = vi.fn(async () => ({ rows: [row] }))
    const repository = createFmsAuthorityProjectionRepository({ query } as never)
    await expect(repository.readAuthority('principal-1')).resolves.toBe(row)
    expect(query).toHaveBeenCalledWith(expect.stringContaining(`FROM ${FMS_AUTHORITY_VIEW}`), ['principal-1', 'financial-management-system'])
  })

  it('rejects more than one active Principal/Employee authority row', async () => {
    const query = vi.fn(async () => ({ rows: [row, { ...row, employee_id: 'employee-2' }] }))
    const repository = createFmsAuthorityProjectionRepository({ query } as never)
    await expect(repository.readAuthority('principal-1')).rejects.toMatchObject({ code: 'authority_not_found' })
  })

  it('normalizes owner snake_case hashes and active arrays to the FMS wire shape', () => {
    expect(normalizeFmsAuthorityRow(row)).toEqual(expect.objectContaining({
      contractVersion: FMS_AUTHORITY_CONTRACT_VERSION, principalId: 'principal-1', employeeId: 'employee-1',
      governanceRevision: 'b'.repeat(64), assignmentVersion: 'assignment-policy-17',
      workspaceVersionId: 'current-17', workspaceRevision: 'c'.repeat(64),
      activeCatalog: { version: 'fms.catalog.v1', contentSha256: 'd'.repeat(64), artifactSha256: 'e'.repeat(64) },
      assignments: row.assignments, protectedGrants: row.protected_grants,
    }))
  })

  it('rejects a drifted manifest pin or malformed nested grant', () => {
    expect(() => normalizeFmsAuthorityRow({ ...row, manifest_hash: 'a'.repeat(64) })).toThrow('authority_contract_mismatch')
    expect(() => normalizeFmsAuthorityRow({ ...row, protected_grants: [{ ...row.protected_grants[0], grantId: '' }] })).toThrow('authority_contract_mismatch')
  })
})
