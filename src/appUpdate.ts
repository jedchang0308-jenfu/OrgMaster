function entryScripts(document: Document, origin: string) {
  const entries = [...document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')]
    .map((script) => new URL(script.getAttribute('src')!, origin))
  if (entries.length === 0 || entries.some((entry) => entry.origin !== new URL(origin).origin)) {
    throw new Error('APP_UPDATE_INVALID_ENTRY')
  }
  const styles = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]')]
    .map((style) => new URL(style.getAttribute('href')!, origin))
    .filter((style) => style.origin === new URL(origin).origin)
  return [...entries, ...styles].map((entry) => entry.href).sort().join('\n')
}

export async function checkAppUpdate() {
  const origin = window.location.origin
  const current = entryScripts(document, origin)
  const response = await fetch(new URL('/', origin), {
    cache: 'no-store', credentials: 'same-origin', redirect: 'error',
    headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
    throw new Error('APP_UPDATE_CHECK_FAILED')
  }
  const latest = new DOMParser().parseFromString(await response.text(), 'text/html')
  return entryScripts(latest, origin) !== current
}
