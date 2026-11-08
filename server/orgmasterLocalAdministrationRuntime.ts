import {createHash} from 'node:crypto'
import {lstatSync,openSync,readFileSync,fstatSync,closeSync,realpathSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {GoogleAuth,Impersonated} from 'google-auth-library'
import type {Credential} from 'firebase-admin/app'
import type {OrgmasterDatabase} from './orgmasterDatabase'

const PROJECT='jenfu-platform-nonprod',AUDIENCE='http://localhost:1010'
const ORG_EMAIL=`dev010-orgmaster-runtime@${PROJECT}.iam.gserviceaccount.com`,ORG_SUBJECT='102985156037283277347'
const PLATFORM_EMAIL=`dev010-platform-runtime@${PROJECT}.iam.gserviceaccount.com`,PLATFORM_SUBJECT='117743617824418208171'
const HASH=/^[a-f0-9]{64}$/u
type RecordValue=Record<string,unknown>
type Reference={path:string;sha256:string}
type Config={format:string;owner:string;projectId:string;ownerRoot:string;profileRef:Reference;sqlProfileRef:Reference;target:{host:string;port:number;database:string;sessionUser:string};postmaster:{pid:number;startToken:string;dataDirectory:string};audience:string;producer:{email:string;subject:string}}
type ProcessSnapshot={pid:number;startToken:string;executablePath:string;commandLine:string}
type Pointer={format:string;privateRoot:string;clusterRoot:string;roots:Record<string,string>;identities:Record<string,{email:string;subject:string}>;directory:Record<string,string>;supportEmail:string}
type SqlProfile={format:string;runId:string;host:string;port:number;database:string;apps:Record<string,{user:string;password:string;group:string;url:string;pepper:string}>}
declare const localBrand:unique symbol
export type OrgmasterLocalAdministrationRuntime={readonly [localBrand]:never;readonly database:OrgmasterDatabase;verify():Promise<void>}
type State={environment:NodeJS.ProcessEnv;root:string;configPath:string;configHash:string;adcHash:string;database:OrgmasterDatabase;inspectProcess:(pid:number)=>Promise<ProcessSnapshot>}
const states=new WeakMap<OrgmasterLocalAdministrationRuntime,State>()
const fail=():never=>{throw new Error('DEV070_LOCAL_ADMINISTRATION_UNAVAILABLE')}
const exact=(v:unknown,keys:string[]):v is RecordValue=>!!v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.trim()===v
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex')
const inside=(root:string,file:string)=>{const relative=path.relative(root,file);return !!relative&&relative!=='..'&&!relative.startsWith(`..${path.sep}`)&&!path.isAbsolute(relative)}
function canonical(filename:string,directory:boolean){
 if(!text(filename)||filename.length>4096||!path.isAbsolute(filename)||path.resolve(filename)!==filename)fail()
 let cursor=filename
 for(let depth=0;;depth++){if(depth>64)fail();const stat=lstatSync(cursor);if(stat.isSymbolicLink()||(cursor===filename?directory?!stat.isDirectory():!stat.isFile():!stat.isDirectory()))fail();const parent=path.dirname(cursor);if(parent===cursor)break;cursor=parent}
 if(realpathSync(filename)!==filename)fail()
 return filename
}
function bytesFile(filename:string,limit:number){
 canonical(filename,false);const fd=openSync(filename,'r')
 try{const before=fstatSync(fd);if(!before.isFile()||before.size<1||before.size>limit)fail();const bytes=readFileSync(fd),after=fstatSync(fd);if(bytes.length!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs)fail();canonical(filename,false);return bytes}finally{closeSync(fd)}
}
function jsonFile(filename:string,limit:number){const bytes=bytesFile(filename,limit);return {value:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown,hash:hash(bytes)}}
function environmentValid(env:NodeJS.ProcessEnv){if(env.NODE_ENV!=='development'||Object.hasOwn(env,'K_SERVICE')||env.GOOGLE_CLOUD_PROJECT!==PROJECT||env.GOOGLE_APPLICATION_CREDENTIALS||env.google_application_credentials||env.JENFU_LOCAL_SANDBOX_ENABLED==='1')fail()}
function reference(v:unknown):v is Reference{return exact(v,['path','sha256'])&&text(v.path)&&typeof v.sha256==='string'&&HASH.test(v.sha256)}
function readBound(state:Omit<State,'configHash'|'adcHash'|'inspectProcess'|'database'>&{configHash?:string;adcHash?:string},connectionString?:string){
 environmentValid(state.environment);canonical(state.root,true)
 if(!inside(path.join(state.root,'.next','dev-local'),state.configPath))fail()
 const file=jsonFile(state.configPath,16*1024),v=file.value
 if(state.configHash&&state.configHash!==file.hash)fail()
 if(!exact(v,['format','owner','projectId','ownerRoot','profileRef','sqlProfileRef','target','postmaster','audience','producer'])||v.format!=='jenfu.dev022.local-administration-runtime.v1'||v.owner!=='orgmaster'||v.projectId!==PROJECT||v.ownerRoot!==state.root||v.audience!==AUDIENCE||!reference(v.profileRef)||!reference(v.sqlProfileRef)||!exact(v.target,['host','port','database','sessionUser'])||v.target.host!=='127.0.0.1'||!Number.isSafeInteger(v.target.port)||Number(v.target.port)<1024||Number(v.target.port)>65535||!text(v.target.database)||!/^jenfu_local_[a-z0-9_]{1,80}$/u.test(v.target.database)||!text(v.target.sessionUser)||/owner|migrator/iu.test(v.target.sessionUser)||!exact(v.postmaster,['pid','startToken','dataDirectory'])||!Number.isSafeInteger(v.postmaster.pid)||Number(v.postmaster.pid)<1||typeof v.postmaster.startToken!=='string'||!/^[1-9][0-9]{0,19}$/u.test(v.postmaster.startToken)||BigInt(v.postmaster.startToken)>18446744073709551615n||!text(v.postmaster.dataDirectory)||!exact(v.producer,['email','subject'])||v.producer.email!==PLATFORM_EMAIL||v.producer.subject!==PLATFORM_SUBJECT)fail()
 const config=v as unknown as Config,profile=jsonFile(config.profileRef.path,64*1024),pointer=profile.value as Pointer
 if(profile.hash!==config.profileRef.sha256||!exact(pointer,['format','privateRoot','clusterRoot','roots','identities','directory','supportEmail'])||pointer.format!=='jenfu.dev-local-auth-profile.v1'||!text(pointer.privateRoot)||!text(pointer.clusterRoot)||!exact(pointer.roots,['platformSandbox','orgmaster','aiPdm','fms','projed'])||!Object.values(pointer.roots).every(text)||pointer.roots.orgmaster!==state.root||!exact(pointer.identities,['platform','orgmaster','aiPdm','fms'])||!exact(pointer.directory,['customerId','domain','delegatedSubject','serviceAccountEmail'])||!Object.values(pointer.directory).every(text)||!text(pointer.supportEmail))fail()
 for(const identity of Object.values(pointer.identities)){if(!exact(identity,['email','subject'])||!text(identity.email)||!identity.email.endsWith(`@${PROJECT}.iam.gserviceaccount.com`)||typeof identity.subject!=='string'||!/^[1-9][0-9]{9,29}$/u.test(identity.subject))fail()}
 const org=pointer.identities.orgmaster as RecordValue,platform=pointer.identities.platform as RecordValue
 if(org.email!==ORG_EMAIL||org.subject!==ORG_SUBJECT||platform.email!==PLATFORM_EMAIL||platform.subject!==PLATFORM_SUBJECT||!(pointer.directory.serviceAccountEmail as string).endsWith(`@${PROJECT}.iam.gserviceaccount.com`))fail()
 const run=/^dev069-real-nonprod-([a-f0-9]{32})$/u.exec(path.basename(pointer.privateRoot));if(!run)fail()
 canonical(pointer.privateRoot,true);canonical(pointer.clusterRoot,true)
 if(config.sqlProfileRef.path!==path.join(pointer.privateRoot,'private','owner-runtime-logins.json')||config.postmaster.dataDirectory!==path.join(pointer.clusterRoot,'data'))fail()
 canonical(config.postmaster.dataDirectory,true)
 const sqlFile=jsonFile(config.sqlProfileRef.path,128*1024),sql=sqlFile.value as SqlProfile
 if(sqlFile.hash!==config.sqlProfileRef.sha256||!exact(sql,['format','runId','host','port','database','apps'])||sql.format!=='dev069.real-nonproduction-runtime-logins.v1'||sql.runId!==run![1]||sql.host!==config.target.host||sql.port!==config.target.port||sql.database!==config.target.database||!exact(sql.apps,['platform','orgmaster','aipdm']))fail()
 const groups={platform:'jenfu_platform_runtime',orgmaster:'jenfu_orgmaster_runtime',aipdm:'jenfu_ai_pdm_runtime'}
 for(const [key,app] of Object.entries(sql.apps)){
  if(!exact(app,['user','password','group','url','pepper'])||!Object.values(app).every(text)||app.group!==groups[key as keyof typeof groups])fail()
  const parsed=new URL(app.url)
  if(!['postgres:','postgresql:'].includes(parsed.protocol)||parsed.hostname!==config.target.host||Number(parsed.port||'5432')!==config.target.port||decodeURIComponent(parsed.pathname.slice(1))!==config.target.database||decodeURIComponent(parsed.username)!==app.user||decodeURIComponent(parsed.password)!==app.password||parsed.search||parsed.hash)fail()
 }
 const url=new URL((sql.apps.orgmaster as RecordValue).url as string)
 if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!==config.target.host||Number(url.port||'5432')!==config.target.port||decodeURIComponent(url.pathname.slice(1))!==config.target.database||decodeURIComponent(url.username)!==config.target.sessionUser||url.search||url.hash||!url.password||connectionString!==undefined&&connectionString!==url.toString())fail()
 const adcFile=jsonFile(path.join(pointer.privateRoot,'private','google-adc','application_default_credentials.json'),16*1024),adc=adcFile.value
 if(state.adcHash&&state.adcHash!==adcFile.hash||!adc||typeof adc!=='object'||Array.isArray(adc))fail()
 const credentials=adc as RecordValue
 if(credentials.type!=='authorized_user'||credentials.quota_project_id!==PROJECT||!text(credentials.client_id)||!text(credentials.client_secret)||!text(credentials.refresh_token)||Object.hasOwn(credentials,'private_key'))fail()
 return {config,configHash:file.hash,adcHash:adcFile.hash,credentials,directory:pointer.directory as Record<string,string>,privateRoot:pointer.privateRoot,clusterRoot:pointer.clusterRoot,platformRoot:pointer.roots.platformSandbox,runId:run![1],runtimeUrl:url.toString()}
}
const execute=promisify(execFile)
async function inspectWindowsPostmaster(pid:number):Promise<ProcessSnapshot>{
 if(process.platform!=='win32'||!Number.isSafeInteger(pid)||pid<1)fail()
 const script=`$ErrorActionPreference='Stop';$p=Get-Process -Id ${pid} -ErrorAction Stop;try{$null=$p.Handle;$start=$p.StartTime.ToUniversalTime().ToFileTimeUtc().ToString();$row=Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}' -ErrorAction Stop;$after=Get-Process -Id ${pid} -ErrorAction Stop;if($p.HasExited -or $after.HasExited -or $after.StartTime.ToUniversalTime().ToFileTimeUtc().ToString() -cne $start){throw 'Changed'};[ordered]@{pid=[int]$p.Id;startToken=$start;executablePath=[string]$p.Path;commandLine=[string]$row.CommandLine}|ConvertTo-Json -Compress}finally{$p.Dispose()}`
 const {stdout}=await execute('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',windowsHide:true,timeout:5000,maxBuffer:16384})
 return JSON.parse(stdout)
}
async function verify(state:State){
 const {config}=readBound(state),observed=await state.inspectProcess(config.postmaster.pid)
 const args=[...observed.commandLine.matchAll(/(?:^|\s)-D\s+(?:"([^"]+)"|([^\s"]+))(?=\s|$)/gu)]
 if(observed.pid!==config.postmaster.pid||observed.startToken!==config.postmaster.startToken||path.win32.basename(observed.executablePath).toLowerCase()!=='postgres.exe'||args.length!==1||path.win32.normalize(args[0][1]??args[0][2]).toLowerCase()!==path.win32.normalize(config.postmaster.dataDirectory).toLowerCase())fail()
 const lines=bytesFile(path.join(config.postmaster.dataDirectory,'postmaster.pid'),16384).toString('utf8').split(/\r?\n/u)
 if(lines[0]!==String(config.postmaster.pid)||path.win32.normalize(lines[1]??'').toLowerCase()!==path.win32.normalize(config.postmaster.dataDirectory).toLowerCase()||lines[3]!==String(config.target.port))fail()
 const result=await state.database.query(`SELECT current_database() database_name,host(inet_server_addr()) host,inet_server_port() port,session_user,current_user,r.rolsuper,r.rolcreaterole,r.rolcreatedb,r.rolreplication,r.rolbypassrls,
 pg_has_role(session_user,'jenfu_orgmaster_runtime','MEMBER') runtime_member,
 pg_has_role(current_user,d.datdba,'USAGE') database_owner,
 EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND has_schema_privilege(current_user,n.oid,'CREATE')) schema_create,
 EXISTS(SELECT 1 FROM pg_roles p WHERE pg_has_role(session_user,p.oid,'MEMBER') AND (p.rolsuper OR p.rolcreaterole OR p.rolcreatedb OR p.rolreplication OR p.rolbypassrls OR p.rolname ~* '(owner|migrator)')) privileged_membership
 FROM pg_roles r JOIN pg_database d ON d.datname=current_database() WHERE r.rolname=session_user`)
 const row=result.rows[0]
 if(result.rows.length!==1||row.database_name!==config.target.database||row.host!==config.target.host||Number(row.port)!==config.target.port||row.session_user!==config.target.sessionUser||row.current_user!==row.session_user||row.runtime_member!==true||['rolsuper','rolcreaterole','rolcreatedb','rolreplication','rolbypassrls','database_owner','schema_create','privileged_membership'].some(k=>row[k]!==false))fail()
 readBound(state)
}
function stateFor(runtime:OrgmasterLocalAdministrationRuntime){const state=states.get(runtime);if(!state)fail();return state!}
/** The only selector is a canonical owner-local file; no HTTP request can mint this capability. */
export function createOrgmasterLocalAdministrationRuntime(input:{database:OrgmasterDatabase;connectionString:string;environment?:NodeJS.ProcessEnv;ownerRoot?:string;inspectProcess?:(pid:number)=>Promise<ProcessSnapshot>}):OrgmasterLocalAdministrationRuntime|undefined{
 const environment=input.environment??process.env,selected=environment.ORGMASTER_DEV070_LOCAL_ADMINISTRATION_CONFIG
 if(selected===undefined)return undefined
 try{
  const root=input.ownerRoot??realpathSync(path.resolve(fileURLToPath(new URL('../',import.meta.url))))
  if(environment.ORGMASTER_ROOT&&environment.ORGMASTER_ROOT!==root)fail()
  const initial={environment,root,configPath:selected},bound=readBound(initial,input.connectionString)
  const state:State={...initial,configHash:bound.configHash,adcHash:bound.adcHash,database:input.database,inspectProcess:input.inspectProcess??inspectWindowsPostmaster}
  const guarded={query:(async(...args:unknown[])=>{try{await verify(state)}catch{fail()}return (input.database.query as (...v:unknown[])=>Promise<unknown>)(...args)}) as OrgmasterDatabase['query'],end:()=>input.database.end()}
  const runtime=Object.freeze({database:guarded,verify:async()=>{try{await verify(state)}catch{fail()}}}) as OrgmasterLocalAdministrationRuntime
  states.set(runtime,state);return runtime
 }catch{return fail()}
}
/** SDK credentials remain in memory; neither URLs nor refresh tokens are part of the public capability. */
export function localAdministrationProviders(runtime:OrgmasterLocalAdministrationRuntime):{firebaseCredential:Credential;firebaseAppName:string;sourceAuth:GoogleAuth;directory:Record<string,string>}{
 try{const state=stateFor(runtime),bound=readBound(state)
 const sourceAuth=new GoogleAuth({credentials:bound.credentials,projectId:PROJECT,scopes:['https://www.googleapis.com/auth/cloud-platform']})
 const firebaseCredential:Credential={async getAccessToken(){
  await runtime.verify()
  const client=await sourceAuth.getClient(),result=await client.getAccessToken()
  const accessToken=typeof result==='string'?result:result?.token
  const validatedAccessToken=text(accessToken)?accessToken:fail()
  await runtime.verify()
  return {access_token:validatedAccessToken,expires_in:300}
 }}
 return {firebaseCredential,firebaseAppName:`dev070-local-${bound.adcHash.slice(0,16)}`,sourceAuth,directory:bound.directory}}catch{return fail()}
}
export async function localAdministrationServiceToken(runtime:OrgmasterLocalAdministrationRuntime,audience:string){
 const state=stateFor(runtime);if(!['http://localhost:1000','http://localhost:1030'].includes(audience))fail()
 await runtime.verify();const {sourceAuth}=localAdministrationProviders(runtime),sourceClient=await sourceAuth.getClient()
 const client=new Impersonated({sourceClient,targetPrincipal:ORG_EMAIL,targetScopes:['https://www.googleapis.com/auth/cloud-platform'],lifetime:300})
 const token=await client.fetchIdToken(audience);await runtime.verify();return token
}
export function localAdministrationPeer(runtime:OrgmasterLocalAdministrationRuntime){stateFor(runtime);return {audience:AUDIENCE,expectedEmail:PLATFORM_EMAIL,expectedSubject:PLATFORM_SUBJECT}}

/** Private owner CLI input, never composed into an HTTP/runtime capability. */
export function readLocalAdministrationOwnerInput(environment:NodeJS.ProcessEnv=process.env){
 try{
  const root=realpathSync(path.resolve(fileURLToPath(new URL('../',import.meta.url))))
  if(!environment.ORGMASTER_DEV070_LOCAL_ADMINISTRATION_CONFIG||environment.ORGMASTER_ROOT&&environment.ORGMASTER_ROOT!==root)fail()
  const bound=readBound({environment,root,configPath:environment.ORGMASTER_DEV070_LOCAL_ADMINISTRATION_CONFIG as string})
  const result={ownerRoot:root,configurationPath:environment.ORGMASTER_DEV070_LOCAL_ADMINISTRATION_CONFIG,configurationSha256:bound.configHash,config:bound.config,privateRoot:bound.privateRoot,clusterRoot:bound.clusterRoot,platformRoot:bound.platformRoot,runId:bound.runId,adcSha256:bound.adcHash,directoryCustomerId:bound.directory.customerId}
  Object.defineProperties(result,{runtimeUrl:{value:bound.runtimeUrl,enumerable:false},credentials:{value:bound.credentials,enumerable:false}})
  return result as typeof result&{readonly runtimeUrl:string;readonly credentials:RecordValue}
 }catch{return fail()}
}
