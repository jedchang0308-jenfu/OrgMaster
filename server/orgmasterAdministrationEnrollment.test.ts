import {describe,it,expect,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import {createAdministrationEnrollment,parseEnrollmentRequest} from './orgmasterAdministrationEnrollment'
import {createAdministrationLifecycleDispatcher,productionAdministrationLifecycle} from './orgmasterAdministrationLifecycle'
const request=()=>({contractVersion:'orgmaster.administration-enrollment.v1' as const,requestId:randomUUID(),directoryCustomerId:'customer',idToken:'memory-only-token'})
function fixture({candidate=true,ack=false}={}){
 const identity={issuer:'issuer',subject:'verified-pair',email:'human@example.invalid',emailVerified:true,googleUserId:'directory-user',signInProvider:'google.com',authenticatedAt:new Date().toISOString(),assuranceLevel:'aal1' as const}
 const firebase={verifyIdToken:vi.fn(async()=>identity)},directory={mode:'google-admin-readonly' as const,readByDirectoryKey:vi.fn(async()=>({ok:true as const,user:{customerId:'customer',userId:'directory-user',directoryState:'present' as const,primaryEmail:'human@example.invalid',sourceEtag:null}}))}
 const query=vi.fn(async(sql:string,_values?:unknown[])=>({rows:sql.includes('find_administration_enrollment')?[{intent:candidate?{intent:{commandId:randomUUID()}}:null}]:[{result:{commandId:randomUUID(),principalId:'actual-principal',employeeId:'exact-employee',activation:ack?'acknowledged':'pending'}}]}))
 const service=createAdministrationEnrollment({database:{query} as never,firebase:firebase as never,directory:directory as never,directoryCustomerId:'customer'})
 return {service,query,directory,firebase,identity}
}
describe('owner-admitted administration enrollment',()=>{
 it('accepts only the target-free exact request shape',()=>{
  expect(parseEnrollmentRequest(request()).idToken).toBe('memory-only-token')
  for(const extra of[{principalId:'chosen'},{grants:[]},{employeeId:'chosen'},{ownerIntent:true}])expect(()=>parseEnrollmentRequest({...request(),...extra})).toThrow('request_invalid')
 })
 it('verifies Google crypto before intent lookup and never scans Directory without an intent',async()=>{
  const f=fixture({candidate:false});expect((await f.service.complete(request())).status).toBe('not_applicable')
  expect(f.firebase.verifyIdToken).toHaveBeenCalledOnce();expect(f.query).toHaveBeenCalledOnce();expect(f.directory.readByDirectoryKey).not.toHaveBeenCalled()
 })
 it('does not look up intents for a failed token',async()=>{
  const f=fixture();f.firebase.verifyIdToken.mockRejectedValueOnce(new Error('crypto'))
  await expect(f.service.complete(request())).rejects.toMatchObject({status:401});expect(f.query).not.toHaveBeenCalled()
 })
 it.each(['password','saml'])('denies non-Google provider %s',async provider=>{
  const f=fixture();f.identity.signInProvider=provider;await expect(f.service.complete(request())).rejects.toMatchObject({status:403});expect(f.directory.readByDirectoryKey).not.toHaveBeenCalled()
 })
 it('requires recent human AAL and genuine exact Directory identity for an admitted intent',async()=>{
  const f=fixture();f.identity.authenticatedAt=new Date(Date.now()-301000).toISOString();await expect(f.service.complete(request())).rejects.toMatchObject({code:'AUTH_RECENT_REQUIRED'})
  f.identity.authenticatedAt=new Date().toISOString();f.identity.email='other@example.invalid';await expect(f.service.complete(request())).rejects.toMatchObject({status:403})
 })
 it('returns the verified pair and token auth time, without persisting the raw credential',async()=>{
  const f=fixture();const result=await f.service.complete(request())
  expect(result).toMatchObject({status:'activation_pending',principalId:'actual-principal',employeeId:'exact-employee',issuer:'issuer',subject:'verified-pair',authenticatedAt:f.identity.authenticatedAt})
  const facts=JSON.parse(f.query.mock.calls.find(([sql])=>sql.includes('complete_administration_enrollment'))![1]![1] as string)
  expect(facts).not.toHaveProperty('idToken');expect(JSON.stringify(facts)).not.toContain('memory-only-token')
 })
 it('completed is derived from owner receipt activation, never from a successful HTTP dispatch alone',async()=>{
  const f=fixture({ack:true});expect((await f.service.complete(request())).status).toBe('completed')
 })
 it('does not construct the production dispatcher for local/nonproduction environments',()=>{
  expect(productionAdministrationLifecycle({ORGMASTER_DEPLOYMENT_ENV:'development',ORGMASTER_PUBLIC_BASE_URL:'http://localhost:1010'})).toBeUndefined()
  expect(()=>productionAdministrationLifecycle({ORGMASTER_DEPLOYMENT_ENV:'production',ORGMASTER_PUBLIC_BASE_URL:'http://localhost:1010'})).toThrow()
 })
})
describe('administration-only dispatcher',()=>{
 it('bounds stalled SQL and does not dispatch a late claim after its deadline',async()=>{
  vi.useFakeTimers()
  let release:((value:unknown)=>void)|undefined
  const query=vi.fn(()=>new Promise(resolve=>{release=resolve})),dispatch=vi.fn()
  const worker=createAdministrationLifecycleDispatcher({database:{query} as never,dispatch})
  try{
   const pending=expect(worker.runOnce()).rejects.toThrow('DEADLINE')
   await vi.advanceTimersByTimeAsync(12001);await pending
   release?.({rows:[{executor:'executor'}]});await Promise.resolve();await Promise.resolve()
   expect(query).toHaveBeenCalledOnce();expect(dispatch).not.toHaveBeenCalled()
  }finally{worker.close();vi.useRealTimers()}
 })
 it('uses filtered claim and persisted v2 completion without Directory or generic claims',async()=>{
  const eventId=randomUUID(),receiptId=randomUUID(),seen:string[]=[]
  const query=vi.fn(async(sql:string)=>{seen.push(sql);return {rows:sql.includes('assert_lifecycle_executor')?[{executor:'executor'}]:sql.includes('claim_administration_lifecycle')?[{event_id:eventId,operation_id:'operation',source_revision:'source',snapshot_hash:'a'.repeat(64),lease_generation:'2'}]:[]}})
  const dispatch=vi.fn(async()=>({eventId,receiptId,snapshotHash:'a'.repeat(64),deliveryPrincipalId:'executor'}))
  const worker=createAdministrationLifecycleDispatcher({database:{query} as never,dispatch:dispatch as never})
  expect(await worker.runOnce()).toEqual({completed:1,pending:false});expect(seen.some(sql=>sql.includes('complete_principal_lifecycle_v2'))).toBe(true)
  expect(seen.some(sql=>sql.includes('claim_principal_lifecycle_v2')||sql.includes('refresh'))).toBe(false);worker.close()
 })
 it('persists retry on delivery failure and resumes blocked rows only on an explicit service wake',async()=>{
  const query=vi.fn(async(sql:string)=>({rows:sql.includes('assert_lifecycle_executor')?[{executor:'executor'}]:sql.includes('claim_administration_lifecycle')?[{event_id:randomUUID(),operation_id:'operation',source_revision:'source',snapshot_hash:'a'.repeat(64),lease_generation:1}]:[]}))
  const worker=createAdministrationLifecycleDispatcher({database:{query} as never,dispatch:vi.fn(async()=>{throw new Error('outage')})})
  expect(await worker.runOnce()).toEqual({completed:0,pending:true});expect(query.mock.calls.some(([sql])=>sql.includes('resume_administration'))).toBe(false)
  await worker.runOnce(true);expect(query.mock.calls.some(([sql])=>sql.includes('resume_administration'))).toBe(true);expect(query.mock.calls.some(([sql])=>sql.includes('retry_principal_lifecycle_v2'))).toBe(true);worker.close()
  await expect(worker.runOnce()).rejects.toThrow('CLOSED')
 })
})
