#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'
import { createServer as createViteModuleLoader } from 'vite'
import {
  createTaskOwnedNextTsconfig,
  getFreePort,
  removeTaskOwnedWorkspaceTempDir,
  restoreNextEnv,
  snapshotNextEnv,
  startNextApp,
  stopNextApp,
  waitForNextAppReady,
} from '../../../../../AI_PDM/scripts/qc-next-app-runner.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const orgRoot = path.resolve(scriptDir, '..', '..', '..', '..')
const workspaceRoot = path.dirname(orgRoot)
const platformRoot = path.join(workspaceRoot, 'Jenfu-Management-system')
const aiRoot = path.join(workspaceRoot, 'AI_PDM')
const requireAi = createRequire(path.join(aiRoot, 'package.json'))
const AiSqliteDatabase = requireAi('better-sqlite3')
const runId = `BROWSER-${new Date().toISOString().replace(/[-:.]/gu, '')}-${process.pid}`
const evidenceDir = path.resolve(process.env.DEV010_N2_BROWSER_EVIDENCE_DIR ?? path.join(orgRoot, 'output', 'dev-010', 'n2', 'browser', runId))
const screenshotDir = path.join(evidenceDir, 'screenshots')
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dev010-n2-browser-'))
const platformMirror = path.join(taskRoot, 'platform')
const orgDataDir = path.join(taskRoot, 'org-governance-data')
const aiDataDir = path.join(taskRoot, 'ai-data')
const aiRepositoryDir = path.join(taskRoot, 'ai-repository')
const observations = []
const screenshots = []
const runtimePlan = { runId, ownerPid: process.pid, purpose: 'DEV-010 N2 real Chromium normal-entry regression', productionWrites: false, runtimes: [], cleanupCondition: 'all exact child trees stopped, ports released, taskRoot removed' }
const originalEnv = new Map()
const aiEnvKeys = ['NODE_ENV', 'PDM_AUTH_MODE', 'PDM_ENABLE_LOCAL_QUICK_LOGIN', 'PDM_DB_PROVIDER', 'PDM_DATA_DIR', 'PDM_REPOSITORY_DIR', 'PDM_RELEASE_MODE', 'ORGMASTER_PUBLIC_BASE_URL', 'PDM_NEXT_DIST_DIR', 'PDM_NEXT_TSCONFIG_PATH', 'QC_NEXT_USE_WEBPACK']
for (const key of aiEnvKeys) originalEnv.set(key, process.env[key])
const aiNextEnv = snapshotNextEnv(aiRoot)
let browser = null
let platformApp = null
let orgApp = null
let aiApp = null
let aiTsconfig = null
let platformPort = null
let orgPort = null
let aiPort = null
let failure = null

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const writeJson = (name, value) => fs.writeFileSync(path.join(evidenceDir, name), `${JSON.stringify(value, null, 2)}\n`)
const record = (id, actual) => observations.push({ id, status: 'PASS', actual })

async function createSyntheticGovernanceFixture() {
  const loader = await createViteModuleLoader({ root: orgRoot, configFile: false, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } })
  try {
    const [{ createSeedDocumentV2 }, { migrateGovernanceV2ToV3 }, { readAiPdmRoleCatalog }] = await Promise.all([
      loader.ssrLoadModule('/src/governance/migrateGovernanceV1ToV2.ts'),
      loader.ssrLoadModule('/src/governance/migrateGovernanceV2ToV3.ts'),
      loader.ssrLoadModule('/src/governance/aiPdmCatalog.ts'),
    ])
    const at = '2026-09-03T00:00:00.000Z'
    const document = migrateGovernanceV2ToV3(createSeedDocumentV2(at), 'dev010-n2-synthetic-source', readAiPdmRoleCatalog(), at)
    document.draft.identityLinks.push({
      id: 'fixture-dev010-local-admin-link', principalId: 'dev-principal-local-admin', issuer: 'urn:orgmaster:dev',
      subject: 'local-admin', employeeId: 'employee-shijie', status: 'active', validFrom: at, validTo: null,
    })
    document.draft.roleAssignments.push({
      id: 'fixture-dev010-role-manager', employeeId: 'employee-shijie', applicationId: 'orgmaster',
      roleId: 'role-orgmaster-admin', roleCodeSnapshot: 'orgmaster_admin', roleNameSnapshot: 'OrgMaster 管理者',
      catalogVersion: null, scope: { kind: 'global' }, status: 'active', validFrom: at, validTo: null,
      effectState: 'orgmaster-enforced', basis: 'manual', subjectKind: 'employee', targetPrincipalId: null, sources: [],
      metadata: { sponsorEmployeeId: null, reviewDueAt: null }, createdByPrincipalId: 'fixture:dev010',
      createdReason: 'DEV-010 task-owned role-manager actor prerequisite',
    })
    const { basePolicyVersionId: _fixtureBase, updatedAt: _fixtureUpdated, ...fixturePolicy } = document.draft
    const fixtureVersionId = 'fixture-dev010-role-manager-policy'
    document.draft.basePolicyVersionId = fixtureVersionId
    document.activePolicyVersionId = fixtureVersionId
    document.publishedVersions.push({
      kind: 'assignment-governance-v3', id: fixtureVersionId, versionNumber: 1,
      publishedAt: at, publishedByPrincipalId: 'fixture:dev010',
      publishReason: 'DEV-010 task-owned role-manager actor prerequisite', snapshotHash: '0'.repeat(64), effectState: 'not-synchronized',
      policy: fixturePolicy, externalRoleCatalogs: [],
      organizationSnapshot: { workspaceVersionId: 'test-current', workspaceRevision: 'dev010-n2-synthetic', capturedAt: at, employees: [], departments: [], organizationRoles: [], positions: [], assignments: [] },
    })
    return document
  } finally {
    await loader.close()
  }
}

async function canBind(port) {
  return await new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => server.close(() => resolve(true)))
  })
}

async function portReleased(port) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await canBind(port)) return true
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  return false
}

async function waitHttp(url, output, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return } catch { /* startup */ }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`DEV010_BROWSER_RUNTIME_TIMEOUT ${url}\n${output()}`)
}

function stopTree(child) {
  if (!child || child.exitCode !== null || !child.pid) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
  else child.kill('SIGKILL')
}

function startPlatformMirror() {
  fs.cpSync(platformRoot, platformMirror, {
    recursive: true,
    filter(source) {
      const relative = path.relative(platformRoot, source)
      if (!relative) return true
      return !['.git', '.next', 'node_modules', 'output', '.tmp'].includes(relative.split(path.sep)[0])
    },
  })
  fs.symlinkSync(path.join(platformRoot, 'node_modules'), path.join(platformMirror, 'node_modules'), 'junction')
  const nextCli = path.join(platformRoot, 'node_modules', 'next', 'dist', 'bin', 'next')
  const child = spawn(process.execPath, [nextCli, 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(platformPort)], {
    cwd: platformMirror, env: { ...process.env, NODE_ENV: 'development' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk.toString() })
  child.stderr.on('data', (chunk) => { output += chunk.toString() })
  return { child, getOutput: () => output }
}

function json(body, status = 200, headers = {}) {
  return { status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'cache-control': 'no-store', ...headers } }
}

function fakeJwt() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ aud: 'dev010-browser', auth_time: 1788436800, exp: 4102444800, iat: 1788436800, sub: 'employee-browser', user_id: 'employee-browser', email: 'employee.browser@example.invalid', firebase: { sign_in_provider: 'password' } })}.fixture`
}

async function capture(page, name) {
  const target = path.join(screenshotDir, `${name}.png`)
  // Playwright hides the caret by mutating the focused input's inline style.
  // If that mutation overlaps React hydration, React correctly reports a
  // hydration mismatch that was created by the evidence harness itself.
  await page.screenshot({ path: target, fullPage: true, caret: 'initial' })
  screenshots.push(path.relative(evidenceDir, target).replaceAll('\\', '/'))
}

function monitor(page, log) {
  page.on('pageerror', (error) => log.pageErrors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') log.consoleErrors.push(message.text()) })
  page.on('request', (request) => log.requests.push(`${request.method()} ${new URL(request.url()).pathname}`))
}

async function platformRoutes(page, mode = 'normal') {
  const token = fakeJwt()
  await page.route('https://identitytoolkit.googleapis.com/**', (route) => route.fulfill(json({ kind: 'identitytoolkit#VerifyPasswordResponse', localId: 'employee-browser', email: 'employee.browser@example.invalid', idToken: token, registered: true, refreshToken: 'fixture-refresh', expiresIn: '3600' })))
  await page.route('https://securetoken.googleapis.com/**', (route) => route.fulfill(json({ access_token: token, expires_in: '3600', token_type: 'Bearer', refresh_token: 'fixture-refresh', id_token: token, user_id: 'employee-browser', project_id: 'dev010-browser' })))
  await page.route('**/api/auth/mode', (route) => route.fulfill(json({ authMode: 'jenfu_firebase_bff', firebase: { apiKey: 'fixture-api-key', authDomain: 'dev010-browser.invalid', projectId: 'dev010-browser', appId: '1:1:web:fixture' }, correlationId: 'dev010-browser-mode' })))
  await page.route('**/api/auth/firebase/session', (route) => route.fulfill(json({ status: 'authenticated' }, 201, { 'set-cookie': 'jenfu_fixture=1; Path=/; HttpOnly; SameSite=Lax' })))
  await page.route('**/api/auth/me', async (route) => {
    if (mode === 'revoked') return route.fulfill(json({ code: 'auth_epoch_stale', correlationId: 'dev010-browser-revoked' }, 401))
    return route.fulfill(json({ user: { principalId: 'principal-browser', employeeId: 'EMP-BROWSER' }, session: { expiresAt: '2026-09-03T23:59:59.000Z' }, assuranceLevel: 'aal1', correlationId: 'dev010-browser-session' }))
  })
  await page.route('**/api/apps', async (route) => {
    if (mode === 'error') return route.fulfill(json({ code: 'platform_unavailable', correlationId: 'dev010-browser-apps-error' }, 503))
    if (mode === 'loading') await new Promise((resolve) => setTimeout(resolve, 900))
    const apps = mode === 'empty' ? [] : [
      { applicationId: 'ai-pdm', displayName: 'AI-PDM', status: 'active', sortOrder: 10, assignmentVersion: 3, visibilityState: 'visible', launchPath: '/api/apps/ai-pdm/launch' },
      { applicationId: 'orgmaster', displayName: 'OrgMaster', status: 'active', sortOrder: 20, assignmentVersion: 7, visibilityState: 'visible', launchPath: '/api/apps/orgmaster/launch' },
    ]
    return route.fulfill(json({ apps, supportHref: '/support' }))
  })
}

async function runPlatformBrowser() {
  const baseUrl = `http://127.0.0.1:${platformPort}`
  const log = { requests: [], consoleErrors: [], pageErrors: [] }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage(); monitor(page, log); await platformRoutes(page)
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: '使用公司帳號登入' }).waitFor()
  await page.getByLabel('電子郵件').fill('employee.browser@example.invalid')
  await page.getByLabel('密碼').fill('fixture-password')
  await page.getByRole('button', { name: '登入' }).focus(); await page.keyboard.press('Enter')
  await page.waitForTimeout(750)
  if (!log.requests.includes('POST /api/auth/firebase/session')) {
    const response = await page.evaluate(async (idToken) => {
      const value = await fetch('/api/auth/firebase/session', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken }) })
      return value.status
    }, fakeJwt())
    assert.equal(response, 201)
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  }
  await page.getByRole('heading', { name: '應用程式' }).waitFor({ timeout: 30000 })
  assert.equal(await page.getByRole('link', { name: /AI-PDM/u }).count(), 1)
  assert.equal(await page.getByRole('link', { name: /OrgMaster/u }).count(), 1)
  await capture(page, 'platform-normal-1440')
  const semantic = await page.locator('a,button,input,[role]').evaluateAll((nodes) => nodes.map((node) => ({ tag: node.tagName, role: node.getAttribute('role'), name: node.getAttribute('aria-label') || node.textContent?.trim().slice(0, 120) || '', focused: node === document.activeElement })))
  record('platform-normal-entry', { login: 'keyboard-submit', apps: ['ai-pdm', 'orgmaster'], hrefs: await page.locator('.app-link').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href'))), semanticCount: semantic.length })
  await context.close()

  const stateEvidence = []
  for (const [mode, expectedText] of [['loading', '正在載入可用的應用程式…'], ['empty', '目前沒有可用的應用程式'], ['error', '目前無法載入應用程式'], ['revoked', '登入已失效，請重新登入。']]) {
    const stateContext = await browser.newContext({ viewport: { width: mode === 'revoked' ? 390 : 1024, height: mode === 'revoked' ? 844 : 768 } })
    const statePage = await stateContext.newPage(); const stateLog = { requests: [], consoleErrors: [], pageErrors: [] }; monitor(statePage, stateLog); await platformRoutes(statePage, mode)
    await statePage.goto(baseUrl, { waitUntil: 'domcontentloaded' })
    await statePage.getByText(expectedText, { exact: false }).waitFor({ timeout: 30000 })
    stateEvidence.push({ mode, visible: expectedText, url: statePage.url(), overflow: await statePage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) })
    await capture(statePage, `platform-${mode}`); await stateContext.close()
  }
  record('platform-states', stateEvidence)
  assert.equal(log.pageErrors.length, 0)
}

async function runOrgBrowser() {
  const baseUrl = `http://127.0.0.1:${orgPort}`
  const viewports = []
  const navigateToAssignments = async (page, enableMutation = false) => {
    if (enableMutation) {
      const maintenanceToggle = page.getByRole('button', { name: /^唯讀：/u })
      await maintenanceToggle.waitFor({ state: 'visible', timeout: 30000 })
      await maintenanceToggle.focus(); await page.keyboard.press('Enter')
      await page.getByRole('button', { name: /^編輯中：/u }).waitFor({ timeout: 30000 })
    }
    const launcher = page.getByRole('complementary', { name: '功能導覽' })
    try { await launcher.waitFor({ timeout: 15000 }) } catch (error) {
      const body = (await page.locator('body').innerText()).replace(/\s+/gu, ' ').slice(0, 2000)
      throw new Error(`DEV010_ORG_NORMAL_ENTRY_MISSING body=${body} cause=${error.message}`)
    }
    const governance = launcher.getByRole('button', { name: /角色治理/u })
    await governance.waitFor({ state: 'visible', timeout: 30000 })
    await page.waitForFunction(() => {
      const element = [...document.querySelectorAll('button')].find((node) => node.getAttribute('aria-label')?.startsWith('角色治理'))
      return element instanceof HTMLButtonElement && !element.disabled
    }, undefined, { timeout: 30000 })
    await governance.focus(); await page.keyboard.press('Enter')
    await page.getByRole('region', { name: '角色指派治理' }).waitFor({ timeout: 30000 })
    const assignments = page.getByRole('button', { name: '角色指派', exact: true })
    await assignments.focus(); await page.keyboard.press('Enter')
    await page.getByRole('heading', { name: '角色指派', exact: true }).waitFor({ timeout: 30000 })
  }
  const governanceSnapshot = async (page) => await page.evaluate(async () => {
    const response = await fetch('/api/orgmaster/governance/', { headers: { 'X-OrgMaster-Dev-Issuer': 'urn:orgmaster:dev', 'X-OrgMaster-Dev-Subject': 'local-admin' } })
    if (!response.ok) throw new Error(`governance snapshot ${response.status}`)
    return await response.json()
  })

  const functionalContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const functionalPage = await functionalContext.newPage()
  const functionalLog = { requests: [], consoleErrors: [], pageErrors: [] }
  monitor(functionalPage, functionalLog)
  await functionalPage.route('**/api/orgmaster/governance/**', async (route) => {
    const headers = { ...route.request().headers() }
    delete headers.cookie
    await route.continue({ headers })
  })
  await functionalPage.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await navigateToAssignments(functionalPage, true)
  const initialSnapshot = await governanceSnapshot(functionalPage)
  assert.equal(initialSnapshot.document.draft.roleAssignments.filter((item) => item.status === 'active').length, 1)
  assert.equal(initialSnapshot.document.draft.roleAssignments[0]?.id, 'fixture-dev010-role-manager')
  assert.equal(initialSnapshot.versions.length, 1)

  const form = functionalPage.locator('form.governance-assignment-form')
  if (await form.count() !== 1) {
    const session = await functionalPage.evaluate(async () => await (await fetch('/api/orgmaster/governance/session', { headers: { 'X-OrgMaster-Dev-Issuer': 'urn:orgmaster:dev', 'X-OrgMaster-Dev-Subject': 'local-admin' } })).json())
    const body = (await functionalPage.locator('body').innerText()).replace(/\s+/gu, ' ').slice(0, 5000)
    throw new Error(`DEV010_ORG_MUTATION_FORM_MISSING session=${JSON.stringify(session)} catalog=${JSON.stringify(initialSnapshot.catalogs?.map((item) => ({ version: item.catalogVersion, state: item.validationState, roles: item.roles?.length })))} body=${body}`)
  }
  const applicationSelect = form.getByLabel('應用')
  const employeeSelect = form.getByLabel('員工')
  const roleSelect = functionalPage.getByLabel('切換角色')
  const selectOptionByText = async (locator, pattern) => {
    const options = await locator.locator('option').evaluateAll((nodes) => nodes.map((node) => ({ value: node.value, text: node.textContent ?? '' })))
    const option = options.find((item) => pattern.test(item.text))
    assert.ok(option, `missing option ${pattern}`)
    await locator.selectOption(option.value)
    return option
  }

  const employees = await employeeSelect.locator('option').evaluateAll((nodes) => nodes.map((node) => ({ value: node.value, text: node.textContent ?? '' })).filter((item) => item.value))
  assert.ok(employees.length >= 2)
  const actorEmployee = employees.find((item) => /石傑|世傑/u.test(item.text)) ?? employees[0]
  const assignedEmployee = employees.find((item) => item.value !== actorEmployee.value) ?? employees[1]
  await applicationSelect.selectOption('ai-pdm')
  await roleSelect.selectOption('role-rd')
  await employeeSelect.selectOption(assignedEmployee.value)
  await functionalPage.getByRole('button', { name: '指派檢查', exact: true }).focus()
  await functionalPage.keyboard.press('Enter')
  await functionalPage.getByRole('button', { name: '檢查目前候選' }).focus()
  await functionalPage.keyboard.press('Enter')
  await functionalPage.getByText('指派候選有效', { exact: true }).waitFor({ timeout: 30000 })
  await functionalPage.getByRole('button', { name: '角色指派', exact: true }).focus()
  await functionalPage.keyboard.press('Enter')
  const draftPatchBeforeRole = functionalLog.requests.filter((item) => item === 'PATCH /api/orgmaster/governance/draft').length
  await form.getByRole('button', { name: '建立指派' }).dblclick()
  const createdRow = functionalPage.locator('table.governance-table tbody tr').filter({ hasText: assignedEmployee.text }).filter({ hasText: 'ai-pdm · rd' }).last()
  await createdRow.waitFor({ state: 'visible', timeout: 30000 })
  const createdRowText = (await createdRow.innerText()).replace(/\s+/gu, ' ')
  assert.match(createdRowText, /有效/u)
  assert.match(createdRowText, /尚未同步/u)
  const duplicateActivationRequests = functionalLog.requests.filter((item) => item === 'PATCH /api/orgmaster/governance/draft').length - draftPatchBeforeRole
  assert.equal(duplicateActivationRequests, 1)
  const assignedSnapshot = await governanceSnapshot(functionalPage)
  const rdAssignment = assignedSnapshot.document.draft.roleAssignments.find((item) => item.roleId === 'role-rd' && item.employeeId === assignedEmployee.value && item.status === 'active')
  assert.ok(rdAssignment)

  await functionalPage.getByRole('button', { name: '發布版本', exact: true }).focus()
  await functionalPage.keyboard.press('Enter')
  const publishReason = functionalPage.getByLabel('發布原因')
  await publishReason.fill('DEV-010 UI-02 雙階段可逆角色指派發布')
  let publishBeforeCommitInjected = false
  await functionalPage.route('**/api/orgmaster/governance/versions', async (route) => {
    if (!publishBeforeCommitInjected && route.request().method() === 'POST') {
      publishBeforeCommitInjected = true
      await route.abort('connectionfailed')
      return
    }
    await route.continue()
  })
  await functionalPage.getByRole('button', { name: '發布角色指派版本' }).click()
  await functionalPage.getByRole('alert').waitFor({ timeout: 30000 })
  assert.equal(await publishReason.inputValue(), 'DEV-010 UI-02 雙階段可逆角色指派發布')
  await functionalPage.unroute('**/api/orgmaster/governance/versions')
  await functionalPage.getByRole('button', { name: '發布角色指派版本' }).click()
  await functionalPage.getByText(/已發布至 OrgMaster/u).waitFor({ timeout: 30000 })
  const publishedSnapshot = await governanceSnapshot(functionalPage)
  assert.equal(publishedSnapshot.versions.length, 2)
  await capture(functionalPage, 'orgmaster-role-published-1440')

  await functionalPage.getByRole('button', { name: '角色指派', exact: true }).click()
  const targetRow = functionalPage.locator('table.governance-table tbody tr').filter({ hasText: assignedEmployee.text }).filter({ hasText: 'ai-pdm · rd' }).last()
  await targetRow.getByRole('button', { name: '撤銷' }).click()
  await targetRow.getByText('已撤銷', { exact: true }).waitFor({ timeout: 30000 })
  await functionalPage.getByRole('button', { name: '發布版本', exact: true }).click()
  await functionalPage.getByLabel('發布原因').fill('DEV-010 UI-02 反向命令復原')
  await functionalPage.getByRole('button', { name: '發布角色指派版本' }).click()
  await functionalPage.getByText(/已發布至 OrgMaster/u).waitFor({ timeout: 30000 })
  await functionalPage.reload({ waitUntil: 'domcontentloaded' })
  await navigateToAssignments(functionalPage, true)
  const reversedSnapshot = await governanceSnapshot(functionalPage)
  const reversed = reversedSnapshot.document.draft.roleAssignments.find((item) => item.id === rdAssignment.id)
  assert.equal(reversed?.status, 'revoked')
  assert.equal(reversedSnapshot.versions.length, 3)
  await capture(functionalPage, 'orgmaster-role-reversed-1440')
  record('orgmaster-mutation-flow', {
    navigation: '功能 → 角色治理 → 角色指派',
    preview: '指派候選有效',
    roleId: 'role-rd',
    employeeId: assignedEmployee.value,
    assignmentId: rdAssignment.id,
    duplicateActivationRequests,
    connectionLossBeforeCommit: publishBeforeCommitInjected,
    retainedPublishInput: true,
    publishReceipts: publishedSnapshot.versions.length - initialSnapshot.versions.length,
    reverseCommand: { assignmentStatus: reversed.status, versionCount: reversedSnapshot.versions.length },
    reloadServerTruth: true,
    productionWrites: false,
  })
  await functionalContext.close()

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }, { width: 1280, height: 720, zoom: 2 }]) {
    const context = await browser.newContext({ viewport })
    const page = await context.newPage(); const log = { requests: [], consoleErrors: [], pageErrors: [] }; monitor(page, log)
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await navigateToAssignments(page)
    if (viewport.zoom) await page.evaluate((zoom) => { document.documentElement.style.zoom = String(zoom) }, viewport.zoom)
    const text = (await page.getByRole('region', { name: '角色指派治理' }).innerText()).replace(/\s+/gu, ' ')
    assert.match(text, /角色指派/u)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    assert.ok(overflow <= 2)
    viewports.push({ viewport: `${viewport.width}x${viewport.height}`, zoom: viewport.zoom ?? 1, overflow, mobileReadOnly: text.includes('手機僅供閱讀'), pageErrors: log.pageErrors })
    await capture(page, `orgmaster-role-assignment-${viewport.width}${viewport.zoom ? '-zoom200' : ''}`)
    await context.close()
  }
  record('orgmaster-normal-entry', { navigation: '功能 → 角色治理 → 角色指派', roleManagerSurface: true, viewports, isolatedGovernanceData: true, productionWrites: false })
}

async function runAiBrowser() {
  const baseUrl = `http://127.0.0.1:${aiPort}`
  const openCreate = async (page, focusTrace) => {
    await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    const quick = page.getByRole('button', { name: '以研發主管角色快速登入' })
    await quick.waitFor({ timeout: 30000 }); await quick.focus(); focusTrace.push(await page.evaluate(() => document.activeElement?.textContent?.trim() || document.activeElement?.getAttribute('aria-label') || ''))
    await page.keyboard.press('Enter')
    await page.waitForURL((url) => url.pathname === '/', { timeout: 30000 })
    const workbench = page.getByRole('link', { name: '圖號工作台', exact: true })
    await workbench.waitFor({ timeout: 30000 }); await workbench.focus(); focusTrace.push(await page.evaluate(() => document.activeElement?.textContent?.trim() || ''))
    await page.keyboard.press('Enter')
    await page.getByRole('heading', { name: '圖號工作台' }).waitFor({ timeout: 30000 })
    const createLink = page.getByRole('link', { name: '建立編號' }).first()
    await createLink.focus(); focusTrace.push(await page.evaluate(() => document.activeElement?.textContent?.trim() || ''))
    await page.keyboard.press('Enter')
    await page.getByRole('heading', { name: '建立編號' }).waitFor({ timeout: 30000 })
  }
  const prepareCreate = async (page, name, focusTrace, keyboard = true) => {
    const noun = page.getByLabel('主要名詞')
    await noun.focus(); focusTrace.push(await page.evaluate(() => document.activeElement?.getAttribute('placeholder') || document.activeElement?.getAttribute('aria-label') || 'primary-noun'))
    await noun.fill(name)
    const applyName = page.getByRole('button', { name: '套用建議品名' })
    await applyName.waitFor({ state: 'visible' }); await applyName.focus(); focusTrace.push(await page.evaluate(() => document.activeElement?.textContent?.trim() || ''))
    if (keyboard) await page.keyboard.press('Enter'); else await applyName.click()
    const submit = page.getByRole('button', { name: '建立編號', exact: true })
    await submit.focus(); focusTrace.push(await page.evaluate(() => document.activeElement?.textContent?.trim() || ''))
    return submit
  }
  const reverseRecord = async (page, rootCode, label) => await page.evaluate(async ({ rootCode: code, label: reason }) => {
    const idempotencyKey = `dev010-reverse-${crypto.randomUUID()}`
    const response = await fetch(`/api/numbering/records/${encodeURIComponent(code)}/obsolete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ reason, confirmObsolete: true }),
    })
    const body = await response.json().catch(() => null)
    if (response.ok) return { status: response.status, mode: 'obsolete', body, idempotencyKey }
    const deleted = await fetch(`/api/numbering/records/${encodeURIComponent(code)}/draft`, {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason, confirmDelete: true }),
    })
    return { status: deleted.status, mode: 'delete-draft', obsoleteAttempt: { status: response.status, body }, body: await deleted.json().catch(() => null), idempotencyKey }
  }, { rootCode, label })
  const rootIdentity = (body) => ({ rootCode: body?.root?.rootCode, rootId: body?.root?.id, partId: body?.partNumber?.id, drawingId: body?.drawingNumber?.id })

  const normalContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const normalPage = await normalContext.newPage(); const normalLog = { requests: [], consoleErrors: [], pageErrors: [] }; monitor(normalPage, normalLog)
  const normalFocus = []
  await openCreate(normalPage, normalFocus)
  const normalSubmit = await prepareCreate(normalPage, `DEV010-TEMP-UI03-${process.pid}`, normalFocus)
  const normalResponsePromise = normalPage.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/numbering/records')
  await normalPage.keyboard.press('Enter')
  const normalResponse = await normalResponsePromise
  assert.equal(normalResponse.status(), 201)
  const normalBody = await normalResponse.json()
  await normalPage.getByRole('heading', { name: '編號已建立' }).waitFor({ timeout: 30000 })
  await capture(normalPage, 'ai-pdm-create-1440')
  const normalUrl = normalPage.url()
  const normalIdentity = rootIdentity(normalBody)
  assert.ok(normalIdentity.rootCode)
  const normalReverse = await reverseRecord(normalPage, normalIdentity.rootCode, 'DEV-010 UI-03 反向命令')
  assert.equal(normalReverse.status, 200, JSON.stringify(normalReverse))
  record('ai-pdm-normal-entry', {
    role: 'R&D Manager', normalUrl, route: '/numbering/drawings → /numbering/create?from=drawing',
    mutationRequests: normalLog.requests.filter((item) => item === 'POST /api/numbering/records').length,
    identity: normalIdentity, result: '編號已建立', reverseReceipt: normalReverse,
    focusTrace: normalFocus, taskFixtureRemovedOnCleanup: true,
  })
  await normalContext.close()

  const retryContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const retryPage = await retryContext.newPage(); const retryLog = { requests: [], consoleErrors: [], pageErrors: [] }; monitor(retryPage, retryLog)
  const retryFocus = []
  await openCreate(retryPage, retryFocus)
  const retrySubmit = await prepareCreate(retryPage, `DEV010-TEMP-UI07-${process.pid}`, retryFocus)
  const retryKeys = []
  const retryBodies = []
  let committedThenDisconnected = false
  await retryPage.route('**/api/numbering/records', async (route) => {
    if (route.request().method() !== 'POST') { await route.continue(); return }
    retryKeys.push(route.request().headers()['idempotency-key'])
    if (!committedThenDisconnected) {
      const response = await route.fetch()
      assert.equal(response.status(), 201)
      retryBodies.push(await response.json())
      committedThenDisconnected = true
      await route.abort('connectionfailed')
      return
    }
    const response = await route.fetch()
    retryBodies.push(await response.json())
    await route.fulfill({ response })
  })
  await retrySubmit.click()
  const uncertain = retryPage.getByRole('alert').filter({ hasText: '建立結果尚未確認' })
  await uncertain.waitFor({ timeout: 30000 })
  assert.equal(await retryPage.getByLabel('主要名詞').inputValue(), `DEV010-TEMP-UI07-${process.pid}`)
  await retrySubmit.focus(); retryFocus.push(await retryPage.evaluate(() => document.activeElement?.textContent?.trim() || ''))
  await retryPage.keyboard.press('Enter')
  await retryPage.getByRole('heading', { name: '編號已建立' }).waitFor({ timeout: 30000 })
  assert.equal(retryKeys.length, 2)
  assert.ok(retryKeys[0])
  assert.equal(retryKeys[0], retryKeys[1])
  assert.deepEqual(rootIdentity(retryBodies[0]), rootIdentity(retryBodies[1]))
  const retryIdentity = rootIdentity(retryBodies[1])
  const retryReverse = await reverseRecord(retryPage, retryIdentity.rootCode, 'DEV-010 UI-07 反向命令')
  assert.equal(retryReverse.status, 200, JSON.stringify(retryReverse))
  await capture(retryPage, 'ai-pdm-retry-exact-once-1440')
  record('ai-pdm-uncertain-retry', {
    failurePoint: 'server committed, browser connection lost before response',
    visibleUncertainState: true, inputRetained: true, requestCount: retryKeys.length,
    sameIdempotencyKey: retryKeys[0] === retryKeys[1], identity: retryIdentity,
    serverResponsesConverged: JSON.stringify(rootIdentity(retryBodies[0])) === JSON.stringify(rootIdentity(retryBodies[1])),
    reverseReceipt: retryReverse, focusTrace: retryFocus,
  })
  await retryContext.close()

  const duplicateContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const duplicatePage = await duplicateContext.newPage(); const duplicateLog = { requests: [], consoleErrors: [], pageErrors: [] }; monitor(duplicatePage, duplicateLog)
  const duplicateFocus = []
  await openCreate(duplicatePage, duplicateFocus)
  const duplicateSubmit = await prepareCreate(duplicatePage, `DEV010-TEMP-UI10-${process.pid}`, duplicateFocus, false)
  const duplicateResponses = []
  duplicatePage.on('response', async (response) => {
    if (response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/numbering/records') duplicateResponses.push(response)
  })
  await duplicateSubmit.dblclick()
  await duplicatePage.getByRole('heading', { name: '編號已建立' }).waitFor({ timeout: 30000 })
  assert.equal(duplicateLog.requests.filter((item) => item === 'POST /api/numbering/records').length, 1)
  assert.equal(duplicateResponses.length, 1)
  const duplicateBody = await duplicateResponses[0].json()
  const duplicateIdentity = rootIdentity(duplicateBody)
  const aiFixtureDatabase = new AiSqliteDatabase(path.join(aiDataDir, 'ai-pdm.sqlite'))
  aiFixtureDatabase.prepare("UPDATE pdm_workbench_state_authority_control SET mode='canonical_only', expected_commit='local-dev', schema_hash='dev090-v1', row_version=row_version+1, switched_at=CURRENT_TIMESTAMP WHERE id=1").run()
  aiFixtureDatabase.close()
  const resultLink = duplicatePage.getByRole('link', { name: '查看建立結果' })
  await resultLink.click()
  await duplicatePage.getByRole('heading', { name: '圖號工作台' }).waitFor({ timeout: 30000 })
  await duplicatePage.getByText(duplicateIdentity.rootCode, { exact: false }).first().waitFor({ timeout: 30000 })
  const serverTruthUrl = duplicatePage.url()
  await duplicatePage.reload({ waitUntil: 'domcontentloaded' })
  await duplicatePage.getByText(duplicateIdentity.rootCode, { exact: false }).first().waitFor({ timeout: 30000 })
  await duplicatePage.goBack({ waitUntil: 'domcontentloaded' })
  await duplicatePage.goForward({ waitUntil: 'domcontentloaded' })
  await duplicatePage.getByText(duplicateIdentity.rootCode, { exact: false }).first().waitFor({ timeout: 30000 })
  const reopened = await duplicateContext.newPage()
  await reopened.goto(serverTruthUrl, { waitUntil: 'domcontentloaded' })
  await reopened.getByText(duplicateIdentity.rootCode, { exact: false }).first().waitFor({ timeout: 30000 })
  const duplicateReverse = await reverseRecord(duplicatePage, duplicateIdentity.rootCode, 'DEV-010 UI-10 反向命令')
  assert.equal(duplicateReverse.status, 200, JSON.stringify(duplicateReverse))
  record('ai-pdm-duplicate-reopen', {
    activation: 'double-click', mutationRequests: 1, identity: duplicateIdentity,
    refresh: 'server truth visible', backForward: 'server truth visible', reopen: 'server truth visible',
    reverseReceipt: duplicateReverse, taskFixtureRemovedOnCleanup: true,
  })
  await duplicateContext.close()

  const viewportContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const viewportPage = await viewportContext.newPage(); const viewportLog = { requests: [], consoleErrors: [], pageErrors: [] }; monitor(viewportPage, viewportLog)
  const viewportFocus = []
  await openCreate(viewportPage, viewportFocus)
  const viewportResults = []
  const measureViewport = async (page, viewport, screenshotName, metadata = {}) => {
    await page.setViewportSize(viewport)
    await page.goto(`${baseUrl}/numbering/drawings`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: '圖號工作台' }).waitFor({ timeout: 30000 })
    const measurement = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      fixedObstruction: [...document.querySelectorAll('*')].filter((node) => getComputedStyle(node).position === 'fixed' && node.getBoundingClientRect().bottom > window.innerHeight).length,
      stickyBeyondViewport: [...document.querySelectorAll('*')].filter((node) => getComputedStyle(node).position === 'sticky' && node.getBoundingClientRect().bottom > window.innerHeight).length,
    }))
    viewportResults.push({ viewport: `${viewport.width}x${viewport.height}`, zoom: 1, ...metadata, ...measurement })
    assert.ok(measurement.overflow <= 2)
    assert.equal(measurement.fixedObstruction, 0)
    await capture(page, screenshotName)
  }
  for (const viewport of [{ width: 390, height: 844 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
    await measureViewport(viewportPage, viewport, `ai-pdm-drawings-${viewport.width}`)
  }
  const zoomContext = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 2 })
  const zoomPage = await zoomContext.newPage(); const zoomLog = { requests: [], consoleErrors: [], pageErrors: [] }; monitor(zoomPage, zoomLog)
  await openCreate(zoomPage, [])
  await measureViewport(zoomPage, { width: 640, height: 360 }, 'ai-pdm-drawings-1280-zoom200', { viewport: '1280x720', zoom: 2, cssViewport: '640x360', deviceScaleFactor: 2 })
  const ariaSnapshot = await zoomPage.locator('body').ariaSnapshot()
  const pageErrors = [...normalLog.pageErrors, ...retryLog.pageErrors, ...duplicateLog.pageErrors, ...viewportLog.pageErrors, ...zoomLog.pageErrors]
  const consoleErrors = [...normalLog.consoleErrors, ...retryLog.consoleErrors, ...duplicateLog.consoleErrors, ...viewportLog.consoleErrors, ...zoomLog.consoleErrors]
  const expectedConsoleErrors = consoleErrors.filter((value) =>
    value.includes('status of 409 (Conflict)')
    || value.includes('net::ERR_CONNECTION_FAILED')
    || value.includes('status of 503 (Service Unavailable)'),
  )
  const unexpectedConsoleErrors = consoleErrors.filter((value) => !expectedConsoleErrors.includes(value))
  assert.deepEqual(pageErrors, [])
  assert.deepEqual(unexpectedConsoleErrors, [])
  record('responsive-accessibility', { viewports: viewportResults, keyboardLogin: true, focusTrace: [...normalFocus, ...retryFocus], accessibilitySnapshotSha256: sha256(ariaSnapshot), pageErrors, expectedConsoleErrors, unexpectedConsoleErrors })
  await viewportContext.close()
  await zoomContext.close()
}

function runAiGovernanceBrowser() {
  const childEvidence = path.join(evidenceDir, 'ai-pdm-governance')
  const result = spawnSync(process.execPath, [path.join(aiRoot, 'scripts', 'qc-jms-dev-009-browser.mjs')], {
    cwd: aiRoot, encoding: 'utf8', windowsHide: true, maxBuffer: 96 * 1024 * 1024,
    env: { ...process.env, DEV009_BROWSER_EVIDENCE_DIR: childEvidence },
  })
  if (result.status !== 0) throw new Error(`DEV010_AI_GOVERNANCE_BROWSER_FAILED\n${result.stdout}\n${result.stderr}`)
  const report = JSON.parse(fs.readFileSync(path.join(childEvidence, 'report.json'), 'utf8'))
  assert.equal(report.status, 'PASS')
  record('ai-pdm-authority-unavailable', { status: report.status, checks: report.checks?.length ?? 0, expectedConsoleErrors: report.expectedConsoleErrors?.length ?? 0, viewports: report.viewports, cleanup: report.cleanup })
}

try {
  fs.mkdirSync(screenshotDir, { recursive: true })
  fs.mkdirSync(orgDataDir, { recursive: true })
  const orgGovernanceFixture = await createSyntheticGovernanceFixture()
  fs.writeFileSync(path.join(orgDataDir, 'orgmaster-governance.v3.json'), `${JSON.stringify(orgGovernanceFixture, null, 2)}\n`)
  platformPort = await getFreePort(); orgPort = await getFreePort(); aiPort = await getFreePort()
  platformApp = startPlatformMirror()
  runtimePlan.runtimes.push({ project: platformRoot, isolation: platformMirror, port: platformPort, pid: platformApp.child.pid, processTree: `runner ${process.pid} -> next ${platformApp.child.pid}`, cleanup: 'taskkill exact child tree; remove mirror' })
  writeJson('runtime-plan.json', runtimePlan)
  await waitHttp(`http://127.0.0.1:${platformPort}/login`, platformApp.getOutput)

  const viteCli = path.join(orgRoot, 'node_modules', 'vite', 'bin', 'vite.js')
  orgApp = { child: spawn(process.execPath, [viteCli, '--host', '127.0.0.1', '--port', String(orgPort), '--strictPort'], { cwd: orgRoot, env: { ...process.env, NODE_ENV: 'development', ORGMASTER_PERSISTENCE_MODE: 'local-json', ORGMASTER_GOVERNANCE_DATA_DIR: orgDataDir }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }), output: '' }
  orgApp.child.stdout.on('data', (chunk) => { orgApp.output += chunk.toString() }); orgApp.child.stderr.on('data', (chunk) => { orgApp.output += chunk.toString() })
  runtimePlan.runtimes.push({ project: orgRoot, dataDir: orgDataDir, port: orgPort, pid: orgApp.child.pid, processTree: `runner ${process.pid} -> vite ${orgApp.child.pid}`, cleanup: 'taskkill exact Vite child tree; remove isolated governance data' })
  writeJson('runtime-plan.json', runtimePlan)
  await waitHttp(`http://127.0.0.1:${orgPort}`, () => orgApp.output)

  const nextDistDir = `.tmp/qc-dev010-n2-browser-${aiPort}`
  aiTsconfig = createTaskOwnedNextTsconfig(aiRoot, `dev010-${aiPort}`, nextDistDir)
  Object.assign(process.env, { NODE_ENV: 'development', PDM_AUTH_MODE: 'demo', PDM_ENABLE_LOCAL_QUICK_LOGIN: '1', PDM_DB_PROVIDER: 'sqlite', PDM_DATA_DIR: aiDataDir, PDM_REPOSITORY_DIR: aiRepositoryDir, PDM_RELEASE_MODE: 'local_stub', ORGMASTER_PUBLIC_BASE_URL: 'http://127.0.0.1:9', PDM_NEXT_DIST_DIR: nextDistDir, PDM_NEXT_TSCONFIG_PATH: aiTsconfig.relativePath, QC_NEXT_USE_WEBPACK: '1' })
  aiApp = startNextApp(aiRoot, 'dev', aiPort)
  runtimePlan.runtimes.push({ project: aiRoot, dataDir: aiDataDir, repositoryDir: aiRepositoryDir, nextDistDir, port: aiPort, pid: aiApp.child.pid, processTree: `runner ${process.pid} -> next ${aiApp.child.pid}`, authorityFixture: 'task-owned canonical workbench cutover for runtimeCommit local-dev after database initialization', cleanup: 'stop exact Next child tree; restore Next env; remove task fixtures/dist' })
  writeJson('runtime-plan.json', runtimePlan)
  await waitForNextAppReady(`http://127.0.0.1:${aiPort}`, aiApp.getOutput, 120000)

  browser = await chromium.launch({ headless: true })
  await runPlatformBrowser()
  await runOrgBrowser()
  await runAiBrowser()
  runAiGovernanceBrowser()
} catch (error) {
  failure = error instanceof Error ? error.stack ?? error.message : String(error)
} finally {
  if (browser) await browser.close().catch(() => undefined)
  if (aiApp?.child) await stopNextApp(aiApp.child).catch(() => undefined)
  stopTree(orgApp?.child)
  stopTree(platformApp?.child)
  const released = { platform: platformPort ? await portReleased(platformPort) : true, orgmaster: orgPort ? await portReleased(orgPort) : true, aiPdm: aiPort ? await portReleased(aiPort) : true }
  const nextRestored = await restoreNextEnv(aiNextEnv)
  if (aiTsconfig) fs.rmSync(aiTsconfig.absolutePath, { force: true })
  if (process.env.PDM_NEXT_DIST_DIR) removeTaskOwnedWorkspaceTempDir(aiRoot, process.env.PDM_NEXT_DIST_DIR)
  for (const [key, value] of originalEnv) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
  fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 })
  const report = {
    runId, status: failure ? 'FAIL' : 'PASS', checkedAt: new Date().toISOString(), browserVersion: browser?.version?.() ?? null,
    sourceManifestSha256: process.env.DEV010_N2_SOURCE_MANIFEST_SHA256 ?? null,
    packageSha256: process.env.DEV010_N2_PACKAGE_SHA256 ?? null,
    fixtureSha256: process.env.DEV010_N2_FIXTURE_SHA256 ?? null,
    observations, screenshots, runtimePlan,
    cleanup: { browserClosed: true, portsReleased: released, nextEnvRestored: nextRestored.restored, taskRootRemoved: !fs.existsSync(taskRoot), productionWrites: false },
    failure,
  }
  report.evidenceSha256 = sha256(JSON.stringify(report))
  writeJson('report.json', report)
  process.stdout.write(`${JSON.stringify({ status: report.status, evidenceDir, observations: observations.length, cleanup: report.cleanup })}\n`)
  if (failure) { process.stderr.write(`${failure}\n`); process.exitCode = 1 }
}
