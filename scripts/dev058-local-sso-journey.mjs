import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { spawn, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { withDev058Dev123Database } from './dev058-dev123-native-bootstrap.mjs'
import { prepareLocalSsoBaseline } from './dev058-local-sso-baseline.mjs'

// Real three-app runtime, Google ID tokens and normal browser sessions. Only
// prerequisite organization/manager fixtures are seeded in disposable local PG.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const governor = 'C:/Users/user/.codex/skills/ai-dev-resource-governor/scripts/resource_governor.py'
const session = process.env.ORGMASTER_DEV058_GOVERNOR_SESSION
const taskTemp = process.env.DEV058_LOCAL_SSO_TASK_TEMP
assert.match(session ?? '', /^[a-f0-9-]{36}$/iu)
assert.ok(taskTemp && path.isAbsolute(taskTemp), 'DEV058_LOCAL_SSO_TASK_TEMP_REQUIRED')
const privateDir = path.join(taskTemp, 'credentials')
const origins = { platform: 'https://localhost:11000', orgmaster: 'https://127.0.0.1:15000', 'ai-pdm': 'https://localhost:13000' }
const roots = { platform: process.env.PLATFORM_DEV058_ROOT, orgmaster: root, 'ai-pdm': process.env.PDM_DEV123_ROOT }
const records = []
const emit = (event, facts = {}) => console.log(JSON.stringify({ event, ...facts }))
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const stopFile = path.join(taskTemp, 'stop-local-sso')
let stopping = false
process.once('SIGINT', () => { stopping = true })
process.once('SIGTERM', () => { stopping = true })

function gov(args) {
  return JSON.parse(execFileSync('python', [governor, '--agent-host', 'codex', '--format', 'json', ...args],
    { encoding: 'utf8', windowsHide: true }))
}
function startToken(pid) {
  assert.ok(Number.isSafeInteger(pid) && pid > 0)
  return execFileSync('powershell.exe', ['-NoProfile', '-Command',
    `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().ToFileTimeUtc().ToString()`],
  { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}
async function freePort(port, host = '127.0.0.1') {
  const server = net.createServer()
  await new Promise((resolve, reject) => server.once('error', reject).listen(port, host, resolve))
  await new Promise(resolve => server.close(resolve))
}
function osEnvironment() {
  const env = {}
  for (const name of ['Path', 'PATH', 'PATHEXT', 'SystemRoot', 'WINDIR', 'ComSpec', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) {
    if (process.env[name]) env[name] = process.env[name]
  }
  return env
}
async function launch(kind, env) {
  const child = spawn(process.execPath, [path.join(root, 'scripts/dev058-local-sso-app.mjs')], {
    cwd: roots[kind], windowsHide: true, env,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  const record = { kind, child, pid: child.pid, port: Number(new URL(origins[kind]).port), registered: false, ready: false, failure: null }
  records.push(record)
  child.on('error', () => { record.failure = 'APP_PROCESS_START_FAILED' })
  child.on('exit', code => { record.exitCode = code; record.exited = true })
  let buffer = ''
  child.stdout.on('data', chunk => {
    buffer += chunk.toString('utf8')
    for (;;) {
      const index = buffer.indexOf('\n')
      if (index < 0) break
      const line = buffer.slice(0, index); buffer = buffer.slice(index + 1)
      try {
        const value = JSON.parse(line)
        if (value.event === 'listening') record.ready = true
        if (value.event === 'error') record.failure = value.code
        if (['owner', 'listening', 'error', 'stop', 'exit'].includes(value.event)) emit('app', { kind, ...value })
      } catch { record.failure = 'UNEXPECTED_APP_OUTPUT' }
    }
  })
  // Never forward framework stderr: callbacks can contain authorization codes.
  child.stderr.on('data', () => { record.stderrObserved = true })
  record.startToken = startToken(child.pid)
  const registration = gov(['session', 'runtime', 'register', '--session', session, '--pid', String(child.pid),
    '--start-token', record.startToken, '--executable', process.execPath, '--parent-pid', String(process.pid),
    '--purpose', `DEV058 isolated normal SSO ${kind}`, '--cleanup-condition', 'exact task app stopped and loopback port released', '--port', String(record.port)])
  assert.equal(registration.exit_code, 0, 'APP_RUNTIME_REGISTRATION_FAILED')
  record.registered = true
  const deadline = Date.now() + 180_000
  while (!record.ready && !record.failure && !record.exited && Date.now() < deadline) await sleep(250)
  assert.ok(record.ready && !record.failure, `${kind}:${record.failure ?? 'APP_START_TIMEOUT'}`)
  return record
}
async function stopApps() {
  for (const record of [...records].reverse()) {
    if (!record.exited && record.child.connected) record.child.send({ type: 'stop' })
    const deadline = Date.now() + 15_000
    while (!record.exited && Date.now() < deadline) await sleep(200)
    if (!record.exited) {
      assert.equal(startToken(record.pid), record.startToken, 'TASK_PROCESS_IDENTITY_CHANGED')
      execFileSync('taskkill.exe', ['/PID', String(record.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      await sleep(300)
    }
    await freePort(record.port)
    if (record.registered) {
      const result = gov(['session', 'runtime', 'release', '--session', session, '--pid', String(record.pid),
        '--start-token', record.startToken, '--reason', 'stopped'])
      assert.equal(result.exit_code, 0, 'APP_RUNTIME_RELEASE_FAILED')
    }
    emit('appCleanup', { kind: record.kind, portReleased: true })
  }
}

try {
  assert.ok(!fs.existsSync(stopFile), 'REMOVE_OWNED_STOP_MARKER_BEFORE_START')
  for (const origin of Object.values(origins)) await freePort(Number(new URL(origin).port))
  const services = JSON.parse(fs.readFileSync(path.join(taskTemp, 'service-identities.json'), 'utf8'))
  const savedIdentity = JSON.parse(fs.readFileSync(path.join(taskTemp, 'jed-identity-baseline.json'), 'utf8'))
  const publicResponse = await fetch('https://jenfu-platform-prod-9536592944.asia-east1.run.app/api/auth/mode')
  assert.equal(publicResponse.status, 200)
  const { firebase } = await publicResponse.json()
  assert.equal(firebase.projectId, 'jenfu-platform-prod')
  const common = {
    ...osEnvironment(), NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1',
    CLOUDSDK_CONFIG: privateDir, NODE_EXTRA_CA_CERTS: path.join(privateDir, 'local-ca.pem'),
    JENFU_FIREBASE_PROJECT_ID: firebase.projectId,
    JENFU_IDENTITY_ISSUER: `https://securetoken.google.com/${firebase.projectId}`,
    JENFU_IDENTITY_AUDIENCE: firebase.projectId,
    DEV058_TLS_CERT_PATH: path.join(privateDir, 'local-server.pem'),
    DEV058_TLS_KEY_PATH: path.join(privateDir, 'local-server-key.pem'),
    DEV010_N2_DATABASE_BOUNDARY: 'required', DEV010_N2_RUN_ID: 'dev058-local-google-sso',
  }
  // Obtain fresh verified IdP facts through the already-authorized readonly ADC.
  process.env.CLOUDSDK_CONFIG = privateDir
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS
  const { initializeApp, applicationDefault } = await import('firebase-admin/app')
  const { getAuth } = await import('firebase-admin/auth')
  const adminApp = initializeApp({ credential: applicationDefault(), projectId: firebase.projectId }, `dev058-local-${process.pid}`)
  const user = await getAuth(adminApp).getUser(savedIdentity.subject)
  assert.equal(user.emailVerified, true); assert.equal(user.disabled, false)
  const google = user.providerData.find(row => row.providerId === 'google.com')
  assert.equal(google?.uid, savedIdentity.googleSubject)
  const identity = { ...savedIdentity, email: user.email, issuer: common.JENFU_IDENTITY_ISSUER }
  await withDev058Dev123Database(async ({ admin, orgRuntime, pdmRuntime, platformRuntime, platformRuntimeUrl, handle, platformMigrationEvidence }) => {
    await pdmRuntime.end(); await platformRuntime.end()
    const orgUrl = `postgresql://jenfu_orgmaster_runtime@${handle.host}:${handle.port}/${handle.databaseName}?sslmode=disable`
    Object.assign(process.env, { ORGMASTER_PERSISTENCE_MODE: 'cloud-sql', ORGMASTER_POSTGRES_URL: orgUrl,
      ORGMASTER_POSTGRES_POOL_MAX: '1', ORGMASTER_GOVERNANCE_DATA_DIR: path.join(handle.taskRoot, 'org-governance') })
    const baseline = await prepareLocalSsoBaseline({ admin, orgRuntime, orgRoot: root, identity })
    await orgRuntime.end()
    const db = await import('../server/orgmasterDatabase.ts'); await db.closeOrgmasterDatabase()
    emit('baseline', { prepared: true, managerPrincipal: baseline.managerLink.principalId,
      targetPrincipal: baseline.targetLink.principalId, catalog: baseline.catalogMetadata,
      actualPlatformMigrations: platformMigrationEvidence.migrations.length,
      deferredUnusedBodies: platformMigrationEvidence.deferredUnusedBodies,
      pdmAccountsSeeded: false, sessionsSeeded: false, desiredCustomGrantSeeded: false })
    function appEnv(kind, extra) {
      return { ...common, DEV058_APP_KIND: kind, DEV058_APP_ROOT: roots[kind], DEV058_APP_ORIGIN: origins[kind],
        JENFU_SSO_IMPERSONATE_SERVICE_ACCOUNT: services[kind].email, ...extra }
    }
    const firebaseEnv = prefix => Object.fromEntries(Object.entries(firebase).map(([key, value]) => [
      prefix + ({ apiKey: 'API_KEY', authDomain: 'AUTH_DOMAIN', projectId: 'PROJECT_ID', appId: 'APP_ID' }[key]), value]))
    try {
      await launch('orgmaster', appEnv('orgmaster', {
        ...firebaseEnv('VITE_JENFU_FIREBASE_'), ORGMASTER_ROOT: root,
        ORGMASTER_PUBLIC_BASE_URL: origins.orgmaster, ORGMASTER_POSTGRES_URL: orgUrl,
        ORGMASTER_POSTGRES_POOL_MAX: '1', ORGMASTER_PERSISTENCE_MODE: 'cloud-sql',
        ORGMASTER_GOVERNANCE_DATA_DIR: path.join(handle.taskRoot, 'org-governance'),
        ORGMASTER_SESSION_HASH_PEPPER: crypto.randomBytes(32).toString('hex'),
        ORGMASTER_JENFU_SSO_HANDOFF_MODE: 'on', ORGMASTER_JENFU_SSO_BROKER_ORIGIN: origins.platform,
        ORGMASTER_PLATFORM_LOGIN_CALLER_EMAIL: services.platform.email,
        ORGMASTER_PLATFORM_LOGIN_CALLER_SUBJECT: services.platform.subject,
      }))
      await launch('platform', appEnv('platform', {
        ...firebaseEnv('NEXT_PUBLIC_JENFU_FIREBASE_'), JENFU_RUNTIME_ENVIRONMENT: 'development',
        PORTAL_PUBLIC_BASE_URL: origins.platform, PORTAL_POSTGRES_URL: platformRuntimeUrl,
        PORTAL_POSTGRES_POOL_MAX: '2', PORTAL_SESSION_HASH_PEPPER: crypto.randomBytes(32).toString('hex'),
        PORTAL_APP_ORGMASTER_BASE_URL: origins.orgmaster, PORTAL_APP_AI_PDM_BASE_URL: origins['ai-pdm'],
        PORTAL_APP_ORGMASTER_STATUS: 'active', PORTAL_APP_AI_PDM_STATUS: 'active',
        PORTAL_SUPPORT_HREF: 'mailto:jedchang0308@jenfu.com.tw', PORTAL_MANAGED_GOOGLE_LOGIN_ENABLED: 'true',
        ORGMASTER_PLATFORM_LOGIN_CALLER_EMAIL: services.platform.email,
        ORGMASTER_PLATFORM_LOGIN_CALLER_SUBJECT: services.platform.subject,
        ORGMASTER_GOOGLE_DIRECTORY_CUSTOMER_ID: 'C015t4buc',
        PORTAL_SSO_ORGMASTER_SERVICE_ACCOUNT_EMAIL: services.orgmaster.email,
        PORTAL_SSO_ORGMASTER_SERVICE_ACCOUNT_SUBJECT: services.orgmaster.subject,
        PORTAL_SSO_AI_PDM_SERVICE_ACCOUNT_EMAIL: services['ai-pdm'].email,
        PORTAL_SSO_AI_PDM_SERVICE_ACCOUNT_SUBJECT: services['ai-pdm'].subject,
        PORTAL_SSO_ORGMASTER_PHASE: 'launch', PORTAL_SSO_AI_PDM_PHASE: 'launch',
        PORTAL_SSO_ORGMASTER_HANDOFF_VERSION: 'v2', PORTAL_SSO_AI_PDM_HANDOFF_VERSION: 'v2',
      }))
      await launch('ai-pdm', appEnv('ai-pdm', {
        ...firebaseEnv('PDM_FIREBASE_'), PDM_NEXT_DIST_DIR: `.tmp/dev058-local-sso-${process.pid}`,
        PDM_DATA_DIR: path.join(handle.taskRoot, 'pdm-data'), PDM_REPOSITORY_DIR: path.join(handle.taskRoot, 'pdm-repository'),
        PDM_DB_PROVIDER: 'postgres', PDM_POSTGRES_URL: `postgresql://jenfu_ai_pdm_runtime@${handle.host}:${handle.port}/${handle.databaseName}?sslmode=disable`,
        PDM_POSTGRES_MAX_CONNECTIONS: '1', PDM_AUTH_MODE: 'firebase_bff', PDM_JENFU_PLATFORM_AUTH_MODE: 'on',
        PDM_JENFU_ENTITLEMENT_MODE: 'enforce', PDM_JENFU_SSO_HANDOFF_MODE: 'on',
        PDM_JENFU_SSO_BROKER_ORIGIN: origins.platform, PDM_PUBLIC_BASE_URL: origins['ai-pdm'],
        PDM_SESSION_ISSUER: origins['ai-pdm'], PDM_SESSION_AUDIENCE: 'ai-pdm',
        PDM_SESSION_CURRENT_KEY_ID: 'dev058-local', PDM_SESSION_CURRENT_SECRET: crypto.randomBytes(32).toString('hex'),
        PDM_TRUST_GOOGLE_WORKSPACE_MFA: 'true', PDM_ALLOW_GOOGLE_WORKSPACE_AAL1_PRIVILEGED: 'true',
        PDM_GOOGLE_WORKSPACE_DOMAINS: 'jenfu.com.tw',
      }))
      fs.writeFileSync(path.join(taskTemp, 'local-sso-runtime.json'), JSON.stringify({ pid: process.pid, origins,
        pgPort: handle.port, database: handle.databaseName, managerPrincipal: baseline.managerLink.principalId,
        targetPrincipal: baseline.targetLink.principalId, apps: records.map(({ kind, pid, port, startToken }) => ({ kind, pid, port, startToken })) }, null, 2))
      emit('localSsoReady', { origins, pgPort: handle.port, businessData: 'disposable local only', normalLogin: 'PENDING' })
      while (!stopping && !fs.existsSync(stopFile)) {
        assert.ok(records.every(record => !record.exited), 'APP_EXITED_DURING_JOURNEY')
        await sleep(500)
      }
      const counts = (await admin.query(`SELECT
        (SELECT count(*)::int FROM platform_core.portal_app_sessions) AS platform_sessions,
        (SELECT count(*)::int FROM ai_pdm_core.principal_accounts) AS pdm_accounts`)).rows[0]
      emit('runtimeReadback', counts)
    } finally { await stopApps() }
  })
} catch (error) {
  const raw = String(error.code ?? error.message ?? 'LOCAL_SSO_FAILED')
  const code = /^[A-Za-z0-9_:., -]{1,250}$/u.test(raw) ? raw : 'LOCAL_SSO_FAILED'
  emit('localSsoFailure', { code })
  process.exitCode = 1
}
