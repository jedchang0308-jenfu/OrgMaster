import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import type { ManagedDirectoryPortV1 } from './orgmasterManagedDirectoryPort'

/** The repository resolves this from its actual SESSION_USER and the owner's
 * versioned workload registry. A request body or lease label cannot supply it. */
export type ManagedIdentityWorkloadExecutor = Readonly<{
  principalId: string
  owner: 'orgmaster'
  purpose: 'managed-identity-lifecycle'
  bindingVersion: string
}>

export type RefreshClaimV2 = Readonly<{
  requestId: string
  attemptCount: number
  leaseGeneration: number
  directoryCustomerId: string
  directoryUserId: string
}>
export type LifecycleClaimV2 = Readonly<{
  eventId: string
  operationId: string
  sourceRevision: string
  snapshotHash: string
  leaseGeneration: number
}>
export type LifecycleReceiptV2 = Readonly<{
  eventId: string
  operationId: string
  sourceRevision: string
  snapshotHash: string
  receiptId: string
  deliveryPrincipalId: string
  executorPrincipalId: string
  consumerOwner: 'platform'
  principalOnly: true
}>
export type LifecycleCycleControl = Readonly<{ signal: AbortSignal; deadlineAt: number }>

/** All queue mutations verify the executor binding in their owner-local SQL
 * transaction. Claims reserve the shared + background Directory grant before
 * consuming an attempt; complete/retry use generation and lease expiry CAS.
 * Completion must atomically persist observation, audit and frozen event. */
export interface ManagedIdentityLifecycleRepositoryV2 {
  resolveExecutor(control: LifecycleCycleControl): Promise<ManagedIdentityWorkloadExecutor>
  resolveConsumer(control: LifecycleCycleControl): Promise<Readonly<{ principalId: string; owner: 'platform'; purpose: 'principal-lifecycle-invalidation'; bindingVersion: string }>>
  enqueueDue(executor: ManagedIdentityWorkloadExecutor, control: LifecycleCycleControl): Promise<void>
  // Exhausted expired leases are terminalized atomically without a grant/read.
  claimRefresh(executor: ManagedIdentityWorkloadExecutor, leaseId: string, limit: number, control: LifecycleCycleControl): Promise<{ claims: RefreshClaimV2[]; terminalized: number; retryAfterMilliseconds?: number }>
  completeRefresh(executor: ManagedIdentityWorkloadExecutor, leaseId: string, claim: RefreshClaimV2, observation: {
    directoryState: 'present' | 'suspended' | 'archived' | 'missing'
    primaryEmail: string | null
    sourceEtag: string | null
  }, control: LifecycleCycleControl): Promise<'applied' | 'superseded'>
  retryRefresh(executor: ManagedIdentityWorkloadExecutor, leaseId: string, claim: RefreshClaimV2, error: 'TIMEOUT' | 'RATE_LIMITED' | 'DIRECTORY_READ_UNAVAILABLE' | 'DIRECTORY_PERMANENT_ERROR', control: LifecycleCycleControl): Promise<'retry' | 'terminal'>
  claimLifecycle(executor: ManagedIdentityWorkloadExecutor, leaseId: string, limit: number, control: LifecycleCycleControl): Promise<LifecycleClaimV2[]>
  // Only the receipt ID crosses into completion SQL. The transaction reads the
  // Platform receipt contract and verifies event/hash/source/both executors;
  // HTTP response fields are never completion authority.
  completeLifecycle(executor: ManagedIdentityWorkloadExecutor, leaseId: string, claim: LifecycleClaimV2, receiptId: string, control: LifecycleCycleControl): Promise<void>
  retryLifecycle(executor: ManagedIdentityWorkloadExecutor, leaseId: string, claim: LifecycleClaimV2, error: 'DISPATCH_UNAVAILABLE' | 'RECEIPT_CONTRACT_INVALID' | 'COMPLETION_UNAVAILABLE', control: LifecycleCycleControl): Promise<'retry' | 'blocked'>
}

export type ManagedIdentitySyncReport = {
  executorPrincipalId: string
  directoryReads: number
  refreshApplied: number
  refreshSuperseded: number
  refreshRetried: number
  refreshTerminal: number
  lifecycleCompleted: number
  lifecycleRetried: number
  lifecycleBlocked: number
  commitFailures: number
  deadlineReached: boolean
}

export type ManagedIdentitySyncWorker = { runOnce(expectedExecutor?: ManagedIdentityWorkloadExecutor): Promise<ManagedIdentitySyncReport> }

function validGeneration(value: number) { return Number.isSafeInteger(value) && value > 0 }
function waitForQuota(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new Error('MANAGED_LIFECYCLE_DEADLINE')); return }
    const onAbort = () => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); reject(new Error('MANAGED_LIFECYCLE_DEADLINE')) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve() }, milliseconds)
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()
  })
}
function assertExecutor(value: ManagedIdentityWorkloadExecutor) {
  if (!value || value.owner !== 'orgmaster' || value.purpose !== 'managed-identity-lifecycle' ||
    !value.principalId || value.principalId.length > 255 || !/^[1-9][0-9]*$/u.test(value.bindingVersion)) {
    throw new Error('MANAGED_LIFECYCLE_EXECUTOR_INVALID')
  }
}
function validReceipt(receipt: LifecycleReceiptV2, claim: LifecycleClaimV2, executor: ManagedIdentityWorkloadExecutor, consumerPrincipalId: string) {
  return receipt?.eventId === claim.eventId && receipt.snapshotHash === claim.snapshotHash &&
    receipt.operationId === claim.operationId && receipt.sourceRevision === claim.sourceRevision &&
    receipt.deliveryPrincipalId === executor.principalId && receipt.consumerOwner === 'platform' &&
    receipt.principalOnly === true && Boolean(receipt.receiptId) && receipt.executorPrincipalId === consumerPrincipalId
}

/** No resident timer. One authenticated Scheduler request performs a bounded
 * cycle; duplicate requests are fenced by the durable owner queue contracts.
 * The strict V2 repository is required. The old optional allow-all limiter and
 * worker-label-as-actor service path are deliberately not accepted. */
export function createManagedIdentitySyncWorker(input: {
  repository: ManagedIdentityLifecycleRepositoryV2
  directory: ManagedDirectoryPortV1
  dispatch: (claim: LifecycleClaimV2, control: LifecycleCycleControl) => Promise<LifecycleReceiptV2>
  now?: () => number
}): ManagedIdentitySyncWorker {
  const now = input.now ?? (() => performance.now())
  return {
    async runOnce(expectedExecutor) {
      const started = now()
      const controller = new AbortController()
      const control = { signal: controller.signal, deadlineAt: started + 50_000 }
      const guard = () => { if (controller.signal.aborted || now() >= control.deadlineAt) throw new Error('MANAGED_LIFECYCLE_DEADLINE') }
      const invoke = async <T>(operation: () => Promise<T>): Promise<T> => { guard(); const result = await operation(); guard(); return result }
      let timer: ReturnType<typeof setTimeout> | undefined
      const deadline = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('MANAGED_LIFECYCLE_DEADLINE')) }, 50_000) })
      const cycle = async () => {
        const executor = await invoke(() => input.repository.resolveExecutor(control))
        assertExecutor(executor)
        if (expectedExecutor) {
          assertExecutor(expectedExecutor)
          if (executor.principalId !== expectedExecutor.principalId || executor.bindingVersion !== expectedExecutor.bindingVersion) {
            throw new Error('MANAGED_LIFECYCLE_CALLER_BINDING_CHANGED')
          }
        }
        const leaseId = randomUUID()
        const report: ManagedIdentitySyncReport = {
          executorPrincipalId: executor.principalId, directoryReads: 0,
          refreshApplied: 0, refreshSuperseded: 0, refreshRetried: 0, refreshTerminal: 0,
          lifecycleCompleted: 0, lifecycleRetried: 0, lifecycleBlocked: 0, commitFailures: 0, deadlineReached: false,
        }
        await invoke(() => input.repository.enqueueDue(executor, control))
        // Leave 20 seconds for delivery; each Directory adapter attempt is already
        // bounded by its whole-operation deadline. At most two run concurrently.
        while (now() - started < 30_000 && report.directoryReads < 40) {
          const limit = Math.min(2, 40 - report.directoryReads)
          const batch = await invoke(() => input.repository.claimRefresh(executor, leaseId, limit, control))
          if (!Number.isSafeInteger(batch.terminalized) || batch.terminalized < 0) throw new Error('MANAGED_REFRESH_CLAIM_INVALID')
          report.refreshTerminal += batch.terminalized
          const claims = batch.claims
          if (claims.length > limit || new Set(claims.map(c => c.requestId)).size !== claims.length ||
            claims.some(c => !c.requestId || !validGeneration(c.leaseGeneration) || !Number.isSafeInteger(c.attemptCount) || c.attemptCount < 1 || c.attemptCount > 5 || !c.directoryCustomerId || !c.directoryUserId)) {
            throw new Error('MANAGED_REFRESH_CLAIM_INVALID')
          }
          const waitMilliseconds = batch.retryAfterMilliseconds
          if (waitMilliseconds !== undefined && (!Number.isSafeInteger(waitMilliseconds) || waitMilliseconds < 1 || waitMilliseconds > 60_000 || claims.length)) throw new Error('MANAGED_REFRESH_CLAIM_INVALID')
          if (!claims.length) {
            if (waitMilliseconds === undefined || waitMilliseconds >= 30_000 - (now() - started)) break
            await invoke(() => waitForQuota(waitMilliseconds, control.signal))
            continue
          }
          await Promise.all(claims.map(async claim => {
            report.directoryReads++
            let observation: Parameters<ManagedIdentityLifecycleRepositoryV2['completeRefresh']>[3] | null = null
            let error: Parameters<ManagedIdentityLifecycleRepositoryV2['retryRefresh']>[3] = 'DIRECTORY_READ_UNAVAILABLE'
            try {
              const result = await invoke(() => input.directory.readByDirectoryKey(claim.directoryCustomerId, claim.directoryUserId))
              if (result.ok) {
                if (result.user.customerId === claim.directoryCustomerId && result.user.userId === claim.directoryUserId) {
                  observation = { directoryState: result.user.directoryState, primaryEmail: result.user.primaryEmail, sourceEtag: result.user.sourceEtag }
                } else error = 'DIRECTORY_PERMANENT_ERROR'
              } else if (result.kind === 'not_found') {
                observation = { directoryState: 'missing', primaryEmail: null, sourceEtag: null }
              } else if (result.kind !== 'retryable_error') error = 'DIRECTORY_PERMANENT_ERROR'
              else if (result.code === 'DIRECTORY_TIMEOUT') error = 'TIMEOUT'
              else if (result.code === 'DIRECTORY_RATE_LIMITED') error = 'RATE_LIMITED'
            } catch { /* Provider exceptions never erase a trusted observation. */ }
            try {
              if (observation) {
                const result = await invoke(() => input.repository.completeRefresh(executor, leaseId, claim, observation!, control))
                if (result === 'applied') report.refreshApplied++
                else if (result === 'superseded') report.refreshSuperseded++
                else throw new Error('MANAGED_REFRESH_COMPLETION_INVALID')
              } else {
                const result = await invoke(() => input.repository.retryRefresh(executor, leaseId, claim, error, control))
                if (result === 'terminal') report.refreshTerminal++
                else if (result === 'retry') report.refreshRetried++
                else throw new Error('MANAGED_REFRESH_RETRY_INVALID')
              }
            } catch { report.commitFailures++ }
          }))
        }
        let deliveries = 0
        const consumer = await invoke(() => input.repository.resolveConsumer(control))
        if (!consumer || consumer.owner !== 'platform' || consumer.purpose !== 'principal-lifecycle-invalidation' || !consumer.principalId || consumer.principalId.length > 255 || !/^[1-9][0-9]*$/u.test(consumer.bindingVersion)) throw new Error('MANAGED_LIFECYCLE_CONSUMER_INVALID')
        while (now() - started < 45_000 && deliveries < 32) {
          const limit = Math.min(2, 32 - deliveries)
          const claims = await invoke(() => input.repository.claimLifecycle(executor, leaseId, limit, control))
          if (!claims.length) break
          if (claims.length > limit || new Set(claims.map(c => c.eventId)).size !== claims.length ||
            claims.some(c => !c.eventId || !c.operationId || !c.sourceRevision || !/^[a-f0-9]{64}$/u.test(c.snapshotHash) || !validGeneration(c.leaseGeneration))) {
            throw new Error('MANAGED_LIFECYCLE_CLAIM_INVALID')
          }
          deliveries += claims.length
          await Promise.all(claims.map(async claim => {
            let failure: Parameters<ManagedIdentityLifecycleRepositoryV2['retryLifecycle']>[3] = 'DISPATCH_UNAVAILABLE'
            try {
              const receipt = await invoke(() => input.dispatch(claim, control))
              failure = 'RECEIPT_CONTRACT_INVALID'
              if (!validReceipt(receipt, claim, executor, consumer.principalId)) throw new Error('MANAGED_LIFECYCLE_RECEIPT_INVALID')
              failure = 'COMPLETION_UNAVAILABLE'
              await invoke(() => input.repository.completeLifecycle(executor, leaseId, claim, receipt.receiptId, control))
              report.lifecycleCompleted++
            } catch {
              try {
                const result = await invoke(() => input.repository.retryLifecycle(executor, leaseId, claim, failure, control))
                if (result === 'blocked') report.lifecycleBlocked++
                else if (result === 'retry') report.lifecycleRetried++
                else throw new Error('MANAGED_LIFECYCLE_RETRY_INVALID')
              }
              catch { report.commitFailures++ }
            }
          }))
        }
        report.deadlineReached = now() - started >= 45_000
        return report
      }
      try { return await Promise.race([cycle(), deadline]) }
      finally { if (timer !== undefined) clearTimeout(timer); controller.abort() }
    },
  }
}
