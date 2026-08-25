import { describe, expect, it } from 'vitest'
import { FakeManagementMethodDraftGenerator, OpenAiManagementMethodDraftGenerator } from './managementMethodAi'

describe('management method AI adapters', () => {
  it('creates a deterministic local draft without inventing a fixed workflow', async () => {
    const input = { creationRequestId: crypto.randomUUID(), requestedTitle: null, goalAndPurpose: '維持設備保養原則', confirmedCurrentFacts: '由現場主管依設備狀況安排', confirmedTargetRules: '保留必要紀錄', existingContent: null, selectedMedia: [] }
    const generated = await new FakeManagementMethodDraftGenerator().generate(input)
    expect(generated.meta.provider).toBe('fake')
    expect(generated.body.content[0].type).toBe('heading')
    expect(JSON.stringify(generated.body)).not.toContain('待確認')
  })
  it('fails closed when production provider configuration is missing', () => {
    try {
      new OpenAiManagementMethodDraftGenerator('', '')
      throw new Error('expected missing provider configuration')
    } catch (error) {
      expect(error).toMatchObject({ code: 'AI_PROVIDER_NOT_CONFIGURED' })
    }
  })
})
