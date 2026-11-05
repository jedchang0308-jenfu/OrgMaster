import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { createDefaultFinancialCatalogInitializationOwnerReader, createFinancialCatalogInitializationHttpReader, FMS_INITIALIZATION_CANONICAL_ORIGIN, FMS_INITIALIZATION_HANDOFF_PATH } from './financialCatalogInitializationOwnerHttp'
import { FINANCIAL_ADMINISTRATIVE_DEFINITION_HASH } from '../src/governance/financialCatalog'
const operationId = '10000000-0000-4000-8000-000000000070'
const input = { operationId, principalId: 'verified-root', employeeId: 'employee', authenticatedAt: '2026-11-06T00:00:00.000Z', assuranceLevel: 'aal1' as const, principalAuthEpoch: 7,
  catalogVersion: 'fms-owned-version', contentSha256: 'a'.repeat(64), artifactSha256: 'b'.repeat(64), sourceDraftId: 'actual-draft', sourceDraftRevision: 2 }
const packet = { schemaVersion: 'fms.catalog-initialization-handoff.v1', operationId, initializationReceiptId: 'real-publish-receipt', receiptBodySha256: 'c'.repeat(64),
  principalId: input.principalId, employeeId: input.employeeId, sourceRoleDefinitionHash: FINANCIAL_ADMINISTRATIVE_DEFINITION_HASH,
  issuance: { rootGrantId: operationId, administrationVersion: '1', publishedPolicyId: 'original-root-publication', publishedAt: input.authenticatedAt }, release: {}, previousRelease: {} }
describe('canonical FMS owner immutable readback client', () => {
  it('derives only exact actor fields and selectors and pins the canonical token destination', async () => {
    const request = vi.fn().mockResolvedValue(packet)
    const readback = await createFinancialCatalogInitializationHttpReader({ request, now: () => input.authenticatedAt }).read(input)
    expect(request).toHaveBeenCalledWith(FMS_INITIALIZATION_CANONICAL_ORIGIN + FMS_INITIALIZATION_HANDOFF_PATH, {
      schemaVersion: 'fms.catalog-initialization-handoff-request.v1', operationId,
      actor: { principalId: input.principalId, employeeId: input.employeeId, authenticatedAt: input.authenticatedAt, aal: 1, authEpoch: 7 },
      selectors: { version: input.catalogVersion, contentSha256: input.contentSha256, artifactSha256: input.artifactSha256, sourceDraftId: input.sourceDraftId, sourceDraftRevision: 2 },
    })
    expect(readback).toMatchObject({ source: 'formal', operationId, publishReceiptId: packet.initializationReceiptId, receiptBodySha256: packet.receiptBodySha256 })
  })
  it.each(['operation', 'principal', 'employee', 'hash', 'role', 'extra-key'])('fails closed for mismatched %s evidence', async change => {
    const value = structuredClone(packet) as Record<string, unknown>
    if (change === 'operation') value.operationId = 'other-operation'
    if (change === 'principal') value.principalId = 'same-employee-other-principal'
    if (change === 'employee') value.employeeId = 'other-employee'
    if (change === 'hash') value.receiptBodySha256 = 'claimed'
    if (change === 'role') value.sourceRoleDefinitionHash = 'f'.repeat(64)
    if (change === 'extra-key') value.actorProof = { bootstrap: true }
    await expect(createFinancialCatalogInitializationHttpReader({ request: async () => value }).read(input)).rejects.toMatchObject({ code: 'FINANCIAL_CATALOG_UNAVAILABLE' })
  })
  it('does not turn provider failure into a claimed browser release or create a non-production default transport', async () => {
    await expect(createFinancialCatalogInitializationHttpReader({ request: async () => { throw new Error('provider unavailable') } }).read(input)).rejects.toMatchObject({ code: 'FINANCIAL_CATALOG_UNAVAILABLE' })
    expect(createDefaultFinancialCatalogInitializationOwnerReader({ NODE_ENV: 'development', K_SERVICE: 'orgmaster-prod' })).toBeUndefined()
    expect(createDefaultFinancialCatalogInitializationOwnerReader({ NODE_ENV: 'production', K_SERVICE: 'other-service' })).toBeUndefined()
  })
  it('pins the exact vendored FMS read-only packet including its final newline', async () => {
    const raw = await readFile(new URL('../contracts/fms-catalog-initialization-handoff/v1/contract-manifest.json', import.meta.url))
    expect(createHash('sha256').update(raw).digest('hex')).toBe('52699e288793f93a2a67ac2a1bfbea27c74599c39339769cb840efdb557d410c')
    const manifest = JSON.parse(raw.toString()), signature = await readFile(new URL('../contracts/fms-catalog-initialization-handoff/v1/projection-signature.json', import.meta.url))
    expect(createHash('sha256').update(signature).digest('hex')).toBe(manifest.files['projection-signature.json'])
  })
})
