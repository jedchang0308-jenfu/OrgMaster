import { PdmPublicationError } from './orgmasterPdmPublication'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import {productionAdministrationLifecycle} from './orgmasterAdministrationLifecycle'
import { AdministrationError } from '../src/governance/administration'
import { verifiedGovernanceActor } from './orgmasterRequestIdentity'
import { commitAdministrationCommand, previewAdministrationCommand, readAdministrationCommand, readAdministrationWorkspace } from './orgmasterAdministrationStore'
import type {AdministrationLifecycleDispatcher} from './orgmasterAdministrationLifecycle'

export const administrationErrorStatus=(code:string)=>code==='AUTH_RECENT_REQUIRED'||code==='IDENTITY_CONTEXT_REQUIRED'?401:code==='PLATFORM_ADMIN_REQUIRED'?403:['ADMIN_TARGET_INVALID','LAST_PLATFORM_ADMIN'].includes(code)?422:code==='ADMINISTRATION_DEPENDENCY_UNAVAILABLE'?503:409
export type AdministrationRequestOptions={lifecycle?:AdministrationLifecycleDispatcher;verifyRuntime?:()=>Promise<void>}
export function createAdministrationRequestHandler(service={readAdministrationWorkspace,previewAdministrationCommand,commitAdministrationCommand,readAdministrationCommand},options:AdministrationRequestOptions={}) {
return async function handleAdministrationRequest(request:IncomingMessage,response:ServerResponse,root:string,path:string,readBody:()=>Promise<unknown>) {
 if(!path.startsWith('/administrators')) return false
 const correlationId=randomUUID()
 response.setHeader('Cache-Control','private, no-store');response.setHeader('Content-Type','application/json; charset=utf-8')
 try{
  await options.verifyRuntime?.()
  const actor=verifiedGovernanceActor(request)
  if(!actor) throw new AdministrationError('IDENTITY_CONTEXT_REQUIRED')
  if(request.method==='POST') {
   const origin=typeof request.headers.origin==='string'?request.headers.origin:''
   try{if(new URL(origin).host!==request.headers.host||request.headers['sec-fetch-site']==='cross-site')throw new Error('origin')}catch{response.statusCode=403;response.end(JSON.stringify({code:'auth_origin_invalid',correlationId}));return true}
  }
  let result:unknown
  if(path==='/administrators'&&request.method==='GET')result=await service.readAdministrationWorkspace(root,actor)
  else if(path==='/administrators/preview'&&request.method==='POST')result=await service.previewAdministrationCommand(root,actor,await readBody())
  else if(path==='/administrators/commands'&&request.method==='POST')result=await service.commitAdministrationCommand(root,actor,await readBody())
  else {
   const match=path.match(/^\/administrators\/commands\/([^/]+)$/)
   if(!match||request.method!=='GET'){response.statusCode=404;response.end(JSON.stringify({code:'ADMINISTRATION_ROUTE_NOT_FOUND',correlationId}));return true}
   result=await service.readAdministrationCommand(root,actor,decodeURIComponent(match[1]))
  }
  if(path==='/administrators/commands'&&request.method==='POST')await (options.lifecycle??productionAdministrationLifecycle())?.runOnce().catch(()=>undefined)
  response.statusCode=200;response.end(JSON.stringify({...result as object,correlationId}));return true
 }catch(error){
  if (error instanceof PdmPublicationError) {
    response.statusCode = error.code === 'PDM_PUBLICATION_PENDING' ? 503 : 409
    response.end(JSON.stringify({ code: error.code, correlationId }))
    return true
  }
  const code=error instanceof AdministrationError?error.code:'ADMINISTRATION_DEPENDENCY_UNAVAILABLE'
  response.statusCode=administrationErrorStatus(code);response.end(JSON.stringify({code,correlationId}));return true
 }
}
}
export const handleAdministrationRequest=createAdministrationRequestHandler()
