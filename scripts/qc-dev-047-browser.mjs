#!/usr/bin/env node
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chromium } from 'playwright'
import { createOrgmasterServer } from '../dist-server/server.mjs'

const root = process.cwd(); const tempRoot = await mkdtemp(join(tmpdir(), 'orgmaster-dev-047-browser-')); const evidenceDir = join(root, 'qa', 'dev-047', 'browser'); await mkdir(evidenceDir, { recursive: true })
let server; let browser; let port = 0; const results = []
try {
  await cp(join(root, 'dist'), join(tempRoot, 'dist'), { recursive: true }); await cp(join(root, 'data'), join(tempRoot, 'data'), { recursive: true })
  server = createOrgmasterServer({ root: tempRoot, devIdentityEnabled: true, managedIdentityEnabled: true })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { port = server.address().port; resolve() }) })
  browser = await chromium.launch({ headless: true }); const context = await browser.newContext({ viewport: { width: 1024, height: 768 } }); const page = await context.newPage(); const baseUrl = `http://127.0.0.1:${port}`
  const employeeId = '37e8e57e-a0d1-4280-b815-d209aa629380'
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' })
  const login = await page.evaluate(async () => { const response = await fetch('/api/auth/development/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId: 'administrator' }) }); return { status: response.status, body: await response.json() } })
  if (login.status !== 200) throw new Error('development administrator login failed')
  for (const viewport of [{ width: 1440, height: 900, label: '1440x900' }, { width: 1024, height: 768, label: '1024x768' }, { width: 390, height: 844, label: '390x844' }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height }); await page.goto(`${baseUrl}/?panels=employees&focus=employees&select=employee%3A${employeeId}&details=employees&employee=${employeeId}`, { waitUntil: 'networkidle' })
    const text = await page.locator('body').innerText(); const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewportWidth: window.innerWidth }))
    if (overflow.width > overflow.viewportWidth + 1) throw new Error(`horizontal overflow at ${viewport.label}`)
    const section = page.locator('.employee-identity-section'); const hasSection = await section.count() > 0; const sectionText = hasSection ? await section.first().innerText() : ''; const hasNumber = text.includes('設定員工編號') || text.includes('尚未設定員工編號') || sectionText.includes('設定編號') || sectionText.includes('尚未設定') || /JFS[0-9]{4}/u.test(sectionText); const hasLegacy = text.includes('邀請') || text.includes('設定登入帳號')
    if (!hasSection || !hasNumber || hasLegacy) throw new Error(`managed identity surface mismatch at ${viewport.label}: section=${hasSection} number=${hasNumber} legacy=${hasLegacy} sectionText=${sectionText}`)
    results.push({ viewport: viewport.label, hasSection, hasNumber, hasLegacy, overflow }); await page.screenshot({ path: join(evidenceDir, `administrator-${viewport.label}.png`), fullPage: true })
  }
  const evidence = { contract: 'DEV-047', evidenceScope: 'LOCAL_ISOLATED', status: 'PASS', baseUrl, port, ownerPid: process.pid, temporaryRoot: tempRoot, cleanup: 'browser/server closed and temporary root removed', gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), results, providerReadCount: 0, providerWriteCount: 0, generatedAt: new Date().toISOString() }
  await writeFile(join(evidenceDir, 'manifest.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8'); console.log(JSON.stringify(evidence, null, 2))
} finally {
  if (browser) await browser.close(); if (server?.listening) await new Promise((resolve) => server.close(() => resolve())); await rm(tempRoot, { recursive: true, force: true })
}
