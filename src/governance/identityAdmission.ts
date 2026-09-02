import { createHash } from 'node:crypto'

export const PRINCIPAL_FINGERPRINT_DOMAIN = 'jenfu.identity-admission.principal.v1'
export const ISSUER_FINGERPRINT_DOMAIN = 'jenfu.identity-admission.issuer.v1'
const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')
export function principalFingerprintSha256(issuer: string, subject: string) { return digest(`${PRINCIPAL_FINGERPRINT_DOMAIN}\0${issuer}\0${subject}`) }
export function issuerFingerprintSha256(issuer: string) { return digest(`${ISSUER_FINGERPRINT_DOMAIN}\0${issuer}`) }
export function isSha256(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value) }
