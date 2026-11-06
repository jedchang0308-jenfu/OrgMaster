import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {localOwnerHash,readLocalOwnerBootstrapFacts,OWNER_BOOTSTRAP_SIGNATURES} from './dev070-local-administration-owner.mjs'
import {unwrapMigrationTransaction} from './dev040-orgmaster-independent-release.mjs'

// Called only inside the existing owned GHA PostgreSQL 18 component. No
// connection, primary target, provider identity or bootstrap path is accepted.
export async function verifyLocalOwnerBootstrapAcl({admin,owner,makePlan,legacySql,ownershipSql}){
 const facts=(await admin.query("SELECT current_database() database,host(inet_server_addr()) host,current_setting('server_version_num')::int version")).rows[0]
 assert.match(facts.database,/^jenfu_local_dev070_ci_\d{1,20}_\d{1,4}$/u)
 assert.equal(facts.host,'127.0.0.1');assert.ok(facts.version>=180000&&facts.version<190000)
 const template=await makePlan(),initial=await readLocalOwnerBootstrapFacts(admin),cases=[]
 const writer=OWNER_BOOTSTRAP_SIGNATURES[2],reader=OWNER_BOOTSTRAP_SIGNATURES[0]
 assert.deepEqual(initial.map(row=>row.acl.length),[2,2,2])
 assert.ok(initial.find(row=>row.signature===writer).acl.some(a=>a.grantee==='jenfu_orgmaster_migrator'&&!a.grantable))
 const rolledBack=async run=>{await admin.query('BEGIN');try{return await run()}finally{await admin.query('ROLLBACK')}}
 const fresh=async()=>{
  const {planSha256,...core}=structuredClone(template)
  core.commandId=randomUUID();core.beforeOwnership=await readLocalOwnerBootstrapFacts(admin)
  return {...core,planSha256:localOwnerHash(core)}
 }
 const install=async(plan,sql=ownershipSql)=>{
  await admin.query("SELECT set_config('orgmaster.dev070.local_owner_plan',$1,true)",[JSON.stringify(plan)])
  await admin.query(unwrapMigrationTransaction(sql))
 }
 const unchanged=async()=>assert.deepEqual(await readLocalOwnerBootstrapFacts(admin),initial)
 // Retain the actual 070 failure as a required regression, including rollback.
 await rolledBack(async()=>{
  const plan=await fresh();plan.ownershipBootstrap={path:'db/dev-010/070_local_orgmaster_administration_owner_bootstrap_v1.sql',sourceSha256:localOwnerHash(legacySql),appliedSha256:localOwnerHash(unwrapMigrationTransaction(legacySql))}
  const {planSha256,...core}=plan;plan.planSha256=localOwnerHash(core)
  await assert.rejects(install(plan,legacySql),/DEV070_LOCAL_BOOTSTRAP_READBACK_INVALID/u)
 })
 await unchanged();assert.equal((await admin.query("SELECT to_regclass('orgmaster_core.administration_local_owner_bootstrap_receipts_v1') present")).rows[0].present,null)
 cases.push('070-existing-new-owner-grantee-fails-and-rolls-back')
 // Both original false/false and mixed false/true grant options must survive
 // PostgreSQL's native merge exactly. An unrelated fourth function is fixed.
 await admin.query("CREATE FUNCTION orgmaster_core.dev070_owner_scope_sentinel() RETURNS integer LANGUAGE sql AS 'SELECT 7'")
 const sentinel=async()=>(await admin.query("SELECT pg_get_userbyid(proowner) owner,prosrc,proacl::text acl FROM pg_proc WHERE oid='orgmaster_core.dev070_owner_scope_sentinel()'::regprocedure")).rows[0]
 const beforeSentinel=await sentinel()
 try{
  for(const grantable of [false,true]){
   await rolledBack(async()=>{
    if(grantable)await admin.query(`GRANT EXECUTE ON FUNCTION ${writer} TO jenfu_orgmaster_migrator WITH GRANT OPTION`)
    const plan=await fresh();await install(plan)
    const after=await readLocalOwnerBootstrapFacts(admin),written=after.find(row=>row.signature===writer)
    assert.equal(written.acl.length,1)
    assert.deepEqual(written.acl[0],{grantor:'jenfu_orgmaster_migrator',grantee:'jenfu_orgmaster_migrator',privilege:'EXECUTE',grantable})
    assert.deepEqual(after.filter(row=>row.signature!==writer).map(row=>row.acl.length),[2,2])
    for(const row of after){const original=plan.beforeOwnership.find(v=>v.signature===row.signature);assert.equal(row.owner,'jenfu_orgmaster_migrator');assert.deepEqual({...row,owner:original.owner,acl:original.acl},original)}
    assert.deepEqual(await sentinel(),beforeSentinel)
    const receipt=(await admin.query('SELECT plan_sha256,source_sha256,before_functions,after_functions FROM orgmaster_core.administration_local_owner_bootstrap_receipts_v1 WHERE command_id=$1',[plan.commandId])).rows[0]
    assert.equal(receipt.plan_sha256,plan.planSha256);assert.equal(receipt.source_sha256,plan.ownershipBootstrap.sourceSha256)
    assert.deepEqual(receipt.before_functions,plan.beforeOwnership);assert.deepEqual(receipt.after_functions,after)
    // Already-owned functions preserve literal postgres ACL references too.
    await admin.query(`GRANT EXECUTE ON FUNCTION ${reader} TO postgres`)
    const already=await fresh();await install(already)
    assert.deepEqual(await readLocalOwnerBootstrapFacts(admin),already.beforeOwnership)
    await assert.rejects(install(already),/DEV070_LOCAL_BOOTSTRAP_RECEIPT_REQUIRES_STATUS/u)
   })
   await unchanged();cases.push(`071-merge-grantable-${grantable}-body-config-3-only-already-owned-receipt`)
  }
  for(const field of ['database','port','bootstrap-path']){
   await rolledBack(async()=>{
    const plan=await fresh()
    if(field==='database')plan.target.database='jenfu_local_wrong_target'
    if(field==='port')plan.target.port++
    if(field==='bootstrap-path')plan.ownershipBootstrap.path='db/dev-010/070_local_orgmaster_administration_owner_bootstrap_v1.sql'
    await assert.rejects(install(plan),/DEV070_LOCAL_BOOTSTRAP_PLAN_INVALID/u)
   });await unchanged();cases.push(`071-wrong-${field}-rejected`)
  }
  await rolledBack(async()=>{
   await admin.query(`ALTER FUNCTION ${writer} OWNER TO jenfu_platform_runtime`)
   await assert.rejects(install(await fresh()),/DEV070_LOCAL_BOOTSTRAP_OWNER_INVALID/u)
  });await unchanged();cases.push('071-foreign-owner-rejected')
  for(const [id,fault] of [
   ['extra-acl',`GRANT EXECUTE ON FUNCTION ${reader} TO jenfu_platform_runtime;`],
   ['lost-acl',`REVOKE EXECUTE ON FUNCTION ${reader} FROM jenfu_orgmaster_runtime;`],
   ['grant-option',`GRANT EXECUTE ON FUNCTION ${reader} TO jenfu_orgmaster_runtime WITH GRANT OPTION;`],
   ['body',`CREATE OR REPLACE FUNCTION orgmaster_core.read_active_persistence_artifact_v1(a text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS 'SELECT ''{"tampered":true}''::jsonb';`],
  ]){
   await rolledBack(async()=>{
    const plan=await fresh()
    // An owned CI-only event trigger injects drift after ALTER OWNER and
    // before the production SQL's readback, without editing tested SQL bytes.
    await admin.query(`CREATE FUNCTION orgmaster_core.dev070_bootstrap_readback_fault() RETURNS event_trigger LANGUAGE plpgsql AS $fault$ BEGIN
     IF EXISTS(SELECT 1 FROM pg_event_trigger_ddl_commands() WHERE objid='${reader}'::regprocedure) THEN ${fault} END IF;
     END $fault$;CREATE EVENT TRIGGER dev070_bootstrap_readback_fault ON ddl_command_end WHEN TAG IN ('ALTER FUNCTION') EXECUTE FUNCTION orgmaster_core.dev070_bootstrap_readback_fault()`)
    await assert.rejects(install(plan),/DEV070_LOCAL_BOOTSTRAP_READBACK_INVALID/u)
   });await unchanged();cases.push(`071-readback-${id}-rejected`)
  }
  await rolledBack(async()=>{
   const plan=await fresh();plan.beforeOwnership[0].body+='plan-drift'
   await assert.rejects(install(plan),/DEV070_LOCAL_BOOTSTRAP_CAS_CONFLICT/u)
  });await unchanged();cases.push('071-before-body-cas-rejected')
  // This is not the private postgres operator, even though it is the owner.
  await owner.query('BEGIN')
  try{await owner.query("SELECT set_config('orgmaster.dev070.local_owner_plan',$1,true)",[JSON.stringify(template)]);await assert.rejects(owner.query(unwrapMigrationTransaction(ownershipSql)),/DEV070_LOCAL_BOOTSTRAP_TARGET_INVALID/u)}finally{await owner.query('ROLLBACK')}
  await unchanged();cases.push('071-non-operator-session-rejected')
  assert.deepEqual(await sentinel(),beforeSentinel)
  return {scope:'DEV070_LOCAL_BOOTSTRAP_ACL_NATIVE_POSTGRES18',status:'PASS',cases,legacy070ExpectedFailure:'DEV070_LOCAL_BOOTSTRAP_READBACK_INVALID',legacy070SourceSha256:localOwnerHash(legacySql),bootstrap071SourceSha256:localOwnerHash(ownershipSql),primaryWrites:false,claimsOfPrimaryInstallation:false}
 }finally{await admin.query('DROP FUNCTION orgmaster_core.dev070_owner_scope_sentinel()')}
}
