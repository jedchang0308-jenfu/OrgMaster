import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { readPublishedAiPdmRoleCatalogFromDatabase } from '../../server/aiPdmRoleCatalogRepository.ts'

// Projection-shaped SQL contract fixtures. This proves the consumer's real
// PostgreSQL selection/ACL/transaction behavior, not the complete PDM producer.
const columns = `contract_version text, application_id text, catalog_version text, published_at timestamptz, catalog_sha256 text,
 display_order integer, stable_role_id text, role_code text, display_name text, assignable boolean, risk text,
 subject_kind text, recommendation_allowed boolean, delegation_allowed boolean, allowed_scope_kinds jsonb,
 assignment_tier text, permissions jsonb, metadata jsonb, role_definition_hash text,
 publication_format text, canonicalization_version text, role_schema_id text,
 baseline_role_identity_hash text, role_identity_hash text, protected_policy_hash text, registry_hash text,
 role_profile_schema_id text, role_profile_hash text, role_status text, permission_role_id text,
 presentation_name text, presentation_order integer, assignment_disposition text, lifecycle text`
function projection({ policy: p, publishedAt }) {
 return p.roles.map((role,index)=>({contract_version:'jenfu.platform-entitlement.v1',application_id:'ai-pdm',
  catalog_version:p.candidateCatalogVersion,catalog_sha256:p.contentHash,published_at:publishedAt,display_order:index,
  stable_role_id:role.stableRoleId,role_code:role.roleCode,display_name:role.displayName,assignable:role.assignable,risk:role.risk,
  subject_kind:role.subjectKind,recommendation_allowed:role.recommendationAllowed,delegation_allowed:role.delegationAllowed,
  allowed_scope_kinds:role.allowedScopeKinds,assignment_tier:role.assignmentTier,metadata:role.metadata,permissions:role.permissions,
  role_definition_hash:role.roleDefinitionHash,role_status:role.roleStatus,lifecycle:'active',publication_format:p.format,
  canonicalization_version:'jenfu.canonical-json.v1',role_schema_id:p.roleSchemaId,role_profile_schema_id:p.roleProfileSchemaId,
  baseline_role_identity_hash:p.baselineRoleIdentityHash,role_identity_hash:p.roleIdentityHash,registry_hash:p.registryHash,
  protected_policy_hash:p.protectedPolicyHash,role_profile_hash:p.roleProfileHash,
  permission_role_id:p.roleProfiles[index].permissionRoleId,presentation_name:p.roleProfiles[index].presentationName,
  presentation_order:p.roleProfiles[index].presentationOrder,assignment_disposition:p.roleProfiles[index].assignmentDisposition}))
}

export async function verifyAiPdmCatalogReaderCompatibility({admin,runtime}) {
 const facts=(await admin.query('SELECT current_database() database,host(inet_server_addr()) host,current_setting(\'server_version_num\')::int version')).rows[0]
 assert.match(facts.database,/^(jenfu_local_dev070_ci_\d{1,20}_\d{1,4}|dev014_[a-f0-9]{20})$/u)
 assert.equal(facts.host,'127.0.0.1');assert.ok(facts.version>=180000&&facts.version<190000)
 assert.equal((await runtime.query('SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user')).rows[0].rolsuper,false)
 const v1=JSON.parse(await readFile(new URL('../../config/catalogs/test-vectors/ai-pdm-dynamic-policy-v1.json',import.meta.url),'utf8'))[2]
 const v2=JSON.parse(await readFile(new URL('../../contracts/ai-pdm-role-policy-catalog/v3/conformance.json',import.meta.url),'utf8'))
 const cases=[]
 const readonly=async fn=>{await runtime.query('BEGIN READ ONLY');try{return await fn()}finally{await runtime.query('ROLLBACK')}}
 const read=async()=>{const queries=[];const catalog=await readPublishedAiPdmRoleCatalogFromDatabase({query:async sql=>{queries.push(sql);return runtime.query(sql)}});return {catalog,queries}}
 const setRows=(version,rows)=>admin.query('UPDATE ai_pdm_contract.catalog_reader_fixture_rows SET rows=$2::jsonb WHERE version=$1',[version,JSON.stringify(rows)])
 const createView=async version=>{
  await admin.query(`CREATE VIEW ai_pdm_contract.v_application_role_catalog_v${version} AS SELECT catalog.* FROM jsonb_to_recordset((SELECT rows FROM ai_pdm_contract.catalog_reader_fixture_rows WHERE version=${version})) AS catalog(${columns})`)
  await admin.query(`REVOKE ALL ON ai_pdm_contract.v_application_role_catalog_v${version} FROM PUBLIC;GRANT SELECT ON ai_pdm_contract.v_application_role_catalog_v${version} TO jenfu_orgmaster_runtime`)
 }
 await admin.query('CREATE SCHEMA ai_pdm_contract;REVOKE ALL ON SCHEMA ai_pdm_contract FROM PUBLIC;GRANT USAGE ON SCHEMA ai_pdm_contract TO jenfu_orgmaster_runtime;CREATE TABLE ai_pdm_contract.catalog_reader_fixture_rows(version integer PRIMARY KEY,rows jsonb NOT NULL)')
 try {
  for(const [version,vector] of [[2,v1],[3,v2]])await admin.query('INSERT INTO ai_pdm_contract.catalog_reader_fixture_rows VALUES($1,$2::jsonb)',[version,JSON.stringify(projection(vector))])
  await createView(2)
  assert.equal((await admin.query("SELECT pg_catalog.to_regclass('ai_pdm_contract.v_application_role_catalog_v3')")).rows[0].to_regclass,null)
  // The old single-reader SQL aborts this exact read-only transaction.
  await readonly(async()=>{
   await assert.rejects(runtime.query('SELECT catalog_version FROM ai_pdm_contract.v_application_role_catalog_v3'),e=>e.code==='42P01')
   await assert.rejects(runtime.query('SELECT 1'),e=>e.code==='25P02')
  });cases.push('old-v3-only-query-42P01-then-25P02')
  await readonly(async()=>{
   const {catalog,queries}=await read()
   assert.equal(catalog.catalogSha256,v1.policy.contentHash);assert.equal(catalog.publicationFormat,'dynamic-policy-v1')
   assert.equal(catalog.sourcePath,'postgres:ai_pdm_contract.v_application_role_catalog_v2');assert.equal(queries.length,2)
   assert.equal((await runtime.query('SELECT 1 AS alive')).rows[0].alive,1)
  });cases.push('pre096-v2-only-readonly-transaction-continues')
  await createView(3)
  await readonly(async()=>{
   const {catalog,queries}=await read()
   assert.equal(catalog.catalogSha256,v2.policy.contentHash);assert.equal(catalog.publicationFormat,'dynamic-policy-v2')
   assert.equal(catalog.sourcePath,'postgres:ai_pdm_contract.v_application_role_catalog_v3')
   assert.equal(catalog.roles.at(-1).stableRoleId,'role-application-system-admin')
   assert.equal(queries.some(sql=>sql.includes('FROM ai_pdm_contract.v_application_role_catalog_v2')),false)
   assert.equal((await runtime.query('SELECT 1 AS alive')).rows[0].alive,1)
  });cases.push('v3-preferred-protected-catalog-active-pointer')
  for(const [id,change,code] of [
   ['empty',()=>[],'EXTERNAL_CATALOG_UNAVAILABLE'],
   ['hash',rows=>rows.map(row=>({...row,catalog_sha256:'0'.repeat(64)})),'EXTERNAL_CATALOG_INVALID'],
   ['wrong-app',rows=>rows.map(row=>({...row,application_id:'other-app'})),'EXTERNAL_CATALOG_INVALID'],
   ['protected',rows=>rows.map(row=>row.stable_role_id==='role-application-system-admin'?{...row,assignable:true}:row),'EXTERNAL_CATALOG_INVALID'],
  ]){
   await setRows(3,change(projection(v2)))
   await readonly(async()=>{await assert.rejects(read(),e=>e.code===code);assert.equal((await runtime.query('SELECT 1 AS alive')).rows[0].alive,1)})
   cases.push(`v3-${id}-fails-closed-with-healthy-v2`)
  }
  await setRows(3,projection(v2))
  await admin.query('REVOKE SELECT ON ai_pdm_contract.v_application_role_catalog_v3 FROM jenfu_orgmaster_runtime')
  await readonly(async()=>{await assert.rejects(read(),e=>e.code==='EXTERNAL_CATALOG_UNAVAILABLE');await assert.rejects(runtime.query('SELECT 1'),e=>e.code==='25P02')})
  cases.push('v3-42501-no-downgrade')
  await admin.query('GRANT SELECT ON ai_pdm_contract.v_application_role_catalog_v3 TO jenfu_orgmaster_runtime;REVOKE USAGE ON SCHEMA ai_pdm_contract FROM jenfu_orgmaster_runtime')
  await readonly(async()=>{await assert.rejects(read(),e=>e.code==='EXTERNAL_CATALOG_UNAVAILABLE')})
  cases.push('probe-schema-42501-no-downgrade')
  await admin.query('GRANT USAGE ON SCHEMA ai_pdm_contract TO jenfu_orgmaster_runtime;DROP VIEW ai_pdm_contract.v_application_role_catalog_v3')
  await setRows(2,projection(v2))
  await readonly(async()=>{await assert.rejects(read(),e=>e.code==='EXTERNAL_CATALOG_INVALID');assert.equal((await runtime.query('SELECT 1 AS alive')).rows[0].alive,1)})
  cases.push('pre096-view-cannot-author-dynamic-policy-v2')
  return {scope:'DEV070_CATALOG_READER_PROJECTION_SQL_CONTRACT_FIXTURE',status:'PASS',postgres:18,cases,fullProducerDdl:false,productionAcceptance:false}
 }finally{await runtime.query('ROLLBACK');await admin.query('DROP SCHEMA ai_pdm_contract CASCADE')}
}
