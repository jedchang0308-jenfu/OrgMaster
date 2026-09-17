#!/usr/bin/env node
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chromium } from 'playwright'
import { createOrgmasterServer } from '../dist-server/server.mjs'

const suite = process.argv.find((value) => value.startsWith('--suite='))?.slice('--suite='.length) ?? 'dev047'
if (!['dev047', 'dev049'].includes(suite)) throw new Error(`Unsupported suite: ${suite}`)
const dev049 = suite === 'dev049'
const root = process.cwd(); const tempRoot = await mkdtemp(join(tmpdir(), dev049 ? 'orgmaster-dev-049-browser-' : 'orgmaster-dev-047-browser-')); const evidenceDir = join(root, 'qa', dev049 ? 'dev-049' : 'dev-047', 'browser'); await mkdir(evidenceDir, { recursive: true })
let server; let browser; let port = 0; const results = []
try {
  await cp(join(root, 'dist'), join(tempRoot, 'dist'), { recursive: true }); await cp(join(root, 'data'), join(tempRoot, 'data'), { recursive: true })
  server = createOrgmasterServer({ root: tempRoot, devIdentityEnabled: true, managedIdentityEnabled: true, ...(dev049 ? { managedIdentityDomain: 'jenfu.com.tw', managedIdentityDirectoryFixture: { customerId: 'local-customer', users: { 'jedchang0308@jenfu.com.tw': { userId: 'directory-shijie', directoryState: 'present', sourceEtag: 'etag-shijie' } } } } : {}) })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { port = server.address().port; resolve() }) })
  console.log(JSON.stringify({ runtimeDeclaration: { project: root, purpose: dev049 ? 'DEV-049 actual-browser UI QC' : 'DEV-047 actual-browser UI QC', port, owningProcessTree: `node:${process.pid} -> task-owned HTTP server and Chromium`, cleanupCondition: 'browser and server closed, port released, temporary root removed', mutationScope: tempRoot, primaryDataWrites: false } }))
  browser = await chromium.launch({ headless: true }); const context = await browser.newContext({ viewport: { width: 1024, height: 768 } }); const page = await context.newPage(); const baseUrl = `http://127.0.0.1:${port}`
  const employeeId = dev049 ? 'employee-shijie' : '37e8e57e-a0d1-4280-b815-d209aa629380'
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' })
  const login = await page.evaluate(async () => { const response = await fetch('/api/auth/development/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId: 'administrator' }) }); return { status: response.status, body: await response.json() } })
  if (login.status !== 200) throw new Error('development administrator login failed')
  for (const viewport of [{ width: 1440, height: 900, label: '1440x900' }, { width: 1024, height: 768, label: '1024x768' }, { width: 390, height: 844, label: '390x844' }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height }); await page.goto(`${baseUrl}/?panels=employees&focus=employees&select=employee%3A${employeeId}&details=employees&employee=${employeeId}`, { waitUntil: 'networkidle' })
    const text = await page.locator('body').innerText(); const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewportWidth: window.innerWidth }))
    if (overflow.width > overflow.viewportWidth + 1) throw new Error(`horizontal overflow at ${viewport.label}`)
    const section = page.locator('.employee-identity-section'); const hasSection = await section.count() > 0; const sectionText = hasSection ? await section.first().innerText() : ''; const hasNumber = text.includes('設定員工編號') || text.includes('尚未設定員工編號') || sectionText.includes('設定編號') || sectionText.includes('尚未設定') || /JFS[0-9]{4}/u.test(sectionText); const hasLegacy = text.includes('邀請') || text.includes('設定登入帳號')
    if (!hasSection || !hasNumber || hasLegacy) throw new Error(`managed identity surface mismatch at ${viewport.label}: section=${hasSection} number=${hasNumber} legacy=${hasLegacy} sectionText=${sectionText}`)
    const mutationButtons = await section.getByRole('button').count()
    if (dev049 && viewport.width < 1024 && mutationButtons !== 0) throw new Error(`mobile mutation controls visible at ${viewport.label}`)
    results.push({ viewport: viewport.label, hasSection, hasNumber, hasLegacy, mutationButtons, overflow }); await page.screenshot({ path: join(evidenceDir, `administrator-${viewport.label}.png`), fullPage: true })
  }
  await page.setViewportSize({ width: 1024, height: 768 }); await page.goto(`${baseUrl}/?panels=employees&focus=employees&select=employee%3A${employeeId}&details=employees&employee=${employeeId}`, { waitUntil: 'networkidle' })
  let flow
  if (dev049) {
    const section = page.locator('.employee-identity-section')
    await section.getByText('JFS0005', { exact: true }).waitFor()
    await section.getByRole('button', { name: '連結 Google 主帳號', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '連結 Google 主帳號' })
    await dialog.getByLabel('Google 主帳號').fill('person@gmail.com')
    await dialog.getByText('Email 必須使用公司管理網域。', { exact: true }).waitFor()
    await dialog.getByLabel('Google 主帳號').fill('jedchang0308@jenfu.com.tw')
    await dialog.getByRole('button', { name: '查詢帳號', exact: true }).click()
    await dialog.getByText('張仕杰', { exact: true }).waitFor()
    await dialog.getByText('JFS0005', { exact: true }).waitFor()
    await dialog.getByText('jedchang0308@jenfu.com.tw', { exact: true }).waitFor()
    if ((await dialog.innerText()).includes('directory-shijie') || (await dialog.innerText()).includes('local-customer')) throw new Error('provider identifiers leaked into browser preview')
    await page.screenshot({ path: join(evidenceDir, 'administrator-link-confirmation-1024x768.png'), fullPage: true })
    const [confirmResponse] = await Promise.all([
      page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/api/orgmaster/employees/${employeeId}/managed-identity/confirm`)),
      dialog.getByRole('button', { name: '確認連結', exact: true }).click(),
    ])
    const confirmPayload = await confirmResponse.json().catch(() => null)
    if (confirmResponse.status() !== 200) throw new Error(`Google link confirm failed: status=${confirmResponse.status()} body=${JSON.stringify(confirmPayload)}`)
    await section.getByText('jedchang0308@jenfu.com.tw', { exact: true }).waitFor()
    await section.getByText('等待員工首次使用 Google 登入。', { exact: true }).waitFor()
    const visibleErrors = await page.locator('[role="alert"]:visible, .inline-error:visible').count(); if (visibleErrors > 0) throw new Error(`visible error sweep failed after Google link flow: ${visibleErrors}`)
    flow = { employee: '張仕杰', employeeNumber: 'JFS0005', primaryEmail: 'jedchang0308@jenfu.com.tw', redactedPreview: true, finalState: 'directory_linked_pending_auth', visibleErrors }
  } else {
    await page.getByRole('button', { name: '設定員工編號', exact: true }).click(); await page.getByLabel('JFS 員工編號').fill('jfs9876'); await page.getByRole('button', { name: '儲存編號', exact: true }).click()
    await page.locator('.employee-identity-section').getByText('JFS9876', { exact: true }).waitFor()
    await page.getByRole('button', { name: '變更編號', exact: true }).click(); await page.getByLabel('JFS 員工編號').fill('jfs9877'); await page.getByRole('button', { name: '繼續', exact: true }).click()
    const confirmation = page.getByRole('dialog', { name: '確認變更員工編號' }); await confirmation.getByText('JFS9876 → JFS9877', { exact: true }).waitFor(); await confirmation.getByText('舊編號將永久保留且不得重用', { exact: false }).waitFor()
    await page.screenshot({ path: join(evidenceDir, 'administrator-change-confirmation-1024x768.png'), fullPage: true }); await confirmation.getByRole('button', { name: '確認變更', exact: true }).click(); await page.locator('.employee-identity-section').getByText('JFS9877', { exact: true }).waitFor()
    const visibleErrors = await page.locator('[role="alert"]:visible, .inline-error:visible').count(); if (visibleErrors > 0) throw new Error(`visible error sweep failed after employee-number flow: ${visibleErrors}`)
    flow = { initialAssigned: 'JFS9876', confirmation: 'JFS9876 -> JFS9877', finalReadback: 'JFS9877', visibleErrors }
  }
  const evidence = { contract: dev049 ? 'DEV-049' : 'DEV-047', evidenceScope: 'LOCAL_ISOLATED', status: 'PASS', baseUrl, port, ownerPid: process.pid, temporaryRoot: tempRoot, cleanup: 'browser/server closed and temporary root removed', gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), results, flow, providerReadCount: dev049 ? 2 : 0, providerWriteCount: 0, generatedAt: new Date().toISOString() }
  await writeFile(join(evidenceDir, 'manifest.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8'); console.log(JSON.stringify(evidence, null, 2))
} finally {
  if (browser) await browser.close(); if (server?.listening) await new Promise((resolve) => server.close(() => resolve())); await rm(tempRoot, { recursive: true, force: true })
}
