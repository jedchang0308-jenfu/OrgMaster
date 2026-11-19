import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {createHash} from 'node:crypto'
const hash=value=>createHash('sha256').update(value).digest('hex'),encode=value=>`${JSON.stringify(value,null,2)}\n`
const contractVersion='orgmaster.fms-administration-initialization.v1'
const signature={function:'orgmaster_contract.read_fms_administration_initialization_v1(text,text)',arguments:[{name:'p_principal_id',type:'text'},{name:'p_employee_id',type:'text'}],columns:[['contract_version','text'],['administration_version','bigint'],['root_grant_id','uuid'],['principal_id','text'],['employee_id','text'],['published_policy_id','text'],['published_at','timestamptz'],['read_at','timestamptz']].map(([name,type])=>({name,type,nullable:false})),cardinality:'zero-or-one',contractVersion,securityDefiner:true,searchPath:['pg_catalog'],readers:['fms_runtime','orgmaster-owner-verifier'],forbiddenReaders:['PUBLIC','platform-runtime','ai-pdm-runtime','orgmaster-runtime']}
const vectors={contractVersion:'orgmaster.fms-administration-initialization-conformance.v1',evidenceScope:'SOURCE_CONTRACT_VECTORS_NOT_PRODUCTION',cases:[
 {id:'initialized-effective-root',input:{principalId:'principal-root',employeeId:'employee-root'},state:{administrationVersion:1,initialized:true,recoveryRequired:false},expected:'one-matching-row'},
 {id:'uninitialized-ordinary-publication',state:{administrationVersion:0,initialized:false,publishedPolicyId:'ordinary-publication'},expected:'zero-rows'},
 {id:'native-barrier-pending',state:{administrationVersion:1,initialized:true,recoveryRequired:false},effectiveRoot:false,expected:'zero-rows'},
 {id:'same-employee-other-principal',input:{principalId:'principal-other',employeeId:'employee-root'},expected:'zero-rows'},
 {id:'non-root-application-admin',input:{principalId:'principal-app-only',employeeId:'employee-app-only'},expected:'zero-rows'},
 {id:'external-disable-recovery',state:{administrationVersion:1,initialized:true,recoveryRequired:true},expected:'zero-rows'},
 {id:'dependency-invalid',expected:'dependency-error-not-zero'},
 {id:'pdm-platform-public-or-raw-root-roster',expected:'permission-denied'},
]}
const payloads={'projection-signature.json':signature,'conformance-vectors.json':vectors},bytes=Object.fromEntries(Object.entries(payloads).map(([name,value])=>[name,encode(value)]))
const manifest={schemaVersion:'orgmaster.fms-administration-initialization-manifest.v1',contractVersion,owner:'orgmaster',consumer:'jf-fms',purpose:'first-source-protected-catalog-initialization-only',signature:signature.function,normalApplicationAssignment:false,protectedOperationGrant:false,wholeRootRosterAccess:false,requires:{verifiedPrincipalAndEmployee:true,currentInitializedAdministration:true,effectiveExactRoot:true,nonRecovery:true,sameSnapshotVersionAndPublication:true},files:Object.entries(bytes).map(([path,value])=>({path,sha256:hash(value)})),manifestHashScope:'whole-file-utf8-bytes'}
bytes['contract-manifest.json']=encode(manifest)
const directory=resolve(process.cwd(),'contracts/orgmaster-fms-administration-initialization/v1');await mkdir(directory,{recursive:true})
for(const [name,value]of Object.entries(bytes)){
 if(process.argv.includes('--check')){if(await readFile(resolve(directory,name),'utf8')!==value)throw new Error('FMS_ADMINISTRATION_INITIALIZATION_CONTRACT_DRIFT')}
 else await writeFile(resolve(directory,name),value)
}
console.log(JSON.stringify({path:directory,manifestSha256:hash(bytes['contract-manifest.json'])}))
