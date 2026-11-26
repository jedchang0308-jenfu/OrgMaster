import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { join, resolve, sep } from 'node:path'
import { chromium } from 'playwright'
import { createOrgmasterServer } from '../dist-server/server.mjs'

// RD browser self-check. All identities, documents and provider replies are synthetic.
process.env.NODE_ENV = 'test'
process.env.ORGMASTER_PERSISTENCE_MODE = 'local-json'
process.env.ORGMASTER_JENFU_SSO_HANDOFF_MODE = 'off'
process.env.OPENAI_API_KEY = 'dev071-owned-loopback-fixture'
process.env.ORGMASTER_DUTY_MAP_MODEL = 'dev071-synthetic-model'
const project = process.cwd()
const tempBase = resolve(project, '.codex-tmp')
const evidence = resolve(project, 'output/dev071/browser')
await mkdir(tempBase, { recursive: true })
await mkdir(evidence, { recursive: true })
const root = await mkdtemp(join(tempBase, 'dev071-browser-'))
assert(root.startsWith(tempBase + sep))
const servers = []
const checks = []
const modelInputs = []
const apiResponses = []
const a17EndpointChecks = []
let providerMode = 'valid'
let browser
let page

async function listen(server) {
  servers.push(server)
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  return 'http://127.0.0.1:' + server.address().port
}
async function check(name, run) {
  await run()
  checks.push({ name, result: 'PASS' })
}
async function expectCount(locator, expected) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    if (await locator.count() === expected) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.equal(await locator.count(), expected)
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]))
}
const hash = value => createHash('sha256').update(value).digest('hex')
const now = new Date().toISOString()
const state = {
  employees: [], departments: [], roles: [], positions: [], assignments: [], members: [],
  roleCombinationRiskRules: [], organizationLevels: [{ id: 'fixture-level-company', name: '公司', order: 0 }],
  organizationLayout: { mode: 'tree', showLevelGuides: true, positionYOverrides: {} },
  duties: [], dutyPositionRelations: [], processes: [], processNodes: [], processEdges: [], processNodeDutyLinks: [],
}
const methodTitles = ['採購與委外作業辦法（示例）', '品質檢驗與放行辦法（示例）', '水槽焊接委外驗收作業說明（示例）', '委外對帳與付款交接辦法（示例）']
const methodRequirements = [
  '發包時交代適用圖面、工作範圍、交期與驗收依據，交件時附上核對資料。',
  '檢驗須有適用依據與可回查的結果，異常交回相關部門確認處置。',
  '依本案核定圖面及驗收準則核對焊接部位與水密性，記錄結果並交回生產。',
  '生產提供對帳及驗收依據，財務據以核實支付資料並回覆付款結果。',
]
function fixtureMethod(title, number) {
  const body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: title + '。隔離走讀用虛構辦法：' + methodRequirements[number - 1] }] }] }
  const bodyHash = hash(JSON.stringify(stable(body)))
  const draftRevision = 'fixture-draft-' + number
  return {
    id: 'fixture-method-' + number, code: 'MP-' + String(number).padStart(4, '0'),
    creationRequestId: randomUUID(), creationInputHash: hash(title), title,
    ownerEmployeeId: '00000000-0000-7000-8000-000000000071', methodRevision: randomUUID(),
    workingDraft: { bodyFormat: 'editor-json-v1', body, bodyHash, revision: draftRevision, mediaIds: [], updatedByPrincipalId: 'dev-principal-local-admin', updatedAt: now },
    readableSnapshot: { title, ownerEmployeeId: '00000000-0000-7000-8000-000000000071', bodyFormat: 'editor-json-v1', body, bodyHash, sourceDraftRevision: draftRevision, mediaIds: [], providedByPrincipalId: 'dev-principal-local-admin', providedAt: now },
    generationMeta: { provider: 'fake', model: 'dev071-synthetic-model', promptVersion: 'management-method-draft-v1', providerRequestId: null, durationMs: 0, inputTokens: null, outputTokens: null, generatedAt: now },
    createdByPrincipalId: 'dev-principal-local-admin', createdAt: now, updatedByPrincipalId: 'dev-principal-local-admin', updatedAt: now,
  }
}

try {
  await cp(join(project, 'dist'), join(root, 'dist'), { recursive: true })
  await mkdir(join(root, 'data'), { recursive: true })
  await writeFile(join(root, 'data/orgmaster-document.v7.json'), JSON.stringify({ app: 'OrgMaster', version: 8, kind: 'document', savedAt: now, state }))
  const providerUrl = await listen(createServer(async (request, response) => {
    try {
      assert.equal(request.url, '/v1/responses')
      let raw = ''
      for await (const chunk of request) raw += chunk
      const requestBody = JSON.parse(raw)
      const company = JSON.parse(requestBody.input[1].content[0].text)
      modelInputs.push(company)
      const refs = ['現場維修、保養與改造執行', '產品操作、安裝與維護技術文件'].map(title => {
        const duty = company.duties.find(item => item.title === title)
        assert(duty, title)
        return { kind: 'duty', id: duty.id }
      })
      const finding = {
        kind: 'handoff-gap', nodeRefs: providerMode === 'invalid' ? [{ kind: 'duty', id: 'outside-this-version' }] : refs,
        chapterIds: ['03', '07'], relationshipIds: [], summary: '確認修復經驗的圖面交接',
        observed: '本版已有現場維修與維護技術文件職掌', suggestion: '核對修復經驗如何交接成圖面指引', reason: '執行依據仍須主管確認',
      }
      const findings = [finding]
      const planned = company.memberships.find(item => item.planningStage === 'long-term')
      if (planned && providerMode === 'valid') findings.push({
        kind: 'needs-confirmation', nodeRefs: [{ kind: 'duty', id: planned.dutyId }], chapterIds: ['12'], relationshipIds: [],
        summary: '已規劃能力的執行狀態待確認', observed: '本版將此能力標為中長期規劃',
        suggestion: '請主管補充實際啟動及執行佐證', reason: '未提供執行證據，不能推定此能力已上線',
      })
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({
        id: 'resp_dev071_fixture', object: 'response', status: 'completed', created_at: 1, model: 'dev071-synthetic-model',
        output: [{ id: 'msg_dev071_fixture', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify({ findings }), annotations: [] }] }],
      }))
    } catch {
      response.statusCode = 500
      response.end(JSON.stringify({ error: 'Synthetic provider fixture failed' }))
    }
  }))
  process.env.OPENAI_BASE_URL = providerUrl + '/v1'
  const server = createOrgmasterServer({
    root, devIdentityEnabled: true,
    authRuntime: { configResult: { configured: false, missing: ['ORGMASTER_POSTGRES_URL'], reason: 'DEV-071 isolated browser fixture' } },
  })
  const base = await listen(server)
  browser = await chromium.launch({ channel: 'msedge', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', async response => {
    if (!response.url().startsWith(base + '/api/')) return
    const payload = await response.json().catch(() => ({}))
    apiResponses.push({ path: response.url().slice(base.length), method: response.request().method(), status: response.status(), error: payload.error, revision: payload.revision ?? payload.version?.revision })
  })
  const requests = []
  page.on('request', request => { if (request.url().startsWith(base + '/api/')) requests.push({ method: request.method(), url: request.url().slice(base.length) }) })
  // Prepare the ordinary workspace prerequisite before the first React mount.
  const login = await context.request.post(base + '/api/auth/development/session', { headers: { Origin: base }, data: { profileId: 'administrator' } })
  assert.equal(login.status(), 200, await login.text())
  const readyWorkspace = await context.request.get(base + '/api/orgmaster/workspace')
  assert.equal(readyWorkspace.status(), 200, await readyWorkspace.text())
  const mapUrl = base + '/?panels=duties&focus=duties&details=none&dutyView=map'
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '工作職掌', exact: true }).click()
  await page.getByRole('button', { name: '關係圖', exact: true }).click()
  const closeOrganization = page.getByRole('button', { name: '關閉組織架構圖', exact: true })
  if (await closeOrganization.count()) await closeOrganization.click()
  const graph = page.locator('.duty-mind-map')
  const expandGroup = async title => {
    const toggle = graph.locator('.duty-mind-map__node--group').filter({ hasText: title }).locator('.duty-mind-map__node-title')
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click()
  }
  const beforeWorkspace = await page.evaluate(async () => (await fetch('/api/orgmaster/workspace')).json())
  const beforeCurrent = JSON.parse(await readFile(join(root, 'data/orgmaster-versions', beforeWorkspace.currentVersionId + '.json'), 'utf8'))
  await page.getByRole('button', { name: '建立職掌規劃草稿', exact: true }).click()
  await graph.locator('.duty-mind-map__company').waitFor()
  const index = await page.evaluate(async () => (await fetch('/api/orgmaster/workspace')).json())
  const draft = index.versions.find(version => version.kind === 'draft')
  assert(draft)
  const projection = await page.evaluate(async id => (await fetch('/api/orgmaster/duty-map?versionId=' + id)).json(), draft.id)
  await check('A01-A02 baseline and normal draft creation', async () => {
    assert.equal(projection.departments.length, 6)
    assert.equal(projection.map.groups.length, 33)
    assert.equal(projection.duties.length, 116)
    await expectCount(graph.locator('.duty-mind-map__node--department'), 6)
    await expectCount(graph.locator('.duty-mind-map__node--group'), 33)
    assert.equal(modelInputs.length, 0)
    const document = JSON.parse(await readFile(join(root, 'data/orgmaster-versions', draft.id + '.json'), 'utf8'))
    assert.equal(document.state.positions.length, 0)
    assert.equal(document.state.assignments.length, 0)
    assert.equal(document.state.dutyPositionRelations.length, 0)
    assert.deepEqual(JSON.parse(await readFile(join(root, 'data/orgmaster-versions', beforeWorkspace.currentVersionId + '.json'), 'utf8')), beforeCurrent)
    await graph.getByLabel('職掌顯示層級', { exact: true }).selectOption('details')
    await expectCount(graph.locator('.duty-mind-map__node--duty'), 116)
    const titles = await graph.locator('.duty-mind-map__node--duty .duty-mind-map__node-title').allTextContents()
    assert.equal(new Set(titles).size, 116)
    await graph.getByRole('button', { name: '清除篩選', exact: true }).click()
  })
  await page.screenshot({ path: join(evidence, 'map-overview-1440.png'), fullPage: true })
  await check('A11 chapter and department intersection', async () => {
    await graph.getByRole('button', { name: '供應商、採購與付款管理', exact: true }).click()
    await expectCount(graph.locator('.duty-mind-map__node--department'), 4)
    await graph.getByRole('button', { name: '清除篩選', exact: true }).click()
    await expectCount(graph.locator('.duty-mind-map__node--department'), 6)
  })
  await check('A21-A23 colored flywheels and opposite handoffs', async () => {
    for (const [id, count] of [['flywheel-customer', 4], ['flywheel-knowledge', 2], ['flywheel-cost', 3]]) {
      await graph.getByLabel('篩選成長飛輪', { exact: true }).selectOption(id)
      await expectCount(graph.locator('.duty-mind-map__delivery'), count)
    }
    await graph.getByLabel('篩選成長飛輪', { exact: true }).selectOption('flywheel-administration')
    await expectCount(graph.locator('.duty-mind-map__cycle'), 1)
    await graph.getByLabel('篩選成長飛輪', { exact: true }).selectOption('flywheel-general-management')
    await expectCount(graph.locator('.duty-mind-map__cycle'), 1)
    await graph.getByRole('button', { name: '清除篩選', exact: true }).click()
  })
  const finance = projection.departments.find(value => value.name === '財務部').id
  await check('A12-A13 A17-A19 real SDK full-company input and result restoration', async () => {
    await graph.getByLabel('篩選部門', { exact: true }).selectOption(finance)
    const reviewResponse = page.waitForResponse(response => response.url().endsWith('/api/orgmaster/duty-map/reviews') && response.request().method() === 'POST')
    await graph.getByRole('button', { name: '請 AI 盤點', exact: true }).click()
    const reviewed = await reviewResponse
    assert.equal(reviewed.status(), 200, JSON.stringify(await reviewed.json()))
    await graph.getByRole('button', { name: '關閉 AI 結果', exact: true }).waitFor()
    assert.equal(modelInputs.length, 1)
    assert.equal(modelInputs[0].departments.length, 6)
    assert.equal(modelInputs[0].groups.length, 33)
    assert.equal(modelInputs[0].duties.length, 116)
    assert.equal(modelInputs[0].chapters.length, 12)
    await expectCount(graph.locator('.duty-mind-map__node--department'), 6)
    await page.screenshot({ path: join(evidence, 'ai-full-company.png'), fullPage: true })
    const endpoints = [
      { title: '現場維修、保養與改造執行', path: '生產部 › 客戶現場工務 › 現場維修、保養與改造執行', image: 'a17-production-endpoint.png' },
      { title: '產品操作、安裝與維護技術文件', path: '研發部 › 工程資料與產品技術管理 › 產品操作、安裝與維護技術文件', image: 'a17-research-endpoint.png' },
    ]
    const sameReason = '執行依據仍須主管確認'
    for (const endpoint of endpoints) {
      const node = graph.locator('.duty-mind-map__node--duty').filter({ hasText: endpoint.title })
      await expectCount(node, 1)
      // Normal canvas scrolling focuses one original branch at a time; no fit/layout override.
      await node.scrollIntoViewIfNeeded()
      await node.locator('.duty-mind-map__node-title').click()
      await node.locator('.duty-mind-map__node-title[aria-pressed="true"]').waitFor()
      assert((await node.getAttribute('class')).includes('is-selected'))
      assert((await node.getAttribute('class')).includes('is-finding'))
      await node.getByRole('button', { name: 'AI 盤點：' + endpoint.title, exact: true }).waitFor()
      const detail = graph.locator('[aria-label="AI 盤點理由"]')
      const text = await detail.innerText()
      for (const other of endpoints) assert(text.includes(other.path), 'missing AI endpoint path: ' + other.path)
      assert(text.includes(sameReason))
      assert(text.includes('確認修復經驗的圖面交接'))
      // Scrolling the existing summary is allowed; both paths and the shared reason must be readable together.
      await detail.locator('dd').filter({ hasText: sameReason }).scrollIntoViewIfNeeded()
      const readability = await detail.evaluate((section, expectedTexts) => {
        const panel = section.closest('.duty-mind-map__detail').getBoundingClientRect()
        const clip = { left: Math.max(0, panel.left), top: Math.max(0, panel.top), right: Math.min(innerWidth, panel.right), bottom: Math.min(innerHeight, panel.bottom) }
        return expectedTexts.map(expected => {
          const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT)
          let found
          while (walker.nextNode()) if (walker.currentNode.textContent.trim() === expected) { found = walker.currentNode; break }
          if (!found) return { text: expected, readable: false, reason: 'text not found' }
          const range = document.createRange(); range.selectNodeContents(found)
          const rects = [...range.getClientRects()]
          const fontSize = parseFloat(getComputedStyle(found.parentElement).fontSize)
          return { text: expected, fontSize, readable: fontSize >= 12 && rects.length > 0 && rects.every(rect => rect.width > 0 && rect.height > 0 && rect.left >= clip.left - 1 && rect.right <= clip.right + 1 && rect.top >= clip.top - 1 && rect.bottom <= clip.bottom + 1) }
        })
      }, [...endpoints.map(value => value.path), sameReason])
      assert(readability.every(value => value.readable), 'AI endpoint summary is clipped: ' + JSON.stringify(readability))
      const branchVisible = await node.locator('.duty-mind-map__node-title').evaluate(button => {
        const rect = button.getBoundingClientRect(), view = button.closest('.duty-mind-map__viewport').getBoundingClientRect()
        return rect.left >= view.left - 1 && rect.right <= view.right + 1 && rect.top >= Math.max(0, view.top) - 1 && rect.bottom <= Math.min(innerHeight, view.bottom) + 1
      })
      assert(branchVisible, 'selected original branch is not readable: ' + endpoint.path)
      await page.screenshot({ path: join(evidence, endpoint.image), fullPage: true })
      a17EndpointChecks.push({ endpoint: endpoint.path, finding: '確認修復經驗的圖面交接', reason: sameReason, branchSelected: true, branchMarked: true, readability, image: endpoint.image })
    }
    await graph.getByRole('button', { name: '關閉 AI 結果', exact: true }).click()
    assert.equal(await graph.getByLabel('篩選部門', { exact: true }).inputValue(), finance)
    await expectCount(graph.locator('.duty-mind-map__node--department'), 1)
  })
  await check('A20 invalid model reference keeps the current reading view', async () => {
    providerMode = 'invalid'
    const invalidResponse = page.waitForResponse(response => response.url().endsWith('/api/orgmaster/duty-map/reviews') && response.request().method() === 'POST')
    await graph.getByRole('button', { name: '請 AI 盤點', exact: true }).click()
    await graph.getByRole('alert').filter({ hasText: '本次 AI 盤點未完成' }).waitFor()
    const invalidResult = await invalidResponse
    assert.equal(invalidResult.status(), 502)
    assert.equal((await invalidResult.json()).error, 'DUTY_MAP_MODEL_OUTPUT_INVALID')
    assert.equal(modelInputs.length, 2)
    assert.equal(await graph.getByLabel('篩選部門', { exact: true }).inputValue(), finance)
    providerMode = 'valid'
  })
  await graph.getByRole('button', { name: '清除篩選', exact: true }).click()
  const documentPath = join(root, 'data/orgmaster-versions', draft.id + '.json')
  const document = JSON.parse(await readFile(documentPath, 'utf8'))
  const quality = document.state.dutyMap.groups.find(value => value.title === '品質策劃、檢驗與放行')
  const purchase = document.state.dutyMap.groups.find(value => value.title === '生產採購、委外與供應商管理')
  const duty = title => document.state.duties.find(value => value.title === title)
  document.state.dutyMap.methodLinks = [
    { id: 'fixture-link-1', target: { kind: 'group', id: purchase.id }, methodId: 'fixture-method-1' },
    { id: 'fixture-link-2', target: { kind: 'group', id: quality.id }, methodId: 'fixture-method-2' },
    { id: 'fixture-link-3', target: { kind: 'duty', id: duty('進料與委外品質驗收').id }, methodId: 'fixture-method-3' },
    { id: 'fixture-link-4', target: { kind: 'duty', id: duty('採購對帳與付款資料交接').id }, methodId: 'fixture-method-4' },
    { id: 'fixture-link-5', target: { kind: 'duty', id: duty('付款排程與支付對象核實').id }, methodId: 'fixture-method-4' },
  ]
  document.state.dutyMap.memberships.find(value => value.dutyId === duty('品質系統建置與技術經驗標準化').id).planningStage = 'long-term'
  await writeFile(documentPath, JSON.stringify(document))
  await writeFile(join(root, 'data/orgmaster-management-methods.v1.json'), JSON.stringify({
    app: 'OrgMasterManagementMethods', schemaVersion: 1, nextMethodNumber: 5,
    methods: methodTitles.map((title, index) => {
      const method = fixtureMethod(title, index + 1)
      if (index === 2) {
        const privateBody = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '尚未提供公司閱讀的草稿修改' }] }] }
        method.workingDraft = { ...method.workingDraft, body: privateBody, bodyHash: hash(JSON.stringify(stable(privateBody))), revision: 'unpublished-new-draft' }
      }
      return method
    }), mediaAssets: [], commandReceipts: [],
  }))
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByLabel('切換組織版本', { exact: true }).selectOption(draft.id)
  await expectCount(graph.locator('.duty-mind-map__node--group'), 33)
  await check('A08-A09 purchasing common method opens from its unassigned child duty', async () => {
    await expandGroup('生產採購、委外與供應商管理')
    await graph.locator('.duty-mind-map__node--duty').filter({ hasText: '委外加工與外部服務交付管理' }).locator('.duty-mind-map__node-title').click()
    await graph.getByRole('button', { name: /採購與委外作業辦法/ }).click()
    await page.locator('.management-method-reader').getByText(/發包時交代適用圖面、工作範圍/).waitFor()
    await page.getByRole('button', { name: '職掌對照', exact: true }).click()
    const drawer = page.locator('.management-method-duty-drawer')
    await expectCount(drawer.locator('.management-method-duty-drawer__rows > div'), 1)
    await drawer.getByText('生產採購、委外與供應商管理', { exact: true }).waitFor()
    assert((await drawer.innerText()).includes('生產部 · 職掌大項'))
    await page.getByRole('button', { name: '關閉職掌對照', exact: true }).click()
    await page.locator('#workspace-tab-duties').click()
  })
  await check('A04 A06-A09 explicit specialized and common method lookup', async () => {
    await expandGroup('品質策劃、檢驗與放行')
    await graph.locator('.duty-mind-map__node--duty').filter({ hasText: '進料與委外品質驗收' }).locator('.duty-mind-map__node-title').click()
    await expectCount(graph.getByRole('button', { name: /水槽焊接委外驗收作業說明/ }), 1)
    await expectCount(graph.getByRole('button', { name: /品質檢驗與放行辦法/ }), 1)
    await graph.locator('.duty-mind-map__node--duty').filter({ hasText: '量測設備適用性與失準影響管理' }).locator('.duty-mind-map__node-title').click()
    await expectCount(graph.getByRole('button', { name: /水槽焊接委外驗收作業說明/ }), 0)
    await expectCount(graph.getByRole('button', { name: /品質檢驗與放行辦法/ }), 1)
    await graph.locator('.duty-mind-map__node--duty').filter({ hasText: '進料與委外品質驗收' }).locator('.duty-mind-map__node-title').click()
    await expectCount(graph.getByRole('button', { name: /水槽焊接委外驗收作業說明/ }), 1)
    await graph.getByRole('button', { name: /品質檢驗與放行辦法/ }).click()
    await page.locator('.management-method-reader').getByText(/檢驗須有適用依據與可回查的結果/).waitFor()
    await page.getByRole('button', { name: '職掌對照', exact: true }).click()
    const commonDrawer = page.locator('.management-method-duty-drawer')
    await expectCount(commonDrawer.locator('.management-method-duty-drawer__rows > div'), 1)
    await commonDrawer.getByText('品質策劃、檢驗與放行', { exact: true }).waitFor()
    assert((await commonDrawer.innerText()).includes('研發部 · 職掌大項'))
    await page.getByRole('button', { name: '關閉職掌對照', exact: true }).click()
    await page.locator('#workspace-tab-duties').click()
    await graph.getByRole('button', { name: /水槽焊接委外驗收作業說明/ }).click()
    await page.getByRole('button', { name: '職掌對照', exact: true }).waitFor()
    assert.equal(new URL(page.url()).searchParams.get('methodView'), 'readable')
    assert.equal(await page.getByLabel('切換組織版本', { exact: true }).inputValue(), draft.id)
    await page.locator('.management-method-reader').getByText(/依本案核定圖面及驗收準則/).waitFor()
    assert(!(await page.locator('.management-method-reader').innerText()).includes('尚未提供公司閱讀的草稿修改'))
    await page.getByRole('button', { name: '職掌對照', exact: true }).click()
    await page.locator('.management-method-duty-drawer__rows').getByText('進料與委外品質驗收', { exact: true }).waitFor()
    await page.screenshot({ path: join(evidence, 'method-reverse-link.png'), fullPage: true })
  })
  await check('A05 A09 shared handoff method reverse-links production and finance', async () => {
    await page.getByRole('button', { name: '關閉職掌對照', exact: true }).click()
    await page.locator('#workspace-tab-duties').click()
    await expandGroup('生產採購、委外與供應商管理')
    await graph.locator('.duty-mind-map__node--duty').filter({ hasText: '採購對帳與付款資料交接' }).locator('.duty-mind-map__node-title').click()
    await graph.getByRole('button', { name: /委外對帳與付款交接辦法/ }).click()
    await page.getByRole('button', { name: '職掌對照', exact: true }).click()
    const drawer = page.locator('.management-method-duty-drawer')
    await expectCount(drawer.locator('.management-method-duty-drawer__rows > div'), 2)
    await drawer.getByText('採購對帳與付款資料交接', { exact: true }).waitFor()
    await drawer.getByText('付款排程與支付對象核實', { exact: true }).waitFor()
    assert((await drawer.innerText()).includes('生產部 · 細部職掌'))
    assert((await drawer.innerText()).includes('財務部 · 細部職掌'))
    const persisted = JSON.parse(await readFile(documentPath, 'utf8'))
    assert.equal(persisted.state.dutyMap.methodLinks.length, 5)
    assert.equal(persisted.state.positions.length, 0)
    assert.equal(persisted.state.assignments.length, 0)
    await page.screenshot({ path: join(evidence, 'payment-cross-department.png'), fullPage: true })
    await page.getByRole('button', { name: '關閉職掌對照', exact: true }).click()
    await page.locator('#workspace-tab-duties').click()
    assert.equal(await page.getByLabel('切換組織版本', { exact: true }).inputValue(), draft.id)
    await graph.locator('[aria-label="選定職掌明細"]').getByRole('heading', { name: '採購對帳與付款資料交接', exact: true }).waitFor()
    const savedAgain = JSON.parse(await readFile(documentPath, 'utf8'))
    assert.deepEqual(savedAgain.state.dutyMap.methodLinks, document.state.dutyMap.methodLinks)
  })
  await check('A03 confirmed planning marker is detail-only and included in the next full-company review', async () => {
    await page.goto(mapUrl, { waitUntil: 'networkidle' })
    await page.getByLabel('切換組織版本', { exact: true }).selectOption(draft.id)
    await expectCount(graph.locator('.duty-mind-map__node--group'), 33)
    await expectCount(graph.getByText('中長期規劃', { exact: true }), 0)
    await expandGroup('品質策劃、檢驗與放行')
    await graph.locator('.duty-mind-map__node--duty').filter({ hasText: '品質系統建置與技術經驗標準化' }).locator('.duty-mind-map__node-title').click()
    await graph.getByText('中長期規劃', { exact: true }).waitFor()
    const reviewResponse = page.waitForResponse(response => response.url().endsWith('/api/orgmaster/duty-map/reviews') && response.request().method() === 'POST')
    await graph.getByRole('button', { name: '請 AI 盤點', exact: true }).click()
    const reviewed = await reviewResponse
    assert.equal(reviewed.status(), 200, JSON.stringify(await reviewed.json()))
    await graph.getByRole('button', { name: '關閉 AI 結果', exact: true }).waitFor()
    const input = modelInputs.at(-1)
    const planningDuty = input.duties.find(value => value.title === '品質系統建置與技術經驗標準化')
    assert.equal(input.memberships.find(value => value.dutyId === planningDuty.id).planningStage, 'long-term')
    assert.equal(input.memberships.filter(value => value.planningStage === null).length, 115)
    await graph.getByRole('button', { name: '待確認 · 已規劃能力的執行狀態待確認', exact: true }).click()
    await graph.locator('[aria-label="AI 盤點理由"]').getByText('未提供執行證據，不能推定此能力已上線', { exact: true }).waitFor()
    await graph.getByRole('button', { name: '關閉 AI 結果', exact: true }).click()
  })
  await check('A24 narrow screen and keyboard controls', async () => {
    for (const width of [768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(mapUrl, { waitUntil: 'networkidle' })
      await page.getByLabel('切換組織版本', { exact: true }).selectOption(draft.id)
      await expectCount(graph.locator('.duty-mind-map__node--group'), 33)
      if (!await graph.getByLabel('篩選部門', { exact: true }).isVisible()) await graph.locator('.duty-mind-map__filters > summary').click()
      await graph.getByLabel('篩選部門', { exact: true }).selectOption(finance)
      await graph.getByRole('button', { name: '清除篩選', exact: true }).focus()
      await page.keyboard.press('Enter')
      await expectCount(graph.locator('.duty-mind-map__node--department'), 6)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
      assert.equal(overflow, false, 'page overflow at ' + width)
      if (await graph.locator('.duty-mind-map__filters > summary').isVisible()) await graph.locator('.duty-mind-map__filters > summary').click()
      const navRects = await page.locator('.duty-map-workspace > nav button').evaluateAll(buttons => buttons.map(button => ({ width: button.getBoundingClientRect().width, scrollWidth: button.scrollWidth, clientWidth: button.clientWidth })))
      assert(navRects.every(rect => rect.width > 0 && rect.scrollWidth <= rect.clientWidth + 1), 'clipped duty-view navigation at ' + width)
      await graph.locator('.duty-mind-map__viewport').scrollIntoViewIfNeeded()
      await page.waitForFunction(() => {
        const hub = document.querySelector('.duty-mind-map__company')?.getBoundingClientRect()
        const view = document.querySelector('.duty-mind-map__viewport')?.getBoundingClientRect()
        return hub && view && hub.right > view.left && hub.left < view.right && hub.bottom > view.top && hub.top < view.bottom
      }, undefined, { timeout: 10000 })
      await page.screenshot({ path: join(evidence, 'map-' + width + '.png'), fullPage: true })
    }
  })
  await check('A14 A16 readonly reader and transient result cleanup', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.evaluate(async () => { await fetch('/api/auth/development/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId: 'employee' }) }) })
    await page.goto(mapUrl, { waitUntil: 'networkidle' })
    await page.getByLabel('切換組織版本', { exact: true }).selectOption(draft.id)
    await expectCount(graph.locator('.duty-mind-map__node--group'), 33)
    await expectCount(graph.getByRole('button', { name: '請 AI 盤點', exact: true }), 0)
    await expectCount(graph.locator('.duty-mind-map__ai-mark'), 0)
    await expectCount(graph.locator('.duty-mind-map__node--department'), 6)
  })
  await check('A26 normal reading issues no business writes or automatic model requests', async () => {
    const before = requests.length
    const modelBefore = modelInputs.length
    await graph.getByLabel('篩選成長飛輪', { exact: true }).selectOption('flywheel-knowledge')
    await graph.getByLabel('職掌顯示層級', { exact: true }).selectOption('details')
    await graph.getByRole('button', { name: '清除篩選', exact: true }).click()
    assert.equal(requests.slice(before).filter(request => request.method !== 'GET' && !request.url.includes('preferences')).length, 0)
    assert.equal(modelInputs.length, modelBefore)
  })
  assert.deepEqual(errors, [])
  const bundle = await readFile(join(project, 'dist-server/server.mjs'))
  const clientFiles = ['index.html', ...(await readdir(join(project, 'dist/assets'))).filter(name => /\.(?:js|css)$/.test(name)).sort().map(name => 'assets/' + name)]
  const clientArtifacts = await Promise.all(clientFiles.map(async path => ({ path, sha256: hash(await readFile(join(project, 'dist', path))) })))
  await writeFile(join(evidence, 'result.json'), JSON.stringify({
    evidenceKind: 'RD_SELF_CHECK_SYNTHETIC_LOCAL', checks, browserPageErrors: errors,
    serverBundleSha256: hash(bundle), clientArtifacts, apiResponses, a17EndpointChecks, modelInputs: modelInputs.map(input => ({ versionId: input.versionId, departments: input.departments.length, groups: input.groups.length, duties: input.duties.length, chapters: input.chapters.length })),
  }, null, 2))
  console.log(JSON.stringify({ result: 'PASS', checks: checks.length, evidence }, null, 2))
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: join(evidence, 'failure-page.png'), fullPage: true })
    await writeFile(join(evidence, 'failure-page.txt'), await page.locator('body').innerText())
  }
  await writeFile(join(evidence, 'failure.json'), JSON.stringify({ evidenceKind: 'RD_SELF_CHECK_SYNTHETIC_LOCAL', checks, error: String(error), url: page?.url(), apiResponses }, null, 2))
  throw error
} finally {
  await browser?.close()
  for (const server of servers.reverse()) {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections() })
  }
  assert(root.startsWith(tempBase + sep))
  await rm(root, { recursive: true, force: true })
}
