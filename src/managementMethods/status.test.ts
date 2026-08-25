import { describe, expect, it } from 'vitest'
import { deriveMethodStatus } from './status'

const draft = { bodyHash: 'hash', revision: 'r', bodyFormat: 'editor-json-v1' as const, body: { type: 'doc' as const, content: [] }, mediaIds: [], updatedByPrincipalId: 'p', updatedAt: 'now' }
describe('management method status', () => {
  it('derives readable lifecycle from whole-document equality', () => {
    expect(deriveMethodStatus({ title: 'A', ownerEmployeeId: 'e1', workingDraft: draft, readableSnapshot: null })).toBe('建置中')
    const snapshot = { title: 'A', ownerEmployeeId: 'e1', bodyFormat: 'editor-json-v1' as const, body: { type: 'doc' as const, content: [] }, bodyHash: 'hash', sourceDraftRevision: 'r', mediaIds: [], providedByPrincipalId: 'p', providedAt: 'now' }
    expect(deriveMethodStatus({ title: 'A', ownerEmployeeId: 'e1', workingDraft: draft, readableSnapshot: snapshot })).toBe('可供公司閱讀')
    expect(deriveMethodStatus({ title: 'B', ownerEmployeeId: 'e1', workingDraft: draft, readableSnapshot: snapshot })).toBe('有未提供更新')
  })
})
