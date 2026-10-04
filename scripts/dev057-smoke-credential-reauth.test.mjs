import assert from 'node:assert/strict'
import test from 'node:test'
import { generateKeyPairSync, sign } from 'node:crypto'
import fs from 'node:fs'
import { assertOwnerProfile, assertOwnerSourceFence, createdSecretVersion, firebaseApi, githubSecretMetadataCurrent, secretVersion, verifyOldPair } from './dev057-smoke-credential-reauth.mjs'
import {
  EXPECTED, REAUTH_SCHEMA, ReauthError, admitLocalRequest, assertFreshAuthTime, assertPlatformMe, buildReauthReceipt,
  identityPairHash, localPageSecurityHeaders, localRequestDenial, parseReauthArguments, resolveVersionBinding,
  runReauthentication, sha256, validateReauthReceipt, verifyFirebaseIdToken,
} from './lib/dev057-smoke-credential-reauth.mjs'

const NOW = 1800000000000
const SUBJECT = 'firebase-test-subject-0123456789'
const expected = { issuer: EXPECTED.issuer, subject: SUBJECT }
const claims = (overrides = {}) => ({
  iss: EXPECTED.issuer, aud: EXPECTED.projectId, sub: SUBJECT, exp: Math.floor(NOW / 1000) + 3600,
  iat: Math.floor(NOW / 1000) - 20, auth_time: Math.floor(NOW / 1000) - 15,
  email_verified: true, firebase: { sign_in_provider: 'password' }, ...overrides,
})
const principal = { principalId: 'principal-firebase-0123456789abcdef0123456789abcdef', employeeId: 'employee-0123456789' }
const meValue = { user: principal, assuranceLevel: 'aal1', session: { expiresAt: '2030-01-01T00:00:00Z' } }

function adapter(overrides = {}) {
  let meCount = 0
  let latestCount = 0
  const defaults = {
    signIn: async () => ({ idToken: 'id-token-test-only', refreshToken: 'refresh-token-test-only-value', localId: SUBJECT, emailVerified: true }),
    verifyIdToken: async () => claims(),
    lookupAccount: async () => ({ localId: SUBJECT, disabled: false, emailVerified: true }),
    createPlatformSession: async () => ({ status: 200, cookie: 'jenfu_portal_session=test-cookie-value' }),
    me: async () => {
      meCount += 1
      return meCount <= 2 ? { status: 200, value: meValue } : { status: 401 }
    },
    logout: async () => ({ status: 200 }),
    latestSecretVersion: async () => ({ version: ++latestCount === 1 ? '7' : '8', state: 'ENABLED' }),
    addSecretVersion: async () => ({ version: '8' }),
    readSecretVersion: async () => ({ state: 'ENABLED', bytes: Buffer.from('refresh-token-test-only-value') }),
    refreshSecret: async () => ({ idToken: 'rotated-id-token-test-only' }),
    setGithubSecret: async () => undefined,
    githubSecretPresent: async () => true,
    writeReceipt: async () => ({ uri: 'gs://jenfu-platform-prod-orgmaster-release/receipts/credential-reauth/test.json', sha256: 'a'.repeat(64) }),
    writePartialReceipt: async () => undefined,
  }
  return { ...defaults, ...overrides }
}

test('fresh password token needs a recent auth_time', () => {
  assert.equal(assertFreshAuthTime(claims(), NOW), true)
  assert.throws(() => assertFreshAuthTime(claims({ auth_time: Math.floor(NOW / 1000) - 301 }), NOW), /PASSWORD_AUTH_TIME_STALE/u)
})

test('explicit version args are paired, canonical, safe and exactly consecutive while no-arg compatibility stays 7 to 8', () => {
  assert.deepEqual(parseReauthArguments([]), { commit: false, previousVersion: '7', newVersion: '8' })
  assert.deepEqual(parseReauthArguments(['--commit', '--previous-version', '8', '--new-version', '9']),
    { commit: true, previousVersion: '8', newVersion: '9' })
  assert.deepEqual(parseReauthArguments(['--new-version', '9', '--previous-version', '8']),
    { commit: false, previousVersion: '8', newVersion: '9' })
  for (const args of [
    ['--previous-version', '8'], ['--new-version', '9'], ['--unknown'],
    ['--commit', '--commit'], ['--previous-version', '8', '--previous-version', '8', '--new-version', '9'],
    ['--previous-version', '8', '--new-version'],
  ]) assert.throws(() => parseReauthArguments(args), /USAGE/u)
  for (const [previousVersion, newVersion] of [
    ['08', '9'], ['0', '1'], ['8', '8'], ['9', '8'], ['8', '10'],
    ['9007199254740991', '9007199254740992'], ['9007199254740992', '9007199254740993'],
  ]) assert.throws(() => resolveVersionBinding(previousVersion, newVersion), /SECRET_VERSION_BINDING_INVALID/u)
})

test('invalid run binding is rejected before password authentication or any adapter work', async () => {
  let calls = 0
  const guardedAdapter = adapter({ signIn: async () => { calls += 1; throw new Error('must not sign in') } })
  await assert.rejects(() => runReauthentication({
    adapter: guardedAdapter, email: 'private-test@example.invalid', password: 'pw', expected,
    sourceRevision: 'a'.repeat(40), commit: true, previousVersion: '8', newVersion: '10', now: () => NOW,
  }), /SECRET_VERSION_BINDING_INVALID/u)
  assert.equal(calls, 0)
})

test('Firebase ID token verifier checks RS256 signature and project claims', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'test-key' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(claims())).toString('base64url')
  const signed = header + '.' + body
  const token = signed + '.' + sign('RSA-SHA256', Buffer.from(signed), privateKey).toString('base64url')
  const fetchImpl = async () => ({ ok: true, json: async () => ({ 'test-key': publicKey.export({ type: 'spki', format: 'pem' }) }) })
  assert.equal((await verifyFirebaseIdToken(token, { fetchImpl, nowMs: NOW })).sub, SUBJECT)
  const parts = token.split('.')
  parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1)
  const bad = parts.join('.')
  await assert.rejects(() => verifyFirebaseIdToken(bad, { fetchImpl, nowMs: NOW }), /FIREBASE_TOKEN_SIGNATURE_INVALID|FIREBASE_TOKEN_INVALID/u)
})

test('provider adapter accepts the documented sign-in response and requires exact account lookup state', async () => {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), method: options.method, body: options.body })
    if (String(url).includes('accounts:signInWithPassword')) {
      return new Response(JSON.stringify({ idToken: 'id-token-test-only', refreshToken: 'refresh-token-test-only', localId: SUBJECT }), { status: 200 })
    }
    return new Response(JSON.stringify({ users: [{ localId: SUBJECT, disabled: false, emailVerified: true }] }), { status: 200 })
  }
  const provider = firebaseApi(fetchImpl, 'fake-api-key-for-test-only')
  const signed = await provider.signIn('private-test@example.invalid', 'never-log-this-password')
  assert.deepEqual(signed, { idToken: 'id-token-test-only', refreshToken: 'refresh-token-test-only', localId: SUBJECT })
  assert.equal(Object.hasOwn(signed, 'emailVerified'), false)
  assert.deepEqual(await provider.lookup(signed.idToken), { localId: SUBJECT, disabled: false, emailVerified: true })
  assert.equal(calls.length, 2)
  assert.match(calls[0].url, /accounts:signInWithPassword/u)
  assert.match(calls[1].url, /accounts:lookup/u)
  assert.doesNotMatch(JSON.stringify(signed), /private-test|never-log-this-password/u)
})

test('Secret Manager latest alias must resolve to this exact own Secret numeric version', async () => {
  const call = async (url) => {
    assert.match(url, /projects\/9536592944\/secrets\/orgmaster-prod-smoke-firebase-refresh-token\/versions\/(?:latest|8)$/u)
    return { name: 'projects/9536592944/secrets/orgmaster-prod-smoke-firebase-refresh-token/versions/7', state: 'ENABLED' }
  }
  const latest = await secretVersion(call, 'latest')
  assert.equal(latest.version, '7')
  await assert.rejects(() => secretVersion(call, '8'), /SECRET_VERSION_METADATA_INVALID/u)
})

test('verify-only follows password pair, enabled account, normal Platform session and logout without writing', async () => {
  const value = adapter()
  const result = await runReauthentication({ adapter: value, email: 'private-test@example.invalid', password: 'never-log-this-password', expected, sourceRevision: 'a'.repeat(40), now: () => NOW })
  assert.deepEqual(result, { status: 'VERIFIED_ONLY', evidenceScope: 'APP_SMOKE_CREDENTIAL_REAUTH' })
  assert.equal(JSON.stringify(result).includes('private-test@example.invalid'), false)
  assert.equal(JSON.stringify(result).includes('never-log-this-password'), false)
  assert.equal(assertPlatformMe({ status: 200, value: meValue }).principalId, principal.principalId)
})

test('rejects a password session for a different Firebase subject', async () => {
  await assert.rejects(() => runReauthentication({
    adapter: adapter({ verifyIdToken: async () => claims({ sub: 'another-subject-01234567890' }) }),
    email: 'private-test@example.invalid', password: 'pw', expected, sourceRevision: 'a'.repeat(40), now: () => NOW,
  }), /PROVIDER_PAIR_OR_METHOD_MISMATCH/u)
})

test('rejects stale password auth_time and disabled account before creating a session', async () => {
  await assert.rejects(() => runReauthentication({
    adapter: adapter({ verifyIdToken: async () => claims({ auth_time: Math.floor(NOW / 1000) - 301 }) }),
    email: 'private-test@example.invalid', password: 'pw', expected, sourceRevision: 'a'.repeat(40), now: () => NOW,
  }), /PASSWORD_AUTH_TIME_STALE/u)
  await assert.rejects(() => runReauthentication({
    adapter: adapter({ lookupAccount: async () => ({ localId: SUBJECT, disabled: true, emailVerified: true }) }),
    email: 'private-test@example.invalid', password: 'pw', expected, sourceRevision: 'a'.repeat(40), now: () => NOW,
  }), /FIREBASE_ACCOUNT_STATE_INVALID/u)
})

test('rejects unequal Principal reads and Platform session denial', async () => {
  let count = 0
  const changedMe = async () => {
    count += 1
    return { status: 200, value: { ...meValue, user: { ...principal, principalId: count === 2 ? 'principal-firebase-ffffffffffffffffffffffffffffffff' : principal.principalId } } }
  }
  await assert.rejects(() => runReauthentication({
    adapter: adapter({ me: changedMe }), email: 'private-test@example.invalid', password: 'pw',
    expected, sourceRevision: 'a'.repeat(40), now: () => NOW,
  }), /PLATFORM_PRINCIPAL_CHANGED/u)
  await assert.rejects(() => runReauthentication({
    adapter: adapter({ createPlatformSession: async () => ({ status: 401 }) }), email: 'private-test@example.invalid',
    password: 'pw', expected, sourceRevision: 'a'.repeat(40), now: () => NOW,
  }), /PLATFORM_SESSION_CREATE_FAILED/u)
})

test('logout failure never enters credential mutation', async () => {
  let addCalled = false
  await assert.rejects(() => runReauthentication({
    adapter: adapter({ logout: async () => ({ status: 403 }), addSecretVersion: async () => { addCalled = true; return { version: '8' } } }),
    email: 'private-test@example.invalid', password: 'pw', expected, sourceRevision: 'a'.repeat(40), commit: true, now: () => NOW,
  }), /PLATFORM_LOGOUT_FAILED/u)
  assert.equal(addCalled, false)
})

test('commit yields only a redacted source-bound receipt after exact version and GitHub readback', async () => {
  const secretBytes = Buffer.from('refresh-token-test-only-value')
  let signedInValue
  let refreshedValue
  const result = await runReauthentication({
    adapter: adapter({
      signIn: async () => { signedInValue = { idToken: 'id-token-test-only', refreshToken: 'refresh-token-test-only-value', localId: SUBJECT }; return signedInValue },
      readSecretVersion: async () => ({ state: 'ENABLED', bytes: secretBytes }),
      refreshSecret: async () => { refreshedValue = { idToken: 'rotated-id-token-test-only', refreshToken: 'rotated-refresh-test-only' }; return refreshedValue },
    }), email: 'private-test@example.invalid', password: 'never-log-this-password',
    expected, sourceRevision: 'a'.repeat(40), commit: true, now: () => NOW,
  })
  assert.equal(result.status, 'COMMITTED')
  assert.equal(result.ref.uri.startsWith('gs://jenfu-platform-prod-orgmaster-release/receipts/credential-reauth/'), true)
  assert.doesNotMatch(JSON.stringify(result), /private-test|never-log-this-password|refresh-token|id-token|jenfu_portal_session/u)
  assert.deepEqual([...secretBytes], new Array(secretBytes.length).fill(0))
  assert.equal(signedInValue.idToken, '')
  assert.equal(signedInValue.refreshToken, '')
  assert.equal(refreshedValue.idToken, '')
  assert.equal(refreshedValue.refreshToken, '')
})

test('explicit 8 to 9 commit binds prior read, new version, exact payload and receipt', async () => {
  let latestCalls = 0
  let addCalls = 0
  let githubPayload
  let receipt
  const result = await runReauthentication({
    adapter: adapter({
      latestSecretVersion: async () => ({ version: ++latestCalls === 1 ? '8' : '9', state: 'ENABLED' }),
      addSecretVersion: async (value) => { addCalls += 1; assert.equal(value, 'refresh-token-test-only-value'); return { version: '9' } },
      setGithubSecret: async (bytes) => { githubPayload = Buffer.from(bytes) },
      writeReceipt: async (value) => { receipt = value; return { uri: 'gs://jenfu-platform-prod-orgmaster-release/receipts/credential-reauth/test.json', sha256: 'a'.repeat(64) } },
    }),
    email: 'private-test@example.invalid', password: 'never-log-this-password', expected,
    sourceRevision: 'a'.repeat(40), commit: true, previousVersion: '8', newVersion: '9', now: () => NOW,
  })
  assert.equal(result.status, 'COMMITTED')
  assert.equal(latestCalls, 4)
  assert.equal(addCalls, 1)
  assert.deepEqual(githubPayload, Buffer.from('refresh-token-test-only-value'))
  assert.equal(receipt.secret.previousVersion, '8')
  assert.equal(receipt.secret.newVersion, '9')
  assert.equal(validateReauthReceipt(receipt, {
    sourceRevision: 'a'.repeat(40), expectedPreviousVersion: '8', expectedNewVersion: '9', nowMs: NOW,
  }), true)
})

test('version drift and GitHub write failure produce partial evidence, never PASS or deletion', async () => {
  let partialCount = 0
  await assert.rejects(() => runReauthentication({
    adapter: adapter({ latestSecretVersion: async () => ({ version: '8', state: 'ENABLED' }), writePartialReceipt: async () => { partialCount += 1 } }),
    email: 'private-test@example.invalid', password: 'pw', expected, sourceRevision: 'a'.repeat(40), commit: true, now: () => NOW,
  }), /SECRET_VERSION_CHANGED/u)
  assert.equal(partialCount, 0)
  const githubFailure = await runReauthentication({
    adapter: adapter({ setGithubSecret: async () => { throw new ReauthError('GITHUB_SECRET_WRITE_FAILED') },
      writePartialReceipt: async () => { partialCount += 1 } }),
    email: 'private-test@example.invalid', password: 'pw', expected, sourceRevision: 'a'.repeat(40), commit: true, now: () => NOW,
  })
  assert.equal(githubFailure.status, 'PARTIAL')
  assert.equal(githubFailure.code, 'GITHUB_SECRET_WRITE_FAILED')
  assert.equal(partialCount, 1)
  assert.equal(githubFailure.status, 'PARTIAL')
  const versionRace = await runReauthentication({
    adapter: adapter({
      latestSecretVersion: (() => { let count = 0; return async () => ({ version: ++count === 1 ? '7' : '9', state: 'ENABLED' }) })(),
      writePartialReceipt: async () => { partialCount += 1 },
    }),
    email: 'private-test@example.invalid', password: 'pw', expected, sourceRevision: 'a'.repeat(40), commit: true, now: () => NOW,
  })
  assert.equal(versionRace.status, 'PARTIAL')
  assert.equal(versionRace.code, 'SECRET_VERSION_RACE')
  assert.equal(partialCount, 2)
})

test('explicit prewrite drift and postwrite version race never update GitHub', async () => {
  let addCalls = 0
  let githubCalls = 0
  let partial
  const beforeRace = adapter({
    latestSecretVersion: async () => ({ version: '7', state: 'ENABLED' }),
    addSecretVersion: async () => { addCalls += 1; return { version: '9' } },
    setGithubSecret: async () => { githubCalls += 1 },
    writePartialReceipt: async (value) => { partial = value },
  })
  await assert.rejects(() => runReauthentication({
    adapter: beforeRace, email: 'private-test@example.invalid', password: 'pw', expected,
    sourceRevision: 'a'.repeat(40), commit: true, previousVersion: '8', newVersion: '9', now: () => NOW,
  }), /SECRET_VERSION_CHANGED/u)
  assert.equal(addCalls, 0)
  assert.equal(githubCalls, 0)
  assert.equal(partial, undefined)

  let latestCalls = 0
  const afterRace = adapter({
    latestSecretVersion: async () => ({ version: ++latestCalls === 1 ? '8' : '10', state: 'ENABLED' }),
    addSecretVersion: async () => { addCalls += 1; return { version: '9' } },
    setGithubSecret: async () => { githubCalls += 1 },
    writePartialReceipt: async (value) => { partial = value },
  })
  const result = await runReauthentication({
    adapter: afterRace, email: 'private-test@example.invalid', password: 'pw', expected,
    sourceRevision: 'a'.repeat(40), commit: true, previousVersion: '8', newVersion: '9', now: () => NOW,
  })
  assert.equal(result.status, 'PARTIAL')
  assert.equal(result.code, 'SECRET_VERSION_RACE')
  assert.equal(addCalls, 1)
  assert.equal(githubCalls, 0)
  assert.equal(partial.status, 'PARTIAL')
  assert.equal(partial.secret.previousVersion, '8')
  assert.equal(partial.secret.newVersion, '9')
  assert.deepEqual(partial.mutation, { secretVersionCreated: true, githubSecretConfigured: false })
})

test('receipt is exact, source-bound, fresh and hash-bound', () => {
  assert.equal(identityPairHash(expected.issuer, SUBJECT), sha256(expected.issuer + '\0' + SUBJECT))
  const receipt = buildReauthReceipt({
    sourceRevision: 'a'.repeat(40), expected, authTime: Math.floor(NOW / 1000) - 15,
    authenticatedAt: new Date(NOW).toISOString(), principal, previousVersion: '7', newVersion: '8',
    observedAt: new Date(NOW + 1000).toISOString(),
  })
  assert.equal(receipt.schemaVersion, REAUTH_SCHEMA)
  assert.equal(validateReauthReceipt(receipt, { sourceRevision: 'a'.repeat(40), nowMs: NOW }), true)
  assert.throws(() => validateReauthReceipt({ ...receipt, projectId: 'other' }, { sourceRevision: 'a'.repeat(40), nowMs: NOW }), /REAUTH_RECEIPT_INVALID/u)
  assert.throws(() => validateReauthReceipt(receipt, { sourceRevision: 'b'.repeat(40), nowMs: NOW }), /REAUTH_RECEIPT_INVALID/u)
  assert.throws(() => validateReauthReceipt(receipt, {
    sourceRevision: 'a'.repeat(40), expectedPreviousVersion: '8', expectedNewVersion: '9', nowMs: NOW,
  }), /REAUTH_RECEIPT_INVALID/u)
  const nonmonotonic = buildReauthReceipt({ sourceRevision: 'a'.repeat(40), expected, authTime: Math.floor(NOW / 1000) - 15,
    authenticatedAt: new Date(NOW).toISOString(), principal, previousVersion: '7', newVersion: '7', observedAt: new Date(NOW + 1000).toISOString() })
  assert.throws(() => validateReauthReceipt(nonmonotonic, {
    sourceRevision: 'a'.repeat(40), expectedPreviousVersion: '7', expectedNewVersion: '8', nowMs: NOW,
  }), /REAUTH_RECEIPT_INVALID/u)
})

test('the local handler request predicate enforces exact Host, Origin, CSRF, size and single-flight policy', () => {
  const base = {
    host: '127.0.0.1:43123', expectedHost: '127.0.0.1:43123', path: '/capability', expectedPath: '/capability',
    method: 'POST', origin: 'http://127.0.0.1:43123', expectedOrigin: 'http://127.0.0.1:43123',
    contentType: 'application/x-www-form-urlencoded', csrfToken: 'expected-csrf', expectedCsrf: 'expected-csrf',
    submitted: false, busy: false, lastSubmitAt: 0, nowMs: 5000, contentLength: 64,
  }
  assert.equal(localRequestDenial(base), null)
  assert.equal(localRequestDenial({ ...base, method: 'GET' }), null)
  assert.equal(localRequestDenial({ ...base, host: 'attacker.example' }), 400)
  assert.equal(localRequestDenial({ ...base, origin: 'http://localhost:43123' }), 403)
  assert.equal(localRequestDenial({ ...base, csrfToken: 'wrong' }), 403)
  assert.equal(localRequestDenial({ ...base, contentLength: 8193 }), 413)
  assert.equal(localRequestDenial({ ...base, contentLength: 0 }), 413)
  assert.equal(localRequestDenial({ ...base, busy: true }), 403)
  assert.equal(localRequestDenial({ ...base, submitted: true }), 403)
  assert.equal(localRequestDenial({ ...base, lastSubmitAt: 4500, nowMs: 5000 }), 403)
})

test('the request admission path reserves one POST before the first body finishes', () => {
  const base = {
    host: '127.0.0.1:43123', expectedHost: '127.0.0.1:43123', path: '/capability', expectedPath: '/capability',
    method: 'POST', origin: 'http://127.0.0.1:43123', expectedOrigin: 'http://127.0.0.1:43123',
    contentType: 'application/x-www-form-urlencoded', csrfToken: 'expected-csrf', expectedCsrf: 'expected-csrf',
    nowMs: 5000, contentLength: 64,
  }
  const state = { submitted: false, busy: false, lastSubmitAt: 0 }
  assert.equal(admitLocalRequest(base, state), null)
  assert.deepEqual(state, { submitted: false, busy: true, lastSubmitAt: 5000 })
  assert.equal(admitLocalRequest({ ...base, nowMs: 8000 }, state), 403)
  assert.equal(state.busy, true)
})

test('local page CSP keeps network requests on the loopback origin', () => {
  const headers = localPageSecurityHeaders('test-nonce')
  assert.equal(headers['cache-control'], 'no-store')
  assert.equal(headers['x-content-type-options'], 'nosniff')
  assert.match(headers['content-security-policy'], /default-src 'none'/u)
  assert.match(headers['content-security-policy'], /connect-src 'self'/u)
  assert.doesNotMatch(headers['content-security-policy'], /connect-src[^;]*https?:/u)
})


test('Org operator is fixed to its own current profile and clean official master source', () => {
  const profile = JSON.parse(fs.readFileSync(new URL('../config/release/dev040-orgmaster-independent-production-v3.json', import.meta.url), 'utf8'))
  assert.equal(assertOwnerProfile(profile), true)
  for (const value of [
    { ...profile, application: { ...profile.application, id: 'ai-pdm' } },
    { ...profile, target: { ...profile.target, canonicalOrigin: EXPECTED.canonicalOrigin } },
    { ...profile, artifact: { ...profile.artifact, releaseBucket: 'jenfu-platform-prod-aipdm-release' } },
    { ...profile, verification: { ...profile.verification, candidateRefreshTokenSecretId: 'aipdm-prod-smoke-firebase-refresh-token' } },
    { ...profile, verification: { ...profile.verification, sessionMode: 'LEGACY_FIREBASE' } },
  ]) assert.throws(() => assertOwnerProfile(value), /ORG_OWNER_PROFILE_MISMATCH/u)
  const source = { sourceRevision: 'a'.repeat(40), remoteHead: 'a'.repeat(40), status: '', branch: 'master', remote: 'https://github.com/jedchang0308-jenfu/OrgMaster.git' }
  assert.equal(assertOwnerSourceFence(source), true)
  for (const changed of [{ branch: 'codex/feature' }, { status: '?? private-file' }, { remoteHead: 'b'.repeat(40) }, { remote: 'https://github.com/jedchang0308-jenfu/AI-PDM.git' }]) {
    assert.throws(() => assertOwnerSourceFence({ ...source, ...changed }), /OWNER_SOURCE_NOT_FROZEN/u)
  }
})

test('GitHub readback requires exact own secret and timestamp of this write', () => {
  const own = { name: EXPECTED.githubSecretName, updatedAt: new Date(NOW).toISOString() }
  assert.equal(githubSecretMetadataCurrent([own], NOW + 999), true)
  assert.equal(githubSecretMetadataCurrent([{ ...own, name: 'DEV012_AIPDM_FIREBASE_REFRESH_TOKEN' }], NOW), false)
  assert.equal(githubSecretMetadataCurrent([{ ...own, updatedAt: new Date(NOW - 1000).toISOString() }], NOW), false)
})

test('post-refresh and post-GitHub latest-version drift remain PARTIAL, never PASS', async () => {
  for (const driftAt of [3, 4]) {
    let latestCalls = 0
    let githubCalls = 0
    let partial
    const result = await runReauthentication({ adapter: adapter({
      latestSecretVersion: async () => ({ version: ++latestCalls === 1 ? '7' : latestCalls === driftAt ? '9' : '8', state: 'ENABLED' }),
      setGithubSecret: async () => { githubCalls += 1 },
      writePartialReceipt: async (value) => { partial = value },
    }), email: 'private-test@example.invalid', password: 'pw', expected,
      sourceRevision: 'a'.repeat(40), commit: true, now: () => NOW })
    assert.equal(result.status, 'PARTIAL')
    assert.equal(result.code, 'SECRET_VERSION_RACE')
    assert.equal(githubCalls, driftAt === 3 ? 0 : 1)
    assert.equal(partial.status, 'PARTIAL')
    assert.throws(() => validateReauthReceipt(partial, { sourceRevision: 'a'.repeat(40), nowMs: NOW }), /REAUTH_RECEIPT_INVALID/u)
  }
})

test('expired loopback submission cannot start authentication or mutate after session verification', async () => {
  let signIns = 0
  let writes = 0
  await assert.rejects(() => runReauthentication({ adapter: adapter({ signIn: async () => { signIns += 1 } }),
    email: 'private-test@example.invalid', password: 'pw', expected, sourceRevision: 'a'.repeat(40), expiresAt: NOW,
    commit: true, now: () => NOW }), /LOCAL_PAGE_EXPIRED/u)
  assert.equal(signIns, 0)
  let clock = NOW
  await assert.rejects(() => runReauthentication({ adapter: adapter({
    logout: async () => { clock += 1000; return { status: 200 } },
    addSecretVersion: async () => { writes += 1; return { version: '8' } },
  }), email: 'private-test@example.invalid', password: 'pw', expected, sourceRevision: 'a'.repeat(40), expiresAt: NOW + 500,
    commit: true, now: () => clock }), /LOCAL_PAGE_EXPIRED/u)
  assert.equal(writes, 0)
})


test('the prior own credential fixes an RSA-verified password pair and exact enabled self account', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const fetchImpl = async () => ({ ok: true, json: async () => ({ 'test-key': publicKey.export({ type: 'spki', format: 'pem' }) }) })
  const token = (overrides = {}) => {
    const head = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'test-key' })).toString('base64url')
    const body = Buffer.from(JSON.stringify(claims(overrides))).toString('base64url')
    const signed = head + '.' + body
    return signed + '.' + sign('RSA-SHA256', Buffer.from(signed), privateKey).toString('base64url')
  }
  for (const [claimOverrides, accountOverrides, code] of [
    [{}, {}, null],
    [{ aud: 'another-project' }, {}, 'FIREBASE_TOKEN_CLAIMS_INVALID'],
    [{ iss: 'https://securetoken.google.com/another-project' }, {}, 'FIREBASE_TOKEN_CLAIMS_INVALID'],
    [{ firebase: { sign_in_provider: 'google.com' } }, {}, 'PRIOR_CREDENTIAL_IDENTITY_INVALID'],
    [{}, { disabled: true }, 'PRIOR_CREDENTIAL_ACCOUNT_INVALID'],
    [{}, { localId: 'another-subject-01234567890' }, 'PRIOR_CREDENTIAL_ACCOUNT_INVALID'],
  ]) {
    const refreshed = { idToken: token(claimOverrides), refreshToken: 'prior-token-test-only' }
    const firebase = { refresh: async () => refreshed, lookup: async () => ({ localId: SUBJECT, disabled: false, emailVerified: true, ...accountOverrides }) }
    const run = () => verifyOldPair({ firebase, oldBytes: Buffer.from('prior-token-test-only'), nowMs: NOW, fetchImpl })
    if (code) await assert.rejects(run, new RegExp(code, 'u'))
    else assert.deepEqual(await run(), expected)
    assert.equal(refreshed.idToken, '')
    assert.equal(refreshed.refreshToken, '')
  }
})

test('postwrite expiry preserves a partial receipt and prevents GitHub synchronization', async () => {
  let clock = NOW
  let githubCalls = 0
  let partial
  const result = await runReauthentication({ adapter: adapter({
    addSecretVersion: async () => { clock += 1000; return { version: '8' } },
    setGithubSecret: async () => { githubCalls += 1 },
    writePartialReceipt: async (value) => { partial = value },
  }), email: 'private-test@example.invalid', password: 'pw', expected, sourceRevision: 'a'.repeat(40), expiresAt: NOW + 500,
    commit: true, now: () => clock })
  assert.equal(result.status, 'PARTIAL')
  assert.equal(result.code, 'LOCAL_PAGE_EXPIRED')
  assert.equal(githubCalls, 0)
  assert.deepEqual(partial.mutation, { secretVersionCreated: true, githubSecretConfigured: false })
})


test('new Secret version response is exact own enabled canonical metadata', () => {
  const valid = { name: 'projects/9536592944/secrets/orgmaster-prod-smoke-firebase-refresh-token/versions/8', state: 'ENABLED' }
  assert.deepEqual(createdSecretVersion(valid), { version: '8' })
  for (const patch of [
    { name: valid.name.replace('orgmaster-prod', 'aipdm-prod') },
    { name: valid.name.replace('9536592944', '1234567890') },
    { name: valid.name.replace('/versions/8', '/versions/x/versions/8') },
    { name: valid.name.replace('/versions/8', '/versions/08') },
    { state: 'DISABLED' },
  ]) assert.throws(() => createdSecretVersion({ ...valid, ...patch }), /SECRET_VERSION_CREATE_INVALID/u)
})

test('untyped adapter errors cannot expose raw provider fields or credential-like codes', async () => {
  let partial
  const result = await runReauthentication({ adapter: adapter({
    setGithubSecret: async () => { throw Object.assign(new Error('secret-test-only'), { code: 'raw-password-test-only' }) },
    writePartialReceipt: async (value) => { partial = value },
  }), email: 'private-test@example.invalid', password: 'pw', expected, sourceRevision: 'a'.repeat(40), commit: true, now: () => NOW })
  assert.equal(result.status, 'PARTIAL')
  assert.equal(result.code, 'REAUTH_FAILED')
  assert.doesNotMatch(JSON.stringify({ result, partial }), /secret-test-only|raw-password-test-only|private-test/u)
})
