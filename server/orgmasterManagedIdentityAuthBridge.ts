import type { VerifiedFirebaseIdentity } from './orgmasterFirebaseIdentityProvider'
import type { ManagedDirectoryPortV1 } from './orgmasterManagedDirectoryPort'
import type { ManagedIdentityServiceV1 } from './orgmasterManagedIdentityService'

export class ManagedIdentityAuthBridgeError extends Error {
  constructor(public readonly code: 'LOGIN_NOT_AVAILABLE' | 'AUTH_PROVIDER_REQUIRED' | 'AUTH_EMAIL_UNVERIFIED') { super(code) }
}

export function createManagedIdentityAuthBridge(input: { service: ManagedIdentityServiceV1; directory: ManagedDirectoryPortV1 }) {
  return {
    async resolve(identity: VerifiedFirebaseIdentity) {
      const signInProvider = identity.signInProvider ?? ''
      const email = identity.email ?? ''
      if (signInProvider !== 'google.com') throw new ManagedIdentityAuthBridgeError('AUTH_PROVIDER_REQUIRED')
      if (!identity.emailVerified || !email) throw new ManagedIdentityAuthBridgeError('AUTH_EMAIL_UNVERIFIED')
      try { return await input.service.resolveFirebaseIdentity({ issuer: identity.issuer, subject: identity.subject, email, signInProvider, emailVerified: true }) }
      catch { throw new ManagedIdentityAuthBridgeError('LOGIN_NOT_AVAILABLE') }
    },
  }
}
