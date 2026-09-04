import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createOrgmasterServer } from '../dist-server/server.mjs'
import { chromium } from 'playwright'

const projectRoot = process.cwd()
const employeeId = '14466657-006e-4538-aade-5877c166b038'
const evidenceDir = `${projectRoot}/qa/dev-045/browser`
await mkdir(evidenceDir, { recursive: true })
const tempRoot = await mkdtemp(join(tmpdir(), 'orgmaster-dev-045-browser-'))
let server = null
let port = 0
let browser = null
const results = []
function gitValue(args) { try { return execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8' }).trim() } catch { return '' } }
async function servedArtifactManifest() {
  const files = []
  async function walk(directory, prefix) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name); const relative = `${prefix}/${entry.name}`
      if (entry.isDirectory()) await walk(absolute, relative)
      else { const bytes = await readFile(absolute); files.push({ path: relative.replaceAll('\\', '/'), bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') }) }
    }
  }
  await walk(join(tempRoot, 'dist'), 'dist')
  const serverBundle = await readFile(join(projectRoot, 'dist-server', 'server.mjs'))
  files.push({ path: 'dist-server/server.mjs', bytes: serverBundle.byteLength, sha256: createHash('sha256').update(serverBundle).digest('hex') })
  files.sort((a, b) => a.path.localeCompare(b.path))
  return { files, aggregateSha256: createHash('sha256').update(files.map((file) => `${file.path}:${file.bytes}:${file.sha256}`).join('\n')).digest('hex') }
}
try {
  await cp(join(projectRoot, 'dist'), join(tempRoot, 'dist'), { recursive: true })
  await cp(join(projectRoot, 'data'), join(tempRoot, 'data'), { recursive: true })
  server = createOrgmasterServer({ root: tempRoot, devIdentityEnabled: true, accountEnrollmentEnabled: true })
  const listen = new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { port = server.address().port; resolve() }) })
  await listen
  const baseUrl = `http://127.0.0.1:${port}`
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } })
  const page = await context.newPage()
  for (const profileId of ['administrator', 'governance-manager', 'method-manager', 'employee']) {
    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' })
    const response = await page.evaluate(async (id) => { const result = await fetch('/api/auth/development/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId: id }) }); return { status: result.status, body: await result.json() } }, profileId)
    if (response.status !== 200) throw new Error(`development profile ${profileId} failed: ${response.status}`)
    await page.goto(`${baseUrl}/?panels=employees&focus=employees&select=employee%3A${employeeId}&details=employees&employee=${employeeId}`, { waitUntil: 'networkidle' })
    const text = await page.locator('body').innerText()
    const hasMutationCta = text.includes('設定登入帳號') || text.includes('新增登入帳號')
    const result = { profileId, viewport: '1024x768', accountSection: text.includes('登入帳號'), hasMutationCta }
    if (profileId === 'administrator') {
      await page.getByRole('button', { name: '設定登入帳號' }).click()
      if (await page.getByRole('dialog').count() !== 1) throw new Error('account setup dialog did not open')
      await page.screenshot({ path: `${evidenceDir}/administrator-invite-modal.png`, fullPage: true })
      await page.getByLabel('公司 Email').fill('new.browser@orgmaster.test')
      await page.getByRole('button', { name: '送出邀請' }).click()
      await page.getByText('等待接受').waitFor({ state: 'visible' })
      result.invitePending = true
      await page.screenshot({ path: `${evidenceDir}/administrator-pending.png`, fullPage: true })
      await page.getByRole('button', { name: '新增登入帳號' }).click()
      if (await page.getByRole('dialog').count() !== 1) throw new Error('account setup dialog did not reopen')
      await page.keyboard.press('Escape')
      await page.screenshot({ path: `${evidenceDir}/administrator-1024x768.png`, fullPage: true })
    }
    results.push(result)
  }
  await page.evaluate(async () => { await fetch('/api/auth/development/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId: 'administrator' }) }) })
  for (const viewport of [{ width: 390, height: 844, label: '390x844' }, { width: 1440, height: 900, label: '1440x900' }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto(`${baseUrl}/?panels=employees&focus=employees&select=employee%3A${employeeId}&details=employees&employee=${employeeId}`, { waitUntil: 'networkidle' })
    const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight }))
    if (overflow.width > overflow.viewportWidth + 1) throw new Error(`horizontal overflow at ${viewport.label}`)
    const viewportText = await page.locator('body').innerText()
    const accountMutationButtons = await page.locator('.employee-identity-section').getByRole('button', { name: /設定登入帳號|新增登入帳號|重送|取消|停用|重新啟用/ }).count()
    if (viewport.label === '390x844' && accountMutationButtons > 0) throw new Error('mobile viewport exposed account mutation control')
    results.push({ profileId: 'administrator', viewport: viewport.label, accountSection: Boolean(await page.locator('.employee-identity-section').count()), hasMutationCta: accountMutationButtons > 0, overflow })
    await page.screenshot({ path: `${evidenceDir}/administrator-${viewport.label}.png`, fullPage: true })
  }
  const artifacts = await servedArtifactManifest()
  const dirtyFiles = gitValue(['status', '--short']).split(/\r?\n/).filter(Boolean)
  await writeFile(`${evidenceDir}/manifest.json`, JSON.stringify({ contract: 'DEV-045', artifact: 'dist + dist-server', baseUrl, port, ownerPid: process.pid, purpose: 'task-owned DEV-045 browser QC', temporaryRoot: tempRoot, cleanup: 'in-process server/browser closed, port probed released, temporary root removed in finally', gitHead: gitValue(['rev-parse', 'HEAD']), dirtyFiles, nodeVersion: process.version, chromiumVersion: browser.version(), productionWrites: false, emailDelivered: false, servedFiles: artifacts.files, aggregateSha256: artifacts.aggregateSha256, results }, null, 2), 'utf8')
  console.log(JSON.stringify({ contract: 'DEV-045', baseUrl, port, results }, null, 2))
} finally {
  if (browser) await browser.close()
  if (server?.listening) await new Promise((resolve) => server.close(() => resolve()))
  if (port) await new Promise((resolve) => {
    const probe = connect({ host: '127.0.0.1', port })
    const finish = () => { probe.destroy(); resolve() }
    probe.once('connect', finish)
    probe.once('error', finish)
    probe.setTimeout(250, finish)
  })
  await rm(tempRoot, { recursive: true, force: true })
}
