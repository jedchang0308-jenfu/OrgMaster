import type {
  AiPdmV7CatalogSource,
  OwnerApplicationId,
  OwnerRoleCatalog,
} from './localPrincipalSandboxFixture.mjs'

export const LOCAL_PRINCIPAL_PUBLICATION_PLAN_VERSION: 'orgmaster.local-principal-publication-plan.v1'

export type LocalPublicationCatalogPin = {
  applicationId: string
  catalogVersion: string
  catalogSha256: string
  roles: Array<Record<string, unknown> & {
    stableRoleId: string
    roleDefinitionHash: string
    subjectKind: 'employee' | 'principal'
    assignable: boolean
    allowedScopeKinds: string[]
  }>
  sourcePath?: string
  sourceKind?: string
  validationState?: string
  effectState?: string
  payloadHash?: string
  contentSha256?: string
  artifactSha256?: string
  publishedByPrincipalId?: string
  publishedByEmployeeId?: string
  sourceDraftId?: string
  sourceDraftRevision?: number
}

export type LocalPublicationNativeOrgMasterVersionPin = {
  applicationId: 'orgmaster'
  sourceKind: 'orgmaster-native-published-version'
  activeVersionId: string
  snapshotHash: string
  roleBundleSharedHash: string
}

export type LocalPublicationSqlQuery = {
  scenarioId: string
  text: string
  values: readonly unknown[]
}

export type LocalPrincipalSandboxPublicationPlanOptions = {
  fixture: unknown
  sandboxId: string
  /** Version number of the planned active OrgMaster assignment publication, from owner readback. */
  assignmentVersionNumber?: number
  catalogSource?: AiPdmV7CatalogSource
  ownerRoleDefinitions?: Partial<Record<OwnerApplicationId, OwnerRoleCatalog>>
  ownerCatalogPins?: {
    /** Exact result of readPublishedAiPdmRoleCatalogFromDatabase for the active v7 catalog. */
    aiPdm?: LocalPublicationCatalogPin & { sourcePath: 'postgres:ai_pdm_contract.v_application_role_catalog_v2' }
    /** Exact active, application-contract-owned FMS catalog snapshot. */
    financialManagementSystem?: LocalPublicationCatalogPin & { sourceKind: 'application-contract' }
    /** Active native GovernanceAssignmentVersionV3 pin, not an external catalog. */
    orgmaster?: LocalPublicationNativeOrgMasterVersionPin
  }
}

export type LocalPrincipalSandboxPublicationPlan = {
  contractVersion: typeof LOCAL_PRINCIPAL_PUBLICATION_PLAN_VERSION
  planStatus: 'plan-only'
  executable: false
  fixtureVersion: string
  fixtureHash: string
  target: { applicationId: 'orgmaster'; sandboxId: string; databaseName: string; credentialIncluded: false }
  ownerBoundary: { writeSchema: 'orgmaster_core'; readSchema: 'orgmaster_contract'; foreignCoreAccess: false }
  events: readonly Record<string, unknown>[]
  readbackQueries: readonly LocalPublicationSqlQuery[]
  transactionPort: {
    ownerApi: 'server/orgmasterPersistenceRepository.writePersistenceArtifacts'
    authorizationWrapper: 'server/orgmasterGovernanceStore.withActorWrite'
    transactionWrapper: 'server/orgmasterPersistenceRepository.withPersistenceTransaction'
    isolationLevel: 'READ COMMITTED'
    writerSql: string
    parameterTypes: readonly ['jsonb', 'text', 'text', 'text', 'text', 'jsonb']
    parameters: readonly string[]
    execution: 'not-performed'
  }
  blockers: readonly string[]
  nativeFieldMap: Record<string, unknown>
  nativePublishedSource: Record<string, unknown>
  fixturePrincipalIds: readonly string[]
}

export function buildLocalPrincipalSandboxPublicationPlan(
  options: LocalPrincipalSandboxPublicationPlanOptions,
): LocalPrincipalSandboxPublicationPlan
