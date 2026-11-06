import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {isDeepStrictEqual} from 'node:util'

const fail=()=>{throw new Error('CATALOG_RUNTIME_ASSET_INVALID')}
if(process.argv.length!==2)fail()
const hash=value=>createHash('sha256').update(value).digest('hex')
const read=file=>{try{return readFileSync(file)}catch{fail()}}
const parse=bytes=>{try{return JSON.parse(bytes)}catch{fail()}}
const legacy=['v5','v6','v7'].map(version=>{
 const catalog=parse(read(`config/catalogs/ai-pdm-role-catalog.${version}.json`))
 if(catalog.applicationId!=='ai-pdm'||catalog.roles?.length!==9||!catalog.catalogVersion?.endsWith('.'+version)||!/^[a-f0-9]{64}$/.test(catalog.catalogSha256))fail()
 return catalog
})
const bytes=read('config/catalogs/ai-pdm-role-catalog.v8.json'),catalog=parse(bytes)
const protectedRole=parse(read('contracts/ai-pdm-role-policy-catalog/v3/protected-policy-source.json')).applicationAdministratorRole
const role=value=>({stableRoleId:value.stableRoleId,roleCode:value.roleCode,displayName:value.displayName,
 assignable:value.assignable,risk:value.risk,subjectKind:value.subjectKind,recommendationAllowed:value.recommendationAllowed,
 delegationAllowed:value.delegationAllowed,allowedScopeKinds:[...value.allowedScopeKinds].sort(),assignmentTier:value.assignmentTier,
 permissions:[...value.permissions].sort((a,b)=>`${a.kind}:${a.code}:${a.allowed}`.localeCompare(`${b.kind}:${b.code}:${b.allowed}`)),metadata:value.metadata??null})
if(hash(bytes)!=='799b6d138d614bd737b49818e02f6a31b1810c42e01801f845401fb7ad3146e1'||
 catalog.contractVersion!=='jenfu.platform-entitlement.v1'||catalog.applicationId!=='ai-pdm'||
 catalog.catalogVersion!=='ai-pdm.role-catalog.2026-11-06.v8'||catalog.catalogSha256!=='320b259f0f0b4a51f24227cff37313bcb5fa3834d7736df3c43a1e178b878a73'||
 catalog.roles?.length!==10||!isDeepStrictEqual(catalog.roles.slice(0,9),legacy[2].roles)||
 !isDeepStrictEqual(catalog.roles[9],protectedRole)||protectedRole.permissions?.length!==11||
 protectedRole.roleDefinitionHash!=='e7ff57ed1ca6d2d99e6e052f1f48829365093a32a1d6bb9f8503490a3e7bcbfc'||
 hash(JSON.stringify({contractVersion:catalog.contractVersion,applicationId:catalog.applicationId,catalogVersion:catalog.catalogVersion,
  roles:catalog.roles.map(value=>({...role(value),roleDefinitionHash:value.roleDefinitionHash}))}))!==catalog.catalogSha256)fail()
