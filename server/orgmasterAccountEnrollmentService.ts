import { createHash } from 'node:crypto'
import type { GovernanceActorContext, GovernanceDocumentV3 } from '../src/governance/types'
import { evaluatePermission } from '../src/governance/evaluatePermission'
import { applyDraftCommand, readExistingGovernanceStore, loadOrganizationSource, GovernanceStoreError } from './orgmasterGovernanceStore'
import { developmentPermissionForActor } from './orgmasterGovernanceIdentity'
import { AccountProvisioningError, assertEmail, normalizeEmail, type AccountProvisioningPort, type ProviderAccount } from './orgmasterAccountProvisioningPort'
import {
  appendAccountEnrollmentAudit, createAccountEnrollmentStore, createCandidateToken, hashCandidateToken, isOpenEnrollment,
  requestHash, AccountEnrollmentStoreError, type AccountEnrollmentStoreV1,
} from './orgmasterAccountEnrollmentStore'
import { createUuidV7 } from '../src/employeeIdentity'
import { resolveIdentityLinkUpsert, assertIdentityLinkStatusMutationAllowed, IdentityLinkPolicyError } from './orgmasterIdentityLinkPolicy'
import type {
  AccountEnrollmentDocumentV1, AccountEnrollmentReasonCode, AccountEnrollmentStatus, EmployeeAccountAccessViewV1,
  ExistingCandidateRequestV1, ExistingAccountCandidateViewV1, InviteAccountRequestV1, InviteAccountResultV1,
  LinkExistingAccountRequestV1, ManageInvitationRequestV1, SetIdentityLinkStatusRequestV1, EmployeeAccountEnrollmentV1,
} from '../src/accountEnrollment/types'

export class AccountEnrollmentServiceError extends Error {
  constructor(readonly code: string, readonly details?: { field?: 'email'; conflictingEmployee?: { id: string; name: string }; retryable?: boolean }) { super(code); this.name = 'AccountEnrollmentServiceError' }
}

export interface AccountEnrollmentRecoveryReportV1 { inspected: number; advanced: number; remaining: number }
export interface AccountEnrollmentServiceV1 {
  readEmployeeAccess(actor: GovernanceActorContext, employeeId: string): Promise<EmployeeAccountAccessViewV1>
  invite(actor: GovernanceActorContext, request: InviteAccountRequestV1): Promise<InviteAccountResultV1>
  findExisting(actor: GovernanceActorContext, request: ExistingCandidateRequestV1, actorBinding: string): Promise<ExistingAccountCandidateViewV1>
  linkExisting(actor: GovernanceActorContext, request: LinkExistingAccountRequestV1, actorBinding: string): Promise<EmployeeAccountAccessViewV1>
  resend(actor: GovernanceActorContext, request: ManageInvitationRequestV1): Promise<EmployeeAccountAccessViewV1>
  cancel(actor: GovernanceActorContext, request: ManageInvitationRequestV1): Promise<EmployeeAccountAccessViewV1>
  setIdentityLinkStatus(actor: GovernanceActorContext, request: SetIdentityLinkStatusRequestV1): Promise<EmployeeAccountAccessViewV1>
  reconcileEnrollment(enrollmentId: string): Promise<void>
  recoverIncompleteEnrollments(): Promise<AccountEnrollmentRecoveryReportV1>
}

const IDENTITY_VIEW = 'orgmaster.identity.view'
const IDENTITY_INVITE = 'orgmaster.identity.invite'
const IDENTITY_LINK = 'orgmaster.identity.link'
const IDENTITY_MANAGE = 'orgmaster.identity.invitation.manage'
const GOVERNANCE_MANAGE = 'orgmaster.governance.manage'
const SYSTEM_ACTOR: GovernanceActorContext = { principalId: 'system:account-enrollment-reconciler', issuer: 'system', subject: 'account-enrollment-reconciler', employeeId: null, bootstrap: true }

function utf8EmployeeId(value: string) { return typeof value === 'string' && value.trim().length > 0 && Buffer.byteLength(value, 'utf8') <= 255 }
function permission(document: GovernanceDocumentV3, actor: GovernanceActorContext, code: string) {
  const dev = developmentPermissionForActor(actor, code)
  if (dev !== null) return dev
  return evaluatePermission(document, { applicationId: 'orgmaster', issuer: actor.issuer, subject: actor.subject, permissionCode: code, scope: { kind: 'global' } }).status === 'allowed'
}
function emailHint(email: string) { const [local, domain] = email.split('@'); const masked = local.length <= 1 ? '*' : `${local[0]}${'*'.repeat(Math.min(6, Math.max(1, local.length - 1)))}${local.length > 2 ? local.slice(-1) : ''}`; return `${masked}@${domain}` }
function emailHash(email: string) { return createHash('sha256').update(email).digest('hex') }
function actorHash(binding: string) { return createHash('sha256').update(binding).digest('hex') }
function providerLabel(issuer: string) { return issuer === 'urn:orgmaster:local-account-provider' ? '地端帳號' : '其他公司帳號' }
function mapProviderError(error: unknown): AccountEnrollmentServiceError {
  if (error instanceof AccountProvisioningError) {
    if (error.code === 'PROVIDER_UNAVAILABLE') return new AccountEnrollmentServiceError('IDENTITY_PROVISIONING_UNAVAILABLE', { retryable: true })
    if (error.code === 'PROVIDER_RESPONSE_LOST') return new AccountEnrollmentServiceError('PROVIDER_OUTCOME_UNKNOWN')
    if (error.code === 'ACCOUNT_ALREADY_EXISTS') return new AccountEnrollmentServiceError('ACCOUNT_ALREADY_EXISTS')
    if (error.code === 'ACCOUNT_NOT_ELIGIBLE') return new AccountEnrollmentServiceError('ACCOUNT_NOT_ELIGIBLE')
    return new AccountEnrollmentServiceError(error.code, { field: 'email' })
  }
  return new AccountEnrollmentServiceError('IDENTITY_PROVISIONING_UNAVAILABLE', { retryable: true })
}
function mapStoreError(error: unknown): AccountEnrollmentServiceError {
  if (error instanceof AccountEnrollmentServiceError) return error
  if (error instanceof AccountEnrollmentStoreError) return new AccountEnrollmentServiceError(error.code)
  if (error instanceof GovernanceStoreError) {
    const code = error.code === 'REVISION_CONFLICT' ? 'REVISION_CONFLICT' : error.code === 'EMPLOYEE_NOT_FOUND' ? 'EMPLOYEE_NOT_FOUND' : error.code === 'EMPLOYEE_NOT_ACTIVE' ? 'EMPLOYEE_NOT_ACTIVE' : 'GOVERNANCE_READ_FAILED'
    return new AccountEnrollmentServiceError(code, code === 'REVISION_CONFLICT' ? { retryable: true } : undefined)
  }
  if (error instanceof IdentityLinkPolicyError) return new AccountEnrollmentServiceError(error.code)
  return new AccountEnrollmentServiceError('ACCOUNT_ENROLLMENT_STORE_INVALID')
}

export function createAccountEnrollmentService(input: { root: string; provider: AccountProvisioningPort | null; devEnabled: boolean; now?: () => Date; token?: () => string }): AccountEnrollmentServiceV1 {
  const now = input.now ?? (() => new Date())
  const store: AccountEnrollmentStoreV1 = createAccountEnrollmentStore({ root: input.root, devEnabled: input.devEnabled, now })
  const provider = input.provider
  const readGovernance = async () => { try { return await readExistingGovernanceStore(input.root) } catch { throw new AccountEnrollmentServiceError('GOVERNANCE_READ_FAILED', { retryable: true }) } }
  const sourceEmployee = async (employeeId: string, requireActive = false) => {
    if (!utf8EmployeeId(employeeId)) throw new AccountEnrollmentServiceError('EMPLOYEE_NOT_FOUND')
    let source: Awaited<ReturnType<typeof loadOrganizationSource>>
    try { source = await loadOrganizationSource(input.root) } catch { throw new AccountEnrollmentServiceError('GOVERNANCE_READ_FAILED', { retryable: true }) }
    const employee = source.state.employees.find((candidate) => candidate.id === employeeId)
    if (!employee) throw new AccountEnrollmentServiceError('EMPLOYEE_NOT_FOUND')
    if (requireActive && employee.status !== 'active') throw new AccountEnrollmentServiceError('EMPLOYEE_NOT_ACTIVE')
    return employee
  }
  const requirePermission = (document: GovernanceDocumentV3, actor: GovernanceActorContext, code: string, errorCode: string) => { if (!permission(document, actor, code)) throw new AccountEnrollmentServiceError(errorCode) }
  const readState = async () => { try { return await store.readExisting() } catch (error) { throw mapStoreError(error) } }
  const viewFor = async (actor: GovernanceActorContext, employeeId: string, governance: Awaited<ReturnType<typeof readGovernance>>, stored?: Awaited<ReturnType<typeof readState>>): Promise<EmployeeAccountAccessViewV1> => {
    const employee = await sourceEmployee(employeeId)
    requirePermission(governance.document, actor, IDENTITY_VIEW, 'IDENTITY_VIEW_REQUIRED')
    const ledger = stored ?? await readState()
    const links = governance.document.draft.identityLinks.filter((link) => link.employeeId === employeeId)
    const admissions = governance.document.draft.principalAdmissions ?? []
    const byLinkEnrollment = new Map<string, EmployeeAccountEnrollmentV1>()
    for (const enrollment of ledger.document.enrollments) if (enrollment.identityLinkId && (!byLinkEnrollment.has(enrollment.identityLinkId) || Date.parse(enrollment.updatedAt) > Date.parse(byLinkEnrollment.get(enrollment.identityLinkId)!.updatedAt))) byLinkEnrollment.set(enrollment.identityLinkId, enrollment)
    const accounts = links.map((link) => {
      const admission = admissions.find((candidate) => candidate.identityLinkId === link.id)
      const linkedEnrollment = byLinkEnrollment.get(link.id)
      const hint = linkedEnrollment?.targetEmailHint ?? (link.subject.length > 4 ? `••••${link.subject.slice(-4)}` : '••••')
      return { identityLinkId: link.id, accountHint: hint, providerLabel: providerLabel(link.issuer), accountType: (admission?.accountType ?? 'unclassified') as 'human_personal' | 'human_privileged' | 'unclassified', status: link.status as 'active' | 'inactive', linkStatusMutable: permission(governance.document, actor, GOVERNANCE_MANAGE) && !admission && !(link.principalId === actor.principalId && link.issuer === actor.issuer && link.subject === actor.subject) }
    })
    const grouped = new Map<string, EmployeeAccountEnrollmentV1[]>()
    for (const enrollment of ledger.document.enrollments.filter((candidate) => candidate.employeeId === employeeId)) { const key = `${enrollment.providerKey}\0${enrollment.targetEmailHash}`; grouped.set(key, [...(grouped.get(key) ?? []), enrollment]) }
    const visible: EmployeeAccountEnrollmentV1[] = []
    for (const values of grouped.values()) { const open = values.filter((value) => isOpenEnrollment(value.status)); visible.push(...(open.length ? open : [values.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0]])) }
    const statusRank: Record<AccountEnrollmentStatus, number> = { outcome_unknown: 0, failed: 1, conflict: 2, accepted_pending_link: 3, dispatching: 4, requested: 5, pending_acceptance: 6, expired: 7, linked: 8, cancelled: 9 }
    visible.sort((a, b) => (statusRank[a.status] - statusRank[b.status]) || a.targetEmailHint.localeCompare(b.targetEmailHint) || a.id.localeCompare(b.id))
    const canInvite = permission(governance.document, actor, IDENTITY_INVITE)
    const canLink = permission(governance.document, actor, IDENTITY_LINK)
    const canManageInvitation = permission(governance.document, actor, IDENTITY_MANAGE)
    const canManageLinkStatus = permission(governance.document, actor, GOVERNANCE_MANAGE)
    const enrollments = visible.map((item) => ({ id: item.id, kind: item.kind, status: item.status, emailHint: item.targetEmailHint, statusReasonCode: item.statusReasonCode, expiresAt: item.expiresAt, revision: item.revision, actions: (canManageInvitation ? (item.status === 'pending_acceptance' ? ['resend', 'cancel'] : item.status === 'expired' ? ['resend', 'cancel'] : item.status === 'outcome_unknown' ? ['cancel'] : []) : []) as Array<'resend' | 'cancel'> }))
    const hasAttention = enrollments.some((item) => ['outcome_unknown', 'expired', 'failed', 'conflict'].includes(item.status))
    const hasOpen = enrollments.some((item) => isOpenEnrollment(item.status))
    const state: EmployeeAccountAccessViewV1['state'] = !governance.document ? 'contract_mismatch' : hasAttention ? 'attention' : hasOpen ? 'in_progress' : accounts.some((item) => item.status === 'active') ? 'ready' : accounts.length > 0 ? 'inactive_only' : 'empty'
    return { contractVersion: 'orgmaster.employee-account-access.v1', employee: { id: employee.id, status: employee.status === 'inactive' ? 'inactive' : 'active' }, state, deliveryMode: provider ? 'simulated' : 'unavailable', accounts, enrollments, capabilities: { view: true, invite: canInvite, link: canLink, manageInvitation: canManageInvitation, manageLinkStatus: canManageLinkStatus }, governanceRevision: governance.revision }
  }
  const currentView = async (actor: GovernanceActorContext, employeeId: string) => { const governance = await readGovernance(); return viewFor(actor, employeeId, governance) }
  const commitLedger = async (expected: string | null, mutate: (document: AccountEnrollmentDocumentV1) => AccountEnrollmentDocumentV1) => { try { return await store.commit(expected, mutate) } catch (error) { throw mapStoreError(error) } }
  const findReceipt = (document: AccountEnrollmentDocumentV1, commandId: string, hash: string, action: string) => { const receipt = document.commands.find((item) => item.commandId === commandId); if (receipt && (receipt.requestHash !== hash || receipt.action !== action)) throw new AccountEnrollmentServiceError('COMMAND_ID_REUSED'); return receipt }
  const withEnrollment = (document: AccountEnrollmentDocumentV1, id: string) => { const item = document.enrollments.find((candidate) => candidate.id === id); if (!item) throw new AccountEnrollmentServiceError('ACCOUNT_ENROLLMENT_NOT_FOUND'); return item }
  const transition = async (id: string, expectedStoreRevision: string | null, actor: GovernanceActorContext, status: AccountEnrollmentStatus, reason: AccountEnrollmentReasonCode, commandId: string, operation?: Partial<EmployeeAccountEnrollmentV1>) => commitLedger(expectedStoreRevision, (document) => { const before = withEnrollment(document, id); const after = { ...before, ...operation, status, statusReasonCode: reason, updatedAt: now().toISOString(), revision: before.revision + 1 }; const next = { ...document, enrollments: document.enrollments.map((item) => item.id === id ? after : item), updatedAt: now().toISOString() }; return appendAccountEnrollmentAudit(next, { commandId, actorPrincipalId: actor.principalId, action: status === 'dispatching' ? 'PROVIDER_DISPATCH_STARTED' : status === 'linked' ? 'IDENTITY_LINK_APPLIED' : 'PROVIDER_OUTCOME_OBSERVED', enrollmentId: id, reasonCode: reason, before, after }) })

  async function invite(actor: GovernanceActorContext, request: InviteAccountRequestV1): Promise<InviteAccountResultV1> {
    const governance = await readGovernance(); const employee = await sourceEmployee(request.employeeId, true); requirePermission(governance.document, actor, IDENTITY_INVITE, 'IDENTITY_INVITE_REQUIRED'); if (!provider) throw new AccountEnrollmentServiceError('IDENTITY_PROVISIONING_UNAVAILABLE')
    let email: string; try { email = assertEmail(request.email) } catch (error) { throw mapProviderError(error) }
    const initial = await readState(); const hash = requestHash({ action: 'invite_new', employeeId: request.employeeId, email }); const replay = findReceipt(initial.document, request.commandId, hash, 'invite_new'); if (replay) return { disposition: 'replayed', view: await viewFor(actor, request.employeeId, governance, initial) }
    if (initial.document.enrollments.some((item) => item.employeeId === request.employeeId && item.targetEmailHash === emailHash(email) && isOpenEnrollment(item.status))) throw new AccountEnrollmentServiceError('INVITATION_ALREADY_PENDING')
    try { if (await provider.findExistingByExactEmail(email)) throw new AccountEnrollmentServiceError('ACCOUNT_ALREADY_EXISTS') } catch (error) { if (error instanceof AccountEnrollmentServiceError) throw error; throw mapProviderError(error) }
    const id = createUuidV7(); const providerRequestKey = `account-enrollment:${id}`; const createdAt = now().toISOString(); const enrollment: EmployeeAccountEnrollmentV1 = { id, employeeId: employee.id, kind: 'invite_new', providerKey: provider.providerKey, providerRequestKey, targetEmail: email, targetEmailHash: emailHash(email), targetEmailHint: emailHint(email), providerOperationRef: null, status: 'requested', statusReasonCode: 'invite_requested', candidateLeaseId: null, identityLinkId: null, createdByPrincipalId: actor.principalId, createdAt, updatedAt: createdAt, expiresAt: null, revision: 1 }
    const next = await commitLedger(initial.revision, (document) => { const receipt = { commandId: request.commandId, requestHash: hash, action: 'invite_new' as const, employeeId: employee.id, enrollmentId: id, providerRequestKey, createdAt }; const withAudit = appendAccountEnrollmentAudit({ ...document, enrollments: [...document.enrollments, enrollment], commands: [...document.commands, receipt], updatedAt: createdAt }, { commandId: request.commandId, actorPrincipalId: actor.principalId, action: 'ENROLLMENT_REQUESTED', enrollmentId: id, reasonCode: 'invite_requested', before: null, after: enrollment }); return withAudit })
    let dispatched = await transition(id, next.revision, actor, 'dispatching', 'provider_dispatch_started', request.commandId)
    try {
      const result = await provider.requestInvitation({ requestKey: providerRequestKey, enrollmentId: id, email })
      dispatched = await transition(id, dispatched.revision, actor, result.state === 'accepted' ? 'accepted_pending_link' : 'pending_acceptance', result.state === 'accepted' ? 'provider_accepted' : 'provider_pending_acceptance', request.commandId, { providerOperationRef: result.operationRef, expiresAt: result.expiresAt })
      if (result.state === 'accepted') await completeIdentityLink(id)
    } catch (error) {
      if (error instanceof AccountProvisioningError && error.code === 'ACCOUNT_ALREADY_EXISTS') { await transition(id, dispatched.revision, actor, 'conflict', 'account_already_exists', request.commandId); throw new AccountEnrollmentServiceError('ACCOUNT_ALREADY_EXISTS') }
      if (error instanceof AccountProvisioningError && error.code === 'PROVIDER_RESPONSE_LOST') { await transition(id, dispatched.revision, actor, 'outcome_unknown', 'provider_outcome_unknown', request.commandId); throw new AccountEnrollmentServiceError('PROVIDER_OUTCOME_UNKNOWN') }
      const mapped = mapProviderError(error); await transition(id, dispatched.revision, actor, 'failed', mapped.code === 'IDENTITY_PROVISIONING_UNAVAILABLE' ? 'provider_unavailable' : 'provider_rejected', request.commandId); throw mapped
    }
    const view = await currentView(actor, request.employeeId); return { disposition: 'created', view }
  }

  async function findExisting(actor: GovernanceActorContext, request: ExistingCandidateRequestV1, binding: string): Promise<ExistingAccountCandidateViewV1> {
    const governance = await readGovernance(); const employee = await sourceEmployee(request.employeeId, true); requirePermission(governance.document, actor, IDENTITY_LINK, 'IDENTITY_LINK_REQUIRED'); if (!provider) throw new AccountEnrollmentServiceError('IDENTITY_PROVISIONING_UNAVAILABLE')
    let email: string; try { email = assertEmail(request.email) } catch (error) { throw mapProviderError(error) }
    let candidate: ProviderAccount | null; try { candidate = await provider.findExistingByExactEmail(email) } catch (error) { throw mapProviderError(error) }
    if (!candidate) throw new AccountEnrollmentServiceError('ACCOUNT_CANDIDATE_NOT_FOUND')
    if (!candidate.active || !candidate.verified || !['human_personal', 'human_privileged'].includes(candidate.accountType)) throw new AccountEnrollmentServiceError('ACCOUNT_NOT_ELIGIBLE')
    const token = input.token?.() ?? createCandidateToken(); const leaseId = createUuidV7(); const createdAt = now(); const lease = { id: leaseId, tokenHashSha256: hashCandidateToken(token), actorBinding: actorHash(binding), employeeId: employee.id, providerKey: provider.providerKey, targetEmail: email, targetEmailHash: emailHash(email), targetEmailHint: emailHint(email), issuer: candidate.issuer, subject: candidate.subject, verified: true as const, active: true as const, createdAt: createdAt.toISOString(), expiresAt: new Date(createdAt.getTime() + 5 * 60 * 1000).toISOString(), consumedAt: null }
    const existing = await readState(); await commitLedger(existing.revision, (document) => appendAccountEnrollmentAudit({ ...document, candidateLeases: [...document.candidateLeases, lease], updatedAt: createdAt.toISOString() }, { commandId: `candidate-lease:${lease.id}`, actorPrincipalId: actor.principalId, action: 'CANDIDATE_LEASED', enrollmentId: null, reasonCode: 'candidate_resolved', before: null, after: null }))
    return { contractVersion: 'orgmaster.existing-account-candidate.v1', candidateToken: token, candidate: { emailHint: lease.targetEmailHint, providerLabel: providerLabel(candidate.issuer), status: 'eligible' }, expiresAt: lease.expiresAt }
  }

  async function linkExisting(actor: GovernanceActorContext, request: LinkExistingAccountRequestV1, binding: string) {
    const governance = await readGovernance(); const employee = await sourceEmployee(request.employeeId, true); requirePermission(governance.document, actor, IDENTITY_LINK, 'IDENTITY_LINK_REQUIRED'); const state = await readState(); const hash = requestHash({ action: 'link_existing', employeeId: request.employeeId, candidateToken: request.candidateToken }); const replay = findReceipt(state.document, request.commandId, hash, 'link_existing'); if (replay) return currentView(actor, request.employeeId)
    const lease = state.document.candidateLeases.find((candidate) => candidate.employeeId === employee.id && candidate.tokenHashSha256 === hashCandidateToken(request.candidateToken)); if (!lease) throw new AccountEnrollmentServiceError('CANDIDATE_TOKEN_INVALID'); if (lease.actorBinding !== actorHash(binding)) throw new AccountEnrollmentServiceError('CANDIDATE_TOKEN_INVALID'); if (lease.consumedAt) throw new AccountEnrollmentServiceError('CANDIDATE_TOKEN_INVALID'); if (Date.parse(lease.expiresAt) <= now().getTime()) throw new AccountEnrollmentServiceError('CANDIDATE_TOKEN_EXPIRED')
    const id = createUuidV7(); const createdAt = now().toISOString(); const enrollment: EmployeeAccountEnrollmentV1 = { id, employeeId: employee.id, kind: 'link_existing', providerKey: lease.providerKey, providerRequestKey: null, targetEmail: lease.targetEmail, targetEmailHash: lease.targetEmailHash, targetEmailHint: lease.targetEmailHint, providerOperationRef: null, status: 'accepted_pending_link', statusReasonCode: 'candidate_resolved', candidateLeaseId: lease.id, identityLinkId: null, createdByPrincipalId: actor.principalId, createdAt, updatedAt: createdAt, expiresAt: null, revision: 1 }
    const next = await commitLedger(state.revision, (document) => appendAccountEnrollmentAudit({ ...document, enrollments: [...document.enrollments, enrollment], commands: [...document.commands, { commandId: request.commandId, requestHash: hash, action: 'link_existing' as const, employeeId: employee.id, enrollmentId: id, providerRequestKey: null, createdAt }], updatedAt: createdAt }, { commandId: request.commandId, actorPrincipalId: actor.principalId, action: 'IDENTITY_LINK_REQUESTED', enrollmentId: id, reasonCode: 'candidate_resolved', before: null, after: enrollment }))
    await applyEnrollmentIdentityLink(id, request.expectedGovernanceRevision, actor); return currentView(actor, employee.id)
  }

  async function completeIdentityLink(id: string) { const item = withEnrollment((await readState()).document, id); const governance = await readGovernance(); await applyEnrollmentIdentityLink(id, governance.revision, SYSTEM_ACTOR, true); void item }
  async function applyEnrollmentIdentityLink(id: string, expectedGovernanceRevision: string, actor: GovernanceActorContext, reconcile = false) {
    const state = await readState(); const enrollment = withEnrollment(state.document, id); const lease = enrollment.candidateLeaseId ? state.document.candidateLeases.find((candidate) => candidate.id === enrollment.candidateLeaseId) : undefined; const governance = await readGovernance(); const source = await sourceEmployee(enrollment.employeeId, true); const issuer = lease?.issuer ?? 'urn:orgmaster:local-account-provider'; const subject = lease?.subject ?? `local-subject-${createHash('sha256').update(enrollment.targetEmail).digest('hex').slice(0, 32)}`; const principalId = createHash('sha256').update(`${issuer}\0${subject}`).digest('hex'); const identity = resolveIdentityLinkUpsert(governance.document, { employeeId: source.id, principalId, issuer, subject, newIdentityLinkId: `identity-account-enrollment:${id}` })
    const command = { type: 'UPSERT_IDENTITY_LINK' as const, commandId: `account-enrollment-link:${id}`, reason: '帳號開通流程連結登入身分', value: identity }
    try {
      const result = await applyDraftCommand(input.root, expectedGovernanceRevision || governance.revision, command, actor, (_current, currentSource) => { const employee = currentSource.state.employees.find((candidate) => candidate.id === enrollment.employeeId); if (!employee) throw new GovernanceStoreError('EMPLOYEE_NOT_FOUND'); if (employee.status !== 'active') throw new GovernanceStoreError('EMPLOYEE_NOT_ACTIVE'); resolveIdentityLinkUpsert(_current.document, { employeeId: employee.id, principalId: identity.principalId, issuer: identity.issuer, subject: identity.subject, newIdentityLinkId: identity.id }) })
      const linked = result.document.draft.identityLinks.find((candidate) => candidate.employeeId === enrollment.employeeId && candidate.issuer === identity.issuer && candidate.subject === identity.subject)
      const latest = await readState(); await commitLedger(latest.revision, (document) => { const before = withEnrollment(document, id); const after = { ...before, status: 'linked' as const, statusReasonCode: 'identity_link_applied' as const, identityLinkId: linked?.id ?? identity.id, updatedAt: now().toISOString(), revision: before.revision + 1 }; let next = { ...document, enrollments: document.enrollments.map((value) => value.id === id ? after : value), candidateLeases: document.candidateLeases.map((lease) => lease.id === before.candidateLeaseId ? { ...lease, consumedAt: lease.consumedAt ?? now().toISOString() } : lease), updatedAt: now().toISOString() }; next = appendAccountEnrollmentAudit(next, { commandId: command.commandId, actorPrincipalId: actor.principalId, action: 'IDENTITY_LINK_APPLIED', enrollmentId: id, reasonCode: 'identity_link_applied', before, after }); return next })
    } catch (error) { const mapped = mapStoreError(error); if (mapped.code === 'REVISION_CONFLICT') throw new AccountEnrollmentServiceError('REVISION_CONFLICT', { retryable: true }); if (mapped.code === 'IDENTITY_LINK_CONFLICT') { await transition(id, (await readState()).revision, actor, 'conflict', 'identity_link_conflict', command.commandId); } throw mapped }
  }

  async function resend(actor: GovernanceActorContext, request: ManageInvitationRequestV1) { const governance = await readGovernance(); requirePermission(governance.document, actor, IDENTITY_MANAGE, 'IDENTITY_INVITATION_MANAGE_REQUIRED'); if (!provider) throw new AccountEnrollmentServiceError('IDENTITY_PROVISIONING_UNAVAILABLE'); const state = await readState(); const item = withEnrollment(state.document, request.enrollmentId); if (item.revision !== request.expectedEnrollmentRevision || !['pending_acceptance', 'expired'].includes(item.status)) throw new AccountEnrollmentServiceError('INVITATION_STATE_INVALID'); const hash = requestHash({ action: 'resend_invitation', enrollmentId: item.id, expectedEnrollmentRevision: request.expectedEnrollmentRevision }); const replay = findReceipt(state.document, request.commandId, hash, 'resend_invitation'); if (replay) return currentView(actor, item.employeeId); const key = `account-enrollment-resend:${item.id}:${request.commandId}`; const prepared = await commitLedger(state.revision, (document) => { const before = withEnrollment(document, item.id); const after = { ...before, providerRequestKey: key, status: 'dispatching' as const, statusReasonCode: 'provider_dispatch_started' as const, updatedAt: now().toISOString(), revision: before.revision + 1 }; return appendAccountEnrollmentAudit({ ...document, enrollments: document.enrollments.map((value) => value.id === item.id ? after : value), commands: [...document.commands, { commandId: request.commandId, requestHash: hash, action: 'resend_invitation' as const, employeeId: item.employeeId, enrollmentId: item.id, providerRequestKey: key, createdAt: now().toISOString() }], updatedAt: now().toISOString() }, { commandId: request.commandId, actorPrincipalId: actor.principalId, action: 'INVITATION_RESENT', enrollmentId: item.id, reasonCode: 'provider_dispatch_started', before, after }) }); try { const result = await provider.resendInvitation({ requestKey: key, enrollmentId: item.id, operationRef: item.providerOperationRef ?? '' }); await transition(item.id, prepared.revision, actor, result.state === 'accepted' ? 'accepted_pending_link' : 'pending_acceptance', result.state === 'accepted' ? 'provider_accepted' : 'provider_pending_acceptance', request.commandId, { providerOperationRef: result.operationRef, expiresAt: result.expiresAt }); } catch (error) { if (error instanceof AccountProvisioningError && error.code === 'PROVIDER_RESPONSE_LOST') await transition(item.id, prepared.revision, actor, 'outcome_unknown', 'provider_outcome_unknown', request.commandId); else throw mapProviderError(error) } return currentView(actor, item.employeeId) }
  async function cancel(actor: GovernanceActorContext, request: ManageInvitationRequestV1) { const governance = await readGovernance(); requirePermission(governance.document, actor, IDENTITY_MANAGE, 'IDENTITY_INVITATION_MANAGE_REQUIRED'); const state = await readState(); const item = withEnrollment(state.document, request.enrollmentId); if (item.revision !== request.expectedEnrollmentRevision || !['pending_acceptance', 'expired', 'outcome_unknown'].includes(item.status)) throw new AccountEnrollmentServiceError('INVITATION_STATE_INVALID'); const hash = requestHash({ action: 'cancel_invitation', enrollmentId: item.id, expectedEnrollmentRevision: request.expectedEnrollmentRevision }); const replay = findReceipt(state.document, request.commandId, hash, 'cancel_invitation'); if (replay) return currentView(actor, item.employeeId); await commitLedger(state.revision, (document) => { const before = withEnrollment(document, item.id); const after = { ...before, status: 'cancelled' as const, statusReasonCode: 'operator_cancelled' as const, updatedAt: now().toISOString(), revision: before.revision + 1 }; return appendAccountEnrollmentAudit({ ...document, enrollments: document.enrollments.map((value) => value.id === item.id ? after : value), commands: [...document.commands, { commandId: request.commandId, requestHash: hash, action: 'cancel_invitation' as const, employeeId: item.employeeId, enrollmentId: item.id, providerRequestKey: null, createdAt: now().toISOString() }], updatedAt: now().toISOString() }, { commandId: request.commandId, actorPrincipalId: actor.principalId, action: 'INVITATION_CANCELLED', enrollmentId: item.id, reasonCode: 'operator_cancelled', before, after }) }); return currentView(actor, item.employeeId) }
  async function setIdentityLinkStatus(actor: GovernanceActorContext, request: SetIdentityLinkStatusRequestV1) { const governance = await readGovernance(); requirePermission(governance.document, actor, GOVERNANCE_MANAGE, 'GOVERNANCE_ADMIN_REQUIRED'); assertIdentityLinkStatusMutationAllowed(governance.document, { identityLinkId: request.identityLinkId, employeeId: request.employeeId, status: request.status, actor }); await applyDraftCommand(input.root, request.expectedGovernanceRevision, { type: 'SET_IDENTITY_LINK_STATUS', commandId: request.commandId, reason: '管理登入身分狀態', id: request.identityLinkId, status: request.status }, actor); return currentView(actor, request.employeeId) }
  async function reconcileEnrollment(enrollmentId: string) { if (!input.devEnabled || !provider) return; let state = await readState(); const item = withEnrollment(state.document, enrollmentId); if (item.status === 'cancelled' || ['linked', 'failed', 'conflict'].includes(item.status)) return; if (item.status === 'accepted_pending_link') { await applyEnrollmentIdentityLink(item.id, (await readGovernance()).revision, SYSTEM_ACTOR, true); return } if (!item.providerRequestKey) return; const observation = await provider.readInvitation({ requestKey: item.providerRequestKey, enrollmentId: item.id, operationRef: item.providerOperationRef }); if (observation.state === 'not_found') return; if (observation.state === 'accepted') { state = await transition(item.id, state.revision, SYSTEM_ACTOR, 'accepted_pending_link', 'provider_accepted', `reconcile:${item.id}`, { providerOperationRef: observation.operationRef, expiresAt: observation.expiresAt }); await applyEnrollmentIdentityLink(item.id, (await readGovernance()).revision, SYSTEM_ACTOR, true); return } if (observation.state === 'expired') { await transition(item.id, state.revision, SYSTEM_ACTOR, 'expired', 'invitation_expired', `reconcile:${item.id}`, { expiresAt: observation.expiresAt }); return } if (observation.state === 'failed') await transition(item.id, state.revision, SYSTEM_ACTOR, 'failed', 'provider_rejected', `reconcile:${item.id}`) }
  async function recoverIncompleteEnrollments() { if (!input.devEnabled) return { inspected: 0, advanced: 0, remaining: 0 }; const state = await readState(); const pending = state.document.enrollments.filter((item) => isOpenEnrollment(item.status)); let advanced = 0; for (const item of pending) { try { const before = (await readState()).document.enrollments.find((value) => value.id === item.id)?.status; await reconcileEnrollment(item.id); const after = (await readState()).document.enrollments.find((value) => value.id === item.id)?.status; if (before !== after) advanced++ } catch { /* isolate one broken workflow */ } } const remaining = (await readState()).document.enrollments.filter((item) => isOpenEnrollment(item.status)).length; return { inspected: pending.length, advanced, remaining } }
  return { readEmployeeAccess: currentView, invite, findExisting, linkExisting, resend, cancel, setIdentityLinkStatus, reconcileEnrollment, recoverIncompleteEnrollments }
}
