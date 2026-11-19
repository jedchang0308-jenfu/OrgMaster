import {createHash} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
const root=new URL('../contracts/orgmaster-fms-catalog-initialization-activation/v1/',import.meta.url)
const hash=value=>createHash('sha256').update(value).digest('hex')
const files={}
for(const name of ['schema.json','signature.json','vectors.json'])files[name]=hash(await readFile(new URL(name,root)))
const manifest={contractVersion:'orgmaster.fms-catalog-initialization-activation.v1',recordVersion:'orgmaster.fms-catalog-initialization-activation-record.v1',producer:'orgmaster',consumer:'financial-management-system',transport:'point-only SQL SECURITY DEFINER; exact fms_runtime EXECUTE',files}
const bytes=JSON.stringify(manifest,null,2)+'\n',path=new URL('manifest.json',root)
if(process.argv.includes('--write'))await writeFile(path,bytes)
else if(await readFile(path,'utf8')!==bytes)throw new Error('FMS_INITIALIZATION_ACTIVATION_CONTRACT_DRIFT')
console.log(JSON.stringify({contractVersion:manifest.contractVersion,manifestSha256:hash(bytes),path:fileURLToPath(path)}))
