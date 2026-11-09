import {afterEach,describe,expect,it,vi} from 'vitest'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {GoogleAuth,Impersonated} from 'google-auth-library'
import type {OrgmasterDatabase} from './orgmasterDatabase'
import {createOrgmasterLocalAdministrationRuntime,localAdministrationPeer,localAdministrationProviders,localAdministrationServiceToken} from './orgmasterLocalAdministrationRuntime'
import {createOrgmasterLocalAdministrationLifecycleClient} from './orgmasterPrincipalLifecycleClient'
import {createLocalFinancialCatalogInitializationOwnerReader} from './financialCatalogInitializationOwnerHttp'
import {FINANCIAL_ADMINISTRATIVE_DEFINITION_HASH} from '../src/governance/financialCatalog'
import {performance} from 'node:perf_hooks'

const roots:string[]=[]
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex')
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
function fixture(){
 const root=mkdtempSync(path.join(os.tmpdir(),'orgmaster-dev070-local-'));roots.push(root)
 const runId='1'.repeat(32),privateRoot=path.join(root,`dev069-real-nonprod-${runId}`),clusterRoot=path.join(root,'cluster'),dataDirectory=path.join(clusterRoot,'data')
 const configPath=path.join(root,'.next','dev-local','local-administration-runtime','test','orgmaster.json'),profilePath=path.join(root,'profile.json'),sqlPath=path.join(privateRoot,'private','owner-runtime-logins.json'),adcPath=path.join(privateRoot,'private','google-adc','application_default_credentials.json')
 for(const file of [configPath,profilePath,sqlPath,adcPath,path.join(dataDirectory,'postmaster.pid')])mkdirSync(path.dirname(file),{recursive:true})
 const url='postgresql://dev069_orgmaster_test:isolated-password@127.0.0.1:61312/jenfu_local_dev070_test'
 const identity=(app:string,subject:string)=>({email:`dev010-${app}-runtime@jenfu-platform-nonprod.iam.gserviceaccount.com`,subject})
 const pointer={format:'jenfu.dev-local-auth-profile.v1',privateRoot,clusterRoot,roots:{platformSandbox:root,orgmaster:root,aiPdm:root,fms:root,projed:root},identities:{platform:identity('platform','117743617824418208171'),orgmaster:identity('orgmaster','102985156037283277347'),aiPdm:identity('aipdm','111111111111111111111'),fms:identity('fms','222222222222222222222')},directory:{customerId:'customer',domain:'jenfu.com.tw',delegatedSubject:'directory@jenfu.com.tw',serviceAccountEmail:'directory@jenfu-platform-nonprod.iam.gserviceaccount.com'},supportEmail:'support@jenfu.com.tw'}
 const app=(name:string,group:string)=>({user:`dev069_${name}_test`,password:'isolated-password',group,url:url.replace('dev069_orgmaster_test',`dev069_${name}_test`),pepper:'isolated'})
 const sql={format:'dev069.real-nonproduction-runtime-logins.v1',runId,host:'127.0.0.1',port:61312,database:'jenfu_local_dev070_test',apps:{platform:app('platform','jenfu_platform_runtime'),orgmaster:app('orgmaster','jenfu_orgmaster_runtime'),aipdm:app('aipdm','jenfu_ai_pdm_runtime')}}
 const adc={type:'authorized_user',quota_project_id:'jenfu-platform-nonprod',client_id:'isolated-client',client_secret:'isolated-client-secret',refresh_token:'isolated-refresh-token'}
 const json=(file:string,value:unknown)=>writeFileSync(file,JSON.stringify(value)+'\n')
 json(profilePath,pointer);json(sqlPath,sql);json(adcPath,adc)
 const config={format:'jenfu.dev022.local-administration-runtime.v1',owner:'orgmaster',projectId:'jenfu-platform-nonprod',ownerRoot:root,profileRef:{path:profilePath,sha256:digest(readFileSync(profilePath))},sqlProfileRef:{path:sqlPath,sha256:digest(readFileSync(sqlPath))},target:{host:'127.0.0.1',port:61312,database:sql.database,sessionUser:'dev069_orgmaster_test'},postmaster:{pid:32123,startToken:'133000000000000001',dataDirectory},audience:'http://localhost:1010',producer:{email:'dev010-platform-runtime@jenfu-platform-nonprod.iam.gserviceaccount.com',subject:'117743617824418208171'}}
 const writeConfig=()=>json(configPath,config)
 const pidText=()=>`${config.postmaster.pid}\n${dataDirectory}\n1\n61312\n`
 writeConfig();writeFileSync(path.join(dataDirectory,'postmaster.pid'),pidText())
 const snapshot={pid:32123,startToken:config.postmaster.startToken,executablePath:'C:\\PostgreSQL\\bin\\postgres.exe',commandLine:`postgres.exe -D "${dataDirectory}"`}
 const row={database_name:sql.database,host:'127.0.0.1',port:61312,session_user:config.target.sessionUser,current_user:config.target.sessionUser,runtime_member:true,rolsuper:false,rolcreaterole:false,rolcreatedb:false,rolreplication:false,rolbypassrls:false,database_owner:false,schema_create:false,privileged_membership:false}
 const query=vi.fn(async(sql:string)=>sql.includes('current_database()')?{rows:[{...row}]}:{rows:[{business:true}]})
 const database={query,end:vi.fn(async()=>undefined)} as unknown as OrgmasterDatabase
 const environment={NODE_ENV:'development',GOOGLE_CLOUD_PROJECT:'jenfu-platform-nonprod',ORGMASTER_DEV070_LOCAL_ADMINISTRATION_CONFIG:configPath}
 const input={database,connectionString:url,environment,ownerRoot:root,inspectProcess:vi.fn(async()=>({...snapshot}))}
 const load=()=>createOrgmasterLocalAdministrationRuntime(input)!
 return {root,configPath,profilePath,sqlPath,adcPath,dataDirectory,pointer,sql,adc,config,snapshot,row,query,database,environment,input,load,json,writeConfig,pidText}
}
describe('owner-local administration capability',()=>{
 it('is absent without the explicit selector and cannot be forged by a plain object',()=>{
  expect(createOrgmasterLocalAdministrationRuntime({database:{} as OrgmasterDatabase,connectionString:'',environment:{NODE_ENV:'production'}})).toBeUndefined()
  expect(()=>localAdministrationPeer({} as never)).toThrow('UNAVAILABLE')
  expect(()=>createOrgmasterLocalAdministrationLifecycleClient({} as never)).toThrow('UNAVAILABLE')
  expect(()=>createLocalFinancialCatalogInitializationOwnerReader({} as never)).toThrow('UNAVAILABLE')
 })
 it('binds the same raw files, process, PID file and least-privileged real session on every operation',async()=>{
  const f=fixture(),runtime=f.load();expect(f.query).not.toHaveBeenCalled()
  expect(localAdministrationPeer(runtime)).toEqual({audience:'http://localhost:1010',expectedEmail:f.config.producer.email,expectedSubject:f.config.producer.subject})
  await runtime.database.query('SELECT business');await runtime.database.query('SELECT business')
  expect(f.query.mock.calls.filter(([sql])=>sql==='SELECT business')).toHaveLength(2)
  expect(f.query.mock.calls.filter(([sql])=>sql.includes('current_database()'))).toHaveLength(2)
  expect(f.input.inspectProcess).toHaveBeenCalledTimes(2)
  expect(f.query.mock.calls.some(([sql])=>/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE)\b/u.test(sql.replaceAll("'CREATE'",'')))).toBe(false)
  expect(JSON.stringify(runtime)).not.toContain('password')
 })
 it('binds the runtime checkout through the sidecar while leaving credential-profile source roots descriptive',()=>{
  const f=fixture();f.pointer.roots.orgmaster=path.join(f.root,'previous-orgmaster-source');f.json(f.profilePath,f.pointer)
  f.config.profileRef.sha256=digest(readFileSync(f.profilePath));f.writeConfig()
  expect(f.load()).toBeDefined()
 })
 it.each(['K_SERVICE','GOOGLE_APPLICATION_CREDENTIALS','google_application_credentials','NODE_ENV','GOOGLE_CLOUD_PROJECT'])('denies an invalid environment %s',key=>{
  const f=fixture();Object.assign(f.environment,{[key]:key==='NODE_ENV'?'production':key==='GOOGLE_CLOUD_PROJECT'?'jenfu-platform-prod':'forbidden'})
  expect(f.load).toThrow('UNAVAILABLE')
 })
 it.each(['owner','audience','projectId','extra','ownerRoot'])('denies sidecar shape/owner/target drift: %s',key=>{
  const f=fixture();Object.assign(f.config,{[key]:'wrong'});f.writeConfig();expect(f.load).toThrow('UNAVAILABLE')
 })
 it('rejects a selector outside the canonical owner .next/dev-local tree and a foreign connection URL',()=>{
  const f=fixture();f.input.connectionString=f.input.connectionString.replace('61312','61313');expect(f.load).toThrow('UNAVAILABLE')
  f.input.connectionString=(f.sql.apps.orgmaster.url);f.environment.ORGMASTER_DEV070_LOCAL_ADMINISTRATION_CONFIG=f.profilePath;expect(f.load).toThrow('UNAVAILABLE')
 })
 it.each(['profile','sql','adc','sidecar'])('detects raw-byte drift after capability creation: %s',async kind=>{
  const f=fixture(),runtime=f.load(),file=kind==='profile'?f.profilePath:kind==='sql'?f.sqlPath:kind==='adc'?f.adcPath:f.configPath
  writeFileSync(file,Buffer.concat([readFileSync(file),Buffer.from(' ')]));await expect(runtime.verify()).rejects.toThrow('UNAVAILABLE');expect(f.query).not.toHaveBeenCalled()
 })
 it('requires the real producer five-field SQL metadata and exact credential/group tuple, not the old synthetic two-field shape',()=>{
  for(const field of ['user','password','group']){
   const f=fixture();delete (f.sql.apps.orgmaster as Record<string,unknown>)[field];f.json(f.sqlPath,f.sql);f.config.sqlProfileRef.sha256=digest(readFileSync(f.sqlPath));f.writeConfig();expect(f.load).toThrow('UNAVAILABLE')
  }
  const f=fixture();f.sql.apps.platform.group='jenfu_orgmaster_migrator';f.json(f.sqlPath,f.sql);f.config.sqlProfileRef.sha256=digest(readFileSync(f.sqlPath));f.writeConfig();expect(f.load).toThrow('UNAVAILABLE')
 })
 it.each(['rolsuper','rolcreaterole','rolcreatedb','rolreplication','rolbypassrls','database_owner','schema_create','privileged_membership'])('denies actual runtime privilege %s',async flag=>{
  const f=fixture(),runtime=f.load();Object.assign(f.row,{[flag]:true});await expect(runtime.database.query('SELECT business')).rejects.toThrow('UNAVAILABLE');expect(f.query.mock.calls.some(([s])=>s==='SELECT business')).toBe(false)
 })
 it.each(['database_name','host','port','session_user','current_user'])('denies actual tuple drift %s',async key=>{
  const f=fixture(),runtime=f.load();Object.assign(f.row,{[key]:key==='port'?61313:'foreign'});await expect(runtime.verify()).rejects.toThrow('UNAVAILABLE')
 })
 it.each(['pid','startToken','executablePath','commandLine'])('denies recycled or unrelated OS postmaster %s',async key=>{
  const f=fixture(),runtime=f.load();Object.assign(f.snapshot,{[key]:key==='pid'?32124:key==='commandLine'?`postgres.exe -D "${f.dataDirectory}-other"`:'wrong'});await expect(runtime.verify()).rejects.toThrow('UNAVAILABLE');expect(f.query).not.toHaveBeenCalled()
 })
 it.each([0,1,3])('denies PID file mismatch at line %s',async line=>{
  const f=fixture(),runtime=f.load(),lines=f.pidText().split('\n');lines[line]='wrong';writeFileSync(path.join(f.dataDirectory,'postmaster.pid'),lines.join('\n'));await expect(runtime.verify()).rejects.toThrow('UNAVAILABLE')
 })
 it('rejects a linked parent directory, including Windows junctions',()=>{
  const f=fixture(),other=path.join(f.root,'other');mkdirSync(other);writeFileSync(path.join(other,'orgmaster.json'),readFileSync(f.configPath));const parent=path.dirname(f.configPath);rmSync(parent,{recursive:true});symlinkSync(other,parent,'junction');expect(f.load).toThrow('UNAVAILABLE')
 })
 it.each(['type','quota_project_id'])('rejects foreign or service-account ADC: %s',key=>{
  const f=fixture();Object.assign(f.adc,{[key]:key==='type'?'service_account':'jenfu-platform-prod'});f.json(f.adcPath,f.adc);expect(f.load).toThrow('UNAVAILABLE')
 })
 it('builds real SDK credentials through the bound GoogleAuth seam and rechecks the owner capability',async()=>{
  const f=fixture(),runtime=f.load(),getAccessToken=vi.fn(async()=>({token:'isolated-access-token'}))
  vi.spyOn(GoogleAuth.prototype,'getClient').mockResolvedValue({getAccessToken} as never)
  const providers=localAdministrationProviders(runtime)
  expect(providers.sourceAuth).toBeInstanceOf(GoogleAuth);expect(providers.firebaseCredential.getAccessToken).toBeTypeOf('function');expect(providers.firebaseAppName).toMatch(/^dev070-local-[a-f0-9]{16}$/u)
  await expect(providers.firebaseCredential.getAccessToken()).resolves.toEqual({access_token:'isolated-access-token',expires_in:300})
  expect(getAccessToken).toHaveBeenCalledOnce();expect(f.query).toHaveBeenCalledTimes(2)
  expect(providers.directory.customerId).toBe('customer');expect(JSON.stringify(runtime)).not.toContain('isolated-refresh-token')
 })
 it('pins genuine impersonation to two nonproduction audiences, without a free endpoint override',async()=>{
  const f=fixture(),runtime=f.load(),fetchIdToken=vi.spyOn(Impersonated.prototype,'fetchIdToken').mockResolvedValue('isolated.provider.token')
  vi.spyOn(GoogleAuth.prototype,'getClient').mockResolvedValue({} as never)
  await expect(localAdministrationServiceToken(runtime,'http://localhost:1000')).resolves.toBe('isolated.provider.token')
  expect(fetchIdToken).toHaveBeenCalledWith('http://localhost:1000')
  await expect(localAdministrationServiceToken(runtime,'https://jenfu-platform-prod.example')).rejects.toThrow('UNAVAILABLE')
  expect(fetchIdToken).toHaveBeenCalledTimes(1)
 })
 it('does not replace domain SQL errors with an authority success or a generic retry',async()=>{
  const f=fixture(),runtime=f.load(),failure=new Error('ADMINISTRATION_CONFLICT')
  f.query.mockImplementation(async(sql:string)=>{if(sql==='SELECT business')throw failure;return {rows:[{...f.row}]} as never})
  await expect(runtime.database.query('SELECT business')).rejects.toBe(failure)
 })
 it('uses the fixed local Platform port, real SDK token seam and unchanged typed receipt parser',async()=>{
  const f=fixture(),runtime=f.load(),claim={eventId:'10000000-0000-4000-8000-000000000001',operationId:'operation',sourceRevision:'source',snapshotHash:'a'.repeat(64),leaseGeneration:1}
  vi.spyOn(GoogleAuth.prototype,'getClient').mockResolvedValue({} as never);vi.spyOn(Impersonated.prototype,'fetchIdToken').mockResolvedValue('isolated.provider.token')
  const fetch=vi.fn(async()=>new Response(JSON.stringify({contractVersion:'platform.principal-lifecycle-receipt.v2',...claim,leaseGeneration:undefined,receiptId:'10000000-0000-4000-8000-000000000002',deliveryPrincipalId:'org-executor',executorPrincipalId:'platform-executor',consumerOwner:'platform',principalOnly:true})))
  vi.stubGlobal('fetch',fetch)
  const receipt=await createOrgmasterLocalAdministrationLifecycleClient(runtime).dispatch(claim,{signal:new AbortController().signal,deadlineAt:performance.now()+5000})
  expect(receipt.eventId).toBe(claim.eventId);expect(fetch.mock.calls[0][0]).toBe('http://localhost:1000/api/internal/principal-lifecycle/v2')
  expect(fetch.mock.calls[0][1]).toMatchObject({redirect:'error',headers:{Authorization:'Bearer isolated.provider.token'}})
  expect(JSON.stringify(fetch.mock.calls[0][1])).not.toMatch(/Cookie|Origin|idToken/u)
 })
 it('reads actual-owner local handoff through the fixed FMS port while retaining nonproduction source provenance',async()=>{
  const f=fixture(),runtime=f.load(),operationId='10000000-0000-4000-8000-000000000070',input={operationId,principalId:'root',employeeId:'employee',authenticatedAt:new Date().toISOString(),assuranceLevel:'aal1' as const,principalAuthEpoch:1,catalogVersion:'version',contentSha256:'a'.repeat(64),artifactSha256:'b'.repeat(64),sourceDraftId:'draft',sourceDraftRevision:1}
  vi.spyOn(GoogleAuth.prototype,'getClient').mockResolvedValue({} as never);vi.spyOn(Impersonated.prototype,'fetchIdToken').mockResolvedValue('isolated.provider.token')
  const packet={schemaVersion:'fms.catalog-initialization-handoff.v1',operationId,initializationReceiptId:'own-publish',receiptBodySha256:'c'.repeat(64),principalId:'root',employeeId:'employee',sourceRoleDefinitionHash:FINANCIAL_ADMINISTRATIVE_DEFINITION_HASH,issuance:{rootGrantId:operationId,administrationVersion:'1',publishedPolicyId:'publication',publishedAt:input.authenticatedAt},release:{},previousRelease:{}}
  const fetch=vi.fn(async()=>new Response(JSON.stringify(packet),{headers:{'Content-Type':'application/json'}}));vi.stubGlobal('fetch',fetch)
  const result=await createLocalFinancialCatalogInitializationOwnerReader(runtime).read(input)
  expect(result).toMatchObject({source:'local_test',operationId,publishReceiptId:'own-publish'})
  expect(fetch.mock.calls[0][0]).toBe('http://localhost:1030/api/administration/catalog-initialization/handoff')
  expect(fetch.mock.calls[0][1]).toMatchObject({redirect:'error',headers:{Authorization:'Bearer isolated.provider.token'}})
 })
})
