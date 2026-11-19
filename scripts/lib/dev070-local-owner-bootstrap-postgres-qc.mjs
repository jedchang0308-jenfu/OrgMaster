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
   ['body',`CREATE OR REPLACE FUNCTION orgmaster_core.read_active_persistence_artifact_v1(p_artifact_key text) RETURNS TABLE(artifact_key text,artifact_kind text,payload jsonb,canonical_sha256 text,source_sha256 text,source_bytes bigint,source_revision text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS 'SELECT ''tampered'',''governance'',''{}''::jsonb,repeat(''a'',64),repeat(''b'',64),1::bigint,repeat(''c'',64)';`],
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

/** Exercise the historical SECURITY DEFINER bridge only inside the owned CI PostgreSQL fixture. */
export async function verifyLocalPersistenceCompatibility({admin,runtime,plan,compatibilitySql}){
 const facts=(await admin.query("SELECT current_database() database,host(inet_server_addr()) host,current_setting('server_version_num')::int version")).rows[0]
 assert.match(facts.database,/^jenfu_local_dev070_ci_\d{1,20}_\d{1,4}$/u)
 assert.equal(facts.host,'127.0.0.1');assert.ok(facts.version>=180000&&facts.version<190000)
 assert.equal(plan?.ownershipBootstrap?.compatibility?.path,'db/dev-010/072_local_orgmaster_persistence_compatibility.sql')
 assert.equal(localOwnerHash(compatibilitySql),plan.ownershipBootstrap.compatibility.appliedSha256)
 const session=(await runtime.query(`SELECT session_user,current_user,pg_has_role(session_user,'jenfu_orgmaster_runtime','MEMBER') org_runtime,
  pg_has_role(session_user,'jenfu_orgmaster_migrator','MEMBER') migrator_membership`)).rows[0]
 assert.equal(session.session_user,session.current_user);assert.equal(session.org_runtime,true);assert.equal(session.migrator_membership,false)
 const legacyBefore=(await admin.query(`SELECT has_schema_privilege($1,'orgmaster','USAGE') schema_usage,
  has_function_privilege($1,'orgmaster.read_active_persistence_artifact_v1(text)','EXECUTE') reader,
  has_function_privilege($1,'orgmaster.write_active_persistence_artifacts_v1(jsonb,text,text,text)','EXECUTE') writer,
  has_function_privilege($1,'orgmaster.write_active_persistence_artifacts_with_entitlement_outbox_v1(jsonb,text,text,text,jsonb)','EXECUTE') outbox_writer`,[session.session_user])).rows[0]
 assert.deepEqual(legacyBefore,{schema_usage:true,reader:false,writer:true,outbox_writer:true})
 assert.deepEqual((await runtime.query("SELECT * FROM orgmaster.write_active_persistence_artifacts_v1('{}'::jsonb,'revision','runtime','fixture')")).rows,[{authority_version:'8',source_revision:'revision'}])
 assert.equal((await runtime.query("SELECT orgmaster.write_active_persistence_artifacts_with_entitlement_outbox_v1('{}'::jsonb,'revision','runtime','fixture','[]'::jsonb)")).rowCount,1)
 const coreBefore=await readLocalOwnerBootstrapFacts(admin)
 assert.ok(coreBefore.every(row=>row.owner==='jenfu_orgmaster_migrator'))
 await assert.rejects(runtime.query("SELECT artifact_key,payload FROM orgmaster_core.read_active_persistence_artifact_v1('orgmaster-governance.v3.json')"),error=>error.code==='42501')

 const compatibility=(plan)=>admin.query("SELECT set_config('orgmaster.dev070.local_owner_plan',$1,true)",[JSON.stringify(plan)])
 await admin.query('BEGIN')
 try{
  await admin.query(`CREATE OR REPLACE FUNCTION orgmaster_core.read_active_persistence_artifact_v1(p_artifact_key text)
   RETURNS TABLE(artifact_key text,artifact_kind text,payload jsonb,canonical_sha256 text,source_sha256 text,source_bytes bigint,source_revision text)
   LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
   AS 'SELECT * FROM orgmaster.read_active_persistence_artifact_v1(''abi-drift'');'`)
  await compatibility(plan)
  await assert.rejects(admin.query(compatibilitySql),/DEV070_LOCAL_PERSISTENCE_COMPATIBILITY_ABI_INVALID/u)
 }finally{await admin.query('ROLLBACK')}
 assert.deepEqual(await readLocalOwnerBootstrapFacts(admin),coreBefore)

 const schemas=async()=> (await admin.query(`SELECT n.nspname,pg_get_userbyid(n.nspowner) owner,
  COALESCE(jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
   'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable)
   ORDER BY a.grantee,a.privilege_type,a.grantor),'[]'::jsonb) acl
  FROM pg_namespace n LEFT JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a ON true
  WHERE n.nspname IN('orgmaster','organization','access_governance') GROUP BY n.oid ORDER BY n.nspname`)).rows
 const owners=async()=> (await admin.query(`SELECT p.oid::regprocedure::text signature,pg_get_userbyid(p.proowner) owner
  FROM pg_proc p WHERE p.oid IN(
   'orgmaster.read_active_persistence_artifact_v1(text)'::regprocedure,
   'orgmaster.read_active_persistence_authority_v1()'::regprocedure,
   'orgmaster.write_active_persistence_artifacts_v1(jsonb,text,text,text)'::regprocedure,
   'orgmaster.write_active_persistence_artifacts_with_entitlement_outbox_v1(jsonb,text,text,text,jsonb)'::regprocedure)
  ORDER BY signature`)).rows
 const schemasBefore=await schemas(),ownersBefore=await owners()
 await admin.query('BEGIN')
 try{
  await compatibility(plan)
  await admin.query(compatibilitySql)
  await admin.query('COMMIT')
 }catch(error){await admin.query('ROLLBACK').catch(()=>undefined);throw error}

 const returned=(await runtime.query("SELECT artifact_key,artifact_kind,payload,canonical_sha256,source_sha256,source_bytes,source_revision FROM orgmaster_core.read_active_persistence_artifact_v1($1)",['orgmaster-governance.v3.json'])).rows
 assert.deepEqual(returned,[{artifact_key:'orgmaster-governance.v3.json',artifact_kind:'governance',payload:{fixture:'dev070-local-compatibility'},canonical_sha256:'a'.repeat(64),source_sha256:'b'.repeat(64),source_bytes:'42',source_revision:'c'.repeat(64)}])
 await assert.rejects(runtime.query("SELECT * FROM orgmaster.read_active_persistence_artifact_v1('orgmaster-governance.v3.json')"),error=>error.code==='42501')
 await assert.rejects(runtime.query("SELECT * FROM orgmaster.write_active_persistence_artifacts_v1('{}'::jsonb,'revision','runtime','test')"),error=>error.code==='42501')
 await assert.rejects(runtime.query("SELECT orgmaster.write_active_persistence_artifacts_with_entitlement_outbox_v1('{}'::jsonb,'revision','runtime','test','[]'::jsonb)"),error=>error.code==='42501')

 const acl=(await admin.query(`SELECT
  migrator.rolcanlogin migrator_can_login,migrator.rolsuper migrator_super,migrator.rolcreaterole migrator_create_role,
  has_schema_privilege('jenfu_orgmaster_migrator','orgmaster','USAGE') migrator_legacy_usage,
  has_schema_privilege('jenfu_orgmaster_migrator','organization','USAGE') migrator_organization_usage,
  has_schema_privilege('jenfu_orgmaster_migrator','access_governance','USAGE') migrator_access_governance_usage,
  has_schema_privilege('jenfu_orgmaster_runtime','orgmaster','USAGE') runtime_legacy_usage,
  has_function_privilege('jenfu_orgmaster_migrator','orgmaster.read_active_persistence_artifact_v1(text)','EXECUTE') migrator_reader,
  has_function_privilege('jenfu_orgmaster_migrator','orgmaster.read_active_persistence_authority_v1()','EXECUTE') migrator_authority,
  has_function_privilege('jenfu_orgmaster_migrator','orgmaster.write_active_persistence_artifacts_v1(jsonb,text,text,text)','EXECUTE') migrator_writer,
  has_function_privilege('jenfu_orgmaster_migrator','orgmaster.write_active_persistence_artifacts_with_entitlement_outbox_v1(jsonb,text,text,text,jsonb)','EXECUTE') migrator_outbox_writer,
  has_function_privilege('jenfu_orgmaster_runtime','orgmaster.read_active_persistence_artifact_v1(text)','EXECUTE') runtime_reader,
  has_function_privilege('jenfu_orgmaster_runtime','orgmaster.write_active_persistence_artifacts_v1(jsonb,text,text,text)','EXECUTE') runtime_writer,
  has_function_privilege('jenfu_orgmaster_runtime','orgmaster.write_active_persistence_artifacts_with_entitlement_outbox_v1(jsonb,text,text,text,jsonb)','EXECUTE') runtime_outbox_writer,
  has_function_privilege($1,'orgmaster.write_active_persistence_artifacts_v1(jsonb,text,text,text)','EXECUTE') login_writer,
  has_function_privilege($1,'orgmaster.write_active_persistence_artifacts_with_entitlement_outbox_v1(jsonb,text,text,text,jsonb)','EXECUTE') login_outbox_writer
  FROM pg_roles migrator WHERE migrator.rolname='jenfu_orgmaster_migrator'`,[session.session_user])).rows[0]
 assert.equal(acl.migrator_can_login,false);assert.equal(acl.migrator_super,false);assert.equal(acl.migrator_create_role,false)
 assert.equal(acl.migrator_legacy_usage,true);assert.equal(acl.migrator_organization_usage,false);assert.equal(acl.migrator_access_governance_usage,false)
 assert.equal(acl.runtime_legacy_usage,true);assert.equal(acl.migrator_reader,true);assert.equal(acl.migrator_authority,true);assert.equal(acl.migrator_writer,true)
 assert.equal(acl.migrator_outbox_writer,false);assert.equal(acl.runtime_reader,false);assert.equal(acl.runtime_writer,false);assert.equal(acl.runtime_outbox_writer,false);assert.equal(acl.login_writer,false);assert.equal(acl.login_outbox_writer,false)
 assert.deepEqual((await readLocalOwnerBootstrapFacts(admin)),coreBefore)
 const schemasAfter=await schemas(),orgBefore=schemasBefore.find(row=>row.nspname==='orgmaster'),orgAfter=schemasAfter.find(row=>row.nspname==='orgmaster')
 assert.equal(orgAfter.owner,orgBefore.owner)
 const addedOrgAcl=orgAfter.acl.filter(entry=>!orgBefore.acl.some(before=>JSON.stringify(before)===JSON.stringify(entry)))
 assert.deepEqual(addedOrgAcl,[{grantee:'jenfu_orgmaster_migrator',grantor:'postgres',privilege:'USAGE',grantable:false}])
 assert.deepEqual(orgAfter.acl.filter(entry=>!addedOrgAcl.some(added=>JSON.stringify(added)===JSON.stringify(entry))),orgBefore.acl)
 for(const name of ['organization','access_governance'])assert.deepEqual(schemasAfter.find(row=>row.nspname===name),schemasBefore.find(row=>row.nspname===name))
 assert.deepEqual((await owners()),ownersBefore)
 return {scope:'DEV070_LOCAL_PERSISTENCE_COMPATIBILITY_NATIVE_POSTGRES18',status:'PASS',cases:['071-owner-transfer-core-reader-fails-42501-before-072','baseline-runtime-direct-legacy-writers-execute','072-wrapper-abi-drift-fails-closed','runtime-core-reader-returns-active-artifact-after-072','runtime-direct-legacy-reader-denied','runtime-direct-legacy-writers-denied-after-072','exact-no-login-migrator-legacy-execute-only','no-unrelated-schema-or-owner-drift'],primaryWrites:false,claimsOfPrimaryInstallation:false}
}
