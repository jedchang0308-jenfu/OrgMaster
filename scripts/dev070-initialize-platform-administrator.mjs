import {spawnSync} from 'node:child_process'
import {readFile,writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import pg from 'pg'
import {GoogleAuth} from 'google-auth-library'
import {parseAdministrationOwnerArguments,planAdministrationOwner} from './lib/dev070-administration-owner.mjs'

if(process.argv.includes('--help')){console.log('Private owner CLI: plan --request <json> --output <json> | verify --plan <json> | commit --plan <json> | status --plan <json>. Google ID token is accepted through stdin only.');process.exit(0)}
if(!process.execArgv.includes('--experimental-transform-types')){
 const child=spawnSync(process.execPath,['--experimental-transform-types',fileURLToPath(import.meta.url),...process.argv.slice(2)],{stdio:'inherit',windowsHide:true});process.exit(child.status??1)
}
let client
try{
 const options=parseAdministrationOwnerArguments(process.argv.slice(2))
 const environmentKey=process.env.ORGMASTER_OWNER_ENVIRONMENT_KEY
 if(!environmentKey||!process.env.ORGMASTER_OWNER_POSTGRES_URL)throw new Error('ADMINISTRATION_OWNER_TARGET_REQUIRED')
 client=new pg.Client({connectionString:process.env.ORGMASTER_OWNER_POSTGRES_URL,application_name:'orgmaster-dev070-owner',statement_timeout:30000,query_timeout:35000});await client.connect()
 const [{createAdministrationOwner},{createFirebaseIdentityProvider},{readGoogleDirectoryRuntimeConfig,createGoogleDirectoryAuthPort,createGoogleDirectoryReadOnlyPort}]=await Promise.all([import('../server/orgmasterAdministrationOwner.ts'),import('../server/orgmasterFirebaseIdentityProvider.ts'),import('../server/orgmasterManagedDirectoryPort.ts')])
 const config=readGoogleDirectoryRuntimeConfig(process.env)
 if(!config.enabled)throw new Error('ADMINISTRATION_DEPENDENCY_UNAVAILABLE')
 const directory=createGoogleDirectoryReadOnlyPort({customerId:config.customerId,domain:config.domain,auth:createGoogleDirectoryAuthPort(config)})
 const issuer=process.env.JENFU_IDENTITY_ISSUER,audience=process.env.JENFU_IDENTITY_AUDIENCE
 if(!issuer||!audience||issuer!==`https://securetoken.google.com/${audience}`)throw new Error('ADMINISTRATION_DEPENDENCY_UNAVAILABLE')
 const identityProvider=createFirebaseIdentityProvider(issuer,audience)
 let token=''
 if(options.action!=='status'){for await(const part of process.stdin){token+=part.toString();if(token.length>16384)throw new Error('ADMIN_TARGET_INVALID')}token=token.trim();if(!token)throw new Error('AUTH_RECENT_REQUIRED')}
 const owner=createAdministrationOwner({database:client,directory,identityProvider,environmentKey})
 if(options.action==='plan'){
  const request=JSON.parse(await readFile(options.request,'utf8'))
  const session=(await client.query('SELECT SESSION_USER::text AS db_user,current_database() AS environment')).rows[0]
  if(session.environment!==environmentKey||request.environmentKey!==environmentKey)throw new Error('ADMINISTRATION_COMMAND_CONFLICT')
  const accountEmail=process.env.ORGMASTER_OWNER_SERVICE_ACCOUNT_EMAIL??`${session.db_user}.gserviceaccount.com`
  if(!/^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(accountEmail))throw new Error('ADMINISTRATION_OWNER_PROVIDER_REQUIRED')
  const auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']})
  const provider=await auth.request({url:`https://iam.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(accountEmail)}`})
  if(provider.data.email!==accountEmail||!provider.data.uniqueId)throw new Error('ADMINISTRATION_OWNER_PROVIDER_REQUIRED')
  const identity=await identityProvider.verifyIdToken(token),observed=await directory.readByDirectoryKey(request.directoryKey.customerId,request.directoryKey.userId)
  if(!observed.ok)throw new Error('ADMIN_TARGET_INVALID')
  const plan=await planAdministrationOwner({database:client,request,identity,directory:observed.user,ownerProviderFacts:{dbSessionUser:session.db_user,providerSubject:provider.data.uniqueId}})
  await writeFile(options.output,`${JSON.stringify(plan,null,2)}\n`,{flag:'wx'})
  console.log(JSON.stringify({contractVersion:plan.contractVersion,commandId:plan.commandId,planHash:plan.planHash,output:options.output}));
 }else{
  const plan=JSON.parse(await readFile(options.plan,'utf8'))
  let result
  if(options.action==='verify'){
   await client.query('SELECT orgmaster_core.bind_administration_owner_package_v1($1::jsonb)',[JSON.stringify(plan)])
   result=await owner.prepare(plan,token)
  }else result=options.action==='commit'?await owner.commit(plan,token):await owner.status(plan)
  console.log(JSON.stringify(result??{commandId:plan.commandId,result:'COMMAND_NOT_COMMITTED'}))
 }
}catch(error){console.error(JSON.stringify({code:error?.code??(['ADMIN_TARGET_INVALID','AUTH_RECENT_REQUIRED','PLATFORM_ADMIN_REQUIRED','ADMINISTRATION_COMMAND_CONFLICT','ADMINISTRATION_ALREADY_INITIALIZED','CATALOG_BINDING_CONFLICT'].includes(error?.message)?error.message:'ADMINISTRATION_OWNER_FAILED')}));process.exitCode=1}
finally{await client?.end()}
