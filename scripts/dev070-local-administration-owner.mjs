#!/usr/bin/env node
import {readFile,mkdir,writeFile,lstat,realpath} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import pg from 'pg'
import {createServer} from 'vite'
import {readLocalOwnerSource,inspectLocalOwnerCluster,verifyLocalOwnerGoogleIdentity,readLocalOwnerFacts,planLocalOwnerBridge,commitLocalOwnerBridge,localOwnerHash,executeLocalEnrollmentIntent} from './lib/dev070-local-administration-owner.mjs'
export function parseLocalAdministrationOwnerArgs(argv){
 const [action,...rest]=argv,required={plan:['config','output','reason'],commit:['config','plan'],status:['config'],'intent-plan':['config','intent','output'],'intent-admit':['config','intent'],'intent-status':['config','intent'],'intent-revoke':['config','intent']}[action]
 if(!required)throw new Error('DEV070_LOCAL_ARGUMENT_INVALID')
 const allowed=action==='status'?[...required,'plan']:required,out={action}
 for(let i=0;i<rest.length;i+=2){const key=rest[i].startsWith('--')?rest[i].slice(2):'';if(!allowed.includes(key)||!rest[i+1]||out[key])throw new Error('DEV070_LOCAL_ARGUMENT_INVALID');out[key]=rest[i+1]}
 if(required.some(key=>!out[key]))throw new Error('DEV070_LOCAL_ARGUMENT_INVALID')
 return out
}
async function planFile(root,filename,write=false){
 const target=path.resolve(filename),base=path.join(root,'output','dev070','local-owner'),relative=path.relative(base,target)
 if(!relative||relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative)||!target.endsWith('.json'))throw new Error('DEV070_LOCAL_PLAN_PATH_INVALID')
 if(write){let current=root;for(const segment of path.relative(root,path.dirname(target)).split(path.sep)){current=path.join(current,segment);try{await lstat(current)}catch(error){if(error.code!=='ENOENT')throw error;await mkdir(current)}const stat=await lstat(current);if(!stat.isDirectory()||stat.isSymbolicLink()||await realpath(current)!==current)throw new Error('DEV070_LOCAL_PLAN_PATH_INVALID')}}
 let cursor=write?path.dirname(target):target
 for(let i=0;;i++){if(i>64)throw new Error('DEV070_LOCAL_PLAN_PATH_INVALID');const stat=await lstat(cursor);if(stat.isSymbolicLink()||await realpath(cursor)!==cursor)throw new Error('DEV070_LOCAL_PLAN_PATH_INVALID');const parent=path.dirname(cursor);if(parent===cursor)break;cursor=parent}
 return target
}
async function main(){
 const options=parseLocalAdministrationOwnerArgs(process.argv.slice(2)),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
 const environment={...process.env,ORGMASTER_DEV070_LOCAL_ADMINISTRATION_CONFIG:path.resolve(options.config)}
 const loader=await createServer({root,configFile:false,appType:'custom',logLevel:'silent',server:{middlewareMode:true}})
 let client,runtimePool
 try{
  const module=await loader.ssrLoadModule('/server/orgmasterLocalAdministrationRuntime.ts'),context=module.readLocalAdministrationOwnerInput(environment)
  const source=await readLocalOwnerSource(context),{cluster,recordSha256}=await inspectLocalOwnerCluster(context,source)
  context.clusterRecordSha256=recordSha256
  runtimePool=new pg.Pool({connectionString:context.runtimeUrl,max:1,application_name:'orgmaster-dev070-local-owner-runtime-preflight',connectionTimeoutMillis:3000,statement_timeout:5000,query_timeout:7000})
  const runtime=module.createOrgmasterLocalAdministrationRuntime({database:runtimePool,connectionString:context.runtimeUrl,environment})
  await runtime.verify()
  const ownerProof=await verifyLocalOwnerGoogleIdentity(context)
  client=new pg.Client({...cluster.adminConnection,database:context.config.target.database,application_name:'orgmaster-dev070-local-owner-bridge',connectionTimeoutMillis:3000,statement_timeout:30000,query_timeout:35000})
  await client.connect()
  const operator=(await client.query("SELECT current_database() database,host(inet_server_addr()) host,inet_server_port() port,session_user,current_user,r.rolsuper FROM pg_roles r WHERE r.rolname=session_user")).rows[0]
  if(!operator||operator.database!==context.config.target.database||operator.host!=='127.0.0.1'||Number(operator.port)!==context.config.target.port||operator.session_user!=='postgres'||operator.current_user!=='postgres'||operator.rolsuper!==true)throw new Error('DEV070_LOCAL_OPERATOR_INVALID')
  await client.query('SET SESSION AUTHORIZATION jenfu_orgmaster_migrator')
  await runtime.verify()
  if(options.action.startsWith('intent-')){
   const filename=await planFile(root,options.intent),stat=await lstat(filename)
   if(!stat.isFile()||stat.size<2||stat.size>1024*1024)throw new Error('DEV070_LOCAL_INTENT_INPUT_INVALID')
   const input=JSON.parse(await readFile(filename,'utf8')),result=await executeLocalEnrollmentIntent({client,context,source,input,action:options.action.slice(7),ownerProof})
   if(result.plan){const output=await planFile(root,options.output,true);await writeFile(output,JSON.stringify(result.plan,null,2)+'\n',{flag:'wx',mode:0o600});process.stdout.write(JSON.stringify({status:result.status,commandId:result.plan.intent.commandId,planSha256:result.plan.planSha256,intentSha256:result.plan.intentSha256,planPath:output,readiness:result.readiness})+'\n')}
   else process.stdout.write(JSON.stringify(result)+'\n')
   return
  }
  if(options.action==='commit'){
   const filename=await planFile(root,options.plan),plan=JSON.parse(await readFile(filename,'utf8'))
   const receipt=await commitLocalOwnerBridge({client,context,source,plan,ownerProof})
   process.stdout.write(JSON.stringify({status:'COMMITTED',receipt})+'\n');return
  }
  await client.query('BEGIN READ ONLY')
  try{
   const facts=await readLocalOwnerFacts(client,context,source)
   if(options.action==='plan'){
    const plan=planLocalOwnerBridge({context,source,facts,ownerProof,reason:options.reason}),filename=await planFile(root,options.output,true)
    await writeFile(filename,JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600})
    process.stdout.write(JSON.stringify({status:'PLANNED',commandId:plan.commandId,planSha256:plan.planSha256,planPath:filename,ledgerCount:facts.disposition.count,raw042:facts.disposition.raw042,pendingMigrations:plan.migrations.map(v=>v.version)})+'\n')
   }else{
    let receipt=null
    if(options.plan&&facts.installed){const filename=await planFile(root,options.plan),plan=JSON.parse(await readFile(filename,'utf8'));const{planSha256,...core}=plan;if(localOwnerHash(core)!==planSha256)throw new Error('DEV070_LOCAL_PLAN_INVALID');receipt=(await client.query('SELECT response FROM orgmaster_core.administration_local_bridge_receipts_v1 WHERE command_id=$1::uuid',[plan.commandId])).rows[0]?.response??null}
    process.stdout.write(JSON.stringify({status:'READ_ONLY',ledgerCount:facts.disposition.count,raw042:facts.disposition.raw042,localBridgeInstalled:facts.installed,bindings:facts.bindings,receipt})+'\n')
   }
  }finally{await client.query('ROLLBACK')}
 }finally{await client?.end().catch(()=>undefined);await runtimePool?.end().catch(()=>undefined);await loader.close()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{process.stderr.write(JSON.stringify({code:/^DEV070_LOCAL_[A-Z_]+$/u.test(error.code??error.message??'')?error.code??error.message:'DEV070_LOCAL_OWNER_UNAVAILABLE'})+'\n');process.exitCode=1})
