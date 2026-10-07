export const WORKBENCH_LIST_WIDTH_MIN = 66
export const WORKBENCH_LIST_WIDTH_MAX = 800
export const WORKBENCH_LIST_DETAIL_SEPARATOR_WIDTH = 8

export interface WorkbenchWidthPolicy {
  panelMinWidthPx: number
  listMinWidthPx: number
  detailMinWidthPx: number
}

export const WORKBENCH_SHARED_WIDTH_POLICY = {
  panelMinWidthPx: 200,
  listMinWidthPx: WORKBENCH_LIST_WIDTH_MIN,
  detailMinWidthPx: 200,
} as const satisfies WorkbenchWidthPolicy

export const WORKBENCH_WIDTH_POLICIES = {
  employees: WORKBENCH_SHARED_WIDTH_POLICY,
  positions: WORKBENCH_SHARED_WIDTH_POLICY,
  departments: WORKBENCH_SHARED_WIDTH_POLICY,
  levels: WORKBENCH_SHARED_WIDTH_POLICY,
  duties: WORKBENCH_SHARED_WIDTH_POLICY,
  processes: WORKBENCH_SHARED_WIDTH_POLICY,
  'management-methods': WORKBENCH_SHARED_WIDTH_POLICY,
  'role-risks': WORKBENCH_SHARED_WIDTH_POLICY,
} as const satisfies Record<string, WorkbenchWidthPolicy>

export type WorkbenchModuleId = keyof typeof WORKBENCH_WIDTH_POLICIES

export function getWorkbenchWidthPolicy(moduleId: string): WorkbenchWidthPolicy | undefined {
  return Object.hasOwn(WORKBENCH_WIDTH_POLICIES, moduleId)
    ? WORKBENCH_WIDTH_POLICIES[moduleId as WorkbenchModuleId]
    : undefined
}

export function workbenchDualPaneMinWidth(policy: WorkbenchWidthPolicy) {
  return policy.listMinWidthPx + WORKBENCH_LIST_DETAIL_SEPARATOR_WIDTH + policy.detailMinWidthPx
}

export function workbenchListWidthMin(moduleId: string) {
  return getWorkbenchWidthPolicy(moduleId)?.listMinWidthPx ?? WORKBENCH_LIST_WIDTH_MIN
}
