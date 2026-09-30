function fail(code) { throw new Error(code) }

function exactOrigin(raw) {
  const url = new URL(raw)
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.origin !== raw) fail('SSO_SMOKE_ORIGIN_INVALID')
  return url.origin
}

function cookie(response, name) {
  const raw = response.headers.get('set-cookie')
  if (!raw) fail('SSO_SMOKE_COOKIE_MISSING')
  const match = raw.split(';')[0]
  if (!match.startsWith(name + '=') || match.length <= name.length + 1) fail('SSO_SMOKE_COOKIE_INVALID')
  return match
}

function location(response, origin, path) {
  if (response.status !== 303) fail('SSO_SMOKE_REDIRECT_INVALID')
  const raw = response.headers.get('location')
  if (!raw) fail('SSO_SMOKE_REDIRECT_INVALID')
  const url = new URL(raw)
  if (url.origin !== origin || url.pathname !== path) fail('SSO_SMOKE_REDIRECT_INVALID')
  return url
}

export async function runOrgmasterPrincipalSsoSmoke({
  fetchImpl, brokerOrigin, appOrigin, canonicalOrigin, idToken,
  mePath, logoutPath, authenticatedProbes, negativeProbes, tokenExpiresInSeconds, now = () => new Date().toISOString(),
}) {
  const broker = exactOrigin(brokerOrigin)
  const app = exactOrigin(appOrigin)
  const canonical = exactOrigin(canonicalOrigin)
  if (typeof idToken !== 'string' || idToken.length < 100 || !Array.isArray(authenticatedProbes) || !Array.isArray(negativeProbes)) fail('SSO_SMOKE_INPUT_INVALID')
  const call = async (url, options = {}) => fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000), ...options })
  const source = await call(broker + '/api/auth/firebase/session', {
    method: 'POST', headers: { Origin: broker, 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }),
  })
  if (source.status !== 200) fail('SSO_SMOKE_PLATFORM_SESSION_FAILED')
  const platformCookie = cookie(source, 'jenfu_session')
  const sourceView = await source.json()
  const expectedPrincipal = sourceView?.user?.principalId
  if (typeof expectedPrincipal !== 'string' || !expectedPrincipal) fail('SSO_SMOKE_PLATFORM_PRINCIPAL_MISSING')
  const start = await call(app + '/api/auth/jenfu-sso/start')
  const authorize = location(start, broker, '/api/sso/authorize')
  if (authorize.searchParams.get('client_id') !== 'orgmaster' || authorize.searchParams.get('redirect_uri') !== canonical + '/api/auth/jenfu-sso/callback') fail('SSO_SMOKE_AUTHORIZE_INVALID')
  const txCookie = cookie(start, '__Host-jenfu_sso_tx')
  const authorized = await call(authorize.toString(), { headers: { Cookie: platformCookie } })
  const callback = location(authorized, canonical, '/api/auth/jenfu-sso/callback')
  if (callback.searchParams.get('state') !== authorize.searchParams.get('state')
    || callback.searchParams.get('iss') !== broker + '/api/sso'
    || !/^[A-Za-z0-9_-]{43}$/u.test(callback.searchParams.get('code') ?? '')) fail('SSO_SMOKE_CALLBACK_INVALID')
  const exchanged = await call(app + callback.pathname + callback.search, { headers: { Cookie: txCookie } })
  location(exchanged, canonical, '/')
  const orgCookie = cookie(exchanged, 'orgmaster_session')
  const observations = [{ id: 'platform-principal-session', status: source.status }, { id: 'orgmaster-sso-start', status: start.status }, { id: 'orgmaster-sso-authorize', status: authorized.status }, { id: 'orgmaster-sso-callback', status: exchanged.status }]
  const me = await call(app + mePath, { headers: { Cookie: orgCookie } })
  if (me.status !== 200 || (await me.json())?.user?.principalId !== expectedPrincipal) fail('SSO_SMOKE_PRINCIPAL_MISMATCH')
  observations.push({ id: 'session-reload', status: me.status })
  for (const probe of authenticatedProbes) {
    const response = await call(app + probe.path, { method: probe.method ?? 'GET', headers: { Cookie: orgCookie, ...(probe.body ? { 'Content-Type': 'application/json' } : {}) }, body: probe.body ? JSON.stringify(probe.body) : undefined })
    if (response.status !== probe.expectedStatus || response.headers.get('location')) fail('SSO_SMOKE_AUTHORIZED_PROBE_FAILED')
    observations.push({ id: probe.id, status: response.status })
  }
  for (const probe of negativeProbes) {
    const response = await call(app + probe.path, { method: probe.method ?? 'GET', headers: probe.body ? { 'Content-Type': 'application/json' } : {}, body: probe.body ? JSON.stringify(probe.body) : undefined })
    if (response.status !== probe.expectedStatus || response.headers.get('location')) fail('SSO_SMOKE_NEGATIVE_PROBE_FAILED')
    observations.push({ id: probe.id, status: response.status })
  }
  const logout = await call(app + logoutPath, { method: 'POST', headers: { Origin: canonical, Cookie: orgCookie, 'Content-Type': 'application/json' }, body: '{}' })
  if (logout.status !== 200) fail('SSO_SMOKE_LOGOUT_FAILED')
  const revoked = await call(app + mePath, { headers: { Cookie: orgCookie } })
  if (revoked.status !== 401) fail('SSO_SMOKE_REVOCATION_FAILED')
  observations.push({ id: 'session-revoked', status: revoked.status })
  return { origin: app, tokenSource: 'FIREBASE_REFRESH_TOKEN_PLATFORM_SSO_V2', tokenExpiresInSeconds, observations, status: 'PASS', observedAt: now() }
}
