import type { ReactNode } from 'react'
import { managementMethodHeadingId } from '../../managementMethods/headings'
import type { EditorMarkV1, EditorNodeV1, ManagementMethodV1 } from '../../managementMethods/types'

function marks(text: string, list: EditorMarkV1[] | undefined): ReactNode { return (list ?? []).reduce<ReactNode>((content, mark) => { if (mark.type === 'bold') return <strong>{content}</strong>; if (mark.type === 'italic') return <em>{content}</em>; if (mark.type === 'underline') return <u>{content}</u>; if (mark.type === 'strike') return <s>{content}</s>; if (mark.type === 'code') return <code>{content}</code>; if (mark.type === 'link') return <a href={String(mark.attrs?.href ?? '')} target="_blank" rel="noreferrer">{content}</a>; return <span style={{ color: typeof mark.attrs?.color === 'string' ? mark.attrs.color : undefined }}>{content}</span> }, text)
}
function plainText(node: EditorNodeV1): string {
  if (node.type === 'text') return node.text ?? ''
  return (node.content ?? []).map(plainText).join('')
}

function renderNode(node: EditorNodeV1, method: ManagementMethodV1, view: 'draft' | 'readable', headingIndex: { value: number }, onImage?: (mediaId: string) => void): ReactNode {
  if (node.type === 'text') return marks(node.text ?? '', node.marks)
  if (node.type === 'doc') return <>{node.content?.map((child, index) => <div key={index}>{renderNode(child, method, view, headingIndex, onImage)}</div>)}</>
  if (node.type === 'heading') {
    const level = Number(node.attrs?.level)
    const Tag = `h${level === 1 || level === 2 || level === 3 ? level : 2}` as 'h1' | 'h2' | 'h3'
    const text = plainText(node).replace(/\s+/g, ' ').trim()
    const id = text ? managementMethodHeadingId(headingIndex.value++) : undefined
    return <Tag id={id} tabIndex={id ? -1 : undefined}>{node.content?.map((child, index) => <span key={`heading-${index}`}>{renderNode(child, method, view, headingIndex, onImage)}</span>)}</Tag>
  }
  if (node.type === 'table') return <div className="management-method-table-wrap"><table><tbody>{node.content?.map((row, index) => <tr key={index}>{row.content?.map((cell, cellIndex) => cell.type === 'tableHeader' ? <th key={cellIndex}>{renderNode(cell, method, view, headingIndex, onImage)}</th> : <td key={cellIndex}>{renderNode(cell, method, view, headingIndex, onImage)}</td>)}</tr>)}</tbody></table></div>
  if (node.type === 'methodImage') { const mediaId = String(node.attrs?.mediaId ?? ''); const caption = typeof node.attrs?.caption === 'string' ? node.attrs.caption : ''; const src = `/api/orgmaster/management-methods/media/${encodeURIComponent(mediaId)}?methodId=${encodeURIComponent(method.id)}&view=${view}`; return <figure className="management-method-image"><button type="button" onClick={() => onImage?.(mediaId)}><img src={src} alt={String(node.attrs?.altText ?? '')} /></button>{caption ? <figcaption>{caption}</figcaption> : null}</figure> }
  const children = node.content?.map((child, index) => <span key={`${node.type}-${index}`}>{renderNode(child, method, view, headingIndex, onImage)}</span>)
  if (node.type === 'paragraph') return <p>{children}</p>
  if (node.type === 'blockquote') return <blockquote>{children}</blockquote>
  if (node.type === 'bulletList') return <ul>{children}</ul>
  if (node.type === 'orderedList') return <ol>{children}</ol>
  if (node.type === 'listItem') return <li>{children}</li>
  if (node.type === 'hardBreak') return <br />
  if (node.type === 'horizontalRule') return <hr />
  if (node.type === 'tableRow' || node.type === 'tableCell' || node.type === 'tableHeader') return <>{children}</>
  return null
}

export function ManagementMethodReader({ method, view, onImage }: { method: ManagementMethodV1; view: 'draft' | 'readable'; onImage?: (mediaId: string) => void }) { const body = view === 'readable' ? method.readableSnapshot?.body : method.workingDraft.body; const headingIndex = { value: 0 }; return <article className="management-method-reader">{body ? renderNode(body, method, view, headingIndex, onImage) : <p>目前沒有可閱讀內容。</p>}</article> }
