import type { EditorDocumentV1, EditorNodeV1 } from './types'

export interface ManagementMethodHeading {
  id: string
  level: 1 | 2 | 3
  text: string
}

export const MANAGEMENT_METHOD_CHAPTER_NAVIGATION_MIN_HEADINGS = 2

function nodeText(node: EditorNodeV1): string {
  if (node.type === 'text') return node.text ?? ''
  return (node.content ?? []).map(nodeText).join('')
}

export function managementMethodHeadingId(index: number) {
  return `management-method-heading-${index + 1}`
}

export function collectManagementMethodHeadings(document: EditorDocumentV1): ManagementMethodHeading[] {
  const headings: ManagementMethodHeading[] = []

  const visit = (node: EditorNodeV1) => {
    if (node.type === 'heading') {
      const text = nodeText(node).replace(/\s+/g, ' ').trim()
      if (text) {
        const level = Number(node.attrs?.level)
        headings.push({
          id: managementMethodHeadingId(headings.length),
          level: level === 1 || level === 2 || level === 3 ? level : 2,
          text,
        })
      }
    }
    node.content?.forEach(visit)
  }

  visit(document)
  return headings
}

export function hasUsefulManagementMethodChapterNavigation(headings: ManagementMethodHeading[]) {
  return headings.length >= MANAGEMENT_METHOD_CHAPTER_NAVIGATION_MIN_HEADINGS
}
