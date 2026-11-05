/** @vitest-environment jsdom */
import {createServer} from 'node:http'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {expect,it,vi} from 'vitest'
import {createAdministrationStore,acceptedAdministrativeCatalogBindings} from './orgmasterAdministrationStore'
import {createAdministrationRequestHandler} from './orgmasterAdministrationApi'
import {setVerifiedRequestIdentity} from './orgmasterRequestIdentity'
import {GovernanceAdministrators} from '../src/components/GovernanceAdministrators'
// The disposable cluster and all owner SQL remain in the owner fixture module.
const {withAdministrationPostgresFixture,prepareAdministrationInitializationFixture,drainAdministrationFixtureEvents,createAdministrativeHumanFixture,readAdministrationStoreFixtureSnapshot}=createRequire(import.meta.url)(resolve(process.cwd(),'scripts/lib/dev070-administration-postgres-fixture.mjs'))

it.skipIf(process.env.DEV070_RUN_POSTGRES!=='1')('runs the management component through real HTTP, production store and restricted PostgreSQL commands',async()=>{
 const modulePath=process.env.DEV070_PLATFORM_FIXTURE_MODULE
 if(!modulePath)throw new Error('DEV070_PLATFORM_OWNER_FIXTURE_MODULE_REQUIRED')
 const adapter=createRequire(import.meta.url)(modulePath)
 await withAdministrationPostgresFixture(async(fixture:any)=>{
  const initialization=await prepareAdministrationInitializationFixture(fixture)
  await initialization.initialize()
  const platform=await fixture.connect('platform-prod-runtime@jenfu-platform-prod.iam')
  await drainAdministrationFixtureEvents(fixture,adapter.createAdministrationLifecycleFixtureDispatch({database:platform,handle:fixture.handle}))
  await adapter.initializePrincipalForAdministrationFixture({database:platform,handle:fixture.handle,principalId:'principal-legacy'})
  const human=await createAdministrativeHumanFixture(fixture)
  const store=createAdministrationStore({database:human.runtime,readSnapshot:async()=>{
   const snapshot=await readAdministrationStoreFixtureSnapshot(fixture)
   return {...snapshot,catalogBindings:acceptedAdministrativeCatalogBindings(snapshot.document)}
  }})
  const handler=createAdministrationRequestHandler({
   readAdministrationWorkspace:async(_root,actor)=>store.workspace(actor),
   previewAdministrationCommand:async(_root,actor,command)=>store.preview(actor,command),
   commitAdministrationCommand:async(_root,actor,command)=>store.commit(actor,command),
   readAdministrationCommand:async(_root,actor,id)=>store.status(actor,id),
  })
  const session=(await fixture.admin.query('SELECT * FROM orgmaster_core.app_sessions WHERE id=$1',[human.sessionId])).rows[0]
  const server=createServer(async(request,response)=>{
   // The isolated HTTP boundary starts after the normal verified-session
   // middleware. This is a real stored session, not a Google/provider proof.
   if(request.headers.authorization==='Fixture dev070')setVerifiedRequestIdentity(request,{
    id:human.sessionId,principalId:human.principalId,employeeId:human.employeeId,
    identityIssuer:session.identity_issuer,identitySubject:session.identity_subject,
    authenticatedAt:session.authenticated_at.toISOString(),assuranceLevel:session.assurance_level,principalAuthEpoch:Number(session.principal_auth_epoch),
   } as never)
   const readBody=async()=>{let body='';for await(const chunk of request)body+=chunk;return JSON.parse(body)}
   await handler(request,response,'isolated-fixture',request.url!.replace('/api/orgmaster/governance',''),readBody)
  })
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
  const address=server.address();if(!address||typeof address==='string')throw new Error('HTTP_FIXTURE_LISTEN_FAILED')
  const origin=`http://127.0.0.1:${address.port}`,nativeFetch=globalThis.fetch
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
  const until=async(predicate:()=>boolean)=>{for(let attempt=0;attempt<80&&!predicate();attempt++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,25))});expect(predicate()).toBe(true)}
  try{
   expect((await nativeFetch(`${origin}/api/orgmaster/governance/administrators`)).status).toBe(401)
   expect((await nativeFetch(`${origin}/api/orgmaster/governance/administrators/commands`,{method:'POST',headers:{authorization:'Fixture dev070',origin:'http://other.invalid'}})).status).toBe(403)
   vi.stubGlobal('fetch',((path:RequestInfo|URL,init?:RequestInit)=>nativeFetch(new URL(String(path),origin),{...init,headers:{...init?.headers,authorization:'Fixture dev070',origin}})) as typeof fetch)
   ;(globalThis as Record<string,unknown>).IS_REACT_ACT_ENVIRONMENT=true
   await act(async()=>root.render(<GovernanceAdministrators employees={[{id:'employee-legacy',name:'張仕杰'}] as never}/>))
   await until(()=>host.textContent!.includes('調整期限'))
   await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='調整期限')!.click())
   const reason=host.querySelector<HTMLInputElement>('input:not([type="datetime-local"])')!
   await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(reason,'實際HTTP與SQL管理授權驗證');reason.dispatchEvent(new Event('input',{bubbles:true}))})
   await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
   await until(()=>host.textContent!.includes('確認套用管理授權'))
   await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='確認套用管理授權')!.click())
   await until(()=>host.textContent!.includes('管理授權已提交（版本 2）'))
   const receipt=(await fixture.admin.query("SELECT result FROM orgmaster_core.administrative_command_receipts_v1 WHERE operation='replace_application_administrator'")).rows[0].result
   expect(receipt.result).toBe('applied');expect(receipt.activation).toBe('pending')
   await drainAdministrationFixtureEvents(fixture,adapter.createAdministrationLifecycleFixtureDispatch({database:platform,handle:fixture.handle}))
   // Epoch consumption invalidates this original session. Recovery fails closed.
   const status=await nativeFetch(`${origin}/api/orgmaster/governance/administrators/commands/${receipt.commandId}`,{headers:{authorization:'Fixture dev070'}})
   expect(status.status).toBe(401)
   expect((await status.json()).code).toBe('IDENTITY_CONTEXT_REQUIRED')
  }finally{
   await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals()
   await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))
  }
 })
},120000)
