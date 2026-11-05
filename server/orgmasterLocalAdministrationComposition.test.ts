import {EventEmitter} from 'node:events'
import type {IncomingMessage,ServerResponse} from 'node:http'
import {describe,it,expect,vi} from 'vitest'
import {createAdministrationRequestHandler} from './orgmasterAdministrationApi'
import {setVerifiedRequestIdentity} from './orgmasterRequestIdentity'
import {orgmasterAuthApiPlugin,type OrgmasterAuthRuntime} from './orgmasterAuthApi'
import {createAdministrationLifecycleDispatcher} from './orgmasterAdministrationLifecycle'

function request(method='POST'){
 const request={method,headers:{origin:'http://localhost:1010',host:'localhost:1010'}} as IncomingMessage
 setVerifiedRequestIdentity(request,{id:'verified-session',identityIssuer:'issuer',identitySubject:'subject',principalId:'exact-root',employeeId:'employee',principalAuthEpoch:2,authenticatedAt:new Date().toISOString(),assuranceLevel:'aal1'} as never)
 return request
}
function response(){let body='';const response={setHeader:vi.fn(),end:(value:string)=>{body=value},statusCode:0} as unknown as ServerResponse;return {response,body:()=>JSON.parse(body)}}
describe('local administration composition',()=>{
 it('does not issue a late SQL claim after a stalled local guard outlives the dispatcher deadline',async()=>{
  vi.useFakeTimers();let release:(()=>void)|undefined
  const query=vi.fn(),worker=createAdministrationLifecycleDispatcher({database:{query} as never,dispatch:vi.fn(),beforeQuery:()=>new Promise<void>(resolve=>{release=resolve})})
  try{const pending=expect(worker.runOnce()).rejects.toThrow('DEADLINE');await vi.advanceTimersByTimeAsync(12001);await pending;release?.();await Promise.resolve();await Promise.resolve();expect(query).not.toHaveBeenCalled()}finally{worker.close();vi.useRealTimers()}
 })
 it('guards the real normal command route and dispatches after the command has committed',async()=>{
  const order:string[]=[],verifyRuntime=vi.fn(async()=>{order.push('guard')}),commit=vi.fn(async()=>{order.push('commit');return {activation:'pending'}})
  const runOnce=vi.fn(async()=>{order.push('dispatch');return {completed:1,pending:false}})
  const handler=createAdministrationRequestHandler({commitAdministrationCommand:commit} as never,{verifyRuntime,lifecycle:{runOnce} as never}),out=response()
  await handler(request(),out.response,'unused','/administrators/commands',async()=>({}))
  expect(order).toEqual(['guard','commit','dispatch']);expect(out.response.statusCode).toBe(200);expect(out.body().activation).toBe('pending')
 })
 it('does not enter a normal administration command when the bound local context drifts',async()=>{
  const commit=vi.fn(),runOnce=vi.fn(),handler=createAdministrationRequestHandler({commitAdministrationCommand:commit} as never,{verifyRuntime:async()=>{throw new Error('drift')},lifecycle:{runOnce} as never}),out=response()
  await handler(request(),out.response,'unused','/administrators/commands',async()=>({}))
  expect(out.response.statusCode).toBe(503);expect(commit).not.toHaveBeenCalled();expect(runOnce).not.toHaveBeenCalled()
 })
 it('retains a committed pending receipt on dispatcher failure, rather than inventing an acknowledgement',async()=>{
  const handler=createAdministrationRequestHandler({commitAdministrationCommand:async()=>({activation:'pending',commandId:'same-command'})} as never,{verifyRuntime:async()=>undefined,lifecycle:{runOnce:async()=>{throw new Error('transport unavailable')}} as never}),out=response()
  await handler(request(),out.response,'unused','/administrators/commands',async()=>({}))
  expect(out.response.statusCode).toBe(200);expect(out.body()).toMatchObject({activation:'pending',commandId:'same-command'})
 })
 it('mounts both internal ports in the actual Vite auth plugin and shuts down its shared dispatcher',()=>{
  const middlewares:unknown[]=[],httpServer=new EventEmitter(),close=vi.fn(),runtime={configResult:{configured:false,missing:[],reason:'isolated'},administrationLifecycle:{close}} as unknown as OrgmasterAuthRuntime
  const factory=vi.fn(()=>runtime),plugin=orgmasterAuthApiPlugin(factory)
  ;(plugin.configureServer as (value:unknown)=>void)({config:{command:'serve',mode:'development'},middlewares:{use:(value:unknown)=>middlewares.push(value)},httpServer})
  expect(factory).toHaveBeenCalledOnce();expect(middlewares).toHaveLength(3)
  httpServer.emit('close');expect(close).toHaveBeenCalledOnce()
 })
})
