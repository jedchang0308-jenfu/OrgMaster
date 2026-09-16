import { describe, expect, it } from 'vitest'
import { readOrgmasterAuthConfig } from './orgmasterAuthConfig'

function validEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    ORGMASTER_PUBLIC_BASE_URL: 'http://localhost:5000',
    ORGMASTER_POSTGRES_URL: 'postgres://test',
    ORGMASTER_SESSION_HASH_PEPPER: 'p'.repeat(32),
    JENFU_FIREBASE_PROJECT_ID: 'jenfu-test',
    JENFU_IDENTITY_ISSUER: 'https://securetoken.google.com/jenfu-test',
    JENFU_IDENTITY_AUDIENCE: 'jenfu-test',
    VITE_JENFU_FIREBASE_API_KEY: 'public-key',
    VITE_JENFU_FIREBASE_AUTH_DOMAIN: 'jenfu-test.firebaseapp.com',
    VITE_JENFU_FIREBASE_PROJECT_ID: 'jenfu-test',
    VITE_JENFU_FIREBASE_APP_ID: 'app-id',
  }
}

describe('OrgMaster auth configuration', () => {
  it('accepts the fixed local bare origin', () => {
    expect(readOrgmasterAuthConfig(validEnvironment())).toMatchObject({ configured: true })
  })

  it.each([
    'http://localhost:5000/',
    'http://localhost:5000/auth',
    'http://localhost:5000?source=test',
    'http://localhost:5000#fragment',
    'http://user:pass@localhost:5000',
  ])('rejects a non-origin ORGMASTER_PUBLIC_BASE_URL: %s', (publicBaseUrl) => {
    const environment = validEnvironment()
    environment.ORGMASTER_PUBLIC_BASE_URL = publicBaseUrl
    expect(readOrgmasterAuthConfig(environment)).toMatchObject({
      configured: false,
      reason: expect.stringContaining('bare origin'),
    })
  })
})
