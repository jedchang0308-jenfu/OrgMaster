import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync, execFileSync } from 'node:child_process'
import { chromium } from 'playwright'
import { inspectPortOwnership } from './dev-local.mjs'

const root = process.cwd()
const base = process.argv[2]
assert.match(base, /^http:\/\/localhost:(1010|12010)$/)
const port = new URL(base).port
const runtime = await inspectPortOwnership({ port: Number(port), projectRoot: root })
assert.equal(runtime.state, 'running', 'refuse a runtime without exact worktree ownership')
const runId = new Date().toISOString().replace(/[:.]/g, '-')
const output = path.join(root, 'output', 'playwright', 'dev060', port, runId)
fs.mkdirSync(output, { recursive: true })
const governor = process.env.DEV060_GOVERNOR_SCRIPT
const session = process.env.DEV060_GOVERNOR_SESSION
assert.ok(governor && session, 'governor binding required')
const results = [], responses = [], pageErrors = []
let browserServer, browser, page, browserFingerprint
function fingerprint(pid) {
  const code = "import sys,json;sys.path.append(sys.argv[1]);from platforms.windows import WindowsPlatformServices;print(json.dumps(WindowsPlatformServices().process_fingerprint(int(sys.argv[2]))))"
  return JSON.parse(execFileSync('python', ['-c', code, path.dirname(governor), String(pid)], { encoding: 'utf8', windowsHide: true }))
}
function govern(args) {
  const r = spawnSync('python', [governor, ...args, '--agent-host', 'codex', '--format', 'json'], { encoding: 'utf8', windowsHide: true })
  assert.equal(r.status, 0, r.stderr || r.stdout)
  const result = JSON.parse(r.stdout)
  assert.equal(result.errors.length, 0, r.stdout)
  return result
}
async function snapshot(name) {
  fs.writeFileSync(path.join(output, `${name}.txt`), await page.locator('body').innerText())
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true })
}
async function step(name, action) {
  await action()
  results.push({ name, result: 'PASS' })
  console.log(`PASS ${port} ${name}`)
}
const projectionCalls = () => responses.filter(x => x.path === '/api/orgmaster/governance/session').length
async function login(profileId) {
  const result = await page.context().request.post(`${base}/api/auth/development/session`, { headers: { origin: base }, data: { profileId } })
  assert.equal(result.status(), 200)
}
async function reloadReady() {
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.getByRole('navigation', { name: '功能清單' }).waitFor()
  await page.getByText('正在確認操作權限…', { exact: true }).waitFor({ state: 'hidden' })
  await page.waitForFunction(() => document.querySelector('[aria-label="功能清單"] button[aria-label^="員工"]')?.disabled === false)
}
async function trigger(reason) {
  await page.evaluate(async value => { const api = await import('/src/auth/permissionInvalidation.ts'); api.invalidateOrgMasterPermissions(value) }, reason)
}
function hashSources() {
  const names = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'src', 'server', 'vite.config.ts', 'package-lock.json'], { encoding: 'utf8' }).trim().split(/\r?\n/).sort()
  const entries = names.map(name => [name, createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex')])
  return createHash('sha256').update(JSON.stringify(entries)).digest('hex')
}
let error
try {
  console.log(JSON.stringify({ runtimeDeclaration: { root, purpose: 'DEV-060 task-owned local browser acceptance', port, parentPid: process.pid, cleanup: 'close owned Chromium server; runtime launcher cleanup handled by owner', evidenceScope: 'LOCAL_SIMULATED', productionWrites: false } }))
  browserServer = await chromium.launchServer({ headless: true })
  browserFingerprint = fingerprint(browserServer.process().pid)
  try {
    govern(['session', 'runtime', 'register', '--session', session, '--pid', String(browserFingerprint.pid), '--start-token', browserFingerprint.start_token, '--executable', browserFingerprint.executable, '--parent-pid', String(process.pid), '--purpose', `DEV-060 ${port} owned Chromium`, '--cleanup-condition', 'browser server closed after acceptance'])
  } catch (failure) { await browserServer.close(); throw failure }
  browser = await chromium.connect(browserServer.wsEndpoint())
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  page = await context.newPage()
  await page.route('**/api/auth/development/profiles', async route => {
    const response = await route.fetch()
    await route.fulfill({ response, json: { ...await response.json(), employeeNumberManagementEnabled: true } })
  })
  page.setDefaultTimeout(15000)
  page.on('pageerror', value => pageErrors.push(value.message))
  page.on('response', response => { const url = new URL(response.url()); if (url.pathname.startsWith('/api/')) responses.push({ path: url.pathname, status: response.status() }) })
  await page.goto(base, { waitUntil: 'networkidle' })
  await login('administrator')
  // Bootstrap only this task-owned, previously absent local data directory.
  const data = path.join(root, 'data')
  const marker = path.join(data, '.dev060-disposable.json')
  if (!fs.existsSync(data)) {
    const boot = await page.evaluate(async () => {
      const { screenshotOrganizationState } = await import('/src/screenshotData.ts')
      const { createOrgDocumentFile } = await import('/src/documentStorage.ts')
      const response = await fetch('/api/orgmaster/document', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(createOrgDocumentFile(screenshotOrganizationState, 'document', new Date().toISOString())) })
      return response.status
    })
    assert.equal(boot, 200)
    fs.writeFileSync(marker, JSON.stringify({ task: 'DEV-060', evidenceScope: 'LOCAL_SIMULATED' }))
  } else assert.ok(fs.existsSync(marker), 'refuse unknown existing data directory')
  assert.equal((await context.request.get(`${base}/api/orgmaster/workspace`)).status(), 200)
  responses.length = 0
  await reloadReady()
  await step('one-projection-three-modules', async () => {
    const navigation = page.getByRole('navigation', { name: '功能清單' })
    for (const [label, name] of [['角色治理', 'governance'], ['員工', 'employees'], ['管理辦法', 'management-methods']]) {
      const button = navigation.getByRole('button', { name: new RegExp(`^${label}`) })
      assert.equal(await button.isEnabled(), true)
      if (await button.getAttribute('aria-pressed') === 'true') await button.click()
      await button.click()
      assert.equal(await button.getAttribute('aria-pressed'), 'true')
      await page.waitForLoadState('networkidle')
      await snapshot(name)
    }
    assert.equal(projectionCalls(), 1)
  })
  await step('resource-capability-denies-create-despite-global-allow', async () => {
    const moduleResponse = await context.request.get(`${base}/api/orgmaster/management-methods/session`)
    assert.equal(moduleResponse.status(), 200)
    const moduleFixture = await moduleResponse.json()
    await page.route('**/api/orgmaster/management-methods/session', route => route.fulfill({ status: 200, json: { ...moduleFixture, capabilities: { ...moduleFixture.capabilities, create: false } } }))
    const navigation = page.getByRole('navigation', { name: '功能清單' })
    await navigation.getByRole('button', { name: /^管理辦法/ }).click()
    await navigation.getByRole('button', { name: /^管理辦法/ }).click()
    await page.locator('[data-management-methods-page]').waitFor()
    await page.waitForLoadState('networkidle')
    assert.equal(await page.locator('[data-management-methods-page]').getByRole('button', { name: '新增', exact: true }).count(), 0)
    await snapshot('resource-denied')
    await page.unroute('**/api/orgmaster/management-methods/session')
  })
  await step('employee-identity-resource-denies-actions-despite-global-allow', async () => {
    const workspace = JSON.parse(fs.readFileSync(path.join(data, 'orgmaster-workspace.v1.json')))
    const document = JSON.parse(fs.readFileSync(path.join(data, 'orgmaster-versions', `${workspace.currentVersionId}.json`)))
    const employeeId = document.state.employees.find(value => value.status === 'active').id
    const endpoint = `${base}/api/orgmaster/employees/${employeeId}/managed-identity`
    const response = await context.request.get(endpoint)
    assert.equal(response.status(), 200)
    const resource = await response.json()
    await page.route(endpoint, route => route.fulfill({ status: 200, json: { ...resource, capabilities: Object.fromEntries(Object.keys(resource.capabilities).map(code => [code, false])) } }))
    await page.goto(`${base}/?panels=employees&focus=employees&select=employee%3A${employeeId}&details=employees&employee=${employeeId}`, { waitUntil: 'networkidle' })
    const section = page.locator('.employee-identity-section')
    await section.waitFor()
    assert.equal(await section.getByRole('button').count(), 0)
    await snapshot('employee-identity-resource-denied')
    await page.unroute(endpoint)
  })
  const actual = await context.request.get(`${base}/api/orgmaster/governance/session`)
  const fixture = await actual.json()
  assert.equal(actual.status(), 200)
  let mode = 'ready', revision = 1, deny = false
  await page.route('**/api/orgmaster/governance/session', async route => {
    if (mode === 'timeout') { await new Promise(resolve => setTimeout(resolve, 11000)); await route.abort().catch(() => {}); return }
    if (mode === '503' || mode === '401') { await route.fulfill({ status: Number(mode), json: { code: 'DEV060_INJECTED_STATUS' } }); return }
    await route.fulfill({ status: 200, headers: { 'cache-control': 'no-store' }, json: { ...fixture, governanceRevision: `browser-revision-${revision}`, permissions: Object.fromEntries(Object.keys(fixture.permissions).map(code => [code, !deny])) } })
  })
  await step('503-retry-keeps-unknown-distinct', async () => {
    mode = '503'; await trigger('permissions-changed')
    await page.getByText('目前無法確認操作權限。', { exact: false }).waitFor()
    await snapshot('unavailable-503')
    mode = 'ready'; revision++
    await page.getByRole('button', { name: '重試權限' }).click()
    await page.getByRole('button', { name: '重試權限' }).waitFor({ state: 'hidden' })
  })
  await step('200-denied-is-ready', async () => {
    deny = true; await trigger('permissions-changed'); await page.waitForLoadState('networkidle')
    await page.waitForFunction(() => document.querySelector('[aria-label="功能清單"] button[aria-label^="角色治理"]')?.disabled === true)
    assert.equal(await page.getByRole('button', { name: '重試權限' }).count(), 0)
    await snapshot('ready-denied')
    deny = false; await trigger('permissions-changed'); await page.waitForLoadState('networkidle')
  })
  await step('publish-activation-invalidate-once-with-new-revision', async () => {
    await page.route('**/api/orgmaster/governance/versions', route => route.fulfill({ status: 200, json: {} }))
    await page.route('**/api/orgmaster/governance/active-version', route => route.fulfill({ status: 200, json: {} }))
    for (const operation of ['publish', 'activate']) {
      const before = projectionCalls(); revision++
      await page.evaluate(async action => { const api = await import('/src/governance/apiClient.ts'); if (action === 'publish') await api.publishGovernancePolicy('fixture-r', 'fixture-publish', 'fixture', 'fixture-workspace'); else await api.setActiveGovernanceVersion('fixture-r', 'fixture-activate', 'fixture', 'fixture-version') }, operation)
      await page.waitForLoadState('networkidle')
      assert.equal(projectionCalls(), before + 1)
    }
  })
  await step('403-clears-stale-permission-without-replay', async () => {
    await page.route('**/api/orgmaster/governance/draft', route => route.fulfill({ status: 403, json: { error: 'GOVERNANCE_ADMIN_REQUIRED' } }))
    deny = true
    const before = responses.filter(value => value.path.endsWith('/governance/draft')).length
    const result = await page.evaluate(async () => { const api = await import('/src/governance/apiClient.ts'); try { await api.patchGovernanceDraft('fixture-r', { type: 'SET_PERMISSION_STATUS', commandId: 'fixture-rejected', reason: 'fixture', id: 'fixture', status: 'inactive' }); return 0 } catch (error) { return error.status } })
    assert.equal(result, 403)
    await page.getByText('操作權限可能已變更。', { exact: false }).waitFor()
    await page.waitForLoadState('networkidle')
    assert.equal(responses.filter(value => value.path.endsWith('/governance/draft')).length, before + 1)
    const viewport = await page.evaluate(() => ({ top: document.querySelector('.app-shell').getBoundingClientRect().top, height: document.documentElement.scrollHeight, viewportHeight: innerHeight }))
    assert.equal(viewport.top, 0)
    assert.ok(viewport.height <= viewport.viewportHeight + 1)
    await snapshot('forbidden-no-replay')
  })
  await step('timeout-retry', async () => {
    mode = 'timeout'; await trigger('permissions-changed')
    await page.getByRole('button', { name: '重試權限' }).waitFor({ timeout: 14000 })
    await snapshot('timeout')
    mode = 'ready'; deny = false
    await page.getByRole('button', { name: '重試權限' }).click()
    await page.getByRole('button', { name: '重試權限' }).waitFor({ state: 'hidden' })
  })
  await step('401-clears-shell-and-exposes-login-recovery', async () => {
    mode = '401'; await trigger('permissions-changed')
    await page.getByRole('button', { name: '返回登入' }).waitFor()
    assert.equal(await page.getByRole('navigation', { name: '功能清單' }).count(), 0)
    await snapshot('unauthenticated-401')
  })
  await page.unroute('**/api/orgmaster/governance/session')
  await step('principal-a-to-b-drops-a-navigation', async () => {
    const logout = await context.request.post(`${base}/api/auth/logout`, { headers: { origin: base }, data: {} })
    assert.equal(logout.status(), 200)
    await login('employee'); await reloadReady()
    assert.equal(await page.getByRole('navigation', { name: '功能清單' }).getByRole('button', { name: /^角色治理/ }).isDisabled(), true)
    await snapshot('principal-b')
    await context.request.post(`${base}/api/auth/logout`, { headers: { origin: base }, data: {} })
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByRole('heading', { name: '選擇測試角色' }).waitFor()
  })
  assert.deepEqual(pageErrors, [])
} catch (failure) {
  error = failure
  results.push({ name: 'first-failure', result: 'FAIL', message: failure.message })
  if (page) await snapshot('failure').catch(() => {})
} finally {
  if (browser) await browser.close()
  if (browserServer) await browserServer.close()
  if (browserFingerprint) govern(['session', 'runtime', 'release', '--session', session, '--pid', String(browserFingerprint.pid), '--start-token', browserFingerprint.start_token, '--reason', 'stopped'])
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ contract: 'DEV-060', evidenceScope: 'LOCAL_SIMULATED', base, gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceSha256: hashSources(), fixture: 'existing development profiles administrator/employee; UI-only employee-number feature discovery, resource capability denial, permission status/revision and no-op/rejected mutation response fixtures', browserVersion: browser?.version(), results, responses, pageErrors, productionWrites: false, realSso: 'DEFERRED / NOT_RUN' }, null, 2))
}
if (error) throw error
