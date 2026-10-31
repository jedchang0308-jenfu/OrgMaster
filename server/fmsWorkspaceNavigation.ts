import { isIP } from 'node:net'

/** Return through the already configured Platform entry; the request supplies no destination. */
export function financialWorkspaceReturnUrl(environment: NodeJS.ProcessEnv = process.env): string | null {
  const sandbox = environment.JENFU_LOCAL_SANDBOX_ENABLED === '1'
  const development = environment.NODE_ENV === 'development' || environment.NODE_ENV === 'test'
  if (sandbox && (!development || environment.K_SERVICE)) return null
  if (!sandbox && environment.ORGMASTER_JENFU_SSO_HANDOFF_MODE !== 'on') return null
  const raw = (sandbox ? environment.JENFU_LOCAL_SANDBOX_PLATFORM_ORIGIN : environment.ORGMASTER_JENFU_SSO_BROKER_ORIGIN)?.trim()
  if (!raw) return null
  try {
    const origin = new URL(raw)
    const hostname = origin.hostname.replace(/^\[|\]$/gu, '').toLowerCase()
    const loopback = hostname === 'localhost' || hostname === '::1' || (isIP(hostname) === 4 && hostname.startsWith('127.'))
    if (raw !== origin.origin || origin.username || origin.password
      || origin.protocol !== 'https:' && !(development && origin.protocol === 'http:' && loopback)
      || sandbox && !loopback) return null
    return new URL('/api/apps/financial-management-system/launch', origin).href
  } catch { return null }
}
