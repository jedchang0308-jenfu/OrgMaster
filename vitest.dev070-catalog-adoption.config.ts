import { isAbsolute, resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
const fmsRoot = process.env.DEV070_FMS_ROOT
if (!fmsRoot || !isAbsolute(fmsRoot) || JSON.parse(readFileSync(resolve(fmsRoot, 'package.json'), 'utf8')).name !== 'jf-fms') throw new Error('DEV070_ACTUAL_FMS_SOURCE_ROOT_REQUIRED')
export default defineConfig({
  resolve: { alias: { '@': fmsRoot } },
  test: { include: ['server/financialCatalogInitializationAdoption.postgres.test.ts'], env: {
    DEV070_RUN_POSTGRES: '1', DEV070_FMS_INITIALIZATION_CONSUMER_MODULE: resolve(fmsRoot, 'lib/server/configuration/initialization-activation-confirmation.ts'),
  } },
})
