import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createDisposablePostgresManager} from './lib/dev014-disposable-postgres.mjs'
import {verifyFmsProjectionCurrent} from './lib/dev070-fms-projection-current-postgres-qc.mjs'
const manager=createDisposablePostgresManager(),handle=await manager.startDisposablePostgres({purpose:'DEV070 073 fixed FMS administrator projection regression'})
try{console.log(JSON.stringify(await verifyFmsProjectionCurrent({admin:handle.client,root:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')})))}finally{await manager.stopDisposablePostgres(handle)}
