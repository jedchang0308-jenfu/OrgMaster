export type ManagedPrimaryEmailResult =
  | { ok: true; value: string }
  | { ok: false; code: 'MANAGED_PRIMARY_EMAIL_INVALID' | 'MANAGED_PRIMARY_EMAIL_DOMAIN_NOT_ALLOWED' }

const DOT_ATOM = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/u
const DOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u

export function parseManagedPrimaryEmail(input: string, managedDomain: string): ManagedPrimaryEmailResult {
  const value = input.trim().toLowerCase()
  if (value.length < 3 || value.length > 254 || !/^[\x21-\x7e]+$/u.test(value)) return { ok: false, code: 'MANAGED_PRIMARY_EMAIL_INVALID' }
  const parts = value.split('@')
  if (parts.length !== 2 || !DOT_ATOM.test(parts[0]) || !DOMAIN.test(parts[1])) return { ok: false, code: 'MANAGED_PRIMARY_EMAIL_INVALID' }
  if (parts[1] !== managedDomain.trim().toLowerCase()) return { ok: false, code: 'MANAGED_PRIMARY_EMAIL_DOMAIN_NOT_ALLOWED' }
  return { ok: true, value }
}
