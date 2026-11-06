import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { withAdministrationPostgresFixture } from './lib/dev070-administration-postgres-fixture.mjs'

// The existing manager creates and fingerprints loopback-only disposable
// clusters. No caller-selected connection string or persistent DB is accepted.
const migration = 'db/migrations/047_dev070_scoped_ai_pdm_principal_readers.sql'
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
 const baseline=new Map(),plans=[]
 let nullValidationChecks=0,exactComparisons=0
 async function runPhase(phase){
  for(const c of cases){
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
      if(q.name==='null-grants'&&abi==='scoped'&&!expected.error&&actual.error){
       // SQL NULL equality can suppress the original SRF entirely. The typed
       // API deliberately still enforces complete publication validation.
       const global=baseline.get(`${c.name}:unknown-grants`)
       assert.equal(actual.error,global.error)
       assert.equal(actual.message,global.message)
       nullValidationChecks++
       continue
      }
      assert.equal(actual.error,expected.error,`${key}:${abi} error code`)
      if(expected.error){assert.equal(actual.message,expected.message,`${key}:${abi} error`);exactComparisons++;continue}
      const n=q.params.length+1
      const diff=await admin.query(`WITH actual AS (SELECT to_jsonb(row) value FROM (${sql}) row),
       expected AS (SELECT value FROM jsonb_array_elements($${n}::jsonb)),
       differences AS ((SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
        UNION ALL (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)) SELECT count(*)::int count FROM differences`,
       [...q.params,JSON.stringify(expected.rows)])
      assert.equal(diff.rows[0].count,0,`${key}:${abi} EXCEPT ALL`)
      exactComparisons++
     }
    }
   } finally {await admin.query('ROLLBACK')}
  }
  const sql=phase==='baseline'?queries[2].old:queries[2].scoped
  for(const [abi,query] of phase==='baseline'?[['original',sql]]:[['scoped',sql],['legacy',queries[2].old]]){
   const plan=(await admin.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${query}`,[principal,employee])).rows[0]['QUERY PLAN'][0]
   const nodes=[];const visit=n=>{nodes.push({node:n['Node Type'],rows:n['Actual Rows'],loops:n['Actual Loops'],removed:n['Rows Removed by Filter']??0,sharedHits:n['Shared Hit Blocks']??0});for(const child of n.Plans??[])visit(child)};visit(plan.Plan)
   plans.push({abi,executionMs:plan['Execution Time'],planningMs:plan['Planning Time'],nodes})
  }
 }
 await runPhase('baseline')
 await admin.query(await readFile(migration,'utf8'))
 await runPhase('scoped')
 for(const [fn,types] of [['read_ai_pdm_active_principal_accounts_v1','text'],['read_ai_pdm_active_principal_identity_v1','text,text'],['read_ai_pdm_principal_effective_grants_v5','text,text']]){
  const acl=(await admin.query(`SELECT has_function_privilege('jenfu_ai_pdm_runtime',$1,'EXECUTE') pdm,
   has_function_privilege('jenfu_platform_runtime',$1,'EXECUTE') platform,
   has_function_privilege('fms_runtime',$1,'EXECUTE') fms`,[`orgmaster_contract.${fn}(${types})`])).rows[0]
  assert.deepEqual(acl,{pdm:true,platform:false,fms:false})
 }
 assert.equal((await admin.query(`SELECT has_function_privilege('jenfu_ai_pdm_runtime',
  'orgmaster_core.read_ai_pdm_principal_grants_v5(text,text,boolean)','EXECUTE') allowed`)).rows[0].allowed,false)
 console.log(JSON.stringify({status:'PASS',cases:cases.length,queriesPerCase:queries.length,
  comparisons:exactComparisons,nullValidationChecks,oracle:'PRE_MIGRATION_ROWS_AND_ERRORS',method:'BIDIRECTIONAL_EXCEPT_ALL',version,jit:'off',plans,
  productionCpuConclusion:'NOT_MEASURED',productionReleaseAuthority:false}))
},{platformRoot,capacityPopulation:500})
