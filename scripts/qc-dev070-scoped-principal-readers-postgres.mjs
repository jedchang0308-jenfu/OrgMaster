import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { withAdministrationPostgresFixture } from './lib/dev070-administration-postgres-fixture.mjs'

// The existing manager creates and fingerprints loopback-only disposable
// clusters. No caller-selected connection string or persistent DB is accepted.
const migration = 'db/migrations/047_dev070_scoped_ai_pdm_principal_readers.sql'
const scalarMigration = 'db/migrations/048_dev070_governance_scalar_projection.sql'
const managerMigration = 'db/migrations/049_dev070_scoped_pdm_role_policy_manager.sql'
const platformRoot = process.env.DEV070_PLATFORM_FIXTURE_ROOT ?? 'C:/VIBE CODING/Jenfu-Platform'
const binding = {catalogVersion:'fixture-admin-v1',contentSha256:'a'.repeat(64),
 stableRoleId:'role-application-system-admin',roleDefinitionHash:'b'.repeat(64)}
const future = '2099-01-01T00:00:00.000Z', past = '2000-01-01T00:00:00.000Z'
const principal = 'principal-legacy', employee = 'employee-legacy'

await withAdministrationPostgresFixture(async ({admin,handle,connect})=>{
 await admin.query('SET jit=off')
 const version=(await admin.query('SHOW server_version')).rows[0].server_version
 console.log(JSON.stringify({scope:'DISPOSABLE_ONLY',version,jit:'off',pid:handle.process.pid,
  port:handle.port,database:handle.databaseName,productionReleaseAuthority:false}))
 await admin.query(`CREATE VIEW ai_pdm_contract.v_application_role_catalog_v3 AS
  SELECT 'role-application-system-admin'::text stable_role_id,'application_system_admin'::text role_code,
  repeat('b',64) role_definition_hash,'active'::text role_status,'principal'::text subject_kind,false assignable;
  CREATE VIEW ai_pdm_contract.v_role_policy_publications_v1 AS
  SELECT 'fixture-admin-v1'::text catalog_version,repeat('a',64) catalog_sha256,
  'role-application-system-admin'::text stable_role_id,repeat('b',64) role_definition_hash;
  GRANT USAGE ON SCHEMA ai_pdm_contract TO jenfu_orgmaster_migrator;
  GRANT SELECT ON ai_pdm_contract.v_application_role_catalog_v3,
   ai_pdm_contract.v_role_policy_publications_v1 TO jenfu_orgmaster_migrator`)
 const base=(await admin.query(`SELECT artifact.payload FROM orgmaster_core.persistence_artifacts artifact
  JOIN orgmaster_core.persistence_authority authority ON artifact.batch_id=authority.active_batch_id
  WHERE artifact.artifact_key='orgmaster-governance.v3.json'`)).rows[0].payload
 const publication=d=>d.publishedVersions.find(v=>v.id===d.activePolicyVersionId)
 const legacyIdentity=publication(base).policy.identityLinks[0]
 const managedPrincipal='principal-managed:d1400000-0140-4000-8000-000000000001'
 const managedEmployee='employee-capacity-0001'
 const store=async d=>{
  // Corrupt-policy fixtures must reach the reader. Only this named trigger in
  // this task-owned cluster is suspended during injection, then restored before
  // every observation; the outer transaction rolls the entire case back.
  await admin.query('ALTER TABLE orgmaster_core.persistence_artifacts DISABLE TRIGGER administration_artifact_fence')
  try {await admin.query(`UPDATE orgmaster_core.persistence_artifacts SET payload=$1::jsonb
   WHERE batch_id=(SELECT active_batch_id FROM orgmaster_core.persistence_authority WHERE singleton)
     AND artifact_key='orgmaster-governance.v3.json'`,[JSON.stringify(d)])}
  finally {await admin.query('ALTER TABLE orgmaster_core.persistence_artifacts ENABLE TRIGGER administration_artifact_fence')}
 }
 const adminGrant=(overrides={})=>({id:'00000000-0000-4000-8000-000000000047',principalId:principal,
  employeeId:employee,roleCode:'application_system_admin',applicationId:'ai-pdm',subjectKind:'principal',
  basis:'manual',scope:{kind:'global'},status:'active',validFrom:past,validTo:null,
  createdBy:{kind:'owner_workload',id:'disposable-fixture'},reason:'Isolated scoped reader test',
  catalogBinding:binding,...overrides})
 const withAdmin=(d,grants=[adminGrant()])=>{publication(d).policy.administration={
  contractVersion:'orgmaster.administration-policy.v1',version:1,
  initializedByCommandId:'00000000-0000-4000-8000-000000000001',grants}}
 const queries=[
  {name:'accounts',params:[principal],old:'SELECT * FROM orgmaster_contract.v_active_principal_accounts_v1 WHERE principal_id=$1',
   scoped:'SELECT * FROM orgmaster_contract.read_ai_pdm_active_principal_accounts_v1($1)'},
  {name:'unknown-accounts',params:['absent-principal'],old:'SELECT * FROM orgmaster_contract.v_active_principal_accounts_v1 WHERE principal_id=$1',
   scoped:'SELECT * FROM orgmaster_contract.read_ai_pdm_active_principal_accounts_v1($1)'},
  {name:'grants',params:[principal,employee],old:'SELECT * FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v5 WHERE principal_id=$1 AND employee_id=$2',
   scoped:'SELECT * FROM orgmaster_contract.read_ai_pdm_principal_effective_grants_v5($1,$2)'},
  {name:'unknown-grants',params:['absent-principal','absent-employee'],old:'SELECT * FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v5 WHERE principal_id=$1 AND employee_id=$2',
   scoped:'SELECT * FROM orgmaster_contract.read_ai_pdm_principal_effective_grants_v5($1,$2)'},
  {name:'null-grants',params:[null,null],old:'SELECT * FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v5 WHERE principal_id=$1 AND employee_id=$2',
   scoped:'SELECT * FROM orgmaster_contract.read_ai_pdm_principal_effective_grants_v5($1,$2)'},
  {name:'identity',params:[legacyIdentity.issuer,legacyIdentity.subject],
   old:'SELECT * FROM orgmaster_contract.v_active_principal_accounts_v1 WHERE principal_issuer=$1 AND principal_subject=$2',
   scoped:'SELECT * FROM orgmaster_contract.read_ai_pdm_active_principal_identity_v1($1,$2)'},
  {name:'managed-account',params:[managedPrincipal],old:'SELECT * FROM orgmaster_contract.v_active_principal_accounts_v1 WHERE principal_id=$1',
   scoped:'SELECT * FROM orgmaster_contract.read_ai_pdm_active_principal_accounts_v1($1)'},
  {name:'managed-grants',params:[managedPrincipal,managedEmployee],old:'SELECT * FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v5 WHERE principal_id=$1 AND employee_id=$2',
   scoped:'SELECT * FROM orgmaster_contract.read_ai_pdm_principal_effective_grants_v5($1,$2)'}
 ]
 const publicationCases=[
  {name:'publication-active-id-null',edit:d=>{d.activePolicyVersionId=null}},
  {name:'publication-active-id-missing',edit:d=>{delete d.activePolicyVersionId}},
  {name:'publication-active-id-unresolved',edit:d=>{d.activePolicyVersionId='no-such-publication'}},
  {name:'publication-active-duplicate',edit:d=>{d.publishedVersions.push(structuredClone(publication(d)))}},
  {name:'publication-array-invalid',edit:d=>{d.publishedVersions={invalid:true}}},
 ]
 const positionAdoption=d=>{
  const assignment=publication(d).policy.roleAssignments.find(g=>g.applicationId==='ai-pdm')
  assignment.basis='position_adoption'
  assignment.sources=[{positionId:'position-scoped-fixture',positionAssignmentId:'position-assignment-scoped-fixture',
   scopeSource:'jenfu_workspace',scopeKeySnapshot:assignment.scope.value}]
 }
 const positionWorkspace=expired=>admin.query(`UPDATE orgmaster_core.persistence_artifacts artifact
  SET payload=jsonb_set(jsonb_set(payload,'{state,positions}',$1::jsonb),'{state,assignments}',$2::jsonb)
  WHERE batch_id=(SELECT active_batch_id FROM orgmaster_core.persistence_authority WHERE singleton)
   AND artifact_key='orgmaster-versions/'||(SELECT manifest.payload->>'currentVersionId'
    FROM orgmaster_core.persistence_artifacts manifest
    WHERE manifest.batch_id=artifact.batch_id AND manifest.artifact_key='orgmaster-workspace.v1.json')||'.json'`,
  [JSON.stringify([{id:'position-scoped-fixture',status:'active'}]),
   JSON.stringify([{id:'position-assignment-scoped-fixture',positionId:'position-scoped-fixture',employeeId:employee,
    validFrom:past,validTo:expired?'2001-01-01T00:00:00.000Z':null}])])
 const cases=[
  {name:'active-legacy'},
  {name:'active-administrator',edit:d=>withAdmin(d)},
  {name:'revoked-administrator',edit:d=>withAdmin(d,[adminGrant({status:'revoked'})])},
  {name:'expired-administrator',edit:d=>withAdmin(d,[adminGrant({validTo:'2001-01-01T00:00:00.000Z'})])},
  {name:'future-administrator',edit:d=>withAdmin(d,[adminGrant({validFrom:future})])},
  {name:'catalog-drift',edit:d=>withAdmin(d,[adminGrant({catalogBinding:{...binding,contentSha256:'c'.repeat(64)}})])},
  {name:'no-grants',edit:d=>{publication(d).policy.roleAssignments=[];publication(d).policy.roleDelegations=[]}},
  {name:'expired-legacy',edit:d=>{for(const grant of publication(d).policy.roleAssignments)grant.validTo='2001-01-01T00:00:00.000Z'}},
  {name:'revoked-legacy',edit:d=>{for(const grant of publication(d).policy.roleAssignments)grant.status='revoked'}},
  {name:'disabled-identity',edit:d=>{for(const link of publication(d).policy.identityLinks)link.status='inactive'}},
  {name:'missing-admission',edit:d=>{publication(d).policy.principalAdmissions=[]}},
  {name:'duplicate-alias',edit:d=>{const p=publication(d).policy;p.identityLinks.push({...p.identityLinks[0]})}},
  {name:'ambiguous-employee',edit:d=>{const p=publication(d).policy,link={...p.identityLinks[0],id:'ambiguous-link',subject:'ambiguous-subject',employeeId:'employee-two'};
   p.identityLinks.push(link);p.principalAdmissions.push({...p.principalAdmissions[0],identityLinkId:link.id})}},
  {name:'unrelated-invalid-administration',edit:d=>withAdmin(d,[adminGrant({principalId:'unrelated',employeeId:'unrelated',basis:'invalid'})])},
  {name:'unrelated-duplicate-id',edit:d=>withAdmin(d,[adminGrant(),adminGrant({principalId:'unrelated',employeeId:'unrelated'})])},
  {name:'global-invalid-catalog',edit:d=>withAdmin(d,[adminGrant({catalogBinding:{...binding,contentSha256:'invalid'}})])},
  {name:'unrelated-eligible-catalog-unavailable',
   edit:d=>withAdmin(d,[adminGrant({principalId:managedPrincipal,employeeId:managedEmployee})]),
   sql:async()=>{
    await admin.query(`CREATE FUNCTION ai_pdm_contract.scoped_fixture_catalog_failure() RETURNS text
     LANGUAGE plpgsql AS $f$ BEGIN RAISE EXCEPTION 'SCOPED_CATALOG_UNAVAILABLE'; END; $f$;
     CREATE OR REPLACE VIEW ai_pdm_contract.v_application_role_catalog_v3 AS
     SELECT 'role-application-system-admin'::text stable_role_id,'application_system_admin'::text role_code,
     ai_pdm_contract.scoped_fixture_catalog_failure() role_definition_hash,
     'active'::text role_status,'principal'::text subject_kind,false assignable`)
   }},
  {name:'delegation',edit:d=>{
   const p=publication(d).policy,source=p.roleAssignments.find(g=>g.applicationId==='ai-pdm')
   p.roleDelegations=[{id:'delegation-fixture',sourceAssignmentId:source.id,fromEmployeeId:employee,
    toEmployeeId:managedEmployee,roleId:source.roleId,catalogVersion:source.catalogVersion,
    scope:source.scope,status:'active',validFrom:past,validTo:future}]
  }},
  {name:'position-adoption-valid',edit:positionAdoption,sql:()=>positionWorkspace(false)},
  {name:'position-adoption-expired-assignment',edit:positionAdoption,sql:()=>positionWorkspace(true)},
  {name:'managed-admission-disabled',sql:()=>admin.query('UPDATE orgmaster_core.managed_identity_admission_authority SET admission_enabled=false')},
  {name:'managed-directory-suspended',sql:()=>admin.query(`UPDATE orgmaster_core.managed_identity_observations
   SET directory_state='suspended' WHERE identity_record_id=(SELECT identity_record_id
   FROM orgmaster_core.managed_daily_identities WHERE principal_id=$1)`,[managedPrincipal])},
  {name:'inactive-employee',sql:()=>admin.query(`UPDATE orgmaster_core.persistence_artifacts artifact SET payload=
   jsonb_set(payload,'{state,employees}',(SELECT jsonb_agg(CASE WHEN value->>'id'=$1
    THEN jsonb_set(value,'{status}','"inactive"'::jsonb) ELSE value END)
    FROM jsonb_array_elements(payload#>'{state,employees}')))
   WHERE batch_id=(SELECT active_batch_id FROM orgmaster_core.persistence_authority WHERE singleton)
    AND artifact_kind='workspace-version' AND payload->>'kind'='document'`,[employee])},
  {name:'pending-lifecycle',sql:async()=>{
   await admin.query(`INSERT INTO orgmaster_core.principal_lifecycle_events_v2
    (event_id,operation_id,source_revision,originating_principal_id,reason_code,snapshot_text,snapshot_hash)
    VALUES('00000000-0000-4000-8000-000000000048','scoped-fixture-event','scoped-fixture',
      'principal-legacy','reader-regression',$1,encode(public.digest($1,'sha256'),'hex'))`,
    [JSON.stringify({principals:[{principalId:principal,employeeId:employee,accountType:'human_personal',
     pairs:[{issuer:'issuer-legacy',subject:'subject-legacy'}]}]})])
   await admin.query("INSERT INTO orgmaster_core.principal_lifecycle_delivery_v2(event_id) VALUES('00000000-0000-4000-8000-000000000048')")
  }}
 ]
 const observe=async(sql,params)=>{
  await admin.query('SAVEPOINT observation')
  try {return {rows:(await admin.query(`SELECT to_jsonb(row) value FROM (${sql}) row`,params)).rows.map(r=>r.value)}}
  catch(error){return {error:error.code,message:error.message}}
  finally {await admin.query('ROLLBACK TO SAVEPOINT observation')}
 }
 const baseline=new Map(),plans=[],phaseResults=[],publication047Oracle=new Map()
 const literalResult=result=>result.error?{error:result.error,message:result.message}:{rows:result.rows.map(row=>JSON.stringify(row,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value)).sort()}
 let nullValidationChecks=0,exactComparisons=0,literal047Comparisons=0
 async function runPhase(phase){
  const summary={phase,originalCases:cases.length,originalComparisons:0,originalNullValidationChecks:0,publicationCases:publicationCases.length,publicationComparisons:0,publicationNullValidationChecks:0}
  for(const c of [...cases,...publicationCases]){
   const edge=publicationCases.includes(c)
   await admin.query('BEGIN')
   try {
    const d=structuredClone(base);c.edit?.(d);await store(d);await c.sql?.()
    for(const q of queries){
     const key=`${c.name}:${q.name}`
     if(phase==='baseline'){
      const result=await observe(q.old,q.params);baseline.set(key,result)
      if(c.name==='active-legacy'&&['accounts','identity','managed-account','grants'].includes(q.name))assert.equal(result.rows?.length,1,key)
      if(c.name==='active-administrator'&&q.name==='grants')assert.equal(result.rows?.length,2,key)
      if(c.name==='delegation'&&q.name==='managed-grants')assert.equal(result.rows?.length,1,key)
      if(c.name==='position-adoption-valid'&&q.name==='grants'){
       assert.equal(result.rows?.length,1,key)
       assert.equal(result.rows[0].scope_kind,'workspace',key)
       assert.equal(result.rows[0].scope_key,'company-jenfu',key)
      }
      if(c.name==='position-adoption-expired-assignment'&&q.name==='grants')assert.equal(result.rows?.length,0,key)
      if(c.name==='pending-lifecycle'&&q.name==='accounts')assert.equal(result.rows?.length,0,key)
      continue
     }
     for(const [abi,sql] of [['scoped',q.scoped],['legacy',q.old]]){
      const actual=await observe(sql,q.params),expected=baseline.get(key)
      if(edge&&phase==='scoped')publication047Oracle.set(`${key}:${abi}`,structuredClone(actual))
      if(edge&&phase==='scalar'){
       const prior=publication047Oracle.get(`${key}:${abi}`)
       assert.ok(prior,`${key}:${abi} published047 oracle missing`)
       assert.deepEqual(literalResult(actual),literalResult(prior),`${key}:${abi} literal047 rows/error`)
       literal047Comparisons++
      }
      if(q.name==='null-grants'&&abi==='scoped'&&!expected.error&&actual.error){
       // SQL NULL equality can suppress the original SRF entirely. The typed
       // API deliberately still enforces complete publication validation.
       const global=baseline.get(`${c.name}:unknown-grants`)
       assert.equal(actual.error,global.error)
       assert.equal(actual.message,global.message)
       nullValidationChecks++
       summary[edge?'publicationNullValidationChecks':'originalNullValidationChecks']++
       continue
      }
      assert.equal(actual.error,expected.error,`${key}:${abi} error code`)
      if(expected.error){assert.equal(actual.message,expected.message,`${key}:${abi} error`);exactComparisons++;summary[edge?'publicationComparisons':'originalComparisons']++;continue}
      const n=q.params.length+1
      const diff=await admin.query(`WITH actual AS (SELECT to_jsonb(row) value FROM (${sql}) row),
       expected AS (SELECT value FROM jsonb_array_elements($${n}::jsonb)),
       differences AS ((SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
        UNION ALL (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)) SELECT count(*)::int count FROM differences`,
       [...q.params,JSON.stringify(expected.rows)])
      assert.equal(diff.rows[0].count,0,`${key}:${abi} EXCEPT ALL`)
      exactComparisons++
      summary[edge?'publicationComparisons':'originalComparisons']++
     }
    }
   } finally {await admin.query('ROLLBACK')}
  }
  if(phase!=='baseline'){
   assert.equal(summary.originalComparisons,380)
   assert.equal(summary.originalNullValidationChecks,4)
   phaseResults.push(summary)
  }
  const sql=phase==='baseline'?queries[2].old:queries[2].scoped
  for(const [abi,query] of phase==='baseline'?[['original',sql]]:[['scoped',sql],['legacy',queries[2].old]]){
   const plan=(await admin.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${query}`,[principal,employee])).rows[0]['QUERY PLAN'][0]
   const nodes=[];const visit=n=>{nodes.push({node:n['Node Type'],rows:n['Actual Rows'],loops:n['Actual Loops'],removed:n['Rows Removed by Filter']??0,sharedHits:n['Shared Hit Blocks']??0});for(const child of n.Plans??[])visit(child)};visit(plan.Plan)
   plans.push({phase,abi,executionMs:plan['Execution Time'],planningMs:plan['Planning Time'],nodes})
  }
 }
 await runPhase('baseline')
 await admin.query(await readFile(migration,'utf8'))
 await runPhase('scoped')
 const signatures=['orgmaster_core.read_administration_publication_v1()',
  'orgmaster_core.read_ai_pdm_principal_accounts_v1(text,text,text,boolean)',
  'orgmaster_core.read_ai_pdm_principal_grants_v5(text,text,boolean)',
  'orgmaster_contract.read_ai_pdm_active_principal_accounts_v1(text)',
  'orgmaster_contract.read_ai_pdm_active_principal_identity_v1(text,text)',
  'orgmaster_contract.read_ai_pdm_principal_effective_grants_v5(text,text)',
  'orgmaster_contract.read_ai_pdm_principal_effective_grants_v5()',
  'orgmaster_contract.ai_pdm_role_policy_manager_eligible_v2(text,text,text,text)']
 const functionFacts=async()=>(await admin.query(`SELECT p.oid::regprocedure::text identity,
  p.proowner::regrole::text owner,p.proacl::text acl,p.prosecdef security_definer,
  p.provolatile volatility,p.proisstrict strict,p.proparallel parallel,p.proconfig config,
  pg_get_function_arguments(p.oid) arguments,pg_get_function_result(p.oid) result,
  p.proretset returns_set,l.lanname language,p.prosrc body
  FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
  WHERE p.oid=ANY($1::regprocedure[]) ORDER BY 1`,[signatures])).rows
 const beforeFunctions=await functionFacts()
 assert.equal(beforeFunctions.length,signatures.length)
 await admin.query(await readFile(scalarMigration,'utf8'))
 const afterFunctions=await functionFacts()
 const metadata=rows=>rows.map(({body,...facts})=>facts)
 assert.deepEqual(metadata(afterFunctions),metadata(beforeFunctions),'048 owner/ACL/config/signature/default/security drift')
 const changedFunctions=afterFunctions.filter(after=>after.body!==beforeFunctions.find(before=>before.identity===after.identity).body).map(row=>row.identity).sort()
 assert.deepEqual(changedFunctions,[signatures[0],signatures[1]].sort(),'048 changes exactly two helper bodies')
 await runPhase('scalar')
 assert.equal(publication047Oracle.size,publicationCases.length*queries.length*2)
 assert.equal(literal047Comparisons,publication047Oracle.size)
 for(const [fn,types] of [['read_ai_pdm_active_principal_accounts_v1','text'],['read_ai_pdm_active_principal_identity_v1','text,text'],['read_ai_pdm_principal_effective_grants_v5','text,text']]){
  const acl=(await admin.query(`SELECT has_function_privilege('jenfu_ai_pdm_runtime',$1,'EXECUTE') pdm,
   has_function_privilege('jenfu_platform_runtime',$1,'EXECUTE') platform,
   has_function_privilege('fms_runtime',$1,'EXECUTE') fms`,[`orgmaster_contract.${fn}(${types})`])).rows[0]
  assert.deepEqual(acl,{pdm:true,platform:false,fms:false})
 }
 assert.equal((await admin.query(`SELECT has_function_privilege('jenfu_ai_pdm_runtime',
  'orgmaster_core.read_ai_pdm_principal_grants_v5(text,text,boolean)','EXECUTE') allowed`)).rows[0].allowed,false)

 const managerSql='SELECT orgmaster_contract.ai_pdm_role_policy_manager_eligible_v2($1,$2,$3,$4) AS eligible'
 const managerArgs=[principal,employee,legacyIdentity.issuer,legacyIdentity.subject]
 const choose=name=>cases.find(c=>c.name===name)
 const legacyManager=d=>{
  const policy=publication(d).policy
  const assignment=policy.roleAssignments.find(g=>g.applicationId==='ai-pdm')
  Object.assign(assignment,{roleId:'role-system-admin',roleCodeSnapshot:'system_admin',
   subjectKind:'principal',targetPrincipalId:principal,scope:{kind:'global'}})
  policy.principalAdmissions.find(a=>a.identityLinkId===legacyIdentity.id).accountType='human_privileged'
 }
 // The ordinary fixture has only the RD v1 role. Add the narrow legacy
 // protected role projection used by the manager's compatibility branch.
 const legacyDefinition=(await admin.query("SELECT pg_get_viewdef('ai_pdm_contract.v_application_role_catalog_v1'::regclass) AS definition")).rows[0].definition.replace(/;\s*$/u,'')
 await admin.query('CREATE OR REPLACE VIEW ai_pdm_contract.v_application_role_catalog_v1 AS '+legacyDefinition+
  " UNION ALL SELECT contract_version, application_id, catalog_version, published_at, catalog_sha256,"+
  " 1, 'role-system-admin', 'system_admin', 'Legacy system administrator fixture', true, 'critical',"+
  " 'principal', false, false, '{\"global\":true}'::jsonb, 'standard', permissions, metadata, role_definition_hash"+
  " FROM ("+legacyDefinition+") rd")
 const managerCases=[
  ...['active-legacy','active-administrator','revoked-administrator','expired-administrator','catalog-drift',
   'disabled-identity','pending-lifecycle'].map(name=>({...choose(name),expected:name==='active-administrator'})),
  ...['unrelated-invalid-administration','unrelated-eligible-catalog-unavailable'].map(name=>({...choose(name),
   expected:{error:'P0001',message:name==='unrelated-invalid-administration'?'ADMINISTRATION_DEPENDENCY_UNAVAILABLE':'SCOPED_CATALOG_UNAVAILABLE'}})),
  {name:'root-only',edit:d=>withAdmin(d,[adminGrant({roleCode:'platform_super_admin',applicationId:null,
   scope:{kind:'platform'},catalogBinding:null})]),expected:false},
  {name:'wrong-employee',edit:d=>withAdmin(d),params:[principal,'employee-two',...managerArgs.slice(2)],expected:false},
  {name:'wrong-alias',edit:d=>withAdmin(d),params:[...managerArgs.slice(0,3),'wrong-subject'],expected:false},
  {name:'null-principal',edit:d=>withAdmin(d),params:[null,...managerArgs.slice(1)],expected:false},
  {name:'legacy-privileged',edit:legacyManager,expected:true},
  {name:'legacy-personal',edit:d=>{legacyManager(d);publication(d).policy.principalAdmissions[0].accountType='human_personal'},expected:false},
  {name:'legacy-wrong-scope',edit:d=>{legacyManager(d);publication(d).policy.roleAssignments.find(g=>g.applicationId==='ai-pdm').scope={kind:'workspace',value:'company-jenfu'}},expected:false},
 ]
 const managerRead=async()=>{
  const observations={}
  for(const c of managerCases){
   await admin.query('BEGIN')
   try {
    const d=structuredClone(base);c.edit?.(d);await store(d);await c.sql?.()
    await admin.query("SET LOCAL ROLE jenfu_ai_pdm_runtime; SET LOCAL statement_timeout='5s'")
    const observation=await observe(managerSql,c.params??managerArgs)
    observations[c.name]=observation.error?observation:observation.rows[0].eligible
    assert.deepEqual(observations[c.name],c.expected,c.name)
   } finally {await admin.query('ROLLBACK')}
  }
  await admin.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  try {
   await admin.query("SET LOCAL ROLE jenfu_ai_pdm_runtime; SET LOCAL statement_timeout='5s'")
   const executionMs=[]
   for(let i=0;i<4;i++){
    const plan=(await admin.query('EXPLAIN (ANALYZE, FORMAT JSON) '+managerSql,managerArgs)).rows[0]['QUERY PLAN'][0]
    if(i>0)executionMs.push(plan['Execution Time'])
   }
   return {observations,executionMs}
  } finally {await admin.query('ROLLBACK')}
 }
 const managerBefore=await managerRead()
 await admin.query(await readFile(managerMigration,'utf8'))
 const managerAfterFunctions=await functionFacts()
 assert.deepEqual(metadata(managerAfterFunctions),metadata(afterFunctions),'049 owner/ACL/config/signature/default/security drift')
 assert.deepEqual(managerAfterFunctions.filter(after=>after.body!==afterFunctions.find(before=>before.identity===after.identity).body)
  .map(row=>row.identity),[signatures.at(-1)],'049 changes only the manager eligibility body')
 const managerAfter=await managerRead()
 assert.deepEqual(managerAfter.observations,managerBefore.observations,'049 manager eligibility compared to literal installed 048')
 const managerAcl=(await admin.query("SELECT has_function_privilege('jenfu_ai_pdm_runtime',$1,'EXECUTE') AS pdm,"+
  " has_function_privilege('jenfu_ai_pdm_migrator',$1,'EXECUTE') AS pdm_migrator,"+
  " has_function_privilege('jenfu_platform_runtime',$1,'EXECUTE') AS platform,"+
  " has_function_privilege('fms_runtime',$1,'EXECUTE') AS fms",[signatures.at(-1)])).rows[0]
 assert.deepEqual(managerAcl,{pdm:true,pdm_migrator:true,platform:false,fms:false})
 console.log(JSON.stringify({status:'PASS',cases:cases.length,queriesPerCase:queries.length,
  comparisons:exactComparisons,nullValidationChecks,phaseResults,literal047Comparisons,publication047Oracle:Object.fromEntries(publication047Oracle),changedFunctions,functionMetadataInvariant:true,oracle:'PRE_MIGRATION_ROWS_AND_ERRORS_PLUS_PUBLICATION_EDGES_LITERAL_PUBLISHED047_PER_ABI',method:'BIDIRECTIONAL_EXCEPT_ALL_AND_DUPLICATE_PRESERVING_CANONICAL_ROW_MULTISET',version,jit:'off',plans,
  manager049:{before:managerBefore,after:managerAfter,acl:managerAcl},
   productionCpuConclusion:'NOT_MEASURED',productionReleaseAuthority:false}))
},{platformRoot,capacityPopulation:500,includeScopedReaders:false})
