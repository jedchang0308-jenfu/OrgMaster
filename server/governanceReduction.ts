import { canonicalJson, sha256, GOVERNANCE_PUBLICATION_HASH_FORMAT, publicationSnapshotHash } from '../src/governance/commands'
import { GovernanceValidationError } from '../src/governance/validation'
import type { ExternalRoleCatalogSnapshotV1, GovernanceDocumentV3, GovernancePolicyDataV3, GovernanceRoleAssignmentV3 } from '../src/governance/types'

const same = (left: unknown, right: unknown) => canonicalJson(left) === canonicalJson(right)

/** Only immutable, audit-bound owner publications may supply offline references. */
export function storedGovernanceCatalogs(document: GovernanceDocumentV3, versionId = document.activePolicyVersionId) {
  const version = document.publishedVersions.find(value => value.id === versionId)
  if (!version || version.kind !== 'assignment-governance-v3') return null
  const payload = { kind: version.kind, policy: version.policy, externalRoleCatalogs: version.externalRoleCatalogs,
    organizationSnapshot: version.organizationSnapshot, effectState: version.effectState }
  if (version.hashFormat !== undefined && version.hashFormat !== GOVERNANCE_PUBLICATION_HASH_FORMAT) return null
  const expectedHash = version.hashFormat === GOVERNANCE_PUBLICATION_HASH_FORMAT
    ? publicationSnapshotHash(payload) : sha256(canonicalJson(payload))
  if (expectedHash !== version.snapshotHash ||
    !document.auditEvents.some(event => event.entityId === version.id && event.afterHash === version.snapshotHash)) return null
  return version.externalRoleCatalogs
}

/** Current comes first. Only owner-audit-bound snapshots prove historical provenance. */
export function withStoredGovernanceHistory(document: GovernanceDocumentV3, current: NonNullable<ReturnType<typeof storedGovernanceCatalogs>>) {
  const result = [...current]
  const seen = new Set(result.map(value => `${value.applicationId}:${value.catalogVersion}`))
  const required = new Set([...document.draft.roleAssignments, ...document.draft.roleDelegations]
    .map(value => `${value.applicationId}:${value.catalogVersion}`))
  for (const version of document.publishedVersions) {
    for (const catalog of storedGovernanceCatalogs(document, version.id) ?? []) {
      const key = `${catalog.applicationId}:${catalog.catalogVersion}`
      const existing = result.find(value => `${value.applicationId}:${value.catalogVersion}` === key)
      if (existing && existing.payloadHash !== catalog.payloadHash) throw new GovernanceValidationError([
        { code: 'EXTERNAL_CATALOG_INVALID', path: 'catalogVersion', message: '同一目錄版本不得對應不同內容雜湊' },
      ])
      if (required.has(key) && !seen.has(key)) { seen.add(key); result.push(catalog) }
    }
  }
  return result
}

/** An unpublished draft can outlive its producer version. History proves its
 * provenance only; the current catalog remains first for every new grant. */
export async function withPublishedGovernanceHistory(
  document: GovernanceDocumentV3,
  current: ExternalRoleCatalogSnapshotV1[],
  loadHistorical?: (catalogVersion: string) => Promise<ExternalRoleCatalogSnapshotV1>,
) {
  const result = withStoredGovernanceHistory(document, current)
  if (!loadHistorical) return result
  const known = new Set(result.filter(value => value.applicationId === 'ai-pdm').map(value => value.catalogVersion))
  const missing = [...new Set([...document.draft.roleAssignments, ...document.draft.roleDelegations]
    .filter(value => value.applicationId === 'ai-pdm' && value.catalogVersion && !known.has(value.catalogVersion))
    .map(value => value.catalogVersion!))]
  const historical: ExternalRoleCatalogSnapshotV1[] = []
  for (const version of missing) {
    const catalog = await loadHistorical(version)
    if (catalog.applicationId !== 'ai-pdm' || catalog.catalogVersion !== version || catalog.validationState !== 'valid') {
      throw new GovernanceValidationError([{ code: 'EXTERNAL_CATALOG_INVALID', path: 'catalogVersion',
        message: '歷史目錄必須來自已驗證的同一應用與版本' }])
    }
    // Cloud SQL history reads share the governance transaction client. pg does
    // not support concurrent queries on one client, so keep these deterministic.
    historical.push(catalog)
  }
  return withStoredGovernanceHistory(document, [...result, ...historical])
}

function reducedEntry(before: GovernanceRoleAssignmentV3, after: GovernanceRoleAssignmentV3) {
  if (before.status === 'revoked' && after.status !== 'revoked') return false
  if (!['active', 'revoked'].includes(after.status)) return false
  if (!same(before.scope, after.scope) && before.scope.kind !== 'global') return false
  if (!Number.isFinite(Date.parse(after.validFrom)) || Date.parse(after.validFrom) < Date.parse(before.validFrom)) return false
  if (after.validTo !== null && !Number.isFinite(Date.parse(after.validTo))) return false
  if (before.validTo !== null && (after.validTo === null || Date.parse(after.validTo) > Date.parse(before.validTo))) return false
  return same(before, { ...after, status: before.status, scope: before.scope,
    validFrom: before.validFrom, validTo: before.validTo })
}

/** Compare with the EFFECTIVE policy, not a command label or a mutable draft. */
export function isGovernanceReduction(before: GovernancePolicyDataV3, after: GovernancePolicyDataV3) {
  const { roleAssignments: oldAssignments, roleDelegations: oldDelegations,
    basePolicyVersionId: _oldBase, updatedAt: _oldUpdated, ...oldPolicy } = before as GovernanceDocumentV3['draft']
  const { roleAssignments: newAssignments, roleDelegations: newDelegations,
    basePolicyVersionId: _base, updatedAt: _updated, ...newPolicy } = after as GovernanceDocumentV3['draft']
  if (!same(oldPolicy, newPolicy)) return false
  const subset = <T extends { id: string }>(oldRows: T[], newRows: T[], check: (left: T, right: T) => boolean) => {
    if (new Set(newRows.map(row => row.id)).size !== newRows.length) return false
    return newRows.every(row => { const original = oldRows.find(value => value.id === row.id); return !!original && check(original, row) })
  }
  if (!subset(oldAssignments, newAssignments, reducedEntry)) return false
  return subset(oldDelegations, newDelegations, (original, row) =>
    (original.status !== 'revoked' || row.status === 'revoked') &&
    (row.status === 'active' || row.status === 'revoked') &&
    same(original, { ...row, status: original.status }))
}
