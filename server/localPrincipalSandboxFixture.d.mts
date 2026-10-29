import type { LocalFixture } from '../contracts/local-principal-sandbox/v1/protocol.mjs'

export const AI_PDM_ROLE_CATALOG_V7_VERSION: 'ai-pdm.role-catalog.2026-10-10.v7'
export const AI_PDM_ROLE_CATALOG_V7_SHA256: '4d624b16a58299a78bc3bac4b7f39f261ec2ba34ae604f06ed7cdb7a078e01f9'
export const LOCAL_PRINCIPAL_FIXTURE_VERSION: 'orgmaster.local-principal-fixtures.2026-10-29.v1'
export const LOCAL_SANDBOX_COMPANY_ID: 'company-jenfu'
export const LOCAL_SANDBOX_WORKSPACE_REF: 'company-jenfu'

export type AiPdmV7Role = {
  stableRoleId: string
  roleCode: string
  displayName: string
  assignable: boolean
  risk: 'normal' | 'high' | 'critical'
  subjectKind: 'employee' | 'principal'
  recommendationAllowed: boolean
  delegationAllowed: boolean
  allowedScopeKinds: string[]
  assignmentTier: string
  permissions: Array<{ code: string; kind: 'page' | 'action'; allowed: boolean }>
  roleDefinitionHash: string
  metadata?: unknown
}
export type AiPdmV7Catalog = {
  contractVersion: 'jenfu.platform-entitlement.v1'
  applicationId: 'ai-pdm'
  catalogVersion: typeof AI_PDM_ROLE_CATALOG_V7_VERSION
  publishedAt: string
  roles: AiPdmV7Role[]
  catalogSha256: typeof AI_PDM_ROLE_CATALOG_V7_SHA256
}
export type AiPdmV7CatalogSource = {
  catalog: AiPdmV7Catalog
  sourceSha256: string
}
export type OwnerApplicationId = 'orgmaster' | 'financial-management-system'
export type OwnerRoleDefinition = {
  stableRoleId: string
  roleDefinitionHash: string
  subjectKind: 'employee' | 'principal'
  assignable: boolean
  allowedScopeKinds: string[]
}
export type OwnerRoleCatalog = {
  applicationId: OwnerApplicationId
  contractVersion: string
  catalogVersion: string
  catalogSha256: string
  sourceSha256: string
  roles: OwnerRoleDefinition[]
}
export type OwnerDirectGrant = {
  scenarioId: string
  applicationId: OwnerApplicationId
  stableRoleId: string
  companyId: string
  scopeKind: string
  scopeRef: string | null
  grantVersion: number
  status: 'active' | 'revoked'
  validFrom: string
  validUntil: string | null
  grantKind: 'direct' | 'delegated'
}
export type ReadAiPdmRoleCatalogV7Options = {
  root?: string
  catalogVersion?: string
  catalogSha256?: string
  expectedSourceSha256?: string
}
export type ValidateAiPdmRoleCatalogV7Options = {
  catalogVersion?: string
  catalogSha256?: string
  sourceSha256?: string
}
export type BuildLocalPrincipalSandboxFixtureOptions = {
  root?: string
  catalogSource?: AiPdmV7CatalogSource
  catalogVersion?: string
  catalogSha256?: string
  sourceSha256?: string
  fixtureVersion?: string
  ownerRoleDefinitions?: Partial<Record<OwnerApplicationId, OwnerRoleCatalog>>
  ownerDirectGrants?: OwnerDirectGrant[]
}
export type ValidateLocalPrincipalSandboxFixtureOptions = {
  catalogSource?: AiPdmV7CatalogSource
  catalogVersion?: string
  catalogSha256?: string
  sourceSha256?: string
  fixtureVersion?: string
  ownerRoleDefinitions?: Partial<Record<OwnerApplicationId, OwnerRoleCatalog>>
}

export function readAiPdmRoleCatalogV7(options?: ReadAiPdmRoleCatalogV7Options): AiPdmV7CatalogSource
export function validateAiPdmRoleCatalogV7(
  source: AiPdmV7CatalogSource,
  options?: ValidateAiPdmRoleCatalogV7Options,
): AiPdmV7CatalogSource
export function buildLocalPrincipalSandboxFixture(options?: BuildLocalPrincipalSandboxFixtureOptions): LocalFixture
export function validateLocalPrincipalSandboxFixture(
  fixture: unknown,
  options?: ValidateLocalPrincipalSandboxFixtureOptions,
): LocalFixture
