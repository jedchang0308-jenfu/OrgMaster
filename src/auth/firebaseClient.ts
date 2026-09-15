import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth, inMemoryPersistence, setPersistence, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth'
import type { AuthMode } from './authApiClient'

function firebaseAuth(config: AuthMode['firebase']) {
  const app = getApps().length ? getApp() : initializeApp(config)
  return getAuth(app)
}

export async function getFirebaseIdToken(config: AuthMode['firebase'], email: string, password: string) {
  const auth = firebaseAuth(config)
  const credential = await signInWithEmailAndPassword(auth, email, password)
  return credential.user.getIdToken(true)
}

export async function clearFirebaseClientSession(config: AuthMode['firebase']) {
  await signOut(firebaseAuth(config))
}

export async function getFirebaseGoogleIdToken(config: AuthMode['firebase'], loginHint?: string) {
  const auth = firebaseAuth(config)
  await setPersistence(auth, inMemoryPersistence)
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ ...(loginHint ? { login_hint: loginHint } : {}), prompt: 'select_account' })
  const credential = await signInWithPopup(auth, provider)
  return credential.user.getIdToken(true)
}
