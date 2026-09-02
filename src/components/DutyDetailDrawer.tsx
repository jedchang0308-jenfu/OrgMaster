import { useEffect, useMemo, useRef, useState } from 'react'
import type { Duty, DutyPositionRelation, DutyRelationType, OrgDirectoryState } from '../types'

export const dutyRelationLabels: Record<DutyRelationType, string> = {
  execute: '執行',
  review: '審核',
  collaborate: '協作',
  countersign: '會簽',
}

const relationOrder: DutyRelationType[] = ['execute', 'review', 'countersign']

interface DutyDetailDrawerProps {
  duty: Duty | null
  state: OrgDirectoryState
  editingEnabled: boolean
  onClose: () => void
  onPatchDuty?: (patch: { title?: string; description?: string | null }) => void
  onRemoveRelation?: (relationId: string) => void
  onCreateRelation?: (relation: DutyPositionRelation) => void
  onTransfer?: (relation: DutyPositionRelation, targetPositionId: string) => void
  onDeleteDuty?: () => void
  onOpenConfiguration?: () => void
  configurationActionLabel?: string
  placementMode?: 'legacy-list' | 'organization-chart'
  displayMode?: 'drawer' | 'inspector' | 'panel'
  onSelectPendingRelation?: (relationId: string) => void
}

export function DutyDetailDrawer({ duty, state, editingEnabled, onClose, onPatchDuty, onRemoveRelation, onCreateRelation, onTransfer, onDeleteDuty, onOpenConfiguration, configurationActionLabel, placementMode = 'legacy-list', displayMode = 'drawer', onSelectPendingRelation }: DutyDetailDrawerProps) {
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  const [draftTitle, setDraftTitle] = useState(duty?.title ?? '')
  const [draftDescription, setDraftDescription] = useState(duty?.description ?? '')
  const [positionId, setPositionId] = useState('')
  const [relationType, setRelationType] = useState<DutyRelationType>('execute')
  const [transferTarget, setTransferTarget] = useState('')
  onCloseRef.current = onClose
  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onCloseRef.current()
      window.requestAnimationFrame(() => {
        const trigger = previousFocusRef.current
        if (trigger?.isConnected) trigger.focus()
      })
    }
    window.addEventListener('keydown', handleWindowKeyDown)
    return () => window.removeEventListener('keydown', handleWindowKeyDown)
  }, [])
  const relations = useMemo(() => duty ? state.dutyPositionRelations.filter((relation) => relation.dutyId === duty.id).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)) : [], [duty, state.dutyPositionRelations])
  const positions = state.positions.filter((position) => position.status === 'active').sort((a, b) => a.title.localeCompare(b.title, 'zh-Hant'))

  if (!duty) return null
  const commitText = () => {
    const title = draftTitle.trim()
    const description = draftDescription.trim() || null
    if (title && title !== duty.title) onPatchDuty?.({ title })
    if (description !== duty.description) onPatchDuty?.({ description })
  }
  const createRelation = () => {
    if (!positionId || !onCreateRelation) return
    const id = `rel-${crypto.randomUUID()}`
    onCreateRelation({ id, dutyId: duty.id, relationType, target: { kind: 'position', positionId }, isPrimaryExecutor: relationType === 'execute' && relations.every((relation) => !relation.isPrimaryExecutor), order: relations.filter((relation) => relation.relationType === relationType).length })
    setPositionId('')
  }
  const primary = relations.find((relation) => relation.isPrimaryExecutor && relation.relationType === 'execute')
  const primaryTargetId = primary?.target.kind === 'position' ? primary.target.positionId : ''
  return (
    <aside className={`duty-drawer${displayMode === 'inspector' ? ' duty-drawer--inspector' : ''}${displayMode === 'panel' ? ' duty-drawer--panel' : ''}`} aria-label="工作執掌明細" data-workspace-panel={displayMode === 'inspector' ? 'inspector' : undefined}>
      <div className="duty-drawer__header"><div><span>工作執掌明細</span><h2>{duty.title}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="關閉工作執掌明細">×</button></div>
      <div className="duty-drawer__body">
        {editingEnabled ? <>
          <label className="duty-field">名稱<input value={draftTitle} maxLength={120} onChange={(event) => setDraftTitle(event.target.value)} onBlur={commitText} /></label>
          <label className="duty-field">說明<textarea value={draftDescription} maxLength={2000} rows={4} onChange={(event) => setDraftDescription(event.target.value)} onBlur={commitText} /></label>
        </> : <>
          <div className="duty-field duty-field--readonly"><span>名稱</span><p>{duty.title}</p></div>
          <div className="duty-field duty-field--readonly"><span>說明</span><p>{duty.description || '尚無說明'}</p></div>
        </>}
        <section className="duty-detail-section"><div className="duty-detail-section__heading"><strong>職位關係</strong><small>{relations.length} 筆</small></div>
          {relationOrder.map((type) => {
            const grouped = relations.filter((relation) => relation.relationType === type)
            return <div className="duty-relation-group" key={type}><span className="duty-relation-group__label">{dutyRelationLabels[type]}</span>{grouped.length === 0 ? <small className="muted">尚未設定</small> : grouped.map((relation) => {
              const targetPositionId = relation.target.kind === 'position' ? relation.target.positionId : null
              const target = targetPositionId ? state.positions.find((position) => position.id === targetPositionId)?.title ?? '未知職位' : `${relation.target.kind === 'pending-reassignment' ? relation.target.formerPositionTitle : '未知職位'}（待重新分配）`
              const responsibilityLabel = type === 'execute' ? (relation.isPrimaryExecutor ? '主執行' : '協作') : dutyRelationLabels[type]
              return <div className="duty-relation-row" key={relation.id}><span>{target} · {responsibilityLabel}</span>{editingEnabled && onRemoveRelation && <button type="button" onClick={() => onRemoveRelation(relation.id)} aria-label={`移除${target}的${responsibilityLabel}關係`}>移除</button>}</div>
            })}</div>
          })}
        </section>
        {editingEnabled && placementMode === 'legacy-list' && onCreateRelation && <section className="duty-detail-section"><div className="duty-detail-section__heading"><strong>新增關係</strong><small>不會自動帶入主管</small></div><div className="duty-relation-form"><select aria-label="關係類型" value={relationType} onChange={(event) => setRelationType(event.target.value as DutyRelationType)}>{relationOrder.map((type) => <option key={type} value={type}>{dutyRelationLabels[type]}</option>)}</select><select aria-label="關係職位" value={positionId} onChange={(event) => setPositionId(event.target.value)}><option value="">選擇職位</option>{positions.map((position) => <option key={position.id} value={position.id}>{position.title}</option>)}</select><button type="button" className="primary-button" disabled={!positionId} onClick={createRelation}>新增</button></div></section>}
        {editingEnabled && placementMode === 'legacy-list' && primary && onTransfer && <section className="duty-detail-section"><div className="duty-detail-section__heading"><strong>永久移轉主執行</strong><small>只改主執行</small></div><select aria-label="永久移轉目標職位" value={transferTarget} onChange={(event) => setTransferTarget(event.target.value)}><option value="">選擇新主執行職位</option>{positions.filter((position) => position.id !== primaryTargetId).map((position) => <option key={position.id} value={position.id}>{position.title}</option>)}</select><button type="button" className="secondary-button" disabled={!transferTarget} onClick={() => { onTransfer(primary, transferTarget); setTransferTarget('') }}>移轉主執行</button></section>}
        {editingEnabled && placementMode === 'organization-chart' && relations.some((relation) => relation.target.kind === 'pending-reassignment') && <section className="duty-detail-section duty-detail-section--hint"><div className="duty-detail-section__heading"><strong>待重新分配</strong><small>回到組織圖點選目標職位</small></div>{relations.filter((relation) => relation.target.kind === 'pending-reassignment').map((relation) => <button type="button" className="secondary-button" key={relation.id} onClick={() => onSelectPendingRelation?.(relation.id)}>在組織圖重新配置「{relation.target.kind === 'pending-reassignment' ? relation.target.formerPositionTitle : ''}」</button>)}</section>}
      </div>
      {(onOpenConfiguration || (editingEnabled && onDeleteDuty)) && <div className="duty-drawer__footer">{onOpenConfiguration && <button type="button" className="primary-button" onClick={onOpenConfiguration}>{configurationActionLabel ?? '到組織圖配置'}</button>}{editingEnabled && onDeleteDuty && <button type="button" className="danger-link" onClick={onDeleteDuty}>刪除此執掌</button>}</div>}
    </aside>
  )
}
