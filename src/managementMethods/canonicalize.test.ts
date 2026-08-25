import { describe, expect, it } from 'vitest'
import { canonicalizeEditorDocument } from './canonicalize'

describe('management method canonicalization', () => {
  it('normalizes key order, undefined attrs and color casing without changing content order', () => {
    const document = { type: 'doc' as const, content: [{ type: 'paragraph' as const, attrs: { z: 1, color: '#AABBCC', ignored: undefined }, content: [{ type: 'text' as const, text: '第一行', marks: [{ type: 'textStyle' as const, attrs: { color: '#AABBCC' } }, { type: 'bold' as const }] }] }] }
    const normalized = canonicalizeEditorDocument(document)
    expect(normalized.content[0].attrs).toEqual({ color: '#aabbcc', z: 1 })
    expect(normalized.content[0].content?.[0].marks?.map((mark) => mark.type)).toEqual(['bold', 'textStyle'])
    expect(normalized.content[0].content?.[0].marks?.[1].attrs?.color).toBe('#aabbcc')
  })
})
