import { createServer, request as httpRequest, type Server } from 'node:http'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Connect } from 'vite'
import type { OrgmasterAuthRuntime } from './orgmasterAuthApi'
import { createOrgmasterServer } from './orgmasterServer'
import {
  createOrgmasterManagedIdentityLifecycleMiddleware,
  createOrgmasterManagedIdentityLifecycleRuntime,
  MANAGED_LIFECYCLE_API_PATH,
  MANAGED_LIFECYCLE_ORIGIN,
  type ManagedIdentityLifecycleRuntime,
} from './orgmasterManagedIdentityLifecycleApi'
import {
  createManagedIdentitySyncWorker,
  type LifecycleClaimV2,
  type LifecycleCycleControl,
  type LifecycleReceiptV2,
  type ManagedDirectoryPortV1,
  type ManagedIdentityLifecycleRepositoryV2,
  type ManagedIdentitySyncWorker,
  type ManagedIdentityWorkloadExecutor,
  type RefreshClaimV2,
} from './orgmasterManagedIdentitySync'

const caller = {
  issuer: 'https://accounts.google.com',
  audience: MANAGED_LIFECYCLE_ORIGIN,
  subject: '123456789012345678',
} as const

const executor: ManagedIdentityWorkloadExecutor = {
  principalId: 'workload-orgmaster-fixture',
  owner: 'orgmaster',
  purpose: 'managed-identity-lifecycle',
  bindingVersion: '1',
}

const consumer = {
  principalId: 'workload-platform-fixture',
  owner: 'platform',
  purpose: 'principal-lifecycle-invalidation',
  bindingVersion: '1',
} as const

const syncReport = {
  executorPrincipalId: executor.principalId,
  directoryReads: 0,
  refreshApplied: 0,
  refreshSuperseded: 0,
  refreshRetried: 0,
  refreshTerminal: 0,
  lifecycleCompleted: 0,
  lifecycleRetried: 0,
  lifecycleBlocked: 0,
  commitFailures: 0,
  deadlineReached: false,
}

const servers: Server[] = []
const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))))
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function boundedWorker(actualExecutor: ManagedIdentityWorkloadExecutor = executor) {
  const repository = {
    resolveExecutor: vi.fn(async () => actualExecutor),
    resolveConsumer: vi.fn(async () => consumer),
    enqueueDue: vi.fn(async () => undefined),
    claimRefresh: vi.fn(async () => ({ claims: [] as RefreshClaimV2[], terminalized: 0 })),
    completeRefresh: vi.fn(async () => 'applied' as const),
    retryRefresh: vi.fn(async () => 'retry' as const),
    claimLifecycle: vi.fn(async () => [] as LifecycleClaimV2[]),
    completeLifecycle: vi.fn(async () => undefined),
    retryLifecycle: vi.fn(async () => 'retry' as const),
  } satisfies ManagedIdentityLifecycleRepositoryV2

  const directory: ManagedDirectoryPortV1 = {
    mode: 'local-deterministic',
    writeOperations: 0,
    findExactCandidate: vi.fn(async () => ({ ok: false as const, kind: 'candidate_miss' as const, code: 'DIRECTORY_CANDIDATE_MISS', observedAt: '2026-10-06T00:00:00.000Z' })),
    readByDirectoryKey: vi.fn(async () => ({ ok: false as const, kind: 'retryable_error' as const, code: 'DIRECTORY_READ_UNAVAILABLE', observedAt: '2026-10-06T00:00:00.000Z' })),
  }

  const dispatch = vi.fn(async (_claim: LifecycleClaimV2, _control: LifecycleCycleControl): Promise<LifecycleReceiptV2> => {
    throw new Error('unexpected dispatch in empty fixture')
  })
  const worker = createManagedIdentitySyncWorker({ repository, directory, dispatch })
  return { worker, repository, directory, dispatch }
}

function makeRuntime(input: {
  verifiedCaller?: Awaited<ReturnType<ManagedIdentityLifecycleRuntime['verify']>>
  resolvedBinding?: ManagedIdentityWorkloadExecutor | null
  verifyFailure?: Error
  worker?: ManagedIdentitySyncWorker
} = {}) {
  const verify = vi.fn<ManagedIdentityLifecycleRuntime['verify']>(async () => input.verifiedCaller ?? caller)
  if (input.verifyFailure) verify.mockRejectedValue(input.verifyFailure)
  const resolveCaller = vi.fn<ManagedIdentityLifecycleRuntime['resolveCaller']>(async () =>
    input.resolvedBinding === undefined ? executor : input.resolvedBinding,
  )
  const runOnce = vi.fn<ManagedIdentitySyncWorker['runOnce']>(async () => ({ ...syncReport }))
  const worker = input.worker ?? { runOnce }
  const runtime = { worker, verify, resolveCaller } as ManagedIdentityLifecycleRuntime
  return { runtime, verify, resolveCaller, runOnce }
}

async function listen(handler: Connect.NextHandleFunction) {
  const server = createServer((request, response) => handler(request, response, () => {
    response.statusCode = 404
    response.end('not found')
  }))
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('missing test address')
  return { server, base: 'http://127.0.0.1:' + address.port }
}

async function listenServer(server: Server) {
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('missing test address')
  return 'http://127.0.0.1:' + address.port
}

async function postRawPath(base: string, path: string) {
  const target = new URL(base)
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = httpRequest({
      hostname: target.hostname,
      port: Number(target.port),
      path,
      method: 'POST',
      headers: { Authorization: 'Bearer synthetic-oidc-token' },
    }, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => { body += String(chunk) })
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body }))
    })
    request.on('error', reject)
    request.end()
  })
}
async function makeTemporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), 'orgmaster-lifecycle-api-'))
  temporaryRoots.push(root)
  return root
}

function configuredHumanAuthRuntime(): OrgmasterAuthRuntime {
  return {
    configResult: {
      configured: true,
      config: {
        publicBaseUrl: new URL('https://orgmaster.example.test'),
        secureCookie: false,
      },
    },
    firebase: {},
    principals: {},
    epochs: {},
    sessions: {},
  } as unknown as OrgmasterAuthRuntime
}

describe('OrgMaster managed identity lifecycle internal route', () => {
  it('admits a valid OIDC request without a human cookie before the normal session gate', async () => {
    const workerFixture = boundedWorker()
    const testRuntime = makeRuntime({ worker: workerFixture.worker })
    const root = await makeTemporaryRoot()
    const server = createOrgmasterServer({
      root,
      authRuntime: configuredHumanAuthRuntime(),
      managedIdentityLifecycleRuntime: testRuntime.runtime,
    })
    const base = await listenServer(server)
    const correlationId = 'scheduler_cycle_20261006'

    const response = await fetch(base + MANAGED_LIFECYCLE_API_PATH, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer synthetic-oidc-token',
        'x-correlation-id': correlationId,
      },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-correlation-id')).toBe(correlationId)
    expect(await response.json()).toEqual({
      contractVersion: 'orgmaster.managed-identity-lifecycle-cycle.v2',
      correlationId,
      executorPrincipalId: executor.principalId,
      directoryReads: 0,
      refreshApplied: 0,
      refreshSuperseded: 0,
      refreshRetried: 0,
      refreshTerminal: 0,
      lifecycleCompleted: 0,
      lifecycleRetried: 0,
      lifecycleBlocked: 0,
      commitFailures: 0,
      deadlineReached: false,
    })
    expect(testRuntime.verify).toHaveBeenCalledExactlyOnceWith('synthetic-oidc-token')
    expect(testRuntime.resolveCaller).toHaveBeenCalledExactlyOnceWith(caller.subject)
    expect(workerFixture.repository.resolveExecutor.mock.invocationCallOrder[0])
      .toBeLessThan(workerFixture.repository.enqueueDue.mock.invocationCallOrder[0])
    expect(workerFixture.repository.enqueueDue).toHaveBeenCalledWith(executor, expect.objectContaining({
      signal: expect.any(AbortSignal),
      deadlineAt: expect.any(Number),
    }))

    const humanRoute = await fetch(base + '/api/auth/me')
    expect(humanRoute.status).toBe(401)
    expect(await humanRoute.json()).toMatchObject({ code: 'auth_session_invalid' })
  })

  it('denies a missing bearer before OIDC verification and returns sanitized no-store errors', async () => {
    const testRuntime = makeRuntime()
    const { base } = await listen(createOrgmasterManagedIdentityLifecycleMiddleware(testRuntime.runtime))
    const correlationId = 'scheduler_missing_token'
    const response = await fetch(base + MANAGED_LIFECYCLE_API_PATH, {
      method: 'POST',
      headers: { 'x-correlation-id': correlationId },
    })

    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-correlation-id')).toBe(correlationId)
    expect(await response.json()).toEqual({ code: 'lifecycle_caller_invalid', correlationId })
    expect(testRuntime.verify).not.toHaveBeenCalled()
    expect(testRuntime.resolveCaller).not.toHaveBeenCalled()
    expect(testRuntime.runOnce).not.toHaveBeenCalled()
  })

  it.each([
    ['issuer', { ...caller, issuer: 'https://issuer.invalid' }],
    ['audience', { ...caller, audience: 'https://wrong-audience.invalid' }],
    ['subject', { ...caller, subject: 'not-a-provider-subject' }],
  ])('rejects an OIDC caller with invalid %s before registry lookup', async (_label, verifiedCaller) => {
    const testRuntime = makeRuntime({ verifiedCaller })
    const { base } = await listen(createOrgmasterManagedIdentityLifecycleMiddleware(testRuntime.runtime))
    const response = await fetch(base + MANAGED_LIFECYCLE_API_PATH, {
      method: 'POST',
      headers: { Authorization: 'Bearer synthetic-oidc-token' },
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ code: 'lifecycle_caller_invalid' })
    expect(testRuntime.resolveCaller).not.toHaveBeenCalled()
    expect(testRuntime.runOnce).not.toHaveBeenCalled()
  })

  it('maps signature verification failures to a sanitized 401', async () => {
    const testRuntime = makeRuntime({ verifyFailure: new Error('synthetic private verifier detail') })
    const { base } = await listen(createOrgmasterManagedIdentityLifecycleMiddleware(testRuntime.runtime))
    const response = await fetch(base + MANAGED_LIFECYCLE_API_PATH, {
      method: 'POST',
      headers: { Authorization: 'Bearer malformed-synthetic-token' },
    })

    expect(response.status).toBe(401)
    const responseBody = await response.json()
    expect(responseBody).toMatchObject({ code: 'lifecycle_caller_invalid' })
    expect(JSON.stringify(responseBody)).not.toContain('synthetic private verifier detail')
    expect(testRuntime.resolveCaller).not.toHaveBeenCalled()
    expect(testRuntime.runOnce).not.toHaveBeenCalled()
  })

  it('denies a caller absent from the same-session workload registry before worker invocation', async () => {
    const testRuntime = makeRuntime({ resolvedBinding: null })
    const { base } = await listen(createOrgmasterManagedIdentityLifecycleMiddleware(testRuntime.runtime))
    const response = await fetch(base + MANAGED_LIFECYCLE_API_PATH, {
      method: 'POST',
      headers: { Authorization: 'Bearer synthetic-oidc-token' },
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'lifecycle_caller_denied' })
    expect(testRuntime.resolveCaller).toHaveBeenCalledExactlyOnceWith(caller.subject)
    expect(testRuntime.runOnce).not.toHaveBeenCalled()
  })

  it('fails closed on a malformed owner binding before any queue mutation', async () => {
    const wrongOwner = { ...executor, owner: 'platform' } as unknown as ManagedIdentityWorkloadExecutor
    const workerFixture = boundedWorker()
    const testRuntime = makeRuntime({ resolvedBinding: wrongOwner, worker: workerFixture.worker })
    const { base } = await listen(createOrgmasterManagedIdentityLifecycleMiddleware(testRuntime.runtime))
    const response = await fetch(base + MANAGED_LIFECYCLE_API_PATH, {
      method: 'POST',
      headers: { Authorization: 'Bearer synthetic-oidc-token' },
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'lifecycle_cycle_unavailable' })
    expect(workerFixture.repository.resolveExecutor).toHaveBeenCalledTimes(1)
    expect(workerFixture.repository.enqueueDue).not.toHaveBeenCalled()
    expect(workerFixture.repository.claimRefresh).not.toHaveBeenCalled()
    expect(workerFixture.repository.claimLifecycle).not.toHaveBeenCalled()
    expect(workerFixture.directory.readByDirectoryKey).not.toHaveBeenCalled()
    expect(workerFixture.dispatch).not.toHaveBeenCalled()
  })

  it.each([
    ['query string', '?target=employee'],
    ['empty query marker', '?'],
  ])('rejects a %s without resolving the caller', async (_label, suffix) => {
    const testRuntime = makeRuntime()
    const { base } = await listen(createOrgmasterManagedIdentityLifecycleMiddleware(testRuntime.runtime))
    const response = await postRawPath(base, MANAGED_LIFECYCLE_API_PATH + suffix)

    expect(response.status).toBe(400)
    expect(JSON.parse(response.body)).toMatchObject({ code: 'lifecycle_request_invalid' })
    expect(testRuntime.verify).not.toHaveBeenCalled()
    expect(testRuntime.resolveCaller).not.toHaveBeenCalled()
    expect(testRuntime.runOnce).not.toHaveBeenCalled()
  })

  it.each([
    ['cookie', { cookie: 'jenfu_portal_session=synthetic-cookie' }, undefined],
    ['browser origin', { origin: 'https://untrusted.example.test' }, undefined],
    ['body', {}, '{"targets":["employee-fixture"]}'],
  ])('rejects %s and caller-selected work before OIDC or repository access', async (_label, headers, body) => {
    const testRuntime = makeRuntime()
    const { base } = await listen(createOrgmasterManagedIdentityLifecycleMiddleware(testRuntime.runtime))
    const response = await fetch(base + MANAGED_LIFECYCLE_API_PATH, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer synthetic-oidc-token',
        ...headers,
      },
      ...(body === undefined ? {} : { body }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'lifecycle_request_invalid' })
    expect(testRuntime.verify).not.toHaveBeenCalled()
    expect(testRuntime.resolveCaller).not.toHaveBeenCalled()
    expect(testRuntime.runOnce).not.toHaveBeenCalled()
  })

  it('returns 405 for non-POST methods without verifying a token', async () => {
    const testRuntime = makeRuntime()
    const { base } = await listen(createOrgmasterManagedIdentityLifecycleMiddleware(testRuntime.runtime))
    const response = await fetch(base + MANAGED_LIFECYCLE_API_PATH, {
      method: 'GET',
      headers: { Authorization: 'Bearer synthetic-oidc-token' },
    })

    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('POST')
    expect(await response.json()).toMatchObject({ code: 'lifecycle_method_invalid' })
    expect(testRuntime.verify).not.toHaveBeenCalled()
    expect(testRuntime.resolveCaller).not.toHaveBeenCalled()
    expect(testRuntime.runOnce).not.toHaveBeenCalled()
  })

  it('keeps a disabled route inert and rejects work without a configured runtime', async () => {
    const testRuntime = makeRuntime()
    const { base } = await listen(createOrgmasterManagedIdentityLifecycleMiddleware())
    const response = await fetch(base + MANAGED_LIFECYCLE_API_PATH, {
      method: 'POST',
      headers: { Authorization: 'Bearer synthetic-oidc-token' },
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'lifecycle_disabled' })
    expect(testRuntime.verify).not.toHaveBeenCalled()
    expect(testRuntime.resolveCaller).not.toHaveBeenCalled()
    expect(testRuntime.runOnce).not.toHaveBeenCalled()
  })

  it('keeps runtime creation inert when disabled and fails closed for target or incomplete configuration', () => {
    expect(createOrgmasterManagedIdentityLifecycleRuntime({
      ORGMASTER_PRINCIPAL_LIFECYCLE_ENABLED: 'false',
      ORGMASTER_DEPLOYMENT_ENV: 'synthetic-wrong-target',
      ORGMASTER_POSTGRES_URL: 'postgres://fixture.invalid/no-connect',
    })).toBeUndefined()

    expect(() => createOrgmasterManagedIdentityLifecycleRuntime({
      ORGMASTER_PRINCIPAL_LIFECYCLE_ENABLED: 'true',
    })).toThrow('DEV040_R2_ORGMASTER_WRONG_PRODUCTION_TARGET')

    const productionTarget = {
      ORGMASTER_DEPLOYMENT_ENV: 'production',
      GOOGLE_CLOUD_PROJECT: 'jenfu-platform-prod',
      GOOGLE_CLOUD_REGION: 'asia-east1',
      ORGMASTER_CLOUD_SQL_INSTANCE: 'jenfu-platform-prod-pg',
      ORGMASTER_CLOUD_SQL_CONNECTION_NAME: 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
      ORGMASTER_POSTGRES_DATABASE: 'jenfu_prod',
      ORGMASTER_POSTGRES_IAM_LOGIN: 'orgmaster-prod-runtime@jenfu-platform-prod.iam',
      ORGMASTER_PRINCIPAL_LIFECYCLE_ENABLED: 'true',
      ORGMASTER_PERSISTENCE_MODE: 'cloud-sql',
      ORGMASTER_PUBLIC_BASE_URL: MANAGED_LIFECYCLE_ORIGIN,
      ORGMASTER_POSTGRES_URL: 'postgres://fixture.invalid/no-connect',
    }
    expect(() => createOrgmasterManagedIdentityLifecycleRuntime(productionTarget))
      .toThrow('MANAGED_LIFECYCLE_RUNTIME_CONFIG_INVALID')
  })
})

 describe('source-owned enabled lifecycle startup',()=>{
  it('starts from actual production release fixed values without connecting to the database',async()=>{
    const profile=JSON.parse(await readFile('config/release/dev040-orgmaster-independent-production-v3.json','utf8'))
    const environment={...profile.environment.fixedValues,ORGMASTER_PRINCIPAL_LIFECYCLE_ENABLED:'true',ORGMASTER_POSTGRES_URL:'postgres://synthetic.invalid/no-connect'}
    const runtime=createOrgmasterManagedIdentityLifecycleRuntime(environment)
    expect(runtime).toBeDefined();expect(typeof runtime?.verify).toBe('function');expect(typeof runtime?.worker.runOnce).toBe('function')
    for(const key of ['ORGMASTER_DEPLOYMENT_ENV','GOOGLE_CLOUD_PROJECT','GOOGLE_CLOUD_REGION','ORGMASTER_CLOUD_SQL_INSTANCE','ORGMASTER_CLOUD_SQL_CONNECTION_NAME','ORGMASTER_POSTGRES_DATABASE','ORGMASTER_POSTGRES_IAM_LOGIN']){
      expect(()=>createOrgmasterManagedIdentityLifecycleRuntime({...environment,[key]:'wrong-target'})).toThrow('DEV040_R2_ORGMASTER_WRONG_PRODUCTION_TARGET')
      const missing={...environment};delete missing[key];expect(()=>createOrgmasterManagedIdentityLifecycleRuntime(missing)).toThrow('DEV040_R2_ORGMASTER_WRONG_PRODUCTION_TARGET')
    }
  })
})
