import type {Connect} from 'vite'
import type {AdministrationLifecycleDispatcher} from './orgmasterAdministrationLifecycle'
import type {ManagedLoginCallerVerifier} from './orgmasterManagedLoginApi'
export function createAdministrationLifecycleMiddleware(dispatcher:AdministrationLifecycleDispatcher|undefined,verifier:ManagedLoginCallerVerifier|undefined):Connect.NextHandleFunction{
 return (request,response,next)=>{
  const url=new URL(request.url??'/','http://orgmaster.local')
  if(url.pathname!=='/api/internal/administration-lifecycle/v1')return next()
  const run=async()=>{
   if(request.method!=='POST'||url.search||request.headers.origin||request.headers.cookie||request.headers['content-length']&&request.headers['content-length']!=='0')throw new Error('request_invalid')
   if(!dispatcher||!verifier)throw new Error('administration_lifecycle_not_ready')
   const authorization=request.headers.authorization
   if(!authorization?.startsWith('Bearer ')||authorization.length>16384)throw new Error('caller_invalid')
   await verifier.verify(authorization.slice(7)).catch(()=>{throw new Error('caller_invalid')})
   for await(const chunk of request)if(Buffer.byteLength(chunk))throw new Error('request_invalid')
   return dispatcher.runOnce(true)
  }
  void run().then(result=>{response.statusCode=200;response.setHeader('Content-Type','application/json');response.setHeader('Cache-Control','no-store');response.end(JSON.stringify({contractVersion:'orgmaster.administration-lifecycle-cycle.v1',...result}))}).catch(error=>{request.resume();response.statusCode=error.message==='caller_invalid'?401:error.message==='request_invalid'?400:503;response.setHeader('Content-Type','application/json');response.setHeader('Cache-Control','no-store');response.end(JSON.stringify({code:response.statusCode===503?'administration_lifecycle_not_ready':error.message}))})
 }
}
