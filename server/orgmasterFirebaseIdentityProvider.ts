import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

export type VerifiedFirebaseIdentity = {
  issuer: string
  subject: string
  assuranceLevel: 'aal1' | 'aal2'
}

export type FirebaseIdentityProvider = {
  verifyIdToken(idToken: string): Promise<VerifiedFirebaseIdentity>
}

export function createFirebaseIdentityProvider(expectedIssuer: string, expectedAudience: string): FirebaseIdentityProvider {
  const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: expectedAudience })
  return {
    async verifyIdToken(idToken) {
      const decoded = await getAuth(app).verifyIdToken(idToken, true)
      if (decoded.iss !== expectedIssuer || decoded.aud !== expectedAudience || !decoded.sub || decoded.sub !== decoded.uid) {
        throw new Error('Firebase token identity contract mismatch.')
      }
      const firebaseClaims = decoded.firebase as (typeof decoded.firebase & { sign_in_second_factor?: string }) | undefined
      const authenticationMethods = Array.isArray(decoded.amr) ? decoded.amr : []
      return {
        issuer: decoded.iss,
        subject: decoded.sub,
        assuranceLevel: firebaseClaims?.sign_in_second_factor || authenticationMethods.includes('mfa') ? 'aal2' : 'aal1',
      }
    },
  }
}
