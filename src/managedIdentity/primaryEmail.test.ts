import { describe, expect, it } from 'vitest'
import { parseManagedPrimaryEmail } from './primaryEmail'

describe('managed Google primary email', () => {
  it('normalizes an exact managed-domain dot-atom address', () => {
    expect(parseManagedPrimaryEmail('  Jed.Chang+work@JENFU.COM.TW ', 'jenfu.com.tw')).toEqual({ ok: true, value: 'jed.chang+work@jenfu.com.tw' })
  })

  it.each(['a b@jenfu.com.tw', '"quoted"@jenfu.com.tw', '.leading@jenfu.com.tw', 'double..dot@jenfu.com.tw', 'name@localhost', ''])('rejects invalid input %s', (value) => {
    expect(parseManagedPrimaryEmail(value, 'jenfu.com.tw')).toEqual({ ok: false, code: 'MANAGED_PRIMARY_EMAIL_INVALID' })
  })

  it('rejects a valid address from another domain', () => {
    expect(parseManagedPrimaryEmail('person@gmail.com', 'jenfu.com.tw')).toEqual({ ok: false, code: 'MANAGED_PRIMARY_EMAIL_DOMAIN_NOT_ALLOWED' })
  })
})
