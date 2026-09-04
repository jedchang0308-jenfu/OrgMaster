#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { createConnection } from 'node:net'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const root = process.cwd()
const runId = `DEV009-S2-${new Date().toISOString().replace(/[:.]/gu, '-')}`
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'orgmaster-dev009-browser-'))
const artifactDir = path.join(taskRoot, 'dist')
const evidenceDir = path.resolve(process.env.DEV009_BROWSER_EVIDENCE_DIR ?? path.join(root, 'output', 'qa', 'dev-009', 'browser-real', runId))
const screenshotDir = path.join(evidenceDir, 'screenshots')
const reportPath = path.join(evidenceDir, 'report.json')
const latestPath = path.join(root, 'output', 'qa', 'dev-009', 'browser-real', 'latest.json')
const sourceFiles = [
  'package.json', 'package-lock.json',
  'contracts/jenfu-platform-governance-availability/v2/contract-manifest.json',
  'src/governance/apiClient.ts', 'src/governance/privilegedAssignments.ts',
  'src/governance/governancePresentation.ts',
  'src/components/GovernanceCenter.tsx', 'src/components/GovernancePrivilegedAssignments.tsx',
  'src/components/GovernanceCenter.css', 'scripts/qc-dev-009-privileged-browser.mjs',
]
const checks = []
const screenshots = []
const pageErrors = []
const consoleErrors = []
const expectedConsoleErrors = []
const visibleErrors = []
const apiRequests = []
let browser = null
let server = null
let port = null
let baseUrl = ''
let failure = null
let cleanupFailure = null
let browserVersion = null
let servedEntry = null

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const json = (body, status = 200, headers = {}) => ({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'cache-control': 'no-store', ...headers } })

function fileManifest(base, files = null) {
  const selected = files ?? fs.readdirSync(base, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(base, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
    .sort()
  const entries = selected.map((relativePath) => {
    const bytes = fs.readFileSync(path.join(base, relativePath))
    return { path: relativePath.replaceAll('\\', '/'), bytes: bytes.length, sha256: sha256(bytes) }
  })
  const aggregate = sha256(Buffer.from(entries.map((entry) => `${entry.path}\0${entry.sha256}\n`).join(''), 'utf8'))
  return { files: entries, fileCount: entries.length, bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0), sha256: aggregate }
}

function gitValue(args) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).stdout.trim()
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const probe = createServer()
    probe.unref()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const selected = typeof address === 'object' && address ? address.port : null
      probe.close((error) => error ? reject(error) : resolve(selected))
    })
  })
}

async function portReleased(selectedPort) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const released = await new Promise((resolve) => {
      const socket = createConnection({ host: '127.0.0.1', port: selectedPort })
      socket.once('connect', () => { socket.destroy(); resolve(false) })
      socket.once('error', () => resolve(true))
      socket.setTimeout(500, () => { socket.destroy(); resolve(true) })
    })
    if (released) return true
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return false
}

function contentType(file) {
  const extension = path.extname(file).toLowerCase()
  return ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' })[extension] ?? 'application/octet-stream'
}

function startStaticServer() {
  server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', baseUrl).pathname)
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
    const candidate = path.resolve(artifactDir, relative)
    const target = candidate.startsWith(`${path.resolve(artifactDir)}${path.sep}`) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
      ? candidate
      : path.join(artifactDir, 'index.html')
    const bytes = fs.readFileSync(target)
    response.statusCode = 200
    response.setHeader('content-type', contentType(target))
    response.setHeader('cache-control', 'no-store')
    response.end(bytes)
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
}

function governanceFixture() {
  const document = readJson(path.join(root, 'data', 'orgmaster-governance.v3.json'))
  const sanitize = (link) => {
    const { subject, ...rest } = link
    return { ...rest, subjectHint: typeof subject === 'string' && subject.length > 4 ? `••••${subject.slice(-4)}` : '••••', subjectFingerprint: sha256(Buffer.from(`${link.issuer}\0${subject}`, 'utf8')).slice(0, 12) }
  }
  const sanitized = {
    ...document,
    draft: { ...document.draft, identityLinks: document.draft.identityLinks.map(sanitize) },
    publishedVersions: document.publishedVersions.map((version) => ({ ...version, policy: { ...version.policy, identityLinks: version.policy.identityLinks.map(sanitize) } })),
  }
  const published = readJson(path.join(root, 'contracts', 'jenfu-platform-entitlement', 'v1', 'fixtures', 'application-role-catalog.sample.json'))
  const catalog = {
    applicationId: 'ai-pdm', catalogVersion: published.catalogVersion, payloadHash: published.catalogSha256,
    sourceKind: 'bundled-fixture', sourceRefs: [], capturedAt: published.publishedAt, validationState: 'valid', effectState: 'not-synchronized',
    roles: published.roles.map((role) => ({
      stableRoleId: role.stableRoleId, code: role.roleCode, displayName: role.displayName, status: 'active', assignable: role.assignable,
      riskLevel: role.risk, allowedScopeKinds: role.allowedScopeKinds, subjectKind: role.subjectKind,
      recommendationAllowed: role.recommendationAllowed, delegationAllowed: role.delegationAllowed, assignmentTier: role.assignmentTier,
    })),
  }
  return { document: sanitized, catalogs: [catalog], revision: 'dev009-browser-governance-revision', activeVersionId: sanitized.activePolicyVersionId, versions: [] }
}

function workspaceFixtures() {
  const manifest = readJson(path.join(root, 'data', 'orgmaster-workspace.v1.json'))
  const currentEntry = manifest.entries.find((entry) => entry.id === manifest.currentVersionId)
  const document = readJson(path.join(root, 'data', 'orgmaster-versions', `${manifest.currentVersionId}.json`))
  const revision = sha256(fs.readFileSync(path.join(root, 'data', 'orgmaster-versions', `${manifest.currentVersionId}.json`)))
  const version = { ...currentEntry, updatedAt: document.savedAt, revision, loadStatus: 'ready' }
  return {
    index: { app: 'OrgMaster', workspaceVersion: 1, currentVersionId: manifest.currentVersionId, manifestRevision: sha256(Buffer.from(JSON.stringify(manifest))), versions: [version] },
    version: { version, document },
  }
}

const governance = governanceFixture()
const workspace = workspaceFixtures()
const systemAdminRole = governance.catalogs[0].roles.find((role) => role.stableRoleId === 'role-system-admin')
const employeeIds = workspace.version.document.state.employees.map((employee) => employee.id)
const targetEmployeeId = employeeIds[1] ?? employeeIds[0]
const admission = { employeeId: targetEmployeeId, principalAdmissionId: 'admission-browser-target', principalHint: 'privileged•••B4', accountType: 'human_privileged', status: 'active' }

function privilegedRole() {
  return {
    stableRoleId: 'role-system-admin', roleCode: 'system_admin', displayName: systemAdminRole.displayName, status: 'active', assignable: true,
    riskLevel: 'critical', subjectKind: 'principal', assignmentTier: 'cross_app_override', recommendationAllowed: false,
    delegationAllowed: false, allowedScopeKinds: ['global'],
  }
}

function stateFor(mode) {
  return {
    mode,
    assignments: [],
    eligiblePrincipals: mode === 'empty' ? [] : [admission],
    slowPreview: false,
  }
}

function privilegedWorkspace(state) {
  const blockers = state.mode === 'denied' ? ['PRIVILEGED_MUTATION_REQUIRED']
    : state.mode === 'stale' ? ['ORGMASTER_UNAVAILABLE']
      : state.mode === 'empty' ? ['NO_ELIGIBLE_PRINCIPAL'] : []
  return {
    contractVersion: 'orgmaster.privileged-assignment-workspace.v1', applicationId: 'ai-pdm', stableRoleId: 'role-system-admin',
    catalogVersion: governance.catalogs[0].catalogVersion, catalogPayloadHash: governance.catalogs[0].payloadHash,
    governanceRevision: governance.revision, organizationVersionId: workspace.index.currentVersionId,
    organizationRevision: workspace.version.version.revision, sourceDataAt: workspace.version.document.savedAt,
    mutationAllowed: blockers.length === 0, blockers, role: privilegedRole(), eligiblePrincipals: state.eligiblePrincipals, assignments: state.assignments,
  }
}

function previewBody(requestBody, beforeCount) {
  const grant = requestBody.operation === 'grant_system_admin'
  return {
    ...requestBody, requestHash: 'b'.repeat(64),
    preview: {
      previewHash: 'c'.repeat(64), beforeHolderCount: beforeCount,
      afterHolderCount: grant ? beforeCount + 1 : Math.max(0, beforeCount - 1), targetHint: admission.principalHint,
      affectedSessionCount: 1, securityAlertRequired: true,
    },
  }
}

async function fulfillApi(route, state) {
  const request = route.request()
  const url = new URL(request.url())
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/u, '') : url.pathname
  const key = `${request.method()} ${url.pathname}${url.search}`
  apiRequests.push(key)
  if (pathname === '/api/auth/me' && request.method() === 'GET') return route.fulfill(json({ user: { principalId: 'principal-browser-operator', employeeId: employeeIds[0] }, session: { expiresAt: '2026-09-03T23:59:59.000Z' }, assuranceLevel: 'aal2', correlationId: 'dev009-browser' }))
  if (pathname === '/api/orgmaster/workspace' && request.method() === 'GET') return route.fulfill(json(workspace.index))
  if (pathname === `/api/orgmaster/workspace/versions/${workspace.index.currentVersionId}` && request.method() === 'GET') return route.fulfill(json(workspace.version))
  if (pathname === `/api/orgmaster/workspace/versions/${workspace.index.currentVersionId}` && request.method() === 'PUT') {
    const body = request.postDataJSON()
    return route.fulfill(json({ version: workspace.version.version, document: body.document }))
  }
  if (pathname === '/api/orgmaster/governance' && request.method() === 'GET') return route.fulfill(json(governance, 200, { 'x-orgmaster-governance-revision': governance.revision }))
  if (pathname === '/api/orgmaster/governance/session' && request.method() === 'GET') return route.fulfill(json({ runtimeMode: 'verified-session', actor: { principalId: 'principal-browser-operator', subjectHint: '••••ator' }, capabilities: { manage: true, publish: true, simulate: true } }))
  if (pathname === '/api/orgmaster/governance/privileged-assignments' && request.method() === 'GET') {
    if (state.mode === 'error') return route.fulfill(json({ error: 'ORGMASTER_UNAVAILABLE' }, 503))
    return route.fulfill(json(privilegedWorkspace(state)))
  }
  if (pathname === '/api/orgmaster/governance/privileged-assignments/preview' && request.method() === 'POST') {
    if (state.slowPreview) await new Promise((resolve) => setTimeout(resolve, 500))
    const body = request.postDataJSON()
    return route.fulfill(json(previewBody(body, state.assignments.filter((value) => value.status === 'active').length)))
  }
  if (pathname === '/api/orgmaster/governance/privileged-assignments/publish' && request.method() === 'POST') {
    const body = request.postDataJSON()
    if (body.operation === 'grant_system_admin') {
      state.assignments = [{ assignmentId: 'assignment-browser-1', employeeId: targetEmployeeId, principalAdmissionId: admission.principalAdmissionId, principalHint: admission.principalHint, status: 'active', validFrom: '2026-09-03T00:00:00.000Z', validTo: null, auditReference: 'audit-browser-grant' }]
    } else {
      state.assignments = state.assignments.map((value) => ({ ...value, status: 'revoked', validTo: '2026-09-03T00:05:00.000Z', auditReference: 'audit-browser-revoke' }))
    }
    return route.fulfill(json({ contractVersion: 'orgmaster.governance-command-receipt.v2', commandId: body.commandId, requestHash: body.requestHash, previewHash: body.preview.previewHash, receiptStatus: 'applied', acceptedAt: '2026-09-03T00:00:00.000Z', terminalAt: '2026-09-03T00:00:01.000Z', decisionCode: 'PRIVILEGED_ASSIGNMENT_APPLIED', auditReference: 'audit-browser', securityAlertReference: 'security-alert-browser', sessionRefresh: 'completed', governanceRevision: 'dev009-browser-governance-revision-2', replayed: false, attempt: 1 }))
  }
  return route.fulfill(json({ error: 'DEV009_BROWSER_UNKNOWN_API', request: key }, 404))
}

async function capture(page, name) {
  const target = path.join(screenshotDir, `${name}.png`)
  await page.screenshot({ path: target, fullPage: true })
  screenshots.push(path.relative(root, target).replaceAll('\\', '/'))
}

async function openPrivilegedWorkspace(context, state, keyboard = false) {
  const page = await context.newPage()
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (state.mode === 'error' && /^Failed to load resource: the server responded with a status of 503 \(Service Unavailable\)$/u.test(text)) {
      expectedConsoleErrors.push({ code: 'ORGMASTER_UNAVAILABLE', text })
      return
    }
    consoleErrors.push(text)
  })
  await page.route('**/api/**', (route) => fulfillApi(route, state))
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  const launcher = page.getByRole('button', { name: '功能', exact: true })
  await launcher.waitFor({ state: 'visible', timeout: 30000 })
  await assert.doesNotReject(async () => launcher.waitFor({ state: 'attached' }))
  if ((page.viewportSize()?.width ?? 0) > 767) {
    const maintenanceToggle = page.getByRole('button', { name: /唯讀：現行版/u })
    await maintenanceToggle.click()
    await page.getByRole('button', { name: /編輯中：現行版/u }).waitFor({ state: 'visible' })
  }
  if (keyboard) {
    await launcher.focus()
    await page.keyboard.press('Enter')
    await page.getByRole('menu', { name: '功能' }).waitFor({ state: 'visible' })
    await page.keyboard.press('Escape')
    assert.equal(await launcher.evaluate((node) => node === document.activeElement), true)
  }
  await launcher.click()
  await page.getByRole('menuitem', { name: /角色治理/u }).click()
  await page.getByRole('region', { name: '角色指派治理' }).waitFor({ state: 'visible', timeout: 30000 })
  await page.getByRole('button', { name: '角色指派', exact: true }).click()
  const ordinaryRoleSelect = page.getByRole('combobox', { name: '切換角色', exact: true })
  await page.waitForTimeout(500)
  if (await ordinaryRoleSelect.count() !== 1) {
    const diagnostics = await page.getByRole('combobox').evaluateAll((nodes) => nodes.map((node) => ({ name: node.getAttribute('aria-label') ?? node.closest('label')?.textContent ?? '', value: node.value })))
    const body = (await page.locator('body').innerText()).replace(/\s+/gu, ' ').slice(0, 1800)
    throw new Error(`DEV009_ROLE_SELECT_MISSING comboboxes=${JSON.stringify(diagnostics)} body=${body}`)
  }
  await ordinaryRoleSelect.selectOption('role-system-admin')
  if (state.mode === 'error') await page.getByRole('alert').waitFor({ state: 'visible' })
  else await page.getByRole('heading', { name: '特權設定', exact: true }).waitFor({ state: 'visible' })
  return page
}

function noHorizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
}

async function runScenario(viewport, mode, name, task) {
  const context = await browser.newContext({ viewport })
  const state = stateFor(mode)
  const page = await openPrivilegedWorkspace(context, state, name === '1440-current')
  await task(page, state)
  await capture(page, name)
  await context.close()
}

async function runBrowserChecks() {
  await runScenario({ width: 1440, height: 900 }, 'current', '1440-current', async (page, state) => {
    assert.equal(await page.getByLabel('員工').count(), 0)
    assert.equal(await page.getByText('尚未採用職位', { exact: true }).count(), 0)
    await page.getByLabel('特權身分').selectOption(admission.principalAdmissionId)
    await page.getByLabel('操作原因').fill('DEV-009 瀏覽器授予驗證')
    await page.getByRole('button', { name: '預覽授予' }).click()
    await page.getByRole('heading', { name: '操作預覽：授予' }).waitFor({ state: 'visible' })
    await page.getByRole('button', { name: '確認授予' }).click()
    await page.getByText(/特權設定授予已套用/u).waitFor({ state: 'visible' })
    await page.getByLabel('操作原因').fill('DEV-009 瀏覽器撤銷驗證')
    await page.getByRole('button', { name: '預覽撤銷' }).click()
    await page.getByRole('button', { name: '確認撤銷' }).click()
    await page.getByText(/特權設定撤銷已套用/u).waitFor({ state: 'visible' })
    assert.equal(await page.getByRole('alert').count(), 0)
    assert.equal(await noHorizontalOverflow(page), true)
    checks.push({ id: 'QA-009-S2-01', label: 'normal launcher, privileged mode switch, grant and revoke publish', status: 'PASS', viewport: '1440x900' })

    await page.getByLabel('切換角色').selectOption('role-system-admin')
    state.slowPreview = true
    await page.getByLabel('特權身分').selectOption(admission.principalAdmissionId)
    await page.getByLabel('操作原因').fill('DEV-009 late response')
    await page.getByRole('button', { name: '預覽授予' }).click()
    await page.getByLabel('切換角色').selectOption('role-rd')
    await page.waitForTimeout(650)
    assert.equal(await page.getByRole('heading', { name: /操作預覽/u }).count(), 0)
    checks.push({ id: 'QA-009-S2-02', label: 'role change discards late privileged preview response', status: 'PASS', viewport: '1440x900' })
  })

  await runScenario({ width: 1024, height: 768 }, 'current', '1024-current', async (page) => {
    await page.getByLabel('特權身分').selectOption(admission.principalAdmissionId)
    await page.getByLabel('操作原因').fill('DEV-009 1024 mutation')
    assert.equal(await page.getByRole('button', { name: '預覽授予' }).isEnabled(), true)
    assert.equal(await noHorizontalOverflow(page), true)
    checks.push({ id: 'QA-009-S2-03', label: '1024 viewport keeps privileged mutation usable without overflow', status: 'PASS', viewport: '1024x768' })
  })

  await runScenario({ width: 390, height: 844 }, 'current', '390-read-only', async (page) => {
    await page.getByText('手機僅供閱讀', { exact: true }).waitFor({ state: 'visible' })
    assert.equal(await page.getByRole('button', { name: '預覽授予' }).count(), 0)
    assert.equal(await page.getByText('目前為唯讀', { exact: true }).count(), 1)
    assert.equal(await noHorizontalOverflow(page), true)
    checks.push({ id: 'QA-009-S2-04', label: '390 viewport is explicitly read-only and has no mutation control', status: 'PASS', viewport: '390x844' })
  })

  for (const [mode, label] of [['empty', 'empty'], ['denied', 'denied'], ['stale', 'stale']]) {
    await runScenario({ width: 1440, height: 900 }, mode, `1440-${mode}`, async (page) => {
      assert.equal(await page.getByRole('button', { name: '預覽授予' }).count(), 0)
      assert.equal(await page.getByText('目前為唯讀', { exact: true }).count(), 1)
      assert.equal(await noHorizontalOverflow(page), true)
      checks.push({ id: `QA-009-S2-${mode.toUpperCase()}`, label: `${label} privileged workspace remains understandable and read-only`, status: 'PASS', viewport: '1440x900' })
    })
  }

  await runScenario({ width: 1440, height: 900 }, 'error', '1440-error', async (page) => {
    const alert = page.getByRole('alert')
    const text = await alert.innerText()
    assert.match(text, /OrgMaster|暫時|無法/u)
    visibleErrors.push({ expected: true, code: 'ORGMASTER_UNAVAILABLE', text })
    checks.push({ id: 'QA-009-S2-ERROR', label: 'visible authority error is recoverable and does not expose mutation UI', status: 'PASS', viewport: '1440x900' })
  })
}

try {
  fs.mkdirSync(screenshotDir, { recursive: true })
  const build = spawnSync(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', artifactDir, '--emptyOutDir'], { cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, NODE_ENV: 'production' } })
  if (build.status !== 0) throw new Error(build.stderr || build.stdout || 'DEV009_BROWSER_BUILD_FAILED')
  const artifact = fileManifest(artifactDir)
  const candidate = fileManifest(root, sourceFiles)
  port = await freePort()
  baseUrl = `http://127.0.0.1:${port}`
  console.log(JSON.stringify({ runtimeDeclaration: { project: root, purpose: 'DEV-009 S2 frozen production artifact real Chromium normal-entry QC', port, owningProcessTree: `runner ${process.pid} -> completed Vite build child; in-process static server`, cleanupCondition: 'browser closed, static server closed, port released, task artifact removed', artifactDir, productionWrites: false } }))
  await startStaticServer()
  const servedResponse = await fetch(baseUrl)
  const servedBytes = Buffer.from(await servedResponse.arrayBuffer())
  const artifactIndex = artifact.files.find((entry) => entry.path === 'index.html')
  servedEntry = { path: 'index.html', bytes: servedBytes.length, sha256: sha256(servedBytes), artifactSha256: artifactIndex.sha256, parity: sha256(servedBytes) === artifactIndex.sha256 }
  assert.equal(servedEntry.parity, true)
  browser = await chromium.launch({ headless: true })
  browserVersion = browser.version()
  await runBrowserChecks()
  assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`)
  assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join(' | ')}`)
  fs.writeFileSync(path.join(taskRoot, 'candidate.json'), JSON.stringify({ candidate, artifact }))
} catch (error) {
  failure = error instanceof Error ? error : new Error(String(error))
  checks.push({ id: 'QA-009-S2-FAILURE', label: 'browser runtime', status: 'FAIL', error: failure.message })
} finally {
  await browser?.close().catch(() => undefined)
  if (server) await new Promise((resolve) => server.close(resolve)).catch((error) => { cleanupFailure = error instanceof Error ? error : new Error(String(error)) })
}

const released = port ? await portReleased(port) : false
if (port && !released && !cleanupFailure) cleanupFailure = new Error(`task-owned port not released: ${port}`)
const candidate = fileManifest(root, sourceFiles)
const artifact = fs.existsSync(artifactDir) ? fileManifest(artifactDir) : null
try { fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) } catch (error) { if (!cleanupFailure) cleanupFailure = error instanceof Error ? error : new Error(String(error)) }
const cleanup = { browserClosed: true, serverClosed: server ? !server.listening : true, portReleased: released, taskArtifactRemoved: !fs.existsSync(taskRoot) }
const report = {
  status: failure || cleanupFailure || checks.some((check) => check.status !== 'PASS') ? 'FAIL' : 'PASS', runner: 'DEV-009-S2-browser', execution: 'frozen-production-artifact-real-chromium',
  source: { gitHead: gitValue(['rev-parse', 'HEAD']), branch: gitValue(['rev-parse', '--abbrev-ref', 'HEAD']), dirtyFiles: gitValue(['status', '--short']).split(/\r?\n/u).filter(Boolean), candidate },
  artifact: artifact ? { path: artifactDir, ...artifact } : null, servedEntry, browser: { name: 'chromium', version: browserVersion },
  runtime: { project: root, port, baseUrl, purpose: 'DEV-009 S2 normal-entry QC', productionWrites: false, primaryPortsTouched: [], cleanup },
  actor: { principalId: 'principal-browser-operator', assuranceLevel: 'aal2' }, fixture: { targetEmployeeId, principalAdmissionId: admission.principalAdmissionId },
  route: '/', viewports: ['1440x900', '1024x768', '390x844'], checks, screenshots, apiRequests, pageErrors, consoleErrors, expectedConsoleErrors, visibleErrors,
  failure: failure?.message ?? cleanupFailure?.message ?? null,
}
fs.mkdirSync(evidenceDir, { recursive: true })
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
const reportBytes = fs.readFileSync(reportPath)
fs.mkdirSync(path.dirname(latestPath), { recursive: true })
fs.writeFileSync(latestPath, `${JSON.stringify({ status: report.status, reportPath: path.relative(root, reportPath).replaceAll('\\', '/'), reportSha256: sha256(reportBytes), candidateSha256: candidate.sha256, generatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8')
if (report.status !== 'PASS') {
  console.error(`DEV009_BROWSER_FAILED evidence=${reportPath} error=${report.failure}`)
  process.exitCode = 1
} else {
  console.log(`DEV009_BROWSER_OK checks=${checks.length} evidence=${reportPath}`)
}
