import { createHash } from 'node:crypto'

export interface ProviderAccount {
  providerKey: 'local-deterministic'
  normalizedEmail: string
  accountType: 'human_personal' | 'human_privileged' | 'unclassified'
  issuer: string
  subject: string
  active: boolean
  verified: boolean
}

export interface ProviderInvitationResult {
  disposition: 'created' | 'replayed'
  operationRef: string
  state: 'pending_acceptance' | 'accepted'
  expiresAt: string
  emailDelivered: false
  verifiedAccount: ProviderAccount | null
}

export interface ProviderInvitationObservation {
  state: 'not_found' | 'pending_acceptance' | 'accepted' | 'expired' | 'failed' | 'cancelled'
  operationRef: string | null
  expiresAt: string | null
  verifiedAccount: ProviderAccount | null
}

export type AccountProvisioningErrorCode =
  | 'WORK_EMAIL_INVALID' | 'WORK_EMAIL_DOMAIN_NOT_ALLOWED' | 'ACCOUNT_ALREADY_EXISTS'
  | 'ACCOUNT_NOT_ELIGIBLE' | 'PROVIDER_UNAVAILABLE' | 'PROVIDER_REJECTED' | 'PROVIDER_RESPONSE_LOST'

export class AccountProvisioningError extends Error {
  constructor(readonly code: AccountProvisioningErrorCode) { super(code); this.name = 'AccountProvisioningError' }
}

export interface LocalAccountProvisioningOptions {
  now?: () => Date
  inviteFault?: 'none' | 'timeout_before_commit' | 'timeout_after_commit' | 'unavailable' | 'failed' | 'accepted'
}

export interface AccountProvisioningPort {
  readonly providerKey: 'local-deterministic'
  readonly deliveryMode: 'simulated'
  findExistingByExactEmail(email: string): Promise<ProviderAccount | null>
  requestInvitation(input: { requestKey: string; enrollmentId: string; email: string }): Promise<ProviderInvitationResult>
  resendInvitation(input: { requestKey: string; enrollmentId: string; operationRef: string }): Promise<ProviderInvitationResult>
  readInvitation(input: { requestKey: string; enrollmentId: string; operationRef: string | null }): Promise<ProviderInvitationObservation>
}

const PROVIDER_ISSUER = 'urn:orgmaster:local-account-provider'
const DOMAIN = 'orgmaster.test'

function normalizeEmail(email: string) { return email.trim().toLowerCase() }
function subjectFor(email: string) { return `local-subject-${createHash('sha256').update(email).digest('hex').slice(0, 32)}` }
function operationRefFor(key: string) { return `local-invite-${createHash('sha256').update(key).digest('hex').slice(0, 24)}` }
function accountFor(email: string, accountType: ProviderAccount['accountType']): ProviderAccount {
  const normalizedEmail = normalizeEmail(email)
  return { providerKey: 'local-deterministic', normalizedEmail, accountType, issuer: PROVIDER_ISSUER, subject: subjectFor(normalizedEmail), active: true, verified: true }
}
function assertEmail(email: string) {
  const normalized = normalizeEmail(email)
  if (normalized.length > 254 || !/^[^@\s]+@[^@\s]+$/.test(normalized)) throw new AccountProvisioningError('WORK_EMAIL_INVALID')
  if (!normalized.endsWith(`@${DOMAIN}`)) throw new AccountProvisioningError('WORK_EMAIL_DOMAIN_NOT_ALLOWED')
  return normalized
}

type Operation = { requestKey: string; enrollmentId: string; email: string; operationRef: string; state: 'pending_acceptance' | 'accepted' | 'expired' | 'failed' | 'cancelled'; expiresAt: string }

export function createLocalAccountProvisioningAdapter(options: LocalAccountProvisioningOptions = {}): AccountProvisioningPort {
  const now = options.now ?? (() => new Date())
  const accounts = new Map<string, ProviderAccount>([
    ['existing.admin@orgmaster.test', accountFor('existing.admin@orgmaster.test', 'human_privileged')],
    ['existing.employee@orgmaster.test', accountFor('existing.employee@orgmaster.test', 'human_personal')],
  ])
  const operations = new Map<string, Operation>()
  const resultFor = (operation: Operation, disposition: ProviderInvitationResult['disposition']): ProviderInvitationResult => ({
    disposition, operationRef: operation.operationRef, state: operation.state === 'accepted' ? 'accepted' : 'pending_acceptance',
    expiresAt: operation.expiresAt, emailDelivered: false,
    verifiedAccount: operation.state === 'accepted' ? accounts.get(operation.email) ?? accountFor(operation.email, 'human_personal') : null,
  })
  const createOperation = (input: { requestKey: string; enrollmentId: string; email: string }, state: Operation['state'] = 'pending_acceptance') => {
    const email = assertEmail(input.email)
    const operationRef = operationRefFor(input.requestKey)
    const existing = operations.get(input.requestKey)
    if (existing) return { operation: existing, disposition: 'replayed' as const }
    const operation: Operation = { requestKey: input.requestKey, enrollmentId: input.enrollmentId, email, operationRef, state, expiresAt: new Date(now().getTime() + 72 * 60 * 60 * 1000).toISOString() }
    operations.set(input.requestKey, operation)
    if (state === 'accepted') accounts.set(email, accountFor(email, 'human_personal'))
    return { operation, disposition: 'created' as const }
  }
  return {
    providerKey: 'local-deterministic' as const,
    deliveryMode: 'simulated' as const,
    async findExistingByExactEmail(email) {
      const normalized = assertEmail(email)
      const value = accounts.get(normalized)
      return value ? { ...value } : null
    },
    async requestInvitation(input) {
      assertEmail(input.email)
      if (accounts.has(normalizeEmail(input.email))) throw new AccountProvisioningError('ACCOUNT_ALREADY_EXISTS')
      if (options.inviteFault === 'timeout_before_commit') throw new AccountProvisioningError('PROVIDER_RESPONSE_LOST')
      if (options.inviteFault === 'unavailable') throw new AccountProvisioningError('PROVIDER_UNAVAILABLE')
      if (options.inviteFault === 'failed') throw new AccountProvisioningError('PROVIDER_REJECTED')
      const { operation, disposition } = createOperation(input, options.inviteFault === 'accepted' ? 'accepted' : 'pending_acceptance')
      if (options.inviteFault === 'timeout_after_commit') throw new AccountProvisioningError('PROVIDER_RESPONSE_LOST')
      return resultFor(operation, disposition)
    },
    async resendInvitation(input) {
      if (options.inviteFault === 'unavailable') throw new AccountProvisioningError('PROVIDER_UNAVAILABLE')
      if (options.inviteFault === 'failed') throw new AccountProvisioningError('PROVIDER_REJECTED')
      const existing = operations.get(input.requestKey)
      if (existing) return resultFor(existing, 'replayed')
      const original = operations.get(input.operationRef) ?? [...operations.values()].find((value) => value.operationRef === input.operationRef)
      if (!original) return { disposition: 'created', operationRef: operationRefFor(input.requestKey), state: 'pending_acceptance', expiresAt: new Date(now().getTime() + 72 * 60 * 60 * 1000).toISOString(), emailDelivered: false, verifiedAccount: null }
      const { operation, disposition } = createOperation({ requestKey: input.requestKey, enrollmentId: input.enrollmentId, email: original.email })
      if (options.inviteFault === 'timeout_after_commit') throw new AccountProvisioningError('PROVIDER_RESPONSE_LOST')
      return resultFor(operation, disposition)
    },
    async readInvitation(input) {
      const operation = operations.get(input.requestKey) ?? [...operations.values()].find((value) => value.operationRef === input.operationRef && value.enrollmentId === input.enrollmentId)
      if (!operation) return { state: 'not_found', operationRef: null, expiresAt: null, verifiedAccount: null }
      if (operation.state === 'pending_acceptance' && Date.parse(operation.expiresAt) <= now().getTime()) operation.state = 'expired'
      return { state: operation.state, operationRef: operation.operationRef, expiresAt: operation.expiresAt, verifiedAccount: operation.state === 'accepted' ? accounts.get(operation.email) ?? null : null }
    },
  }
}

export { normalizeEmail, assertEmail, PROVIDER_ISSUER }
