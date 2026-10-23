import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') return {url:'data:text/javascript,export%20%7B%7D;',shortCircuit:true}
  if (specifier === 'next/server') specifier = 'next/server.js'
  if (specifier.startsWith('@/')) {
    const root = process.env.PDM_DEV123_ROOT
    if (!root || !path.isAbsolute(root)) throw new Error('PDM_DEV123_ROOT_REQUIRED')
    const base = path.join(root,'src',specifier.slice(2))
    const match = [base+'.ts',base+'.tsx',path.join(base,'index.ts')].find(p=>fs.existsSync(p))
    if (!match) throw new Error('NATIVE_ALIAS_NOT_FOUND:'+specifier)
    return {url:pathToFileURL(match).href,shortCircuit:true}
  }
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const url = new URL(specifier,context.parentURL)
    if (!/\.[a-z0-9]+$/iu.test(url.pathname)) {
      const candidate = new URL(url.href+'.ts')
      if (fs.existsSync(fileURLToPath(candidate))) return {url:candidate.href,shortCircuit:true}
    }
  }
  return nextResolve(specifier,context)
}
export async function load(url,context,nextLoad) {
  if (url.endsWith('.json') && !context.importAttributes?.type) return nextLoad(url,{...context,importAttributes:{type:'json'}})
  return nextLoad(url,context)
}
