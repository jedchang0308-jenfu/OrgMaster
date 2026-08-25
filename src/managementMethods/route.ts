export interface ManagementMethodLocation {
  isListPage: boolean
  isDocumentPage: boolean
  methodId: string | null
  view: 'draft' | 'readable'
  chapter: string | null
}

export function readManagementMethodLocation(location: Location): ManagementMethodLocation {
  const parts = location.pathname.split('/').filter(Boolean)
  const isListPage = parts.length === 1 && parts[0] === 'management-methods'
  const isDocumentPage = parts.length === 2 && parts[0] === 'management-methods'
  const view = new URLSearchParams(location.search).get('view') === 'readable' ? 'readable' : 'draft'
  return { isListPage, isDocumentPage, methodId: isDocumentPage ? decodeURIComponent(parts[1]) : null, view, chapter: location.hash ? decodeURIComponent(location.hash.slice(1)) : null }
}

export function buildManagementMethodsUrl() { return '/management-methods' }
export function buildManagementMethodDocumentUrl(methodId: string, view: 'draft' | 'readable' = 'draft', chapter?: string | null) { return `/management-methods/${encodeURIComponent(methodId)}?view=${view}${chapter ? `#${encodeURIComponent(chapter)}` : ''}` }
