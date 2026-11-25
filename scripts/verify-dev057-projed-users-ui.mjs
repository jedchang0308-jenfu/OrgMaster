#!/usr/bin/env node
// Actual React component + same-origin synthetic metadata API. No owner services or production Session.
import assert from 'node:assert/strict'
import { connect } from 'node:net'
import { createServer as createHttpServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { chromium } from 'playwright'

const root = process.cwd()
const evidenceDir = resolve(root, 'output/playwright/projed-users')
await mkdir(evidenceDir, { recursive: true })
const route = '/api/orgmaster/projed-users/v1'
const version = 'orgmaster.projed-users.v1'
const initial = [
  { googleSubject: 'fixture-personal-subject', accountId: 'fixture-account', principalId: 'fixture-personal-principal', email: 'owner-fixture@example.invalid', displayName: '個人測試', kind: 'personal', enabled: true, revision: '3:7', identityStatus: 'ACTIVE', loginEligible: true, externalStatus: 'NONE' },
  { googleSubject: 'fixture-external-subject', accountId: null, principalId: null, email: 'guest-fixture@example.invalid', displayName: null, kind: 'external', enabled: false, revision: '0:2', identityStatus: 'UNREGISTERED', loginEligible: false, externalStatus: 'PENDING' },
  { googleSubject: 'fixture-inactive-subject', accountId: 'fixture-inactive-account', principalId: 'fixture-external-principal', email: 'inactive-fixture@example.invalid', displayName: '外部測試', kind: 'external', enabled: false, revision: '2:5', identityStatus: 'ACTIVE', loginEligible: false, externalStatus: 'INACTIVE' },
]
let users = structuredClone(initial)
let mode = 'normal'
let origin = ''
let server
let browser
let port = 0
let releaseWrite
let posted
let postArrived
const traffic = []
const results = []
const receipts = new Map()
const errors = []
const fixtureId = '\0virtual:projed-users-ui'
const normalized = path => path.replaceAll('\\', '/')
const bundle = await build({
  configFile: false, logLevel: 'error', cacheDir: join(evidenceDir, '.vite-cache'),
  plugins: [react(), {
    name: 'isolated-projed-users-ui',
    resolveId(id) { if (id === 'virtual:projed-users-ui') return fixtureId },
    load(id) {
      if (id !== fixtureId) return
      return `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {GovernanceProjedUsers} from ${JSON.stringify(normalized(resolve(root, 'src/components/GovernanceProjedUsers.tsx')))};
        import ${JSON.stringify(normalized(resolve(root, 'src/index.css')))};
        import ${JSON.stringify(normalized(resolve(root, 'src/components/GovernanceCenter.css')))};
        createRoot(document.getElementById('root')).render(React.createElement('div', {className:'governance-center governance-center--workspace'},
          React.createElement('main', {className:'governance-main'}, React.createElement(GovernanceProjedUsers, {canManage:true, principalId:'fixture-admin-principal'}))));`
    },
  }],
  build: { write: false, minify: false, rollupOptions: { input: 'virtual:projed-users-ui', output: { entryFileNames: 'fixture.js', assetFileNames: '[name][extname]' } } },
})
const outputs = (Array.isArray(bundle) ? bundle : [bundle]).flatMap(value => value.output)
const assets = new Map(outputs.map(value => [`/${value.fileName}`, value.type === 'chunk' ? value.code : value.source]))
const styles = outputs.filter(value => value.fileName.endsWith('.css')).map(value => `<link rel="stylesheet" href="/${value.fileName}">`).join('')
const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">${styles}<style>html,body,#root{margin:0;width:100%;height:100%;}#root{display:flex;justify-content:center;}</style></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>`
const envelope = () => ({ contractVersion: version, users: structuredClone(users) })
const postCount = () => traffic.filter(value => value.method === 'POST').length
const screenshot = (page, filename) => page.screenshot({ path: join(evidenceDir, filename), fullPage: true })
const row = (page, email) => page.locator('tbody tr').filter({ hasText: email })
const personalRow = page => row(page, initial[0].email)
const externalRow = page => row(page, initial[1].email)
function holdNextWrite() {
  mode = 'hold'
  postArrived = new Promise(resolve => { posted = resolve })
}
try {
  server = createHttpServer(async (request, response) => {
    const send = (status, value) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)) }
    if (request.url === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': 'orgmaster_session=LOCAL_SIMULATION.projed-users; HttpOnly; SameSite=Strict; Path=/' }); response.end(html); return
    }
    if (assets.has(request.url)) {
      response.writeHead(200, { 'content-type': request.url.endsWith('.css') ? 'text/css' : 'text/javascript' }); response.end(assets.get(request.url)); return
    }
    if (request.url !== route) { response.writeHead(404); response.end(); return }
    if (request.headers.cookie !== 'orgmaster_session=LOCAL_SIMULATION.projed-users'
      || (request.method === 'POST' && request.headers.origin !== origin)) { send(403, { code: 'FIXTURE_AUTH_REQUIRED' }); return }
    if (request.method === 'GET') { traffic.push({ method: 'GET', status: 200 }); send(200, envelope()); return }
    let text = ''; for await (const chunk of request) text += chunk
    const command = JSON.parse(text)
    const entry = { method: 'POST', command, status: 0 }; traffic.push(entry)
    if (mode === 'hold') {
      posted()
      await new Promise(resolve => { releaseWrite = resolve })
      mode = 'normal'
    }
    if (mode === 'conflict') { mode = 'normal'; entry.status = 409; send(409, { code: 'PROJED_USERS_REVISION_CONFLICT' }); return }
    if (receipts.has(command.commandId)) { entry.status = 200; send(200, envelope()); return }
    const target = users.find(value => value.googleSubject === command.googleSubject)
    if (!target || target.revision !== command.expectedRevision) { entry.status = 409; send(409, { code: 'PROJED_USERS_REVISION_CONFLICT' }); return }
    target.enabled = command.action === 'restore'
    target.revision = `fixture:${receipts.size + 1}`
    target.loginEligible = target.enabled && target.identityStatus === 'ACTIVE' && (target.kind === 'personal' || target.externalStatus === 'ACTIVE')
    receipts.set(command.commandId, true)
    if (mode === 'unknown') { mode = 'normal'; entry.status = 503; send(503, { code: 'SIMULATED_RESPONSE_UNCERTAIN' }); return }
    entry.status = 200; send(200, envelope())
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  port = server.address().port; origin = `http://127.0.0.1:${port}`
  console.log(JSON.stringify({ runtime: { pid: process.pid, port, origin, purpose: 'isolated ProJED users actual-component browser fixture', cleanup: 'close this script browser/server and verify loopback port released' } }))
  // A fresh headless Edge context; never attach to an existing browser/profile.
  browser = await chromium.launch({ headless: true, channel: 'msedge' })
  const context = await browser.newContext()
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    users = structuredClone(initial); receipts.clear(); traffic.length = 0; mode = 'normal'
    const label = `${viewport.width}x${viewport.height}`
    await page.setViewportSize(viewport)
    await page.goto(origin, { waitUntil: 'networkidle' })
    await page.getByRole('heading', { name: 'ProJED 使用者' }).waitFor()
    await externalRow(page).getByText('尚未首次登入').waitFor()
    assert.equal(await page.locator('tbody tr').count(), 3)
    assert.equal(await page.getByText('fixture-personal-subject', { exact: true }).count(), 0)
    const overflow = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth, table: document.querySelector('.governance-table-wrap').clientWidth, tableScroll: document.querySelector('.governance-table-wrap').scrollWidth }))
    assert.ok(overflow.page <= overflow.viewport + 1, `page overflow ${label}: ${JSON.stringify(overflow)}`)
    await screenshot(page, `list-${label}.png`)
    await page.getByRole('searchbox').fill(initial[0].email)
    assert.equal(await page.locator('tbody tr').count(), 1)
    await personalRow(page).getByRole('button', { name: '停用 個人測試', exact: true }).click()
    const before = postCount()
    await page.getByRole('group', { name: '確認停用', exact: true }).getByText('確認停用 個人測試 的 ProJED 登入資格？').waitFor()
    assert.equal(postCount(), before)
    await screenshot(page, `confirm-${label}.png`)
    holdNextWrite()
    const confirm = page.getByRole('group', { name: '確認停用', exact: true })
    const confirmBounds = await confirm.boundingBox()
    assert.ok(confirmBounds.x >= 0 && confirmBounds.x + confirmBounds.width <= viewport.width + 1, `confirmation outside viewport ${label}`)
    await confirm.getByRole('button', { name: '確認停用', exact: true }).click()
    await postArrived
    assert.equal(await page.getByRole('button', { name: '重新載入', exact: true }).isDisabled(), true)
    assert.equal(await personalRow(page).locator('button').isDisabled(), true)
    releaseWrite(); releaseWrite = undefined
    await personalRow(page).getByRole('button', { name: '恢復 個人測試', exact: true }).waitFor()
    await personalRow(page).getByText('不具登入資格', { exact: true }).waitFor()
    await screenshot(page, `disabled-${label}.png`)
    await personalRow(page).getByRole('button', { name: '恢復 個人測試', exact: true }).click()
    await page.getByText('已恢復啟用；需重新登入 ProJED，舊登入不會恢復。', { exact: true }).waitFor()
    await personalRow(page).getByText('具登入資格', { exact: true }).waitFor()
    await screenshot(page, `restored-${label}.png`)
    await page.getByRole('searchbox').fill(initial[1].email)
    mode = 'conflict'
    const beforeConflict = postCount()
    await externalRow(page).getByRole('button', { name: `恢復 ${initial[1].email}`, exact: true }).click()
    await page.getByRole('alert').filter({ hasText: '資料已更新' }).waitFor()
    assert.equal(postCount(), beforeConflict + 1)
    assert.equal(await page.getByRole('button', { name: '查詢並重送原操作', exact: true }).count(), 0)
    await screenshot(page, `conflict-${label}.png`)
    await page.getByRole('button', { name: '重新載入', exact: true }).click()
    await page.getByRole('button', { name: `恢復 ${initial[1].email}`, exact: true }).waitFor({ state: 'visible' })
    mode = 'unknown'
    await externalRow(page).getByRole('button', { name: `恢復 ${initial[1].email}`, exact: true }).click()
    await page.getByText('操作結果尚未確認。', { exact: false }).waitFor()
    const originalCommand = traffic.at(-1).command
    const beforeRetry = postCount()
    assert.equal(await externalRow(page).locator('button').isDisabled(), true)
    await screenshot(page, `unknown-${label}.png`)
    await page.getByRole('button', { name: '查詢並重送原操作', exact: true }).click()
    await page.getByText('已恢復啟用；需重新登入 ProJED，舊登入不會恢復。', { exact: true }).waitFor()
    assert.equal(postCount(), beforeRetry + 1)
    assert.deepEqual(traffic.at(-1).command, originalCommand)
    assert.equal(traffic.at(-2).method, 'GET')
    await externalRow(page).getByText('尚未首次登入', { exact: true }).waitFor()
    await externalRow(page).getByText('不具登入資格', { exact: true }).waitFor()
    await externalRow(page).getByText('待核准', { exact: true }).waitFor()
    results.push({ viewport: label, overflow, emailSearch: true, disableConfirmation: true, busyAndUnknownFence: true, disableRestore: true, conflictNoReplay: true, unknownReadbackSameCommand: true, unregisteredAndExternalQualificationPreserved: true, traffic: structuredClone(traffic) })
  }
  assert.deepEqual(errors, [])
} catch (error) {
  errors.push(error.stack ?? error.message)
  throw error
} finally {
  releaseWrite?.()
  if (browser) await browser.close()
  if (server?.listening) await new Promise((resolve, reject) => { server.closeIdleConnections(); server.close(error => error ? reject(error) : resolve()) })
  const portReleased = port ? await new Promise(resolve => {
    const probe = connect({ host: '127.0.0.1', port }); probe.once('connect', () => { probe.destroy(); resolve(false) }); probe.once('error', () => resolve(true))
  }) : true
  const evidence = { status: errors.length ? 'FAIL' : 'PASS', scope: 'LOCAL_ISOLATED_ACTUAL_COMPONENT_SYNTHETIC_METADATA_API', sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), ownerPid: process.pid, port, portReleased, browserClosed: !!browser, generatedAt: new Date().toISOString(), results, errors, limits: ['No production Session or owner-service end-to-end verification', '390px uses the actual component with synthetic canManage=true; parent app mobile read-only policy is outside this fixture'] }
  await writeFile(join(evidenceDir, 'manifest.json'), `${JSON.stringify(evidence, null, 2)}\n`)
  console.log(JSON.stringify({ status: evidence.status, evidenceDir, ownerPid: process.pid, port, portReleased, results: results.length, errors }))
}
