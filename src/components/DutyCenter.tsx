import { useEffect, useState } from 'react'
import { getDutyPlanningViewportMode, type DutyPlanningViewportMode } from '../dutyPlanningPresentation'
import type { DutyPlanningSurface } from '../dutyPlanningRoute'
import type { OrgDocumentKind } from '../documentStorage'
import type { OrgDirectoryState, Duty, DutyPositionRelation, Department, OrganizationLevel } from '../types'
import type { OrganizationCommand, OrganizationCommandResult } from '../organizationCommands'
import { DutyDeleteDialog, DutyEditDialog, DutyTransferDialog } from './DutyDialogs'
import { DutyDetailDrawer } from './DutyDetailDrawer'
import { DocumentMenu } from './DocumentMenu'
import { DutyPlanningWorkbench } from './DutyPlanningWorkbench'

interface DutyCenterProps {
  open: boolean
  onClose: () => void
  state: OrgDirectoryState
  departments: Department[]
  organizationLevels: OrganizationLevel[]
  editingEnabled: boolean
  isDirty: boolean
  savedAt: string | null
  persistenceKind: OrgDocumentKind | null
  autoSavePending: boolean
  autoSaveError: boolean
  onSave: () => void
  onSaveCopy: () => void
  onBackup: () => void
  onCommand: (command: OrganizationCommand) => OrganizationCommandResult
  focusPositionId?: string | null
  surface: DutyPlanningSurface
  onNavigateSurface: (surface: DutyPlanningSurface) => void
  presentation?: 'page' | 'modal'
}

export function DutyCenter({ open, onClose, state, departments, organizationLevels, editingEnabled, isDirty, savedAt, persistenceKind, autoSavePending, autoSaveError, onSave, onSaveCopy, onBackup, onCommand, focusPositionId: initialFocusPositionId, surface, onNavigateSurface, presentation = 'page' }: DutyCenterProps) {
  const [selectedDutyId, setSelectedDutyId] = useState<string | null>(null)
  const [dutyDialog, setDutyDialog] = useState<'create' | 'edit' | null>(null)
  const [deleteDuty, setDeleteDuty] = useState<Duty | null>(null)
  const [transfer, setTransfer] = useState<{ relation: DutyPositionRelation; targetId: string } | null>(null)
  const [focusPositionId, setFocusPositionId] = useState(initialFocusPositionId ?? null)
  const [matrixQuery, setMatrixQuery] = useState('')
  const [matrixPositionQuery, setMatrixPositionQuery] = useState('')
  const [matrixDepartmentFilter, setMatrixDepartmentFilter] = useState('')
  const [viewportMode, setViewportMode] = useState<DutyPlanningViewportMode>(() => getDutyPlanningViewportMode(typeof window === 'undefined' ? 1440 : window.innerWidth))
  useEffect(() => { if (open) setFocusPositionId(initialFocusPositionId ?? null) }, [initialFocusPositionId, open])
  useEffect(() => { const update = () => setViewportMode(getDutyPlanningViewportMode(window.innerWidth)); update(); window.addEventListener('resize', update); return () => window.removeEventListener('resize', update) }, [])
  useEffect(() => {
    const clear = () => setFocusPositionId(null)
    window.addEventListener('orgmaster-duty-clear-focus', clear)
    return () => window.removeEventListener('orgmaster-duty-clear-focus', clear)
  }, [])
  if (!open) return null
  const selectedDuty = state.duties.find((duty) => duty.id === selectedDutyId) ?? null
  const isPage = presentation === 'page'
  const command = (next: OrganizationCommand) => onCommand(next)
  const saveDuty = (title: string, description: string | null) => {
    if (dutyDialog === 'create') command({ type: 'CREATE_DUTY', duty: { id: `duty-${crypto.randomUUID()}`, title, description } })
    else if (selectedDuty) command({ type: 'PATCH_DUTY', dutyId: selectedDuty.id, title, description })
    setDutyDialog(null)
  }
  const writeEnabled = editingEnabled
  const showMatrixControls = true
  const content = <section className={`duty-center${isPage ? ' duty-center--page' : ''}`} role={isPage ? undefined : 'dialog'} aria-modal={isPage ? undefined : 'true'} aria-labelledby="duty-center-title">
    <header className="duty-center__header">
      <div className="duty-center__brand"><h1 id="duty-center-title">工作職掌規劃台</h1></div>
      {showMatrixControls && <div className="duty-center__matrix-controls" aria-label="職掌矩陣篩選工具"><input aria-label="搜尋工作執掌" placeholder="搜尋執掌" value={matrixQuery} onChange={(event) => setMatrixQuery(event.target.value)} /><input aria-label="搜尋職位" placeholder="搜尋職位" value={matrixPositionQuery} onChange={(event) => setMatrixPositionQuery(event.target.value)} /><select aria-label="依部門篩選" value={matrixDepartmentFilter} onChange={(event) => setMatrixDepartmentFilter(event.target.value)}><option value="">全部部門</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>{writeEnabled && <button type="button" className="primary-button duty-write-control" onClick={() => setDutyDialog('create')}>新增工作執掌</button>}</div>}
      <div className="duty-center__header-actions"><DocumentMenu isDirty={isDirty} savedAt={savedAt} persistenceKind={persistenceKind} autoSavePending={autoSavePending} autoSaveError={autoSaveError} onSave={onSave} onSaveCopy={onSaveCopy} onBackup={onBackup} /><span className={editingEnabled ? 'duty-mode-pill is-editable' : 'duty-mode-pill'}>{editingEnabled ? '可編輯' : '唯讀'}</span><button type="button" className={isPage ? 'secondary-button' : 'icon-button'} onClick={onClose} aria-label={isPage ? '返回組織圖' : '關閉中央職掌規劃'}>{isPage ? '← 返回組織圖' : '×'}</button></div>
    </header>
    <div className="duty-center__content"><DutyPlanningWorkbench state={state} departments={departments} organizationLevels={organizationLevels} editingEnabled={editingEnabled} focusPositionId={focusPositionId} onCommand={command} surface={surface === 'matrix' ? 'matrix' : 'workbench'} onNavigateSurface={onNavigateSurface} onSelectDuty={setSelectedDutyId} matrixQuery={matrixQuery} matrixPositionQuery={matrixPositionQuery} matrixDepartmentFilter={matrixDepartmentFilter} onMatrixQueryChange={setMatrixQuery} onMatrixPositionQueryChange={setMatrixPositionQuery} onMatrixDepartmentFilterChange={setMatrixDepartmentFilter} /></div>
    {selectedDuty && <DutyDetailDrawer duty={selectedDuty} state={state} editingEnabled={editingEnabled} onClose={() => setSelectedDutyId(null)} onPatchDuty={(patch) => command({ type: 'PATCH_DUTY', dutyId: selectedDuty.id, ...patch })} onRemoveRelation={(relationId) => command({ type: 'REMOVE_DUTY_RELATION', relationId })} onCreateRelation={(relation) => command({ type: 'UPSERT_DUTY_RELATION', relation })} onTransfer={(relation, targetPositionId) => setTransfer({ relation, targetId: targetPositionId })} onDeleteDuty={() => setDeleteDuty(selectedDuty)} />}
    {dutyDialog && <DutyEditDialog initialTitle={dutyDialog === 'edit' ? selectedDuty?.title : undefined} initialDescription={dutyDialog === 'edit' ? selectedDuty?.description : null} onCancel={() => setDutyDialog(null)} onSave={saveDuty} />}
    {deleteDuty && <DutyDeleteDialog dutyTitle={deleteDuty.title} relationCount={state.dutyPositionRelations.filter((relation) => relation.dutyId === deleteDuty.id).length} onCancel={() => setDeleteDuty(null)} onConfirm={() => { command({ type: 'DELETE_DUTY', dutyId: deleteDuty.id }); setDeleteDuty(null); setSelectedDutyId(null) }} />}
    {transfer && <DutyTransferDialog sourceTitle={state.positions.find((position) => position.id === (transfer.relation.target.kind === 'position' ? transfer.relation.target.positionId : ''))?.title ?? '原主執行'} targetTitle={state.positions.find((position) => position.id === transfer.targetId)?.title ?? transfer.targetId} onCancel={() => setTransfer(null)} onConfirm={() => { command({ type: 'TRANSFER_PRIMARY_DUTY_EXECUTOR', dutyId: transfer.relation.dutyId, sourceRelationId: transfer.relation.id, targetPositionId: transfer.targetId, targetRelationId: `rel-${crypto.randomUUID()}` }); setTransfer(null) }} />}
  </section>
  return isPage ? <main className="duty-page-shell" aria-labelledby="duty-center-title">{content}</main> : <div className="duty-center-backdrop" role="presentation">{content}</div>
}
