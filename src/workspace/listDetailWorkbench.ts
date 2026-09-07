export type WorkbenchRowDirection = 'up' | 'down'

export const LIST_WIDTH_MIN = 160
export const LIST_WIDTH_MAX = 800

export function clampWorkbenchListWidth(value: number, min = LIST_WIDTH_MIN, max = LIST_WIDTH_MAX) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

export function nextWorkbenchRowIndex(index: number, length: number, direction: WorkbenchRowDirection) {
  if (length <= 0 || index < 0) return -1
  return Math.max(0, Math.min(length - 1, index + (direction === 'down' ? 1 : -1)))
}

export function isWorkbenchTextEditorTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    && Boolean(target.closest('input, textarea, select, [contenteditable="true"], [data-org-editor]'))
}
