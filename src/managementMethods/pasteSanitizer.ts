import type { EditorDocumentV1, EditorNodeV1 } from './types'

export interface PasteSanitizeResult {
  document: EditorDocumentV1
  remoteImages: string[]
  unsupportedImages: string[]
}

function textNode(text: string): EditorNodeV1 { return { type: 'text', text } }
function inlineChildren(element: Element): EditorNodeV1[] {
  const nodes: EditorNodeV1[] = []
  element.childNodes.forEach((child) => {
    if (child.nodeType === 3) { if (child.textContent) nodes.push(textNode(child.textContent)); return }
    if (!(child instanceof Element)) return
    const tag = child.tagName.toLowerCase()
    if (tag === 'br') { nodes.push({ type: 'hardBreak' }); return }
    if (tag === 'a') { const href = child.getAttribute('href') ?? ''; if (/^(https?:|mailto:|\/)/i.test(href)) nodes.push({ type: 'text', text: child.textContent ?? '', marks: [{ type: 'link', attrs: { href } }] }); else nodes.push(...inlineChildren(child)); return }
    if (tag === 'strong' || tag === 'b' || tag === 'em' || tag === 'i' || tag === 'u' || tag === 's' || tag === 'code') {
      const mark = tag === 'strong' || tag === 'b' ? 'bold' : tag === 'em' || tag === 'i' ? 'italic' : tag === 'u' ? 'underline' : tag === 's' ? 'strike' : 'code'
      inlineChildren(child).forEach((node) => { if (node.type === 'text') nodes.push({ ...node, marks: [...(node.marks ?? []), { type: mark as 'bold' }] }); else nodes.push(node) })
      return
    }
    nodes.push(...inlineChildren(child))
  })
  return nodes
}

function blockNodes(element: Element, remoteImages: string[], unsupportedImages: string[]): EditorNodeV1[] {
  const nodes: EditorNodeV1[] = []
  element.childNodes.forEach((child) => {
    if (child.nodeType === 3) { const text = child.textContent?.trim(); if (text) nodes.push({ type: 'paragraph', content: [textNode(text)] }); return }
    if (!(child instanceof Element)) return
    const tag = child.tagName.toLowerCase()
    if (/^h[1-3]$/.test(tag)) { nodes.push({ type: 'heading', attrs: { level: Number(tag.slice(1)) }, content: inlineChildren(child) }); return }
    if (tag === 'p' || tag === 'div' || tag === 'section') { nodes.push({ type: 'paragraph', content: inlineChildren(child) }); return }
    if (tag === 'blockquote') { nodes.push({ type: 'blockquote', content: [{ type: 'paragraph', content: inlineChildren(child) }] }); return }
    if (tag === 'ul' || tag === 'ol') {
      const listItems = [...child.children].filter((item) => item.tagName.toLowerCase() === 'li').map((item) => ({ type: 'listItem' as const, content: [{ type: 'paragraph' as const, content: inlineChildren(item) }] }))
      nodes.push({ type: tag === 'ul' ? 'bulletList' : 'orderedList', content: listItems }); return
    }
    if (tag === 'table') {
      const rows = [...child.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tr')].slice(0, 50).map((row) => ({ type: 'tableRow' as const, content: [...row.children].slice(0, 12).map((cell) => ({ type: cell.tagName.toLowerCase() === 'th' ? 'tableHeader' as const : 'tableCell' as const, content: [{ type: 'paragraph' as const, content: inlineChildren(cell) }] })) }))
      nodes.push({ type: 'table', content: rows }); return
    }
    if (tag === 'img') {
      const src = child.getAttribute('src') ?? ''
      if (/^data:image\/(png|jpeg|webp);base64,/i.test(src)) { nodes.push({ type: 'methodImage', attrs: { mediaId: `paste:${src.slice(0, 48)}`, altText: child.getAttribute('alt') ?? '', caption: '' } }); return }
      if (/^blob:/i.test(src) || /^https?:/i.test(src)) { remoteImages.push(src); return }
      unsupportedImages.push(src || 'unknown'); return
    }
    nodes.push(...blockNodes(child, remoteImages, unsupportedImages))
  })
  return nodes
}

export function sanitizeGoogleDocsHtml(html: string): PasteSanitizeResult {
  const parser = new DOMParser()
  const parsed = parser.parseFromString(html, 'text/html')
  const remoteImages: string[] = []
  const unsupportedImages: string[] = []
  const content = blockNodes(parsed.body, remoteImages, unsupportedImages)
  return { document: { type: 'doc', content: content.length ? content : [{ type: 'paragraph', content: [] }] }, remoteImages, unsupportedImages }
}

export function plainTextDocument(text: string): EditorDocumentV1 {
  return { type: 'doc', content: text.split(/\r?\n/).map((line) => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] })) }
}
