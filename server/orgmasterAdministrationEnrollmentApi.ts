import {randomUUID} from 'node:crypto'
import type {Connect} from 'vite'
import {AdministrationEnrollmentError,parseEnrollmentRequest,ADMINISTRATION_ENROLLMENT_VERSION,type AdministrationEnrollmentService} from './orgmasterAdministrationEnrollment'
import type {ManagedLoginCallerVerifier} from './orgmasterManagedLoginApi'
export const ADMINISTRATION_ENROLLMENT_PATH='/api/internal/administration-enrollment/v1/complete'
export function createAdministrationEnrollmentMiddleware(service:AdministrationEnrollmentService|undefined,verifier:ManagedLoginCallerVerifier|undefined):Connect.NextHandleFunction{
 return (request,response,next)=>{
  const url=new URL(request.url??'/','http://orgmaster.local')
  if(url.pathname!==ADMINISTRATION_ENROLLMENT_PATH)return next()
  let requestId:string=randomUUID()
  const send=(status:number,value:unknown)=>{response.statusCode=status;response.setHeader('Content-Type','application/json; charset=utf-8');response.setHeader('Cache-Control','no-store');response.end(JSON.stringify(value))}
  const handle=async()=>{
   if(request.method!=='POST'||url.search||request.headers.origin||request.headers.cookie||!String(request.headers['content-type']).startsWith('application/json'))throw new AdministrationEnrollmentError(400,'request_invalid')
   if(!service||!verifier)throw new AdministrationEnrollmentError(503,'ADMINISTRATION_ENROLLMENT_NOT_READY')
   const authorization=request.headers.authorization
   if(!authorization?.startsWith('Bearer ')||authorization.length>16384)throw new AdministrationEnrollmentError(401,'caller_or_token_invalid')
   await verifier.verify(authorization.slice(7)).catch(()=>{throw new AdministrationEnrollmentError(401,'caller_or_token_invalid')})
   let size=0;const chunks:Buffer[]=[]
   for await(const chunk of request){const bytes=Buffer.from(chunk);size+=bytes.length;if(size>20000)throw new AdministrationEnrollmentError(400,'request_invalid');chunks.push(bytes)}
   let body:unknown;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new AdministrationEnrollmentError(400,'request_invalid')}
   const parsed=parseEnrollmentRequest(body);requestId=parsed.requestId
   send(200,await service.complete(parsed))
  }
  void handle().catch(error=>{request.resume();const known=error instanceof AdministrationEnrollmentError;send(known?error.status:503,{contractVersion:ADMINISTRATION_ENROLLMENT_VERSION,requestId,code:known?error.code:'ADMINISTRATION_ENROLLMENT_NOT_READY'})})
 }
}
