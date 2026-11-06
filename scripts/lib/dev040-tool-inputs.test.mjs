import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import test from 'node:test'
import {TOOL_RECIPES,toolExecutableInputs} from './dev040-tool-image-rotation.mjs'

test('fixed recipe manifests keep migration/diagnostic independent and bind readback helper, source assets and scoped attributes',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'orgmaster-tool-inputs-'))
 const git=args=>{
  const result=spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true})
  assert.equal(result.status,0,result.stderr);return result.stdout.trim()
 }
 try{
  const files=new Set(['.gitattributes','.dockerignore','config/catalogs/.gitattributes'])
  for(const recipe of TOOL_RECIPES){
   files.add(recipe)
   const text=await readFile(recipe,'utf8')
   for(const line of text.split(/\r?\n/u).filter(line=>line.startsWith('COPY ')))
    for(const file of line.trim().split(/\s+/u).slice(1,-1))files.add(file)
  }
  for(const file of files){const target=path.join(root,file);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,await readFile(file))}
  git(['init','--quiet']);git(['config','user.name','Tool Input Fixture']);git(['config','user.email','fixture@example.invalid'])
  const commit=()=>{git(['add','.']);git(['commit','--quiet','-m','owned fixture inputs']);return git(['rev-parse','HEAD'])}
  const before=commit(),original=TOOL_RECIPES.map(recipe=>toolExecutableInputs(root,before,recipe))
  assert.deepEqual(toolExecutableInputs(root,before),original[0])
  const names=original[2].map(row=>row.path)
  for(const required of ['src/governance/aiPdmStaticV8Catalog.ts','config/catalogs/ai-pdm-role-catalog.v8.json',
   'config/catalogs/.gitattributes','scripts/dev070-catalog-runtime-smoke.mjs'])assert.ok(names.includes(required),required)
  assert.equal(original[0].some(row=>row.path==='config/catalogs/ai-pdm-role-catalog.v8.json'),false)
  for(const changed of ['config/catalogs/ai-pdm-role-catalog.v8.json','src/governance/aiPdmStaticV8Catalog.ts','config/catalogs/.gitattributes']){
   await writeFile(path.join(root,changed),(await readFile(path.join(root,changed),'utf8'))+'\n# changed fixture input\n')
   const after=commit()
   assert.deepEqual(toolExecutableInputs(root,after,TOOL_RECIPES[0]),original[0])
   assert.deepEqual(toolExecutableInputs(root,after,TOOL_RECIPES[1]),original[1])
   assert.notDeepEqual(toolExecutableInputs(root,after,TOOL_RECIPES[2]),original[2])
  }
  assert.throws(()=>toolExecutableInputs(root,before,'Dockerfile'),/TOOL_ROTATION_RECIPE_INVALID/)
 }finally{
  assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('orgmaster-tool-inputs-'))
  await rm(root,{recursive:true,force:true})
 }
})
