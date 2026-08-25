import {
  createOrgDocumentFile,
  orgStateSignature,
  parseOrgDocument,
  type OrgDocumentFile,
} from './documentStorage'
import type { OrgDirectoryState } from './types'

export const SERVER_DOCUMENT_API = '/api/orgmaster/document'

export type ServerDocumentLoadResult =
  | { status: 'loaded'; document: OrgDocumentFile; revision: string }
  | { status: 'failed'; message: string }

export interface ServerDocumentSaveResult {
  document: OrgDocumentFile
  revision: string
}

function getRevision(response: Response, document: OrgDocumentFile) {
  return response.headers.get('X-OrgMaster-Revision') ?? document.savedAt
}

async function readDocumentResponse(response: Response): Promise<ServerDocumentLoadResult> {
  if (!response.ok) {
    return { status: 'failed', message: `本機儲存服務回應 ${response.status}` }
  }

  try {
    const parsed = parseOrgDocument(await response.json())
    if (!parsed.ok) return { status: 'failed', message: `本機組織文件驗證失敗：${parsed.code}` }
    return { status: 'loaded', document: parsed.document, revision: getRevision(response, parsed.document) }
  } catch {
    return { status: 'failed', message: '本機組織文件無法解析' }
  }
}

export async function loadServerDocument(): Promise<ServerDocumentLoadResult> {
  try {
    return await readDocumentResponse(await fetch(SERVER_DOCUMENT_API, { cache: 'no-store' }))
  } catch {
    return { status: 'failed', message: '無法連線到本機儲存服務' }
  }
}

export async function saveServerDocument(state: OrgDirectoryState): Promise<ServerDocumentSaveResult | null> {
  const document = createOrgDocumentFile(state, 'document')
  try {
    const response = await fetch(SERVER_DOCUMENT_API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(document),
    })
    if (!response.ok) return null
    const result = await readDocumentResponse(response)
    if (result.status !== 'loaded') return null
    if (orgStateSignature(result.document.state) !== orgStateSignature(document.state)) return null
    return { document: result.document, revision: result.revision }
  } catch {
    return null
  }
}
