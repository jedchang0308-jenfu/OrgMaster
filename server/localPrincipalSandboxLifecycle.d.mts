import type { LocalFixture, LocalScenario } from '../contracts/local-principal-sandbox/v1/protocol.mjs'

export const LOCAL_PRINCIPAL_LIFECYCLE_VERSION: 'orgmaster.local-principal-lifecycle.v1'
export const LOCAL_PRINCIPAL_LIFECYCLE_PATH: '/api/local-sandbox/lifecycle'

export type LocalPrincipalLifecycleState = Pick<LocalScenario,
  'principalStatus' | 'employeeStatus' | 'accountLifecycleVersion' | 'profileVersion' | 'grants'>

export type LocalPrincipalLifecycleEvent = {
  eventVersion: typeof LOCAL_PRINCIPAL_LIFECYCLE_VERSION
  eventId: string
  sandboxId: string
  generation: string
  fixtureVersion: string
  fixtureHash: string
  principalId: string
  expectedLifecycleVersion: number
  lifecycleVersion: number
  operation: 'disable' | 'revoke' | 'grants_changed' | 'profile_changed'
  snapshotHash: string
}

export type LocalPrincipalLifecycleEventRecord = {
  event: LocalPrincipalLifecycleEvent
  stateSnapshot: LocalPrincipalLifecycleState
  eventHash: string
}

export type LocalPrincipalLifecycleBinding = { sandboxId: string; generation: string; principalId: string }
export type LocalPrincipalLifecycleProfile = {
  sandboxId: string
  generation: string
  fixture: LocalFixture
  key?: string
}
export type LocalPrincipalLifecycleQueryable = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
}

export function transitionLocalPrincipalLifecycle(
  snapshot: LocalPrincipalLifecycleState,
  operation: LocalPrincipalLifecycleEvent['operation'],
  expectedLifecycleVersion: number,
): LocalPrincipalLifecycleState
export function localPrincipalLifecycleLockKey(binding: LocalPrincipalLifecycleBinding): string
export function readCurrentLocalPrincipalLifecycleState(
  queryable: LocalPrincipalLifecycleQueryable,
  binding: LocalPrincipalLifecycleBinding,
  scenario: LocalScenario,
  profile: LocalPrincipalLifecycleProfile,
): Promise<{ state: LocalPrincipalLifecycleState; stateHash: string; lastEventId: string | null }>
export function readLocalPrincipalLifecycleEvents(
  queryable: LocalPrincipalLifecycleQueryable,
  binding: LocalPrincipalLifecycleBinding,
): Promise<LocalPrincipalLifecycleEventRecord[]>
export function sendLocalPrincipalLifecycleEvent(input: {
  config: { sandboxId: string; platformOrigin: string }
  ownerKey: string
  applicationKey: string
  event: LocalPrincipalLifecycleEvent
  fetchImpl?: typeof fetch
  now?: () => number
  makeNonce?: () => string
  timeoutMs?: number
}): Promise<{ applied: true; eventId: string; authEpoch: number }>
export function createLocalPrincipalLifecycleProducer(input: {
  pool: { connect: () => Promise<LocalPrincipalLifecycleQueryable & { release: () => void }> }
  config: { applicationId: string; sandboxId: string; platformOrigin: string; bindHost: string; databaseName: string; runtimeRole: string; databaseUrl: string }
  profile: LocalPrincipalLifecycleProfile
  ownerKey: string
  fetchImpl?: typeof fetch
  now?: () => number
  makeNonce?: () => string
}): {
  publish(input: { eventId: string; principalId: string; expectedLifecycleVersion: number; operation: LocalPrincipalLifecycleEvent['operation'] }): Promise<{
    event: LocalPrincipalLifecycleEvent
    stateSnapshot: LocalPrincipalLifecycleState
    receipt: { applied: true; eventId: string; authEpoch: number }
  }>
  readEvents(binding: LocalPrincipalLifecycleBinding): Promise<LocalPrincipalLifecycleEventRecord[]>
}
export function newLocalPrincipalLifecycleEventId(): string
