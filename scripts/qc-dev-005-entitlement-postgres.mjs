#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const orgMasterRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const platformRoot = resolve(orgMasterRoot, '..', 'Jenfu-Management-system')
const runner = resolve(platformRoot, 'scripts', 'qc-dev-005-postgres.mjs')
const result = spawnSync(process.execPath, [runner], {
  cwd: platformRoot,
  env: process.env,
  encoding: 'utf8',
  windowsHide: true,
  stdio: 'inherit',
})

if (result.error) throw result.error
process.exitCode = result.status ?? 1
