import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { OAuth2Client } from 'google-auth-library'
import type { Pool } from 'pg'
import type { Connect, Plugin } from 'vite'
import { assertOrgmasterProductionTarget, createOrgmasterDatabase } from './orgmasterDatabase'
import { createGoogleDirectoryAuthPort, createGoogleDirectoryReadOnlyPort, readGoogleDirectoryRuntimeConfig } from './orgmasterManagedDirectoryPort'
import { createPostgresManagedIdentityLifecycleRepository } from './orgmasterManagedIdentityLifecycleRepository'
import { createManagedIdentitySyncWorker, type ManagedIdentitySyncWorker, type ManagedIdentityWorkloadExecutor } from './orgmasterManagedIdentitySync'
import { createOrgmasterPrincipalLifecycleClient } from './orgmasterPrincipalLifecycleClient'

export const MANAGED_LIFECYCLE_API_PATH = '/api/internal/managed-identity-lifecycle/v2'
export const MANAGED_LIFECYCLE_ORIGIN = 'https://orgmaster-prod-9536592944.asia-east1.run.app'
type Caller = Readonly<{ issuer: string; audience: string; subject: string }>
export type ManagedIdentityLifecycleRuntime = Readonly<{
  worker: ManagedIdentitySyncWorker
  verify(token: string): Promise<Caller>
  resolveCaller(subject: string): Promise<ManagedIdentityWorkloadExecutor | null>
}>

class LifecycleHttpError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code) }
}

async function withAdmissionDeadline<T>(run: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([Promise.resolve().then(run), new Promise<never>((_, reject) => {
      timer=setTimeout(()=>reject(new LifecycleHttpError(503,'lifecycle_admission_timeout')),5_000)
    })])
  } finally { if(timer) clearTimeout(timer) }
}

function emptyBody(request: IncomingMessage): Promise<void> {
  return new Promise((resolve,reject)=>{
    let nonempty=false
    const onData=(value: Buffer | string)=>{ if(Buffer.byteLength(value)>0) nonempty=true }
    const cleanup=()=>{ request.off('data',onData); request.off('end',onEnd); request.off('error',onError); request.off('aborted',onError); clearTimeout(timer) }
    const onEnd=()=>{ cleanup(); nonempty ? reject(new LifecycleHttpError(400,'lifecycle_request_invalid')) : resolve() }
    const onError=()=>{ cleanup(); reject(new LifecycleHttpError(400,'lifecycle_request_invalid')) }
    const timer=setTimeout(()=>{ cleanup(); request.resume(); reject(new LifecycleHttpError(400,'lifecycle_request_timeout')) },5_000)
    request.on('data',onData); request.once('end',onEnd); request.once('error',onError); request.once('aborted',onError)
    if(request.readableEnded) onEnd()
  })
}

function send(response: ServerResponse, status: number, body: unknown, id: string) {
  if(response.writableEnded || response.destroyed) return
  response.statusCode=status
  response.setHeader('Content-Type','application/json; charset=utf-8')
  response.setHeader('Cache-Control','no-store')
  response.setHeader('X-Correlation-Id',id)
  response.end(JSON.stringify(body))
}

/** This route precedes human-session middleware. Only a signed service subject
 * in the typed owner registry may initiate a bounded cycle; an empty POST cannot
 * select the executor, customer, Principal, SQL target or individual work. */
export function createOrgmasterManagedIdentityLifecycleMiddleware(runtime?: ManagedIdentityLifecycleRuntime): Connect.NextHandleFunction {
  return (request,response,next)=>{
    const url=new URL(request.url ?? '/', 'http://orgmaster.local')
    if(url.pathname!==MANAGED_LIFECYCLE_API_PATH) return next()
    const supplied=request.headers['x-correlation-id']
    const id=typeof supplied==='string' && /^[A-Za-z0-9_-]{8,64}$/u.test(supplied) ? supplied : randomUUID()
    const run=async()=>{
      if(request.method!=='POST') { response.setHeader('Allow','POST'); throw new LifecycleHttpError(405,'lifecycle_method_invalid') }
      if((request.url ?? '').includes('?') || url.hash || request.headers.origin || request.headers.cookie) throw new LifecycleHttpError(400,'lifecycle_request_invalid')
      const length=request.headers['content-length']
      if(length!==undefined && length!=='0') throw new LifecycleHttpError(400,'lifecycle_request_invalid')
      if(!runtime) throw new LifecycleHttpError(503,'lifecycle_disabled')
      const header=request.headers.authorization
      if(typeof header!=='string' || !header.startsWith('Bearer ') || !header.slice(7) || Buffer.byteLength(header)>16_384) throw new LifecycleHttpError(401,'lifecycle_caller_invalid')
      // Begin draining before the asynchronous verifier so a fast empty request
      // cannot lose its end event. Validation finishes before queue work starts.
      const body=emptyBody(request)
      body.catch(()=>undefined)
      const caller=await withAdmissionDeadline(()=>runtime.verify(header.slice(7)))
        .catch(error=>{ if(error instanceof LifecycleHttpError) throw error; throw new LifecycleHttpError(401,'lifecycle_caller_invalid') })
      if(!caller || !['accounts.google.com','https://accounts.google.com'].includes(caller.issuer) ||
        caller.audience!==MANAGED_LIFECYCLE_ORIGIN || !/^[0-9]{1,32}$/u.test(caller.subject)) throw new LifecycleHttpError(401,'lifecycle_caller_invalid')
      await body
      const principal=await withAdmissionDeadline(()=>runtime.resolveCaller(caller.subject))
      if(!principal) throw new LifecycleHttpError(403,'lifecycle_caller_denied')
      const report=await runtime.worker.runOnce(principal)
      if(report.executorPrincipalId!==principal.principalId) throw new LifecycleHttpError(503,'lifecycle_executor_mismatch')
      send(response,200,{contractVersion:'orgmaster.managed-identity-lifecycle-cycle.v2',correlationId:id,...report},id)
    }
    void run().catch(error=>{
      request.resume()
      const status=error instanceof LifecycleHttpError ? error.status : 503
      const code=error instanceof LifecycleHttpError ? error.code : 'lifecycle_cycle_unavailable'
      send(response,status,{code,correlationId:id},id)
    })
  }
}

/** Reuse the owner runtime pool and keyless Directory adapter. Enabling this
 * new route requires the v2 producer/consumer prerequisites; defaults are inert. */
export function createOrgmasterManagedIdentityLifecycleRuntime(environment: NodeJS.ProcessEnv = process.env): ManagedIdentityLifecycleRuntime | undefined {
  if(environment.ORGMASTER_PRINCIPAL_LIFECYCLE_ENABLED!=='true') return undefined
  assertOrgmasterProductionTarget(environment,'runtime')
  const directoryConfig=readGoogleDirectoryRuntimeConfig(environment)
  if(environment.ORGMASTER_PERSISTENCE_MODE!=='cloud-sql' || !directoryConfig.enabled ||
    environment.ORGMASTER_PUBLIC_BASE_URL!==MANAGED_LIFECYCLE_ORIGIN || !environment.ORGMASTER_POSTGRES_URL?.trim()) {
    throw new Error('MANAGED_LIFECYCLE_RUNTIME_CONFIG_INVALID')
  }
  const pool=createOrgmasterDatabase(environment.ORGMASTER_POSTGRES_URL,environment) as Pool
  const repository=createPostgresManagedIdentityLifecycleRepository({pool})
  const directory=createGoogleDirectoryReadOnlyPort({customerId:directoryConfig.customerId,domain:directoryConfig.domain,
    auth:createGoogleDirectoryAuthPort({delegatedSubject:directoryConfig.delegatedSubject,serviceAccountEmail:directoryConfig.serviceAccountEmail})})
  const client=createOrgmasterPrincipalLifecycleClient()
  const worker=createManagedIdentitySyncWorker({repository,directory,dispatch:client.dispatch})
  const verifier=new OAuth2Client()
  return {
    worker,
    async verify(token) {
      const ticket=await verifier.verifyIdToken({idToken:token,audience:MANAGED_LIFECYCLE_ORIGIN})
      const payload=ticket.getPayload()
      if(!payload || typeof payload.aud!=='string' || typeof payload.iss!=='string' || typeof payload.sub!=='string') throw new Error('LIFECYCLE_CALLER_INVALID')
      return {issuer:payload.iss,audience:payload.aud,subject:payload.sub}
    },
    async resolveCaller(subject) {
      // The worker separately resolves its actual SESSION_USER. HTTP admission
      // cannot borrow a different registry entry or use a provider email alias.
      const rows=(await pool.query<{principal_id:string;binding_version:string}>(`SELECT principal_id,binding_version::text FROM orgmaster_contract.v_workload_principals_v1
        WHERE contract_version='orgmaster.workload-principals.v1' AND enabled AND owner='orgmaster'
          AND purpose='managed-identity-lifecycle' AND provider_issuer='https://accounts.google.com'
          AND provider_subject=$1 AND db_session_user=SESSION_USER::text`,[subject])).rows
      return rows.length===1 ? {principalId:rows[0].principal_id,owner:'orgmaster',purpose:'managed-identity-lifecycle',bindingVersion:rows[0].binding_version} : null
    },
  }
}

export function orgmasterManagedIdentityLifecycleApiPlugin(): Plugin {
  const attach=(server: {middlewares: {use(middleware: Connect.NextHandleFunction): unknown}})=>{
    server.middlewares.use(createOrgmasterManagedIdentityLifecycleMiddleware(createOrgmasterManagedIdentityLifecycleRuntime()))
  }
  return {name:'orgmaster-managed-identity-lifecycle-v2',configureServer:attach,configurePreviewServer:attach}
}
