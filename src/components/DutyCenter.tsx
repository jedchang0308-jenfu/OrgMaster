import { useEffect, useState } from 'react'
import type { DutyPlanningStatusFilter, DutyPlanningView } from '../dutyPlanningRoute'
import type { OrgDocumentKind } from '../documentStorage'
import type { Department, OrgDirectoryState, OrganizationLevel } from '../types'
import { DutyDetailDrawer } from './DutyDetailDrawer'
import { DocumentMenu } from './DocumentMenu'
import { DutyPlanningWorkbench } from './DutyPlanningWorkbench'

interface DutyCenterProps {
  open: boolean
  onClose: () => void
  state: OrgDirectoryState
  departments: Department[]
  organizationLevels: OrganizationLevel[]
  isDirty: boolean
  savedAt: string | null
  persistenceKind: OrgDocumentKind | null
  autoSavePending: boolean
  autoSaveError: boolean
  onSave: () => void
  onSaveCopy: () => void
  onBackup: () => void
  view: DutyPlanningView
  query: string
  anomalyTypes: DutyPlanningStatusFilter[]
  onNavigateView: (view: DutyPlanningView) => void
  onQueryChange: (value: string) => void
  onAnomalyTypesChange: (value: DutyPlanningStatusFilter[]) => void
  onClearFilters: () => void
  onOpenDutyConfiguration: (dutyId: string) => void
  presentation?: 'page' | 'modal'
}

export function DutyCenter({ open, onClose, state, departments: _departments, organizationLevels: _organizationLevels, isDirty, savedAt, persistenceKind, autoSavePending, autoSaveError, onSave, onSaveCopy, onBackup, view, query, anomalyTypes, onNavigateView, onQueryChange, onAnomalyTypesChange, onClearFilters, onOpenDutyConfiguration, presentation = 'page' }: DutyCenterProps) {
  const [selectedDutyId, setSelectedDutyId] = useState<string | null>(null)
  useEffect(() => {
    if (selectedDutyId && !state.duties.some((duty) => duty.id === selectedDutyId)) setSelectedDutyId(null)
  }, [selectedDutyId, state.duties])
  if (!open) return null
  const selectedDuty = state.duties.find((duty) => duty.id === selectedDutyId) ?? null
  const isPage = presentation === 'page'
  const content = <section className={`duty-center duty-center--minimal${isPage ? ' duty-center--page' : ''}`} role={isPage ? undefined : 'dialog'} aria-modal={isPage ? undefined : 'true'} aria-labelledby="duty-center-title">
    <header className="duty-center__header">
      <div className="duty-center__brand"><span className="duty-center__eyebrow">工作執掌</span><h1 id="duty-center-title">責任規劃工作台</h1></div>
      <div className="duty-center__header-actions"><DocumentMenu isDirty={isDirty} savedAt={savedAt} persistenceKind={persistenceKind} autoSavePending={autoSavePending} autoSaveError={autoSaveError} onSave={onSave} onSaveCopy={onSaveCopy} onBackup={onBackup} /><span className="duty-mode-pill">唯讀工作台</span><button type="button" className="secondary-button" onClick={onClose}>{isPage ? '← 返回組織圖' : '×'}</button></div>
    </header>
    <nav className="duty-planning-tabs" aria-label="責任規劃視角"><a href="/duty-planning?view=audit" aria-current={view === 'audit' ? 'page' : undefined} className={view === 'audit' ? 'is-active' : undefined} onClick={(event) => { event.preventDefault(); onNavigateView('audit') }}>責任盤點</a><a href="/duty-planning?view=distribution" aria-current={view === 'distribution' ? 'page' : undefined} className={view === 'distribution' ? 'is-active' : undefined} onClick={(event) => { event.preventDefault(); onNavigateView('distribution') }}>責任分布</a></nav>
    <div className="duty-center__content"><DutyPlanningWorkbench state={state} view={view} query={query} anomalyTypes={anomalyTypes} onQueryChange={onQueryChange} onAnomalyTypesChange={onAnomalyTypesChange} onClearFilters={onClearFilters} onSelectDuty={setSelectedDutyId} /></div>
    {selectedDuty && <DutyDetailDrawer duty={selectedDuty} state={state} editingEnabled={false} onClose={() => setSelectedDutyId(null)} onOpenConfiguration={() => onOpenDutyConfiguration(selectedDuty.id)} configurationActionLabel="到組織圖配置" />}
  </section>
  return isPage ? <main className="duty-page-shell" aria-labelledby="duty-center-title">{content}</main> : <div className="duty-center-backdrop" role="presentation">{content}</div>
}
