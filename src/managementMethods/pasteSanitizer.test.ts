import { describe, expect, it, beforeEach } from 'vitest'
import { JSDOM } from 'jsdom'
import { sanitizeGoogleDocsHtml } from './pasteSanitizer'

describe('Google Docs paste sanitizer', () => {
  beforeEach(() => { const dom = new JSDOM('<!doctype html><body></body>'); Object.assign(globalThis, { DOMParser: dom.window.DOMParser, Element: dom.window.Element }) })
  it('keeps heading, table and safe link while reporting remote image', () => {
    const result = sanitizeGoogleDocsHtml('<h2>標題</h2><p><a href="https://example.com">連結</a><script>alert(1)</script></p><table><tr><th>A</th><td>B</td></tr></table><img src="https://example.com/x.png">')
    expect(result.document.content.map((node) => node.type)).toEqual(['heading', 'paragraph', 'table'])
    expect(result.remoteImages).toEqual(['https://example.com/x.png'])
    expect(JSON.stringify(result.document)).not.toContain('script')
  })
})
