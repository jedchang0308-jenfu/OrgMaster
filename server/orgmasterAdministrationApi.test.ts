import {beforeEach,describe,expect,it,vi} from 'vitest'
import {handleAdministrationRequest} from './orgmasterAdministrationApi'
import {setVerifiedRequestIdentity} from './orgmasterRequestIdentity'
import {AdministrationError} from '../src/governance/administration'
const store=vi.hoisted(()=>({readAdministrationWorkspace:vi.fn(),previewAdministrationCommand:vi.fn(),commitAdministrationCommand:vi.fn(),readAdministrationCommand:vi.fn()}))
vi.mock('./orgmasterAdministrationStore',()=>store)
function request(method='GET',verified=true,origin='https://orgmaster.example'){
 const req={method,headers:{host:'orgmaster.example',origin},url:'/api/orgmaster/governance/administrators'} as never
 if(verified)setVerifiedRequestIdentity(req,{principalId:'p-a',employeeId:'e-a',identityIssuer:'issuer',identitySubject:'subject',id:'session'} as never)
 const response={statusCode:0,setHeader:vi.fn(),end:vi.fn()} as never
 return {req,response,result:()=>JSON.parse((response as {end:ReturnType<typeof vi.fn>}).end.mock.calls[0][0])}
}
beforeEach(()=>{vi.clearAllMocks()})
describe('administration authenticated API',()=>{
 it('requires verified cookie context and ignores an actor in body',async()=>{const {req,response,result}=request('POST',false);await handleAdministrationRequest(req,response,'root','/administrators/commands',async()=>({principalId:'root'}));expect((response as {statusCode:number}).statusCode).toBe(401);expect(result().code).toBe('IDENTITY_CONTEXT_REQUIRED');expect(store.commitAdministrationCommand).not.toHaveBeenCalled()})
 it('rejects cross-origin mutation before reading a body or store',async()=>{const {req,response,result}=request('POST',true,'https://other.example');const body=vi.fn();await handleAdministrationRequest(req,response,'root','/administrators/commands',body);expect((response as {statusCode:number}).statusCode).toBe(403);expect(result().code).toBe('auth_origin_invalid');expect(body).not.toHaveBeenCalled()})
 it('returns a current workspace without provider secrets',async()=>{store.readAdministrationWorkspace.mockResolvedValue({contractVersion:'orgmaster.administration-workspace.v1',grants:[]});const {req,response,result}=request();await handleAdministrationRequest(req,response,'root','/administrators',async()=>({}));expect((response as {statusCode:number}).statusCode).toBe(200);expect(result().correlationId).toMatch(/^[0-9a-f-]{36}$/);expect((response as {setHeader:ReturnType<typeof vi.fn>}).setHeader).toHaveBeenCalledWith('Cache-Control','private, no-store')})
 it.each([['PLATFORM_ADMIN_REQUIRED',403],['AUTH_RECENT_REQUIRED',401],['LAST_PLATFORM_ADMIN',422],['ADMINISTRATION_CONFLICT',409],['ADMINISTRATION_DEPENDENCY_UNAVAILABLE',503]])('maps %s without inventing a success receipt',async(code,status)=>{store.commitAdministrationCommand.mockRejectedValue(new AdministrationError(code as string));const {req,response,result}=request('POST');await handleAdministrationRequest(req,response,'root','/administrators/commands',async()=>({}));expect((response as {statusCode:number}).statusCode).toBe(status);expect(result().code).toBe(code)})
 it('keeps unknown command outcome distinguishable from committed',async()=>{store.readAdministrationCommand.mockRejectedValue(new AdministrationError('COMMAND_NOT_COMMITTED'));const {req,response,result}=request();await handleAdministrationRequest(req,response,'root','/administrators/commands/00000000-0000-4000-8000-000000000001',async()=>({}));expect((response as {statusCode:number}).statusCode).toBe(409);expect(result().code).toBe('COMMAND_NOT_COMMITTED')})
})
