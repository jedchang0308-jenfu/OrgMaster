import type { EditorDocumentV1, EditorNodeV1 } from './types'

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, item]) => typeof item !== 'undefined').sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]))
}

function normalizeNode(node: EditorNodeV1): EditorNodeV1 {
  const attrs = node.attrs ? Object.fromEntries(Object.entries(node.attrs).filter(([, value]) => value !== undefined).map(([key, value]) => [key, key === 'color' && typeof value === 'string' ? value.toLowerCase() : value])) : undefined
  const marks = node.marks?.map((mark) => ({ ...mark, attrs: mark.attrs ? Object.fromEntries(Object.entries(mark.attrs).filter(([, value]) => value !== undefined).map(([key, value]) => [key, key === 'color' && typeof value === 'string' ? value.toLowerCase() : value])) : undefined })).sort((a, b) => a.type.localeCompare(b.type))
  return {
    type: node.type,
    ...(attrs && Object.keys(attrs).length ? { attrs } : {}),
    ...(typeof node.text === 'string' ? { text: node.text } : {}),
    ...(marks?.length ? { marks } : {}),
    ...(node.content ? { content: node.content.map(normalizeNode) } : {}),
  }
}

export function canonicalizeEditorDocument(document: EditorDocumentV1) {
  return stable(normalizeNode(document)) as EditorDocumentV1
}

export function canonicalJson(value: unknown) { return JSON.stringify(stable(value)) }

export async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function editorBodyHash(document: EditorDocumentV1) { return sha256Hex(canonicalJson(canonicalizeEditorDocument(document))) }
