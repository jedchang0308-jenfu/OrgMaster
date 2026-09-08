import { getApp, getApps, initializeApp } from 'firebase/app'
import {
  getAuth,
  inMemoryPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import type { AuthMode } from './authApiClient'

function firebaseAuth(config: AuthMode['firebase']) {
  const app = getApps().length ? getApp() : initializeApp(config)
  return getAuth(app)
}

export async function getFirebaseIdToken(config: AuthMode['firebase'], email: string, password: string) {
  const auth = firebaseAuth(config)
  await setPersistence(auth, inMemoryPersistence)
  const credential = await signInWithEmailAndPassword(auth, email, password)
  return credential.user.getIdToken(true)
}

export async function clearFirebaseClientSession(config: AuthMode['firebase']) {
  await signOut(firebaseAuth(config))
}
