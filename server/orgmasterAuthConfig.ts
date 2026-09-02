import { isIP } from 'node:net'

export const ORGMASTER_SESSION_COOKIE = 'orgmaster_session'
export const ORGMASTER_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60

export type OrgmasterFirebasePublicConfig = {
  apiKey: string
  authDomain: string
  projectId: string
  appId: string
}

export type OrgmasterAuthConfig = {
  publicBaseUrl: URL
  postgresUrl: string
  sessionHashPepper: string
  firebaseProjectId: string
  identityIssuer: string
  identityAudience: string
  firebasePublicConfig: OrgmasterFirebasePublicConfig
  secureCookie: boolean
}

export type OrgmasterAuthConfigResult =
  | { configured: true; config: OrgmasterAuthConfig }
  | { configured: false; missing: string[]; reason: string }

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1' || (isIP(normalized) === 4 && normalized.startsWith('127.'))
}

export function readOrgmasterAuthConfig(environment: NodeJS.ProcessEnv = process.env): OrgmasterAuthConfigResult {
  const names = [
    'ORGMASTER_PUBLIC_BASE_URL',
    'ORGMASTER_POSTGRES_URL',
    'ORGMASTER_SESSION_HASH_PEPPER',
    'JENFU_FIREBASE_PROJECT_ID',
    'JENFU_IDENTITY_ISSUER',
    'JENFU_IDENTITY_AUDIENCE',
    'VITE_JENFU_FIREBASE_API_KEY',
    'VITE_JENFU_FIREBASE_AUTH_DOMAIN',
    'VITE_JENFU_FIREBASE_PROJECT_ID',
    'VITE_JENFU_FIREBASE_APP_ID',
  ] as const
  const missing = names.filter((name) => !environment[name]?.trim())
  if (missing.length) return { configured: false, missing, reason: 'Required authentication configuration is missing.' }

  let publicBaseUrl: URL
  try {
    publicBaseUrl = new URL(environment.ORGMASTER_PUBLIC_BASE_URL!)
  } catch {
    return { configured: false, missing: [], reason: 'ORGMASTER_PUBLIC_BASE_URL must be an absolute URL.' }
  }

  const projectId = environment.JENFU_FIREBASE_PROJECT_ID!.trim()
  const expectedIssuer = `https://securetoken.google.com/${projectId}`
  if (environment.JENFU_IDENTITY_ISSUER!.trim() !== expectedIssuer
    || environment.JENFU_IDENTITY_AUDIENCE!.trim() !== projectId
    || environment.VITE_JENFU_FIREBASE_PROJECT_ID!.trim() !== projectId) {
    return { configured: false, missing: [], reason: 'Firebase issuer, audience and public project ID must identify the same project.' }
  }

  const localInsecureAllowed = (environment.NODE_ENV === 'development' || environment.NODE_ENV === 'test')
    && publicBaseUrl.protocol === 'http:'
    && isLoopbackHostname(publicBaseUrl.hostname)
  if (publicBaseUrl.protocol !== 'https:' && !localInsecureAllowed) {
    return { configured: false, missing: [], reason: 'Authentication requires HTTPS outside an explicit loopback development or test runtime.' }
  }

  return {
    configured: true,
    config: {
      publicBaseUrl,
      postgresUrl: environment.ORGMASTER_POSTGRES_URL!,
      sessionHashPepper: environment.ORGMASTER_SESSION_HASH_PEPPER!,
      firebaseProjectId: projectId,
      identityIssuer: expectedIssuer,
      identityAudience: projectId,
      firebasePublicConfig: {
        apiKey: environment.VITE_JENFU_FIREBASE_API_KEY!,
        authDomain: environment.VITE_JENFU_FIREBASE_AUTH_DOMAIN!,
        projectId,
        appId: environment.VITE_JENFU_FIREBASE_APP_ID!,
      },
      secureCookie: !localInsecureAllowed,
    },
  }
}

export function requireOrgmasterAuthConfig(environment: NodeJS.ProcessEnv = process.env) {
  const result = readOrgmasterAuthConfig(environment)
  if (!result.configured) throw new Error(`OrgMaster auth preflight failed: ${result.reason}${result.missing.length ? ` Missing: ${result.missing.join(', ')}` : ''}`)
  return result.config
}
