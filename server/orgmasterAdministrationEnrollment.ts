import type {FirebaseIdentityProvider} from './orgmasterFirebaseIdentityProvider'
import type {ManagedDirectoryPortV1} from './orgmasterManagedDirectoryPort'
import type {OrgmasterDatabase} from './orgmasterDatabase'
import type {AdministrationLifecycleDispatcher} from './orgmasterAdministrationLifecycle'

export const ADMINISTRATION_ENROLLMENT_VERSION='orgmaster.administration-enrollment.v1' as const
export class AdministrationEnrollmentError extends Error{constructor(readonly status:number,readonly code:string){super(code)}}
export type EnrollmentRequest={contractVersion:typeof ADMINISTRATION_ENROLLMENT_VERSION;requestId:string;directoryCustomerId:string;idToken:string}
export type EnrollmentResponse={contractVersion:typeof ADMINISTRATION_ENROLLMENT_VERSION;requestId:string}&({status:'not_applicable'}|{status:'activation_pending'|'completed';commandId:string;principalId:string;employeeId:string;issuer:string;subject:string;authenticatedAt:string})
export function parseEnrollmentRequest(value:unknown):EnrollmentRequest{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new AdministrationEnrollmentError(400,'request_invalid')
 const body=value as Record<string,unknown>
 if(Object.keys(body).sort().join(',')!=='contractVersion,directoryCustomerId,idToken,requestId'||body.contractVersion!==ADMINISTRATION_ENROLLMENT_VERSION||typeof body.requestId!=='string'||!(/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i).test(body.requestId)||typeof body.directoryCustomerId!=='string'||body.directoryCustomerId.length<1||body.directoryCustomerId.length>255||typeof body.idToken!=='string'||!body.idToken||Buffer.byteLength(body.idToken)>16384)throw new AdministrationEnrollmentError(400,'request_invalid')
 return body as EnrollmentRequest
}
export function createAdministrationEnrollment(input:{database:Pick<OrgmasterDatabase,'query'>;firebase:FirebaseIdentityProvider;directory:ManagedDirectoryPortV1;directoryCustomerId:string;dispatcher?:AdministrationLifecycleDispatcher;now?:()=>number}){
 const now=input.now??Date.now
 return {async complete(request:EnrollmentRequest):Promise<EnrollmentResponse>{
  const base={contractVersion:ADMINISTRATION_ENROLLMENT_VERSION,requestId:request.requestId}
  const identity=await input.firebase.verifyIdToken(request.idToken).catch(()=>{throw new AdministrationEnrollmentError(401,'caller_or_token_invalid')})
  if(identity.signInProvider!=='google.com'||identity.emailVerified!==true||!identity.googleUserId||!identity.issuer||!identity.subject||request.directoryCustomerId!==input.directoryCustomerId)throw new AdministrationEnrollmentError(403,'managed_identity_denied')
  const candidate=(await input.database.query('SELECT orgmaster_core.find_administration_enrollment_intent_v1($1,$2) intent',[request.directoryCustomerId,identity.googleUserId])).rows[0]?.intent
  if(!candidate)return {...base,status:'not_applicable'}
  const age=now()-Date.parse(identity.authenticatedAt??'')
  if(!Number.isFinite(age)||age<0||age>300000||!['aal1','aal2'].includes(identity.assuranceLevel))throw new AdministrationEnrollmentError(401,'AUTH_RECENT_REQUIRED')
  if(input.directory.mode!=='google-admin-readonly')throw new AdministrationEnrollmentError(503,'ADMINISTRATION_ENROLLMENT_NOT_READY')
  const directory=await input.directory.readByDirectoryKey(request.directoryCustomerId,identity.googleUserId)
  if(!directory.ok){throw new AdministrationEnrollmentError(directory.kind==='retryable_error'?503:403,'managed_identity_denied')}
  if(directory.user.directoryState!=='present'||directory.user.customerId!==request.directoryCustomerId||directory.user.userId!==identity.googleUserId||directory.user.primaryEmail.trim().toLowerCase()!==identity.email?.trim().toLowerCase())throw new AdministrationEnrollmentError(403,'managed_identity_denied')
  const facts={directoryCustomerId:directory.user.customerId,directoryUserId:directory.user.userId,issuer:identity.issuer,subject:identity.subject,primaryEmail:directory.user.primaryEmail,authenticatedAt:identity.authenticatedAt,assuranceLevel:identity.assuranceLevel,verifiedAt:new Date(now()).toISOString(),sourceEtag:directory.user.sourceEtag}
  const finish=async()=>{
   try{return (await input.database.query('SELECT orgmaster_core.complete_administration_enrollment_v1($1::uuid,$2::jsonb) result',[candidate.intent.commandId,JSON.stringify(facts)])).rows[0]?.result}
   catch(error){const message=error instanceof Error?error.message:'';const code=['ADMINISTRATION_ENROLLMENT_NOT_READY','ADMINISTRATION_INTENT_EXPIRED','ADMINISTRATION_INTENT_REVOKED','ADMINISTRATION_ALREADY_INITIALIZED','ADMINISTRATION_CONFLICT','ADMIN_TARGET_INVALID','AUTH_RECENT_REQUIRED'].find(code=>message.includes(code));throw new AdministrationEnrollmentError(code==='ADMIN_TARGET_INVALID'?403:code==='AUTH_RECENT_REQUIRED'?401:code?.includes('NOT_READY')?503:409,code??'ADMINISTRATION_ENROLLMENT_NOT_READY')}
  }
  if(input.dispatcher)await input.dispatcher.runOnce().catch(()=>undefined)
  let result=await finish()
  if(!result?.principalId||!result.employeeId||!result.commandId)throw new AdministrationEnrollmentError(503,'ADMINISTRATION_ENROLLMENT_NOT_READY')
  if(result.activation!=='acknowledged'&&input.dispatcher){await input.dispatcher.runOnce().catch(()=>undefined);result=await finish()}
  return {...base,status:result.activation==='acknowledged'?'completed':'activation_pending',commandId:result.commandId,principalId:result.principalId,employeeId:result.employeeId,issuer:identity.issuer,subject:identity.subject,authenticatedAt:identity.authenticatedAt!}
 }}
}
export type AdministrationEnrollmentService=ReturnType<typeof createAdministrationEnrollment>
