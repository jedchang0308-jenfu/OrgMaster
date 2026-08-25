import type { IncomingMessage } from 'node:http'
import type { GovernanceActorContext } from '../src/governance/types'

export const DEV_ISSUER = 'urn:orgmaster:dev'
export const DEV_SUBJECT = 'local-admin'
export const DEV_PRINCIPAL_ID = 'dev-principal-local-admin'
export function isLoopback(request: IncomingMessage) { const address = request.socket.remoteAddress ?? ''; return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1' }
export function resolveDevelopmentIdentity(request: IncomingMessage, enabled: boolean): GovernanceActorContext | null {
  if (!enabled || !isLoopback(request)) return null
  const issuer = request.headers['x-orgmaster-dev-issuer']; const subject = request.headers['x-orgmaster-dev-subject']; if (issuer !== DEV_ISSUER || subject !== DEV_SUBJECT) return null
  return { principalId: DEV_PRINCIPAL_ID, issuer: DEV_ISSUER, subject: DEV_SUBJECT, employeeId: null, bootstrap: true }
}
