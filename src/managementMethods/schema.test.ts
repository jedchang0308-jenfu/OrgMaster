import { describe, expect, it } from 'vitest'
import { collectMediaIds, validateEditorDocument, validateEditorSemantics } from './schema'
import { plainTextDocument } from './pasteSanitizer'

describe('management method editor schema', () => {
  it('accepts free rich text and collects media references', () => {
    const document = { type: 'doc' as const, content: [{ type: 'heading' as const, attrs: { level: 2 }, content: [{ type: 'text' as const, text: '原則' }] }, { type: 'methodImage' as const, attrs: { mediaId: 'media-1', altText: '圖' } }] }
    expect(validateEditorDocument(document).ok).toBe(true)
    expect(validateEditorSemantics(document)).toEqual([])
    expect(collectMediaIds(document)).toEqual(['media-1'])
  })
  it('rejects unsafe links and unsupported heading levels', () => {
    const document = { type: 'doc' as const, content: [{ type: 'heading' as const, attrs: { level: 4 }, content: [] }, { type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'x', marks: [{ type: 'link' as const, attrs: { href: 'javascript:alert(1)' } }] }] }] }
    expect(validateEditorSemantics(document).length).toBe(2)
    expect(plainTextDocument('a\nb').content).toHaveLength(2)
  })
})
