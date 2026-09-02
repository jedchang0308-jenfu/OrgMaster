import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, stat } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'
import { getWorkspaceIndex, getWorkspaceVersion, getWorkspacePaths } from './orgmasterWorkspaceStore'
import { readAiPdmRoleCatalog } from '../src/governance/aiPdmCatalog'
import aiPdmCatalogFixture from '../contracts/jenfu-platform-entitlement/v1/fixtures/application-role-catalog.sample.json'
import {
  buildAiPdmRoleCapabilityProjection,
  roleCapabilitySourceKey,
  type AiPdmRoleCapabilityProjection,
  type RoleCapabilityAssignmentSource,
} from '../src/governance/aiPdmRoleCapability'
import type { OrgDirectoryState } from '../src/types'

export type AiPdmRoleCapabilityOperation = 'set_position_adoptions' | 'set_assignment_sources'
export type AiPdmRoleCapabilityChange = {
  employeeId: string
  positionId: string
  selected: boolean
}

export type AiPdmRoleCapabilityMutation = {
  stableRoleId: string
  operation: AiPdmRoleCapabilityOperation
  adoptedPositionIds?: string[]
  changes?: AiPdmRoleCapabilityChange[]
  baseProjectionCursor: number
  commandId: string
  reason: string
  expectedCatalogVersion: string
  expectedCatalogPayloadHash: string
  expectedGovernanceRevision: string
  expectedOrganizationRevision: string
  requestHash?: string
}

export type AiPdmRoleCapabilityEvent = {
  eventId: string
  eventType: 'orgmaster.application_projection.changed.v1'
  applicationId: 'ai-pdm'
  cursor: number
  occurredAt: string
  organizationVersionId: string
  organizationRevision: string
  positionIds: string[]
  changeKinds: Array<'position' | 'position_assignment' | 'position_role_recommendation' | 'role_assignment'>
  roleIds: string[]
  auditReference: string
}

type StoreState = {
  schemaVersion: 2
  revision: string
  governanceRevision: string
  changeCursor: number
  organizationVersionId: string
  organizationRevision: string
  adoptedPositionIdsByRole: Record<string, string[]>
  assignmentSourcesByRole: Record<string, RoleCapabilityAssignmentSource[]>
  events: AiPdmRoleCapabilityEvent[]
  commandReceipts: Record<string, CommandReceipt>
}

export type CommandReceipt = {
  commandId: string
  requestHash: string
  receiptStatus: 'processing' | 'applied' | 'rejected'
  acceptedAt: string | null
  leaseUntil: string | null
  terminalAt: string | null
  decisionCode: string | null
  auditReference: string | null
  changeCursor: number
  governanceRevision: string
  replayed: boolean
  attempt: number
}

type OrganizationSource = {
  versionId: string
  revision: string
  sourceDataAt: string
  state: Pick<OrgDirectoryState, 'employees' | 'departments' | 'roles' | 'positions' | 'assignments'>
}

export class AiPdmRoleCapabilityStoreError extends Error {
  constructor(readonly code: 'ROLE_NOT_FOUND' | 'ROLE_POSITION_ADOPTION_FORBIDDEN' | 'POSITION_NOT_FOUND' | 'EMPLOYEE_NOT_FOUND' | 'POSITION_NOT_ADOPTED' | 'REVISION_CONFLICT' | 'INVALID_COMMAND' | 'COMMAND_ID_REUSED' | 'ROLE_CAPABILITY_READ_FAILED' | 'ORGMASTER_SOURCE_UNAVAILABLE' | 'COMMAND_NOT_FOUND' | 'COMMAND_STILL_PROCESSING' | 'COMMAND_PROCESSING_LEASE_EXPIRED' | 'COMMAND_NOT_OBSERVED' | 'REQUEST_HASH_MISMATCH' | 'CATALOG_VERSION_CONFLICT' | 'CATALOG_PAYLOAD_HASH_MISMATCH' | 'CHANGE_CURSOR_EXPIRED') {
    super(code)
    this.name = 'AiPdmRoleCapabilityStoreError'
  }
}

const locks = new Map<string, Promise<unknown>>()

function dataPath(root: string) {
  const configured = process.env.ORGMASTER_GOVERNANCE_DATA_DIR?.trim()
  const directory = configured ? (isAbsolute(configured) ? configured : resolve(root, configured)) : resolve(root, 'data')
  return resolve(directory, 'ai-pdm-role-capability.v1.json')
}

async function withLock<T>(root: string, task: () => Promise<T>) {
  const path = dataPath(root)
  const previous = locks.get(path) ?? Promise.resolve()
  let release: (() => void) | undefined
  const current = new Promise<void>((resolveRelease) => { release = resolveRelease })
  const queued = previous.then(() => current)
  locks.set(path, queued)
  await previous
  try { return await task() } finally {
    release?.()
    if (locks.get(path) === queued) locks.delete(path)
  }
}

function hashState(state: Omit<StoreState, 'revision'>) {
  return createHash('sha256').update(JSON.stringify(state), 'utf8').digest('hex')
}

function governanceHash(state: Omit<StoreState, 'revision' | 'governanceRevision'>) {
  const { commandReceipts: _receipts, ...governance } = state
  return createHash('sha256').update(JSON.stringify(governance), 'utf8').digest('hex')
}

function withRevision(state: Omit<StoreState, 'revision'>): StoreState {
  const governanceRevision = state.governanceRevision || governanceHash(state as Omit<StoreState, 'revision' | 'governanceRevision'>)
  return { ...state, governanceRevision, revision: hashState({ ...state, governanceRevision }) }
}

function createInitialState(organization: OrganizationSource): StoreState {
  return withRevision({
    schemaVersion: 2,
    governanceRevision: '',
    changeCursor: 0,
    organizationVersionId: organization.versionId,
    organizationRevision: organization.revision,
    adoptedPositionIdsByRole: {},
    assignmentSourcesByRole: {},
    events: [],
    commandReceipts: {},
  })
}

function normalizeEvent(raw: Partial<AiPdmRoleCapabilityEvent>, fallbackCursor: number): AiPdmRoleCapabilityEvent {
  const rawKinds = (raw as { changeKinds?: unknown }).changeKinds
  const legacyKinds = Array.isArray(rawKinds) ? rawKinds.map(String) : []
  const changeKinds = legacyKinds.map((kind) => {
    if (kind === 'organization') return 'position' as const
    if (kind === 'adoption') return 'role_assignment' as const
    if (kind === 'assignment_source') return 'role_assignment' as const
    return kind
  }).filter((kind): kind is AiPdmRoleCapabilityEvent['changeKinds'][number] => ['position', 'position_assignment', 'position_role_recommendation', 'role_assignment'].includes(kind))
  return {
    eventId: typeof raw.eventId === 'string' && raw.eventId.trim() ? raw.eventId : `legacy-event-${fallbackCursor}`,
    eventType: 'orgmaster.application_projection.changed.v1',
    applicationId: 'ai-pdm',
    cursor: Number.isInteger(raw.cursor) ? Number(raw.cursor) : fallbackCursor,
    occurredAt: typeof raw.occurredAt === 'string' && raw.occurredAt.trim() ? raw.occurredAt : (typeof (raw as { changedAt?: unknown }).changedAt === 'string' ? String((raw as { changedAt: string }).changedAt) : new Date(0).toISOString()),
    organizationVersionId: String(raw.organizationVersionId ?? ''),
    organizationRevision: String(raw.organizationRevision ?? ''),
    positionIds: Array.isArray(raw.positionIds) ? uniqueIds(raw.positionIds.map(String)) : [],
    changeKinds: changeKinds.length > 0 ? changeKinds : ['position'],
    roleIds: Array.isArray(raw.roleIds) ? uniqueIds(raw.roleIds.map(String)) : [],
    auditReference: String(raw.auditReference ?? `legacy-audit-${fallbackCursor}`),
  }
}

async function readState(root: string, organization: OrganizationSource) {
  try {
    const raw = await readFile(dataPath(root), 'utf8')
    const parsed = JSON.parse(raw) as Partial<StoreState>
    if (![1, 2].includes(Number(parsed.schemaVersion)) || typeof parsed.revision !== 'string' || typeof parsed.changeCursor !== 'number') throw new AiPdmRoleCapabilityStoreError('ROLE_CAPABILITY_READ_FAILED')
    const legacy = (parsed as Partial<StoreState> & { processedCommands?: Record<string, { requestHash: string; auditReference: string; cursor: number }> }).processedCommands ?? {}
    const commandReceipts: Record<string, CommandReceipt> = parsed.commandReceipts ?? Object.fromEntries(Object.entries(legacy).map(([commandId, value]) => [commandId, {
      commandId, requestHash: value.requestHash, receiptStatus: 'applied' as const, acceptedAt: new Date(0).toISOString(), leaseUntil: null, terminalAt: new Date(0).toISOString(), decisionCode: null, auditReference: value.auditReference, changeCursor: value.cursor, governanceRevision: String(parsed.revision), replayed: false, attempt: 1,
    }]))
    return {
      schemaVersion: 2 as const,
      revision: parsed.revision,
      governanceRevision: parsed.governanceRevision ?? parsed.revision,
      changeCursor: parsed.changeCursor,
      organizationVersionId: String(parsed.organizationVersionId ?? organization.versionId),
      organizationRevision: String(parsed.organizationRevision ?? organization.revision),
      adoptedPositionIdsByRole: parsed.adoptedPositionIdsByRole ?? {},
      assignmentSourcesByRole: parsed.assignmentSourcesByRole ?? {},
      events: Array.isArray(parsed.events) ? parsed.events.map((event, index) => normalizeEvent(event as Partial<AiPdmRoleCapabilityEvent>, index + 1)) : [],
      commandReceipts,
    }
  } catch (error) {
    if (error instanceof AiPdmRoleCapabilityStoreError) throw error
    if ((error as { code?: string }).code !== 'ENOENT') throw new AiPdmRoleCapabilityStoreError('ROLE_CAPABILITY_READ_FAILED')
    return createInitialState(organization)
  }
}

async function writeState(root: string, state: StoreState) {
  const path = dataPath(root)
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  const raw = `${JSON.stringify(state, null, 2)}\n`
  await mkdir(dirname(path), { recursive: true })
  try {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(temporary, raw, 'utf8')
    await rename(temporary, path)
  } catch (error) {
    try { await unlink(temporary) } catch { /* best effort cleanup */ }
    throw error
  }
}

async function readOrganizationSource(root: string): Promise<OrganizationSource> {
  try {
    await stat(getWorkspacePaths(root).manifest)
    const index = await getWorkspaceIndex(root)
    const entry = index.versions.find((candidate) => candidate.id === index.currentVersionId)
    if (!entry || entry.loadStatus !== 'ready') throw new Error('current workspace unavailable')
    const current = await getWorkspaceVersion(root, index.currentVersionId)
    if (!current.version.revision || current.document.kind !== 'document') throw new Error('current workspace invalid')
    return { versionId: index.currentVersionId, revision: current.version.revision, sourceDataAt: current.document.savedAt, state: current.document.state }
  } catch {
    throw new AiPdmRoleCapabilityStoreError('ORGMASTER_SOURCE_UNAVAILABLE')
  }
}

function syncOrganization(state: StoreState, organization: OrganizationSource, now = new Date().toISOString()) {
  if (state.organizationVersionId === organization.versionId && state.organizationRevision === organization.revision) return { state, changed: false }
  const nextWithoutRevision: Omit<StoreState, 'revision'> = {
    ...state,
    governanceRevision: '',
    organizationVersionId: organization.versionId,
    organizationRevision: organization.revision,
    changeCursor: state.changeCursor + 1,
    events: [
      ...state.events,
      {
        eventId: randomUUID(),
        eventType: 'orgmaster.application_projection.changed.v1',
        applicationId: 'ai-pdm',
        cursor: state.changeCursor + 1,
        occurredAt: now,
        organizationVersionId: organization.versionId,
        organizationRevision: organization.revision,
        positionIds: [],
        changeKinds: ['position', 'position_assignment', 'position_role_recommendation'],
        roleIds: readAiPdmRoleCatalog().roles.map((role) => role.stableRoleId),
        auditReference: `audit-ai-pdm-organization-${randomUUID()}`,
      } as AiPdmRoleCapabilityEvent,
    ].slice(-500),
  }
  return { state: withRevision(nextWithoutRevision), changed: true }
}

async function readSynchronized(root: string) {
  const organization = await readOrganizationSource(root)
  let state = await readState(root, organization)
  const synced = syncOrganization(state, organization)
  state = synced.state
  if (synced.changed) await writeState(root, state)
  return { state, organization }
}

function catalogRoleOrThrow(stableRoleId: string) {
  const role = readAiPdmRoleCatalog().roles.find((candidate) => candidate.stableRoleId === stableRoleId)
  if (!role) throw new AiPdmRoleCapabilityStoreError('ROLE_NOT_FOUND')
  return role
}

function uniqueIds(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function buildProjection(state: StoreState, organization: OrganizationSource, stableRoleId: string): AiPdmRoleCapabilityProjection {
  const role = catalogRoleOrThrow(stableRoleId)
  return buildAiPdmRoleCapabilityProjection({
    stableRoleId,
    catalogRole: role,
    organization: { versionId: organization.versionId, revision: organization.revision, ...organization.state },
    adoptedPositionIds: state.adoptedPositionIdsByRole[stableRoleId] ?? [],
    adoptionInitialized: Object.prototype.hasOwnProperty.call(state.adoptedPositionIdsByRole, stableRoleId),
    assignmentSources: state.assignmentSourcesByRole[stableRoleId] ?? [],
    governanceRevision: state.governanceRevision,
    changeCursor: state.changeCursor,
  })
}

function assertBaseCursor(state: StoreState, cursor: number) {
  if (!Number.isInteger(cursor) || cursor !== state.changeCursor) throw new AiPdmRoleCapabilityStoreError('REVISION_CONFLICT')
}

export function validateAiPdmRoleCapabilityReason(reason: string) {
  if (reason.trim().length > 240) throw new AiPdmRoleCapabilityStoreError('INVALID_COMMAND')
}

function positionIdsForRole(state: StoreState, stableRoleId: string) {
  return new Set(state.adoptedPositionIdsByRole[stableRoleId] ?? [])
}

function sourceImpact(organization: OrganizationSource, before: RoleCapabilityAssignmentSource[], after: RoleCapabilityAssignmentSource[]) {
  const sourceSetBefore = new Set(before.map((source) => roleCapabilitySourceKey(source.positionId, source.employeeId)))
  const sourceSetAfter = new Set(after.map((source) => roleCapabilitySourceKey(source.positionId, source.employeeId)))
  const employeeIds = new Set([...before, ...after].map((source) => source.employeeId))
  for (const assignment of organization.state.assignments) {
    if (before.some((source) => source.positionId === assignment.positionId) || after.some((source) => source.positionId === assignment.positionId)) employeeIds.add(assignment.employeeId)
  }
  const revokedEmployeeIds = [...employeeIds].filter((employeeId) => {
    const had = [...sourceSetBefore].some((key) => key.endsWith(`\0${employeeId}`))
    const has = [...sourceSetAfter].some((key) => key.endsWith(`\0${employeeId}`))
    return had && !has
  })
  return {
    affectedEmployeeCount: employeeIds.size,
    removedSourceCount: [...sourceSetBefore].filter((key) => !sourceSetAfter.has(key)).length,
    addedSourceCount: [...sourceSetAfter].filter((key) => !sourceSetBefore.has(key)).length,
    willRevokeHolderCount: revokedEmployeeIds.length,
    revokedEmployeeIds,
  }
}

function prepareMutation(state: StoreState, organization: OrganizationSource, mutation: AiPdmRoleCapabilityMutation) {
  const role = catalogRoleOrThrow(mutation.stableRoleId)
  if (!role.assignable || !role.allowedScopeKinds.some((scope) => scope === 'workspace' || scope === 'department')) throw new AiPdmRoleCapabilityStoreError('ROLE_POSITION_ADOPTION_FORBIDDEN')
  assertBaseCursor(state, mutation.baseProjectionCursor)
  validateAiPdmRoleCapabilityReason(mutation.reason)
  const activePositionIds = new Set(organization.state.positions.filter((position) => position.status === 'active').map((position) => position.id))
  const employeeIds = new Set(organization.state.employees.filter((employee) => employee.status === 'active').map((employee) => employee.id))
  const currentAdopted = uniqueIds(state.adoptedPositionIdsByRole[mutation.stableRoleId] ?? [])
  const currentSources = state.assignmentSourcesByRole[mutation.stableRoleId] ?? []
  let nextAdopted = currentAdopted
  let nextSources = currentSources
  let changeKinds: AiPdmRoleCapabilityEvent['changeKinds'] = []

  if (mutation.operation === 'set_position_adoptions') {
    if (!Array.isArray(mutation.adoptedPositionIds)) throw new AiPdmRoleCapabilityStoreError('INVALID_COMMAND')
    nextAdopted = uniqueIds(mutation.adoptedPositionIds)
    if (nextAdopted.some((positionId) => !activePositionIds.has(positionId))) throw new AiPdmRoleCapabilityStoreError('POSITION_NOT_FOUND')
    nextSources = currentSources.filter((source) => nextAdopted.includes(source.positionId))
    changeKinds = ['role_assignment']
  } else {
    if (!Array.isArray(mutation.changes)) throw new AiPdmRoleCapabilityStoreError('INVALID_COMMAND')
    nextSources = [...currentSources]
    for (const change of mutation.changes) {
      if (!employeeIds.has(change.employeeId)) throw new AiPdmRoleCapabilityStoreError('EMPLOYEE_NOT_FOUND')
      if (!activePositionIds.has(change.positionId)) throw new AiPdmRoleCapabilityStoreError('POSITION_NOT_FOUND')
      if (!positionIdsForRole(state, mutation.stableRoleId).has(change.positionId)) throw new AiPdmRoleCapabilityStoreError('POSITION_NOT_ADOPTED')
      const index = nextSources.findIndex((source) => source.employeeId === change.employeeId && source.positionId === change.positionId)
      if (change.selected && index < 0) nextSources.push({ employeeId: change.employeeId, positionId: change.positionId })
      if (!change.selected && index >= 0) nextSources.splice(index, 1)
    }
    changeKinds = ['role_assignment']
  }

  return {
    role,
    currentAdopted,
    nextAdopted,
    currentSources,
    nextSources,
    changeKinds,
    impact: sourceImpact(organization, currentSources, nextSources),
    changed: JSON.stringify(currentAdopted) !== JSON.stringify(nextAdopted) || JSON.stringify(currentSources) !== JSON.stringify(nextSources),
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) throw new AiPdmRoleCapabilityStoreError('INVALID_COMMAND')
    return Object.is(value, -0) ? '0' : String(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`
  }
  throw new AiPdmRoleCapabilityStoreError('INVALID_COMMAND')
}

function immutableMutationBody(mutation: AiPdmRoleCapabilityMutation) {
  return Object.fromEntries(Object.entries({
    stableRoleId: mutation.stableRoleId,
    operation: mutation.operation,
    adoptedPositionIds: mutation.adoptedPositionIds,
    changes: mutation.changes,
    baseProjectionCursor: mutation.baseProjectionCursor,
    reason: mutation.reason,
    expectedCatalogVersion: mutation.expectedCatalogVersion,
    expectedCatalogPayloadHash: mutation.expectedCatalogPayloadHash,
    expectedGovernanceRevision: mutation.expectedGovernanceRevision,
    expectedOrganizationRevision: mutation.expectedOrganizationRevision,
  }).filter(([, value]) => value !== undefined))
}

function mutationRequestHash(mutation: AiPdmRoleCapabilityMutation) {
  return createHash('sha256').update(canonicalJson(immutableMutationBody(mutation)), 'utf8').digest('hex')
}

function nowIso() {
  return process.env.ORGMASTER_ROLE_CAPABILITY_NOW?.trim() || new Date().toISOString()
}

function validateCatalog(mutation: AiPdmRoleCapabilityMutation) {
  const catalog = readAiPdmRoleCatalog()
  if (catalog.validationState !== 'valid') throw new AiPdmRoleCapabilityStoreError('CATALOG_PAYLOAD_HASH_MISMATCH')
  if (!mutation.expectedCatalogVersion || mutation.expectedCatalogVersion !== catalog.catalogVersion) throw new AiPdmRoleCapabilityStoreError('CATALOG_VERSION_CONFLICT')
  if (!mutation.expectedCatalogPayloadHash || mutation.expectedCatalogPayloadHash.toLowerCase() !== catalog.payloadHash.toLowerCase()) throw new AiPdmRoleCapabilityStoreError('CATALOG_PAYLOAD_HASH_MISMATCH')
  return catalog
}

function validateMutationPreconditions(state: StoreState, organization: OrganizationSource, mutation: AiPdmRoleCapabilityMutation) {
  if (!mutation.expectedGovernanceRevision || mutation.expectedGovernanceRevision !== state.governanceRevision) throw new AiPdmRoleCapabilityStoreError('REVISION_CONFLICT')
  if (!mutation.expectedOrganizationRevision || mutation.expectedOrganizationRevision !== organization.revision) throw new AiPdmRoleCapabilityStoreError('REVISION_CONFLICT')
}

function receiptForCommand(state: StoreState, commandId: string) {
  return state.commandReceipts[commandId]
}

function terminalReceipt(input: Omit<CommandReceipt, 'terminalAt'>, terminalAt = nowIso()): CommandReceipt {
  return { ...input, terminalAt }
}

export async function readAiPdmRoleCapabilityProjection(root: string, stableRoleId: string) {
  return withLock(root, async () => {
    const { state, organization } = await readSynchronized(root)
    return buildProjection(state, organization, stableRoleId)
  })
}

export async function previewAiPdmRoleCapabilityChange(root: string, mutation: Omit<AiPdmRoleCapabilityMutation, 'commandId'>) {
  return withLock(root, async () => {
    const { state, organization } = await readSynchronized(root)
    validateCatalog(mutation as AiPdmRoleCapabilityMutation)
    validateMutationPreconditions(state, organization, mutation as AiPdmRoleCapabilityMutation)
    const prepared = prepareMutation(state, organization, { ...mutation, commandId: 'preview' })
    return {
      status: prepared.changed ? 'changes_pending' as const : 'noop' as const,
      stableRoleId: mutation.stableRoleId,
      operation: mutation.operation,
      before: { adoptedPositionIds: prepared.currentAdopted, assignmentSources: prepared.currentSources },
      after: { adoptedPositionIds: prepared.nextAdopted, assignmentSources: prepared.nextSources },
      impact: prepared.impact,
      projection: buildProjection(state, organization, mutation.stableRoleId),
      governanceRevision: state.governanceRevision,
      changeCursor: state.changeCursor,
    }
  })
}

export async function publishAiPdmRoleCapabilityChange(root: string, mutation: AiPdmRoleCapabilityMutation) {
  return withLock(root, async () => {
    const { state, organization } = await readSynchronized(root)
    if (!mutation.commandId.trim()) throw new AiPdmRoleCapabilityStoreError('INVALID_COMMAND')
    const catalog = validateCatalog(mutation)
    validateMutationPreconditions(state, organization, mutation)
    const requestHash = mutationRequestHash(mutation)
    if (mutation.requestHash && mutation.requestHash !== requestHash) throw new AiPdmRoleCapabilityStoreError('REQUEST_HASH_MISMATCH')
    const existing = receiptForCommand(state, mutation.commandId)
    if (existing) {
      if (existing.requestHash !== requestHash) throw new AiPdmRoleCapabilityStoreError('COMMAND_ID_REUSED')
      if (existing.receiptStatus === 'processing') {
        if (Date.parse(existing.leaseUntil ?? '') > Date.parse(nowIso())) throw new AiPdmRoleCapabilityStoreError('COMMAND_STILL_PROCESSING')
        throw new AiPdmRoleCapabilityStoreError('COMMAND_PROCESSING_LEASE_EXPIRED')
      }
      if (existing.receiptStatus === 'rejected') {
        throw new AiPdmRoleCapabilityStoreError(existing.decisionCode === 'COMMAND_NOT_OBSERVED' ? 'COMMAND_NOT_OBSERVED' : 'COMMAND_PROCESSING_LEASE_EXPIRED')
      }
      return { status: existing.decisionCode === 'COMMAND_NOOP' ? 'noop' as const : 'replayed' as const, auditReference: existing.auditReference, projection: buildProjection(state, organization, mutation.stableRoleId), governanceRevision: existing.governanceRevision, changeCursor: existing.changeCursor, impact: { affectedEmployeeCount: 0, removedSourceCount: 0, addedSourceCount: 0, willRevokeHolderCount: 0, revokedEmployeeIds: [] as string[] }, receipt: { ...existing, replayed: true } }
    }
    const acceptedAt = nowIso()
    const processing: CommandReceipt = { commandId: mutation.commandId, requestHash, receiptStatus: 'processing', acceptedAt, leaseUntil: new Date(Date.parse(acceptedAt) + 30_000).toISOString(), terminalAt: null, decisionCode: null, auditReference: null, changeCursor: state.changeCursor, governanceRevision: state.governanceRevision, replayed: false, attempt: 1 }
    const processingState = withRevision({ ...state, commandReceipts: { ...state.commandReceipts, [mutation.commandId]: processing } })
    await writeState(root, processingState)
    let prepared: ReturnType<typeof prepareMutation>
    try { prepared = prepareMutation(processingState, organization, mutation) } catch (error) {
      const code = error instanceof AiPdmRoleCapabilityStoreError ? error.code : 'INVALID_COMMAND'
      const rejected = terminalReceipt({ ...processing, receiptStatus: 'rejected', decisionCode: code, replayed: false })
      await writeState(root, withRevision({ ...processingState, commandReceipts: { ...processingState.commandReceipts, [mutation.commandId]: rejected } }))
      throw error
    }
    const auditReference = prepared.changed ? `audit-ai-pdm-role-capability-${randomUUID()}` : null
    const cursor = prepared.changed ? state.changeCursor + 1 : state.changeCursor
    const governanceRevision = prepared.changed ? '' : state.governanceRevision
    const receipt = terminalReceipt({ ...processing, receiptStatus: 'applied', decisionCode: prepared.changed ? 'COMMAND_APPLIED' : 'COMMAND_NOOP', auditReference, changeCursor: cursor, governanceRevision, replayed: false })
    const nextWithoutRevision: Omit<StoreState, 'revision'> = {
      ...processingState,
      changeCursor: cursor,
      governanceRevision,
      adoptedPositionIdsByRole: prepared.changed ? { ...state.adoptedPositionIdsByRole, [mutation.stableRoleId]: prepared.nextAdopted } : state.adoptedPositionIdsByRole,
      assignmentSourcesByRole: prepared.changed ? { ...state.assignmentSourcesByRole, [mutation.stableRoleId]: prepared.nextSources } : state.assignmentSourcesByRole,
      events: prepared.changed ? [
        ...processingState.events,
        {
          eventId: randomUUID(),
          eventType: 'orgmaster.application_projection.changed.v1',
          applicationId: 'ai-pdm',
          cursor,
          occurredAt: nowIso(),
          organizationVersionId: organization.versionId,
          organizationRevision: organization.revision,
          positionIds: uniqueIds([...prepared.currentAdopted, ...prepared.nextAdopted, ...prepared.currentSources.map((source) => source.positionId), ...prepared.nextSources.map((source) => source.positionId)]),
          changeKinds: prepared.changeKinds,
          roleIds: [mutation.stableRoleId],
          auditReference,
        } as AiPdmRoleCapabilityEvent,
      ].slice(-500) : processingState.events,
      commandReceipts: { ...processingState.commandReceipts, [mutation.commandId]: receipt },
    }
    const next = withRevision(nextWithoutRevision)
    await writeState(root, next)
    return { status: prepared.changed ? 'applied' as const : 'noop' as const, auditReference, projection: buildProjection(next, organization, mutation.stableRoleId), governanceRevision: prepared.changed ? next.governanceRevision : state.governanceRevision, changeCursor: next.changeCursor, impact: prepared.impact, receipt }
  })
}

export async function readAiPdmRoleCapabilityWorkspace(root: string) {
  return withLock(root, async () => {
    const { state, organization } = await readSynchronized(root)
    const catalog = readAiPdmRoleCatalog()
    if (catalog.validationState !== 'valid') throw new AiPdmRoleCapabilityStoreError('CATALOG_PAYLOAD_HASH_MISMATCH')
    const publishedRoles = aiPdmCatalogFixture.roles
    return { contractVersion: 'ai-pdm.role-capability-workspace.v2' as const, applicationId: 'ai-pdm' as const, catalogVersion: catalog.catalogVersion, catalogPayloadHash: catalog.payloadHash.toLowerCase(), governanceRevision: state.governanceRevision, organizationVersionId: organization.versionId, organizationRevision: organization.revision, projectionCursor: state.changeCursor, sourceDataAt: organization.sourceDataAt, roles: catalog.roles.map((role) => { const catalogRole = publishedRoles.find((candidate) => candidate.stableRoleId === role.stableRoleId); if (!catalogRole) throw new AiPdmRoleCapabilityStoreError('CATALOG_PAYLOAD_HASH_MISMATCH'); const projection = buildProjection(state, organization, role.stableRoleId); return { catalogRole, projection, effectiveHolderCount: projection.positions.flatMap((position) => position.employees).filter((employee) => employee.effectiveHolder).length } }) }
  })
}

export async function readAiPdmRoleCapabilityReceipt(root: string, commandId: string) {
  return withLock(root, async () => {
    const { state } = await readSynchronized(root)
    return state.commandReceipts[commandId] ?? { commandId, requestHash: null, receiptStatus: 'not_found' as const, acceptedAt: null, leaseUntil: null, terminalAt: null, decisionCode: 'COMMAND_NOT_FOUND', auditReference: null, changeCursor: state.changeCursor, governanceRevision: state.governanceRevision, replayed: false, attempt: 0 }
  })
}

export async function resolveAiPdmRoleCapabilityUnknown(root: string, commandId: string, requestHash: string, action: 'cancel_if_absent_or_expired') {
  return withLock(root, async () => {
    const { state } = await readSynchronized(root)
    const existing = state.commandReceipts[commandId]
    if (existing) {
      if (existing.requestHash !== requestHash) throw new AiPdmRoleCapabilityStoreError('REQUEST_HASH_MISMATCH')
      if (existing.receiptStatus === 'processing' && Date.parse(existing.leaseUntil ?? '') > Date.parse(nowIso())) throw new AiPdmRoleCapabilityStoreError('COMMAND_STILL_PROCESSING')
      if (existing.receiptStatus === 'processing') {
        const expired = terminalReceipt({ ...existing, receiptStatus: 'rejected', decisionCode: 'COMMAND_PROCESSING_LEASE_EXPIRED' })
        const next = withRevision({ ...state, commandReceipts: { ...state.commandReceipts, [commandId]: expired } }); await writeState(root, next); return expired
      }
      return existing
    }
    const rejected = terminalReceipt({ commandId, requestHash, receiptStatus: 'rejected', acceptedAt: null, leaseUntil: null, decisionCode: 'COMMAND_NOT_OBSERVED', auditReference: null, changeCursor: state.changeCursor, governanceRevision: state.governanceRevision, replayed: false, attempt: 0 })
    const next = withRevision({ ...state, commandReceipts: { ...state.commandReceipts, [commandId]: rejected } }); await writeState(root, next); return rejected
  })
}

export async function readAiPdmRoleCapabilityChangeFeed(root: string, after: number, limit: number) {
  return withLock(root, async () => {
    const { state, organization } = await readSynchronized(root)
    const oldestCursor = state.events[0]?.cursor ?? state.changeCursor
    if (state.events.length > 0 && after < oldestCursor - 1) throw new AiPdmRoleCapabilityStoreError('CHANGE_CURSOR_EXPIRED')
    const events = state.events.filter((event) => event.cursor > after).slice(0, Math.max(1, Math.min(100, limit)))
    const hasMore = events.length > 0 && events.at(-1)!.cursor < state.changeCursor
    return {
      items: events,
      nextCursor: hasMore ? events.at(-1)!.cursor : null,
      hasMore,
      currentOrganizationRevision: organization.revision,
    }
  })
}
