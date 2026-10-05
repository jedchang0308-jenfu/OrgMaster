import { performance } from 'node:perf_hooks'
import { GoogleAuth, JWT } from 'google-auth-library'
import type { LifecycleClaimV2, LifecycleCycleControl, LifecycleReceiptV2 } from './orgmasterManagedIdentitySync'

export const PLATFORM_PRINCIPAL_LIFECYCLE_ORIGIN = 'https://jenfu-platform-prod-9536592944.asia-east1.run.app'
const PRINCIPAL_LIFECYCLE_PATH = '/api/internal/principal-lifecycle/v2'
const REQUEST_CONTRACT = 'orgmaster.principal-lifecycle.v2'
const RECEIPT_CONTRACT = 'platform.principal-lifecycle-receipt.v2'
const MAX_RESPONSE_BYTES = 4_096
const DISPATCH_TIMEOUT_MS = 5_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const HASH = /^[0-9a-f]{64}$/u

export type PrincipalLifecycleClientErrorCode = 'claim_invalid' | 'control_invalid' | 'dispatch_deadline' | 'dispatch_aborted' | 'dispatch_unavailable' | 'receipt_invalid'

export class PrincipalLifecycleClientError extends Error {
  constructor(readonly code: PrincipalLifecycleClientErrorCode) {
    super(`PRINCIPAL_LIFECYCLE_${code.toUpperCase()}`)
    this.name = 'PrincipalLifecycleClientError'
  }
}

export type OrgmasterPrincipalLifecycleClientDependencies = Readonly<{
  tokenProvider?: (audience: string) => Promise<string>
  fetch?: typeof fetch
  now?: () => number
}>

async function defaultIdTokenProvider(audience: string): Promise<string> {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() || process.env.google_application_credentials?.trim()) {
    throw new PrincipalLifecycleClientError('dispatch_unavailable')
  }
  const auth = new GoogleAuth()
  const sourceClient = await auth.getClient()
  const credentialType = (sourceClient as typeof sourceClient & { credentials?: { type?: unknown } }).credentials?.type
  if (sourceClient instanceof JWT || credentialType === 'service_account' ||
    !('fetchIdToken' in sourceClient) || typeof sourceClient.fetchIdToken !== 'function') {
    throw new PrincipalLifecycleClientError('dispatch_unavailable')
  }
  const client = await auth.getIdTokenClient(audience)
  return client.idTokenProvider.fetchIdToken(audience)
}

function validClaim(claim: LifecycleClaimV2) {
  return Boolean(claim) && UUID.test(claim.eventId) &&
    typeof claim.operationId === 'string' && claim.operationId.length > 0 && claim.operationId.length <= 255 &&
    typeof claim.sourceRevision === 'string' && claim.sourceRevision.length > 0 && claim.sourceRevision.length <= 255 &&
    HASH.test(claim.snapshotHash) && Number.isSafeInteger(claim.leaseGeneration) && claim.leaseGeneration > 0
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key))
}

function parseReceipt(value: unknown, claim: LifecycleClaimV2): LifecycleReceiptV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PrincipalLifecycleClientError('receipt_invalid')
  const receipt = value as Record<string, unknown>
  const keys = ['contractVersion', 'receiptId', 'eventId', 'operationId', 'sourceRevision', 'snapshotHash', 'deliveryPrincipalId', 'executorPrincipalId', 'consumerOwner', 'principalOnly']
  if (!exactKeys(receipt, keys) || receipt.contractVersion !== RECEIPT_CONTRACT ||
    typeof receipt.receiptId !== 'string' || !UUID.test(receipt.receiptId) ||
    receipt.eventId !== claim.eventId || !UUID.test(String(receipt.eventId)) ||
    receipt.operationId !== claim.operationId || typeof receipt.operationId !== 'string' || !receipt.operationId ||
    receipt.sourceRevision !== claim.sourceRevision || typeof receipt.sourceRevision !== 'string' || !receipt.sourceRevision ||
    receipt.snapshotHash !== claim.snapshotHash || typeof receipt.snapshotHash !== 'string' || !HASH.test(receipt.snapshotHash) ||
    typeof receipt.deliveryPrincipalId !== 'string' || !receipt.deliveryPrincipalId || receipt.deliveryPrincipalId.length > 255 ||
    typeof receipt.executorPrincipalId !== 'string' || !receipt.executorPrincipalId || receipt.executorPrincipalId.length > 255 ||
    receipt.consumerOwner !== 'platform' || receipt.principalOnly !== true) {
    throw new PrincipalLifecycleClientError('receipt_invalid')
  }
  return {
    eventId: receipt.eventId,
    operationId: receipt.operationId,
    sourceRevision: receipt.sourceRevision,
    snapshotHash: receipt.snapshotHash,
    receiptId: receipt.receiptId,
    deliveryPrincipalId: receipt.deliveryPrincipalId,
    executorPrincipalId: receipt.executorPrincipalId,
    consumerOwner: 'platform',
    principalOnly: true,
  }
}

async function readBoundedResponse(response: Response, guard: () => void, wait: <T>(operation: Promise<T>) => Promise<T>) {
  const lengthHeader = response.headers.get('content-length')
  if (lengthHeader && /^\d+$/u.test(lengthHeader) && Number(lengthHeader) > MAX_RESPONSE_BYTES) {
    throw new PrincipalLifecycleClientError('receipt_invalid')
  }
  if (!response.body) throw new PrincipalLifecycleClientError('receipt_invalid')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      guard()
      const item = await wait(reader.read())
      guard()
      if (item.done) break
      total += item.value.byteLength
      if (total > MAX_RESPONSE_BYTES) {
        void reader.cancel().catch(() => undefined)
        throw new PrincipalLifecycleClientError('receipt_invalid')
      }
      chunks.push(item.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch { throw new PrincipalLifecycleClientError('receipt_invalid') }
}

export function createOrgmasterPrincipalLifecycleClient(dependencies: OrgmasterPrincipalLifecycleClientDependencies = {}) {
  const tokenProvider = dependencies.tokenProvider ?? defaultIdTokenProvider
  const fetchImpl = dependencies.fetch ?? fetch
  const now = dependencies.now ?? (() => performance.now())
  const endpoint = `${PLATFORM_PRINCIPAL_LIFECYCLE_ORIGIN}${PRINCIPAL_LIFECYCLE_PATH}`

  return Object.freeze({
    async dispatch(claim: LifecycleClaimV2, control: LifecycleCycleControl): Promise<LifecycleReceiptV2> {
      if (!validClaim(claim)) throw new PrincipalLifecycleClientError('claim_invalid')
      if (!control || !control.signal || typeof control.signal.aborted !== 'boolean' ||
        typeof control.signal.addEventListener !== 'function' || !Number.isFinite(control.deadlineAt)) {
        throw new PrincipalLifecycleClientError('control_invalid')
      }
      const started = now()
      const deadlineAt = Math.min(control.deadlineAt, started + DISPATCH_TIMEOUT_MS)
      const remaining = deadlineAt - started
      if (control.signal.aborted) throw new PrincipalLifecycleClientError('dispatch_aborted')
      if (!Number.isFinite(started) || remaining <= 0) throw new PrincipalLifecycleClientError('dispatch_deadline')

      const controller = new AbortController()
      let rejectDeadline: (reason: unknown) => void = () => undefined
      let rejectAbort: (reason: unknown) => void = () => undefined
      const deadlinePromise = new Promise<never>((_resolve, reject) => { rejectDeadline = reject })
      const abortPromise = new Promise<never>((_resolve, reject) => { rejectAbort = reject })
      const abortChild = () => controller.abort()
      const onParentAbort = () => {
        abortChild()
        rejectAbort(new PrincipalLifecycleClientError('dispatch_aborted'))
      }
      control.signal.addEventListener('abort', onParentAbort, { once: true })
      const timer = setTimeout(() => {
        abortChild()
        rejectDeadline(new PrincipalLifecycleClientError('dispatch_deadline'))
      }, remaining)
      const guard = () => {
        if (control.signal.aborted) throw new PrincipalLifecycleClientError('dispatch_aborted')
        if (controller.signal.aborted || now() >= deadlineAt) throw new PrincipalLifecycleClientError('dispatch_deadline')
      }
      const wait = <T>(operation: Promise<T>) => Promise.race([operation, deadlinePromise, abortPromise])

      try {
        guard()
        const token = await wait(Promise.resolve().then(() => tokenProvider(PLATFORM_PRINCIPAL_LIFECYCLE_ORIGIN)))
        guard()
        if (typeof token !== 'string' || !/^[A-Za-z0-9._~-]+$/u.test(token)) throw new PrincipalLifecycleClientError('dispatch_unavailable')
        const body = JSON.stringify({ contractVersion: REQUEST_CONTRACT, eventId: claim.eventId, snapshotHash: claim.snapshotHash })
        guard()
        const response = await wait(fetchImpl(endpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body,
          signal: controller.signal,
          redirect: 'error',
        }))
        guard()
        if (!response.ok) throw new PrincipalLifecycleClientError('dispatch_unavailable')
        const raw = await readBoundedResponse(response, guard, wait)
        guard()
        let value: unknown
        try { value = JSON.parse(raw) } catch { throw new PrincipalLifecycleClientError('receipt_invalid') }
        const receipt = parseReceipt(value, claim)
        guard()
        return receipt
      } catch (error) {
        if (error instanceof PrincipalLifecycleClientError) throw error
        if (control.signal.aborted) throw new PrincipalLifecycleClientError('dispatch_aborted')
        if (controller.signal.aborted || now() >= deadlineAt) throw new PrincipalLifecycleClientError('dispatch_deadline')
        throw new PrincipalLifecycleClientError('dispatch_unavailable')
      } finally {
        clearTimeout(timer)
        control.signal.removeEventListener('abort', onParentAbort)
      }
    },
  })
}
