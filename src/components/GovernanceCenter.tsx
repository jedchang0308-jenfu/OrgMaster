import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import { loadGovernance, loadGovernanceAudit, loadGovernanceSession, patchGovernanceDraft, publishGovernancePolicy, setActiveGovernanceVersion, validateGovernanceAssignment, type GovernanceApiSnapshot, type GovernanceSession, type GovernanceVersionSummary } from '../governance/apiClient'
import { describeGovernanceFailure, formatGovernanceDateTime, governanceAssignmentChanges, governancePublishBlockersV2, type GovernanceAssignmentChange, type GovernanceFailureView } from '../governance/governancePresentation'
import { classifyAssignmentSurface, isSystemAdminRoleIdentity } from '../governance/assignmentSurface'
import type { GovernanceCommandV2, GovernanceRoleAssignmentV2, GovernanceRoleDelegationV2, ExternalRoleCatalogSnapshotV1 } from '../governance/types'
import type { Department, Employee, Role } from '../types'
import { GovernanceAssignmentCheck, type GovernanceAssignmentCheckResult } from './GovernanceAssignmentCheck'
import { GovernancePrivilegedAssignments } from './GovernancePrivilegedAssignments'
import { GovernanceEmployeeRecommendations } from './GovernanceEmployeeRecommendations'
import { employeeRecommendationAllowed, type EmployeeRecommendationRequest } from '../governance/employeeRecommendations'
import './GovernanceCenter.css'

export type GovernanceSectionId = 'identity' | 'catalog' | 'assignments' | 'delegation' | 'versions' | 'audit' | 'check'
type Props = { employees: Employee[]; departments: Department[]; roles: Role[]; currentOrganizationVersionId: string | null; currentOrganizationRevision?: string | null; visibility?: 'active' | 'hidden'; initialSection?: GovernanceSectionId; onSectionChange?: (section: GovernanceSectionId) => void; workspaceMutationAllowed?: boolean; refreshToken?: number; onChanged?: () => void; onOpenEmployee?: (employeeId: string) => void }
type SectionId = GovernanceSectionId
const NAV: Array<{ id: SectionId; label: string }> = [
  { id: 'identity', label: '帳號治理' }, { id: 'catalog', label: '應用角色目錄' }, { id: 'assignments', label: '角色指派' }, { id: 'delegation', label: '角色代理' }, { id: 'versions', label: '發布版本' }, { id: 'audit', label: '稽核' }, { id: 'check', label: '指派檢查' },
]
const now = () => new Date().toISOString()
const activeAt = (status: string, from: string, to: string | null, at = now()) => status === 'active' && Date.parse(from) <= Date.parse(at) && (to === null || Date.parse(at) < Date.parse(to))
function employeeName(employees: Employee[], employeeId: string) { return employees.find((employee) => employee.id === employeeId)?.name ?? employeeId }
function accountTypeLabel(accountType?: string) { return accountType === 'human_personal' ? '日常帳號' : accountType === 'human_privileged' ? '特權帳號' : accountType === 'legacy_shared' ? '共用帳號' : accountType === 'service' ? '服務帳號' : '未分類' }
function scopeLabel(scope: GovernanceRoleAssignmentV2['scope']) { return scope.kind === 'global' ? '全域' : `${scope.kind}：${scope.value}` }
function roleLabel(catalogs: ExternalRoleCatalogSnapshotV1[], _draft: GovernanceApiSnapshot['document']['draft'], assignment: GovernanceRoleAssignmentV2) { if (assignment.applicationId === 'orgmaster') return assignment.roleNameSnapshot; return catalogs.flatMap((catalog) => catalog.roles).find((role) => role.stableRoleId === assignment.roleId)?.displayName ?? assignment.roleNameSnapshot }
function isPrivilegedSystemAdminAssignment(assignment: GovernanceRoleAssignmentV2) { return assignment.applicationId === 'ai-pdm' && (assignment.roleId === 'role-system-admin' || assignment.roleCodeSnapshot === 'system_admin') }
type AssignmentStatusColor = 'effective' | 'future' | 'expired' | 'revoked'
type MatrixRoleTarget = { applicationId: GovernanceRoleAssignmentV2['applicationId']; id: string; name: string; allowedScopeKinds: readonly string[]; assignable: boolean }
type MatrixRole = { key: string; name: string; targets: Partial<Record<GovernanceRoleAssignmentV2['applicationId'], MatrixRoleTarget>> }
type AssignmentDialogState = { kind: 'add'; applicationId: 'ai-pdm' | 'orgmaster'; roleId: string; roleName: string } | { kind: 'details'; applicationId: GovernanceRoleAssignmentV2['applicationId']; roleId: string; roleName: string; employeeId: string }
function assignmentStatusColor(assignment: GovernanceRoleAssignmentV2, at: number): AssignmentStatusColor { if (assignment.status === 'revoked') return 'revoked'; const from = Date.parse(assignment.validFrom); const to = assignment.validTo ? Date.parse(assignment.validTo) : null; if (Number.isFinite(from) && from > at) return 'future'; if (to !== null && Number.isFinite(to) && to <= at) return 'expired'; return 'effective' }
function assignmentStatusLabel(status: AssignmentStatusColor) { return status === 'effective' ? '有效' : status === 'future' ? '尚未生效' : status === 'expired' ? '已到期' : '已撤銷' }
function applicationName(applicationId: GovernanceRoleAssignmentV2['applicationId'], applications: Array<{ id: string; name: string }>) { return applications.find((application) => application.id === applicationId)?.name ?? (applicationId === 'ai-pdm' ? 'AI-PDM' : applicationId === 'orgmaster' ? 'OrgMaster' : '財務管理系統') }

export function GovernanceCenter({ employees, departments, roles: _roles, currentOrganizationVersionId, currentOrganizationRevision = null, visibility = 'active', initialSection = 'identity', onSectionChange, workspaceMutationAllowed = true, refreshToken = 0, onChanged, onOpenEmployee }: Props) {
  const [snapshot, setSnapshot] = useState<GovernanceApiSnapshot | null>(null)
  const [session, setSession] = useState<GovernanceSession | null>(null)
  const [revision, setRevision] = useState('')
  const [section, setSection] = useState<SectionId>(initialSection)
  const [failure, setFailure] = useState<GovernanceFailureView | null>(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [mobileReadOnly, setMobileReadOnly] = useState(false)
  const [privilegedView, setPrivilegedView] = useState(false)
  const [audit, setAudit] = useState<Array<Record<string, unknown>>>([])
  const [assignmentEmployeeId, setAssignmentEmployeeId] = useState('')
  const [assignmentApplicationId, setAssignmentApplicationId] = useState<'ai-pdm' | 'orgmaster'>('ai-pdm')
  const [assignmentRoleId, setAssignmentRoleId] = useState('')
  const [assignmentScopeKind, setAssignmentScopeKind] = useState<'global' | 'workspace' | 'department' | 'project' | 'product'>('workspace')
  const [assignmentScopeValue, setAssignmentScopeValue] = useState('current')
  const [assignmentValidFrom, setAssignmentValidFrom] = useState(now().slice(0, 16))
  const [assignmentValidTo, setAssignmentValidTo] = useState('')
  const [assignmentDialog, setAssignmentDialog] = useState<AssignmentDialogState | null>(null)
  const assignmentDialogRef = useRef<HTMLDialogElement>(null)
  const [clockNow, setClockNow] = useState(Date.now())
  const [delegationSourceId, setDelegationSourceId] = useState('')
  const [delegationToEmployeeId, setDelegationToEmployeeId] = useState('')
  const [delegationValidTo, setDelegationValidTo] = useState('')
  const [delegationReason, setDelegationReason] = useState('')
  const [publishReason, setPublishReason] = useState('')
  const [checkResult, setCheckResult] = useState<GovernanceAssignmentCheckResult | null>(null)

  const clearFeedback = useCallback(() => { setFailure(null); setNotice('') }, [])
  const recordFailure = useCallback((error: unknown) => { setNotice(''); setFailure(describeGovernanceFailure(error)) }, [])
  const refresh = useCallback(async (reset = true) => { if (reset) clearFeedback(); try { const [loaded, currentSession] = await Promise.all([loadGovernance(), loadGovernanceSession()]); setSnapshot(loaded.payload); setRevision(loaded.revision || loaded.payload.revision); setSession(currentSession.payload); return true } catch (error) { recordFailure(error); return false } }, [clearFeedback, recordFailure])
  useEffect(() => { if (visibility === 'hidden') return; void refresh() }, [refresh, refreshToken, visibility])
  useEffect(() => { const media = window.matchMedia('(max-width: 767px)'); const update = () => setMobileReadOnly(media.matches); update(); media.addEventListener('change', update); return () => media.removeEventListener('change', update) }, [])
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 3200); return () => window.clearTimeout(timer) }, [notice])
  useEffect(() => { setSection(initialSection); setPrivilegedView(false) }, [initialSection])
  useEffect(() => { const timer = window.setInterval(() => setClockNow(Date.now()), 60_000); return () => window.clearInterval(timer) }, [])
  useEffect(() => { const dialog = assignmentDialogRef.current; if (assignmentDialog && dialog && !dialog.open) dialog.showModal(); else if (!assignmentDialog && dialog?.open) dialog.close() }, [assignmentDialog])

  const document = snapshot?.document ?? { activePolicyVersionId: null }
  const draft = snapshot?.document?.draft ?? null
  const catalogs = snapshot?.catalogs ?? []
  const catalog = catalogs.find((entry) => entry.applicationId === 'ai-pdm')
  const actorPrincipalId = session?.actor.principalId ?? ''
  const identityLinks = draft?.identityLinks ?? []
  const catalogReady = catalog?.validationState === 'valid'
  const identityMutationAllowed = workspaceMutationAllowed && Boolean(session?.capabilities.manage) && !mobileReadOnly
  const mutationAllowed = identityMutationAllowed && catalogReady
  const internalRoles = useMemo(() => draft?.applicationRoles.filter((role) => role.applicationId === 'orgmaster' && role.status === 'active') ?? [], [draft])
  const externalRoles = catalog?.roles.filter((role) => role.status === 'active') ?? []
  const selectableRoles = assignmentApplicationId === 'orgmaster' ? internalRoles.map((role) => ({ id: role.id, code: role.code, name: role.name, allowedScopeKinds: ['global'] as const })) : externalRoles.filter((role) => role.assignable && !isSystemAdminRoleIdentity(role)).map((role) => ({ id: role.stableRoleId, code: role.code, name: role.displayName, allowedScopeKinds: role.allowedScopeKinds }))
  const roleAssignments = draft?.roleAssignments ?? []
  const ordinaryRoleAssignments = roleAssignments.filter((assignment) => !isPrivilegedSystemAdminAssignment(assignment))
  const matrixRoles = useMemo(() => {
    const rows = new Map<string, MatrixRole>()
    const registeredRoleTargets = new Set<string>()
    const assigned = new Set(ordinaryRoleAssignments.map((assignment) => `${assignment.applicationId}:${assignment.roleId}`))
    const addRoleTarget = (target: MatrixRoleTarget, roleCode: string) => {
      const isAdministrator = (target.applicationId === 'orgmaster' && roleCode === 'orgmaster_admin') || (target.applicationId === 'ai-pdm' && roleCode === 'pdm_admin')
      const key = isAdministrator ? 'system-administrator' : `${target.applicationId}:${target.id}`
      const row = rows.get(key) ?? { key, name: isAdministrator ? '系統管理員' : target.name, targets: {} }
      row.targets[target.applicationId] = target
      rows.set(key, row)
      registeredRoleTargets.add(`${target.applicationId}:${target.id}`)
    }
    for (const role of draft?.applicationRoles ?? []) {
      if (role.applicationId !== 'orgmaster') continue
      const key = `orgmaster:${role.id}`
      if (role.status === 'active' || assigned.has(key)) addRoleTarget({ applicationId: 'orgmaster', id: role.id, name: role.name, allowedScopeKinds: ['global'], assignable: role.status === 'active' }, role.code)
    }
    for (const roleCatalog of catalogs) for (const role of roleCatalog.roles) {
      if (roleCatalog.applicationId === 'ai-pdm' && isSystemAdminRoleIdentity(role)) continue
      const key = `${roleCatalog.applicationId}:${role.stableRoleId}`
      const assignable = roleCatalog.applicationId === 'ai-pdm' && roleCatalog.validationState === 'valid' && role.status === 'active' && role.assignable && role.allowedScopeKinds.length > 0
      const visibleInMatrix = assigned.has(key) || (role.status === 'active' && (roleCatalog.applicationId !== 'ai-pdm' || (role.assignable && role.allowedScopeKinds.length > 0)))
      if (visibleInMatrix) addRoleTarget({ applicationId: roleCatalog.applicationId, id: role.stableRoleId, name: role.displayName, allowedScopeKinds: role.allowedScopeKinds, assignable }, role.code)
    }
    for (const assignment of ordinaryRoleAssignments) {
      const key = `${assignment.applicationId}:${assignment.roleId}`
      if (!registeredRoleTargets.has(key)) addRoleTarget({ applicationId: assignment.applicationId, id: assignment.roleId, name: assignment.roleNameSnapshot || '角色名稱未記錄', allowedScopeKinds: [], assignable: false }, assignment.roleCodeSnapshot)
    }
    const applicationOrder: GovernanceRoleAssignmentV2['applicationId'][] = ['ai-pdm', 'orgmaster', 'financial-management-system']
    return [...rows.values()].sort((left, right) => {
      const leftIsAdministrator = left.key === 'system-administrator'
      const rightIsAdministrator = right.key === 'system-administrator'
      if (leftIsAdministrator !== rightIsAdministrator) return leftIsAdministrator ? -1 : 1
      const leftOrder = applicationOrder.findIndex((applicationId) => left.targets[applicationId] !== undefined)
      const rightOrder = applicationOrder.findIndex((applicationId) => right.targets[applicationId] !== undefined)
      return leftOrder - rightOrder || left.name.localeCompare(right.name, 'zh-Hant')
    })
  }, [catalogs, draft?.applicationRoles, ordinaryRoleAssignments])
  const matrixApplications = useMemo(() => {
    const order: GovernanceRoleAssignmentV2['applicationId'][] = ['ai-pdm', 'orgmaster', 'financial-management-system']
    const ids = new Set<GovernanceRoleAssignmentV2['applicationId']>([
      ...matrixRoles.flatMap((role) => order.filter((applicationId) => role.targets[applicationId] !== undefined)),
      ...ordinaryRoleAssignments.map((assignment) => assignment.applicationId),
    ])
    return order.filter((id) => ids.has(id)).map((id) => ({ id, name: applicationName(id, draft?.applications ?? []) }))
  }, [draft?.applications, matrixRoles, ordinaryRoleAssignments])
  const systemAdminRole = externalRoles.find((role) => isSystemAdminRoleIdentity(role))
  const privilegedMode = Boolean(systemAdminRole && classifyAssignmentSurface('ai-pdm', systemAdminRole) === 'privileged_system_admin')
  const externalAssignments = roleAssignments.filter((assignment) => assignment.applicationId === 'ai-pdm' && assignment.status === 'active')
  const publishBlockers = draft && session ? governancePublishBlockersV2(draft, session.actor, currentOrganizationVersionId) : []
  const publishMutationAllowed = mutationAllowed && Boolean(session?.capabilities.publish)
  const simulationAllowed = Boolean(session?.capabilities.simulate)
  const versions = [...(snapshot?.versions ?? [])].sort((a, b) => b.versionNumber - a.versionNumber)
  const currentGovernanceVersion = versions.find((version) => version.id === document.activePolicyVersionId)
  const historicalGovernanceVersions = versions.filter((version) => version.id !== document.activePolicyVersionId)
  const publishedPolicy = snapshot?.document.publishedVersions.find((version) => version.id === document.activePolicyVersionId)
  const assignmentComparisonAvailable = Boolean(publishedPolicy && publishedPolicy.kind !== 'legacy-policy-v1' && currentGovernanceVersion)
  const pendingAssignmentChanges = draft && assignmentComparisonAvailable ? governanceAssignmentChanges(draft.roleAssignments, publishedPolicy!.policy.roleAssignments) : []
  const recommendationRole = externalRoles.find(role => role.stableRoleId === assignmentRoleId)
  const recommendationRequest = useMemo<EmployeeRecommendationRequest | null>(() => {
    const from = Date.parse(assignmentValidFrom), to = assignmentValidTo ? Date.parse(assignmentValidTo) : null
    if (assignmentDialog?.kind !== 'add' || assignmentApplicationId !== 'ai-pdm' || !currentOrganizationVersionId || !currentOrganizationRevision
      || !catalog || !employeeRecommendationAllowed(recommendationRole) || !Number.isFinite(from)
      || (to !== null && (!Number.isFinite(to) || to <= from)) || (assignmentScopeKind !== 'global' && !assignmentScopeValue.trim())) return null
    return {
      applicationId: 'ai-pdm', roleId: assignmentRoleId, expectedRevision: revision,
      expectedOrganizationVersionId: currentOrganizationVersionId, expectedOrganizationRevision: currentOrganizationRevision,
      expectedCatalogVersion: catalog.catalogVersion, expectedCatalogPayloadHash: catalog.payloadHash,
      scope: assignmentScopeKind === 'global' ? { kind: 'global' } : { kind: assignmentScopeKind, value: assignmentScopeValue.trim() },
      validFrom: new Date(from).toISOString(), validTo: to === null ? null : new Date(to).toISOString(),
    }
  }, [assignmentDialog, assignmentApplicationId, currentOrganizationVersionId, currentOrganizationRevision, catalog, recommendationRole, assignmentRoleId, revision, assignmentScopeKind, assignmentScopeValue, assignmentValidFrom, assignmentValidTo])

  useEffect(() => {
    const selected = selectableRoles.find((role) => role.id === assignmentRoleId)
    if (selected && !selected.allowedScopeKinds.includes(assignmentScopeKind as never)) {
      const first = selected.allowedScopeKinds[0]
      setAssignmentScopeKind(first)
      setAssignmentScopeValue(first === 'workspace' ? 'current' : '')
    }
  }, [assignmentRoleId, assignmentScopeKind, selectableRoles])

  async function runCommand(command: GovernanceCommandV2, success: string) { setBusy(true); clearFeedback(); try { const result = await patchGovernanceDraft(revision, command); setSnapshot((current) => current ? { ...current, document: result.payload.document } : current); setRevision(result.revision || result.payload.revision); setNotice(result.payload.status === 'noop' ? '內容沒有變更' : success); onChanged?.(); return true } catch (error) { recordFailure(error); return false } finally { setBusy(false) } }
  function assignmentValue(): GovernanceRoleAssignmentV2 | null {
    if (!assignmentEmployeeId || !assignmentRoleId || !draft) return null
    const selectedInternal = internalRoles.find((role) => role.id === assignmentRoleId)
    const selectedExternal = externalRoles.find((role) => role.stableRoleId === assignmentRoleId)
    if (assignmentApplicationId === 'orgmaster' && selectedInternal) return {
      id: draft.roleAssignments.find((value) => value.employeeId === assignmentEmployeeId && value.applicationId === 'orgmaster' && value.roleId === assignmentRoleId)?.id ?? `assignment-${crypto.randomUUID()}`,
      employeeId: assignmentEmployeeId,
      applicationId: 'orgmaster',
      roleId: selectedInternal.id,
      roleCodeSnapshot: selectedInternal.code,
      roleNameSnapshot: selectedInternal.name,
      catalogVersion: null,
      scope: { kind: 'global' },
      status: 'active',
      validFrom: new Date(assignmentValidFrom).toISOString(),
      validTo: assignmentValidTo ? new Date(assignmentValidTo).toISOString() : null,
      effectState: 'orgmaster-enforced',
    }
    if (!selectedExternal || selectedExternal.allowedScopeKinds.length === 0) return null
    const effectiveScopeKind = (selectedExternal.allowedScopeKinds.includes(assignmentScopeKind)
      ? assignmentScopeKind
      : selectedExternal.allowedScopeKinds[0]) as typeof assignmentScopeKind
    const effectiveScope = effectiveScopeKind === 'global'
      ? { kind: 'global' as const }
      : { kind: effectiveScopeKind, value: assignmentScopeValue }
    const existingId = draft.roleAssignments.find((value) => value.employeeId === assignmentEmployeeId && value.applicationId === 'ai-pdm' && value.roleId === assignmentRoleId && value.scope.kind === effectiveScope.kind && (effectiveScope.kind === 'global' || (value.scope.kind !== 'global' && value.scope.value === effectiveScope.value)))?.id
    return {
      id: existingId ?? `assignment-${crypto.randomUUID()}`,
      employeeId: assignmentEmployeeId,
      applicationId: 'ai-pdm',
      roleId: selectedExternal.stableRoleId,
      roleCodeSnapshot: selectedExternal.code,
      roleNameSnapshot: selectedExternal.displayName,
      catalogVersion: catalog?.catalogVersion ?? null,
      scope: effectiveScope,
      status: 'active',
      validFrom: new Date(assignmentValidFrom).toISOString(),
      validTo: assignmentValidTo ? new Date(assignmentValidTo).toISOString() : null,
      effectState: 'not-synchronized',
    }
  }
  async function submitAssignment() { const value = assignmentValue(); if (!value) { recordFailure({ code: 'GOVERNANCE_VALIDATION_FAILED', issues: [{ code: 'EXTERNAL_ROLE_UNKNOWN', message: '請選擇有效角色。' }] }); return } setBusy(true); clearFeedback(); try { const checked = await validateGovernanceAssignment(value); if (checked.payload.status !== 'valid') { recordFailure({ code: 'GOVERNANCE_VALIDATION_FAILED', issues: checked.payload.issues }); return } const ok = await runCommand({ type: 'UPSERT_ROLE_ASSIGNMENT', commandId: crypto.randomUUID(), reason: value.applicationId === 'ai-pdm' ? '建立外部應用角色指派' : '建立 OrgMaster 治理角色指派', value }, '角色指派已加入草稿，尚未發布。'); if (ok) { setCheckResult(checked.payload); setAssignmentDialog(null) } } catch (error) { recordFailure(error) } finally { setBusy(false) } }
  async function revokeAssignment(value: GovernanceRoleAssignmentV2) { if (value.status !== 'active') return false; const ok = await runCommand({ type: 'REVOKE_ROLE_ASSIGNMENT', commandId: crypto.randomUUID(), reason: '撤銷角色指派', id: value.id }, '角色指派已撤銷'); if (ok) setAssignmentDialog(null); return ok }
  function openAssignmentAdd(role: MatrixRoleTarget) { if (!mutationAllowed || !role.assignable || (role.applicationId !== 'orgmaster' && role.applicationId !== 'ai-pdm')) return; const scopeKind = role.applicationId === 'orgmaster' ? 'global' : (role.allowedScopeKinds[0] as typeof assignmentScopeKind | undefined) ?? 'workspace'; setAssignmentApplicationId(role.applicationId); setAssignmentRoleId(role.id); setAssignmentEmployeeId(''); setAssignmentScopeKind(scopeKind); setAssignmentScopeValue(scopeKind === 'workspace' ? 'current' : ''); setAssignmentValidFrom(new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)); setAssignmentValidTo(''); clearFeedback(); setAssignmentDialog({ kind: 'add', applicationId: role.applicationId, roleId: role.id, roleName: role.name }) }
  function openAssignmentDetails(role: MatrixRoleTarget, employeeId: string) { clearFeedback(); setAssignmentDialog({ kind: 'details', applicationId: role.applicationId, roleId: role.id, roleName: role.name, employeeId }) }
  function closeAssignmentDialog() { assignmentDialogRef.current?.close(); setAssignmentDialog(null) }
  function submitDelegation() { const source = externalAssignments.find((value) => value.id === delegationSourceId); if (!source || !delegationToEmployeeId || !delegationValidTo || !delegationReason.trim()) { recordFailure({ code: 'ROLE_DELEGATION_INVALID' }); return } const value: GovernanceRoleDelegationV2 = { id: `delegation-${crypto.randomUUID()}`, sourceAssignmentId: source.id, fromEmployeeId: source.employeeId, toEmployeeId: delegationToEmployeeId, applicationId: 'ai-pdm', roleId: source.roleId, catalogVersion: source.catalogVersion!, scope: source.scope, status: 'active', validFrom: source.validFrom, validTo: new Date(delegationValidTo).toISOString(), reason: delegationReason.trim(), effectState: 'not-synchronized' }; void runCommand({ type: 'UPSERT_ROLE_DELEGATION', commandId: crypto.randomUUID(), reason: '建立角色代理', value }, '角色代理已建立，尚未同步至目標系統') }
  async function loadAudit() { try { const result = await loadGovernanceAudit(); setAudit(result.payload.items as Array<Record<string, unknown>>) } catch (error) { recordFailure(error) } }
  function changeSection(next: SectionId) { setSection(next); if (next !== 'assignments') setPrivilegedView(false); onSectionChange?.(next); clearFeedback(); if (next === 'audit') void loadAudit() }
  async function publish() { if (!currentOrganizationVersionId || !publishReason.trim() || publishBlockers.length) { recordFailure({ code: publishBlockers.length ? 'GOVERNANCE_VALIDATION_FAILED' : 'ORGANIZATION_VERSION_INVALID', issues: publishBlockers.map((blocker) => ({ code: blocker.code, message: blocker.message })) }); return } setBusy(true); clearFeedback(); try { const result = await publishGovernancePolicy(revision, crypto.randomUUID(), publishReason.trim(), currentOrganizationVersionId); await refresh(false); setPublishReason(''); setNotice(`OrgMaster 已發布第${result.payload.versionSummary.versionNumber}版`) } catch (error) { recordFailure(error) } finally { setBusy(false) } }
  async function reactivate(versionId: string, versionNumber: number) { setBusy(true); try { await setActiveGovernanceVersion(revision, crypto.randomUUID(), '重新啟用角色指派版本', versionId); await refresh(false); setNotice(`角色指派版本 v${versionNumber} 已重新啟用`) } catch (error) { recordFailure(error) } finally { setBusy(false) } }
  async function checkAssignment() { const value = assignmentValue(); if (!value) return; setBusy(true); clearFeedback(); try { const result = await validateGovernanceAssignment(value); setCheckResult(result.payload); if (result.payload.status === 'valid') setNotice('指派檢查通過，尚未寫入治理資料') } catch (error) { recordFailure(error) } finally { setBusy(false) } }

  const content = <section className="governance-center governance-center--workspace" role="region" aria-labelledby="governance-title"><h1 className="governance-visually-hidden" id="governance-title">角色指派治理</h1><div className="governance-center__body"><nav className="governance-nav" aria-label="治理區段">{NAV.map((item) => <button type="button" key={item.id} className={section === item.id ? 'is-active' : ''} onClick={() => changeSection(item.id)}>{item.label}</button>)}</nav><main className="governance-main">{mobileReadOnly && <div className="governance-readonly" role="status">手機僅供閱讀</div>}{failure && <div className="governance-error" role="alert"><span>{failure.message}</span>{failure.canReload && <button type="button" className="button" onClick={() => void refresh()}>重新載入</button>}</div>}{notice && <div className="governance-notice" role="status">{notice}</div>}{!draft && !failure && <div className="governance-loading" role="status">載入治理資料…</div>}
{draft && section === 'identity' && <section className="governance-section"><SectionHeading eyebrow="Employee identity governance" title="帳號治理" count={`${identityLinks.length} 筆`} /><p className="governance-muted">這裡是跨員工檢視與異常定位；建立或管理登入身分請回到指定員工的「登入身分」明細。</p><div className="governance-table-wrap"><table className="governance-table"><thead><tr><th>登入身分</th><th>Employee</th><th>Issuer</th><th>帳號類型</th><th>狀態</th>{identityMutationAllowed && <th>操作</th>}</tr></thead><tbody>{identityLinks.map((link) => { const admission = draft.principalAdmissions?.find((candidate) => candidate.identityLinkId === link.id && candidate.status === 'active'); const isCurrent = link.principalId === actorPrincipalId; const canStatus = identityMutationAllowed && !admission && !isCurrent; return <tr key={link.id}><td>{link.subjectHint}<small>Principal {link.principalId}</small></td><td><button type="button" className="governance-employee-link" onClick={() => onOpenEmployee?.(link.employeeId)}>{employeeName(employees, link.employeeId)}</button></td><td>{link.issuer}</td><td>{accountTypeLabel(admission?.accountType)}</td><td>{link.status === 'active' ? '有效' : '停用'}</td>{identityMutationAllowed && <td>{canStatus ? <button type="button" className="button button--quiet" disabled={busy} onClick={() => void runCommand({ type: 'SET_IDENTITY_LINK_STATUS', commandId: crypto.randomUUID(), reason: link.status === 'active' ? '停用身分連結' : '重新啟用身分連結', id: link.id, status: link.status === 'active' ? 'inactive' : 'active' }, link.status === 'active' ? '身分連結已停用' : '身分連結已重新啟用')}>{link.status === 'active' ? '停用' : '重新啟用'}</button> : <small>{admission ? '已有帳號准入' : isCurrent ? '目前登入身分' : '唯讀'}</small>}</td>}</tr> })}</tbody></table></div>{!identityLinks.length && <p className="governance-empty">尚無已連結的登入身分；請從員工明細開始建立關係。</p>}</section>}
{draft && section === 'catalog' && <section className="governance-section"><SectionHeading eyebrow="External role catalog" title="應用角色目錄" count={`${(catalog?.roles.length ?? 0) + internalRoles.length} 筆`} /><div className="governance-source-note">AI-PDM · {catalog?.catalogVersion ?? '尚未取得'} · {catalog?.validationState === 'valid' ? '來源有效' : `來源${catalog?.validationState ?? '未知'}`} · 只讀</div><div className="governance-role-groups"><RoleGroup title="OrgMaster 自有角色" roles={internalRoles.map((role) => ({ id: role.id, name: role.name, code: role.code, risk: role.code === 'orgmaster_admin' ? 'high' : 'normal', assignable: true, scope: 'global' }))} /><RoleGroup title="AI-PDM 角色（唯讀）" roles={(catalog?.roles ?? []).map((role) => ({ id: role.stableRoleId, name: role.displayName, code: role.code, risk: role.riskLevel, assignable: role.assignable, scope: role.allowedScopeKinds.join('、') }))} /></div><p className="governance-muted">外部系統定義角色能力與權限細節；OrgMaster 只管理人員角色指派與治理狀態。</p></section>}
{draft && section === 'assignments' && <section className="governance-section">
  {privilegedView ? <>
    <div className="governance-privileged__mode-switch"><button type="button" className="button button--quiet" onClick={() => { clearFeedback(); setPrivilegedView(false) }}>返回角色指派</button></div>
    {privilegedMode ? <GovernancePrivilegedAssignments employees={employees} workspaceMutationAllowed={workspaceMutationAllowed && !mobileReadOnly} onChanged={() => void refresh(false)} /> : <div className="governance-privileged__state" role="alert"><strong>特權設定目前僅供閱讀</strong><p>system_admin 角色契約未完整符合目前目錄；暫時無法管理特權指派。</p></div>}
  </> : <>
    <div className="governance-matrix-toolbar"><SectionHeading title="系統 × 角色指派矩陣" /><div className="governance-matrix-toolbar__tools"><AssignmentStatusLegend /><div className="governance-draft-shortcut"><button type="button" className="button button--quiet" onClick={() => changeSection('versions')}>查看待發布內容</button><button type="button" className="button button--quiet" onClick={() => { clearFeedback(); setPrivilegedView(true) }}>特權設定</button></div></div></div>
    {matrixRoles.length && matrixApplications.length ? <><div className="governance-matrix-scroll"><table className="governance-matrix"><caption className="governance-visually-hidden">角色為列、系統為欄；員工指派顯示於所屬系統的交叉格。各系統管理員集中顯示於系統管理員列。</caption><thead><tr><th scope="col">角色 / 系統</th>{matrixApplications.map((application) => <th scope="col" key={application.id}>{application.name}</th>)}</tr></thead><tbody>{matrixRoles.map((role) => <tr key={role.key}><th scope="row"><strong>{role.name}</strong></th>{matrixApplications.map((application) => {
      const targetRole = role.targets[application.id]
      if (!targetRole) return <td key={application.id} className="governance-matrix__empty-cell"><span aria-label="不適用">—</span></td>
      const catalogRole = targetRole.applicationId === 'ai-pdm' ? catalog?.roles.find((role) => role.stableRoleId === targetRole.id) : undefined
      const roleCanBeAssigned = targetRole.applicationId === 'orgmaster' ? targetRole.assignable : catalogRole?.status === 'active' && catalogRole.assignable && catalogRole.allowedScopeKinds.length > 0
      const showAddAssignment = !mobileReadOnly && targetRole.applicationId !== 'financial-management-system' && roleCanBeAssigned
      const addAssignmentDisabledReason = !identityMutationAllowed ? '目前沒有角色指派管理權限' : !catalogReady ? '角色目錄尚未就緒' : '新增員工指派'
      const roleAssignmentsForCell = ordinaryRoleAssignments.filter((assignment) => assignment.applicationId === targetRole.applicationId && assignment.roleId === targetRole.id)
      const employeeIds = [...new Set(roleAssignmentsForCell.map((assignment) => assignment.employeeId))].sort((left, right) => employeeName(employees, left).localeCompare(employeeName(employees, right), 'zh-Hant'))
      return <td key={application.id} className="governance-matrix__cell">
        {employeeIds.length ? <ul className="governance-matrix__people">{employeeIds.map((employeeId) => {
          const employeeAssignments = roleAssignmentsForCell.filter((assignment) => assignment.employeeId === employeeId)
          const statuses = [...new Set(employeeAssignments.map((assignment) => assignmentStatusColor(assignment, clockNow)))]
          const activeAssignments = employeeAssignments.filter((assignment) => assignment.status === 'active')
          return <li className="governance-matrix__person" key={employeeId}>
            <button type="button" className="governance-matrix__person-name" onClick={() => openAssignmentDetails(targetRole, employeeId)}>{employeeName(employees, employeeId)}{employeeAssignments.length > 1 && <small>{employeeAssignments.length} 筆</small>}</button>
            <div className="governance-matrix__person-statuses">{statuses.map((status) => <AssignmentStatusBadge key={status} status={status} />)}</div>
            {mutationAllowed && activeAssignments.length > 0 && <button type="button" className="governance-matrix__remove" aria-label={`撤銷 ${employeeName(employees, employeeId)} 的 ${targetRole.name} 指派`} title="撤銷員工指派" disabled={busy} onClick={() => activeAssignments.length === 1 ? void revokeAssignment(activeAssignments[0]) : openAssignmentDetails(targetRole, employeeId)}>×</button>}
          </li>
        })}</ul> : <span className="governance-matrix__no-assignments">尚無員工</span>}
        {showAddAssignment && <button type="button" className="governance-matrix__add" aria-label={`新增 ${targetRole.name} 指派`} title={addAssignmentDisabledReason} disabled={busy || !mutationAllowed || !targetRole.assignable} onClick={() => openAssignmentAdd(targetRole)}><span aria-hidden="true">＋</span> 新增</button>}
      </td>
    })}</tr>)}</tbody></table></div><p className="governance-matrix-swipe-hint">左右滑動可查看其他系統欄位</p></> : <p className="governance-empty">目前沒有可顯示的角色。</p>}
  </>}
  {assignmentDialog && <dialog ref={assignmentDialogRef} className="governance-assignment-dialog" aria-labelledby="governance-assignment-dialog-title" onClose={() => setAssignmentDialog(null)} onClick={(event) => { if (event.target === event.currentTarget) closeAssignmentDialog() }}>
    <div className="governance-assignment-dialog__content">
      <header className="governance-assignment-dialog__header"><div><small>{applicationName(assignmentDialog.applicationId, draft.applications)} · {assignmentDialog.roleName}</small><h2 id="governance-assignment-dialog-title">{assignmentDialog.kind === 'add' ? '新增員工指派' : `${employeeName(employees, assignmentDialog.employeeId)} 的指派明細`}</h2></div><button type="button" className="governance-assignment-dialog__close" aria-label="關閉明細" onClick={closeAssignmentDialog}>×</button></header>
      {failure && <div className="governance-error" role="alert"><span>{failure.message}</span></div>}
      {assignmentDialog.kind === 'add' ? <>
        <p className="governance-assignment-dialog__intro">選擇員工並設定範圍與生效期間。送出後先加入草稿，仍需發布新版本。</p>
        {assignmentApplicationId === 'ai-pdm' && employeeRecommendationAllowed(recommendationRole) && <GovernanceEmployeeRecommendations request={recommendationRequest} selectedEmployeeId={assignmentEmployeeId} disabled={busy || !mutationAllowed || visibility === 'hidden' || section !== 'assignments'} onSelect={employeeId => { if (employees.some(employee => employee.id === employeeId && employee.status === 'active')) setAssignmentEmployeeId(employeeId); else recordFailure({ code: 'EMPLOYEE_NOT_ACTIVE' }) }} />}
        <AssignmentForm employees={employees} departments={departments} applicationId={assignmentApplicationId} onApplicationChange={(value) => { setAssignmentApplicationId(value); setAssignmentRoleId(''); setAssignmentScopeKind(value === 'orgmaster' ? 'global' : 'workspace'); setAssignmentScopeValue(value === 'orgmaster' ? '' : 'current') }} onRoleChange={setAssignmentRoleId} roleId={assignmentRoleId} roles={selectableRoles} employeeId={assignmentEmployeeId} onEmployeeChange={setAssignmentEmployeeId} scopeKind={assignmentScopeKind} scopeValue={assignmentScopeValue} onScopeKindChange={(value) => { setAssignmentScopeKind(value); setAssignmentScopeValue(value === 'workspace' ? 'current' : '') }} onScopeValueChange={setAssignmentScopeValue} validFrom={assignmentValidFrom} validTo={assignmentValidTo} onValidFrom={setAssignmentValidFrom} onValidTo={setAssignmentValidTo} onSubmit={() => void submitAssignment()} busy={busy} contextLocked />
      </> : <>
        <p className="governance-assignment-dialog__intro">範圍、期間及版本資訊集中顯示於此；點「撤銷此筆」只會撤銷該筆指派。</p>
        <div className="governance-assignment-details">{ordinaryRoleAssignments.filter((assignment) => assignment.applicationId === assignmentDialog.applicationId && assignment.roleId === assignmentDialog.roleId && assignment.employeeId === assignmentDialog.employeeId).map((assignment) => {
          const pendingChange = pendingAssignmentChanges.find((change) => change.assignment.id === assignment.id)
          const status = assignmentStatusColor(assignment, clockNow)
          return <article className="governance-assignment-details__item" key={assignment.id}>
            <div className="governance-assignment-details__title"><strong>{assignment.roleNameSnapshot || assignment.roleCodeSnapshot}</strong><AssignmentStatusBadge status={status} /></div>
            <dl><div><dt>適用範圍</dt><dd>{assignmentScopeLabel(assignment.scope, departments)}</dd></div><div><dt>生效期間</dt><dd>{assignmentPeriod(assignment)}</dd></div><div><dt>目錄版本</dt><dd>{assignment.catalogVersion ?? 'OrgMaster 內部角色'}</dd></div><div><dt>發布狀態</dt><dd>{assignmentComparisonAvailable ? pendingChange ? `草稿待發布：${pendingChange.kind}` : '已包含於目前發布版本' : '無法與目前發布版本直接比較'}</dd></div></dl>
            {mutationAllowed && assignment.status === 'active' && <button type="button" className="button button--quiet" disabled={busy} onClick={() => void revokeAssignment(assignment)}>撤銷此筆指派</button>}
          </article>
        })}</div>
      </>}
      <footer className="governance-assignment-dialog__footer"><button type="button" className="button button--quiet" disabled={busy} onClick={closeAssignmentDialog}>{assignmentDialog.kind === 'add' ? '取消' : '關閉'}</button></footer>
    </div>
  </dialog>}
</section>}
{draft && section === 'delegation' && <section className="governance-section"><SectionHeading eyebrow="Role delegation" title="角色代理" count={`${draft.roleDelegations.length} 筆`} />{mutationAllowed && <div className="governance-assignment-form"><label>來源指派<select value={delegationSourceId} onChange={(event) => setDelegationSourceId(event.target.value)} disabled={busy}><option value="">選擇外部角色指派</option>{externalAssignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{employeeName(employees, assignment.employeeId)} · {roleLabel(catalogs, draft, assignment)}</option>)}</select></label><label>代理員工<select value={delegationToEmployeeId} onChange={(event) => setDelegationToEmployeeId(event.target.value)} disabled={busy}><option value="">選擇員工</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label><label>代理截止<input type="datetime-local" value={delegationValidTo} onChange={(event) => setDelegationValidTo(event.target.value)} disabled={busy} /></label><label>原因<input value={delegationReason} onChange={(event) => setDelegationReason(event.target.value)} maxLength={240} disabled={busy} /></label><button type="button" className="button button--primary" onClick={submitDelegation} disabled={busy}>建立代理</button></div>}{draft.roleDelegations.length ? <div className="governance-card-grid">{draft.roleDelegations.map((delegation) => <article className="governance-card" key={delegation.id}><strong>{employeeName(employees, delegation.fromEmployeeId)} → {employeeName(employees, delegation.toEmployeeId)}</strong><small>{roleLabel(catalogs, draft, { ...delegation, roleCodeSnapshot: '', roleNameSnapshot: '', employeeId: delegation.fromEmployeeId, status: delegation.status } as GovernanceRoleAssignmentV2)} · {scopeLabel(delegation.scope)}</small><span>{delegation.validFrom.slice(0, 10)} ～ {delegation.validTo.slice(0, 10)} · 尚未同步</span></article>)}</div> : <p className="governance-empty">尚無角色代理</p>}</section>}
{draft && section === 'versions' && <section className="governance-section">
  <SectionHeading eyebrow="角色指派發布紀錄 · 台北時間" title="發布版本" count={versions.length + ' 筆'} />
  <section className="governance-version-draft" aria-label="待發布角色指派">
    <h3>待發布角色指派{assignmentComparisonAvailable && <span>{pendingAssignmentChanges.length} 筆變更</span>}</h3>
    {(!assignmentComparisonAvailable || pendingAssignmentChanges.length > 0) && <p className="governance-muted">新增設定先保存為草稿；發布新版本後，才能在該版本查看。</p>}
    {assignmentComparisonAvailable ? pendingAssignmentChanges.length ? <AssignmentPreview employees={employees} departments={departments} entries={pendingAssignmentChanges} /> : <p className="governance-empty">角色指派與目前使用的版本相同。</p> : <>
      <p className="governance-muted">{document.activePolicyVersionId ? publishedPolicy?.kind === 'legacy-policy-v1' ? '目前使用的是舊版紀錄，以下僅列草稿，無法直接比對指派變更。' : '目前版本的指派內容未完整載入，以下僅列草稿，暫時無法判斷變更。' : '尚未選用發布版本，以下為草稿中的角色指派。'}</p>
      <AssignmentPreview employees={employees} departments={departments} entries={draft.roleAssignments.map((assignment) => ({ kind: '草稿', assignment }))} />
    </>}
  </section>
  {currentGovernanceVersion ? <section className="governance-version-current" aria-label="OrgMaster 目前使用的版本">
    <h3>OrgMaster 目前使用</h3>
    <VersionRecord version={currentGovernanceVersion} busy={busy} employees={employees} departments={departments} assignments={publishedPolicy?.policy.roleAssignments} />
  </section> : document.activePolicyVersionId ? <div className="governance-error" role="alert">
    <span>目前使用的版本資料未載入，請重新載入。</span>
    <button type="button" className="button" onClick={() => void refresh()}>重新載入</button>
  </div> : <p className="governance-empty">尚未選用發布版本</p>}
  <p className="governance-muted">外部系統的實際權限需至該系統確認。</p>
  {publishMutationAllowed && <div className="governance-publish-box">
    <label>發布原因<input value={publishReason} onChange={(event) => setPublishReason(event.target.value)} maxLength={240} placeholder="說明這次角色指派變更" /></label>
    <button type="button" className="button button--primary" onClick={() => void publish()} disabled={busy || publishBlockers.length > 0 || !publishReason.trim()}>發布新版本</button>
  </div>}
  {publishMutationAllowed && publishBlockers.length > 0 && <button type="button" className="governance-publish-readiness" onClick={() => changeSection(publishBlockers[0].section)}>
    <AlertTriangle size={14} />發布前還有 {publishBlockers.length} 項設定
  </button>}
  {historicalGovernanceVersions.length > 0 && <section className="governance-version-history" aria-label="歷史發布版本">
    <h3>歷史版本</h3>
    <ol className="governance-version-list">
      {historicalGovernanceVersions.map((version) => <li key={version.id}>
        <VersionRecord version={version} busy={busy} employees={employees} departments={departments} assignments={snapshot?.document.publishedVersions.find((record) => record.id === version.id)?.policy.roleAssignments} onReactivate={publishMutationAllowed ? reactivate : undefined} />
      </li>)}
    </ol>
  </section>}
  {!versions.length && <p className="governance-empty">尚無發布紀錄</p>}
</section>}
{draft && section === 'audit' && <section className="governance-section"><SectionHeading eyebrow="Governance change audit" title="稽核" count={`${audit.length} 筆`} /><button type="button" className="button" onClick={() => void loadAudit()}><RefreshCw size={14} />重新載入</button><div className="governance-table-wrap"><table className="governance-table"><thead><tr><th>時間</th><th>動作</th><th>Actor</th><th>Reason</th></tr></thead><tbody>{audit.map((event) => <tr key={String(event.id)}><td>{String(event.occurredAt)}</td><td>{String(event.action)}</td><td>{String(event.actorPrincipalId)}</td><td>{String(event.reason)}</td></tr>)}</tbody></table></div></section>}
{draft && section === 'check' && <section className="governance-section"><SectionHeading eyebrow="Candidate validation" title="指派檢查" count="不寫入" /><GovernanceAssignmentCheck result={checkResult} busy={busy} canCheck={simulationAllowed && Boolean(assignmentValue())} onCheck={() => void checkAssignment()} /></section>}
            </main></div></section>
  return content
}

function SectionHeading({ eyebrow, title, count }: { eyebrow?: string; title: string; count?: string }) { return <div className="governance-section-heading"><div>{eyebrow && <small>{eyebrow}</small>}<h2>{title}</h2></div>{count && <span>{count}</span>}</div> }

function VersionRecord({ version, busy, employees, departments, assignments, onReactivate }: { version: GovernanceVersionSummary; busy: boolean; employees: Employee[]; departments: Department[]; assignments?: GovernanceRoleAssignmentV2[]; onReactivate?: (versionId: string, versionNumber: number) => Promise<void> }) {
  return <article className="governance-version-record" aria-label={'第' + version.versionNumber + '版'}>
    <div className="governance-version-record__content">
      <div className="governance-version-record__heading">
        <h4>第{version.versionNumber}版</h4>
        <time dateTime={version.publishedAt}>{formatGovernanceDateTime(version.publishedAt)} 發布</time>
      </div>
      <p>{version.publishReason?.trim() || '未記錄發布原因'}</p>
      {version.kind !== 'legacy-policy-v1' && (assignments ? <details className="governance-version-details">
        <summary>查看指派內容（{assignments.length} 筆）</summary>
        <AssignmentPreview employees={employees} departments={departments} entries={assignments.map((assignment) => ({ kind: assignment.status === 'active' ? '有效' : '已撤銷', assignment }))} />
      </details> : <p className="governance-muted">指派內容未載入</p>)}
    </div>
    {onReactivate && version.kind === 'assignment-governance-v3' && <button type="button" className="button button--quiet" disabled={busy} onClick={() => void onReactivate(version.id, version.versionNumber)}>改用第{version.versionNumber}版</button>}
  </article>
}
function assignmentScopeLabel(scope: GovernanceRoleAssignmentV2['scope'], departments: Department[]) {
  if (scope.kind === 'global') return '全域'
  if (scope.kind === 'workspace') return scope.value === 'current' ? '目前工作區' : '工作區：' + scope.value
  if (scope.kind === 'department') return '部門：' + (departments.find((department) => department.id === scope.value)?.name ?? scope.value)
  return (scope.kind === 'project' ? '專案：' : '產品：') + scope.value
}
function assignmentDescription(assignment: GovernanceRoleAssignmentV2, departments: Department[]) {
  const application = assignment.applicationId === 'ai-pdm' ? 'AI-PDM' : assignment.applicationId === 'orgmaster' ? 'OrgMaster' : assignment.applicationId === 'financial-management-system' ? '財務管理系統' : '應用未記錄'
  const principalAssignment = (assignment as GovernanceRoleAssignmentV2 & { subjectKind?: string }).subjectKind === 'principal'
  return `${application} · ${assignment.roleNameSnapshot || assignment.roleCodeSnapshot || '角色未記錄'} · ${assignmentScopeLabel(assignment.scope, departments)}${principalAssignment ? ' · 特權帳號' : ''}`
}
function assignmentPeriod(assignment: GovernanceRoleAssignmentV2) {
  return formatGovernanceDateTime(assignment.validFrom) + ' 起 ～ ' + (assignment.validTo ? formatGovernanceDateTime(assignment.validTo) : '無截止日')
}
function AssignmentStatusBadge({ status }: { status: AssignmentStatusColor }) { return <span className={`governance-assignment-status governance-assignment-status--${status}`}>{assignmentStatusLabel(status)}</span> }
function AssignmentStatusLegend() { const statuses: AssignmentStatusColor[] = ['effective', 'future', 'expired', 'revoked']; return <div className="governance-status-legend" role="group" aria-label="指派狀態顏色圖例">{statuses.map((status) => <span className="governance-status-legend__item" key={status}><span className={`governance-status-legend__swatch governance-status-legend__swatch--${status}`} aria-hidden="true" />{assignmentStatusLabel(status)}</span>)}</div> }
function AssignmentPreview({ entries, employees, departments }: { entries: Array<{ kind: GovernanceAssignmentChange['kind'] | '草稿' | '有效' | '已撤銷'; assignment: GovernanceRoleAssignmentV2; before?: GovernanceRoleAssignmentV2 }>; employees: Employee[]; departments: Department[] }) {
  if (!entries.length) return <p className="governance-empty">沒有角色指派。</p>
  return <ul className="governance-assignment-preview">{entries.map(({ kind, assignment, before }) => <li key={assignment.id}>
    <span className="governance-assignment-preview__kind">{kind}</span>
    <div><strong>{employeeName(employees, assignment.employeeId)}</strong><span>{assignmentDescription(assignment, departments)}</span><small>{assignmentPeriod(assignment)}{!['有效', '已撤銷', '撤銷'].includes(kind) ? ' · ' + (assignment.status === 'active' ? '有效' : '已撤銷') : ''}</small>
      {before && <small>原設定：{employeeName(employees, before.employeeId)} · {assignmentDescription(before, departments)} · {assignmentPeriod(before)} · {before.status === 'active' ? '有效' : '已撤銷'}</small>}
    </div>
  </li>)}</ul>
}
function RoleGroup({ title, roles }: { title: string; roles: Array<{ id: string; name: string; code: string; risk: string; assignable: boolean; scope: string }> }) { return <section className="governance-role-group"><h3>{title}</h3><div className="governance-card-grid">{roles.map((role) => <article className="governance-card" key={role.id}><strong>{role.name}</strong><small>{role.code} · {role.scope}</small><span className={role.risk === 'high' ? 'governance-risk governance-risk--high' : 'governance-risk'}>{role.risk === 'high' ? '高風險' : '一般'} · {role.assignable ? '可指派' : '不可指派'}</span></article>)}</div></section> }
type AssignmentFormProps = { employees: Employee[]; departments: Department[]; applicationId: 'ai-pdm' | 'orgmaster'; onApplicationChange: (value: 'ai-pdm' | 'orgmaster') => void; onRoleChange: (value: string) => void; roles: Array<{ id: string; code: string; name: string; allowedScopeKinds: readonly string[] }>; roleId: string; employeeId: string; onEmployeeChange: (value: string) => void; scopeKind: 'global' | 'workspace' | 'department' | 'project' | 'product'; scopeValue: string; onScopeKindChange: (value: 'global' | 'workspace' | 'department' | 'project' | 'product') => void; onScopeValueChange: (value: string) => void; validFrom: string; validTo: string; onValidFrom: (value: string) => void; onValidTo: (value: string) => void; onSubmit: () => void; busy: boolean; contextLocked?: boolean }

function scopeKindLabel(kind: string) {
  if (kind === 'global') return '全域'
  if (kind === 'workspace') return '目前工作區'
  if (kind === 'department') return '部門'
  if (kind === 'project') return '專案'
  if (kind === 'product') return '產品'
  return kind
}

function AssignmentForm({ employees, departments, applicationId, onApplicationChange, onRoleChange, roles, roleId, employeeId, onEmployeeChange, scopeKind, scopeValue, onScopeKindChange, onScopeValueChange, validFrom, validTo, onValidFrom, onValidTo, onSubmit, busy, contextLocked = false }: AssignmentFormProps) {
  const selectedRole = roles.find((role) => role.id === roleId)
  const scopeKinds = selectedRole?.allowedScopeKinds ?? []
  const fixedScope = scopeKinds.length === 1
  const scopeValueLabel = scopeKind === 'project' ? '專案識別值' : scopeKind === 'product' ? '產品識別值' : scopeKindLabel(scopeKind) + '範圍值'

  return <form className="governance-assignment-form governance-role-assignment-form" onSubmit={(event) => { event.preventDefault(); onSubmit() }}>
    <label>員工
      <select value={employeeId} onChange={(event) => onEmployeeChange(event.target.value)} disabled={busy} required>
        <option value="">選擇員工</option>
        {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
      </select>
    </label>
    {contextLocked ? <div className="governance-assignment-context"><span>系統</span><strong>{applicationId === 'ai-pdm' ? 'AI-PDM' : 'OrgMaster'}</strong><span>角色</span><strong>{selectedRole?.name ?? roleId}</strong></div> : <>
      <label>應用
        <select value={applicationId} onChange={(event) => onApplicationChange(event.target.value as 'ai-pdm' | 'orgmaster')} disabled={busy}>
          <option value="ai-pdm">AI-PDM</option>
          <option value="orgmaster">OrgMaster</option>
        </select>
      </label>
      <label>角色
        <select aria-label="指派角色" value={roleId} onChange={(event) => onRoleChange(event.target.value)} disabled={busy || roles.length === 0} required>
          <option value="">選擇角色</option>
          {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
        </select>
      </label>
    </>}
    {!selectedRole ? <label>適用範圍<span className="governance-scope-value">依角色設定</span></label> : fixedScope && scopeKinds[0] === 'department' ? <label>適用範圍
      <select aria-label="適用範圍" value={scopeValue} onChange={(event) => onScopeValueChange(event.target.value)} disabled={busy} required>
        <option value="">選擇部門</option>
        {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
      </select>
    </label> : fixedScope ? <label>適用範圍<span className="governance-scope-value">{scopeKindLabel(scopeKinds[0])}</span></label> : <label>適用範圍
      <select aria-label="適用範圍" value={scopeKind} onChange={(event) => onScopeKindChange(event.target.value as AssignmentFormProps['scopeKind'])} disabled={busy}>
        {scopeKinds.map((kind) => <option key={kind} value={kind}>{scopeKindLabel(kind)}</option>)}
      </select>
    </label>}
    {selectedRole && !fixedScope && scopeKind === 'department' && <label>部門
      <select value={scopeValue} onChange={(event) => onScopeValueChange(event.target.value)} disabled={busy} required>
        <option value="">選擇部門</option>
        {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
      </select>
    </label>}
    {selectedRole && !['global', 'workspace', 'department'].includes(scopeKind) && <label>{scopeValueLabel}
      <input value={scopeValue} onChange={(event) => onScopeValueChange(event.target.value)} disabled={busy} required />
    </label>}
    <label>生效時間<input type="datetime-local" value={validFrom} onChange={(event) => onValidFrom(event.target.value)} disabled={busy} required /></label>
    <label>截止時間（可選）<input type="datetime-local" value={validTo} onChange={(event) => onValidTo(event.target.value)} disabled={busy} /></label>
    <button type="submit" className="button button--primary" disabled={busy || !employeeId || !roleId}>加入草稿</button>
  </form>
}
