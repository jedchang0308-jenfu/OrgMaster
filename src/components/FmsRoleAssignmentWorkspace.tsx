import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useAuthSession } from '../auth/AuthGate'
import {
  FmsRoleAssignmentApiError,
  loadFmsRoleAssignmentReceipt,
  loadFmsRoleAssignmentWorkspace,
  previewFmsRoleAssignment,
  publishFmsRoleAssignment,
  searchFmsEmployeeDirectory,
  type FmsAssignableRole,
  type FmsRoleAssignment,
  type FmsRoleAssignmentPreview,
} from '../governance/fmsRoleAssignmentApiClient'
import type { FinancialRoleAssignmentWorkspace } from '../../server/applicationRoleAssignmentStore'
import type { FinancialRoleAssignmentInput } from '../../server/applicationEntitlementCommon'
import './FmsRoleAssignmentWorkspace.css'

type Employee = { employeeId: string; displayName: string; employeeNumber: null; active: true; assignable: true }
type PendingCommand = { commandId: string; requestHash: string; previewHash: string }
type Phase = 'editing' | 'preview' | 'publishing' | 'unknown'
type PendingStorageResult = { pending: PendingCommand | null; error: string | null }
const PENDING_VERSION = 1 as const
const STALE_WORKSPACE_MESSAGE = '任用資料已更新，請重新載入後預覽。'
const STALE_WORKSPACE_CODES = new Set([
  'REVISION_CONFLICT',
  'GOVERNANCE_REVISION_CONFLICT', 'ORGANIZATION_REVISION_CONFLICT',
  'CATALOG_BINDING_CONFLICT', 'PREVIEW_HASH_CONFLICT', 'REQUEST_HASH_CONFLICT',
])
const KNOWN_PRECOMMIT_REJECTION_CODES = new Set([
  'IDENTITY_CONTEXT_REQUIRED', 'IDENTITY_REQUIRED',
  'APP_MANAGEMENT_GRANT_REQUIRED', 'APP_PUBLISH_GRANT_REQUIRED',
  'INVALID_COMMAND', 'EMPLOYEE_NOT_FOUND', 'ROLE_NOT_FOUND', 'UNSUPPORTED_SCOPE',
  'INVALID_VALIDITY', 'CATALOG_INCOMPATIBLE', 'UNSUPPORTED_SUBJECT',
  ...STALE_WORKSPACE_CODES,
])

function pendingStorageKey(principalId: string) {
  return `orgmaster:fms-role-assignment:pending:v${PENDING_VERSION}:${encodeURIComponent(principalId)}`
}

function parsedPending(value: unknown): PendingCommand | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (Object.keys(row).sort().join(',') !== 'commandId,previewHash,requestHash,version'
    || row.version !== PENDING_VERSION
    || typeof row.commandId !== 'string' || !row.commandId || row.commandId.length > 200
    || typeof row.requestHash !== 'string' || !row.requestHash || row.requestHash.length > 512
    || typeof row.previewHash !== 'string' || !row.previewHash || row.previewHash.length > 512) return null
  return { commandId: row.commandId, requestHash: row.requestHash, previewHash: row.previewHash }
}

function readPending(principalId: string): PendingStorageResult {
  try {
    const value = window.sessionStorage.getItem(pendingStorageKey(principalId))
    if (value === null) return { pending: null, error: null }
    const pending = parsedPending(JSON.parse(value))
    return pending
      ? { pending, error: null }
      : { pending: null, error: '本分頁的任用操作暫存無法辨識；已暫停新的任用操作。' }
  } catch {
    return { pending: null, error: '無法讀取本分頁的任用操作暫存；已暫停新的任用操作。' }
  }
}

function savePending(principalId: string, pending: PendingCommand) {
  try {
    const storage = window.sessionStorage
    const key = pendingStorageKey(principalId)
    if (storage.getItem(key) !== null) return false
    const value = JSON.stringify({ version: PENDING_VERSION, ...pending })
    storage.setItem(key, value)
    return storage.getItem(key) === value
  } catch {
    return false
  }
}

function clearPending(principalId: string, pending: PendingCommand) {
  try {
    const storage = window.sessionStorage
    const key = pendingStorageKey(principalId)
    const current = parsedPending(JSON.parse(storage.getItem(key) ?? 'null'))
    if (!current) return storage.getItem(key) === null
    if (current.commandId !== pending.commandId || current.requestHash !== pending.requestHash || current.previewHash !== pending.previewHash) return false
    storage.removeItem(key)
    return storage.getItem(key) === null
  } catch {
    return false
  }
}

function localDateTime(value: Date) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function newCommandId() {
  if (!globalThis.crypto?.randomUUID) throw new Error('此瀏覽器無法建立安全的操作識別碼。')
  return globalThis.crypto.randomUUID()
}

function failureMessage(error: unknown) {
  if (error instanceof FmsRoleAssignmentApiError) {
    if (error.status === 401) return '登入已失效，請重新登入。'
    if (error.status === 403) return '目前沒有進行這項 FMS 任用操作的權限。'
    if (STALE_WORKSPACE_CODES.has(error.code)) return STALE_WORKSPACE_MESSAGE
    if (error.code === 'EMPLOYEE_NOT_FOUND') return '員工資料已變更，請重新搜尋。'
    if (error.code === 'ROLE_NOT_FOUND' || error.code === 'CATALOG_INCOMPATIBLE' || error.code === 'UNSUPPORTED_SUBJECT') return '目前選擇的角色無法任用，請重新載入後再試。'
    if (error.code === 'UNSUPPORTED_SCOPE') return '此任用範圍目前不支援。'
    if (error.code === 'INVALID_VALIDITY') return '請確認任用生效與到期時間。'
    if (error.code === 'INVALID_COMMAND') return '任用資料不完整，請檢查欄位後再試。'
    return '目前無法完成 FMS 任用操作。'
  }
  return '目前無法連線完成 FMS 任用操作。'
}

function directoryMatchesWorkspace(
  directory: Awaited<ReturnType<typeof searchFmsEmployeeDirectory>>,
  workspace: FinancialRoleAssignmentWorkspace,
) {
  return directory.directoryRevision === workspace.organizationRevision
    && directory.governanceRevision === workspace.governanceRevision
}

function assignmentLine(assignment: FmsRoleAssignment) {
  return `${assignment.employeeName ?? assignment.employeeId} · ${assignment.roleName} · ${effectiveState(assignment, Date.now())} · ${assignment.validFrom.slice(0, 10)} 至 ${assignment.validUntil?.slice(0, 10) ?? '未設定'}`
}

function effectiveState(assignment: FmsRoleAssignment, now: number) {
  if (assignment.status === 'revoked') return '已撤銷'
  if (Date.parse(assignment.validFrom) > now) return '尚未生效'
  if (assignment.validUntil && Date.parse(assignment.validUntil) <= now) return '已到期'
  return '有效中'
}

function previewRows(rows: FmsRoleAssignment[], employeeId: string) {
  return rows.filter((row) => row.employeeId === employeeId)
}

export function FmsRoleAssignmentWorkspace() {
  const auth = useAuthSession()
  const principalId = auth?.session.user.principalId ?? null
  const principalIdRef = useRef(principalId)
  principalIdRef.current = principalId
  const [workspace, setWorkspace] = useState<FinancialRoleAssignmentWorkspace | null>(null)
  const [workspacePrincipalId, setWorkspacePrincipalId] = useState<string | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [directoryCursor, setDirectoryCursor] = useState<string | null>(null)
  const [directoryQuery, setDirectoryQuery] = useState('')
  const [searchText, setSearchText] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [assignmentEmployeeId, setAssignmentEmployeeId] = useState('')
  const [revokeAssignment, setRevokeAssignment] = useState<FmsRoleAssignment | null>(null)
  const [stableRoleId, setStableRoleId] = useState('')
  const [validFrom, setValidFrom] = useState(() => localDateTime(new Date()))
  const [validUntil, setValidUntil] = useState('')
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState<FmsRoleAssignmentPreview | null>(null)
  const [pending, setPending] = useState<PendingCommand | null>(null)
  const [pendingPrincipalId, setPendingPrincipalId] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('editing')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [workspaceStale, setWorkspaceStale] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const pendingReady = Boolean(principalId && pendingPrincipalId === principalId)
  const activePending = pendingReady ? pending : null
  const activeWorkspace = workspacePrincipalId === principalId ? workspace : null
  const selectedEmployee = useMemo(() => employees.find((employee) => employee.employeeId === employeeId), [employees, employeeId])
  const roles: FmsAssignableRole[] = activeWorkspace?.roles ?? []
  const selectedRole = useMemo(() => roles.find((role) => role.stableRoleId === stableRoleId), [roles, stableRoleId])
  const currentAssignments = activeWorkspace?.assignments ?? []
  const assignmentEmployees = useMemo(() => {
    const byId = new Map<string, string>()
    for (const assignment of currentAssignments) {
      if (!byId.has(assignment.employeeId) || (!byId.get(assignment.employeeId) && assignment.employeeName)) {
        byId.set(assignment.employeeId, assignment.employeeName ?? '')
      }
    }
    return [...byId].map(([id, name]) => ({ id, name: name || id }))
  }, [currentAssignments])
  const visibleAssignments = currentAssignments.filter((assignment) => assignment.employeeId === assignmentEmployeeId)

  useEffect(() => {
    setPendingPrincipalId(null)
    setPending(null)
    setPreview(null)
    setPhase('editing')
    setError('')
    setMessage('')
    setBusy(false)
    setWorkspaceStale(false)
    setAssignmentEmployeeId('')
    setRevokeAssignment(null)
    if (!principalId) return
    const stored = readPending(principalId)
    if (stored.error) {
      setError(stored.error)
      return
    }
    setPending(stored.pending)
    setPendingPrincipalId(principalId)
    if (stored.pending) {
      setPhase('unknown')
      setMessage('有一筆任用操作尚未確認；請查詢原操作收據。')
    }
  }, [principalId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setWorkspace(null)
    setWorkspacePrincipalId(null)
    setEmployees([])
    setEmployeeId('')
    setAssignmentEmployeeId('')
    setRevokeAssignment(null)
    setSearchText('')
    setReason('')
    setValidFrom(localDateTime(new Date()))
    setValidUntil('')
    if (!principalId) {
      setLoading(false)
      return () => { cancelled = true }
    }
    void (async () => {
      try {
        const initialWorkspace = await loadFmsRoleAssignmentWorkspace()
        if (cancelled) return
        const directory = await searchFmsEmployeeDirectory('')
        if (cancelled) return
        setWorkspace(initialWorkspace)
        setWorkspacePrincipalId(principalId)
        setEmployees(directory.items)
        setDirectoryCursor(directory.cursor)
        setDirectoryQuery('')
        setStableRoleId('')
        if (!directoryMatchesWorkspace(directory, initialWorkspace)) {
          setWorkspaceStale(true)
          setError(STALE_WORKSPACE_MESSAGE)
        }
      } catch (cause) {
        if (!cancelled) setError(failureMessage(cause))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [principalId])

  const searchEmployees = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const owner = principalId
    if (!owner || !pendingReady || activePending) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const page = await searchFmsEmployeeDirectory(searchText)
      if (principalIdRef.current !== owner) return
      setEmployees(page.items)
      setDirectoryCursor(page.cursor)
      setDirectoryQuery(searchText)
      setEmployeeId('')
      if (!activeWorkspace || !directoryMatchesWorkspace(page, activeWorkspace)) {
        setWorkspaceStale(true)
        setPreview(null)
        setPhase('editing')
        setError(STALE_WORKSPACE_MESSAGE)
      }
    } catch (cause) {
      if (principalIdRef.current === owner) setError(failureMessage(cause))
    } finally {
      if (principalIdRef.current === owner) setBusy(false)
    }
  }

  const nextEmployeePage = async () => {
    const owner = principalId
    if (!owner || !pendingReady || activePending || !directoryCursor) return
    setBusy(true)
    setError('')
    try {
      const page = await searchFmsEmployeeDirectory(directoryQuery, directoryCursor)
      if (principalIdRef.current !== owner) return
      setEmployees((current) => [...current, ...page.items])
      setDirectoryCursor(page.cursor)
      if (!activeWorkspace || !directoryMatchesWorkspace(page, activeWorkspace)) {
        setWorkspaceStale(true)
        setPreview(null)
        setPhase('editing')
        setError(STALE_WORKSPACE_MESSAGE)
      }
    } catch (cause) {
      if (principalIdRef.current === owner) setError(failureMessage(cause))
    } finally {
      if (principalIdRef.current === owner) setBusy(false)
    }
  }

  const refreshPublishedWorkspace = async (confirmedMessage: string) => {
    const owner = principalId
    if (!owner || principalIdRef.current !== owner) return
    setWorkspaceStale(true)
    setMessage(`${confirmedMessage}，正在更新現行資料。`)
    try {
      const [refreshed, directory] = await Promise.all([
        loadFmsRoleAssignmentWorkspace(),
        searchFmsEmployeeDirectory(directoryQuery),
      ])
      if (principalIdRef.current !== owner) return
      setWorkspace(refreshed)
      setWorkspacePrincipalId(owner)
      setEmployees(directory.items)
      setDirectoryCursor(directory.cursor)
      setRevokeAssignment(null)
      setAssignmentEmployeeId((current) => refreshed.assignments.some((assignment) => assignment.employeeId === current) ? current : '')
      if (employeeId && !directory.items.some((employee) => employee.employeeId === employeeId)) setEmployeeId('')
      if (!refreshed.roles.some((role) => role.stableRoleId === stableRoleId)) {
        setStableRoleId('')
      }
      if (directoryMatchesWorkspace(directory, refreshed)) {
        setWorkspaceStale(false)
        setMessage(`${confirmedMessage}，現行資料已更新。`)
        setError('')
      } else {
        setWorkspaceStale(true)
        setMessage(STALE_WORKSPACE_MESSAGE)
        setError(STALE_WORKSPACE_MESSAGE)
      }
    } catch (cause) {
      if (principalIdRef.current === owner) setError(`${confirmedMessage}；${failureMessage(cause)}`)
    }
  }

  const retryWorkspaceRefresh = async () => {
    const owner = principalId
    if (!owner || principalIdRef.current !== owner) return
    setBusy(true)
    setError('')
    try {
      const [refreshed, directory] = await Promise.all([
        loadFmsRoleAssignmentWorkspace(),
        searchFmsEmployeeDirectory(directoryQuery),
      ])
      if (principalIdRef.current !== owner) return
      setWorkspace(refreshed)
      setWorkspacePrincipalId(owner)
      setEmployees(directory.items)
      setDirectoryCursor(directory.cursor)
      setRevokeAssignment(null)
      setAssignmentEmployeeId((current) => refreshed.assignments.some((assignment) => assignment.employeeId === current) ? current : '')
      if (employeeId && !directory.items.some((employee) => employee.employeeId === employeeId)) setEmployeeId('')
      if (!refreshed.roles.some((role) => role.stableRoleId === stableRoleId)) {
        setStableRoleId('')
      }
      setPreview(null)
      if (directoryMatchesWorkspace(directory, refreshed)) {
        setWorkspaceStale(false)
        setMessage('任用資料已重新載入。')
      } else {
        setWorkspaceStale(true)
        setMessage(STALE_WORKSPACE_MESSAGE)
        setError(STALE_WORKSPACE_MESSAGE)
      }
    } catch (cause) {
      if (principalIdRef.current === owner) setError(`目前無法重新載入現行資料（${failureMessage(cause)}）`)
    } finally {
      if (principalIdRef.current === owner) setBusy(false)
    }
  }

  const buildRequest = (): FinancialRoleAssignmentInput | null => {
    if (!activeWorkspace || !activeWorkspace.allowedOperations.preview || !reason.trim()) return null
    if (revokeAssignment) {
      if (revokeAssignment.status !== 'active') return null
      return {
        operation: 'revoke',
        assignmentId: revokeAssignment.assignmentId,
        employeeId: revokeAssignment.employeeId,
        stableRoleId: revokeAssignment.stableRoleId,
        scope: { ...revokeAssignment.scope },
        validFrom: revokeAssignment.validFrom,
        validUntil: revokeAssignment.validUntil,
        reason: reason.trim(),
        expectedCatalogVersion: activeWorkspace.catalogBinding.catalogVersion,
        expectedCatalogPayloadHash: activeWorkspace.catalogBinding.catalogSha256,
        expectedGovernanceRevision: activeWorkspace.governanceRevision,
        expectedOrganizationRevision: activeWorkspace.organizationRevision,
      }
    }
    if (!selectedEmployee || !selectedRole) return null
    const start = new Date(validFrom)
    const end = validUntil ? new Date(validUntil) : null
    if (!Number.isFinite(start.getTime()) || (end && (!Number.isFinite(end.getTime()) || end <= start))) {
      setError('請確認生效與到期時間。')
      return null
    }
    return {
      operation: 'upsert',
      employeeId: selectedEmployee.employeeId,
      stableRoleId: selectedRole.stableRoleId,
      scope: { kind: 'workspace', value: 'company-jenfu' },
      validFrom: start.toISOString(),
      validUntil: end?.toISOString() ?? null,
      reason: reason.trim(),
      expectedCatalogVersion: activeWorkspace.catalogBinding.catalogVersion,
      expectedCatalogPayloadHash: activeWorkspace.catalogBinding.catalogSha256,
      expectedGovernanceRevision: activeWorkspace.governanceRevision,
      expectedOrganizationRevision: activeWorkspace.organizationRevision,
    }
  }

  const submitPreview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const owner = principalId
    if (!owner || !pendingReady || activePending || phase === 'unknown') return
    const request = buildRequest()
    if (!request) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await previewFmsRoleAssignment(request)
      if (principalIdRef.current !== owner) return
      setPreview(result)
      setPhase('preview')
    } catch (cause) {
      if (principalIdRef.current === owner) {
        if (cause instanceof FmsRoleAssignmentApiError && STALE_WORKSPACE_CODES.has(cause.code)) {
          setWorkspaceStale(true)
          setPreview(null)
          setPhase('editing')
        }
        setError(failureMessage(cause))
      }
    } finally {
      if (principalIdRef.current === owner) setBusy(false)
    }
  }

  const confirmPublish = async () => {
    const owner = principalId
    if (!owner || !pendingReady || activePending || !preview || phase !== 'preview' || !activeWorkspace?.allowedOperations.publish) return
    if (!preview.requestHash || !preview.previewHash) {
      setError('預覽識別資料不完整；尚未送出任用命令。')
      return
    }
    const request = buildRequest()
    if (!request) return
    let command: PendingCommand
    try {
      command = { commandId: newCommandId(), requestHash: preview.requestHash, previewHash: preview.previewHash }
    } catch (cause) {
      setError(failureMessage(cause))
      return
    }
    if (!savePending(owner, command)) {
      setError('無法同步保存原操作識別；尚未送出任用命令。')
      return
    }
    setPending(command)
    setPendingPrincipalId(owner)
    setPhase('publishing')
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const receipt = await publishFmsRoleAssignment(request, command)
      if (principalIdRef.current !== owner) return
      if (receipt.commandId !== command.commandId) {
        setPhase('unknown')
        setError('發布回應命令識別不一致；請查詢原收據。')
        return
      }
      if (receipt.receiptStatus === 'not_found') {
        setPhase('unknown')
        setError('發布回應尚無原操作收據；請查詢原收據。')
        return
      }
      if (receipt.requestHash !== command.requestHash || receipt.previewHash !== command.previewHash) {
        setPhase('unknown')
        setError('發布回應與原命令不一致；請查詢原收據。')
        return
      }
      if (receipt.receiptStatus === 'applied') {
        if (!clearPending(owner, command)) {
          setPhase('unknown')
          setError('已收到完成收據，但無法清除本分頁操作暫存；請再次查詢原收據。')
          return
        }
        setPreview(null)
        setRevokeAssignment(null)
        setPending(null)
        setPhase('editing')
        await refreshPublishedWorkspace('任用已發布')
      } else if (receipt.receiptStatus === 'rejected') {
        if (!clearPending(owner, command)) {
          setPhase('unknown')
          setError('已收到拒絕收據，但無法清除本分頁操作暫存；請再次查詢原收據。')
          return
        }
        setPreview(null)
        setRevokeAssignment(null)
        setPending(null)
        setPhase('editing')
        setError('任用操作未通過，未發布。')
      } else {
        setPhase('unknown')
        setError('發布結果尚未確認；請查詢原操作收據。')
      }
    } catch (cause) {
      if (principalIdRef.current !== owner) return
      if (cause instanceof FmsRoleAssignmentApiError && KNOWN_PRECOMMIT_REJECTION_CODES.has(cause.code)) {
        if (!clearPending(owner, command)) {
          setPhase('unknown')
          setError('任用操作已拒絕，但無法清除原操作識別；請查詢原操作收據。')
          return
        }
        setPending(null)
        if (STALE_WORKSPACE_CODES.has(cause.code)) {
          setPreview(null)
          setPhase('editing')
          setWorkspaceStale(true)
          setError(STALE_WORKSPACE_MESSAGE)
        } else if (cause.code === 'APP_PUBLISH_GRANT_REQUIRED' || cause.code === 'APP_MANAGEMENT_GRANT_REQUIRED') {
          setPhase('preview')
          setWorkspace((current) => current ? { ...current, allowedOperations: { ...current.allowedOperations, publish: false } } : current)
          setError(cause.code === 'APP_PUBLISH_GRANT_REQUIRED'
            ? '目前沒有發布 FMS 任用的權限。'
            : '目前沒有管理 FMS 任用的權限。')
        } else {
          setPreview(null)
          setPhase('editing')
          setError(failureMessage(cause))
        }
      } else {
        setPhase('unknown')
        setError('發布結果未知；保留原操作識別與雜湊，請查詢原操作收據。')
      }
    } finally {
      if (principalIdRef.current === owner) setBusy(false)
    }
  }

  const checkOriginalReceipt = async () => {
    const owner = principalId
    const command = activePending
    if (!owner || !pendingReady || !command || phase !== 'unknown' || principalIdRef.current !== owner) return
    setBusy(true)
    setError('')
    try {
      const receipt = await loadFmsRoleAssignmentReceipt(command.commandId)
      if (principalIdRef.current !== owner) return
      if (receipt.commandId !== command.commandId) {
        setError('收據與原命令不一致；操作仍未確認。')
        return
      }
      if (receipt.receiptStatus === 'not_found') {
        setPhase('unknown')
        setError('尚未查到原操作收據；結果仍未確認，可再次查詢原收據。')
        return
      }
      if (receipt.requestHash !== command.requestHash || receipt.previewHash !== command.previewHash) {
        setError('收據與原命令雜湊不一致；操作仍未確認。')
        return
      }
      if (receipt.receiptStatus === 'applied') {
        if (!clearPending(owner, command)) {
          setError('已查明原命令完成，但無法清除本分頁操作暫存；請再次查詢原收據。')
          return
        }
        setPreview(null)
        setRevokeAssignment(null)
        setPending(null)
        setPhase('editing')
        await refreshPublishedWorkspace('已查明原任用命令完成')
      } else if (receipt.receiptStatus === 'rejected') {
        if (!clearPending(owner, command)) {
          setError('已查明原命令遭拒，但無法清除本分頁操作暫存；請再次查詢原收據。')
          return
        }
        setPreview(null)
        setRevokeAssignment(null)
        setPending(null)
        setPhase('editing')
        setError('原任用操作未通過，未發布。')
      } else {
        setPhase('unknown')
        setError('原操作仍在處理；結果未確認，可再次查詢原收據。')
      }
    } catch (cause) {
      if (principalIdRef.current !== owner) return
      setError(`目前無法查詢原操作收據（${failureMessage(cause)}）；原命令仍保留。`)
    } finally {
      if (principalIdRef.current === owner) setBusy(false)
    }
  }

  const cancelPreview = () => {
    if (!pendingReady || activePending || phase !== 'preview') return
    setPreview(null)
    setPhase('editing')
    setError('')
    setMessage('')
  }

  const locked = busy || !pendingReady || Boolean(activePending) || phase !== 'editing' || workspaceStale
  const startRevocation = (assignment: FmsRoleAssignment) => {
    if (locked || assignment.status !== 'active') return
    setRevokeAssignment(assignment)
    setReason('')
    setPreview(null)
    setPhase('editing')
    setError('')
    setMessage('')
  }
  const cancelRevocation = () => {
    if (locked || !revokeAssignment) return
    setRevokeAssignment(null)
    setReason('')
    setError('')
  }
  const previewEmployeeId = revokeAssignment?.employeeId ?? selectedEmployee?.employeeId
  const previewEmployeeName = revokeAssignment?.employeeName ?? selectedEmployee?.displayName ?? selectedEmployee?.employeeId
  const previewRoleName = revokeAssignment?.roleName ?? selectedRole?.roleName ?? stableRoleId
  const previewBefore = preview && previewEmployeeId ? previewRows(preview.beforeAssignments, previewEmployeeId) : []
  const previewAfter = preview && previewEmployeeId ? previewRows(preview.afterAssignments, previewEmployeeId) : []

  return (
    <main className="fms-role-assignment" aria-labelledby="fms-role-assignment-title">
      <header className="fms-role-assignment__header">
        <h1 id="fms-role-assignment-title">FMS人員任用</h1>
        <a href="/api/orgmaster/governance/applications/financial-management-system/return">返回 FMS</a>
      </header>

      {loading ? <p role="status">正在讀取任用資料…</p> : null}
      {error && !loading ? <p className="fms-role-assignment__error" role="alert">{error}</p> : null}
      {message ? <p className="fms-role-assignment__message" role="status">{message}</p> : null}
      {workspaceStale ? <button type="button" onClick={() => void retryWorkspaceRefresh()} disabled={busy}>重新載入現行任用</button> : null}
      {pendingReady && activePending && phase === 'unknown' ? <section className="fms-role-assignment__pending" aria-labelledby="fms-pending-operation-title">
        <h2 id="fms-pending-operation-title">未確認操作</h2>
        <button type="button" onClick={() => void checkOriginalReceipt()} disabled={busy}>查詢原操作收據</button>
      </section> : null}

      {!loading && activeWorkspace ? <>
        <section aria-labelledby="fms-role-assignment-current-title">
          <h2 id="fms-role-assignment-current-title">現行任用</h2>
          {currentAssignments.length === 0 ? <p>目前沒有任用紀錄。</p> : <>
            <label htmlFor="fms-current-assignment-employee">選擇員工查看任用</label>
            <select id="fms-current-assignment-employee" value={assignmentEmployeeId} onChange={(event) => setAssignmentEmployeeId(event.target.value)} disabled={locked || Boolean(revokeAssignment)}>
              <option value="">選擇員工</option>
              {assignmentEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
            </select>
            {assignmentEmployeeId && visibleAssignments.length > 0 ? <ul className="fms-role-assignment__current">
              {visibleAssignments.map((assignment) => <li key={assignment.assignmentId}>
                <div className="fms-role-assignment__assignment-info">
                  <span>{assignment.employeeName ?? assignment.employeeId} · {assignment.roleName}</span>
                  <span>{effectiveState(assignment, Date.now())} · {assignment.validFrom.slice(0, 10)} 至 {assignment.validUntil?.slice(0, 10) ?? '未設定'}</span>
                </div>
                {assignment.status === 'active' ? <button type="button" className="fms-role-assignment__secondary" onClick={() => startRevocation(assignment)} disabled={locked || Boolean(revokeAssignment) || !activeWorkspace.allowedOperations.preview}>撤銷任用</button> : null}
              </li>)}
            </ul> : <p>{assignmentEmployeeId ? '此員工目前沒有任用紀錄。' : '請先選擇員工。'}</p>}
          </>}
        </section>

        <form className="fms-role-assignment__search" onSubmit={(event) => void searchEmployees(event)}>
          <label htmlFor="fms-employee-search">搜尋員工</label>
          <div className="fms-role-assignment__search-row">
            <input id="fms-employee-search" value={searchText} maxLength={80} onChange={(event) => setSearchText(event.target.value)} disabled={locked || Boolean(revokeAssignment)} />
            <button type="submit" disabled={locked || Boolean(revokeAssignment)}>搜尋</button>
          </div>
        </form>

        {revokeAssignment ? <form className="fms-role-assignment__form" onSubmit={(event) => void submitPreview(event)}>
          <h2>撤銷任用</h2>
          <p>{revokeAssignment.employeeName ?? revokeAssignment.employeeId} · {revokeAssignment.roleName}</p>
          <p>原任用期間：{revokeAssignment.validFrom.slice(0, 10)} 至 {revokeAssignment.validUntil?.slice(0, 10) ?? '未設定'}</p>
          <label htmlFor="fms-revoke-reason">撤銷理由</label>
          <textarea id="fms-revoke-reason" value={reason} maxLength={240} onChange={(event) => setReason(event.target.value)} disabled={locked} required rows={3} />
          <div className="fms-role-assignment__actions">
            <button type="submit" disabled={locked || !reason.trim()}>預覽撤銷</button>
            <button type="button" className="fms-role-assignment__secondary" onClick={cancelRevocation} disabled={locked}>取消撤銷</button>
          </div>
        </form> : <form className="fms-role-assignment__form" onSubmit={(event) => void submitPreview(event)}>
          <label htmlFor="fms-employee">員工</label>
          <select id="fms-employee" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} disabled={locked || employees.length === 0} required>
            <option value="">選擇在職員工</option>
            {employees.map((employee) => <option key={employee.employeeId} value={employee.employeeId}>{employee.displayName} · {employee.employeeId}</option>)}
          </select>
          {directoryCursor ? <button className="fms-role-assignment__next" type="button" onClick={() => void nextEmployeePage()} disabled={locked}>下一頁</button> : null}

          <label htmlFor="fms-role">可用角色</label>
          <select id="fms-role" value={stableRoleId} onChange={(event) => setStableRoleId(event.target.value)} disabled={locked || roles.length === 0} required>
            <option value="">選擇角色</option>
            {roles.map((role) => <option key={role.stableRoleId} value={role.stableRoleId}>{role.roleName}</option>)}
          </select>
          {roles.length === 0 ? <p role="alert">目前沒有可任用角色。</p> : null}

          <div className="fms-role-assignment__validity">
            <label htmlFor="fms-valid-from">生效時間</label>
            <input id="fms-valid-from" type="datetime-local" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} disabled={locked} required />
            <label htmlFor="fms-valid-until">到期時間</label>
            <input id="fms-valid-until" type="datetime-local" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} disabled={locked} />
          </div>
          <label htmlFor="fms-reason">任用理由</label>
          <textarea id="fms-reason" value={reason} maxLength={240} onChange={(event) => setReason(event.target.value)} disabled={locked} required rows={3} />
          <button type="submit" disabled={locked || !selectedEmployee || !selectedRole || !reason.trim()}>預覽變更</button>
        </form>}

        {preview ? <section className="fms-role-assignment__preview" aria-labelledby="fms-preview-title">
          <h2 id="fms-preview-title">變更預覽</h2>
          <p>{previewEmployeeName} · {previewRoleName}</p>
          <div className="fms-role-assignment__diff">
            <div><h3>變更前</h3>{previewBefore.length ? <ul>{previewBefore.map((row) => <li key={row.assignmentId}>{assignmentLine(row)}</li>)}</ul> : <p>無此員工的現行任用</p>}</div>
            <div><h3>變更後</h3>{previewAfter.length ? <ul>{previewAfter.map((row) => <li key={row.assignmentId}>{assignmentLine(row)}</li>)}</ul> : <p>無任用</p>}</div>
          </div>
          {phase === 'preview' ? <div className="fms-role-assignment__actions">
            {!activeWorkspace.allowedOperations.publish ? <p role="alert">目前沒有發布 FMS 任用的權限。</p> : null}
            <button type="button" onClick={() => void confirmPublish()} disabled={busy || !activeWorkspace.allowedOperations.publish}>確認並發布</button>
            <button type="button" className="fms-role-assignment__secondary" onClick={cancelPreview} disabled={busy}>取消預覽</button>
          </div> : null}
        </section> : null}
      </> : null}
    </main>
  )
}
