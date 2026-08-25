import { z } from 'zod'
import type { EditorDocumentV1, EditorNodeV1 } from './types'

const markSchema = z.object({
  type: z.enum(['bold', 'italic', 'underline', 'strike', 'code', 'link', 'textStyle']),
  attrs: z.record(z.string(), z.unknown()).optional(),
}).strict()

const nodeSchema: z.ZodType<EditorNodeV1> = z.lazy(() => z.object({
  type: z.enum(['doc', 'paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'listItem', 'table', 'tableRow', 'tableHeader', 'tableCell', 'hardBreak', 'horizontalRule', 'methodImage', 'text']),
  attrs: z.record(z.string(), z.unknown()).optional(),
  text: z.string().max(10000).optional(),
  marks: z.array(markSchema).max(20).optional(),
  content: z.array(nodeSchema).max(1000).optional(),
}).strict())

export const editorDocumentSchema = z.object({
  type: z.literal('doc'),
  content: z.array(nodeSchema).max(1000),
}).strict()

export const createInputSchema = z.object({
  creationRequestId: z.string().uuid(),
  requestedTitle: z.string().trim().max(120).nullable().optional(),
  goalAndPurpose: z.string().trim().min(1).max(20000),
  confirmedCurrentFacts: z.string().max(40000).optional().default(''),
  confirmedTargetRules: z.string().max(40000).optional().default(''),
  existingContent: z.union([
    z.object({ format: z.literal('plain-text-v1'), text: z.string().max(256000) }).strict(),
    z.object({ format: z.literal('editor-json-v1'), body: editorDocumentSchema }).strict(),
  ]).nullable().optional(),
  selectedMedia: z.array(z.object({ mediaId: z.string().min(1), altText: z.string().max(300), humanDescription: z.string().max(1000), caption: z.string().max(300).optional() }).strict()).max(50).optional().default([]),
}).strict()

export function validateEditorDocument(value: unknown): { ok: true; document: EditorDocumentV1 } | { ok: false; issues: Array<{ path: string; message: string }> } {
  const result = editorDocumentSchema.safeParse(value)
  if (!result.success) return { ok: false, issues: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) }
  let nodes = 0
  let textLength = 0
  const visit = (node: EditorNodeV1) => {
    nodes += 1
    textLength += node.text?.length ?? 0
    node.content?.forEach(visit)
  }
  visit(result.data)
  if (nodes > 10000) return { ok: false, issues: [{ path: 'content', message: '文件節點不可超過 10,000 個' }] }
  if (textLength > 500000) return { ok: false, issues: [{ path: 'content', message: '文件文字不可超過 500,000 字' }] }
  return { ok: true, document: result.data }
}

export function collectMediaIds(document: EditorDocumentV1) {
  const ids = new Set<string>()
  const visit = (node: EditorNodeV1) => {
    if (node.type === 'methodImage' && typeof node.attrs?.mediaId === 'string') ids.add(node.attrs.mediaId)
    node.content?.forEach(visit)
  }
  visit(document)
  return [...ids].sort()
}

export function safeLinkHref(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.startsWith('/') || /^(https?:|mailto:)/i.test(trimmed)) return trimmed
  return null
}

export function validateEditorSemantics(document: EditorDocumentV1) {
  const issues: Array<{ path: string; message: string }> = []
  const visit = (node: EditorNodeV1, path: string) => {
    if (node.type === 'heading' && !([1, 2, 3] as unknown[]).includes(node.attrs?.level)) issues.push({ path, message: '標題層級必須為 1 至 3' })
    if (node.type === 'methodImage') {
      if (typeof node.attrs?.mediaId !== 'string') issues.push({ path, message: '圖片必須引用 mediaId' })
      if (typeof node.attrs?.width !== 'undefined' && node.attrs.width !== null && (!Number.isInteger(node.attrs.width) || Number(node.attrs.width) < 160 || Number(node.attrs.width) > 1200)) issues.push({ path, message: '圖片寬度無效' })
    }
    node.marks?.forEach((mark, index) => { if (mark.type === 'link' && !safeLinkHref(mark.attrs?.href)) issues.push({ path: `${path}.marks.${index}`, message: '連結網址格式不安全' }) })
    node.content?.forEach((child, index) => visit(child, `${path}.content.${index}`))
  }
  visit(document, '$')
  return issues
}
