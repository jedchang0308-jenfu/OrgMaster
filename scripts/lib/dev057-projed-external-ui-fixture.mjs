// Test-only operator surface. The production component sends every request to
// the real loopback owner HTTP server with the existing fixture Session.
import { JSDOM } from 'jsdom'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { GovernanceProjedExternal } from '../../src/components/GovernanceProjedExternal.tsx'

const managementPath = '/api/orgmaster/projed-external-requests/v1'

export async function openProjedExternalOperator({ origin, adminCookie, principalId }) {
  const target = new URL(origin)
  if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1' || !target.port
    || target.pathname !== '/' || target.search || target.hash || target.username || target.password
    || !adminCookie.startsWith('orgmaster_session=') || !principalId) {
    throw new Error('PROJED_EXTERNAL_OPERATOR_FIXTURE_TARGET_INVALID')
  }
  const dom = new JSDOM('<!doctype html><html><body><main></main></body></html>', { url: target.href })
  const originals = new Map()
  const install = (name, value) => {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
  }
  const nativeFetch = globalThis.fetch
  const requests = []
  let inFlight = 0
  let closed = false
  for (const name of ['window', 'document', 'HTMLElement', 'Node']) install(name, dom.window[name])
  install('IS_REACT_ACT_ENVIRONMENT', true)
  install('fetch', async (input, options) => {
    // This adapter adds the browser's same-origin Session/Origin only to the
    // exact management route. It never substitutes an owner API response.
    if (input !== managementPath) {
      // The orchestration can still call the other real loopback services while
      // this operator screen is open; their credentials remain unchanged.
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port) {
        throw new Error('PROJED_EXTERNAL_OPERATOR_UNEXPECTED_REQUEST')
      }
      return nativeFetch(input, options)
    }
    inFlight++
    try {
      const response = await nativeFetch(new URL(managementPath, target), {
        ...options, headers: { ...options?.headers, cookie: adminCookie, origin: target.origin },
      })
      requests.push({ method: options?.method ?? 'GET', status: response.status,
        ...(options?.body ? { command: JSON.parse(options.body) } : {}) })
      return response
    } finally { inFlight-- }
  })
  const host = dom.window.document.querySelector('main')
  const root = createRoot(host)
  const idle = async () => {
    for (let attempt = 0; attempt < 250; attempt++) {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
      if (inFlight === 0 && ![...host.querySelectorAll('button')].some(button => button.disabled)) return
    }
    throw new Error('PROJED_EXTERNAL_OPERATOR_DID_NOT_SETTLE')
  }
  const close = async () => {
    if (closed) return
    closed = true
    try { await act(async () => root.unmount()) }
    finally {
      for (const [name, descriptor] of [...originals].reverse()) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor)
        else delete globalThis[name]
      }
      dom.window.close()
    }
  }
  try {
    await act(async () => root.render(createElement(GovernanceProjedExternal, { canManage: true, principalId })))
    await idle()
    return {
      requests,
      text: () => host.textContent,
      async click({ boardId, contactEmail, label }) {
        const row = [...host.querySelectorAll('tbody tr')].find(item => item.textContent.includes(boardId) && item.textContent.includes(contactEmail))
        const button = row && [...row.querySelectorAll('button')].find(item => item.textContent === label)
        if (!button || button.disabled) throw new Error('PROJED_EXTERNAL_OPERATOR_ACTION_UNAVAILABLE')
        await act(async () => button.click())
        await idle()
      },
      async reload() {
        await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === '重新載入').click())
        await idle()
      },
      close,
    }
  } catch (error) { await close(); throw error }
}
