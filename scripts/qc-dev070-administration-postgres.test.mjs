import assert from 'node:assert/strict'
import test from 'node:test'
import {spawnSync} from 'node:child_process'

test('administration PG runner refuses a missing owner adapter before creating a cluster or claiming activation',()=>{
 const environment={...process.env};delete environment.DEV070_PLATFORM_FIXTURE_MODULE
 const result=spawnSync(process.execPath,['scripts/qc-dev070-administration-postgres.mjs'],{env:environment,encoding:'utf8',windowsHide:true,timeout:10000})
 assert.equal(result.status,1);assert.match(result.stderr,/DEV070_PLATFORM_OWNER_FIXTURE_MODULE_REQUIRED/)
 assert.equal(result.stdout,'');assert.equal(result.signal,null)
})
