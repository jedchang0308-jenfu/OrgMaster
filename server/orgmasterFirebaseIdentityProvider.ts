import { applicationDefault, getApps, initializeApp, type Credential } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import type { GoogleAuth } from 'google-auth-library'

export type VerifiedFirebaseIdentity = {
  issuer: string
  subject: string
  assuranceLevel: 'aal1' | 'aal2'
  authenticatedAt: string | null
  signInProvider?: string
  email?: string | null
  emailVerified?: boolean
  googleUserId?: string
}

export type FirebaseIdentityProvider = {
  verifyIdToken(idToken: string): Promise<VerifiedFirebaseIdentity>
}

type UserAdcAccount = { disabled: boolean; email: string | null; emailVerified: boolean; validSinceSeconds: number }

export async function readFirebaseAccountWithUserAdc(input:{projectId:string;subject:string;sourceAuth:GoogleAuth;fetchImpl?:typeof fetch}):Promise<UserAdcAccount>{
  const client=await input.sourceAuth.getClient(),access=await client.getAccessToken()
  const accessToken=typeof access==='string'?access:access?.token
  if(!accessToken)throw new Error('Firebase user ADC access token is unavailable.')
  const response=await (input.fetchImpl??fetch)(`https://identitytoolkit.googleapis.com/v1/projects/${input.projectId}/accounts:lookup`,{
    method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json','x-goog-user-project':input.projectId},
    body:JSON.stringify({localId:[input.subject]}),
  })
  if(!response.ok)throw new Error('Firebase user ADC account lookup failed.')
  const body=await response.json() as {users?:Array<{disabled?:boolean;email?:string;emailVerified?:boolean;localId?:string;validSince?:string}>}
  const user=body.users?.[0],validSinceSeconds=Number(user?.validSince??'0')
  if(!user||user.localId!==input.subject||!Number.isSafeInteger(validSinceSeconds)||validSinceSeconds<0)throw new Error('Firebase user ADC account lookup mismatch.')
  return {disabled:user.disabled===true,email:typeof user.email==='string'?user.email.trim().toLowerCase():null,emailVerified:user.emailVerified===true,validSinceSeconds}
}

export function createFirebaseIdentityProvider(expectedIssuer: string, expectedAudience: string, local?:{credential:Credential;appName:string;userAdc?:{projectId:string;sourceAuth:GoogleAuth}}): FirebaseIdentityProvider {
  const app = local
    ? getApps().find(app=>app.name===local.appName)??initializeApp({credential:local.credential,projectId:expectedAudience},local.appName)
    : getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: expectedAudience })
  return {
    async verifyIdToken(idToken) {
      const decoded = await getAuth(app).verifyIdToken(idToken, !local?.userAdc)
      if (decoded.iss !== expectedIssuer || decoded.aud !== expectedAudience || !decoded.sub || decoded.sub !== decoded.uid) {
        throw new Error('Firebase token identity contract mismatch.')
      }
      const firebaseClaims = decoded.firebase as (typeof decoded.firebase & { sign_in_second_factor?: string }) | undefined
      const authenticationMethods = Array.isArray(decoded.amr) ? decoded.amr : []
      const googleIdentities = firebaseClaims?.identities?.['google.com']
      const googleUserId = Array.isArray(googleIdentities) && googleIdentities.length === 1 && typeof googleIdentities[0] === 'string' && googleIdentities[0].trim() ? googleIdentities[0].trim() : undefined
      if(local?.userAdc){
        if(local.userAdc.projectId!==expectedAudience)throw new Error('Firebase user ADC project mismatch.')
        const account=await readFirebaseAccountWithUserAdc({projectId:local.userAdc.projectId,subject:decoded.sub,sourceAuth:local.userAdc.sourceAuth})
        const email=typeof decoded.email==='string'?decoded.email.trim().toLowerCase():null
        if(account.disabled||!account.emailVerified||account.email!==email||!Number.isSafeInteger(decoded.auth_time)||account.validSinceSeconds>decoded.auth_time)throw new Error('Firebase user ADC account state rejects the token.')
      }
      return {
        issuer: decoded.iss,
        subject: decoded.sub,
        assuranceLevel: firebaseClaims?.sign_in_second_factor || authenticationMethods.includes('mfa') ? 'aal2' : 'aal1',
        authenticatedAt: typeof decoded.auth_time === 'number' && Number.isFinite(decoded.auth_time) && decoded.auth_time > 0
          ? new Date(decoded.auth_time * 1000).toISOString()
          : null,
        signInProvider: typeof firebaseClaims?.sign_in_provider === 'string' ? firebaseClaims.sign_in_provider : undefined,
        email: typeof decoded.email === 'string' ? decoded.email.trim().toLowerCase() : null,
        emailVerified: decoded.email_verified === true,
        googleUserId,
      }
    },
  }
}
