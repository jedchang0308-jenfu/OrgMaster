import { GoogleAuth } from 'google-auth-library'
import { FINANCIAL_ADMINISTRATIVE_DEFINITION_HASH } from '../src/governance/financialCatalog'
import { ApplicationEntitlementError } from './applicationEntitlementCommon'
import type { FinancialCatalogInitializationOwnerReader } from './financialCatalogInitializationAdoption'
import type { FmsCatalogReleaseInput } from './financialCatalogReleaseStore'
import {localAdministrationPeer,localAdministrationServiceToken,type OrgmasterLocalAdministrationRuntime} from './orgmasterLocalAdministrationRuntime'

export const FMS_INITIALIZATION_CANONICAL_ORIGIN = 'https://jf-fms-prod-56gnizku7q-de.a.run.app'
export const FMS_INITIALIZATION_HANDOFF_PATH = '/api/administration/catalog-initialization/handoff'
const fail = (): never => { throw new ApplicationEntitlementError('FINANCIAL_CATALOG_UNAVAILABLE') }
function exact(value: unknown, keys: string[]) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail()
  return value as Record<string, unknown>
}
export function createFinancialCatalogInitializationHttpReader(options: {
  request: (url: string, body: unknown) => Promise<unknown>; now?: () => string
}): FinancialCatalogInitializationOwnerReader {
  return { async read(input) {
    const packet = { schemaVersion: 'fms.catalog-initialization-handoff-request.v1', operationId: input.operationId,
      actor: { principalId: input.principalId, employeeId: input.employeeId, authenticatedAt: input.authenticatedAt,
        aal: input.assuranceLevel === 'aal2' ? 2 : 1, authEpoch: input.principalAuthEpoch },
      selectors: { version: input.catalogVersion, contentSha256: input.contentSha256, artifactSha256: input.artifactSha256,
        sourceDraftId: input.sourceDraftId, sourceDraftRevision: input.sourceDraftRevision } }
    try {
      const body = exact(await options.request(FMS_INITIALIZATION_CANONICAL_ORIGIN + FMS_INITIALIZATION_HANDOFF_PATH, packet),
        ['schemaVersion', 'operationId', 'initializationReceiptId', 'receiptBodySha256', 'principalId', 'employeeId', 'sourceRoleDefinitionHash', 'issuance', 'release', 'previousRelease'])
      const issuance = exact(body.issuance, ['rootGrantId', 'administrationVersion', 'publishedPolicyId', 'publishedAt'])
      if (body.schemaVersion !== 'fms.catalog-initialization-handoff.v1' || body.operationId !== input.operationId
        || body.principalId !== input.principalId || body.employeeId !== input.employeeId
        || body.sourceRoleDefinitionHash !== FINANCIAL_ADMINISTRATIVE_DEFINITION_HASH
        || typeof body.initializationReceiptId !== 'string' || !body.initializationReceiptId || typeof body.receiptBodySha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(body.receiptBodySha256)
        || typeof issuance.rootGrantId !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u.test(issuance.rootGrantId)
        || typeof issuance.administrationVersion !== 'string' || !/^[1-9][0-9]*$/u.test(issuance.administrationVersion)
        || !Number.isSafeInteger(Number(issuance.administrationVersion)) || Number(issuance.administrationVersion) < 1
        || typeof issuance.publishedPolicyId !== 'string' || !issuance.publishedPolicyId || typeof issuance.publishedAt !== 'string' || !Number.isFinite(Date.parse(issuance.publishedAt))) fail()
      return { source: 'formal', operationId: input.operationId, publishReceiptId: body.initializationReceiptId as string,
        receiptBodySha256: body.receiptBodySha256 as string, readAt: options.now?.() ?? new Date().toISOString(),
        release: body.release as FmsCatalogReleaseInput, previousRelease: body.previousRelease as FmsCatalogReleaseInput }
    } catch { return fail() }
  } }
}
/** The token's audience and destination are code-pinned; no browser URL, cookie or human token is forwarded. */
export function createDefaultFinancialCatalogInitializationOwnerReader(environment: NodeJS.ProcessEnv = process.env): FinancialCatalogInitializationOwnerReader | undefined {
  if (environment.NODE_ENV !== 'production' || environment.K_SERVICE !== 'orgmaster-prod') return undefined
  const auth = new GoogleAuth()
  return createFinancialCatalogInitializationHttpReader({ request: async (url, body) => {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000)
    try {
      const tokenHeaders = await Promise.race([
        auth.getIdTokenClient(FMS_INITIALIZATION_CANONICAL_ORIGIN).then(client => client.getRequestHeaders(FMS_INITIALIZATION_CANONICAL_ORIGIN)),
        new Promise<never>((_resolve, reject) => controller.signal.addEventListener('abort', () => reject(new Error('FMS_OWNER_READBACK_TIMEOUT')), { once: true })),
      ])
      const authorization = tokenHeaders.get('authorization')
      if (!authorization || controller.signal.aborted) fail()
      const response = await fetch(url, { method: 'POST', headers: { Authorization: authorization!, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body), signal: controller.signal, redirect: 'error', cache: 'no-store' })
      if (!response.ok || !response.headers.get('content-type')?.startsWith('application/json')) fail()
      const reader = response.body?.getReader(); if (!reader) fail()
      const chunks: Uint8Array[] = []; let size = 0
      try { for (;;) { const chunk = await reader!.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 4 * 1024 * 1024) { await reader!.cancel(); fail() } chunks.push(chunk.value) } }
      finally { reader!.releaseLock() }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch { return fail() } finally { clearTimeout(timeout) }
  } })
}

/** Local transport is minted only by the owner-file/OS/runtime-DB capability. */
export function createLocalFinancialCatalogInitializationOwnerReader(runtime:OrgmasterLocalAdministrationRuntime):FinancialCatalogInitializationOwnerReader {
  localAdministrationPeer(runtime)
  const reader=createFinancialCatalogInitializationHttpReader({request:async(url,body)=>{
    if(url!==FMS_INITIALIZATION_CANONICAL_ORIGIN+FMS_INITIALIZATION_HANDOFF_PATH)fail()
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000)
    const deadline=new Promise<never>((_resolve,reject)=>controller.signal.addEventListener('abort',()=>reject(new Error('FMS_OWNER_READBACK_TIMEOUT')),{once:true}))
    const wait=<T>(work:Promise<T>)=>Promise.race([work,deadline])
    try{
      await wait(runtime.verify())
      const token=await wait(localAdministrationServiceToken(runtime,'http://localhost:1030'))
      controller.signal.throwIfAborted()
      const response=await wait(fetch('http://localhost:1030'+FMS_INITIALIZATION_HANDOFF_PATH,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body),signal:controller.signal,redirect:'error',cache:'no-store'}))
      if(!response.ok||!response.headers.get('content-type')?.startsWith('application/json'))fail()
      const reader=response.body?.getReader();if(!reader)fail()
      const chunks:Uint8Array[]=[];let size=0
      try{for(;;){const chunk=await wait(reader!.read());if(chunk.done)break;size+=chunk.value.byteLength;if(size>4*1024*1024){await reader!.cancel();fail()}chunks.push(chunk.value)}}finally{reader!.releaseLock()}
      await wait(runtime.verify());return JSON.parse(Buffer.concat(chunks).toString('utf8'))
    }catch{return fail()}finally{clearTimeout(timeout)}
  }})
  return {async read(input){const result=await reader.read(input);return result?{...result,source:'local_test'}:null}}
}
