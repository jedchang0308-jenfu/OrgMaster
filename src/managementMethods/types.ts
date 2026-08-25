export type ManagementMethodCapability =
  | 'create'
  | 'readReadable'
  | 'readDraft'
  | 'editDraft'
  | 'manageReadable'
  | 'manageMetadata'

export interface EditorMarkV1 {
  type: 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'link' | 'textStyle'
  attrs?: { href?: string; target?: string | null; rel?: string | null; color?: string | null }
}

export interface EditorNodeV1 {
  type: 'doc' | 'paragraph' | 'heading' | 'blockquote' | 'bulletList' | 'orderedList' | 'listItem' | 'table' | 'tableRow' | 'tableHeader' | 'tableCell' | 'hardBreak' | 'horizontalRule' | 'methodImage' | 'text'
  attrs?: Record<string, unknown>
  text?: string
  marks?: EditorMarkV1[]
  content?: EditorNodeV1[]
}

export interface EditorDocumentV1 extends EditorNodeV1 {
  type: 'doc'
  content: EditorNodeV1[]
}

export interface MethodDraftV1 {
  bodyFormat: 'editor-json-v1'
  body: EditorDocumentV1
  bodyHash: string
  revision: string
  mediaIds: string[]
  updatedByPrincipalId: string
  updatedAt: string
}

export interface MethodReadableSnapshotV1 {
  title: string
  ownerEmployeeId: string
  bodyFormat: 'editor-json-v1'
  body: EditorDocumentV1
  bodyHash: string
  sourceDraftRevision: string
  mediaIds: string[]
  providedByPrincipalId: string
  providedAt: string
}

export interface MethodMediaAssetV1 {
  id: string
  contentHash: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  byteSize: number
  width: number | null
  height: number | null
  altText: string
  storedFileRef: string
  methodId: string | null
  pendingCreationRequestId: string | null
  createdByPrincipalId: string
  createdAt: string
  unreferencedSince: string | null
}

export interface MethodGenerationMetaV1 {
  provider: 'openai' | 'fake'
  model: string
  promptVersion: 'management-method-draft-v1'
  providerRequestId: string | null
  durationMs: number
  inputTokens: number | null
  outputTokens: number | null
  generatedAt: string
}

export interface ManagementMethodV1 {
  id: string
  code: string
  creationRequestId: string
  creationInputHash: string
  title: string
  ownerEmployeeId: string | null
  methodRevision: string
  workingDraft: MethodDraftV1
  readableSnapshot: MethodReadableSnapshotV1 | null
  generationMeta: MethodGenerationMetaV1
  createdByPrincipalId: string
  createdAt: string
  updatedByPrincipalId: string
  updatedAt: string
}

export type MethodCommandTypeV1 = 'SAVE_DRAFT' | 'UPDATE_METADATA' | 'PROVIDE_READABLE' | 'RESTORE_DRAFT' | 'STOP_READABLE'

export interface MethodCommandReceiptV1 {
  commandId: string
  commandType: MethodCommandTypeV1
  methodId: string
  payloadHash: string
  resultingMethodRevision: string
  resultingDraftRevision: string
  appliedByPrincipalId: string
  appliedAt: string
}

export interface ManagementMethodStoreV1 {
  app: 'OrgMasterManagementMethods'
  schemaVersion: 1
  nextMethodNumber: number
  methods: ManagementMethodV1[]
  mediaAssets: MethodMediaAssetV1[]
  commandReceipts: MethodCommandReceiptV1[]
}

export type DerivedMethodStatus = '建置中' | '可供公司閱讀' | '有未提供更新'

export interface ManagementMethodSummaryV1 {
  id: string
  code: string
  title: string
  ownerEmployeeId: string | null
  status: DerivedMethodStatus
  updatedAt: string
  methodRevision: string
}

export interface ManagementMethodSessionV1 {
  actor: { principalId: string; subjectHint: string }
  capabilities: Record<ManagementMethodCapability, boolean>
  draftGeneration: 'configured' | 'unavailable'
  runtimeMode: 'local-development' | 'unavailable'
}

export interface ManagementMethodCreateInputV1 {
  creationRequestId: string
  requestedTitle?: string | null
  goalAndPurpose: string
  confirmedCurrentFacts?: string
  confirmedTargetRules?: string
  existingContent?: { format: 'plain-text-v1'; text: string } | { format: 'editor-json-v1'; body: EditorDocumentV1 } | null
  selectedMedia?: Array<{ mediaId: string; altText: string; humanDescription: string; caption?: string }>
}
