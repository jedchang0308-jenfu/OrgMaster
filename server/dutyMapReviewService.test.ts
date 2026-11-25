import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildDutyMapProjection } from '../src/dutyMap'
import { createDutyMapSeed } from '../src/dutyMapSeed'
import { screenshotOrganizationState } from '../src/screenshotData'
import { reviewDutyMap, type DutyMapReviewContext, type DutyMapReviewGenerator } from './dutyMapReviewService'

const sdk = vi.hoisted(() => ({ create: vi.fn(), options: vi.fn() }))
vi.mock('openai', () => ({ default: class {
  constructor(options: unknown) { sdk.options(options) }
  responses = { create: sdk.create }
} }))

const actor = { principalId: 'qualified-manager', employeeId: 'employee', issuer: 'verified', subject: 'manager', bootstrap: false }
function fixture() {
  let sequence = 0
  const state = createDutyMapSeed({ ...structuredClone(screenshotOrganizationState), departments: [], duties: [], dutyMap: undefined }, () => `node-${++sequence}`)
  state.dutyMap!.memberships[0].planningStage = 'long-term'
  state.duties[0].description = '完整說明'.repeat(400)
  const projection = buildDutyMapProjection(state, { versionId: 'draft-1', versionName: '完整規劃版', versionKind: 'draft', revision: 'revision-1' }, [], true)
  const body = { versionId: projection.versionId, expectedVersionRevision: projection.revision, chapterCatalogVersion: projection.chapterCatalogVersion, requestId: 'request-1' }
  const finding = {
    kind: 'handoff-gap', nodeRefs: [{ kind: 'duty', id: state.duties[0].id }, { kind: 'duty', id: state.duties.at(-1)!.id }],
    chapterIds: ['04'], relationshipIds: [state.dutyMap!.relationships[0].id],
    summary: '交接需確認', observed: '已登錄規劃', suggestion: '核對承接', reason: '缺少執行依據',
  }
  const loadContext = vi.fn(async (): Promise<DutyMapReviewContext> => ({ projection: structuredClone(projection), fullCompanyRead: true }))
  return { state, projection, body, finding, loadContext }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); sdk.create.mockReset(); sdk.options.mockReset() })

describe('DEV-071 full-company AI review RD self-check', () => {
  it('sends all six departments, 33 groups, 116 duties, planning markers, chapters and nine handoffs without people or truncation', async () => {
    const f = fixture()
    const before = JSON.stringify(f.state)
    const generate = vi.fn<DutyMapReviewGenerator>(async company => {
      expect(company.scope).toBe('full-company')
      expect(company.departments).toHaveLength(6)
      expect(company.groups).toHaveLength(33)
      expect(company.duties).toHaveLength(116)
      expect(company.chapters).toHaveLength(12)
      expect(company.relationships).toHaveLength(9)
      expect(company.flywheels).toHaveLength(5)
      expect(company.memberships[0].planningStage).toBe('long-term')
      expect(company.memberships[1].planningStage).toBeNull()
      expect(company.duties[0].description).toBe(f.state.duties[0].description)
      expect(company).not.toHaveProperty('employees')
      expect(company).not.toHaveProperty('positions')
      expect(company).not.toHaveProperty('methods')
      expect(company).not.toHaveProperty('methodLinks')
      return { findings: [f.finding] }
    })
    const result = await reviewDutyMap('/rd/full', actor, f.body, { loadContext: f.loadContext, generate, now: () => new Date('2026-11-25T00:00:00Z') })
    expect(result).toMatchObject({ requestId: 'request-1', versionId: 'draft-1', versionName: '完整規劃版', versionKind: 'draft', revision: 'revision-1', generatedAt: '2026-11-25T00:00:00.000Z' })
    expect(result.findings[0].id).toEqual(expect.any(String))
    expect(result.findings[0].nodeRefs).toEqual(f.finding.nodeRefs)
    expect(f.loadContext).toHaveBeenCalledTimes(2)
    expect(generate).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(f.state)).toBe(before)
  })

  it.each([
    ['canReview', false], ['fullCompanyRead', false],
  ])('rejects missing %s before contacting the provider', async (key, value) => {
    const f = fixture()
    const generate = vi.fn()
    const context = { projection: f.projection, fullCompanyRead: true }
    if (key === 'canReview') context.projection.canReview = value
    else context.fullCompanyRead = value
    await expect(reviewDutyMap('/rd/permission', actor, f.body, { generate, loadContext: async () => context })).rejects.toMatchObject({ status: 403 })
    expect(generate).not.toHaveBeenCalled()
  })

  it.each(['revision', 'chapterCatalogVersion', 'versionId'])('rejects a stale %s before the provider', async key => {
    const f = fixture()
    Object.assign(f.projection, { [key]: 'stale' })
    const generate = vi.fn()
    await expect(reviewDutyMap('/rd/stale', actor, f.body, { generate, loadContext: async () => ({ projection: f.projection, fullCompanyRead: true }) })).rejects.toMatchObject({ status: 409 })
    expect(generate).not.toHaveBeenCalled()
  })

  it.each(['revision', 'permission', 'scope'])('rejects changed %s after the model returns', async change => {
    const f = fixture()
    const generate: DutyMapReviewGenerator = async () => {
      f.loadContext.mockImplementation(async () => ({ projection: { ...f.projection, revision: change === 'revision' ? 'revision-2' : f.projection.revision, canReview: change !== 'permission' }, fullCompanyRead: change !== 'scope' }))
      return { findings: [f.finding] }
    }
    await expect(reviewDutyMap('/rd/changed', actor, f.body, { generate, loadContext: f.loadContext })).rejects.toMatchObject({ status: change === 'revision' ? 409 : 403 })
  })

  it.each([
    ['extra metadata', (f: ReturnType<typeof fixture>) => ({ findings: [f.finding], versionId: 'forged' })],
    ['invalid structure', () => ({ findings: 'invalid' })],
    ['missing text', (f: ReturnType<typeof fixture>) => ({ findings: [{ ...f.finding, reason: '' }] })],
    ['outside duty', (f: ReturnType<typeof fixture>) => ({ findings: [{ ...f.finding, nodeRefs: [{ kind: 'duty', id: 'outside' }] }] })],
    ['wrong node type', (f: ReturnType<typeof fixture>) => ({ findings: [{ ...f.finding, nodeRefs: [{ kind: 'department', id: f.state.duties[0].id }] }] })],
    ['outside chapter', (f: ReturnType<typeof fixture>) => ({ findings: [{ ...f.finding, chapterIds: ['99'] }] })],
    ['outside relationship', (f: ReturnType<typeof fixture>) => ({ findings: [{ ...f.finding, relationshipIds: ['outside'] }] })],
    ['unlocatable', (f: ReturnType<typeof fixture>) => ({ findings: [{ ...f.finding, nodeRefs: [], chapterIds: [], relationshipIds: [] }] })],
    ['forged finding id', (f: ReturnType<typeof fixture>) => ({ findings: [{ ...f.finding, id: 'forged' }] })],
  ])('rejects the entire response for %s with no fallback', async (_label, output) => {
    const f = fixture()
    await expect(reviewDutyMap('/rd/invalid', actor, f.body, { loadContext: f.loadContext, generate: async () => output(f) })).rejects.toMatchObject({ status: 502, code: 'DUTY_MAP_MODEL_OUTPUT_INVALID' })
  })

  it('accepts an empty result without synthesizing findings', async () => {
    const f = fixture()
    const result = await reviewDutyMap('/rd/empty', actor, f.body, { loadContext: f.loadContext, generate: async () => ({ findings: [] }) })
    expect(result.findings).toEqual([])
  })

  it('rejects oversize company data whole before a provider call', async () => {
    const f = fixture()
    const generate = vi.fn()
    await expect(reviewDutyMap('/rd/limit', actor, f.body, { loadContext: f.loadContext, generate, maxInputBytes: 10 })).rejects.toMatchObject({ code: 'DUTY_MAP_CONTEXT_LIMIT', status: 503 })
    expect(generate).not.toHaveBeenCalled()
  })

  it.each(['legacy-duty', 'missing-group', 'missing-department', 'duplicate-membership'])('rejects incomplete full-company node paths (%s) without trimming or a model call', async failure => {
    const f = fixture()
    const projection = f.projection
    if (failure === 'legacy-duty') projection.duties.push({ id: 'legacy-unmapped-duty', title: '既有但未納入職掌圖的工作', description: '保留待補齊隸屬' })
    if (failure === 'missing-group') projection.map!.memberships[0].groupId = 'missing-group'
    if (failure === 'missing-department') projection.map!.groups[0].departmentId = 'missing-department'
    if (failure === 'duplicate-membership') projection.map!.memberships.push({ ...projection.map!.memberships[0] })
    const before = JSON.stringify(projection)
    const generate = vi.fn()
    await expect(reviewDutyMap('/rd/incomplete-source', actor, f.body, {
      loadContext: async () => ({ projection, fullCompanyRead: true }), generate,
    })).rejects.toMatchObject({ status: 503, code: 'DUTY_MAP_SOURCE_INCOMPLETE' })
    expect(generate).not.toHaveBeenCalled()
    expect(JSON.stringify(projection)).toBe(before)
  })

  it('fails without a configured model and never returns provider secrets or a rule result', async () => {
    const f = fixture()
    vi.stubEnv('OPENAI_API_KEY', '')
    await expect(reviewDutyMap('/rd/config', actor, f.body, { loadContext: f.loadContext })).rejects.toMatchObject({ status: 503, code: 'DUTY_MAP_MODEL_NOT_CONFIGURED' })
    const generate = vi.fn(async () => { throw new Error('secret-key-and-provider-body') })
    await expect(reviewDutyMap('/rd/provider', actor, f.body, { loadContext: f.loadContext, generate })).rejects.toMatchObject({ message: 'DUTY_MAP_REVIEW_UNAVAILABLE' })
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it.each(['dedicated', 'fallback'])('calls the configured %s model once with strict JSON, no storage, no retry and an abort signal', async mode => {
    const f = fixture()
    vi.stubEnv('OPENAI_API_KEY', 'test-only-key')
    vi.stubEnv('ORGMASTER_DUTY_MAP_MODEL', mode === 'dedicated' ? 'duty-model' : '')
    vi.stubEnv('ORGMASTER_MANAGEMENT_METHOD_MODEL', 'management-model')
    sdk.create.mockResolvedValue({ status: 'completed', output_text: JSON.stringify({ findings: [f.finding] }) })
    const result = await reviewDutyMap('/rd/sdk', actor, f.body, { loadContext: f.loadContext })
    expect(sdk.options).toHaveBeenCalledWith({ apiKey: 'test-only-key', timeout: 60_000, maxRetries: 0 })
    expect(sdk.create).toHaveBeenCalledTimes(1)
    const [request, options] = sdk.create.mock.calls[0]
    expect(request).toMatchObject({ model: mode === 'dedicated' ? 'duty-model' : 'management-model', store: false, background: false, text: { format: { type: 'json_schema', strict: true } } })
    expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.stringify(result)).not.toContain('test-only-key')
    expect(JSON.stringify(result)).not.toContain('duty-model')
    expect(JSON.stringify(result)).not.toContain('management-model')
  })

  it.each([
    { status: 'completed', output_text: '{invalid-json' },
    { status: 'incomplete', output_text: '{"findings":[]}' },
    { status: 'completed', output_text: '' },
  ])('rejects incomplete, malformed or refused provider output: %j', async output => {
    const f = fixture()
    vi.stubEnv('OPENAI_API_KEY', 'test-only-key')
    vi.stubEnv('ORGMASTER_DUTY_MAP_MODEL', 'duty-model')
    sdk.create.mockResolvedValue(output)
    await expect(reviewDutyMap('/rd/sdk-invalid', actor, f.body, { loadContext: f.loadContext })).rejects.toMatchObject({ status: 502 })
    expect(sdk.create).toHaveBeenCalledTimes(1)
  })

  it('cancels an in-flight provider, rejects a duplicate across versions, and releases busy state', async () => {
    const f = fixture()
    const controller = new AbortController()
    let started!: () => void
    const entered = new Promise<void>(resolve => { started = resolve })
    let providerSignal: AbortSignal | undefined
    const generate = vi.fn<DutyMapReviewGenerator>(async (_company, signal) => {
      providerSignal = signal; started()
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }))
    })
    const first = reviewDutyMap('/rd/busy', actor, f.body, { loadContext: f.loadContext, generate }, controller.signal)
    const rejected = expect(first).rejects.toMatchObject({ status: 499, code: 'DUTY_MAP_REVIEW_CANCELLED' })
    await entered
    await expect(reviewDutyMap('/rd/busy', actor, { ...f.body, versionId: 'another' }, { loadContext: f.loadContext, generate })).rejects.toMatchObject({ status: 429 })
    controller.abort()
    await rejected
    expect(providerSignal?.aborted).toBe(true)
    expect(generate).toHaveBeenCalledTimes(1)
    expect((await reviewDutyMap('/rd/busy', actor, f.body, { loadContext: f.loadContext, generate: async () => ({ findings: [] }) })).findings).toEqual([])
  })

  it('aborts exactly at the 60s upper bound even if the provider never settles', async () => {
    vi.useFakeTimers()
    const f = fixture()
    let providerSignal: AbortSignal | undefined
    const generate = vi.fn<DutyMapReviewGenerator>(async (_company, signal) => { providerSignal = signal; return new Promise(() => {}) })
    const pending = reviewDutyMap('/rd/timeout', actor, f.body, { loadContext: f.loadContext, generate, timeoutMs: 120_000 })
    const rejected = expect(pending).rejects.toMatchObject({ status: 504, code: 'DUTY_MAP_REVIEW_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(60_000)
    await rejected
    expect(providerSignal?.aborted).toBe(true)
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('does not call the provider after cancellation while reading the source', async () => {
    const f = fixture()
    const controller = new AbortController()
    const generate = vi.fn()
    controller.abort()
    await expect(reviewDutyMap('/rd/pre-cancel', actor, f.body, { loadContext: f.loadContext, generate }, controller.signal)).rejects.toMatchObject({ status: 499 })
    expect(generate).not.toHaveBeenCalled()
  })
})
