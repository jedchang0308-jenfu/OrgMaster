import { createHash } from 'node:crypto'
import { PLATFORM_PRINCIPAL_LIFECYCLE_ORIGIN, defaultIdTokenProvider } from './orgmasterPrincipalLifecycleClient'

export type OrgmasterPdmRevocationPhase = 'prepare' | 'published' | 'cancelled'
export type OrgmasterPdmRevocationOperation = {
  operationId: string
  baselineVersion: string
  publicationVersion: string
  principalIds: string[]
}
export type PdmRevocationReceipt = {
  contractVersion: 'ai-pdm.session-revocation-receipt.v1'
  eventId: string
  operationId: string
  phase: OrgmasterPdmRevocationPhase
  digest: string
  receiptId: string
  appliedAt: string
}

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u
const OPAQUE = /^[A-Za-z0-9._:@/-]{1,255}$/u
const PATH = '/api/internal/pdm-session-revocation/v1'
const INVALID = 'PDM_REVOCATION_RECEIPT_INVALID'
const UNAVAILABLE = 'PDM_REVOCATION_DISPATCH_UNAVAILABLE'

export function pdmRevocationCommand(operation: OrgmasterPdmRevocationOperation, eventId: string, phase: OrgmasterPdmRevocationPhase) {
  const { operationId, baselineVersion, publicationVersion, principalIds } = operation
  if (!UUID.test(operationId) || !UUID.test(eventId) || !OPAQUE.test(baselineVersion)
    || !OPAQUE.test(publicationVersion) || baselineVersion === publicationVersion
    || principalIds.length === 0 || principalIds.length > 4096
    || principalIds.some((id, i) => !OPAQUE.test(id) || (i > 0 && principalIds[i - 1] >= id))) {
    throw new Error('PDM_REVOCATION_COMMAND_INVALID')
  }
  const contractVersion = 'jenfu.pdm-session-revocation.v1'
  const sourceApp = 'orgmaster'
  const targetApp = 'ai-pdm'
  const sourceEpoch = null
  const revokedBefore = null
  const digest = createHash('sha256').update(JSON.stringify([
    contractVersion, sourceApp, targetApp, eventId, operationId, phase,
    baselineVersion, publicationVersion, principalIds, sourceEpoch, revokedBefore,
  ])).digest('hex')
  const command = { contractVersion, sourceApp, targetApp, eventId, operationId, phase,
    baselineVersion, publicationVersion, principalIds, sourceEpoch, revokedBefore, digest } as const
  if (Buffer.byteLength(JSON.stringify(command)) > 1024 * 1024) throw new Error('PDM_REVOCATION_COMMAND_INVALID')
  return command
}

type Command = ReturnType<typeof pdmRevocationCommand>

function parseReceipt(value: unknown, command: Command): PdmRevocationReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(INVALID)
  const row = value as Record<string, unknown>
  if (Object.keys(row).length !== 7 || row.contractVersion !== 'ai-pdm.session-revocation-receipt.v1'
    || row.eventId !== command.eventId || row.operationId !== command.operationId
    || row.phase !== command.phase || row.digest !== command.digest
    || typeof row.receiptId !== 'string' || !UUID.test(row.receiptId)
    || typeof row.appliedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(row.appliedAt)
    || !Number.isFinite(Date.parse(row.appliedAt))
    || new Date(row.appliedAt).toISOString() !== row.appliedAt) throw new Error(INVALID)
  return row as PdmRevocationReceipt
}

async function readReceipt(response: Response, command: Command) {
  if (response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json'
    || !response.body) throw new Error(INVALID)
  const chunks: Uint8Array[] = []
  let length = 0
  const reader = response.body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > 4096) {
        void reader.cancel().catch(() => undefined)
        throw new Error(INVALID)
      }
      chunks.push(value)
    }
    return parseReceipt(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))), command)
  } catch {
    throw new Error(INVALID)
  } finally {
    reader.releaseLock()
  }
}

export function createOrgmasterPdmRevocationClient(dependencies: {
  tokenProvider?: (audience: string) => Promise<string>
  fetch?: typeof fetch
  local?: boolean
} = {}) {
  if (dependencies.local && !dependencies.tokenProvider) throw new Error(UNAVAILABLE)
  const origin = dependencies.local ? 'http://localhost:1000' : PLATFORM_PRINCIPAL_LIFECYCLE_ORIGIN
  const tokenProvider = dependencies.tokenProvider ?? defaultIdTokenProvider
  const fetchImpl = dependencies.fetch ?? fetch

  async function post(path: string, body?: string) {
    const signal = AbortSignal.timeout(5_000)
    const token = await new Promise<string>((resolve, reject) => {
      const onAbort = () => reject(new Error(UNAVAILABLE))
      signal.addEventListener('abort', onAbort, { once: true })
      void Promise.resolve().then(() => tokenProvider(origin)).then(resolve, reject)
        .finally(() => signal.removeEventListener('abort', onAbort))
    })
    if (!/^[A-Za-z0-9._~-]+$/u.test(token)) throw new Error(UNAVAILABLE)
    return fetchImpl(origin + path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
      redirect: 'error',
      signal,
    })
  }

  async function request(command: Command, readback: boolean) {
    const response = await post(PATH + (readback ? '/readback' : ''), JSON.stringify(command))
    if (readback && response.status === 404) return null
    if (response.status !== 200) throw new Error(response.status === 409 ? 'PDM_REVOCATION_EVENT_CONFLICT' : UNAVAILABLE)
    return readReceipt(response, command)
  }

  return {
    async reconcileGlobalLogout() {
      const response = await post(PATH + '/reconcile')
      await response.body?.cancel()
      if (response.status !== 200) throw new Error(UNAVAILABLE)
    },
    readback(command: Command) { return request(command, true) },
    async dispatch(command: Command) {
      // Stable IDs and a durable caller record permit every attempt to start
      // with readback, including retries after a worker or an HTTP response was lost.
      const prior = await request(command, true)
      if (prior) return prior
      try {
        const receipt = await request(command, false)
        if (!receipt) throw new Error(INVALID)
        return receipt
      } catch (error) {
        const committed = await request(command, true)
        if (committed) return committed
        throw error
      }
    },
  }
}
