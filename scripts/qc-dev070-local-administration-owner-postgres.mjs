import assert from 'node:assert/strict'
import {readFile,readlink} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import pg from 'pg'
import {localOwnerHash,planLocalOwnerBridge,LOCAL_BRIDGE_PATH,LOCAL_OWNER_BOOTSTRAP_PATH,readLocalOwnerBootstrapFacts} from './lib/dev070-local-administration-owner.mjs'
import {unwrapMigrationTransaction} from './lib/dev040-orgmaster-independent-release.mjs'

// This component installs actual Org source fragments and all of local 046.
// FMS contract objects below are explicit ABI stubs, not a cross-owner proof.
const env=process.env,root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
if(process.platform!=='linux'||env.CI!=='true'||env.GITHUB_ACTIONS!=='true'||!/^\d{1,20}$/u.test(env.GITHUB_RUN_ID??'')||!/^\d{1,4}$/u.test(env.GITHUB_RUN_ATTEMPT??'')||! /^[a-f0-9]{12,64}$/u.test(env.ORGMASTER_DEV070_PG_CONTAINER_ID??'')||env.PGHOST!=='127.0.0.1'||env.PGUSER!=='postgres'||env.PGPASSWORD!=='orgmaster-dev070-ci-isolated'||!/^\d{4,5}$/u.test(env.PGPORT??''))throw new Error('DEV070_CI_DISPOSABLE_TARGET_REQUIRED')
const container=env.ORGMASTER_DEV070_PG_CONTAINER_ID,run=env.GITHUB_RUN_ID,marker=`orgmaster.dev070.ci-owned:${run}:${env.GITHUB_RUN_ATTEMPT}`
const inspect=JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8',maxBuffer:1024*1024}))[0]
const mapping=inspect?.NetworkSettings?.Ports?.['5432/tcp']
assert.equal(inspect?.Config?.Image,'postgres:18');assert.equal(inspect?.State?.Running,true)
assert.equal(inspect?.Config?.Labels?.['jenfu.orgmaster.dev070.run'],run)
assert.ok(Array.isArray(mapping)&&mapping.some(p=>Number(p.HostPort)===Number(env.PGPORT)&&['0.0.0.0','127.0.0.1'].includes(p.HostIp)))
assert.ok(Number.isSafeInteger(inspect.State.Pid)&&inspect.State.Pid>1)
// Run in the exact service network namespace so actual inet_server_addr()
// remains loopback. No SQL target exception is added for Docker's NAT address.
const serviceNamespace=execFileSync('sudo',['-n','readlink',`/proc/${inspect.State.Pid}/ns/net`],{encoding:'utf8',maxBuffer:1024}).trim()
if(await readlink('/proc/self/ns/net')!==serviceNamespace){
 assert.equal(process.argv.includes('--namespace-child'),false,'owned service namespace changed; no recursive retry')
 execFileSync('sudo',['-n','-E','nsenter','--target',String(inspect.State.Pid),'--net',process.execPath,fileURLToPath(import.meta.url),'--namespace-child'],{cwd:root,stdio:'inherit',env})
 process.exit(0)
}
const serviceSystem=execFileSync('docker',['exec',container,'psql','-U','postgres','-Atc','SELECT system_identifier FROM pg_control_system()'],{encoding:'utf8',maxBuffer:4096}).trim()
assert.match(serviceSystem,/^[1-9][0-9]{10,30}$/u)
const config={host:'127.0.0.1',port:5432,user:'postgres',password:env.PGPASSWORD,connectionTimeoutMillis:3000,statement_timeout:10000,query_timeout:12000,application_name:'orgmaster-dev070-046-component-ci'}
const admin=new pg.Client({...config,database:'postgres'}),database=`jenfu_local_dev070_ci_${run}_${env.GITHUB_RUN_ATTEMPT}`,ownedRoles=[],clients=[]
let created=false,sql
const ident=v=>{assert.match(v,/^[a-z][a-z0-9_]{1,62}$/u);return '"'+v+'"'}
async function connect(user){const actualLogin=user&&user!=='jenfu_orgmaster_migrator'?user:'postgres',client=new pg.Client({...config,database,user:actualLogin});await client.connect();clients.push(client);if(user==='jenfu_orgmaster_migrator')await client.query('SET SESSION AUTHORIZATION jenfu_orgmaster_migrator');return client}
async function deny(client,query,params=[]){await assert.rejects(client.query(query,params),error=>error.code==='42501')}
function fn(source,name){const start=source.indexOf(`CREATE FUNCTION orgmaster_core.${name}`);assert.ok(start>=0);assert.equal(source.indexOf(`CREATE FUNCTION orgmaster_core.${name}`,start+1),-1);const end=source.indexOf('$fn$;',start);assert.ok(end>start);return source.slice(start,end+6)}
try{
 await admin.connect()
 const actual=(await admin.query('SELECT current_database() database,host(inet_server_addr()) host,inet_server_port() port,session_user,current_user,version(),system_identifier::text FROM pg_control_system()')).rows[0]
 assert.equal(actual.database,'postgres');assert.equal(actual.host,'127.0.0.1');assert.equal(actual.port,5432);assert.equal(actual.session_user,'postgres');assert.equal(actual.current_user,'postgres');assert.match(actual.version,/PostgreSQL 18\./u);assert.equal(actual.system_identifier,serviceSystem)
 assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rows.length,0)
 await admin.query(`CREATE DATABASE ${ident(database)}`);created=true
 await admin.query(`COMMENT ON DATABASE ${ident(database)} IS '${marker}'`)
 const setup=await connect(),runId=createHash('sha256').update(marker).digest('hex').slice(0,32),orgLogin=`dev069_orgmaster_${runId.slice(0,12)}`,platformLogin=`dev069_platform_${runId.slice(0,12)}`,fmsLogin=`fms_test_runtime_${runId.slice(0,12)}`
 for(const role of ['jenfu_orgmaster_migrator','jenfu_orgmaster_runtime','jenfu_platform_runtime','jenfu_ai_pdm_runtime','fms_runtime',orgLogin,platformLogin,fmsLogin]){
  assert.equal((await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rows.length,0)
  await admin.query(`CREATE ROLE ${ident(role)} ${[orgLogin,platformLogin,fmsLogin].includes(role)?"LOGIN PASSWORD 'orgmaster-dev070-ci-isolated'":'NOLOGIN'}`);ownedRoles.push(role)
  await admin.query(`COMMENT ON ROLE ${ident(role)} IS '${marker}'`)
 }
 await admin.query(`GRANT jenfu_orgmaster_runtime TO ${ident(orgLogin)};GRANT jenfu_platform_runtime TO ${ident(platformLogin)};GRANT fms_runtime TO ${ident(fmsLogin)}`)
 await setup.query('CREATE EXTENSION pgcrypto;CREATE SCHEMA orgmaster_core AUTHORIZATION jenfu_orgmaster_migrator;CREATE SCHEMA orgmaster_contract AUTHORIZATION jenfu_orgmaster_migrator')
 await setup.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC;REVOKE ALL ON SCHEMA orgmaster_core,orgmaster_contract FROM PUBLIC;GRANT USAGE ON SCHEMA orgmaster_core TO jenfu_orgmaster_runtime')
 const profile=JSON.parse(await readFile(path.join(root,'config/release/dev040-orgmaster-independent-production-v3.json'),'utf8'))
 const source031=await readFile(path.join(root,'db/migrations/031_dev014_principal_lifecycle_v2.sql'))
 const source045=await readFile(path.join(root,'db/migrations/045_dev070_administration_commands_v1.sql'))
 for(const [version,bytes] of [['dev014-orgmaster-031',source031],['dev070-orgmaster-045',source045]])assert.equal(localOwnerHash(bytes),profile.migrations.entries.find(e=>e.version===version).sourceSha256)
 const text031=source031.toString('utf8'),begin=text031.indexOf('CREATE TABLE orgmaster_core.workload_principal_bindings ('),end=text031.indexOf('CREATE VIEW orgmaster_contract.v_workload_principals_v1')
 assert.ok(begin>0&&end>begin);const workload=text031.slice(begin,end)
 assert.equal((workload.match(/CREATE TABLE/gu)??[]).length,1);assert.equal((workload.match(/INSERT INTO/gu)??[]).length,1)
 const owner=await connect('jenfu_orgmaster_migrator')
 await owner.query(workload)
 await owner.query(fn(text031,'reject_lifecycle_payload_mutation_v2()'))
 await owner.query(fn(source045.toString('utf8'),'administration_canonical_json_v1(value jsonb)'))
 await owner.query(fn(source045.toString('utf8'),'administration_sha256_v1(value jsonb)'))
 // Owner-scope ABI scaffolding for GRANT resolution only. No policy or grants.
 for(const view of ['v_fms_principal_admissions_v2','v_fms_authority_v3','v_fms_principal_display_profiles_v1','v_fms_catalog_binding_v1','v_fms_catalog_activation_receipts_v1','v_principal_display_profiles_v1','v_platform_administrator_grants_v1']){await owner.query(`CREATE VIEW orgmaster_contract.${view} AS SELECT NULL::text principal_id WHERE false`);await owner.query(`REVOKE ALL ON orgmaster_contract.${view} FROM PUBLIC`)}
 for(const [name,args] of [['read_fms_authority_v3',''],['read_fms_principal_display_profiles_v1',''],['read_fms_administration_initialization_v1','a text,b text'],['read_fms_catalog_initialization_activation_v1','a text,b text,c text,d text,e text,f text,g text'],['read_administration_publication_v1','']]){
  const schema=name==='read_administration_publication_v1'?'orgmaster_core':'orgmaster_contract',types=args?args.split(',').map(()=> 'text').join(','):''
  await owner.query(`CREATE FUNCTION ${schema}.${name}(${args}) RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS 'SELECT NULL::text WHERE false'`)
  await owner.query(`REVOKE ALL ON FUNCTION ${schema}.${name}(${types}) FROM PUBLIC`)
 }
 for(const [name,args] of [['read_active_persistence_artifact_v1','a text'],['read_active_persistence_authority_v1',''],['write_active_persistence_artifacts_v1','a jsonb,b text,c text,d text']]){
  await setup.query(`CREATE FUNCTION orgmaster_core.${name}(${args}) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $component$ SELECT '{}'::jsonb $component$`)
  const types=args?args.split(',').map(v=>v.split(' ')[1]).join(','):''
  await setup.query(`REVOKE ALL ON FUNCTION orgmaster_core.${name}(${types}) FROM PUBLIC`)
  await setup.query(`GRANT EXECUTE ON FUNCTION orgmaster_core.${name}(${types}) TO jenfu_orgmaster_runtime`)
 }
 sql=await readFile(path.join(root,LOCAL_BRIDGE_PATH),'utf8');const ownershipSql=await readFile(path.join(root,LOCAL_OWNER_BOOTSTRAP_PATH),'utf8')
 for(const [filename,bytes] of [[LOCAL_BRIDGE_PATH,sql],[LOCAL_OWNER_BOOTSTRAP_PATH,ownershipSql]]){
  assert.equal(localOwnerHash(Buffer.from(bytes)),localOwnerHash(execFileSync('git',['show',`HEAD:${filename}`],{cwd:root,maxBuffer:1024*1024})))
  assert.equal((bytes.match(/^BEGIN;/gmu)??[]).length,1);assert.equal((bytes.match(/^COMMIT;/gmu)??[]).length,1)
 }
 const bindings=async()=> (await owner.query('SELECT principal_id,owner,purpose,provider_issuer,provider_subject,db_session_user,binding_version::text binding_version,enabled FROM orgmaster_core.workload_principal_bindings ORDER BY principal_id')).rows
 const initial=await bindings(),context={configurationSha256:'1'.repeat(64),clusterRecordSha256:'2'.repeat(64),runId,config:{target:{host:'127.0.0.1',port:5432,database,sessionUser:orgLogin},postmaster:{pid:123,startToken:'133000000000000001',dataDirectory:'/ci-owned-component'},profileRef:{sha256:'3'.repeat(64)},sqlProfileRef:{sha256:'4'.repeat(64)}}}
 const source={sourceRevision:'a'.repeat(40),sourceSha256:'b'.repeat(64),localMigration:{path:LOCAL_BRIDGE_PATH,sourceSha256:localOwnerHash(sql),appliedSha256:localOwnerHash(unwrapMigrationTransaction(sql))},ownershipBootstrap:{path:LOCAL_OWNER_BOOTSTRAP_PATH,sourceSha256:localOwnerHash(ownershipSql),appliedSha256:localOwnerHash(unwrapMigrationTransaction(ownershipSql))}}
 const makePlan=async()=>planLocalOwnerBridge({context,source,facts:{ledgerSha256:'c'.repeat(64),bindingsSha256:localOwnerHash(await bindings()),runtimeRolesSha256:'d'.repeat(64),beforeOwnership:await readLocalOwnerBootstrapFacts(owner),disposition:{pending:[]}},ownerProof:{email:'dev010-orgmaster-migrator@jenfu-platform-nonprod.iam.gserviceaccount.com',subject:'109035753048386897825'},reason:'SQL_SOURCE_DOMAIN_FIXTURE_NO_PROVIDER'})
 const core=p=>{const{planSha256,...value}=p;return value},apply=async plan=>(await owner.query('SELECT orgmaster_core.bind_local_administration_workloads_v1($1::jsonb) receipt',[JSON.stringify(core(plan))])).rows[0].receipt
 const plan=await makePlan(),beforeFunctions=structuredClone(plan.beforeOwnership),badOwnership=structuredClone(plan)
 badOwnership.beforeOwnership[0].body+='tampered';badOwnership.planSha256=localOwnerHash(core(badOwnership))
 await setup.query('BEGIN');await setup.query("SELECT set_config('orgmaster.dev070.local_owner_plan',$1,true)",[JSON.stringify(badOwnership)])
 await assert.rejects(setup.query(unwrapMigrationTransaction(ownershipSql)),/BOOTSTRAP_CAS_CONFLICT/u);await setup.query('ROLLBACK')
 assert.deepEqual(await readLocalOwnerBootstrapFacts(owner),beforeFunctions)
 await setup.query('BEGIN');await setup.query("SELECT set_config('orgmaster.dev070.local_owner_plan',$1,true)",[JSON.stringify(plan)])
 await setup.query(unwrapMigrationTransaction(ownershipSql));await setup.query('COMMIT')
 const afterFunctions=await readLocalOwnerBootstrapFacts(owner)
 for(const after of afterFunctions){const before=beforeFunctions.find(v=>v.signature===after.signature);assert.equal(after.owner,'jenfu_orgmaster_migrator');assert.equal(after.definitionSha256,before.definitionSha256);assert.equal(after.bodySha256,before.bodySha256)}
 await owner.query(sql)
 await owner.query('INSERT INTO orgmaster_core.administration_local_bridge_installations_v1(singleton,source_path,source_sha256,source_revision) VALUES(true,$1,$2,$3)',[LOCAL_BRIDGE_PATH,localOwnerHash(sql),'a'.repeat(40)])
 const runtime=await connect(orgLogin),fms=await connect(fmsLogin),platform=await connect(platformLogin)
 await deny(runtime,'SELECT orgmaster_core.bind_local_administration_workloads_v1($1::jsonb)',[JSON.stringify(core(plan))]);await deny(platform,'SELECT orgmaster_core.bind_local_administration_workloads_v1($1::jsonb)',[JSON.stringify(core(plan))]);await deny(fms,'SELECT orgmaster_core.bind_local_administration_workloads_v1($1::jsonb)',[JSON.stringify(core(plan))])
 const bad={...core(plan),beforeBindingsSha256:'0'.repeat(64)}
 await assert.rejects(owner.query('SELECT orgmaster_core.bind_local_administration_workloads_v1($1::jsonb)',[JSON.stringify(bad)]),/BINDING_CONFLICT/u);assert.deepEqual(await bindings(),initial)
 const receipt=await apply(plan);assert.equal(receipt.changedBindings,2);assert.equal(receipt.planSha256,plan.planSha256);assert.deepEqual(await apply(plan),receipt)
 const changed=await bindings();assert.equal(changed[0].db_session_user,orgLogin);assert.equal(changed[1].db_session_user,platformLogin);assert.ok(changed.every(r=>r.binding_version==='2'&&r.enabled))
 assert.equal((await apply(await makePlan())).changedBindings,0);assert.deepEqual(await bindings(),changed)
 // An explicit rollback and a provider/session readback recover the same facts.
 await owner.query('BEGIN');await owner.query("UPDATE orgmaster_core.workload_principal_bindings SET provider_subject='199999999999999999999' WHERE owner='orgmaster'")
 await assert.rejects(apply(await makePlan()),/BINDING_CONFLICT/u);await owner.query('ROLLBACK');assert.deepEqual(await bindings(),changed)
 await deny(fms,'SELECT * FROM orgmaster_contract.v_principal_display_profiles_v1');await deny(fms,'SELECT * FROM orgmaster_contract.v_platform_administrator_grants_v1');await deny(fms,'SELECT * FROM orgmaster_core.read_administration_publication_v1()')
 assert.equal((await fms.query('SELECT * FROM orgmaster_contract.v_fms_principal_display_profiles_v1')).rows.length,0)
 assert.equal((await fms.query('SELECT * FROM orgmaster_contract.read_fms_administration_initialization_v1($1,$2)',['no-qualified-principal','no-qualified-employee'])).rows.length,0)
 await assert.rejects(owner.query('UPDATE orgmaster_core.administration_local_bridge_receipts_v1 SET response=response'),/LIFECYCLE_PAYLOAD_IMMUTABLE/u)
 const stat=(await owner.query('SELECT count(*)::int count FROM orgmaster_core.administration_local_bridge_receipts_v1')).rows[0];assert.equal(stat.count,2)
 process.stdout.write(JSON.stringify({scope:'DEV070_046_COMPONENT_SQL_ABI_STUBS_NO_PROVIDER',status:'PASS',postgres:18,source031Sha256:localOwnerHash(source031),source045Sha256:localOwnerHash(source045),source046Sha256:localOwnerHash(sql),bindingRows:2,terminalReceipts:2,claimsOfFullFoundationOrRealFms:false})+'\n')
}catch(error){
 process.stderr.write(JSON.stringify({scope:'DEV070_046_COMPONENT_FIRST_FAILURE',code:typeof error.code==='string'?error.code:'ASSERTION',message:error.message})+'\n')
 throw error
}finally{
 await Promise.allSettled(clients.map(c=>c.end()))
 if(created){const current=(await admin.query('SELECT shobj_description(oid,\'pg_database\') marker FROM pg_database WHERE datname=$1',[database])).rows[0];assert.equal(current?.marker,marker);assert.equal((await admin.query('SELECT system_identifier::text FROM pg_control_system()')).rows[0].system_identifier,serviceSystem);await admin.query(`DROP DATABASE ${ident(database)}`)}
 for(const role of ownedRoles.reverse()){assert.equal((await admin.query("SELECT shobj_description(oid,'pg_authid') marker FROM pg_roles WHERE rolname=$1",[role])).rows[0]?.marker,marker);await admin.query(`DROP ROLE ${ident(role)}`)}
 await admin.end()
}
