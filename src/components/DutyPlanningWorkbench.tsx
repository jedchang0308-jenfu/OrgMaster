import type { DutyPlanningStatusFilter, DutyPlanningView } from '../dutyPlanningRoute'
import type { OrgDirectoryState } from '../types'
import { DutyAuditView } from './DutyAuditView'
import { DutyDistributionView } from './DutyDistributionView'

interface DutyPlanningWorkbenchProps {
  state: OrgDirectoryState
  view: DutyPlanningView
  query: string
  anomalyTypes: DutyPlanningStatusFilter[]
  onQueryChange: (value: string) => void
  onAnomalyTypesChange: (value: DutyPlanningStatusFilter[]) => void
  onClearFilters: () => void
  onSelectDuty: (dutyId: string) => void
}

/** Read-only composition for DEV-036. Relation mutation stays in DEV-034. */
export function DutyPlanningWorkbench({ state, view, query, anomalyTypes, onQueryChange, onAnomalyTypesChange, onClearFilters, onSelectDuty }: DutyPlanningWorkbenchProps) {
  if (view === 'distribution') return <DutyDistributionView state={state} query={query} onQueryChange={onQueryChange} />
  return <DutyAuditView state={state} query={query} anomalyTypes={anomalyTypes} onQueryChange={onQueryChange} onAnomalyTypesChange={onAnomalyTypesChange} onClearFilters={onClearFilters} onSelectDuty={onSelectDuty} />
}
