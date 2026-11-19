import assert from 'node:assert/strict'
import {test} from 'node:test'
import {spawnSync} from 'node:child_process'
import {parseAdministrationOwnerArguments,ownerHash} from './lib/dev070-administration-owner.mjs'
test('private CLI exposes only bounded plan/verify/commit/status actions',()=>{
 assert.deepEqual(parseAdministrationOwnerArguments(['plan','--request','request.json','--output','plan.json']),{action:'plan',request:'request.json',output:'plan.json'})
 for(const action of ['verify','commit','status'])assert.equal(parseAdministrationOwnerArguments([action,'--plan','plan.json']).action,action)
 for(const args of [['initialize'],['commit','--token','secret'],['commit'],['status','--plan','one','--plan','two']])assert.throws(()=>parseAdministrationOwnerArguments(args))
})
test('canonical owner package hash ignores key order but detects changed target',()=>{assert.equal(ownerHash({b:2,a:{d:4,c:3}}),ownerHash({a:{c:3,d:4},b:2}));assert.notEqual(ownerHash({target:'one'}),ownerHash({target:'two'}))})
test('help does not connect to a database or read an identity token',()=>{const result=spawnSync(process.execPath,['scripts/dev070-initialize-platform-administrator.mjs','--help'],{encoding:'utf8',windowsHide:true,env:{...process.env,ORGMASTER_OWNER_POSTGRES_URL:''}});assert.equal(result.status,0);assert.match(result.stdout,/stdin only/);assert.equal(result.stderr,'')})

test('native Node owner CLI dependency imports resolve without executing a provider or database action',()=>{
 const source="await Promise.all(['./server/orgmasterAdministrationOwner.ts','./server/orgmasterFirebaseIdentityProvider.ts','./server/orgmasterManagedDirectoryPort.ts'].map(path=>import(path)))"
 const result=spawnSync(process.execPath,['--experimental-transform-types','--input-type=module','-e',source],{encoding:'utf8',windowsHide:true,env:{...process.env,ORGMASTER_OWNER_POSTGRES_URL:''}})
 assert.equal(result.status,0,result.stderr||result.stdout)
})
