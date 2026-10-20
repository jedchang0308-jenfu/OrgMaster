import { createHash } from 'node:crypto'
import { aiPdmRoleProfiles, type AiPdmRoleProfile } from '../src/governance/aiPdmRoleSchema'
import type { PublishedAiPdmRole, PublishedAiPdmRoleCatalog } from './aiPdmRoleCatalogRepository'

const invalid=():never=>{throw new Error('EXTERNAL_CATALOG_INVALID')}
const assert=(value:unknown):void=>{if(!value)invalid()}
const order=(a:string,b:string)=>a<b?-1:a>b?1:0
const hashPattern=/^[a-f0-9]{64}$/u
const uuidPattern='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
const business=(p:{kind:string;code:string})=>p.kind==='action'&&/^pdm\.(drawing|part|model|transfer)\.(view|download|edit|review|publish)$/u.test(p.code)
function canonical(value:unknown,depth=0):string{
  assert(depth<=32)
  if(value===null||typeof value==='boolean')return String(value)
  if(typeof value==='number'){assert(Number.isSafeInteger(value));return Object.is(value,-0)?'0':String(value)}
  if(typeof value==='string'){
    assert(!value.includes('\0'))
    for(let index=0;index<value.length;index++){
      const code=value.charCodeAt(index)
      if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(++index);assert(next>=0xdc00&&next<=0xdfff)}
      else assert(code<0xdc00||code>0xdfff)
    }
    return JSON.stringify(value)
  }
  if(Array.isArray(value))return '['+value.map(item=>canonical(item,depth+1)).join(',')+']'
  assert(value&&typeof value==='object')
  return '{'+Object.entries(value as Record<string,unknown>).sort(([a],[b])=>order(a,b)).map(([key,item])=>canonical(key,depth+1)+':'+canonical(item,depth+1)).join(',')+'}'
}
const hash=(value:unknown)=>createHash('sha256').update(canonical(value),'utf8').digest('hex')
const equal=(a:unknown,b:unknown)=>canonical(a)===canonical(b)
const permissions=(role:PublishedAiPdmRole)=>role.permissions.map(({kind,code,allowed})=>({kind,code,allowed})).sort((a,b)=>order(a.kind+':'+a.code,b.kind+':'+b.code))
const identity=(role:PublishedAiPdmRole)=>({stableRoleId:role.stableRoleId,roleCode:role.roleCode,displayName:role.displayName,
  assignable:role.assignable,risk:role.risk,subjectKind:role.subjectKind,recommendationAllowed:role.recommendationAllowed,
  delegationAllowed:role.delegationAllowed,allowedScopeKinds:[...role.allowedScopeKinds].sort(order),assignmentTier:role.assignmentTier,metadata:role.metadata??null})
function protectedSystem(baseline:PublishedAiPdmRoleCatalog){
  assert(baseline.roles.every(role=>role.permissions.every(p=>p.allowed)))
  return {...identity(baseline.roles[8]),roleStatus:'active',permissions:[...permissions(baseline.roles[8]),
    ...['drawing','part','model','transfer'].flatMap(group=>['view','download','edit','review','publish'].map(action=>({kind:'action' as const,code:`pdm.${group}.${action}`,allowed:true})))].sort((a,b)=>order(a.kind+':'+a.code,b.kind+':'+b.code))}
}
const protectedHash=(baseline:PublishedAiPdmRoleCatalog)=>hash({systemAdmin:protectedSystem(baseline),
  frozenEntries:baseline.roles.slice(0,8).map(role=>({stableRoleId:role.stableRoleId,permissions:permissions(role)}))})
export type DynamicCatalogMetadata={publicationFormat:'dynamic-policy-v1';canonicalizationVersion:'jenfu.canonical-json.v1';
  roleSchemaId:'ai-pdm.role-schema.flexible.v2';roleProfileSchemaId:'ai-pdm.role-profile-schema.v1';
  baselineRoleIdentityHash:string;roleIdentityHash:string;protectedPolicyHash:string;registryHash:string;roleProfileHash:string;activationGeneration:string;
  roleProfiles:AiPdmRoleProfile[]}

/** Decode the complete v2 producer preimage. No sibling source directory or capability approval table. */
export function decodeDynamicAiPdmRoleCatalog(rows:Record<string,unknown>[],baselines:PublishedAiPdmRoleCatalog[]):PublishedAiPdmRoleCatalog&DynamicCatalogMetadata{
  assert(Array.isArray(rows)&&rows.length>=9&&rows.length<=64)
  const first=rows[0]
  const fields=['contract_version','application_id','catalog_version','catalog_sha256','publication_format','canonicalization_version','role_schema_id',
    'role_profile_schema_id','baseline_role_identity_hash','role_identity_hash','protected_policy_hash','registry_hash','role_profile_hash','activation_generation','lifecycle']
  assert(first.contract_version==='jenfu.platform-entitlement.v1'&&first.application_id==='ai-pdm'&&first.publication_format==='dynamic-policy-v1'&&
    first.canonicalization_version==='jenfu.canonical-json.v1'&&first.role_schema_id==='ai-pdm.role-schema.flexible.v2'&&
    first.role_profile_schema_id==='ai-pdm.role-profile-schema.v1'&&new RegExp('^ai-pdm\\.role-policy\\.'+uuidPattern+'$','u').test(String(first.catalog_version))&&
    typeof first.activation_generation==='string'&&/^(0|[1-9][0-9]*)$/u.test(first.activation_generation)&&['active','retired'].includes(String(first.lifecycle)))
  for(const key of ['catalog_sha256','baseline_role_identity_hash','role_identity_hash','protected_policy_hash','registry_hash','role_profile_hash'])assert(hashPattern.test(String(first[key])))
  const publishedAt=new Date(first.published_at as string|Date).toISOString()
  assert(rows.every((row,index)=>row.display_order===index&&fields.every(key=>equal(row[key]??null,first[key]??null))&&
    new Date(row.published_at as string|Date).toISOString()===publishedAt))
  const baseline=baselines.find(source=>hash(source.roles.map(identity))===first.baseline_role_identity_hash&&protectedHash(source)===first.protected_policy_hash)??invalid()
  const ids=new Set<string>(),codes=new Set<string>(),names=new Set<string>()
  const roles=rows.map((row,index)=>{
    const role={stableRoleId:row.stable_role_id,roleCode:row.role_code,displayName:row.display_name,assignable:row.assignable,risk:row.risk,
      subjectKind:row.subject_kind,recommendationAllowed:row.recommendation_allowed,delegationAllowed:row.delegation_allowed,
      allowedScopeKinds:row.allowed_scope_kinds,assignmentTier:row.assignment_tier,metadata:row.metadata,permissions:row.permissions,
      roleStatus:row.role_status,roleDefinitionHash:row.role_definition_hash} as PublishedAiPdmRole
    assert(typeof role.stableRoleId==='string'&&typeof role.roleCode==='string'&&typeof role.displayName==='string'&&
      !ids.has(role.stableRoleId)&&!codes.has(role.roleCode)&&!names.has(role.displayName)&&['active','inactive'].includes(role.roleStatus??'')&&
      Array.isArray(role.permissions)&&role.permissions.length<=86&&Array.isArray(role.allowedScopeKinds))
    ids.add(role.stableRoleId);codes.add(role.roleCode);names.add(role.displayName)
    const seen=new Set<string>()
    for(const permission of role.permissions){
      assert(permission&&Object.keys(permission).sort().join(',')==='allowed,code,kind'&&['page','action'].includes(permission.kind)&&
        typeof permission.code==='string'&&typeof permission.allowed==='boolean'&&!seen.has(permission.kind+':'+permission.code))
      seen.add(permission.kind+':'+permission.code)
    }
    if(index<9){
      assert(equal(identity(role),identity(baseline.roles[index])))
      assert(equal(permissions(role).filter(p=>!business(p)),permissions(baseline.roles[index])))
    }else{
      const suffix=role.stableRoleId.slice('role-custom-'.length)
      assert(new RegExp('^role-custom-'+uuidPattern+'$','u').test(role.stableRoleId)&&role.displayName===role.displayName.normalize('NFC').trim()&&
        Array.from(role.displayName).length>=1&&Array.from(role.displayName).length<=80&&
        !baseline.roles.some(original=>original.displayName===role.displayName)&&!aiPdmRoleProfiles(baseline.roles).some(p=>p.presentationName===role.displayName))
      assert(equal(identity(role),{stableRoleId:role.stableRoleId,roleCode:'custom_'+suffix.replaceAll('-',''),displayName:role.displayName,
        assignable:true,risk:'normal',subjectKind:'employee',recommendationAllowed:true,delegationAllowed:true,allowedScopeKinds:['workspace'],assignmentTier:'app_admin',metadata:null}))
      assert(role.permissions.every(p=>business(p)&&p.allowed))
    }
    assert(role.permissions.filter(business).every(p=>p.allowed&&(role.stableRoleId!=='role-external-specialist'||p.code.endsWith('.view'))))
    const normalized={...identity(role),roleStatus:role.roleStatus!,permissions:permissions(role)}
    assert(hash(normalized)===role.roleDefinitionHash)
    return {...normalized,roleDefinitionHash:role.roleDefinitionHash} as PublishedAiPdmRole
  })
  assert(roles[4].roleStatus===roles[5].roleStatus&&!roles[4].permissions.some(business))
  const system=protectedSystem(baseline)
  // The three independently pinned baselines have no legacy explicit deny. Do
  // not generalize this source contract to an unapproved future baseline.
  assert(baseline.roles.every(role=>role.permissions.every(p=>p.allowed)))
  const {roleDefinitionHash:_systemHash,...actualSystem}=roles[8]
  assert(equal(actualSystem,system))
  assert(hash({systemAdmin:system,frozenEntries:baseline.roles.slice(0,8).map(role=>({stableRoleId:role.stableRoleId,permissions:permissions(role)}))})===first.protected_policy_hash)
  const profiles=rows.map(row=>({stableRoleId:String(row.stable_role_id),permissionRoleId:row.permission_role_id,presentationName:row.presentation_name,
    presentationOrder:row.presentation_order,assignmentDisposition:row.assignment_disposition}))
  const expectedProfiles=aiPdmRoleProfiles(roles)
  assert(equal(profiles,expectedProfiles)&&hash(profiles)===first.role_profile_hash&&hash(roles.map(identity))===first.role_identity_hash)
  const body={format:'dynamic-policy-v1',applicationId:'ai-pdm',candidateCatalogVersion:first.catalog_version,roleSchemaId:first.role_schema_id,
    roleProfileSchemaId:first.role_profile_schema_id,registryHash:first.registry_hash,baselineRoleIdentityHash:first.baseline_role_identity_hash,
    roleIdentityHash:first.role_identity_hash,roleProfileHash:first.role_profile_hash,protectedPolicyHash:first.protected_policy_hash,roles,roleProfiles:profiles}
  assert(hash(body)===first.catalog_sha256)
  return {contractVersion:'jenfu.platform-entitlement.v1',applicationId:'ai-pdm',catalogVersion:String(first.catalog_version),publishedAt,
    catalogSha256:String(first.catalog_sha256),roles,sourcePath:'postgres:ai_pdm_contract.v_application_role_catalog_v2',
    publicationFormat:'dynamic-policy-v1',canonicalizationVersion:'jenfu.canonical-json.v1',roleSchemaId:'ai-pdm.role-schema.flexible.v2',
    roleProfileSchemaId:'ai-pdm.role-profile-schema.v1',baselineRoleIdentityHash:String(first.baseline_role_identity_hash),roleIdentityHash:String(first.role_identity_hash),
    protectedPolicyHash:String(first.protected_policy_hash),registryHash:String(first.registry_hash),roleProfileHash:String(first.role_profile_hash),
    activationGeneration:String(first.activation_generation),roleProfiles:expectedProfiles}
}
