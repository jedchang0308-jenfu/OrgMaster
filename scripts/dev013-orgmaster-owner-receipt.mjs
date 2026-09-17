import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildOwnerReceipt, loadProfile } from './lib/dev013-orgmaster-staging-release.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function parse(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (!key.startsWith('--') || !argv[index + 1]) throw new Error(`Invalid argument: ${key}`)
    result[key.slice(2)] = argv[index + 1]
    index += 1
  }
  return result
}

function read(value) {
  return JSON.parse(fs.readFileSync(path.resolve(root, value), 'utf8'))
}

export function runOwnerReceipt(argv = process.argv.slice(2)) {
  const input = parse(argv)
  for (const name of ['source-freeze', 'terraform-output', 'service-readback', 'identity-readback', 'output']) if (!input[name]) throw new Error(`Missing --${name}`)
  const receipt = buildOwnerReceipt({ freeze: read(input['source-freeze']), terraformOutput: read(input['terraform-output']), serviceReadback: read(input['service-readback']), identityReadback: read(input['identity-readback']) }, loadProfile())
  const output = path.resolve(root, input.output)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`)
  return { output: path.relative(root, output).replaceAll('\\', '/'), receipt }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = runOwnerReceipt()
    process.stdout.write(`${JSON.stringify({ status: result.receipt.status, output: result.output, receiptSha256: result.receipt.receiptSha256, releaseAuthority: false })}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
