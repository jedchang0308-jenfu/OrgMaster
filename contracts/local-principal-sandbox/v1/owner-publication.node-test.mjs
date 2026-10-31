import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contractDigest, LOCAL_IDENTITY_ISSUER } from './protocol.mjs'
import { localOrgmasterRoleCatalog, localGrantsFromOwnerPublication, ownerGrantsMatchFixture, ownerGrantsMatchFixturePolicy, validateLocalOwnerPublication } from './owner-publication.mjs'
import { readAiPdmRoleCatalogV7 } from '../../../server/localPrincipalSandboxFixture.mjs'

const time = Date.parse('2026-10-29T12:00:00.000Z'), stamp = new Date(time).toISOString()
const since='2026-01-01T00:00:00.000Z'
const scenario={scenarioId:'active',principalId:'local-active',employeeId:'employee-local-active',identityIssuer:LOCAL_IDENTITY_ISSUER,
 identitySubject:'local-active',accountType:'human_personal'}
function fixture() {
 const pdm=readAiPdmRoleCatalogV7().catalog
 const payload={kind:'assignment-governance-v3',effectState:'not-synchronized',organizationSnapshot:{workspaceVersionId:'workspace-test'},
  policy:{identityLinks:[{issuer:LOCAL_IDENTITY_ISSUER,subject:scenario.identitySubject,principalId:scenario.principalId,employeeId:scenario.employeeId}],
   applicationRoles:[{id:'role-org-read',applicationId:'orgmaster',code:'reader',name:'Local reader',status:'active',systemDefined:false}],
   permissions:[{id:'p-read',applicationId:'orgmaster',code:'orgmaster.read',status:'active'}],
   rolePermissionGrants:[{id:'grant-read',roleId:'role-org-read',permissionId:'p-read',effect:'allow'}],
   roleAssignments:[{id:'assignment-org',employeeId:scenario.employeeId,applicationId:'orgmaster',roleId:'role-org-read',status:'active',
    subjectKind:'employee',targetPrincipalId:null,scope:{kind:'global'},validFrom:since,validTo:null}]},
  externalRoleCatalogs:[{applicationId:'ai-pdm',catalogVersion:pdm.catalogVersion,catalogSha256:pdm.catalogSha256,
   sourceKind:'application-contract',validationState:'valid',roles:pdm.roles.map(role=>({...role,status:'active'}))},
   {applicationId:'financial-management-system',catalogVersion:'fms.test.v1',contentSha256:'a'.repeat(64),
    sourceKind:'application-contract',validationState:'valid',roles:[{stableRoleId:'role-fms-maker',status:'active',assignable:true,
     roleDefinitionHash:'b'.repeat(64),allowedScopeKinds:['workspace']}]}]}
 const version={...payload,id:'publication-test-v1',versionNumber:1,hashFormat:'orgmaster.sorted-json.v1',snapshotHash:contractDigest(payload)}
 const row={contract_version:'orgmaster.local-principal-publication.v1',principal_issuer:LOCAL_IDENTITY_ISSUER,
  principal_subject:scenario.identitySubject,principal_id:scenario.principalId,employee_id:scenario.employeeId,account_type:'human_personal',
  employee_status:'active',mapping_version:'4',published_at:stamp,published_version:version,
  pdm_catalog:pdm.roles.map(role=>({contract_version:'jenfu.platform-entitlement.v1',application_id:'ai-pdm',
   catalog_version:pdm.catalogVersion,catalog_sha256:pdm.catalogSha256,stable_role_id:role.stableRoleId,
   role_definition_hash:role.roleDefinitionHash,assignable:role.assignable,allowed_scope_kinds:role.allowedScopeKinds})),
  pdm_grants:[{contract_version:'jenfu.orgmaster.ai-pdm-principal-grants.v4',principal_id:scenario.principalId,employee_id:scenario.employeeId,
   application_id:'ai-pdm',grant_kind:'direct',delegation_id:null,assignment_version_id:version.id,assignment_version:'1',
   stable_role_id:'role-rd',catalog_version:pdm.catalogVersion,scope_kind:'workspace',scope_key:'company-jenfu',valid_from:since,valid_until:null}],
  fms_authority:{contract_version:'jenfu.orgmaster.fms-authority.v2',manifest_hash:'a7a12188c7b1bb1860f008edfca1abaced2fe3c4afa144c5457f1b5b83c571bb',
   application_id:'financial-management-system',principal_id:scenario.principalId,employee_id:scenario.employeeId,assignment_version:version.id,
   catalog_version:'fms.test.v1',catalog_content_sha256:'a'.repeat(64),read_at:stamp,
   assignments:[{principalId:scenario.principalId,employeeId:scenario.employeeId,assignmentVersion:version.id,revokedAt:null,
    stableRoleId:'role-fms-maker',catalogVersion:'fms.test.v1',catalogSha256:'a'.repeat(64),scope:{kind:'workspace',key:'company-jenfu'},
    validFrom:since,validUntil:null}]}}
 return row
}
function rehash(row) {
 const {kind,policy,externalRoleCatalogs,organizationSnapshot,effectState}=row.published_version
 row.published_version.snapshotHash=contractDigest({kind,policy,externalRoleCatalogs,organizationSnapshot,effectState})
}
test('normalizes native PDM v4 and FMS v2 grants with each App native company and published version',()=>{
 const row=fixture(),pdm=localGrantsFromOwnerPublication(row,scenario,'ai-pdm',time),fms=localGrantsFromOwnerPublication(row,scenario,'financial-management-system',time)
 assert.equal(pdm[0].companyId,'company-jenfu');assert.equal(fms[0].companyId,'jenfu-machinery')
 assert.equal(pdm[0].scopeRef,'company-jenfu');assert.equal(pdm[0].grantVersion,1)
 assert.equal(pdm[0].catalogSha256,readAiPdmRoleCatalogV7().catalog.catalogSha256)
 assert.equal(ownerGrantsMatchFixture(row,scenario,'ai-pdm',pdm,time),true)
 assert.equal(ownerGrantsMatchFixture(row,scenario,'ai-pdm',[{...pdm[0],grantVersion:4}],time),false)
})
test('OrgMaster local role descriptor binds the actual published allow/deny policy and native global assignment',()=>{
 const row=fixture(),catalog=localOrgmasterRoleCatalog(row.published_version),grants=localGrantsFromOwnerPublication(row,scenario,'orgmaster',time)
 assert.equal(grants[0].catalogVersion,row.published_version.id)
 assert.equal(grants[0].catalogSha256,row.published_version.snapshotHash)
 assert.equal(grants[0].roleDefinitionHash,catalog.roles[0].roleDefinitionHash)
 row.published_version.policy.rolePermissionGrants[0].effect='deny';rehash(row)
 assert.notEqual(localOrgmasterRoleCatalog(row.published_version).roles[0].roleDefinitionHash,catalog.roles[0].roleDefinitionHash)
})
test('unknown, inactive, ambiguous or changed publication identity cannot become live admission',()=>{
 for(const mutate of [r=>{r.principal_id='local-other'},r=>{r.employee_status='inactive'},r=>{r.account_type='human_privileged'},
  r=>{r.contract_version='unversioned'},r=>{r.mapping_version=0},r=>{r.extra='unreviewed'},
  r=>{r.published_version.policy.identityLinks[0].issuer='https://accounts.google.com';rehash(r)},
  r=>{r.published_version.policy.applicationRoles[0].status='retired'}]) {
  const row=fixture();mutate(row);assert.throws(()=>validateLocalOwnerPublication(row,scenario),/local_owner_contract_mismatch/)
 }
})
test('native grant version, account binding, catalog and effective assignment must all join',()=>{
 for(const mutate of [r=>{r.pdm_grants[0].assignment_version_id='stale-publication'},r=>{r.pdm_grants[0].assignment_version='2'},
  r=>{r.pdm_grants[0].principal_id='local-other'},r=>{r.pdm_grants[0].grant_kind='delegated'},
  r=>{r.pdm_grants[0].catalog_version='unknown'},r=>{r.pdm_grants[0].scope_kind='global'}]) {
  const row=fixture();mutate(row);assert.throws(()=>localGrantsFromOwnerPublication(row,scenario,'ai-pdm',time),/local_owner_contract_mismatch/)
 }
})
test('frozen v7 governance metadata is joined to the current native catalog rather than treated as live file proof',()=>{
 const row=fixture(),snapshot=row.published_version.externalRoleCatalogs[0]
 snapshot.sourceKind='bundled-fixture';snapshot.payloadHash=snapshot.catalogSha256;delete snapshot.catalogSha256
 snapshot.roles.forEach(role=>{delete role.roleDefinitionHash});rehash(row)
 assert.equal(localGrantsFromOwnerPublication(row,scenario,'ai-pdm',time)[0].roleDefinitionHash,row.pdm_catalog[0].role_definition_hash)
 row.pdm_catalog[0].catalog_sha256='f'.repeat(64)
 assert.throws(()=>localGrantsFromOwnerPublication(row,scenario,'ai-pdm',time),/local_owner_contract_mismatch/)
})
test('FMS authority drift and stale reads reject; an owner-confirmed empty authority is an empty grant set',()=>{
 for(const mutate of [r=>{r.fms_authority.manifest_hash='f'.repeat(64)},r=>{r.fms_authority.assignment_version='stale'},
  r=>{r.fms_authority.read_at=new Date(time-10001).toISOString()},r=>{r.fms_authority.assignments[0].scope.key='other-company'},
  r=>{r.fms_authority.assignments[0].catalogSha256='f'.repeat(64)}]) {
  const row=fixture();mutate(row);assert.throws(()=>localGrantsFromOwnerPublication(row,scenario,'financial-management-system',time),/local_owner_contract_mismatch/)
 }
 const row=fixture();row.fms_authority=null
 assert.deepEqual(localGrantsFromOwnerPublication(row,scenario,'financial-management-system',time),[])
})
test('withdrawn, extra or altered native grants differ from the fixed expected fixture',()=>{
 const row=fixture(),expected=localGrantsFromOwnerPublication(row,scenario,'ai-pdm',time)
 row.pdm_grants=[];assert.equal(ownerGrantsMatchFixture(row,scenario,'ai-pdm',expected,time),false)
 row.pdm_grants=fixture().pdm_grants.concat(fixture().pdm_grants)
 assert.equal(ownerGrantsMatchFixture(row,scenario,'ai-pdm',expected,time),false)
 assert.equal(ownerGrantsMatchFixture(fixture(),scenario,'ai-pdm',[{...expected[0],companyId:'other-company'}],time),false)
})

function advancePublication(row) {
 row.published_version.id='publication-test-v2'
 row.published_version.versionNumber=2
 row.published_version.organizationSnapshot.workspaceVersionId='workspace-test-updated'
 rehash(row)
 row.pdm_grants.forEach(grant=>{grant.assignment_version_id=row.published_version.id;grant.assignment_version='2'})
 row.fms_authority.assignment_version=row.published_version.id
 row.fms_authority.assignments.forEach(grant=>{grant.assignmentVersion=row.published_version.id})
 return row
}
test('runtime readiness survives a native publication advancing without authority changes; bootstrap remains exact',()=>{
 for(const app of ['orgmaster','ai-pdm','financial-management-system']) {
  const original=fixture(),expected=localGrantsFromOwnerPublication(original,scenario,app,time)
  const next=advancePublication(fixture())
  assert.equal(ownerGrantsMatchFixture(next,scenario,app,expected,time),false)
  assert.equal(ownerGrantsMatchFixturePolicy(next,scenario,app,expected,time),true)
  assert.equal(ownerGrantsMatchFixturePolicy(original,scenario,app,[{...expected[0],grantVersion:3}],time),false)
 }
})
test('publication advance does not hide changed role definitions, revoked grants, scope or validity',()=>{
 const expected=localGrantsFromOwnerPublication(fixture(),scenario,'orgmaster',time)
 for(const mutate of [
  row=>{row.published_version.policy.rolePermissionGrants[0].effect='deny'},
  row=>{row.published_version.policy.roleAssignments[0].status='revoked'},
  row=>{row.published_version.policy.roleAssignments[0].scope.kind='workspace'},
  row=>{row.published_version.policy.roleAssignments[0].validTo=new Date(time-1).toISOString()},
  row=>{row.published_version.policy.roleAssignments[0].validFrom=new Date(time+1).toISOString()},
 ]) {
  const row=advancePublication(fixture());mutate(row);rehash(row)
  assert.equal(ownerGrantsMatchFixturePolicy(row,scenario,'orgmaster',expected,time),false)
 }
})
test('publication readiness preserves external catalog, company, role and same-version pins',()=>{
 for(const app of ['ai-pdm','financial-management-system']){
  const expected=localGrantsFromOwnerPublication(fixture(),scenario,app,time)
  for(const change of [{catalogSha256:'f'.repeat(64)},{companyId:'other-company'},{stableRoleId:'other-role'},{scopeRef:'other-workspace'}]){
   assert.equal(ownerGrantsMatchFixturePolicy(advancePublication(fixture()),scenario,app,[{...expected[0],...change}],time),false)
  }
 }
 const row=fixture(),expected=localGrantsFromOwnerPublication(row,scenario,'orgmaster',time)
 assert.equal(ownerGrantsMatchFixturePolicy(row,scenario,'orgmaster',[{...expected[0],catalogSha256:'f'.repeat(64)}],time),false)
 const revoked=advancePublication(fixture());revoked.pdm_grants=[]
 assert.equal(ownerGrantsMatchFixturePolicy(revoked,scenario,'ai-pdm',localGrantsFromOwnerPublication(fixture(),scenario,'ai-pdm',time),time),false)
})
