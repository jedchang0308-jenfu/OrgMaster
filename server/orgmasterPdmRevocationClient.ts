import { parsePdmRevocationReceipt, pdmRevocationCommand } from '../scripts/lib/orgmaster-pdm-revocation-wire.mts'
import { PLATFORM_PRINCIPAL_LIFECYCLE_ORIGIN, defaultIdTokenProvider } from './orgmasterPrincipalLifecycleClient'

export type { OrgmasterPdmRevocationOperation, OrgmasterPdmRevocationPhase, PdmRevocationReceipt } from '../scripts/lib/orgmaster-pdm-revocation-wire.mts'

const PATH = '/api/internal/pdm-session-revocation/v1'
const INVALID = 'PDM_REVOCATION_RECEIPT_INVALID'
const UNAVAILABLE = 'PDM_REVOCATION_DISPATCH_UNAVAILABLE'

export { pdmRevocationCommand }
type Command = ReturnType<typeof pdmRevocationCommand>

async function readBoundedJson(response: Response) {
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
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))) as unknown
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
    return parsePdmRevocationReceipt(await readBoundedJson(response), command)
  }

  return {
    async reconcileGlobalLogout() {
      const response = await post(PATH + '/reconcile')
      if (response.status === 404) {
        await response.body?.cancel()
        return 'route-absent' as const
      }
      const body = await readBoundedJson(response)
      if (body && typeof body === 'object') {
        if (response.status === 503 && 'code' in body && body.code === 'pdm_revocation_relay_disabled') {
          return 'relay-disabled' as const
        }
        if (response.status === 200 && 'selected' in body && 'completed' in body &&
            typeof body.selected === 'number' && Number.isSafeInteger(body.selected) &&
            body.selected >= 0 && body.selected === body.completed) return 'ready' as const
      }
      throw new Error(UNAVAILABLE)
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
