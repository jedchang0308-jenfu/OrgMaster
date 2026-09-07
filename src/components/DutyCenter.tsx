import { useEffect, useState } from 'react'
import type { DutyPlanningStatusFilter, DutyPlanningView } from '../dutyPlanningRoute'
import type { OrgDirectoryState } from '../types'
import { DutyDetailDrawer } from './DutyDetailDrawer'
import { DutyPlanningWorkbench } from './DutyPlanningWorkbench'

interface DutyCenterProps {
  state: OrgDirectoryState
  view: DutyPlanningView
  query: string
  anomalyTypes: DutyPlanningStatusFilter[]
  onNavigateView: (view: DutyPlanningView) => void
  onQueryChange: (value: string) => void
  onAnomalyTypesChange: (value: DutyPlanningStatusFilter[]) => void
  onClearFilters: () => void
  onOpenDutyConfiguration: (dutyId: string) => void
  displayMode?: 'drawer' | 'panel'
  selectedDutyId?: string | null
  onSelectDutyId?: (dutyId: string | null) => void
  slot?: 'full' | 'list' | 'detail'
}

export function DutyCenter({ state, view, query, anomalyTypes, onNavigateView, onQueryChange, onAnomalyTypesChange, onClearFilters, onOpenDutyConfiguration, displayMode = 'drawer', selectedDutyId: selectedDutyIdProp, onSelectDutyId, slot = 'full' }: DutyCenterProps) {
  const [localSelectedDutyId, setLocalSelectedDutyId] = useState<string | null>(null)
  const selectedDutyId = selectedDutyIdProp === undefined ? localSelectedDutyId : selectedDutyIdProp
  const setSelectedDutyId = (dutyId: string | null) => { onSelectDutyId?.(dutyId); if (selectedDutyIdProp === undefined) setLocalSelectedDutyId(dutyId) }
  useEffect(() => {
    if (selectedDutyId && !state.duties.some((duty) => duty.id === selectedDutyId)) setSelectedDutyId(null)
  }, [selectedDutyId, state.duties])
  const selectedDuty = state.duties.find((duty) => duty.id === selectedDutyId) ?? null
  const tabs = <nav className="duty-planning-tabs" aria-label="責任規劃視角"><a href="/duty-planning?view=audit" aria-current={view === 'audit' ? 'page' : undefined} className={view === 'audit' ? 'is-active' : undefined} onClick={(event) => { event.preventDefault(); onNavigateView('audit') }}>責任盤點</a><a href="/duty-planning?view=distribution" aria-current={view === 'distribution' ? 'page' : undefined} className={view === 'distribution' ? 'is-active' : undefined} onClick={(event) => { event.preventDefault(); onNavigateView('distribution') }}>責任分布</a></nav>
  const content = <div className="duty-center__content"><DutyPlanningWorkbench state={state} view={view} query={query} anomalyTypes={anomalyTypes} onQueryChange={onQueryChange} onAnomalyTypesChange={onAnomalyTypesChange} onClearFilters={onClearFilters} onSelectDuty={(dutyId) => setSelectedDutyId(dutyId)} /></div>
  const detail = selectedDuty ? <DutyDetailDrawer duty={selectedDuty} state={state} editingEnabled={false} displayMode={displayMode} onClose={() => setSelectedDutyId(null)} onOpenConfiguration={() => onOpenDutyConfiguration(selectedDuty.id)} configurationActionLabel="到組織圖配置" /> : null
  if (slot === 'list') return <section className="duty-center duty-center--minimal duty-center--panel duty-center--slot-list" aria-label="責任規劃清單">{tabs}{content}</section>
  if (slot === 'detail') return <section className="duty-center duty-center--minimal duty-center--panel duty-center--slot-detail" aria-label="責任規劃明細">{detail}</section>
  return <section className={`duty-center duty-center--minimal duty-center--panel${selectedDuty && displayMode === 'panel' ? ' has-detail' : ''}`} aria-label="責任規劃工作台">{tabs}{content}{detail}</section>
}
