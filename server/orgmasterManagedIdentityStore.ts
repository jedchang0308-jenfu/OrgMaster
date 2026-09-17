import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import type {
  EmployeeNumberAssignmentV1,
  ManagedDailyIdentityV1,
  ManagedIdentityAuditEventV1,
  ManagedIdentityCandidateLeaseV1,
  ManagedIdentityCommandReceiptV1,
  ManagedIdentityDocumentV1,
  ManagedIdentityInvalidationApplicationV1,
  ManagedIdentityRefreshClaimV1,
  ManagedIdentityRefreshOutboxV1,
  ManagedIdentityRefreshResultV1,
  PrincipalIdentityReservationV1,
} from '../src/managedIdentity/types'
import { assignEmployeeNumber, createEmptyManagedIdentityRegistry, parseEmployeeNumber } from '../src/managedIdentity/employeeNumber'
import { fileExists, hashFileContent, withOrgMasterRootLock, writeVerifiedAtomicFile } from './orgmasterFileStore'
import { canonicalManagedLoginIdentity, incrementRevision, type ManagedLoginIdentity } from './orgmasterManagedLoginContract'

export type ManagedIdentityStoreErrorCode =
  | 'MANAGED_IDENTITY_STORE_INVALID'
  | 'MANAGED_IDENTITY_REVISION_CONFLICT'
  | 'MANAGED_IDENTITY_WRITE_FAILED'
  | 'MANAGED_IDENTITY_OWNER_CONFLICT'
  | 'MANAGED_IDENTITY_JOURNAL_INVALID'
  | 'MANAGED_IDENTITY_IDEMPOTENCY_CONFLICT'
  | 'MANAGED_IDENTITY_CANDIDATE_INVALID'
  | 'MANAGED_IDENTITY_CANDIDATE_EXPIRED'
  | 'MANAGED_IDENTITY_CANDIDATE_CONSUMED'
  | 'MANAGED_IDENTITY_IDENTITY_CONFLICT'
  | 'MANAGED_IDENTITY_ADMISSION_DISABLED'
  | 'MANAGED_IDENTITY_REFRESH_LEASE_CONFLICT'

export class ManagedIdentityStoreError extends Error {
  constructor(public readonly code: ManagedIdentityStoreErrorCode, message: string = code) {
    super(message)
    this.name = 'ManagedIdentityStoreError'
  }
}

export function getManagedIdentityPaths(root: string) {
  const data = resolve(root, 'data')
  return {
    current: resolve(data, 'orgmaster-managed-identities.v1.json'),
    previous: resolve(data, 'orgmaster-managed-identities.v1.previous.json'),
    owner: resolve(data, 'orgmaster-managed-identities.v1.owner.json'),
    journal: resolve(data, 'orgmaster-managed-identity-txn.v1.json'),
  }
}

function nowIso(now = new Date()) { return now.toISOString() }

export function createEmptyManagedIdentityDocument(now = nowIso()): ManagedIdentityDocumentV1 {
  const orgmaster: ManagedIdentityInvalidationApplicationV1 = {
    applicationId: 'orgmaster', status: 'active', supportState: 'pending', supportRevision: 1,
    supportEvidenceRef: null, supportVerifiedAt: null, supportVerifiedBy: null,
    sourceGovernanceVersionId: null, updatedAt: now,
  }
  return {
    app: 'OrgMaster', schemaVersion: 1, updatedAt: now, registry: createEmptyManagedIdentityRegistry(), auditEvents: [],
    managedDailyIdentities: [], observations: [], candidateLeases: [], commandReceipts: [], refreshOutbox: [],
    principalIdentityReservations: [], admissionAuthority: { admissionEnabled: false, revision: 1, updatedAt: now, updatedBy: 'system:init', reasonCode: 'migration_default_off' },
    invalidationApplications: [orgmaster], directoryReadBudget: [], currentWorkspaceAuthority: null,
    nextRefreshRequestSequence: 1, nextAdmissionRevision: 1,
  }
}

function hashContent(raw: string) { return createHash('sha256').update(raw).digest('hex') }
function sha256(value: string) { return hashContent(value) }
function validIso(value: unknown): value is string { return typeof value === 'string' && Number.isFinite(Date.parse(value)) }
function safeArray<T>(value: T[] | undefined) { return Array.isArray(value) ? value : [] }

function normalizeDocument(input: ManagedIdentityDocumentV1): ManagedIdentityDocumentV1 {
  if (!input || input.app !== 'OrgMaster' || input.schemaVersion !== 1 || !validIso(input.updatedAt) || !input.registry || !Array.isArray(input.registry.assignments) || !Array.isArray(input.registry.tombstones) || !Array.isArray(input.auditEvents)) {
    throw new ManagedIdentityStoreError('MANAGED_IDENTITY_STORE_INVALID')
  }
  const base = createEmptyManagedIdentityDocument(input.updatedAt)
  return {
    ...base,
    ...input,
    managedDailyIdentities: safeArray(input.managedDailyIdentities),
    observations: safeArray(input.observations),
    candidateLeases: safeArray(input.candidateLeases),
    commandReceipts: safeArray(input.commandReceipts),
    refreshOutbox: safeArray(input.refreshOutbox),
    principalIdentityReservations: safeArray(input.principalIdentityReservations),
    invalidationApplications: safeArray(input.invalidationApplications).length ? safeArray(input.invalidationApplications) : base.invalidationApplications,
    directoryReadBudget: safeArray(input.directoryReadBudget),
    currentWorkspaceAuthority: input.currentWorkspaceAuthority ?? null,
    admissionAuthority: input.admissionAuthority ?? base.admissionAuthority,
    nextRefreshRequestSequence: input.nextRefreshRequestSequence ?? 1,
    nextAdmissionRevision: input.nextAdmissionRevision ?? 1,
  }
}

function validateDocument(document: ManagedIdentityDocumentV1) {
  const value = normalizeDocument(document)
  const employeeIds = new Set<string>()
  const numbers = new Set<string>()
  for (const assignment of value.registry.assignments) {
    if (!assignment.employeeId || employeeIds.has(assignment.employeeId) || !parseEmployeeNumber(assignment.employeeNumber).ok || numbers.has(assignment.employeeNumber) || !validIso(assignment.assignedAt) || !assignment.assignedBy || !Number.isSafeInteger(assignment.revision) || assignment.revision < 1) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_STORE_INVALID')
    employeeIds.add(assignment.employeeId); numbers.add(assignment.employeeNumber)
  }
  for (const tombstone of value.registry.tombstones) {
    if (!parseEmployeeNumber(tombstone.employeeNumber).ok || numbers.has(tombstone.employeeNumber) || !tombstone.firstEmployeeId || !validIso(tombstone.firstAssignedAt) || tombstone.retiredAt !== null && !validIso(tombstone.retiredAt)) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_STORE_INVALID')
    numbers.add(tombstone.employeeNumber)
  }
  const identityEmployees = new Set<string>()
  const identityRecords = new Set<string>()
  const identityPrincipals = new Set<string>()
  const directoryKeys = new Set<string>()
  for (const identity of value.managedDailyIdentities ?? []) {
    if (!identity.identityRecordId || identityRecords.has(identity.identityRecordId) || !identity.employeeId || identityEmployees.has(identity.employeeId) || !identity.principalId || identityPrincipals.has(identity.principalId) || identity.principalId !== `principal-managed:${identity.identityRecordId}` || !identity.directoryCustomerId || !identity.directoryUserId || !identity.lastVerifiedPrimaryEmail || !['directory_linked_pending_auth', 'active', 'conflict'].includes(identity.linkState) || !Number.isSafeInteger(identity.revision) || identity.revision < 1 || identity.admissionRevision !== null && (!Number.isSafeInteger(identity.admissionRevision) || identity.admissionRevision < 1) || identity.admissionRevision === null !== (identity.admissionChangedAt === null) || !validIso(identity.createdAt) || !validIso(identity.updatedAt)) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_STORE_INVALID')
    const key = `${identity.directoryCustomerId}\u0000${identity.directoryUserId}`
    if (directoryKeys.has(key)) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_STORE_INVALID')
    identityEmployees.add(identity.employeeId); identityRecords.add(identity.identityRecordId); identityPrincipals.add(identity.principalId); directoryKeys.add(key)
  }
  for (const reservation of value.principalIdentityReservations ?? []) {
    if (!reservation.principalIssuer || !reservation.principalSubject || !reservation.employeeId || !validIso(reservation.firstSeenAt) || !reservation.sourceRevision) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_STORE_INVALID')
  }
  for (const event of value.auditEvents) {
    if (!event.id || !event.employeeId || !event.actor || !validIso(event.occurredAt)) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_STORE_INVALID')
  }
  return value
}

async function readFileState(path: string) {
  try {
    const raw = await readFile(path, 'utf8')
    let document: ManagedIdentityDocumentV1
    try { document = JSON.parse(raw) as ManagedIdentityDocumentV1 } catch { throw new ManagedIdentityStoreError('MANAGED_IDENTITY_STORE_INVALID') }
    const normalized = validateDocument(document)
    return { raw, document: normalized, revision: hashContent(raw) }
  } catch (error) {
    if (error instanceof ManagedIdentityStoreError) throw error
    throw new ManagedIdentityStoreError('MANAGED_IDENTITY_STORE_INVALID')
  }
}

type JournalV1 = { status: 'prepare' | 'committed'; operationId: string; beforeRevision: string | null; afterRevision: string; afterRaw: string; createdAt: string }

async function recoverJournal(paths: ReturnType<typeof getManagedIdentityPaths>) {
  if (!(await fileExists(paths.journal))) return
  let journal: JournalV1
  try { journal = JSON.parse(await readFile(paths.journal, 'utf8')) as JournalV1 } catch { throw new ManagedIdentityStoreError('MANAGED_IDENTITY_JOURNAL_INVALID') }
  if (journal.status !== 'prepare' || !journal.afterRaw || hashContent(journal.afterRaw) !== journal.afterRevision) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_JOURNAL_INVALID')
  try {
    validateDocument(JSON.parse(journal.afterRaw) as ManagedIdentityDocumentV1)
    await writeVerifiedAtomicFile(paths.current, journal.afterRaw)
    await writeVerifiedAtomicFile(paths.journal, JSON.stringify({ ...journal, status: 'committed' }) + '\n')
    await unlink(paths.journal)
  } catch (error) {
    if (error instanceof ManagedIdentityStoreError) throw error
    throw new ManagedIdentityStoreError('MANAGED_IDENTITY_JOURNAL_INVALID')
  }
}

const processStartTime = new Date()

async function acquireOwner(path: string, root: string) {
  await mkdir(resolve(root, 'data'), { recursive: true })
  const payload = JSON.stringify({ pid: process.pid, root: resolve(root), startedAt: processStartTime.toISOString() })
  try {
    const handle = await open(path, 'wx')
    await handle.writeFile(payload + '\n', 'utf8')
    await handle.close()
    return async () => { await unlink(path).catch(() => undefined) }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    try {
      const current = JSON.parse(await readFile(path, 'utf8')) as { pid?: number; root?: string }
      if (current.pid === process.pid && current.root === resolve(root)) return async () => undefined
      if (typeof current.pid === 'number') process.kill(current.pid, 0)
      throw new ManagedIdentityStoreError('MANAGED_IDENTITY_OWNER_CONFLICT')
    } catch (readError) {
      if (readError instanceof ManagedIdentityStoreError) throw readError
      if ((readError as NodeJS.ErrnoException).code === 'ESRCH') {
        await unlink(path).catch(() => undefined)
        return acquireOwner(path, root)
      }
      throw new ManagedIdentityStoreError('MANAGED_IDENTITY_OWNER_CONFLICT')
    }
  }
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
function actorHash(value: string) { return sha256(value) }
function tokenHash(value: string) { return sha256(value) }

function hexUtf8(value: string | null) { return value === null ? '-' : Buffer.from(value, 'utf8').toString('hex').toLowerCase() }

export type ManagedIdentityConfirmContext = {
  commandId: string
  employeeId: string
  candidateToken: string
  expectedWorkspaceRevision: string | null
  expectedRegistryRevision: string
  actor: string
}

export type ManagedIdentityCandidateSnapshot = {
  employeeId: string
  employeeNumber: string
  workspaceRevision: string | null
  registryRevision: string
  directoryCustomerId: string
  directoryUserId: string
  primaryEmail: string
  sourceEtag: string | null
  expiresAt: string
}

export type ManagedIdentityConfirmationRead =
  | { kind: 'candidate'; snapshot: ManagedIdentityCandidateSnapshot }
  | { kind: 'replayed'; identityRecordId: string }

export type ManagedIdentityAliasResolution = {
  employeeId: string
  employeeNumber: string
  identityRecordId: string
  loginHint: string
  linkState: 'directory_linked_pending_auth' | 'active'
}

export function managedIdentityConfirmFingerprint(input: ManagedIdentityConfirmContext) {
  const values = ['dev049.confirm.v1', input.actor, input.employeeId, tokenHash(input.candidateToken), input.expectedWorkspaceRevision, input.expectedRegistryRevision]
  return sha256(values.map((value) => hexUtf8(value)).join('|'))
}

export type CandidateInput = {
  employeeId: string
  employeeNumber: string
  expectedPrimaryEmail: string
  directoryCustomerId: string
  directoryUserId: string
  primaryEmail: string
  sourceEtag: string | null
  workspaceRevision: string | null
  registryRevision: string
  actor: string
  now?: string
}

export interface ManagedIdentityStoreV1 {
  readExisting(): Promise<{ exists: boolean; raw: string | null; document: ManagedIdentityDocumentV1; revision: string | null }>
  commit(expectedRevision: string | null, mutate: (current: ManagedIdentityDocumentV1) => ManagedIdentityDocumentV1, operationId?: string): Promise<{ exists: true; raw: string; document: ManagedIdentityDocumentV1; revision: string }>
  appendAssignment(employeeId: string, employeeNumber: string, actor: string, expectedRevision: string | null, now?: string, expectedWorkspaceRevision?: string | null): Promise<{ disposition: 'applied' | 'noop'; assignment: EmployeeNumberAssignmentV1; revision: string }>
  createCandidate(input: CandidateInput): Promise<{ token: string; expiresAt: string; workspaceRevision: string | null; registryRevision: string }>
  readCandidateForConfirmation(input: ManagedIdentityConfirmContext): Promise<ManagedIdentityConfirmationRead>
  confirmCandidate(input: ManagedIdentityConfirmContext): Promise<{ identityRecordId: string; employeeId: string }>
  bindAuth(input: { employeeId: string; issuer: string; subject: string; email: string; commandId?: string }): Promise<{ identityRecordId: string; employeeId: string }>
  enqueueRefresh(input: { employeeId: string; trigger: 'manual' | 'periodic' | 'domain'; commandId: string; actor: string; now?: string }): Promise<{ disposition: 'queued' | 'deduplicated'; requestId: string }>
  claimRefresh(workerId: string, limit?: number, leaseSeconds?: number, now?: string): Promise<{ claims: ManagedIdentityRefreshClaimV1[]; document: ManagedIdentityDocumentV1; revision: string }>
  completeRefresh(input: { requestId: string; workerId: string; leaseVersion: number; directoryCustomerId: string; directoryUserId: string; directoryState: 'missing' | 'present' | 'suspended' | 'archived'; primaryEmail: string | null; sourceEtag: string | null; adapterOutcome: 'success' | 'not_found'; now?: string }): Promise<ManagedIdentityRefreshResultV1>
  retryRefresh(input: { requestId: string; workerId: string; leaseVersion: number; errorCode: string; now?: string }): Promise<ManagedIdentityRefreshResultV1>
  resolveAlias(employeeNumber: string): Promise<ManagedIdentityAliasResolution>
  setAdmission(enabled: boolean, expectedRevision: number, actor: string, reasonCode: string, now?: string): Promise<{ enabled: boolean; revision: number; document: ManagedIdentityDocumentV1; fileRevision: string }>
  verifyManagedLoginIdentity(input: { requestId: string; requestHash: string; current: ManagedLoginIdentity; issuer: string; subject: string; actor: string }): Promise<{ identity: ManagedLoginIdentity & { linkState: 'active'; pair: { issuer: string; subject: string } }; mappingVersion: string }>
}

export function createManagedIdentityStore(input: { root: string; devEnabled: boolean; now?: () => Date }): ManagedIdentityStoreV1 {
  const now = input.now ?? (() => new Date())
  const paths = getManagedIdentityPaths(input.root)
  const readExisting = async () => {
    if (!input.devEnabled) return { exists: false, raw: null, document: createEmptyManagedIdentityDocument(nowIso(now())), revision: null }
    await recoverJournal(paths)
    if (!(await fileExists(paths.current))) return { exists: false, raw: null, document: createEmptyManagedIdentityDocument(nowIso(now())), revision: null }
    const state = await readFileState(paths.current)
    return { exists: true, ...state }
  }
  const commit = async (expectedRevision: string | null, mutate: (current: ManagedIdentityDocumentV1) => ManagedIdentityDocumentV1, operationId = `managed-identity:${randomUUID()}`) => {
    if (!input.devEnabled) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_WRITE_FAILED')
    return withOrgMasterRootLock(input.root, async () => {
      const releaseOwner = await acquireOwner(paths.owner, input.root)
      try {
        await recoverJournal(paths)
        const exists = await fileExists(paths.current)
        if (!exists && expectedRevision !== null || exists && expectedRevision === null) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_REVISION_CONFLICT')
        const current = exists ? await readFileState(paths.current) : { raw: null, revision: null, document: createEmptyManagedIdentityDocument(nowIso(now())) }
        if (current.revision !== expectedRevision) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_REVISION_CONFLICT')
        const next = validateDocument(mutate(clone(current.document)))
        const raw = JSON.stringify({ ...next, updatedAt: nowIso(now()) }, null, 2) + '\n'
        const journal: JournalV1 = { status: 'prepare', operationId, beforeRevision: current.revision, afterRevision: hashContent(raw), afterRaw: raw, createdAt: nowIso(now()) }
        try {
          if (current.raw !== null) await writeVerifiedAtomicFile(paths.previous, current.raw)
          await writeVerifiedAtomicFile(paths.journal, JSON.stringify(journal) + '\n')
          await writeVerifiedAtomicFile(paths.current, raw)
          await writeVerifiedAtomicFile(paths.journal, JSON.stringify({ ...journal, status: 'committed' }) + '\n')
          await unlink(paths.journal).catch(() => undefined)
          return { exists: true as const, raw, document: JSON.parse(raw) as ManagedIdentityDocumentV1, revision: hashContent(raw) }
        } catch (error) {
          throw new ManagedIdentityStoreError('MANAGED_IDENTITY_WRITE_FAILED', error instanceof Error ? error.message : 'write failed')
        }
      } finally { await releaseOwner() }
    })
  }

  const appendAssignment = async (employeeId: string, employeeNumber: string, actor: string, expectedRevision: string | null, timestamp = nowIso(now()), _expectedWorkspaceRevision: string | null = null) => {
    let disposition: 'applied' | 'noop' = 'applied'
    let assignment!: EmployeeNumberAssignmentV1
    const before = await readExisting()
    const revisionFor = (document: ManagedIdentityDocumentV1) => String(document.registry.assignments.find((entry) => entry.employeeId === employeeId)?.revision ?? 0)
    if (expectedRevision !== revisionFor(before.document)) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_REVISION_CONFLICT')
    await commit(before.revision, (current) => {
      if (expectedRevision !== revisionFor(current)) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_REVISION_CONFLICT')
      const result = assignEmployeeNumber(current.registry, employeeId, employeeNumber, actor, timestamp)
      disposition = result.status; assignment = result.assignment
      if (result.status === 'noop') return current
      const previous = current.registry.assignments.find((entry) => entry.employeeId === employeeId)
      const event: ManagedIdentityAuditEventV1 = {
        id: 'managed-identity-audit-' + randomUUID(), action: previous ? 'employee_number_changed' : 'employee_number_assigned',
        employeeId, employeeNumber: result.assignment.employeeNumber, previousEmployeeNumber: previous?.employeeNumber ?? null, actor, occurredAt: timestamp,
        result: 'applied', reasonCode: previous ? 'employee_number_correction' : 'employee_number_assignment', beforeHash: previous ? sha256(JSON.stringify(previous)) : null, afterHash: sha256(JSON.stringify(result.assignment)),
      }
      return { ...current, registry: result.registry, auditEvents: [...current.auditEvents, event] }
    }, `assign-employee-number:${employeeId}:${timestamp}`)
    return { disposition, assignment, revision: String(assignment.revision) }
  }

  const createCandidate = async (candidate: CandidateInput) => {
    const token = randomBytes(32).toString('base64url')
    const leaseId = randomUUID()
    const createdAt = candidate.now ?? nowIso(now())
    const lease: ManagedIdentityCandidateLeaseV1 = {
      leaseId, tokenHashSha256: tokenHash(token), actorBindingSha256: actorHash(candidate.actor), employeeId: candidate.employeeId,
      employeeNumber: candidate.employeeNumber, expectedPrimaryEmail: candidate.expectedPrimaryEmail, directoryCustomerId: candidate.directoryCustomerId,
      directoryUserId: candidate.directoryUserId, primaryEmail: candidate.primaryEmail, sourceEtag: candidate.sourceEtag,
      workspaceRevision: candidate.workspaceRevision, registryRevision: candidate.registryRevision, createdAt,
      expiresAt: new Date(Date.parse(createdAt) + 5 * 60_000).toISOString(), invalidatedAt: null, consumedAt: null,
    }
    const current = await readExisting()
    const assignment = current.document.registry.assignments.find((entry) => entry.employeeId === candidate.employeeId)
    if (!assignment || assignment.employeeNumber !== candidate.employeeNumber || String(assignment.revision) !== candidate.registryRevision) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_REVISION_CONFLICT')
    if ((current.document.managedDailyIdentities ?? []).some((entry) => entry.employeeId === candidate.employeeId || entry.directoryCustomerId === candidate.directoryCustomerId && entry.directoryUserId === candidate.directoryUserId)) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_IDENTITY_CONFLICT')
    const committed = await commit(current.revision, (document) => {
      const liveAssignment = document.registry.assignments.find((entry) => entry.employeeId === candidate.employeeId)
      if (!liveAssignment || liveAssignment.employeeNumber !== candidate.employeeNumber || String(liveAssignment.revision) !== candidate.registryRevision) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_REVISION_CONFLICT')
      if ((document.managedDailyIdentities ?? []).some((entry) => entry.employeeId === candidate.employeeId || entry.directoryCustomerId === candidate.directoryCustomerId && entry.directoryUserId === candidate.directoryUserId)) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_IDENTITY_CONFLICT')
      const leases = (document.candidateLeases ?? []).map((entry) => entry.employeeId === candidate.employeeId && entry.actorBindingSha256 === actorHash(candidate.actor) && !entry.consumedAt && !entry.invalidatedAt ? { ...entry, invalidatedAt: createdAt } : entry)
      return { ...document, candidateLeases: [...leases, lease] }
    }, `candidate:${leaseId}`)
    void committed
    return { token, expiresAt: lease.expiresAt, workspaceRevision: lease.workspaceRevision, registryRevision: candidate.registryRevision }
  }

  const confirmationRead = (document: ManagedIdentityDocumentV1, request: ManagedIdentityConfirmContext, timestamp: string): ManagedIdentityConfirmationRead => {
    const fingerprint = managedIdentityConfirmFingerprint(request)
    const receipt = (document.commandReceipts ?? []).find((entry) => entry.commandId === request.commandId)
    if (receipt) {
      const identityRecordId = typeof receipt.responsePayload.identityRecordId === 'string' ? receipt.responsePayload.identityRecordId : ''
      if (receipt.action !== 'confirm_managed_identity_link_v1' || receipt.requestHashSha256 !== fingerprint || receipt.responsePayload.contractVersion !== 'dev049.confirm.v1' || !identityRecordId || receipt.employeeId !== request.employeeId || receipt.identityRecordId !== identityRecordId) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_IDEMPOTENCY_CONFLICT')
      return { kind: 'replayed', identityRecordId }
    }
    const lease = (document.candidateLeases ?? []).find((entry) => entry.employeeId === request.employeeId && entry.tokenHashSha256 === tokenHash(request.candidateToken))
    if (!lease || lease.actorBindingSha256 !== actorHash(request.actor) || lease.consumedAt || lease.invalidatedAt || Date.parse(lease.expiresAt) <= Date.parse(timestamp)) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_CANDIDATE_INVALID')
    if (lease.workspaceRevision !== request.expectedWorkspaceRevision || lease.registryRevision !== request.expectedRegistryRevision) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_REVISION_CONFLICT')
    const assignment = document.registry.assignments.find((entry) => entry.employeeId === request.employeeId)
    if (!assignment || assignment.employeeNumber !== lease.employeeNumber || String(assignment.revision) !== request.expectedRegistryRevision) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_REVISION_CONFLICT')
    const authority = document.currentWorkspaceAuthority
    if (authority && (authority.workspaceRevision !== request.expectedWorkspaceRevision || !authority.employeeIds.includes(request.employeeId))) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_REVISION_CONFLICT')
    if ((document.managedDailyIdentities ?? []).some((entry) => entry.employeeId === request.employeeId)) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_IDENTITY_CONFLICT')
    return { kind: 'candidate', snapshot: { employeeId: request.employeeId, employeeNumber: lease.employeeNumber, workspaceRevision: lease.workspaceRevision, registryRevision: request.expectedRegistryRevision, directoryCustomerId: lease.directoryCustomerId, directoryUserId: lease.directoryUserId, primaryEmail: lease.primaryEmail, sourceEtag: lease.sourceEtag, expiresAt: lease.expiresAt } }
  }

  const readCandidateForConfirmation = async (request: ManagedIdentityConfirmContext) => confirmationRead((await readExisting()).document, request, nowIso(now()))

  const confirmCandidate = async (request: ManagedIdentityConfirmContext) => {
    const current = await readExisting()
    const timestamp = nowIso(now())
    const initial = confirmationRead(current.document, request, timestamp)
    if (initial.kind === 'replayed') return { identityRecordId: initial.identityRecordId, employeeId: request.employeeId }
    let result!: { identityRecordId: string; employeeId: string }
    try {
      const committed = await commit(current.revision, (document) => {
        const read = confirmationRead(document, request, timestamp)
        if (read.kind === 'replayed') { result = { identityRecordId: read.identityRecordId, employeeId: request.employeeId }; return document }
        const lease = (document.candidateLeases ?? []).find((entry) => entry.employeeId === request.employeeId && entry.tokenHashSha256 === tokenHash(request.candidateToken))!
        const directoryKey = `${read.snapshot.directoryCustomerId}\u0000${read.snapshot.directoryUserId}`
        if ((document.managedDailyIdentities ?? []).some((entry) => `${entry.directoryCustomerId}\u0000${entry.directoryUserId}` === directoryKey)) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_IDENTITY_CONFLICT')
        const identity: ManagedDailyIdentityV1 = {
          identityRecordId: randomUUID(), identityKind: 'human_daily_managed', employeeId: request.employeeId, principalId: '',
          directoryCustomerId: read.snapshot.directoryCustomerId, directoryUserId: read.snapshot.directoryUserId, lastVerifiedPrimaryEmail: read.snapshot.primaryEmail,
          authIssuer: null, authSubject: null, boundAt: null, linkState: 'directory_linked_pending_auth', revision: 1, admissionRevision: null, admissionChangedAt: null,
          createdAt: timestamp, createdBy: request.actor, updatedAt: timestamp, updatedBy: request.actor,
        }
        identity.principalId = `principal-managed:${identity.identityRecordId}`
        result = { identityRecordId: identity.identityRecordId, employeeId: request.employeeId }
        const observation = { identityRecordId: identity.identityRecordId, primaryEmail: read.snapshot.primaryEmail, directoryState: 'present' as const, sourceEtag: read.snapshot.sourceEtag, lastAppliedRequestSequence: 0, adapterOutcome: 'success' as const, errorCode: null, trustedObservedAt: timestamp, lastAttemptAt: timestamp, freshness: 'fresh' as const }
        const receipt: ManagedIdentityCommandReceiptV1 = { commandId: request.commandId, requestHashSha256: managedIdentityConfirmFingerprint(request), action: 'confirm_managed_identity_link_v1', employeeId: request.employeeId, identityRecordId: identity.identityRecordId, responsePayload: { contractVersion: 'dev049.confirm.v1', identityRecordId: identity.identityRecordId, employeeId: request.employeeId }, createdAt: timestamp }
        const event: ManagedIdentityAuditEventV1 = { id: 'managed-identity-audit-' + randomUUID(), commandId: request.commandId, action: 'managed_identity_link_confirmed', employeeId: request.employeeId, identityRecordId: identity.identityRecordId, employeeNumber: lease.employeeNumber, previousEmployeeNumber: null, actor: request.actor, occurredAt: timestamp, result: 'applied', reasonCode: 'directory_candidate_confirmed', details: { directoryKeySha256: sha256(directoryKey) } }
        return { ...document, managedDailyIdentities: [...(document.managedDailyIdentities ?? []), identity], observations: [...(document.observations ?? []), observation], candidateLeases: (document.candidateLeases ?? []).map((entry) => entry.leaseId === lease.leaseId ? { ...entry, consumedAt: timestamp } : entry), commandReceipts: [...(document.commandReceipts ?? []), receipt], auditEvents: [...document.auditEvents, event] }
      }, `confirm:${request.commandId}`)
      void committed
      return result
    } catch (error) {
      if (!(error instanceof ManagedIdentityStoreError) || error.code !== 'MANAGED_IDENTITY_REVISION_CONFLICT') throw error
      const replay = confirmationRead((await readExisting()).document, request, timestamp)
      if (replay.kind !== 'replayed') throw error
      return { identityRecordId: replay.identityRecordId, employeeId: request.employeeId }
    }
  }

  const bindAuth = async (request: { employeeId: string; issuer: string; subject: string; email: string; commandId?: string }) => {
    const current = await readExisting()
    const timestamp = nowIso(now())
    let identity!: ManagedDailyIdentityV1
    const prior = (current.document.managedDailyIdentities ?? []).find((entry) => entry.employeeId === request.employeeId)
    if (prior?.linkState === 'active' && prior.authIssuer === request.issuer && prior.authSubject === request.subject && prior.lastVerifiedPrimaryEmail === request.email.trim().toLowerCase()) return { identityRecordId: prior.identityRecordId, employeeId: prior.employeeId }
    const committed = await commit(current.revision, (document) => {
      const found = (document.managedDailyIdentities ?? []).find((entry) => entry.employeeId === request.employeeId)
      if (!found) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_CANDIDATE_INVALID')
      const normalizedEmail = request.email.trim().toLowerCase()
      if (!document.admissionAuthority?.admissionEnabled) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_ADMISSION_DISABLED')
      const observation = (document.observations ?? []).find((entry) => entry.identityRecordId === found.identityRecordId)
      if (!observation || observation.directoryState !== 'present' || observation.primaryEmail?.toLowerCase() !== normalizedEmail || found.lastVerifiedPrimaryEmail.toLowerCase() !== normalizedEmail || found.linkState === 'conflict') throw new ManagedIdentityStoreError('MANAGED_IDENTITY_IDENTITY_CONFLICT')
      if ((document.lifecycleEvents ?? []).some((entry) => entry.employeeId === request.employeeId && entry.state !== 'completed')) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_IDENTITY_CONFLICT')
      if (found.linkState === 'active' && found.authIssuer === request.issuer && found.authSubject === request.subject) { identity = clone(found); return document }
      const conflictReservation = (document.principalIdentityReservations ?? []).find((entry) => entry.principalIssuer === request.issuer && entry.principalSubject === request.subject && entry.employeeId !== request.employeeId)
      const conflictIdentity = (document.managedDailyIdentities ?? []).find((entry) => entry.authIssuer === request.issuer && entry.authSubject === request.subject && entry.employeeId !== request.employeeId)
      const anyReservation = (document.principalIdentityReservations ?? []).find((entry) => entry.principalIssuer === request.issuer && entry.principalSubject === request.subject)
      if (conflictReservation || conflictIdentity || anyReservation) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_IDENTITY_CONFLICT')
      if (found.authIssuer && (found.authIssuer !== request.issuer || found.authSubject !== request.subject)) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_IDENTITY_CONFLICT')
      identity = { ...found, authIssuer: request.issuer, authSubject: request.subject, boundAt: found.boundAt ?? timestamp, linkState: 'active', revision: found.revision + 1, admissionRevision: document.admissionAuthority?.admissionEnabled ? (document.nextAdmissionRevision ?? 1) : null, admissionChangedAt: document.admissionAuthority?.admissionEnabled ? timestamp : null, lastVerifiedPrimaryEmail: normalizedEmail || found.lastVerifiedPrimaryEmail, updatedAt: timestamp, updatedBy: request.issuer + ':' + request.subject }
      const reservation: PrincipalIdentityReservationV1 = { principalIssuer: request.issuer, principalSubject: request.subject, employeeId: request.employeeId, firstSeenAt: timestamp, sourceKind: 'managed', sourceRevision: current.revision ?? 'local' }
      const reservations = (document.principalIdentityReservations ?? []).some((entry) => entry.principalIssuer === request.issuer && entry.principalSubject === request.subject) ? document.principalIdentityReservations ?? [] : [...(document.principalIdentityReservations ?? []), reservation]
      const event: ManagedIdentityAuditEventV1 = { id: 'managed-identity-audit-' + randomUUID(), commandId: request.commandId ?? null, action: 'managed_identity_auth_bound', employeeId: request.employeeId, identityRecordId: identity.identityRecordId, employeeNumber: document.registry.assignments.find((entry) => entry.employeeId === request.employeeId)?.employeeNumber ?? '', previousEmployeeNumber: null, actor: request.issuer + ':' + request.subject, occurredAt: timestamp, result: 'applied', reasonCode: 'first_login_bridge' }
      const nextAdmissionRevision = identity.admissionRevision ? identity.admissionRevision + 1 : document.nextAdmissionRevision
      return { ...document, managedDailyIdentities: (document.managedDailyIdentities ?? []).map((entry) => entry.identityRecordId === identity.identityRecordId ? identity : entry), principalIdentityReservations: reservations, nextAdmissionRevision, auditEvents: [...document.auditEvents, event] }
    }, `bind:${request.commandId ?? randomUUID()}`)
    void committed
    return { identityRecordId: identity.identityRecordId, employeeId: identity.employeeId }
  }

  const managedLoginSnapshot = (document: ManagedIdentityDocumentV1, identityRecordId: string): ManagedLoginIdentity => {
    if (!document.admissionAuthority?.admissionEnabled) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_ADMISSION_DISABLED')
    const identity = (document.managedDailyIdentities ?? []).find((entry) => entry.identityRecordId === identityRecordId)
    if (!identity || !['directory_linked_pending_auth', 'active'].includes(identity.linkState)) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_IDENTITY_CONFLICT')
    const assignment = document.registry.assignments.find((entry) => entry.employeeId === identity.employeeId)
    const observation = (document.observations ?? []).find((entry) => entry.identityRecordId === identity.identityRecordId)
    if (!assignment || !observation || observation.directoryState !== 'present' || observation.primaryEmail?.toLowerCase() !== identity.lastVerifiedPrimaryEmail.toLowerCase()) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_IDENTITY_CONFLICT')
    if (document.currentWorkspaceAuthority && !document.currentWorkspaceAuthority.employeeIds.includes(identity.employeeId)) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_IDENTITY_CONFLICT')
    if ((document.lifecycleEvents ?? []).some((entry) => entry.employeeId === identity.employeeId && entry.state !== 'completed')) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_IDENTITY_CONFLICT')
    const pair = identity.authIssuer && identity.authSubject ? { issuer: identity.authIssuer, subject: identity.authSubject } : null
    if (identity.linkState === 'active' && (!pair || identity.admissionRevision === null) || identity.linkState === 'directory_linked_pending_auth' && pair) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_IDENTITY_CONFLICT')
    return { employeeId: identity.employeeId, principalId: identity.principalId, employeeNumber: assignment.employeeNumber, directoryCustomerId: identity.directoryCustomerId, directoryUserId: identity.directoryUserId, identityRecordId: identity.identityRecordId, identityRevision: String(identity.revision), registryRevision: String(assignment.revision), linkState: identity.linkState as ManagedLoginIdentity['linkState'], pair }
  }

  const verifyManagedLoginIdentity = async (request: { requestId: string; requestHash: string; current: ManagedLoginIdentity; issuer: string; subject: string; actor: string }) => {
    let expectedCurrent = request.current
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const before = await readExisting()
      const observed = managedLoginSnapshot(before.document, expectedCurrent.identityRecordId)
      if (canonicalManagedLoginIdentity(observed) !== canonicalManagedLoginIdentity(expectedCurrent)) {
        const concurrentBind = expectedCurrent.linkState === 'directory_linked_pending_auth'
          && observed.linkState === 'active'
          && observed.pair?.issuer === request.issuer
          && observed.pair.subject === request.subject
          && observed.identityRevision === incrementRevision(expectedCurrent.identityRevision)
          && observed.registryRevision === expectedCurrent.registryRevision
          && observed.employeeId === expectedCurrent.employeeId
          && observed.principalId === expectedCurrent.principalId
          && observed.employeeNumber === expectedCurrent.employeeNumber
          && observed.directoryCustomerId === expectedCurrent.directoryCustomerId
          && observed.directoryUserId === expectedCurrent.directoryUserId
        if (!concurrentBind) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_REVISION_CONFLICT')
        expectedCurrent = observed
      }
      let result!: { identity: ManagedLoginIdentity & { linkState: 'active'; pair: { issuer: string; subject: string } }; mappingVersion: string }
      try {
        await commit(before.revision, (document) => {
          const current = managedLoginSnapshot(document, expectedCurrent.identityRecordId)
          if (canonicalManagedLoginIdentity(current) !== canonicalManagedLoginIdentity(expectedCurrent)) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_REVISION_CONFLICT')
          const existingReceipt = (document.commandReceipts ?? []).find((entry) => entry.commandId === request.requestId)
          if (existingReceipt) {
            if (existingReceipt.action !== 'verify_managed_login_identity_v1' || existingReceipt.requestHashSha256 !== request.requestHash || existingReceipt.identityRecordId !== current.identityRecordId) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_IDEMPOTENCY_CONFLICT')
            if (current.linkState !== 'active' || current.pair?.issuer !== request.issuer || current.pair.subject !== request.subject) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_IDEMPOTENCY_CONFLICT')
            const row = (document.managedDailyIdentities ?? []).find((entry) => entry.identityRecordId === current.identityRecordId)!
            result = { identity: { ...current, linkState: 'active', pair: current.pair }, mappingVersion: String(row.admissionRevision) }
            return document
          }
          const row = (document.managedDailyIdentities ?? []).find((entry) => entry.identityRecordId === current.identityRecordId)!
          let active = current
          let mappingVersion = row.admissionRevision
          let nextDocument = document
          let disposition: 'applied' | 'noop' = 'noop'
          if (current.linkState === 'active') {
            if (current.pair?.issuer !== request.issuer || current.pair.subject !== request.subject || mappingVersion === null) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_IDENTITY_CONFLICT')
          } else {
            const reservation = (document.principalIdentityReservations ?? []).find((entry) => entry.principalIssuer === request.issuer && entry.principalSubject === request.subject)
            const pairInUse = (document.managedDailyIdentities ?? []).some((entry) => entry.identityRecordId !== row.identityRecordId && entry.authIssuer === request.issuer && entry.authSubject === request.subject)
            if (reservation || pairInUse) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_IDENTITY_CONFLICT')
            mappingVersion = document.nextAdmissionRevision ?? 1
            const timestamp = nowIso(now())
            const updated: ManagedDailyIdentityV1 = { ...row, authIssuer: request.issuer, authSubject: request.subject, boundAt: timestamp, linkState: 'active', revision: row.revision + 1, admissionRevision: mappingVersion, admissionChangedAt: timestamp, updatedAt: timestamp, updatedBy: request.actor }
            const newReservation: PrincipalIdentityReservationV1 = { principalIssuer: request.issuer, principalSubject: request.subject, employeeId: row.employeeId, firstSeenAt: timestamp, sourceKind: 'managed', sourceRevision: `managed-login:${request.requestId}` }
            active = { ...current, identityRevision: String(updated.revision), linkState: 'active', pair: { issuer: request.issuer, subject: request.subject } }
            nextDocument = { ...document, managedDailyIdentities: (document.managedDailyIdentities ?? []).map((entry) => entry.identityRecordId === row.identityRecordId ? updated : entry), principalIdentityReservations: [...(document.principalIdentityReservations ?? []), newReservation], nextAdmissionRevision: mappingVersion + 1 }
            disposition = 'applied'
          }
          const timestamp = nowIso(now())
          const receipt: ManagedIdentityCommandReceiptV1 = { commandId: request.requestId, requestHashSha256: request.requestHash, action: 'verify_managed_login_identity_v1', employeeId: active.employeeId, identityRecordId: active.identityRecordId, responsePayload: { contractVersion: 'jenfu.managed-login.v1', identityRecordId: active.identityRecordId, mappingVersion: String(mappingVersion) }, createdAt: timestamp }
          const event: ManagedIdentityAuditEventV1 = { id: `managed-identity-audit-${randomUUID()}`, commandId: request.requestId, action: 'managed_login_identity_verified', employeeId: active.employeeId, identityRecordId: active.identityRecordId, employeeNumber: active.employeeNumber, previousEmployeeNumber: null, actor: request.actor, occurredAt: timestamp, result: disposition, reasonCode: disposition === 'applied' ? 'first_login_bridge' : 'active_pair_verified' }
          nextDocument = { ...nextDocument, commandReceipts: [...(nextDocument.commandReceipts ?? []), receipt], auditEvents: [...nextDocument.auditEvents, event] }
          result = { identity: { ...active, linkState: 'active', pair: { issuer: request.issuer, subject: request.subject } }, mappingVersion: String(mappingVersion) }
          return nextDocument
        }, `managed-login:${request.requestId}`)
        return result
      } catch (error) {
        if (!(error instanceof ManagedIdentityStoreError) || error.code !== 'MANAGED_IDENTITY_REVISION_CONFLICT' || attempt > 0) throw error
      }
    }
    throw new ManagedIdentityStoreError('MANAGED_IDENTITY_REVISION_CONFLICT')
  }

  const enqueueRefresh = async (request: { employeeId: string; trigger: 'manual' | 'periodic' | 'domain'; commandId: string; actor: string; now?: string }) => {
    const current = await readExisting()
    const timestamp = request.now ?? nowIso(now())
    let result: 'queued' | 'deduplicated' = 'queued'
    let requestId = ''
    const committed = await commit(current.revision, (document) => {
      const identity = (document.managedDailyIdentities ?? []).find((entry) => entry.employeeId === request.employeeId)
      if (!identity) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_CANDIDATE_INVALID')
      const active = (document.refreshOutbox ?? []).find((entry) => entry.identityRecordId === identity.identityRecordId && ['queued', 'leased', 'retry'].includes(entry.state))
      if (active) {
        if (request.trigger === 'domain') return { ...document, refreshOutbox: (document.refreshOutbox ?? []).map((entry) => entry.requestId === active.requestId ? { ...entry, rerunRequested: true, updatedAt: timestamp } : entry) }
        result = 'deduplicated'; requestId = active.requestId; return document
      }
      requestId = randomUUID()
      const outbox: ManagedIdentityRefreshOutboxV1 = { requestId, identityRecordId: identity.identityRecordId, trigger: request.trigger, state: 'queued', requestSequence: document.nextRefreshRequestSequence ?? 1, attemptCount: 0, availableAt: timestamp, leaseVersion: 0, leaseWorkerId: null, leaseUntil: null, rerunRequested: false, completionDisposition: null, createdAt: timestamp, updatedAt: timestamp, completedAt: null, lastErrorCode: null }
      const receipt: ManagedIdentityCommandReceiptV1 = { commandId: request.commandId, requestHashSha256: sha256(JSON.stringify({ employeeId: request.employeeId, trigger: request.trigger })), action: 'enqueue_managed_identity_refresh_v1', employeeId: request.employeeId, identityRecordId: identity.identityRecordId, responsePayload: { requestId }, createdAt: timestamp }
      return { ...document, nextRefreshRequestSequence: outbox.requestSequence + 1, refreshOutbox: [...(document.refreshOutbox ?? []), outbox], commandReceipts: [...(document.commandReceipts ?? []), receipt] }
    }, `refresh-enqueue:${request.commandId}`)
    void committed
    return { disposition: result, requestId }
  }

  const claimRefresh = async (workerId: string, limit = 2, leaseSeconds = 30, timestamp = nowIso(now())) => {
    const current = await readExisting()
    const claims: ManagedIdentityRefreshClaimV1[] = []
    const committed = await commit(current.revision, (document) => {
      const maxClaims = Math.max(1, Math.min(limit, 2))
      const due = (document.refreshOutbox ?? []).filter((entry) => (entry.state === 'queued' || entry.state === 'retry' || entry.state === 'leased' && entry.leaseUntil !== null && Date.parse(entry.leaseUntil) <= Date.parse(timestamp)) && Date.parse(entry.availableAt) <= Date.parse(timestamp) && entry.attemptCount < 5).sort((a, b) => a.requestSequence - b.requestSequence)
      const terminalDue = (document.refreshOutbox ?? []).filter((entry) => entry.state === 'leased' && entry.leaseUntil !== null && Date.parse(entry.leaseUntil) <= Date.parse(timestamp) && entry.attemptCount >= 5).sort((a, b) => a.requestSequence - b.requestSequence)
      const selected = [...due.map((entry) => ({ entry, kind: 'leased' as const })), ...terminalDue.map((entry) => ({ entry, kind: 'terminal_due' as const }))].sort((a, b) => a.entry.requestSequence - b.entry.requestSequence).slice(0, maxClaims)
      const next = (document.refreshOutbox ?? []).map((entry) => {
        const selectedEntry = selected.find((candidate) => candidate.entry.requestId === entry.requestId)
        if (!selectedEntry || selectedEntry.kind === 'terminal_due') return entry
        const leaseVersion = entry.leaseVersion + 1
        const updated: ManagedIdentityRefreshOutboxV1 = { ...entry, state: 'leased', attemptCount: entry.attemptCount + 1, leaseVersion, leaseWorkerId: workerId, leaseUntil: new Date(Date.parse(timestamp) + leaseSeconds * 1000).toISOString(), updatedAt: timestamp }
        const identity = (document.managedDailyIdentities ?? []).find((candidate) => candidate.identityRecordId === entry.identityRecordId)
        if (identity) claims.push({ claimKind: 'leased', requestId: entry.requestId, identityRecordId: entry.identityRecordId, employeeId: identity.employeeId, directoryCustomerId: identity.directoryCustomerId, directoryUserId: identity.directoryUserId, requestSequence: entry.requestSequence, attemptCount: updated.attemptCount, leaseVersion, leaseUntil: updated.leaseUntil })
        return updated
      })
      for (const candidate of selected.filter((item) => item.kind === 'terminal_due')) {
        const identity = (document.managedDailyIdentities ?? []).find((item) => item.identityRecordId === candidate.entry.identityRecordId)
        if (identity) claims.push({ claimKind: 'terminal_due', requestId: candidate.entry.requestId, identityRecordId: candidate.entry.identityRecordId, employeeId: identity.employeeId, directoryCustomerId: identity.directoryCustomerId, directoryUserId: identity.directoryUserId, requestSequence: candidate.entry.requestSequence, attemptCount: candidate.entry.attemptCount, leaseVersion: candidate.entry.leaseVersion, leaseUntil: candidate.entry.leaseUntil })
      }
      return { ...document, refreshOutbox: next }
    }, `refresh-claim:${workerId}:${timestamp}`)
    return { claims, document: committed.document, revision: committed.revision }
  }

  const completeRefresh = async (request: { requestId: string; workerId: string; leaseVersion: number; directoryCustomerId: string; directoryUserId: string; directoryState: 'missing' | 'present' | 'suspended' | 'archived'; primaryEmail: string | null; sourceEtag: string | null; adapterOutcome: 'success' | 'not_found'; now?: string }) => {
    const current = await readExisting()
    const timestamp = request.now ?? nowIso(now())
    let result: ManagedIdentityRefreshResultV1 = { disposition: 'superseded', requestId: request.requestId, identityRecordId: '' }
    await commit(current.revision, (document) => {
      const row = (document.refreshOutbox ?? []).find((entry) => entry.requestId === request.requestId)
      if (!row || row.state !== 'leased' || row.leaseWorkerId !== request.workerId || row.leaseVersion !== request.leaseVersion) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_REFRESH_LEASE_CONFLICT')
      const identity = (document.managedDailyIdentities ?? []).find((entry) => entry.identityRecordId === row.identityRecordId)
      if (!identity) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_STORE_INVALID')
      const assignment = document.registry.assignments.find((entry) => entry.employeeId === identity.employeeId)
      const currentEmployeeIds = document.currentWorkspaceAuthority?.employeeIds ?? []
      if (!assignment || (currentEmployeeIds.length > 0 && !currentEmployeeIds.includes(identity.employeeId))) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_REFRESH_LEASE_CONFLICT')
      const priorObservation = (document.observations ?? []).find((entry) => entry.identityRecordId === identity.identityRecordId)
      if (priorObservation && priorObservation.lastAppliedRequestSequence >= row.requestSequence) {
        const superseded = (document.refreshOutbox ?? []).map((entry) => entry.requestId === row.requestId ? { ...entry, state: 'completed' as const, leaseWorkerId: null, leaseUntil: null, completionDisposition: 'superseded' as const, completedAt: timestamp, updatedAt: timestamp } : entry)
        result = { disposition: 'superseded', requestId: row.requestId, identityRecordId: identity.identityRecordId }
        return { ...document, refreshOutbox: superseded }
      }
      result = { disposition: 'applied', requestId: row.requestId, identityRecordId: identity.identityRecordId }
      const nextObservation = { identityRecordId: identity.identityRecordId, primaryEmail: request.primaryEmail, directoryState: request.directoryState, sourceEtag: request.sourceEtag, lastAppliedRequestSequence: row.requestSequence, adapterOutcome: request.adapterOutcome, errorCode: null, trustedObservedAt: timestamp, lastAttemptAt: timestamp, freshness: 'fresh' as const }
      const outbox = (document.refreshOutbox ?? []).map((entry) => entry.requestId === row.requestId ? { ...entry, state: 'completed' as const, leaseWorkerId: null, leaseUntil: null, completionDisposition: 'applied' as const, completedAt: timestamp, updatedAt: timestamp } : entry)
      const successors = row.rerunRequested ? [{ ...row, requestId: randomUUID(), state: 'queued' as const, requestSequence: (document.nextRefreshRequestSequence ?? 1), attemptCount: 0, leaseVersion: 0, leaseWorkerId: null, leaseUntil: null, rerunRequested: false, completionDisposition: null, availableAt: timestamp, createdAt: timestamp, updatedAt: timestamp, completedAt: null, lastErrorCode: null }] : []
      if (successors.length) result = { disposition: 'superseded', requestId: row.requestId, identityRecordId: identity.identityRecordId }
      return { ...document, observations: (document.observations ?? []).filter((entry) => entry.identityRecordId !== identity.identityRecordId).concat(nextObservation), refreshOutbox: [...outbox, ...successors], nextRefreshRequestSequence: successors.length ? successors[0].requestSequence + 1 : document.nextRefreshRequestSequence }
    }, `refresh-complete:${request.requestId}`)
    return result
  }

  const retryRefresh = async (request: { requestId: string; workerId: string; leaseVersion: number; errorCode: string; now?: string }) => {
    const current = await readExisting()
    const timestamp = request.now ?? nowIso(now())
    let result: ManagedIdentityRefreshResultV1 = { disposition: 'superseded', requestId: request.requestId, identityRecordId: '' }
    await commit(current.revision, (document) => {
      const row = (document.refreshOutbox ?? []).find((entry) => entry.requestId === request.requestId)
      if (!row || row.leaseWorkerId !== request.workerId || row.leaseVersion !== request.leaseVersion) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_REFRESH_LEASE_CONFLICT')
      const identity = (document.managedDailyIdentities ?? []).find((entry) => entry.identityRecordId === row.identityRecordId)
      if (!identity) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_STORE_INVALID')
      const terminal = request.errorCode === 'LEASE_EXHAUSTED' || row.attemptCount >= 5 || !['TIMEOUT', 'RATE_LIMITED', 'DIRECTORY_READ_UNAVAILABLE'].includes(request.errorCode)
      const nextState = terminal ? 'dead' : 'retry'
      const availableAt = terminal ? timestamp : new Date(Date.parse(timestamp) + (2 ** Math.max(0, row.attemptCount - 1)) * 1000).toISOString()
      result = { disposition: terminal ? 'terminal' : 'superseded', requestId: row.requestId, identityRecordId: identity.identityRecordId }
      const updated = (document.refreshOutbox ?? []).map((entry) => entry.requestId === row.requestId ? { ...entry, state: nextState as ManagedIdentityRefreshOutboxV1['state'], leaseWorkerId: null, leaseUntil: null, completionDisposition: terminal ? 'terminal' as const : null, availableAt, lastErrorCode: request.errorCode, updatedAt: timestamp, completedAt: terminal ? timestamp : null } : entry)
      return { ...document, refreshOutbox: updated }
    }, `refresh-retry:${request.requestId}:${request.leaseVersion}`)
    return result
  }

  const resolveAlias = async (employeeNumber: string) => {
    const current = await readExisting()
    const parsed = parseEmployeeNumber(employeeNumber)
    if (!parsed.ok) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_CANDIDATE_INVALID')
    if (!current.document.admissionAuthority?.admissionEnabled) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_ADMISSION_DISABLED')
    const assignment = current.document.registry.assignments.find((entry) => entry.employeeNumber === parsed.value)
    const identity = assignment ? (current.document.managedDailyIdentities ?? []).find((entry) => entry.employeeId === assignment.employeeId) : null
    const observation = identity ? (current.document.observations ?? []).find((entry) => entry.identityRecordId === identity.identityRecordId) : null
    const lifecycleBlocked = (current.document.lifecycleEvents ?? []).some((entry) => entry.employeeId === assignment?.employeeId && entry.state !== 'completed')
    if (!assignment || !identity || !['directory_linked_pending_auth', 'active'].includes(identity.linkState) || observation?.directoryState !== 'present' || lifecycleBlocked) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_CANDIDATE_INVALID')
    return { employeeId: assignment.employeeId, employeeNumber: assignment.employeeNumber, identityRecordId: identity.identityRecordId, loginHint: identity.lastVerifiedPrimaryEmail, linkState: identity.linkState as 'directory_linked_pending_auth' | 'active' }
  }

  const setAdmission = async (enabled: boolean, expectedRevision: number, actor: string, reasonCode: string, timestamp = nowIso(now())) => {
    const current = await readExisting()
    let revision = expectedRevision
    const committed = await commit(current.revision, (document) => {
      const authority = document.admissionAuthority ?? createEmptyManagedIdentityDocument(timestamp).admissionAuthority!
      if (authority.revision !== expectedRevision) throw new ManagedIdentityStoreError('MANAGED_IDENTITY_REVISION_CONFLICT')
      if (authority.admissionEnabled === enabled) { revision = authority.revision; return document }
      revision = authority.revision + 1
      return { ...document, admissionAuthority: { admissionEnabled: enabled, revision, updatedAt: timestamp, updatedBy: actor, reasonCode } }
    }, `admission:${expectedRevision}:${enabled}`)
    return { enabled: committed.document.admissionAuthority?.admissionEnabled ?? false, revision, document: committed.document, fileRevision: committed.revision }
  }

  return { readExisting, commit, appendAssignment, createCandidate, readCandidateForConfirmation, confirmCandidate, bindAuth, enqueueRefresh, claimRefresh, completeRefresh, retryRefresh, resolveAlias, setAdmission, verifyManagedLoginIdentity }
}
