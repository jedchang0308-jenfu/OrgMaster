/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkAppUpdate } from './appUpdate'

describe('application update detection', () => {
  beforeEach(() => {
    document.head.innerHTML = '<script type="module" src="/assets/index-old.js"></script>'
  })
  afterEach(() => { vi.unstubAllGlobals(); document.head.innerHTML = '' })

  it.each([
    ['/assets/index-old.js', false], ['/assets/index-new.js', true],
  ])('compares server entry %s without cached fetch or navigation', async (src, available) => {
    const fetcher = vi.fn(async () => new Response(`<script type="module" src="${src}"></script>`, { headers: { 'Content-Type': 'text/html' } }))
    vi.stubGlobal('fetch', fetcher)
    expect(await checkAppUpdate()).toBe(available)
    expect(fetcher).toHaveBeenCalledWith(new URL('/', window.location.origin), expect.objectContaining({ cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: expect.any(AbortSignal) }))
  })

  it.each([
    [503, 'text/html', '<p>unavailable</p>'],
    [200, 'application/json', '{}'],
    [200, 'text/html', '<p>Login</p>'],
    [200, 'text/html', '<script type="module" src="https://other.example/app.js"></script>'],
  ])('rejects invalid server response %s / %s', async (status, type, body) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status, headers: { 'Content-Type': type } })))
    await expect(checkAppUpdate()).rejects.toThrow()
  })
  it('propagates network failure for the retry UI', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await expect(checkAppUpdate()).rejects.toThrow('offline')
  })
  it('detects a CSS-only release with an unchanged JavaScript entry', async () => {
    document.head.insertAdjacentHTML('beforeend', '<link rel="stylesheet" href="/assets/index-old.css">')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<script type="module" src="/assets/index-old.js"></script><link rel="stylesheet" href="/assets/index-new.css">', { headers: { 'Content-Type': 'text/html' } })))
    expect(await checkAppUpdate()).toBe(true)
  })
})
