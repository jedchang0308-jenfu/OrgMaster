import { PLATFORM_PRINCIPAL_LIFECYCLE_ORIGIN, defaultIdTokenProvider } from './orgmasterPrincipalLifecycleClient'

export type RevocationTransportDependencies = {
  tokenProvider?: (audience: string) => Promise<string>
  fetch?: typeof fetch
  local?: boolean
}

export function createOrgmasterRevocationTransport<Command, Receipt>(options: {
  path: string
  invalidReceipt: string
  unavailable: string
  conflict: string
  parseReceipt: (value: unknown, command: Command) => Receipt
}, dependencies: RevocationTransportDependencies) {
  const { path, invalidReceipt, unavailable, conflict, parseReceipt } = options
  if (dependencies.local && !dependencies.tokenProvider) throw new Error(unavailable)
  const origin = dependencies.local ? 'http://localhost:1000' : PLATFORM_PRINCIPAL_LIFECYCLE_ORIGIN
  const tokenProvider = dependencies.tokenProvider ?? defaultIdTokenProvider
  const fetchImpl = dependencies.fetch ?? fetch

  async function post(endpoint: string, body?: string) {
    const signal = AbortSignal.timeout(5_000)
    const token = await new Promise<string>((resolve, reject) => {
      const onAbort = () => reject(new Error(unavailable))
      signal.addEventListener('abort', onAbort, { once: true })
      void Promise.resolve().then(() => tokenProvider(origin)).then(resolve, reject)
        .finally(() => signal.removeEventListener('abort', onAbort))
    })
    if (!/^[A-Za-z0-9._~-]+$/u.test(token)) throw new Error(unavailable)
    return fetchImpl(origin + endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
      redirect: 'error',
      signal,
    })
  }

  async function readBoundedJson(response: Response) {
    if (response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json'
      || !response.body) throw new Error(invalidReceipt)
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
          throw new Error(invalidReceipt)
        }
        chunks.push(value)
      }
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))) as unknown
    } catch {
      throw new Error(invalidReceipt)
    } finally {
      reader.releaseLock()
    }
  }

  async function request(command: Command, readback: boolean) {
    const response = await post(path + (readback ? '/readback' : ''), JSON.stringify(command))
    if (response.status !== 200) {
      void response.body?.cancel().catch(() => undefined)
      if (readback && response.status === 404) return null
      throw new Error(response.status === 409 ? conflict : unavailable)
    }
    return parseReceipt(await readBoundedJson(response), command)
  }

  return {
    post,
    readBoundedJson,
    readback(command: Command) { return request(command, true) },
    async dispatch(command: Command) {
      // Keep one frozen command throughout recovery from an unknown response.
      const prior = await request(command, true)
      if (prior) return prior
      try {
        const receipt = await request(command, false)
        if (!receipt) throw new Error(invalidReceipt)
        return receipt
      } catch (error) {
        const committed = await request(command, true)
        if (committed) return committed
        throw error
      }
    },
  }
}
