import {createHash} from 'node:crypto'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const directory=resolve(process.cwd(),'contracts/orgmaster-administration-enrollment/v1')
const text={type:'string',minLength:1,maxLength:255},uuid={type:'string',format:'uuid'},instant={type:'string',format:'date-time'}
const version={const:'orgmaster.administration-enrollment.v1'}
const request={$schema:'https://json-schema.org/draft/2020-12/schema',type:'object',additionalProperties:false,required:['contractVersion','requestId','directoryCustomerId','idToken'],properties:{contractVersion:version,requestId:uuid,directoryCustomerId:text,idToken:{type:'string',minLength:1,maxLength:16384}}}
const result=status=>({type:'object',additionalProperties:false,required:['contractVersion','requestId','status',...(status==='not_applicable'?[]:['commandId','principalId','employeeId','issuer','subject','authenticatedAt'])],properties:{contractVersion:version,requestId:uuid,status:{const:status},...(status==='not_applicable'?{}:{commandId:uuid,principalId:text,employeeId:text,issuer:text,subject:text,authenticatedAt:instant})}})
const response={$schema:'https://json-schema.org/draft/2020-12/schema',oneOf:['not_applicable','activation_pending','completed'].map(result)}
const bytes=value=>JSON.stringify(value,null,2)+'\n',sha=value=>createHash('sha256').update(value).digest('hex')
const files={'request.schema.json':request,'response.schema.json':response}
files['contract-manifest.json']={contractVersion:'orgmaster.administration-enrollment.v1',producer:'orgmaster',consumer:'platform',endpoint:'/api/internal/administration-enrollment/v1/complete',method:'POST',serviceAuthentication:'existing Platform Google OIDC caller verifier; no cookies or browser-origin requests',humanProof:'idToken only in HTTP memory; Firebase Google crypto verification, owner-admitted immutable Directory key, fresh AAL1 or AAL2 <=300s',requestSchema:{path:'request.schema.json',sha256:sha(bytes(request))},responseSchema:{path:'response.schema.json',sha256:sha(bytes(response))},statuses:['not_applicable','activation_pending','completed'],principalResolution:'verified provider pair to canonical exact Principal; never Employee broadcast or managed-login DTO synthesis',sessionIssuance:'consumer resolves actual Principal and epoch again after completed; activation_pending is never root/session authority'}
await mkdir(directory,{recursive:true})
for(const[path,value]of Object.entries(files)){
 const target=resolve(directory,path),expected=bytes(value)
 if(process.argv.includes('--check')){if(await readFile(target,'utf8')!==expected)throw new Error('DEV070_ENROLLMENT_CONTRACT_DRIFT:'+path)}else await writeFile(target,expected,'utf8')
}
console.log(JSON.stringify({directory,manifestSha256:sha(bytes(files['contract-manifest.json']))}))
