import { describe, expect, it } from 'vitest'
import vectors from '../config/catalogs/test-vectors/ai-pdm-dynamic-policy-v1.json'
import { decodeDynamicAiPdmRoleCatalog } from './aiPdmDynamicRoleCatalog'
import { readHistoricalAiPdmRoleCatalogFromDatabase, readPublishedAiPdmRoleCatalog, readPublishedAiPdmRoleCatalogFromDatabase } from './aiPdmRoleCatalogRepository'
import { createAiPdmRoleCatalog, validateExternalRoleCatalog } from '../src/governance/aiPdmCatalog'

/** Immutable synthetic handoff vectors produced by PDM's actual policy core; no sibling source imports. */
function projection(vector= vectors[2]):Record<string,unknown>[]{
  const p=vector.policy
  return p.roles.map((role,index)=>({contract_version:'jenfu.platform-entitlement.v1',application_id:'ai-pdm',
    catalog_version:p.candidateCatalogVersion,catalog_sha256:p.contentHash,published_at:vector.publishedAt,display_order:index,
    stable_role_id:role.stableRoleId,role_code:role.roleCode,display_name:role.displayName,assignable:role.assignable,risk:role.risk,
    subject_kind:role.subjectKind,recommendation_allowed:role.recommendationAllowed,delegation_allowed:role.delegationAllowed,
    allowed_scope_kinds:role.allowedScopeKinds,assignment_tier:role.assignmentTier,metadata:role.metadata,permissions:role.permissions,
    role_definition_hash:role.roleDefinitionHash,role_status:role.roleStatus,lifecycle:'active',publication_format:p.format,
    canonicalization_version:'jenfu.canonical-json.v1',role_schema_id:p.roleSchemaId,role_profile_schema_id:p.roleProfileSchemaId,
    baseline_role_identity_hash:p.baselineRoleIdentityHash,role_identity_hash:p.roleIdentityHash,registry_hash:p.registryHash,
    protected_policy_hash:p.protectedPolicyHash,activation_generation:vector.activationGeneration,role_profile_hash:p.roleProfileHash,
    permission_role_id:p.roleProfiles[index].permissionRoleId,presentation_name:p.roleProfiles[index].presentationName,
    presentation_order:p.roleProfiles[index].presentationOrder,assignment_disposition:p.roleProfiles[index].assignmentDisposition}))
}
describe('dynamic PDM catalog independent consumer',()=>{
  for(const vector of vectors)it(`verifies complete producer vector from ${vector.baselineCatalogVersion}`,async()=>{
    const baseline=await readPublishedAiPdmRoleCatalog(process.cwd(),vector.baselineCatalogVersion)
    const catalog=decodeDynamicAiPdmRoleCatalog(projection(vector),[baseline])
    expect(catalog.catalogSha256).toBe(vector.policy.contentHash);expect(catalog.roles).toHaveLength(10)
    expect(catalog.roleProfiles[4].assignmentDisposition).toBe('legacy-only')
    expect(catalog.roleProfiles[8].assignmentDisposition).toBe('hidden-protected')
    expect(catalog.roleProfiles[9].presentationName).toBe('供應協作')
    const snapshot=createAiPdmRoleCatalog('valid',catalog.publishedAt,catalog)
    expect(validateExternalRoleCatalog(snapshot)).toEqual([])
    expect(snapshot.roles[4].assignmentDisposition).toBe('legacy-only')
  })
  it('rejects identity, scope, protected, status, profile, schema and hash tampering',async()=>{
    const baseline=await readPublishedAiPdmRoleCatalog(process.cwd(),vectors[2].baselineCatalogVersion)
    for(const mutate of [
      (r:Record<string,unknown>[])=>{r[0].display_name='偽裝角色'},
      (r:Record<string,unknown>[])=>{r[9].allowed_scope_kinds=['global']},
      (r:Record<string,unknown>[])=>{r[8].role_status='inactive'},
      (r:Record<string,unknown>[])=>{r[0].role_status='removed'},
      (r:Record<string,unknown>[])=>{r[4].permission_role_id='role-system-admin'},
      (r:Record<string,unknown>[])=>{r[4].assignment_disposition='selectable'},
      (r:Record<string,unknown>[])=>{r[0].presentation_name='另外的 RD'},
      (r:Record<string,unknown>[])=>{r.forEach(row=>{row.registry_hash='0'.repeat(64)})},
      (r:Record<string,unknown>[])=>{r.forEach(row=>{row.role_schema_id='unknown'})},
      (r:Record<string,unknown>[])=>{r[9].permissions=[{kind:'action',code:'settings.admin_matrix',allowed:true}]},
    ]){const rows=structuredClone(projection());mutate(rows);expect(()=>decodeDynamicAiPdmRoleCatalog(rows,[baseline])).toThrow('EXTERNAL_CATALOG_INVALID')}
    expect(()=>decodeDynamicAiPdmRoleCatalog(projection().slice(0,8),[baseline])).toThrow('EXTERNAL_CATALOG_INVALID')
    expect(()=>decodeDynamicAiPdmRoleCatalog(Array.from({length:65},()=>projection()[0]),[baseline])).toThrow('EXTERNAL_CATALOG_INVALID')
  })
  it('reads v2 for a dynamic active pointer, with no legacy fallback on a missing v2 view',async()=>{
    const rows=projection(),queries:string[]=[]
    const db={query:async(sql:string)=>{queries.push(sql);return {rows}}}
    const catalog=await readPublishedAiPdmRoleCatalogFromDatabase(db)
    expect(catalog.publicationFormat).toBe('dynamic-policy-v1');expect(queries).toHaveLength(1)
    expect(queries[0]).toContain('v_application_role_catalog_v2');expect(queries[0]).not.toContain('SELECT *')
    await expect(readPublishedAiPdmRoleCatalogFromDatabase({query:async()=>{throw new Error('missing')}})).rejects.toMatchObject({code:'EXTERNAL_CATALOG_UNAVAILABLE'})
    const changed=structuredClone(rows);changed.forEach(row=>{row.catalog_sha256='0'.repeat(64)})
    await expect(readPublishedAiPdmRoleCatalogFromDatabase({query:async()=>({rows:changed})})).rejects.toMatchObject({code:'EXTERNAL_CATALOG_INVALID'})
  })
  it('reads one immutable history version through a parameterized fixed-column query',async()=>{
    const rows=projection().map(row=>({...row,lifecycle:'retired'})),queries:Array<{sql:string;values?:unknown[]}>=[]
    const catalog=await readHistoricalAiPdmRoleCatalogFromDatabase({query:async(sql,values)=>{queries.push({sql,values});return {rows}}},String(rows[0].catalog_version),String(rows[0].catalog_sha256))
    expect(catalog.catalogVersion).toBe(rows[0].catalog_version);expect(queries).toHaveLength(1)
    expect(queries[0].sql).toContain('v_role_policy_publications_v1');expect(queries[0].sql).not.toContain('SELECT *')
    expect(queries[0].values).toEqual(['ai-pdm',rows[0].catalog_version])
  })
});
