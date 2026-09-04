import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { ExternalRoleCatalogSnapshotV1 } from '../src/governance/types'
import { FINANCIAL_CATALOG_SHA256, FINANCIAL_CATALOG_VERSION, FINANCIAL_APPLICATION_ID, validateFinancialExternalRoleCatalog } from '../src/governance/financialCatalog'

export class FinancialRoleCatalogRepositoryError extends Error {
  constructor(readonly code: 'FINANCIAL_CATALOG_UNAVAILABLE' | 'FINANCIAL_CATALOG_INVALID' | 'FINANCIAL_CATALOG_VERSION_CONFLICT') {
    super(code)
    this.name = 'FinancialRoleCatalogRepositoryError'
  }
}

const artifactRelativePath = 'contracts/jenfu-platform-entitlement/v2/fixtures/financial-role-catalog.v1.json'

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) throw new FinancialRoleCatalogRepositoryError('FINANCIAL_CATALOG_INVALID')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object') return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`
  throw new FinancialRoleCatalogRepositoryError('FINANCIAL_CATALOG_INVALID')
}

function sha256(value: unknown) {
  return createHash('sha256').update(Buffer.from(canonicalJson(value), 'utf8')).digest('hex')
}

export async function readFinancialRoleCatalog(
  validationState: ExternalRoleCatalogSnapshotV1['validationState'] = 'valid',
  root = process.cwd(),
): Promise<ExternalRoleCatalogSnapshotV1> {
  let raw: string
  const artifactPath = resolve(root, artifactRelativePath)
  try { raw = await readFile(artifactPath, 'utf8') } catch {
    try { raw = await readFile(resolve(process.cwd(), artifactRelativePath), 'utf8') } catch { throw new FinancialRoleCatalogRepositoryError('FINANCIAL_CATALOG_UNAVAILABLE') }
  }
  if (!raw.endsWith('\n') || raw.endsWith('\n\n') || raw.charCodeAt(0) === 0xfeff) throw new FinancialRoleCatalogRepositoryError('FINANCIAL_CATALOG_INVALID')
  let catalog: any
  try { catalog = JSON.parse(raw) } catch { throw new FinancialRoleCatalogRepositoryError('FINANCIAL_CATALOG_INVALID') }
  if (catalog.applicationId !== FINANCIAL_APPLICATION_ID || catalog.catalogVersion !== FINANCIAL_CATALOG_VERSION) throw new FinancialRoleCatalogRepositoryError('FINANCIAL_CATALOG_VERSION_CONFLICT')
  const catalogWithoutHash = { ...catalog }
  delete catalogWithoutHash.catalogSha256
  if (raw !== `${canonicalJson(catalog)}\n` || sha256(catalogWithoutHash) !== FINANCIAL_CATALOG_SHA256 || catalog.catalogSha256 !== FINANCIAL_CATALOG_SHA256) throw new FinancialRoleCatalogRepositoryError('FINANCIAL_CATALOG_INVALID')

  const snapshot: ExternalRoleCatalogSnapshotV1 = {
    applicationId: FINANCIAL_APPLICATION_ID,
    catalogVersion: FINANCIAL_CATALOG_VERSION,
    sourceKind: 'bundled-fixture',
    sourceRefs: [{ path: artifactRelativePath, range: 'canonical artifact', sha256: FINANCIAL_CATALOG_SHA256 }],
    capturedAt: catalog.publishedAt,
    payloadHash: FINANCIAL_CATALOG_SHA256,
    catalogSha256: FINANCIAL_CATALOG_SHA256,
    validationState,
    effectState: 'not-synchronized',
    roles: catalog.roles.map((role: any) => ({
      stableRoleId: String(role.stableRoleId),
      code: String(role.code),
      displayName: String(role.displayName),
      status: role.status,
      assignable: true,
      riskLevel: 'normal',
      allowedScopeKinds: ['workspace'],
      subjectKind: 'employee',
      recommendationAllowed: false,
      delegationAllowed: false,
      assignmentTier: 'app_admin',
    })),
  }
  if (validateFinancialExternalRoleCatalog(snapshot).length) throw new FinancialRoleCatalogRepositoryError('FINANCIAL_CATALOG_INVALID')
  return snapshot
}

export { artifactRelativePath }
