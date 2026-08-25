export const DUTY_ANOMALY_PANEL_COLLAPSED_KEY = 'orgmaster.dutyPlanning.anomalyPanelCollapsed.v1'

export function readDutyAnomalyPanelCollapsed(storage?: Pick<Storage, 'getItem'> | null) {
  try {
    return storage?.getItem(DUTY_ANOMALY_PANEL_COLLAPSED_KEY) === 'true'
  } catch {
    return false
  }
}

export function writeDutyAnomalyPanelCollapsed(collapsed: boolean, storage?: Pick<Storage, 'setItem'> | null) {
  try {
    storage?.setItem(DUTY_ANOMALY_PANEL_COLLAPSED_KEY, String(collapsed))
  } catch {
    // Presentation preference is optional; an unavailable storage must fail open.
  }
}
