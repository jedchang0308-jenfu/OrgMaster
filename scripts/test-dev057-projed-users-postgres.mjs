import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { withAdministrationPostgresFixture, prepareAdministrationInitializationFixture, drainAdministrationFixtureEvents, createAdministrativeHumanFixture, createAdditionalAdministrationTargetFixture } from './lib/dev070-administration-postgres-fixture.mjs'

const platformRoot = process.env.ORGMASTER_DEV057_PLATFORM_ROOT ?? 'C:/VIBE CODING/Jenfu-Platform'
const projedRoot = process.env.ORGMASTER_DEV057_PROJED_ROOT
assert.ok(projedRoot, 'Explicit reviewed ProJED source root required')
const adapter = await import(pathToFileURL(resolve(platformRoot, 'scripts/lib/dev022-administration-lifecycle-fixture.mjs')).href)
let passed = 0
await withAdministrationPostgresFixture(async fixture => {
 const { admin, connect, handle } = fixture
 await admin.query('CREATE ROLE projed_owner_disposable NOLOGIN; CREATE ROLE projed_runtime_disposable LOGIN; CREATE ROLE projed_importer_disposable NOLOGIN')
 for (const name of (await readdir('db/migrations')).filter(n => /^\d{3}_.*\.sql$/.test(n) && Number(n.slice(0,3)) >= 51 && Number(n.slice(0,3)) <= 69).sort()) await admin.query(await readFile(resolve('db/migrations',name),'utf8'))
 await admin.query(`GRANT CREATE ON DATABASE "${handle.databaseName}" TO projed_owner_disposable; SET ROLE projed_owner_disposable`)
 try {
  for (const name of (await readdir(resolve(projedRoot,'db/migrations'))).filter(n => /^\d{4}_.*\.sql$/.test(n)).sort()) {
   try { await admin.query(await readFile(resolve(projedRoot,'db/migrations',name),'utf8')) }
   catch (error) { throw new Error('PROJED_MIGRATION_FAILED:'+name,{cause:error}) }
  }
 } finally { await admin.query('RESET ROLE') }
 await admin.query(await readFile('db/migrations/070_dev057_projed_user_directory.sql','utf8'))
 await admin.query(await readFile('db/migrations/071_dev057_all_user_directory.sql','utf8'))
 const runtime = await connect('orgmaster-prod-runtime@jenfu-platform-prod.iam')
 const platform = await connect('platform-prod-runtime@jenfu-platform-prod.iam')
 const projed = await connect('projed_runtime_disposable')
 const check = async (name,run) => { await run(); passed++; console.log('PASS '+name) }
 const initialization = await prepareAdministrationInitializationFixture(fixture)
 await initialization.initialize()
 await drainAdministrationFixtureEvents(fixture,adapter.createAdministrationLifecycleFixtureDispatch({database:platform,handle}))
 await adapter.initializePrincipalForAdministrationFixture({database:platform,handle,principalId:'principal-legacy'})
 const human = await createAdministrativeHumanFixture(fixture)
 const actor = {...human.actor,principalId:human.principalId}
 const manage = async command => (await runtime.query('SELECT orgmaster_core.manage_projed_user_v1($1,$2) result',[JSON.stringify(actor),command ? JSON.stringify(command) : null])).rows[0].result
 const ordinary=await createAdditionalAdministrationTargetFixture(fixture)
 await drainAdministrationFixtureEvents(fixture,adapter.createAdministrationLifecycleFixtureDispatch({database:platform,handle}))
 await adapter.initializePrincipalForAdministrationFixture({database:platform,handle,principalId:ordinary.principalId})
 const nonAdmin=await createAdministrativeHumanFixture(fixture,{principalId:ordinary.principalId})
 const id = randomUUID(), subject = 'directory-google-'+randomUUID()
 await admin.query('INSERT INTO projed_core.profiles(id,email,display_name) VALUES($1,$2,$3)',[id,'legacy-personal@example.invalid','Unregistered legacy user'])
 await admin.query('INSERT INTO projed_core.google_identity_proofs(google_subject,local_user_id) VALUES($1,$2)',[subject,id])
 await admin.query('INSERT INTO projed_core.account_authorization_guards(local_user_id,active,revision) VALUES($1,true,1)',[id])
 const actorValid=async(entry,revision)=>{
  await projed.query("SELECT set_config('projed.actor_local_user_id',$1,false),set_config('projed.actor_guard_revision',$2,false),set_config('projed.actor_principal_id','directory-principal',false),set_config('projed.actor_entry',$3,false),set_config('projed.actor_context_id',$4,false)",[id,revision,entry,randomUUID()]);
  return (await projed.query('SELECT projed_core.actor_context_valid_v1() valid')).rows[0].valid
 };
 const get = async () => (await manage()).users.find(r=>r.googleSubject===subject)
 let firstDisableCommand
 const command = (row,action) => ({commandId:randomUUID(),googleSubject:row.googleSubject,expectedRevision:row.revision,action})
 await check('optimized-directory-preserves-real-legacy-membership-and-admin-boundaries',async()=>{
  const read=async()=> (await runtime.query('SELECT orgmaster_core.read_user_directory_v1($1::jsonb) result',[JSON.stringify(actor)])).rows[0].result;
  const t=performance.now(), before=await read(), oldMs=performance.now()-t;
  await admin.query(await readFile('db/migrations/072_dev057_user_directory_optimized_grants.sql','utf8'));
  const n=performance.now(), after=await read(), newMs=performance.now()-n;
  assert.deepEqual(after,before);
  await assert.rejects(runtime.query('SELECT orgmaster_core.read_user_directory_v1($1::jsonb)',[JSON.stringify({...nonAdmin.actor,principalId:nonAdmin.principalId})]),/USER_DIRECTORY_ADMIN_REQUIRED/);
  console.log(JSON.stringify({comparison:'same-isolated-actor-data',oldMs:Math.round(oldMs),newMs:Math.round(newMs),users:after.users.length}));
 });
 await check('bulk mapping counts preserve directory, grant membership, and function boundary', async () => {
  const sql = 'SELECT orgmaster_core.read_user_directory_v1($1::jsonb) AS result';
  const bindings = [JSON.stringify(actor)];
  const grantReads = [
   ['SELECT * FROM orgmaster_contract.read_ai_pdm_principal_effective_grants_v5() ORDER BY principal_id, assignment_id', []],
   ['SELECT * FROM orgmaster_contract.read_ai_pdm_principal_effective_grants_v5($1,$2) ORDER BY principal_id, assignment_id', [human.principalId, human.actor.employeeId]],
  ];
  const boundary = async () => (await admin.query(`
   SELECT oid, proowner, proacl, prosecdef, provolatile, proconfig, prorettype
   FROM pg_proc
   WHERE oid = 'orgmaster_core.read_ai_pdm_principal_grants_v5(text,text,boolean)'::regprocedure
  `)).rows;
  const originalBoundary = await boundary();
  const originalDirectory = (await runtime.query(sql, bindings)).rows;
  const originalGrants = [];
  for (const [query, args] of grantReads) originalGrants.push((await admin.query(query, args)).rows);

  await admin.query(await readFile('db/migrations/073_dev057_bulk_principal_mapping_counts.sql','utf8'));

  assert.deepEqual(await boundary(), originalBoundary);
  assert.deepEqual((await runtime.query(sql, bindings)).rows, originalDirectory);
  for (const [index, [query, args]] of grantReads.entries()) {
   assert.deepEqual((await admin.query(query, args)).rows, originalGrants[index]);
  }
 });
 await check('legacy-account-visible-before-first-platform-enrollment-without-private-content', async () => {
  for(const entry of ['main','quick'])assert.equal(await actorValid(entry,'1'),true);
  const row=await get();assert.equal(row.identityStatus,'UNREGISTERED');assert.equal(row.enabled,true);assert.equal(row.email,'legacy-personal@example.invalid')
  assert.deepEqual(Object.keys(row).sort(),['accountId','displayName','email','enabled','externalStatus','googleSubject','identityStatus','kind','loginEligible','principalId','revision'].sort())
 })
 await check('runtime-and-consumer-cannot-bypass-owner-metadata-and-management-boundaries',async()=>{
  await assert.rejects(runtime.query('SELECT orgmaster_core.manage_projed_user_v1($1,null)',[JSON.stringify({...nonAdmin.actor,principalId:nonAdmin.principalId})]),/PROJED_USER_ADMIN_REQUIRED/)
  await assert.rejects(runtime.query('SELECT * FROM projed_core.profiles'),/permission denied/)
  await assert.rejects(runtime.query('SELECT * FROM projed_contract.read_user_directory_v1()'),/permission denied/)
  await assert.rejects(projed.query('SELECT orgmaster_core.manage_projed_user_v1(null,null)'),/permission denied/)
  await assert.rejects(runtime.query("SELECT orgmaster_core.manage_projed_user_v1('{}',null)"),/IDENTITY_CONTEXT_REQUIRED/)
  await assert.rejects(runtime.query('SELECT orgmaster_core.manage_projed_user_v1($1,null)',[JSON.stringify({...actor,principalAuthEpoch:actor.principalAuthEpoch+1})]),/IDENTITY_CONTEXT_REQUIRED/)
 })
 await check('disable-before-first-login-atomic-replay-and-cas',async()=>{
  const before=await get(),disable=command(before,'disable');firstDisableCommand=disable;const result=await manage(disable)
  assert.equal((await get()).enabled,false);assert.equal((await get()).revision,'2:0');
  for(const entry of ['main','quick'])assert.equal(await actorValid(entry,'1'),false)
  assert.deepEqual(await manage(disable),result)
  assert.equal((await get()).revision,'2:0')
  await assert.rejects(manage({...disable,commandId:randomUUID()}),/PROJED_USER_CONFLICT/)
  await assert.rejects(manage({...disable,action:'restore'}),/PROJED_USER_CONFLICT/)
  assert.equal((await admin.query('SELECT count(*) count FROM orgmaster_core.projed_user_commands_v1')).rows[0].count,'1')
 })
 await check('restore-advances-fence-and-never-revives-the-original-session',async()=>{
  await manage(command(await get(),'restore'));assert.equal((await get()).enabled,true);assert.equal((await get()).revision,'3:0')
  for(const entry of ['main','quick']){assert.equal(await actorValid(entry,'1'),false);assert.equal(await actorValid(entry,'3'),true)}
  const latest=await manage();assert.deepEqual(await manage(firstDisableCommand),latest);assert.equal((await get()).revision,'3:0')
 })
 let publication
 await check('first-enrollment-and-admin-command-use-the-same-subject-fence',async()=>{
  const before=await get(),second=await connect('orgmaster-prod-runtime@jenfu-platform-prod.iam')
  const pid=(await second.query('SELECT pg_backend_pid() pid')).rows[0].pid
  await runtime.query('BEGIN')
  try {
   publication=(await runtime.query('SELECT orgmaster_core.enroll_projed_principal_v1($1,$2,$3,$4,$5) result',[randomUUID(),'https://securetoken.google.com/directory-fixture',randomUUID(),subject,new Date().toISOString()])).rows[0].result
   const pending=second.query('SELECT orgmaster_core.manage_projed_user_v1($1,$2)',[JSON.stringify(actor),JSON.stringify(command(before,'disable'))])
   const result=assert.rejects(pending,/PROJED_USER_CONFLICT/)
   let waiting=false
   for(let n=0;n<50;n++){
    waiting=(await admin.query("SELECT wait_event='advisory' waiting FROM pg_stat_activity WHERE pid=$1",[pid])).rows[0]?.waiting===true
    if(waiting)break
    await new Promise(resolve=>setTimeout(resolve,20))
   }
   assert.equal(waiting,true,'admin command waits for the actual enrollment subject lock')
   await runtime.query('COMMIT');await result
   assert.equal((await get()).enabled,true)
  } finally {await runtime.query('ROLLBACK')}
 })
 await check('registered-personal-and-bound-external-records-share-one-account',async()=>{
  assert.equal((await get()).principalId,publication.principalId);assert.equal((await get()).identityStatus,'ACTIVE')
  const request={contractVersion:'orgmaster.projed-external-qualification.v1',action:'submit',requestId:randomUUID(),invitationId:randomUUID(),inviterPrincipalId:human.principalId,boardId:'private-board-reference',role:'member',expiresAt:new Date(Date.now()+3600000).toISOString(),contactEmail:'legacy-personal@example.invalid',company:'',note:''}
  await runtime.query('SELECT orgmaster_core.notify_projed_external_request_v1($1)',[JSON.stringify(request)])
  await runtime.query('SELECT orgmaster_core.notify_projed_external_request_v1($1)',[JSON.stringify({contractVersion:request.contractVersion,action:'bind',requestId:request.requestId,principalId:publication.principalId,googleSubject:subject})])
  assert.equal((await get()).kind,'external');assert.equal((await manage()).users.filter(r=>r.googleSubject===subject).length,1)
  assert.ok(!JSON.stringify(await get()).includes('private-board-reference'))
  await admin.query("UPDATE orgmaster_core.projed_external_requests_v1 SET status='INACTIVE' WHERE request_id=$1",[request.requestId])
 })
 await check('concurrent-operators-cannot-overwrite-a-newer-status',async()=>{
  const other=await connect('orgmaster-prod-runtime@jenfu-platform-prod.iam');const row=await get();const first=command(row,'disable'),second=command(row,'disable');
  const results=await Promise.allSettled([manage(first),other.query('SELECT orgmaster_core.manage_projed_user_v1($1,$2)',[JSON.stringify(actor),JSON.stringify(second)])]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected' && /PROJED_USER_CONFLICT/.test(r.reason.message)).length,1);
  await manage(command(await get(),'restore'));
 })
 await check('restore-does-not-reapprove-external-access-or-delete-private-data',async()=>{
  await admin.query("UPDATE orgmaster_core.projed_principal_admissions SET status='inactive' WHERE principal_id=$1",[publication.principalId])
  assert.equal((await get()).enabled,false)
  await manage(command(await get(),'restore'))
  assert.equal((await get()).enabled,true);assert.equal((await get()).externalStatus,'INACTIVE')
  assert.equal((await admin.query('SELECT count(*) count FROM projed_core.profiles WHERE id=$1',[id])).rows[0].count,'1')
 })
 await check('rollback-preserves-account-guard-and-audit',async()=>{
  const before=await get();await runtime.query('BEGIN');await manage(command(before,'disable'));await runtime.query('ROLLBACK');assert.deepEqual(await get(),before)
 })
 const allUsers=async(context=actor)=>(await runtime.query('SELECT orgmaster_core.read_user_directory_v1($1::jsonb) result',[JSON.stringify(context)])).rows[0].result
 await check('all-user-reader-denies-nonadmin-forged-epoch-and-sibling-runtime',async()=>{
  await assert.rejects(allUsers({...nonAdmin.actor,principalId:nonAdmin.principalId}),/USER_DIRECTORY_ADMIN_REQUIRED/)
  await assert.rejects(allUsers({...actor,principalAuthEpoch:actor.principalAuthEpoch+1}),/IDENTITY_CONTEXT_REQUIRED/)
  await assert.rejects(projed.query('SELECT orgmaster_core.read_user_directory_v1(null)'),/permission denied/)
 })
 await check('all-users-classify-current-employees-and-nonemployees-and-merge-only-exact-principal',async()=>{
  const directory=await allUsers();assert.equal(directory.contractVersion,'orgmaster.users.v1')
  assert.equal(directory.users.find(row=>row.principalId===actor.principalId).kind,'employee')
  const personal=directory.users.filter(row=>row.principalId===publication.principalId)
  assert.equal(personal.length,1);assert.equal(personal[0].kind,'nonemployee');assert.equal(personal[0].systems.filter(app=>app.applicationId==='projed').length,1)
  assert.equal(directory.users.find(row=>row.principalId===actor.principalId).systems.find(app=>app.applicationId==='orgmaster').status,'ELIGIBLE')
  assert.ok(directory.systems.every(app=>app.state==='READY'));assert.equal(directory.systems.length,4)
  assert.ok(!JSON.stringify(directory).includes('private-board-reference'))
  assert.deepEqual(Object.keys(personal[0]).sort(),['id','principalId','email','displayName','kind','systems'].sort())
 })
 await check('duplicate-email-before-enrollment-remains-a-distinct-nonemployee',async()=>{
  await admin.query('BEGIN')
  try {
   const duplicate=randomUUID();await admin.query('INSERT INTO projed_core.profiles(id,email,display_name) VALUES($1,$2,$3)',[duplicate,'legacy-personal@example.invalid','Separate Google identity'])
   await admin.query('INSERT INTO projed_core.google_identity_proofs(google_subject,local_user_id) VALUES($1,$2)',['same-email-distinct-subject',duplicate])
   await admin.query('INSERT INTO projed_core.account_authorization_guards(local_user_id,active,revision) VALUES($1,true,1)',[duplicate])
   const data=(await admin.query('SELECT orgmaster_core.read_user_directory_v1($1::jsonb) result',[JSON.stringify(actor)])).rows[0].result
   const rows=data.users.filter(row=>row.email==='legacy-personal@example.invalid');assert.equal(rows.length,2)
   assert.equal(rows.find(row=>row.id==='projed:same-email-distinct-subject').kind,'nonemployee')
  } finally {await admin.query('ROLLBACK')}
 })
 await check('missing-ProJED-contract-retains-other-systems-and-does-not-fabricate-denials',async()=>{
  await admin.query('BEGIN')
  try {
   await admin.query('ALTER FUNCTION orgmaster_core.projed_user_directory_v1() RENAME TO directory_unavailable_fixture')
   await admin.query('DISCARD PLANS')
   const data=(await admin.query('SELECT orgmaster_core.read_user_directory_v1($1::jsonb) result',[JSON.stringify(actor)])).rows[0].result
   assert.equal(data.systems.find(app=>app.applicationId==='projed').state,'UNAVAILABLE')
   assert.ok(data.systems.filter(app=>app.applicationId!=='projed').every(app=>app.state==='READY'))
   assert.ok(data.users.some(row=>row.principalId===actor.principalId))
   assert.ok(data.users.every(row=>row.systems.every(app=>app.applicationId!=='projed')))
  } finally {await admin.query('ROLLBACK')}
 })
},{platformRoot})
console.log(JSON.stringify({status:'PASS',scope:'ISOLATED_SYNTHETIC_CROSS_OWNER_CONTRACTS',checks:passed,cleanup:'task-owned manager completed'}))
