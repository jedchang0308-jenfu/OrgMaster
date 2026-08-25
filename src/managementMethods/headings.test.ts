import { describe, expect, it } from 'vitest'
import {
  collectManagementMethodHeadings,
  hasUsefulManagementMethodChapterNavigation,
  managementMethodHeadingId,
} from './headings'
import type { EditorDocumentV1 } from './types'

describe('management method headings', () => {
  it('collects only authored non-empty headings in document order', () => {
    const document: EditorDocumentV1 = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '前言' }] },
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '原則' }] },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [
            { type: 'text', text: '例外', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' 處理' },
          ],
        },
        { type: 'heading', attrs: { level: 2 }, content: [] },
      ],
    }

    expect(collectManagementMethodHeadings(document)).toEqual([
      { id: 'management-method-heading-1', level: 1, text: '原則' },
      { id: 'management-method-heading-2', level: 3, text: '例外 處理' },
    ])
  })

  it('does not show chapter navigation for a short one-heading document', () => {
    expect(hasUsefulManagementMethodChapterNavigation([
      { id: managementMethodHeadingId(0), level: 1, text: '原則' },
    ])).toBe(false)
    expect(hasUsefulManagementMethodChapterNavigation([
      { id: managementMethodHeadingId(0), level: 1, text: '原則' },
      { id: managementMethodHeadingId(1), level: 2, text: '例外' },
    ])).toBe(true)
  })
})
