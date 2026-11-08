import {describe,expect,it,vi} from 'vitest'
import {readFirebaseAccountWithUserAdc} from './orgmasterFirebaseIdentityProvider'

describe('OrgMaster local Firebase user ADC account lookup',()=>{
  it('uses the matching project quota header and exact localId without exposing the access token',async()=>{
    const getAccessToken=vi.fn(async()=>({token:'private-access-token'}))
    const sourceAuth={getClient:vi.fn(async()=>({getAccessToken}))}
    const fetchImpl=vi.fn(async(_url:string,init?:RequestInit)=>new Response(JSON.stringify({users:[{localId:'uid-1',email:'Human@Jenfu.com.tw',emailVerified:true,validSince:'123'}]}),{status:200}))
    const result=await readFirebaseAccountWithUserAdc({projectId:'jenfu-platform-nonprod',subject:'uid-1',sourceAuth:sourceAuth as never,fetchImpl:fetchImpl as never})
    expect(result).toEqual({disabled:false,email:'human@jenfu.com.tw',emailVerified:true,validSinceSeconds:123})
    expect(fetchImpl).toHaveBeenCalledWith('https://identitytoolkit.googleapis.com/v1/projects/jenfu-platform-nonprod/accounts:lookup',expect.objectContaining({
      method:'POST',headers:expect.objectContaining({'x-goog-user-project':'jenfu-platform-nonprod'}),body:JSON.stringify({localId:['uid-1']}),
    }))
    expect(JSON.stringify(result)).not.toContain('private-access-token')
  })

  it('fails closed on a missing, mismatched, or invalid account readback',async()=>{
    const sourceAuth={getClient:vi.fn(async()=>({getAccessToken:async()=>({token:'access'})}))}
    for(const body of [{users:[]},{users:[{localId:'other',validSince:'0'}]},{users:[{localId:'uid-1',validSince:'invalid'}]}]){
      const fetchImpl=vi.fn(async()=>new Response(JSON.stringify(body),{status:200}))
      await expect(readFirebaseAccountWithUserAdc({projectId:'jenfu-platform-nonprod',subject:'uid-1',sourceAuth:sourceAuth as never,fetchImpl:fetchImpl as never})).rejects.toThrow('lookup mismatch')
    }
  })
})
