import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ManagementMethodV1 } from '../../managementMethods/types'
import { ManagementMethodReader } from './ManagementMethodReader'

const method: ManagementMethodV1 = {
  id: 'method-1',
  code: 'MP-0001',
  creationRequestId: 'request-1',
  creationInputHash: 'input-hash',
  title: '自由管理辦法',
  ownerEmployeeId: null,
  methodRevision: 'method-revision-1',
  workingDraft: {
    bodyFormat: 'editor-json-v1',
    body: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '原則' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '自由內容' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '例外' }] },
      ],
    },
    bodyHash: 'body-hash',
    revision: 'draft-revision-1',
    mediaIds: [],
    updatedByPrincipalId: 'principal-1',
    updatedAt: '2026-08-25T00:00:00.000Z',
  },
  readableSnapshot: null,
  generationMeta: {
    provider: 'fake',
    model: 'fake',
    promptVersion: 'management-method-draft-v1',
    providerRequestId: null,
    durationMs: 0,
    inputTokens: null,
    outputTokens: null,
    generatedAt: '2026-08-25T00:00:00.000Z',
  },
  createdByPrincipalId: 'principal-1',
  createdAt: '2026-08-25T00:00:00.000Z',
  updatedByPrincipalId: 'principal-1',
  updatedAt: '2026-08-25T00:00:00.000Z',
}

describe('ManagementMethodReader', () => {
  it('adds anchors only to headings authored in the free document', () => {
    const html = renderToStaticMarkup(<ManagementMethodReader method={method} view="draft" />)

    expect(html).toContain('id="management-method-heading-1"')
    expect(html).toContain('id="management-method-heading-2"')
    expect(html).not.toContain('management-method-heading-3')
    expect(html).toContain('自由內容')
  })
})
