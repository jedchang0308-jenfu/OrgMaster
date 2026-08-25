import { describe, expect, it } from 'vitest'
import { managementMethodImageNode, managementMethodImageWidth } from './imageEditing'

describe('management method image editing', () => {
  it('creates a persistent image node without saving a temporary source URL', () => {
    expect(managementMethodImageNode({ mediaId: 'media-1', altText: '招募平台畫面' })).toEqual({
      type: 'methodImage',
      attrs: { mediaId: 'media-1', altText: '招募平台畫面', caption: '', width: null },
    })
  })

  it('accepts only the image width range supported by the document contract', () => {
    expect(managementMethodImageWidth(160)).toBe(160)
    expect(managementMethodImageWidth(900)).toBe(900)
    expect(managementMethodImageWidth(1200)).toBe(1200)
    expect(managementMethodImageWidth(159)).toBeNull()
    expect(managementMethodImageWidth('640')).toBeNull()
  })
})
