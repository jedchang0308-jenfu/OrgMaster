import type { DerivedMethodStatus, ManagementMethodV1, ManagementMethodSummaryV1 } from './types'

export function deriveMethodStatus(method: Pick<ManagementMethodV1, 'title' | 'ownerEmployeeId' | 'workingDraft' | 'readableSnapshot'>): DerivedMethodStatus {
  if (!method.readableSnapshot) return '建置中'
  return method.readableSnapshot.bodyHash === method.workingDraft.bodyHash
    && method.readableSnapshot.title === method.title
    && method.readableSnapshot.ownerEmployeeId === method.ownerEmployeeId
    ? '可供公司閱讀'
    : '有未提供更新'
}

export function toMethodSummary(method: ManagementMethodV1): ManagementMethodSummaryV1 {
  return { id: method.id, code: method.code, title: method.title, ownerEmployeeId: method.ownerEmployeeId, status: deriveMethodStatus(method), updatedAt: method.updatedAt, methodRevision: method.methodRevision }
}
