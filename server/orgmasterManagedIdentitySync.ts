import type { ManagedIdentityRefreshClaimV1 } from '../src/managedIdentity/types'
import type { ManagedDirectoryPortV1 } from './orgmasterManagedDirectoryPort'
import type { ManagedIdentityServiceV1 } from './orgmasterManagedIdentityService'

export type ManagedIdentitySyncReport = {
  claimed: number
  completed: number
  retried: number
  terminal: number
  skippedBudget: number
  readCount: number
  writeCount: 0
}

export type ManagedIdentitySyncWorker = { runOnce(): Promise<ManagedIdentitySyncReport> }

function errorCode(result: { ok: false; code: string }) {
  if (result.code === 'DIRECTORY_RATE_LIMITED') return 'RATE_LIMITED'
  if (result.code === 'DIRECTORY_TIMEOUT') return 'TIMEOUT'
  return 'DIRECTORY_READ_UNAVAILABLE'
}

export function createManagedIdentitySyncWorker(input: {
  service: ManagedIdentityServiceV1
  directory: ManagedDirectoryPortV1
  workerId: string
  limit?: number
  leaseSeconds?: number
  reserveRead?: () => Promise<{ allowed: boolean; retryAt?: string | null }>
}): ManagedIdentitySyncWorker {
  const reserveRead = input.reserveRead ?? (async () => ({ allowed: true, retryAt: null }))
  return {
    async runOnce() {
      const claims = await input.service.claimRefresh(input.workerId, input.limit ?? 2, input.leaseSeconds ?? 30)
      const report: ManagedIdentitySyncReport = { claimed: claims.length, completed: 0, retried: 0, terminal: 0, skippedBudget: 0, readCount: 0, writeCount: 0 }
      for (const claim of claims) {
        if (claim.claimKind === 'terminal_due') {
          try {
            const terminal = await input.service.retryRefresh({ requestId: claim.requestId, workerId: input.workerId, leaseVersion: claim.leaseVersion, errorCode: 'LEASE_EXHAUSTED' })
            if (terminal.disposition === 'terminal') report.terminal += 1
          } catch { report.terminal += 1 }
          continue
        }
        const budget = await reserveRead()
        if (!budget.allowed) { report.skippedBudget += 1; continue }
        report.readCount += 1
        const result = await input.directory.readByDirectoryKey(claim.directoryCustomerId, claim.directoryUserId)
        if (result.ok) {
          try { await input.service.completeRefresh({ requestId: claim.requestId, workerId: input.workerId, leaseVersion: claim.leaseVersion, directoryCustomerId: result.user.customerId, directoryUserId: result.user.userId, directoryState: result.user.directoryState, primaryEmail: result.user.primaryEmail, sourceEtag: result.user.sourceEtag, adapterOutcome: 'success' }); report.completed += 1 } catch { report.retried += 1 }
        } else if (result.kind === 'not_found') {
          try { await input.service.completeRefresh({ requestId: claim.requestId, workerId: input.workerId, leaseVersion: claim.leaseVersion, directoryCustomerId: claim.directoryCustomerId, directoryUserId: claim.directoryUserId, directoryState: 'missing', primaryEmail: null, sourceEtag: null, adapterOutcome: 'not_found' }); report.completed += 1 } catch { report.retried += 1 }
        } else {
          try { const retry = await input.service.retryRefresh({ requestId: claim.requestId, workerId: input.workerId, leaseVersion: claim.leaseVersion, errorCode: errorCode(result) }); retry.disposition === 'terminal' ? report.terminal += 1 : report.retried += 1 } catch { report.retried += 1 }
        }
      }
      return report
    },
  }
}

export function refreshClaimsForTesting(claims: ManagedIdentityRefreshClaimV1[]) {
  return claims.map((claim) => `${claim.requestId}:${claim.requestSequence}:${claim.attemptCount}`).join('|')
}
