import { createHash, randomBytes } from 'node:crypto'
import { ORGMASTER_SESSION_COOKIE, ORGMASTER_SESSION_MAX_AGE_SECONDS } from './orgmasterAuthConfig'

export function createOpaqueSessionToken() {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(pepper: string, token: string) {
  return createHash('sha256').update(pepper).update('\0').update(token).digest('hex')
}

export function readSessionToken(cookieHeader: string | undefined) {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0) continue
    if (part.slice(0, separator).trim() === ORGMASTER_SESSION_COOKIE) {
      try { return decodeURIComponent(part.slice(separator + 1).trim()) } catch { return null }
    }
  }
  return null
}

export function sessionCookie(token: string, secure: boolean, maxAge = ORGMASTER_SESSION_MAX_AGE_SECONDS) {
  return `${ORGMASTER_SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
}

export function clearSessionCookie(secure: boolean) {
  return `${ORGMASTER_SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
}
