#!/usr/bin/env node
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'
import { createOrgmasterServer } from '../dist-server/server.mjs'

const root = process.cwd()
const tempRoot = await mkdtemp(join(tmpdir(), 'orgmaster-dev-050-browser-'))
const evidenceDir = join(root, 'qa', 'dev-050', 'browser')
await mkdir(evidenceDir, { recursive: true })
let server
let browser
let port = 0
const results = []
try {
  await cp(join(root, 'dist'), join(tempRoot, 'dist'), { recursive: true })
  server = createOrgmasterServer({ root: tempRoot, devIdentityEnabled: false, managedIdentityEnabled: false })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { port = server.address().port; resolve() }) })
  console.log(JSON.stringify({ runtimeDeclaration: { project: root, purpose: 'DEV-050 normal built-entry browser UI QC', port, owningProcessTree: `node:${process.pid} -> task-owned HTTP server and Chromium`, cleanupCondition: 'browser and server closed, port released, temporary root removed', mutationScope: tempRoot, primaryDataWrites: false } }))
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  const baseUrl = `http://127.0.0.1:${port}`
  await page.route('**/api/auth/me', async (route) => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'auth_session_invalid', correlationId: 'qc-dev050-me' }) }))
  await page.route('**/api/auth/mode', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authMode: 'jenfu_firebase_bff', firebase: { apiKey: 'qc-key', authDomain: 'qc.example', projectId: 'qc-project', appId: 'qc-app' }, managedLoginEnabled: true, ssoHandoffEnabled: false, correlationId: 'qc-dev050-mode' }) }))
  for (const viewport of [{ width: 1440, height: 900, label: '1440x900' }, { width: 390, height: 844, label: '390x844' }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' })
    await page.getByRole('heading', { name: '以 JFS 員工編號或公司 Email 登入' }).waitFor()
    await page.getByLabel('員工編號或公司 Email').waitFor()
    const details = page.locator('details.auth-login--legacy')
    if (await details.count() !== 1 || await details.locator('summary').innerText() !== '既有帳號登入') throw new Error(`legacy login disclosure mismatch at ${viewport.label}`)
    if (await details.locator('form').isVisible()) throw new Error(`legacy form unexpectedly expanded at ${viewport.label}`)
    const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewportWidth: window.innerWidth }))
    if (overflow.width > overflow.viewportWidth + 1) throw new Error(`horizontal overflow at ${viewport.label}`)
    results.push({ viewport: viewport.label, managedHeading: true, managedIdentifierField: true, legacyCollapsed: true, overflow })
    await page.screenshot({ path: join(evidenceDir, `login-${viewport.label}.png`), fullPage: true })
  }
  const evidence = { contract: 'DEV-050', evidenceScope: 'LOCAL_ISOLATED', status: 'PASS', baseUrl, port, ownerPid: process.pid, temporaryRoot: tempRoot, cleanup: 'browser/server closed and temporary root removed', gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), results, providerReadCount: 0, providerWriteCount: 0, generatedAt: new Date().toISOString() }
  await writeFile(join(evidenceDir, 'manifest.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(evidence, null, 2))
} finally {
  if (browser) await browser.close()
  if (server?.listening) await new Promise((resolve) => server.close(() => resolve()))
  await rm(tempRoot, { recursive: true, force: true })
}
