#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { buildAuthorityOperation, encodeAuthorityOperation } from './lib/dev013-production-authority-switch.mjs'

function parse(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    if (!['--kind', '--source-revision', '--deadline-at', '--evidence', '--output'].includes(key) || !argv[index + 1]) throw new Error('DEV013_AUTHORITY_MANIFEST_ARGUMENT_INVALID')
    result[key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())] = argv[index + 1]
  }
  if (!['preflight', 'switch', 'rollback'].includes(result.kind) || !result.sourceRevision || !result.deadlineAt || !result.output || (result.kind !== 'preflight' && !result.evidence)) throw new Error('DEV013_AUTHORITY_MANIFEST_ARGUMENT_INVALID')
  return result
}

export function run({ argv = process.argv.slice(2), cwd = process.cwd() } = {}) {
  const args = parse(argv)
  const evidence = args.evidence ? JSON.parse(fs.readFileSync(path.resolve(cwd, args.evidence), 'utf8')) : null
  const operation = buildAuthorityOperation({ operationKind: args.kind, sourceRevision: args.sourceRevision, deadlineAt: args.deadlineAt, evidence })
  const encoded = encodeAuthorityOperation(operation)
  const output = path.resolve(cwd, args.output)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, encoded.bytes, { flag: 'wx' })
  fs.writeFileSync(`${output}.sha256`, `${encoded.sha256}  ${path.basename(output)}\n`, { flag: 'wx' })
  return { output, sha256: encoded.sha256, operationId: operation.operationId }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(run())}\n`) } catch (error) { process.stderr.write(`${error.code || error.message}\n`); process.exitCode = 1 }
}
