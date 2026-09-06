import assert from 'node:assert/strict'
import test from 'node:test'

import { loadN1cOrgmasterConfig } from './dev010-n1c-orgmaster-package.mjs'

const config = loadN1cOrgmasterConfig()

test('N1C-ORG-SOURCE-01 source freeze requires a clean candidate and exact output prefix', () => {
  assert.equal(config.sourceFreeze.requiredCleanCandidate, true)
  assert.equal(config.sourceFreeze.outputPrefix, 'output/dev-010/n1c/')
})

test('N1C-ORG-SOURCE-02 allowlist contains only the two contract-approved modified files', () => {
  assert.deepEqual(config.sourceFreeze.allowModify, ['package.json', 'server/orgmasterDatabase.ts'])
  assert.ok(config.sourceFreeze.allowNew.includes('scripts/dev010-n1c-source-freeze.mjs'))
  assert.ok(config.sourceFreeze.allowNew.includes('config/dev-010/n1c-orgmaster-plan-allowlist.json'))
  assert.ok(!config.sourceFreeze.allowNew.some((item) => item.startsWith('src/')))
})

test('N1C-ORG-SOURCE-03 old staging and production mutations are fixed at zero', () => {
  assert.equal(config.safety.productionWrites, false)
  assert.equal(config.safety.oldStagingMutations, 0)
  assert.equal(config.safety.billingChanges, 0)
  assert.equal(config.safety.externalDeliveries, 0)
  assert.equal(config.safety.runtimeServices, 0)
})
