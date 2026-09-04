import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createUuidV7 } from '../src/employeeIdentity'
import type {
  AccountEnrollmentAuditEventV1, AccountEnrollmentCommandReceiptV1, AccountEnrollmentDocumentV1,
  AccountEnrollmentReasonCode, AccountEnrollmentStatus, AccountEnrollmentStoreReadV1,
  EmployeeAccountEnrollmentV1, ExistingAccountCandidateLeaseV1,
} from '../src/accountEnrollment/types'
import { hashFileContent, fileExists, withOrgMasterRootLock, writeVerifiedAtomicFile } from './orgmasterFileStore'

export type AccountEnrollmentStoreErrorCode = 'ACCOUNT_ENROLLMENT_STORE_INVALID' | 'ACCOUNT_ENROLLMENT_REVISION_CONFLICT' | 'ACCOUNT_ENROLLMENT_WRITE_FAILED'
export class AccountEnrollmentStoreError extends Error { constructor(readonly code: AccountEnrollmentStoreErrorCode, message = code) { super(message); this.name = 'AccountEnrollmentStoreError' } }

export function getAccountEnrollmentPaths(root: string) {
  const data = resolve(root, 'data')
  return { current: resolve(data, 'orgmaster-account-enrollments.v1.json'), previous: resolve(data, 'orgmaster-account-enrollments.v1.previous.json') }
}

export function createEmptyAccountEnrollmentDocument(now = new Date().toISOString()): AccountEnrollmentDocumentV1 {
  return { app: 'OrgMaster', schemaVersion: 1, updatedAt: now, enrollments: [], commands: [], candidateLeases: [], auditEvents: [] }
}

function isIso(value: unknown) { return typeof value === 'string' && Number.isFinite(Date.parse(value)) }
function isUuidV7(value: unknown) { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) }
function canonical(value: unknown) { return JSON.stringify(value) }
function sanitizedEnrollment(value: EmployeeAccountEnrollmentV1) { const { targetEmail: _email, targetEmailHash: _hash, providerOperationRef: _operation, ...rest } = value; return rest }
function eventHash(event: Omit<AccountEnrollmentAuditEventV1, 'eventHash'>) { return createHash('sha256').update(canonical(event)).digest('hex') }
function validateAuditChain(document: AccountEnrollmentDocumentV1) {
  let previous: string | null = null
  for (const event of document.auditEvents) {
    const { eventHash: actual, ...base } = event
    if (!event.id || !event.commandId || !isIso(event.occurredAt) || event.previousEventHash !== previous || eventHash(base) !== actual) throw new AccountEnrollmentStoreError('ACCOUNT_ENROLLMENT_STORE_INVALID')
    previous = actual
  }
}

export function appendAccountEnrollmentAudit(document: AccountEnrollmentDocumentV1, input: { commandId: string; actorPrincipalId: string; action: AccountEnrollmentAuditEventV1['action']; enrollmentId: string | null; reasonCode: AccountEnrollmentReasonCode; before: EmployeeAccountEnrollmentV1 | null; after: EmployeeAccountEnrollmentV1 | null; now?: string }): AccountEnrollmentDocumentV1 {
  const beforeHash = input.before ? createHash('sha256').update(canonical(sanitizedEnrollment(input.before))).digest('hex') : null
  const afterHash = input.after ? createHash('sha256').update(canonical(sanitizedEnrollment(input.after))).digest('hex') : null
  const base: Omit<AccountEnrollmentAuditEventV1, 'eventHash'> = { id: `audit-${createUuidV7()}`, commandId: input.commandId, occurredAt: input.now ?? new Date().toISOString(), actorPrincipalId: input.actorPrincipalId, action: input.action, enrollmentId: input.enrollmentId, reasonCode: input.reasonCode, beforeHash, afterHash, previousEventHash: document.auditEvents.at(-1)?.eventHash ?? null }
  return { ...document, auditEvents: [...document.auditEvents, { ...base, eventHash: eventHash(base) }] }
}

function validateDocument(document: AccountEnrollmentDocumentV1) {
  if (!document || document.app !== 'OrgMaster' || document.schemaVersion !== 1 || !isIso(document.updatedAt) || !Array.isArray(document.enrollments) || !Array.isArray(document.commands) || !Array.isArray(document.candidateLeases) || !Array.isArray(document.auditEvents)) throw new AccountEnrollmentStoreError('ACCOUNT_ENROLLMENT_STORE_INVALID')
  const enrollmentIds = new Set<string>()
  const openByTarget = new Set<string>()
  for (const item of document.enrollments) {
    if (!isUuidV7(item.id) || enrollmentIds.has(item.id) || !item.employeeId || item.employeeId.length > 255 || !['invite_new', 'link_existing'].includes(item.kind) || item.providerKey !== 'local-deterministic' || typeof item.providerRequestKey !== 'string' && item.providerRequestKey !== null || !item.targetEmail || typeof item.targetEmailHash !== 'string' || !/^[a-f0-9]{64}$/.test(item.targetEmailHash) || typeof item.targetEmailHint !== 'string' || typeof item.providerOperationRef !== 'string' && item.providerOperationRef !== null || !['requested', 'dispatching', 'pending_acceptance', 'accepted_pending_link', 'linked', 'outcome_unknown', 'expired', 'failed', 'cancelled', 'conflict'].includes(item.status) || item.statusReasonCode !== null && typeof item.statusReasonCode !== 'string' || item.candidateLeaseId !== null && typeof item.candidateLeaseId !== 'string' || item.identityLinkId !== null && typeof item.identityLinkId !== 'string' || !item.createdByPrincipalId || !isIso(item.createdAt) || !isIso(item.updatedAt) || item.expiresAt !== null && !isIso(item.expiresAt) || !Number.isInteger(item.revision) || item.revision < 1) throw new AccountEnrollmentStoreError('ACCOUNT_ENROLLMENT_STORE_INVALID')
    enrollmentIds.add(item.id)
    if (['requested', 'dispatching', 'pending_acceptance', 'accepted_pending_link', 'outcome_unknown'].includes(item.status)) {
      const key = `${item.employeeId}\0${item.providerKey}\0${item.targetEmailHash}`
      if (openByTarget.has(key)) throw new AccountEnrollmentStoreError('ACCOUNT_ENROLLMENT_STORE_INVALID')
      openByTarget.add(key)
    }
  }
  const commandIds = new Set<string>()
  for (const command of document.commands) {
    if (!command.commandId || commandIds.has(command.commandId) || !/^[a-f0-9]{64}$/.test(command.requestHash) || !['invite_new', 'link_existing', 'resend_invitation', 'cancel_invitation'].includes(command.action) || !command.employeeId || !enrollmentIds.has(command.enrollmentId) || command.providerRequestKey !== null && typeof command.providerRequestKey !== 'string' || !isIso(command.createdAt)) throw new AccountEnrollmentStoreError('ACCOUNT_ENROLLMENT_STORE_INVALID')
    commandIds.add(command.commandId)
  }
  for (const item of document.enrollments) {
    if (item.providerRequestKey && document.commands.filter((command) => command.providerRequestKey === item.providerRequestKey).length !== 1) throw new AccountEnrollmentStoreError('ACCOUNT_ENROLLMENT_STORE_INVALID')
  }
  const leaseIds = new Set<string>()
  for (const lease of document.candidateLeases) {
    if (!isUuidV7(lease.id) || leaseIds.has(lease.id) || !/^[a-f0-9]{64}$/.test(lease.tokenHashSha256) || !lease.actorBinding || !lease.employeeId || lease.providerKey !== 'local-deterministic' || !lease.targetEmail || !/^[a-f0-9]{64}$/.test(lease.targetEmailHash) || !lease.targetEmailHint || !lease.issuer || !lease.subject || lease.verified !== true || lease.active !== true || !isIso(lease.createdAt) || !isIso(lease.expiresAt) || lease.consumedAt !== null && !isIso(lease.consumedAt)) throw new AccountEnrollmentStoreError('ACCOUNT_ENROLLMENT_STORE_INVALID')
    leaseIds.add(lease.id)
  }
  for (const item of document.enrollments) if (item.candidateLeaseId && !leaseIds.has(item.candidateLeaseId)) throw new AccountEnrollmentStoreError('ACCOUNT_ENROLLMENT_STORE_INVALID')
  validateAuditChain(document)
  return document
}

async function readFileState(path: string): Promise<{ raw: string; document: AccountEnrollmentDocumentV1; revision: string }> {
  try {
    const raw = await readFile(path, 'utf8')
    let document: AccountEnrollmentDocumentV1
    try { document = JSON.parse(raw) as AccountEnrollmentDocumentV1 } catch { throw new AccountEnrollmentStoreError('ACCOUNT_ENROLLMENT_STORE_INVALID') }
    validateDocument(document)
    return { raw, document, revision: hashFileContent(raw) }
  } catch (error) {
    if (error instanceof AccountEnrollmentStoreError) throw error
    throw new AccountEnrollmentStoreError('ACCOUNT_ENROLLMENT_STORE_INVALID')
  }
}

export interface AccountEnrollmentStoreV1 {
  readExisting(): Promise<AccountEnrollmentStoreReadV1>
  commit(expectedRevision: string | null, mutate: (current: AccountEnrollmentDocumentV1) => AccountEnrollmentDocumentV1): Promise<AccountEnrollmentStoreReadV1>
}

export function createAccountEnrollmentStore(input: { root: string; devEnabled: boolean; now?: () => Date }): AccountEnrollmentStoreV1 {
  const now = input.now ?? (() => new Date())
  const paths = getAccountEnrollmentPaths(input.root)
  return {
    async readExisting() {
      if (!input.devEnabled || !(await fileExists(paths.current))) return { exists: false, raw: null, revision: null, document: createEmptyAccountEnrollmentDocument(now().toISOString()) }
      const value = await readFileState(paths.current)
      return { exists: true, ...value }
    },
    async commit(expectedRevision, mutate) {
      if (!input.devEnabled) throw new AccountEnrollmentStoreError('ACCOUNT_ENROLLMENT_WRITE_FAILED')
      return withOrgMasterRootLock(input.root, async () => {
        const exists = await fileExists(paths.current)
        if (!exists && expectedRevision !== null) throw new AccountEnrollmentStoreError('ACCOUNT_ENROLLMENT_REVISION_CONFLICT')
        if (exists && expectedRevision === null) throw new AccountEnrollmentStoreError('ACCOUNT_ENROLLMENT_REVISION_CONFLICT')
        const current = exists ? await readFileState(paths.current) : { raw: null, revision: null, document: createEmptyAccountEnrollmentDocument(now().toISOString()) }
        if (expectedRevision !== current.revision) throw new AccountEnrollmentStoreError('ACCOUNT_ENROLLMENT_REVISION_CONFLICT')
        let next: AccountEnrollmentDocumentV1
        try { next = mutate(current.document) } catch (error) { throw error }
        validateDocument(next)
        const raw = `${JSON.stringify({ ...next, updatedAt: now().toISOString() }, null, 2)}\n`
        try {
          await mkdir(resolve(input.root, 'data'), { recursive: true })
          if (current.raw !== null) await writeVerifiedAtomicFile(paths.previous, current.raw)
          await writeVerifiedAtomicFile(paths.current, raw)
          return { exists: true, raw, revision: hashFileContent(raw), document: JSON.parse(raw) as AccountEnrollmentDocumentV1 }
        } catch (error) { throw new AccountEnrollmentStoreError('ACCOUNT_ENROLLMENT_WRITE_FAILED', error instanceof Error ? error.message : 'write failed') }
      })
    },
  }
}

export function requestHash(value: unknown) { return createHash('sha256').update(canonical(value)).digest('hex') }
export function hashCandidateToken(token: string) { return createHash('sha256').update(token).digest('hex') }
export function createCandidateToken() { return randomBytes(32).toString('base64url') }
export function isOpenEnrollment(status: AccountEnrollmentStatus) { return ['requested', 'dispatching', 'pending_acceptance', 'accepted_pending_link', 'outcome_unknown'].includes(status) }
export type { AccountEnrollmentDocumentV1, EmployeeAccountEnrollmentV1, ExistingAccountCandidateLeaseV1, AccountEnrollmentCommandReceiptV1 }
