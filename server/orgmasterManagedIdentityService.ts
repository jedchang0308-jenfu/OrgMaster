import type { GovernanceActorContext, GovernanceDocumentV3 } from '../src/governance/types'
import type {
  AssignEmployeeNumberRequestV1,
  BindManagedIdentityAuthRequestV1,
  ConfirmManagedIdentityLinkRequestV1,
  FindManagedIdentityCandidateRequestV1,
  ManagedIdentityCandidateResponseV1,
  ManagedIdentityReadModelV1,
  ManagedIdentityRefreshClaimV1,
  ManagedIdentityRefreshResultV1,
  ResolveLoginAliasResponseV1,
} from '../src/managedIdentity/types'
import { deriveManagedUsername } from '../src/managedIdentity/employeeNumber'
import { evaluatePermission } from '../src/governance/evaluatePermission'
import { isActiveAt } from '../src/governance/validation'
import { developmentPermissionForActor } from './orgmasterGovernanceIdentity'
import { loadOrganizationSource, readExistingGovernanceStore } from './orgmasterGovernanceStore'
import { createManagedIdentityRepository, type ManagedIdentityRepositoryV1 } from './orgmasterManagedIdentityRepository'
import type { ManagedDirectoryPortV1 } from './orgmasterManagedDirectoryPort'

export class ManagedIdentityServiceError extends Error {
  constructor(public readonly code: string, public readonly details?: { retryable?: boolean }) {
    super(code)
    this.name = 'ManagedIdentityServiceError'
  }
}

export interface ManagedIdentityServiceV1 {
  read(employeeId: string, actor: GovernanceActorContext): Promise<ManagedIdentityReadModelV1>
  assignNumber(employeeId: string, actor: GovernanceActorContext, request: AssignEmployeeNumberRequestV1): Promise<ManagedIdentityReadModelV1>
  findCandidate(employeeId: string, actor: GovernanceActorContext, request: FindManagedIdentityCandidateRequestV1): Promise<ManagedIdentityCandidateResponseV1>
  confirmLink(employeeId: string, actor: GovernanceActorContext, request: ConfirmManagedIdentityLinkRequestV1): Promise<ManagedIdentityReadModelV1>
  bindAuth(employeeId: string, input: { issuer: string; subject: string; email: string; signInProvider: string; emailVerified: boolean; commandId?: string }): Promise<ManagedIdentityReadModelV1>
  resolveFirebaseIdentity(input: { issuer: string; subject: string; email: string; signInProvider: string; emailVerified: boolean }): Promise<{ principalId: string; employeeId: string }>
  resolveLoginAlias(employeeNumber: string): Promise<ResolveLoginAliasResponseV1>
  activationCheck(employeeId: string, workspaceRevision: string): Promise<{ allowed: boolean; correctionRequired: boolean }>
  enqueueRefresh(employeeId: string, actor: GovernanceActorContext, trigger: 'manual' | 'periodic' | 'domain', commandId: string): Promise<{ disposition: 'queued' | 'deduplicated'; requestId: string }>
  claimRefresh(workerId: string, limit?: number, leaseSeconds?: number): Promise<ManagedIdentityRefreshClaimV1[]>
  completeRefresh(input: { requestId: string; workerId: string; leaseVersion: number; directoryCustomerId: string; directoryUserId: string; directoryState: 'missing' | 'present' | 'suspended' | 'archived'; primaryEmail: string | null; sourceEtag: string | null; adapterOutcome: 'success' | 'not_found' }): Promise<ManagedIdentityRefreshResultV1>
  retryRefresh(input: { requestId: string; workerId: string; leaseVersion: number; errorCode: string }): Promise<ManagedIdentityRefreshResultV1>
}

const VIEW = 'orgmaster.identity.view'
const MANAGE_NUMBER = 'orgmaster.employee-number.manage'
const LINK = 'orgmaster.identity.link'
const REFRESH = 'orgmaster.identity.refresh'

function hasPermission(document: GovernanceDocumentV3, actor: GovernanceActorContext, permissionCode: string) {
  const development = developmentPermissionForActor(actor, permissionCode)
  if (development !== null) return development
  return evaluatePermission(document, {
    applicationId: 'orgmaster', issuer: actor.issuer, subject: actor.subject, permissionCode, scope: { kind: 'global' },
  }).status === 'allowed'
}

function isHumanPrivilegedActor(document: GovernanceDocumentV3, actor: GovernanceActorContext, at = new Date().toISOString()) {
  const link = document.draft.identityLinks.find((value) => value.principalId === actor.principalId && value.issuer === actor.issuer && value.subject === actor.subject && isActiveAt(value.status, value.validFrom, value.validTo, at))
  if (!link) return false
  return (document.draft.principalAdmissions ?? []).some((admission) => admission.identityLinkId === link.id && admission.accountType === 'human_privileged' && admission.status === 'active')
}

function requireHumanPrivileged(document: GovernanceDocumentV3, actor: GovernanceActorContext, devEnabled: boolean) {
  if (!devEnabled && !isHumanPrivilegedActor(document, actor)) throw new ManagedIdentityServiceError('HUMAN_PRIVILEGED_REQUIRED')
}

function requireEmployeeId(employeeId: string) {
  if (typeof employeeId !== 'string' || !employeeId.trim() || employeeId.length > 255) throw new ManagedIdentityServiceError('EMPLOYEE_NOT_FOUND')
  return employeeId
}

function mapStoreError(error: unknown): never {
  const code = error instanceof ManagedIdentityServiceError ? error.code : error instanceof Error ? error.message : ''
  const known = ['EMPLOYEE_NUMBER_INVALID', 'EMPLOYEE_NUMBER_REQUIRED', 'EMPLOYEE_NUMBER_CONFLICT', 'EMPLOYEE_NUMBER_RETIRED', 'EMPLOYEE_NOT_FOUND', 'MANAGED_IDENTITY_REVISION_CONFLICT', 'MANAGED_IDENTITY_OWNER_CONFLICT', 'MANAGED_IDENTITY_JOURNAL_INVALID', 'MANAGED_IDENTITY_CANDIDATE_INVALID', 'MANAGED_IDENTITY_CANDIDATE_EXPIRED', 'MANAGED_IDENTITY_CANDIDATE_CONSUMED', 'MANAGED_IDENTITY_IDENTITY_CONFLICT', 'MANAGED_IDENTITY_ADMISSION_DISABLED', 'MANAGED_IDENTITY_REFRESH_LEASE_CONFLICT', 'DIRECTORY_CANDIDATE_NOT_FOUND', 'DIRECTORY_CANDIDATE_MISMATCH', 'DIRECTORY_READ_UNAVAILABLE', 'LOGIN_NOT_AVAILABLE', 'HUMAN_PRIVILEGED_REQUIRED']
  if (code === 'MANAGED_IDENTITY_REVISION_CONFLICT') throw new ManagedIdentityServiceError('REVISION_CONFLICT', { retryable: true })
  if (code === 'MANAGED_IDENTITY_OWNER_CONFLICT') throw new ManagedIdentityServiceError('MANAGED_IDENTITY_WRITE_FAILED', { retryable: true })
  if (code === 'MANAGED_IDENTITY_JOURNAL_INVALID') throw new ManagedIdentityServiceError('MANAGED_IDENTITY_RECOVERY_REQUIRED', { retryable: true })
  if (code === 'MANAGED_IDENTITY_CANDIDATE_EXPIRED' || code === 'MANAGED_IDENTITY_CANDIDATE_CONSUMED' || code === 'MANAGED_IDENTITY_CANDIDATE_INVALID') throw new ManagedIdentityServiceError('CANDIDATE_INVALID')
  if (code === 'MANAGED_IDENTITY_IDENTITY_CONFLICT') throw new ManagedIdentityServiceError('DIRECTORY_IDENTITY_CONFLICT')
  if (code === 'MANAGED_IDENTITY_ADMISSION_DISABLED') throw new ManagedIdentityServiceError('DB_ADMISSION_DISABLED')
  if (code === 'MANAGED_IDENTITY_REFRESH_LEASE_CONFLICT') throw new ManagedIdentityServiceError('REFRESH_LEASE_CONFLICT', { retryable: true })
  if (known.includes(code)) throw new ManagedIdentityServiceError(code)
  throw new ManagedIdentityServiceError('MANAGED_IDENTITY_WRITE_FAILED', { retryable: true })
}

export function createManagedIdentityService(input: {
  root: string
  devEnabled: boolean
  now?: () => Date
  repository?: ManagedIdentityRepositoryV1
  directory?: ManagedDirectoryPortV1
  managedDomain?: string
  directoryCustomerId?: string
}): ManagedIdentityServiceV1 {
  const repository = input.repository ?? createManagedIdentityRepository({ root: input.root, devEnabled: input.devEnabled })
  const directory = input.directory
  const domain = input.managedDomain ?? (input.devEnabled ? 'orgmaster.test' : 'jenfu.com.tw')
  const customerId = input.directoryCustomerId ?? (input.devEnabled ? 'local-customer' : '')
  const readGovernance = async () => {
    try { return await readExistingGovernanceStore(input.root) } catch { throw new ManagedIdentityServiceError('GOVERNANCE_READ_FAILED', { retryable: true }) }
  }
  const readEmployee = async (employeeId: string) => {
    requireEmployeeId(employeeId)
    try {
      const source = await loadOrganizationSource(input.root)
      const employee = source.state.employees.find((candidate) => candidate.id === employeeId)
      if (!employee) throw new ManagedIdentityServiceError('EMPLOYEE_NOT_FOUND')
      return { employee, workspaceRevision: source.workspaceRevision }
    } catch (error) {
      if (error instanceof ManagedIdentityServiceError) throw error
      throw new ManagedIdentityServiceError('GOVERNANCE_READ_FAILED', { retryable: true })
    }
  }
  const viewFor = async (employeeId: string, actor: GovernanceActorContext, internal = false): Promise<ManagedIdentityReadModelV1> => {
    const { employee, workspaceRevision } = await readEmployee(employeeId)
    const governance = await readGovernance()
    if (!internal && !hasPermission(governance.document, actor, VIEW) && !hasPermission(governance.document, actor, MANAGE_NUMBER)) throw new ManagedIdentityServiceError('IDENTITY_VIEW_REQUIRED')
    if (repository.mode === 'postgresql') {
      const model = await repository.readEmployeeManagedIdentity(employeeId)
      if (!model) throw new ManagedIdentityServiceError('EMPLOYEE_NOT_FOUND')
      return {
        ...model,
        employee: { id: employee.id, status: employee.status === 'inactive' ? 'inactive' : 'active' },
        capabilities: { view: true, manageNumber: hasPermission(governance.document, actor, MANAGE_NUMBER), manageLink: hasPermission(governance.document, actor, LINK), refresh: hasPermission(governance.document, actor, REFRESH) },
        workspaceRevision,
      }
    }
    const state = await repository.readExisting()
    const assignment = state.document.registry.assignments.find((entry) => entry.employeeId === employeeId) ?? null
    const identity = (state.document.managedDailyIdentities ?? []).find((entry) => entry.employeeId === employeeId) ?? null
    const observation = identity ? (state.document.observations ?? []).find((entry) => entry.identityRecordId === identity.identityRecordId) ?? null : null
    return {
      contractVersion: 'orgmaster.managed-identity.v1', employee: { id: employee.id, status: employee.status === 'inactive' ? 'inactive' : 'active' },
      employeeNumber: { status: assignment ? 'assigned' : 'unassigned', value: assignment?.employeeNumber ?? null, derivedUsername: assignment ? deriveManagedUsername(assignment.employeeNumber, domain) : null, revision: assignment?.revision ?? null },
      identity: { state: identity?.linkState === 'directory_linked_pending_auth' ? 'directory_linked_pending_auth' : identity?.linkState === 'active' ? 'active' : identity?.linkState === 'conflict' ? 'conflict' : 'not_linked', provider: 'google.com', note: identity?.linkState === 'active' ? '已連結公司 Cloud Identity' : identity ? '已確認 Directory 身分，等待首次 Google 登入' : 'Google Admin 建立後由 OrgMaster 連結', directoryState: observation?.directoryState ?? 'unknown', primaryEmail: identity?.lastVerifiedPrimaryEmail ?? null, freshness: observation?.freshness ?? 'unknown' },
      capabilities: { view: true, manageNumber: internal ? false : hasPermission(governance.document, actor, MANAGE_NUMBER), manageLink: internal ? false : hasPermission(governance.document, actor, LINK), refresh: internal ? false : hasPermission(governance.document, actor, REFRESH) }, registryRevision: state.revision, workspaceRevision,
      admissionEnabled: state.document.admissionAuthority?.admissionEnabled ?? false,
    }
  }
  const assignNumber = async (employeeId: string, actor: GovernanceActorContext, request: AssignEmployeeNumberRequestV1) => {
    const { employee, workspaceRevision } = await readEmployee(employeeId)
    const governance = await readGovernance()
    if (!hasPermission(governance.document, actor, MANAGE_NUMBER)) throw new ManagedIdentityServiceError('IDENTITY_NUMBER_MANAGE_REQUIRED')
    requireHumanPrivileged(governance.document, actor, input.devEnabled)
    if (!request.commandId?.trim() || request.commandId.length > 255) throw new ManagedIdentityServiceError('INVALID_REQUEST')
    if (request.expectedWorkspaceRevision !== undefined && request.expectedWorkspaceRevision !== workspaceRevision) throw new ManagedIdentityServiceError('REVISION_CONFLICT', { retryable: true })
    try { await repository.appendAssignment(employee.id, request.employeeNumber, actor.principalId, request.expectedRegistryRevision, input.now?.()?.toISOString(), request.expectedWorkspaceRevision ?? workspaceRevision) } catch (error) { return mapStoreError(error) }
    return viewFor(employee.id, actor)
  }
  const findCandidate = async (employeeId: string, actor: GovernanceActorContext, request: FindManagedIdentityCandidateRequestV1) => {
    const { employee, workspaceRevision } = await readEmployee(employeeId)
    const governance = await readGovernance()
    if (!hasPermission(governance.document, actor, LINK) && !hasPermission(governance.document, actor, MANAGE_NUMBER)) throw new ManagedIdentityServiceError('IDENTITY_LINK_REQUIRED')
    requireHumanPrivileged(governance.document, actor, input.devEnabled)
    if (employee.status !== 'active') throw new ManagedIdentityServiceError('EMPLOYEE_NOT_FOUND')
    const model = repository.mode === 'postgresql' ? await repository.readEmployeeManagedIdentity(employeeId) : null
    const state = model ? null : await repository.readExisting()
    const assignment = model?.employeeNumber.value ? { employeeId, employeeNumber: model.employeeNumber.value } : state?.document.registry.assignments.find((entry) => entry.employeeId === employeeId)
    const registryRevision = model?.registryRevision ?? state?.revision ?? null
    if (!assignment) throw new ManagedIdentityServiceError('EMPLOYEE_NUMBER_REQUIRED')
    if (request.expectedWorkspaceRevision !== workspaceRevision || request.expectedRegistryRevision !== registryRevision) throw new ManagedIdentityServiceError('REVISION_CONFLICT', { retryable: true })
    if (!directory) throw new ManagedIdentityServiceError('DIRECTORY_READ_UNAVAILABLE', { retryable: true })
    const expectedEmail = deriveManagedUsername(assignment.employeeNumber, domain)
    const result = await directory.findExactCandidate(expectedEmail)
    if (!result.ok) {
      if (result.kind === 'retryable_error') throw new ManagedIdentityServiceError('DIRECTORY_READ_UNAVAILABLE', { retryable: true })
      throw new ManagedIdentityServiceError(result.code === 'DIRECTORY_CANDIDATE_MISMATCH' ? 'DIRECTORY_CANDIDATE_MISMATCH' : 'DIRECTORY_CANDIDATE_NOT_FOUND')
    }
    const created = await repository.createCandidate({ employeeId, employeeNumber: assignment.employeeNumber, expectedPrimaryEmail: expectedEmail, directoryCustomerId: result.user.customerId, directoryUserId: result.user.userId, primaryEmail: result.user.primaryEmail, sourceEtag: result.user.sourceEtag, workspaceRevision, registryRevision: registryRevision ?? '', actor: actor.principalId, now: input.now?.()?.toISOString() })
    return { candidateToken: created.token, expiresAt: created.lease.expiresAt, employee: { id: employeeId, employeeNumber: assignment.employeeNumber, expectedUsername: expectedEmail }, directory: { customerId: created.lease.directoryCustomerId, userId: created.lease.directoryUserId, primaryEmail: created.lease.primaryEmail, sourceEtag: created.lease.sourceEtag }, workspaceRevision, registryRevision: registryRevision ?? '' }
  }
  const confirmLink = async (employeeId: string, actor: GovernanceActorContext, request: ConfirmManagedIdentityLinkRequestV1) => {
    const { workspaceRevision } = await readEmployee(employeeId)
    const governance = await readGovernance()
    if (!hasPermission(governance.document, actor, LINK) && !hasPermission(governance.document, actor, MANAGE_NUMBER)) throw new ManagedIdentityServiceError('IDENTITY_LINK_REQUIRED')
    requireHumanPrivileged(governance.document, actor, input.devEnabled)
    const model = repository.mode === 'postgresql' ? await repository.readEmployeeManagedIdentity(employeeId) : null
    const state = model ? null : await repository.readExisting()
    const registryRevision = model?.registryRevision ?? state?.revision ?? null
    if (request.expectedWorkspaceRevision !== workspaceRevision || request.expectedRegistryRevision !== registryRevision) throw new ManagedIdentityServiceError('REVISION_CONFLICT', { retryable: true })
    try { await repository.confirmCandidate({ ...request, employeeId, actor: actor.principalId, now: input.now?.()?.toISOString() }) } catch (error) { return mapStoreError(error) }
    return viewFor(employeeId, actor)
  }
  const bindAuth = async (employeeId: string, auth: { issuer: string; subject: string; email: string; signInProvider: string; emailVerified: boolean; commandId?: string }) => {
    if (auth.signInProvider !== 'google.com') throw new ManagedIdentityServiceError('AUTH_PROVIDER_REQUIRED')
    if (!auth.emailVerified || !auth.email.trim()) throw new ManagedIdentityServiceError('AUTH_EMAIL_UNVERIFIED')
    try { await repository.bindAuth({ employeeId, issuer: auth.issuer, subject: auth.subject, email: auth.email, commandId: auth.commandId, now: input.now?.()?.toISOString() }) } catch (error) { return mapStoreError(error) }
    const { employee } = await readEmployee(employeeId)
    if (repository.mode === 'postgresql') {
      const model = await repository.readEmployeeManagedIdentity(employeeId)
      if (!model) throw new ManagedIdentityServiceError('MANAGED_IDENTITY_WRITE_FAILED')
      return model
    }
    const state = await repository.readExisting()
    const identity = state.document.managedDailyIdentities?.find((entry) => entry.employeeId === employee.id)
    if (!identity) throw new ManagedIdentityServiceError('MANAGED_IDENTITY_WRITE_FAILED')
    const fakeActor: GovernanceActorContext = { principalId: identity.principalId, issuer: auth.issuer, subject: auth.subject, employeeId, bootstrap: false, assuranceLevel: 'aal1', authenticatedAt: input.now?.()?.toISOString() ?? null, sessionId: `bind-${identity.identityRecordId}` }
    return viewFor(employeeId, fakeActor, true)
  }
  const resolveLoginAlias = async (employeeNumber: string) => {
    try {
      const resolved = await repository.resolveAlias(employeeNumber)
      const { employee } = await readEmployee(resolved.assignment.employeeId)
      if (employee.status !== 'active' || !resolved.identity.lastVerifiedPrimaryEmail) throw new ManagedIdentityServiceError('LOGIN_NOT_AVAILABLE')
      const observation = resolved.document.observations?.find((entry) => entry.identityRecordId === resolved.identity.identityRecordId)
      if (observation?.directoryState !== 'present' || resolved.identity.linkState !== 'active') throw new ManagedIdentityServiceError('LOGIN_NOT_AVAILABLE')
      return { provider: 'google.com' as const, loginHint: resolved.identity.lastVerifiedPrimaryEmail, expiresAt: new Date(Date.now() + 60_000).toISOString() }
    } catch (error) { if (error instanceof ManagedIdentityServiceError && error.code === 'LOGIN_NOT_AVAILABLE') throw error; throw new ManagedIdentityServiceError('LOGIN_NOT_AVAILABLE') }
  }
  const resolveFirebaseIdentity = async (auth: { issuer: string; subject: string; email: string; signInProvider: string; emailVerified: boolean }) => {
    if (auth.signInProvider !== 'google.com') throw new ManagedIdentityServiceError('AUTH_PROVIDER_REQUIRED')
    if (!auth.emailVerified || !auth.email.trim()) throw new ManagedIdentityServiceError('AUTH_EMAIL_UNVERIFIED')
    const normalized = auth.email.trim().toLowerCase()
    const resolved = repository.mode === 'postgresql' ? await repository.resolveAuthIdentity(normalized) : null
    const state = resolved ? null : await repository.readExisting()
    const identity = resolved?.identity ?? (state?.document.managedDailyIdentities ?? []).find((entry) => entry.lastVerifiedPrimaryEmail.toLowerCase() === normalized)
    if (!identity) throw new ManagedIdentityServiceError('LOGIN_NOT_AVAILABLE')
    if (directory) {
      const live = await directory.readByDirectoryKey(identity.directoryCustomerId, identity.directoryUserId)
      if (!live.ok || live.user.primaryEmail !== normalized || live.user.directoryState !== 'present') throw new ManagedIdentityServiceError('LOGIN_NOT_AVAILABLE')
    }
    if (identity.linkState === 'directory_linked_pending_auth') {
      const bound = await bindAuth(identity.employeeId, auth)
      const latestIdentity = repository.mode === 'postgresql'
        ? (await repository.resolveAuthIdentity(normalized))?.identity
        : (await repository.readExisting()).document.managedDailyIdentities?.find((entry) => entry.identityRecordId === identity.identityRecordId)
      const row = latestIdentity
      if (!row || bound.employee.id !== identity.employeeId) throw new ManagedIdentityServiceError('LOGIN_NOT_AVAILABLE')
      return { principalId: row.principalId, employeeId: row.employeeId }
    }
    if (identity.linkState !== 'active' || identity.authIssuer !== auth.issuer || identity.authSubject !== auth.subject) throw new ManagedIdentityServiceError('LOGIN_NOT_AVAILABLE')
    return { principalId: identity.principalId, employeeId: identity.employeeId }
  }
  const activationCheck = async (employeeId: string, workspaceRevision: string) => {
    try {
      const { employee } = await readEmployee(employeeId)
      const source = await loadOrganizationSource(input.root)
      if (workspaceRevision !== source.workspaceRevision) return { allowed: false, correctionRequired: true }
      if (employee.status === 'inactive') return { allowed: false, correctionRequired: false }
      if (repository.mode === 'postgresql') return repository.assertEmployeeActivation(employeeId, workspaceRevision)
      const state = await repository.readExisting()
      const assignment = state.document.registry.assignments.find((entry) => entry.employeeId === employeeId)
      const exemption = (state.document.invalidationApplications ?? []).some((entry) => entry.applicationId === 'orgmaster' && entry.status === 'active')
      return { allowed: Boolean(assignment || exemption), correctionRequired: !assignment && !exemption }
    } catch { return { allowed: false, correctionRequired: false } }
  }
  return {
    read: viewFor,
    assignNumber,
    findCandidate,
    confirmLink,
    bindAuth,
    resolveFirebaseIdentity,
    resolveLoginAlias,
    activationCheck,
    async enqueueRefresh(employeeId, actor, trigger, commandId) {
      const governance = await readGovernance()
      if (!hasPermission(governance.document, actor, REFRESH)) throw new ManagedIdentityServiceError('IDENTITY_REFRESH_REQUIRED')
      requireHumanPrivileged(governance.document, actor, input.devEnabled)
      try { return await repository.enqueueRefresh({ employeeId, trigger, commandId, actor: actor.principalId }) } catch (error) { return mapStoreError(error) }
    },
    async claimRefresh(workerId, limit, leaseSeconds) { try { return (await repository.claimRefresh(workerId, limit, leaseSeconds)).claims } catch (error) { return mapStoreError(error) } },
    async completeRefresh(request) { try { return await repository.completeRefresh(request) } catch (error) { return mapStoreError(error) } },
    async retryRefresh(request) { try { return await repository.retryRefresh(request) } catch (error) { return mapStoreError(error) } },
  }
}
