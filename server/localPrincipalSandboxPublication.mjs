import {
  AI_PDM_ROLE_CATALOG_V7_SHA256,
  AI_PDM_ROLE_CATALOG_V7_VERSION,
  readAiPdmRoleCatalogV7,
  validateLocalPrincipalSandboxFixture,
} from './localPrincipalSandboxFixture.mjs'

export const LOCAL_PRINCIPAL_PUBLICATION_PLAN_VERSION = 'orgmaster.local-principal-publication-plan.v1'

const HASH = /^[a-f0-9]{64}$/u
const SANDBOX_ID = /^[a-z][a-z0-9-]{2,63}$/u

const WRITE_SQL = `SELECT authority_version, source_revision, outbox_count
FROM orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v2(
  $1::jsonb, $2, $3, $4, $5, $6::jsonb
)`

const PRINCIPAL_ACCOUNTS_SQL = `SELECT contract_version, principal_issuer, principal_subject,
       principal_id, employee_id, account_type, employee_status, mapping_version, published_at
  FROM orgmaster_contract.v_active_principal_accounts_v1
 WHERE principal_id = $1 AND employee_id = $2
   AND principal_issuer = $3 AND principal_subject = $4
 ORDER BY mapping_version DESC`

const PDM_GRANTS_SQL = `SELECT contract_version, assignment_version_id, assignment_version,
       assignment_id, grant_kind, delegation_id, application_id, principal_id, employee_id,
       subject_kind, target_principal_id, stable_role_id, role_code, catalog_version,
       scope_kind, scope_key, valid_from, valid_until, published_at
  FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v4
 WHERE principal_id = $1 AND employee_id = $2
 ORDER BY assignment_version DESC, assignment_id`

const PDM_CATALOG_SQL = `SELECT contract_version, application_id, catalog_version, catalog_sha256,
       stable_role_id, role_code, subject_kind, assignable, allowed_scope_kinds, role_definition_hash
  FROM ai_pdm_contract.v_application_role_catalog_v2
 WHERE application_id = 'ai-pdm' AND catalog_version = $1
 ORDER BY display_order`

const ORGMASTER_VISIBILITY_SQL = `SELECT application_id, principal_issuer, principal_subject,
       assignment_version, visibility_state
  FROM orgmaster_contract.v_portal_app_visibility_v1
 WHERE application_id = 'orgmaster'
   AND principal_issuer = $1 AND principal_subject = $2`

const FMS_AUTHORITY_SQL = `SELECT contract_version, manifest_hash, application_id, principal_id,
       employee_id, principal_binding_version, governance_revision, assignment_version,
       workspace_version_id, workspace_revision, catalog_version, catalog_content_sha256,
       catalog_artifact_sha256, assignments, protected_grants
  FROM orgmaster_contract.v_fms_authority_v2
 WHERE principal_id = $1 AND employee_id = $2`

const FMS_CANDIDATES_SQL = `SELECT contract_version, manifest_hash, application_id, principal_id,
       employee_id, principal_binding_version, governance_revision, assignment_version,
       workspace_version_id, workspace_revision, catalog_version, catalog_content_sha256,
       catalog_artifact_sha256, assignment_id, stable_role_id, scope_kind, scope_key,
       valid_from, valid_until, source_assignment_id, authoring_catalog_version,
       authoring_catalog_sha256
  FROM orgmaster_contract.v_fms_principal_candidates_v2
 WHERE principal_id = $1 AND employee_id = $2
 ORDER BY assignment_id`

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function text(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function ownerCatalogPinIssue(applicationId, pin, grants) {
  if (!record(pin) || pin.applicationId !== applicationId || !text(pin.catalogVersion) ||
    !HASH.test(pin.catalogSha256 ?? '') || !Array.isArray(pin.roles) || pin.roles.length === 0) {
    return `${applicationId}_owner_catalog_pin_required`
  }
  if (applicationId === 'ai-pdm' && (pin.sourcePath !== 'postgres:ai_pdm_contract.v_application_role_catalog_v2' ||
    pin.catalogVersion !== AI_PDM_ROLE_CATALOG_V7_VERSION || pin.catalogSha256 !== AI_PDM_ROLE_CATALOG_V7_SHA256)) {
    return 'ai_pdm_v7_owner_contract_pin_mismatch'
  }
  if (applicationId === 'financial-management-system' &&
    (pin.sourceKind !== 'application-contract' || pin.validationState !== 'valid' ||
      pin.effectState !== 'not-synchronized' || !HASH.test(pin.payloadHash ?? '') ||
      pin.catalogSha256 !== pin.payloadHash ||
    (!HASH.test(pin.contentSha256 ?? '') || pin.contentSha256 !== pin.catalogSha256 ||
      !HASH.test(pin.artifactSha256 ?? '') || !text(pin.publishedByPrincipalId) ||
      !text(pin.publishedByEmployeeId) || !text(pin.sourceDraftId) ||
      !Number.isSafeInteger(pin.sourceDraftRevision) || pin.sourceDraftRevision < 0))) {
    return 'fms_catalog_release_provenance_incomplete'
  }
  const roleById = new Map(pin.roles.map((role) => [role.stableRoleId, role]))
  for (const grant of grants) {
    const role = roleById.get(grant.stableRoleId)
    const roleStatus = role?.status ?? role?.roleStatus ?? 'active'
    if (!role || roleStatus !== 'active' || role.assignable !== true ||
      role.roleDefinitionHash !== grant.roleDefinitionHash ||
      !Array.isArray(role.allowedScopeKinds) || !role.allowedScopeKinds.includes(grant.scopeKind)) {
      return `${applicationId}_grant_does_not_match_owner_catalog_pin`
    }
    if (role.stableRoleId.toLowerCase() === 'defaultadmin' ||
      (typeof role.code === 'string' && role.code.toLowerCase() === 'defaultadmin')) {
      return 'defaultadmin_role_forbidden'
    }
  }
  return null
}

function sqlQuery(textValue, values) {
  return Object.freeze({ text: textValue, values: Object.freeze(values) })
}

function roleForGrant(grant, scenario, catalogSource, ownerRoleDefinitions) {
  const roles = grant.applicationId === 'ai-pdm'
    ? catalogSource.catalog.roles
    : ownerRoleDefinitions[grant.applicationId]?.roles ?? []
  const role = roles.find((candidate) => candidate.stableRoleId === grant.stableRoleId)
  if (!role) return null
  if (role.stableRoleId.toLowerCase() === 'defaultadmin' ||
    (typeof role.roleCode === 'string' && role.roleCode.toLowerCase() === 'defaultadmin') ||
    (typeof role.code === 'string' && role.code.toLowerCase() === 'defaultadmin')) return null
  const subjectKind = role.subjectKind
  if (!['employee', 'principal'].includes(subjectKind)) return null
  if ((subjectKind === 'employee' && scenario.accountType !== 'human_personal') ||
    (subjectKind === 'principal' && scenario.accountType !== 'human_privileged')) return null
  if (subjectKind === 'principal' && (grant.scopeKind !== 'global' || grant.scopeRef !== null ||
    grant.stableRoleId !== 'role-system-admin' || scenario.accountType !== 'human_privileged')) return null
  return { role, subjectKind }
}

function readbackQueries(scenario) {
  const principalValues = [scenario.principalId, scenario.employeeId, scenario.identityIssuer, scenario.identitySubject]
  const queries = [sqlQuery(PRINCIPAL_ACCOUNTS_SQL, principalValues)]
  if (scenario.grants.some((grant) => grant.applicationId === 'ai-pdm')) {
    queries.push(sqlQuery(PDM_CATALOG_SQL, [AI_PDM_ROLE_CATALOG_V7_VERSION]))
    queries.push(sqlQuery(PDM_GRANTS_SQL, [scenario.principalId, scenario.employeeId]))
  }
  if (scenario.grants.some((grant) => grant.applicationId === 'orgmaster')) {
    queries.push(sqlQuery(ORGMASTER_VISIBILITY_SQL, [scenario.identityIssuer, scenario.identitySubject]))
  }
  if (scenario.grants.some((grant) => grant.applicationId === 'financial-management-system')) {
    queries.push(sqlQuery(FMS_AUTHORITY_SQL, [scenario.principalId, scenario.employeeId]))
    queries.push(sqlQuery(FMS_CANDIDATES_SQL, [scenario.principalId, scenario.employeeId]))
  }
  return queries
}

/**
 * Produces a non-executing plan against OrgMaster's existing owner writer and
 * published contract views. It intentionally blocks when the shared native
 * contracts cannot represent all fixture dimensions without inference.
 */
export function buildLocalPrincipalSandboxPublicationPlan({
  fixture,
  sandboxId,
  assignmentVersionNumber,
  catalogSource = readAiPdmRoleCatalogV7(),
  ownerRoleDefinitions = {},
  ownerCatalogPins = {},
} = {}) {
  if (!SANDBOX_ID.test(sandboxId ?? '')) throw new TypeError('local_sandbox_id_invalid')
  const validated = validateLocalPrincipalSandboxFixture(fixture, { catalogSource, ownerRoleDefinitions })
  const databaseName = `jenfu_local_${sandboxId.replaceAll('-', '_')}`
  const fixturePrincipalIds = new Set(validated.scenarios.map((scenario) => scenario.principalId))
  const applications = new Set(validated.scenarios.flatMap((scenario) => scenario.grants.map((grant) => grant.applicationId)))
  const allGrants = validated.scenarios.flatMap((scenario) => scenario.grants.map((grant) => ({ ...grant, scenarioId: scenario.scenarioId })))
  const blockers = new Set([
    'local_fixture_lifecycle_generation_has_no_owner_event_readback',
  ])
  if (!Number.isSafeInteger(assignmentVersionNumber) || assignmentVersionNumber < 1) {
    blockers.add('target_assignment_version_number_readback_required')
  }

  const aiPdmGrants = allGrants.filter((grant) => grant.applicationId === 'ai-pdm')
  const aiPdmPinIssue = ownerCatalogPinIssue('ai-pdm', ownerCatalogPins.aiPdm, aiPdmGrants)
  if (aiPdmPinIssue) blockers.add(aiPdmPinIssue)

  const fmsGrants = allGrants.filter((grant) => grant.applicationId === 'financial-management-system')
  if (fmsGrants.length) {
    const fmsPinIssue = ownerCatalogPinIssue('financial-management-system', ownerCatalogPins.financialManagementSystem, fmsGrants)
    if (fmsPinIssue) blockers.add(fmsPinIssue)
  }

  if (applications.has('orgmaster')) {
    const nativePin = ownerCatalogPins.orgmaster
    if (!record(nativePin) || nativePin.applicationId !== 'orgmaster' ||
      nativePin.sourceKind !== 'orgmaster-native-published-version' ||
      !text(nativePin.activeVersionId) || !HASH.test(nativePin.snapshotHash ?? '') ||
      !HASH.test(nativePin.roleBundleSharedHash ?? '')) {
      blockers.add('orgmaster_native_active_published_version_pin_required')
    }
  }
  if (allGrants.some((grant) => grant.stableRoleId.toLowerCase() === 'defaultadmin')) blockers.add('defaultadmin_role_forbidden')

  const events = validated.scenarios.map((scenario) => {
    const grants = scenario.grants.map((grant) => {
      const binding = roleForGrant(grant, scenario, catalogSource, ownerRoleDefinitions)
      const isSystemAdmin = grant.applicationId === 'ai-pdm' && grant.stableRoleId === 'role-system-admin'
      if (isSystemAdmin) blockers.add('system_admin_requires_privileged_aal2_owner_port')
      return Object.freeze({
        eventType: isSystemAdmin ? 'privileged_assignment_intent' : 'role_assignment_intent',
        applicationId: grant.applicationId,
        employeeId: scenario.employeeId,
        principalId: scenario.principalId,
        subjectKind: binding?.subjectKind ?? null,
        targetPrincipalId: binding?.subjectKind === 'principal' ? scenario.principalId : null,
        stableRoleId: grant.stableRoleId,
        catalogVersion: grant.applicationId === 'orgmaster'
          ? ownerCatalogPins.orgmaster?.activeVersionId ?? null
          : grant.catalogVersion,
        catalogSha256: grant.applicationId === 'orgmaster'
          ? ownerCatalogPins.orgmaster?.snapshotHash ?? null
          : grant.catalogSha256,
        roleDefinitionHash: grant.applicationId === 'orgmaster'
          ? ownerCatalogPins.orgmaster?.roleBundleSharedHash ?? null
          : grant.roleDefinitionHash,
        roleHashKind: grant.applicationId === 'orgmaster'
          ? 'role-bundle-explicit-shared-hash'
          : 'catalog-role-definition-hash',
        grantVersion: Number.isSafeInteger(assignmentVersionNumber) ? assignmentVersionNumber : null,
        scope: Object.freeze(grant.scopeKind === 'global'
          ? { kind: 'global' }
          : { kind: grant.scopeKind, value: grant.scopeRef }),
        status: grant.status,
        validFrom: grant.validFrom,
        validUntil: grant.validUntil,
        companyBridge: Object.freeze({
          companyId: grant.companyId,
          source: grant.scopeKind === 'workspace' && grant.scopeRef === 'company-jenfu'
            ? 'native-workspace-company-scope-key'
            : 'fixture-context-only',
          ownerCompanyGuardMustRecheck: grant.applicationId === 'ai-pdm',
        }),
        fixtureGrantVersion: grant.grantVersion,
        ownerMutationPort: isSystemAdmin
          ? 'server/privilegedAssignmentStore.publishPrivilegedAssignment'
          : grant.applicationId === 'financial-management-system'
            ? 'server/applicationRoleAssignmentStore'
            : 'server/orgmasterGovernanceStore.applyDraftCommand+publishGovernance',
      })
    })
    return Object.freeze({
      eventType: 'principal_employee_publication_intent',
      scenarioId: scenario.scenarioId,
      identityIssuer: scenario.identityIssuer,
      identitySubject: scenario.identitySubject,
      principalId: scenario.principalId,
      employeeId: scenario.employeeId,
      accountType: scenario.accountType,
      principalStatus: scenario.principalStatus,
      employeeStatus: scenario.employeeStatus,
      accountLifecycleVersion: scenario.accountLifecycleVersion,
      profileVersion: scenario.profileVersion,
      grants: Object.freeze(grants),
      ownerMutationPort: 'server/orgmasterWorkspaceStore+server/orgmasterGovernanceStore',
    })
  })

  const queries = validated.scenarios.flatMap((scenario) => readbackQueries(scenario).map((query) => Object.freeze({
    scenarioId: scenario.scenarioId,
    text: query.text,
    values: query.values,
  })))

  return Object.freeze({
    contractVersion: LOCAL_PRINCIPAL_PUBLICATION_PLAN_VERSION,
    planStatus: 'plan-only',
    executable: false,
    fixtureVersion: validated.fixtureVersion,
    fixtureHash: validated.fixtureHash,
    target: Object.freeze({ applicationId: 'orgmaster', sandboxId, databaseName, credentialIncluded: false }),
    ownerBoundary: Object.freeze({ writeSchema: 'orgmaster_core', readSchema: 'orgmaster_contract', foreignCoreAccess: false }),
    events: Object.freeze(events),
    readbackQueries: Object.freeze(queries),
    transactionPort: Object.freeze({
      ownerApi: 'server/orgmasterPersistenceRepository.writePersistenceArtifacts',
      authorizationWrapper: 'server/orgmasterGovernanceStore.withActorWrite',
      transactionWrapper: 'server/orgmasterPersistenceRepository.withPersistenceTransaction',
      isolationLevel: 'READ COMMITTED',
      writerSql: WRITE_SQL,
      parameterTypes: Object.freeze(['jsonb', 'text', 'text', 'text', 'text', 'jsonb']),
      parameters: Object.freeze([
        'prepared artifact changes with expected canonical hashes',
        'source revision derived from owner authority readback',
        'verified publishing Principal ID; never a fixture Principal',
        'reason code',
        'operation ID',
        'typed entitlement change array',
      ]),
      execution: 'not-performed',
    }),
    blockers: Object.freeze([...blockers].sort()),
    nativeFieldMap: Object.freeze({
      principal: 'orgmaster_contract.v_active_principal_accounts_v1',
      aiPdmGrants: 'orgmaster_contract.v_ai_pdm_principal_effective_grants_v4',
      orgmasterSelfGrants: 'native active GovernanceAssignmentVersionV3.policy.roleAssignments; coordinator-owned local typed view is pending',
      fmsGrants: 'orgmaster_contract.v_fms_authority_v2 and v_fms_principal_candidates_v2',
      companyId: 'projected from native company/workspace context; not a dedicated grant column; PDM must recheck with its company guard',
      grantVersion: 'the planned OrgMaster published assignment version number, matching v4.assignment_version; not a per-grant counter',
      nativePdmRoleDefinitionHash: 'join the active published externalRoleCatalogs snapshot by catalogVersion and stableRoleId',
      nativeFmsRoleDefinitionHash: 'join the active published FMS catalog snapshot by catalogVersion and stableRoleId',
      nativeOrgmasterCatalogVersion: 'GovernanceAssignmentVersionV3.id',
      nativeOrgmasterCatalogSha256: 'GovernanceAssignmentVersionV3.snapshotHash',
      nativeOrgmasterRoleHash: 'explicit role-bundle shared hash supplied by owner publication',
      principalMappingVersion: 'identity mapping publication version; not fixture lifecycleVersion or profileVersion',
    }),
    nativePublishedSource: Object.freeze({
      governanceArtifactKey: 'orgmaster-governance.v3.json',
      governanceReadApi: 'server/orgmasterGovernanceStore.readGovernanceStore',
      activeVersionJoin: 'document.activePolicyVersionId === document.publishedVersions[].id',
      publicationFields: Object.freeze(['id', 'versionNumber', 'snapshotHash', 'policy.roleAssignments', 'externalRoleCatalogs']),
      workspaceReadApis: Object.freeze(['server/orgmasterWorkspaceStore.getWorkspaceIndex', 'server/orgmasterWorkspaceStore.getWorkspaceVersion']),
      employeeSourcePath: 'currentWorkspace.document.state.employees',
    }),
    fixturePrincipalIds: Object.freeze([...fixturePrincipalIds].sort()),
  })
}
