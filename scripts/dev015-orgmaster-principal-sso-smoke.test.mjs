import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { runOrgmasterPrincipalSsoSmoke } from './lib/dev015-orgmaster-principal-sso-smoke.mjs'

const broker = 'https://platform.example.test'
const canonical = 'https://orgmaster.example.test'
const candidate = 'https://candidate-0123456789ab---orgmaster.example.test'
const state = 's'.repeat(22)
const code = 'c'.repeat(43)

function redirects(input, principal = 'principal-one', platformCookie = 'jenfu_portal_session=platform-cookie; HttpOnly') {
  const calls = []
  const authorize = new URL('/api/sso/authorize', broker)
  authorize.searchParams.set('client_id', 'orgmaster')
  authorize.searchParams.set('redirect_uri', canonical + '/api/auth/jenfu-sso/callback')
  authorize.searchParams.set('state', state)
  const callback = new URL('/api/auth/jenfu-sso/callback', canonical)
  callback.searchParams.set('code', code)
  callback.searchParams.set('state', state)
  callback.searchParams.set('iss', broker + '/api/sso')
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options })
    const path = new URL(url).pathname
    if (path === '/api/auth/firebase/session') return new Response(JSON.stringify({ user: { principalId: 'principal-one' } }), { status: 200, headers: { 'set-cookie': platformCookie } })
    if (path === '/api/auth/jenfu-sso/start') return new Response(null, { status: 303, headers: { location: authorize.toString(), 'set-cookie': '__Host-jenfu_sso_tx=transaction-cookie; HttpOnly' } })
    if (path === '/api/sso/authorize') return new Response(null, { status: 303, headers: { location: callback.toString() } })
    if (path === '/api/auth/jenfu-sso/callback') return new Response(null, { status: 303, headers: { location: canonical + '/', 'set-cookie': 'orgmaster_session=org-cookie; HttpOnly' } })
    if (path === '/api/auth/me') return options.headers.Cookie === 'orgmaster_session=org-cookie' && calls.filter((x) => new URL(x.url).pathname === '/api/auth/me').length === 1
      ? new Response(JSON.stringify({ user: { principalId: principal } }), { status: 200 })
      : new Response('{}', { status: 401 })
    if (path === '/api/orgmaster/preferences/workbench') return new Response('{}', { status: options.headers.Cookie ? 200 : 401 })
    if (path === '/api/auth/logout') return new Response('{}', { status: 200 })
    throw new Error('unexpected request ' + url)
  }
  return { fetchImpl, calls, callback, input }
}

const input = (fetchImpl) => ({
  fetchImpl, brokerOrigin: broker, appOrigin: candidate, canonicalOrigin: canonical,
  idToken: 't'.repeat(100), mePath: '/api/auth/me', logoutPath: '/api/auth/logout',
  authenticatedProbes: [{ id: 'workbench', path: '/api/orgmaster/preferences/workbench', expectedStatus: 200 }],
  negativeProbes: [{ id: 'workbench-denied', path: '/api/orgmaster/preferences/workbench', expectedStatus: 401 }],
  now: () => '2026-09-29T00:00:00.000Z',
})

test('Principal-only candidate smoke follows the real Platform SSO exchange and preserves candidate cookie scope', async () => {
  const fixture = redirects()
  const result = await runOrgmasterPrincipalSsoSmoke(input(fixture.fetchImpl))
  assert.equal(result.status, 'PASS')
  assert.equal(result.observations.length, 8)
  assert.equal(fixture.calls[0].url, broker + '/api/auth/firebase/session')
  assert.equal(fixture.calls[0].options.headers.Origin, broker)
  assert.equal(fixture.calls[2].options.headers.Cookie, 'jenfu_portal_session=platform-cookie')
  assert.equal(fixture.calls[3].url, candidate + fixture.callback.pathname + fixture.callback.search)
  assert.equal(fixture.calls[3].options.headers.Cookie, '__Host-jenfu_sso_tx=transaction-cookie')
  assert.equal(fixture.calls.at(-2).options.headers.Origin, canonical)
})

test('Principal-only smoke rejects a consumer session for another principal', async () => {
  const fixture = redirects(null, 'principal-other')
  await assert.rejects(() => runOrgmasterPrincipalSsoSmoke(input(fixture.fetchImpl)), /SSO_SMOKE_PRINCIPAL_MISMATCH/u)
  assert.equal(fixture.calls.some((entry) => new URL(entry.url).pathname === '/api/orgmaster/preferences/workbench'), false)
})

test('Principal-only smoke rejects callback redirection to an unrelated origin', async () => {
  const fixture = redirects()
  const fetchImpl = async (url, options) => {
    if (new URL(url).pathname === '/api/sso/authorize') return new Response(null, { status: 303, headers: { location: 'https://evil.example.test/api/auth/jenfu-sso/callback?code=' + code } })
    return fixture.fetchImpl(url, options)
  }
  await assert.rejects(() => runOrgmasterPrincipalSsoSmoke(input(fetchImpl)), /SSO_SMOKE_REDIRECT_INVALID/u)
})

// The cross-owner harness supplies this from Platform's real sessionCookie producer.
// No sibling checkout or invented cookie constant is read by this owner test.
test('Principal smoke consumes the real Platform cookie producer', { skip: !process.env.DEV015_HANDOFF_PROOF_INPUT }, async () => {
  const proof = JSON.parse(fs.readFileSync(process.env.DEV015_HANDOFF_PROOF_INPUT, 'utf8'))
  assert.equal(typeof proof.platformSessionCookie, 'string')
  const fixture = redirects(null, 'principal-one', proof.platformSessionCookie)
  const result = await runOrgmasterPrincipalSsoSmoke(input(fixture.fetchImpl))
  assert.equal(result.status, 'PASS')
  assert.equal(fixture.calls[2].options.headers.Cookie, proof.platformSessionCookie.split(';')[0])
})

test('Principal smoke rejects the incorrect historical broker cookie before SSO starts', async () => {
  const fixture = redirects(null, 'principal-one', 'jenfu_session=opaque; HttpOnly')
  await assert.rejects(() => runOrgmasterPrincipalSsoSmoke(input(fixture.fetchImpl)), /SSO_SMOKE_COOKIE_INVALID/u)
  assert.equal(fixture.calls.length, 1)
})
