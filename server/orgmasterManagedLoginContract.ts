import { createHash } from 'node:crypto'

export const MANAGED_LOGIN_CONTRACT_VERSION = 'jenfu.managed-login.v1' as const

export type ManagedLoginPair = { issuer: string; subject: string }

export type ManagedLoginIdentity = {
  employeeId: string
  principalId: string
  employeeNumber: string
  directoryCustomerId: string
  directoryUserId: string
  identityRecordId: string
  identityRevision: string
  registryRevision: string
  linkState: 'directory_linked_pending_auth' | 'active'
  pair: ManagedLoginPair | null
}

export type ManagedLoginRequest =
  | { contractVersion: typeof MANAGED_LOGIN_CONTRACT_VERSION; action: 'resolveAlias'; requestId: string; employeeNumber: string | null }
  | { contractVersion: typeof MANAGED_LOGIN_CONTRACT_VERSION; action: 'verifyIdentity'; requestId: string; directoryCustomerId: string; idToken: string; expected: ManagedLoginIdentity | null }

export type ManagedLoginResponse =
  | { contractVersion: typeof MANAGED_LOGIN_CONTRACT_VERSION; action: 'resolveAlias'; requestId: string; directoryCustomerId: string; match: ManagedLoginIdentity | null }
  | { contractVersion: typeof MANAGED_LOGIN_CONTRACT_VERSION; action: 'verifyIdentity'; requestId: string; identity: ManagedLoginIdentity & { linkState: 'active'; pair: ManagedLoginPair }; mappingVersion: string; authenticatedAt: string }

export class ManagedLoginContractError extends Error {
  constructor() { super('request_invalid') }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ManagedLoginContractError()
  return value as Record<string, unknown>
}

function exact(value: Record<string, unknown>, keys: readonly string[]) {
  const expected = new Set(keys)
  if (Object.keys(value).some((key) => !expected.has(key)) || keys.some((key) => !(key in value))) throw new ManagedLoginContractError()
}

function text(value: unknown, max = 256) {
  if (typeof value !== 'string' || !value || new TextEncoder().encode(value).byteLength > max) throw new ManagedLoginContractError()
  return value
}

function revision(value: unknown) {
  const result = text(value, 128)
  if (!/^[0-9]+$/u.test(result)) throw new ManagedLoginContractError()
  return result
}

function uuid(value: unknown) {
  const result = text(value, 64)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(result)) throw new ManagedLoginContractError()
  return result
}

function pair(value: unknown, nullable = true): ManagedLoginPair | null {
  if (nullable && value === null) return null
  const row = record(value)
  exact(row, ['issuer', 'subject'])
  return { issuer: text(row.issuer, 255), subject: text(row.subject, 255) }
}

function identity(value: unknown): ManagedLoginIdentity {
  const row = record(value)
  exact(row, ['employeeId', 'principalId', 'employeeNumber', 'directoryCustomerId', 'directoryUserId', 'identityRecordId', 'identityRevision', 'registryRevision', 'linkState', 'pair'])
  if (row.linkState !== 'directory_linked_pending_auth' && row.linkState !== 'active') throw new ManagedLoginContractError()
  const result: ManagedLoginIdentity = {
    employeeId: text(row.employeeId),
    principalId: text(row.principalId),
    employeeNumber: text(row.employeeNumber, 64),
    directoryCustomerId: text(row.directoryCustomerId, 255),
    directoryUserId: text(row.directoryUserId, 255),
    identityRecordId: text(row.identityRecordId, 255),
    identityRevision: revision(row.identityRevision),
    registryRevision: revision(row.registryRevision),
    linkState: row.linkState,
    pair: pair(row.pair),
  }
  if (result.linkState === 'active' && result.pair === null || result.linkState === 'directory_linked_pending_auth' && result.pair !== null) throw new ManagedLoginContractError()
  return result
}

export function parseManagedLoginRequest(value: unknown): ManagedLoginRequest {
  const row = record(value)
  if (row.contractVersion !== MANAGED_LOGIN_CONTRACT_VERSION) throw new ManagedLoginContractError()
  if (row.action === 'resolveAlias') {
    exact(row, ['contractVersion', 'action', 'requestId', 'employeeNumber'])
    return { contractVersion: MANAGED_LOGIN_CONTRACT_VERSION, action: 'resolveAlias', requestId: uuid(row.requestId), employeeNumber: row.employeeNumber === null ? null : text(row.employeeNumber, 64) }
  }
  if (row.action === 'verifyIdentity') {
    exact(row, ['contractVersion', 'action', 'requestId', 'directoryCustomerId', 'idToken', 'expected'])
    return { contractVersion: MANAGED_LOGIN_CONTRACT_VERSION, action: 'verifyIdentity', requestId: uuid(row.requestId), directoryCustomerId: text(row.directoryCustomerId, 255), idToken: text(row.idToken, 16 * 1024), expected: row.expected === null ? null : identity(row.expected) }
  }
  throw new ManagedLoginContractError()
}

export function canonicalManagedLoginIdentity(value: ManagedLoginIdentity | null) {
  return JSON.stringify(value)
}

export function managedLoginRequestDigest(input: { directoryCustomerId: string; issuer: string; subject: string; googleUserId: string; authenticatedAt: string; expected: ManagedLoginIdentity | null }) {
  return createHash('sha256').update(JSON.stringify({
    action: 'verifyIdentity',
    directoryCustomerId: input.directoryCustomerId,
    pair: { issuer: input.issuer, subject: input.subject },
    googleUserId: input.googleUserId,
    authenticatedAt: input.authenticatedAt,
    expected: input.expected,
  }), 'utf8').digest('hex')
}

export function incrementRevision(value: string) {
  try { return (BigInt(value) + 1n).toString() } catch { throw new ManagedLoginContractError() }
}
