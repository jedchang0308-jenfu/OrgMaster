import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('management method scroll surface', () => {
  it('owns vertical scrolling when the application root hides document overflow', () => {
    const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
    const rule = css.match(/\.management-methods-page,\s*\.management-method-document-page\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(rule).toMatch(/height:\s*100%/)
    expect(rule).toMatch(/min-height:\s*0/)
    expect(rule).toMatch(/overflow-y:\s*auto/)
    expect(rule).not.toMatch(/min-height:\s*100vh/)
  })
})
