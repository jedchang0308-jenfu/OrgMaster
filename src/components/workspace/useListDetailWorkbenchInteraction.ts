import { useCallback } from 'react'
import type { KeyboardEvent } from 'react'
import { isWorkbenchTextEditorTarget, nextWorkbenchRowIndex, type WorkbenchRowDirection } from '../../workspace/listDetailWorkbench'

interface Options {
  onNavigate?: (rowId: string, direction: WorkbenchRowDirection) => void | { kind: 'allow' | 'keep-open' } | Promise<{ kind: 'allow' | 'keep-open' }>
  rowSelector?: string
}

export function useListDetailWorkbenchInteraction({ onNavigate, rowSelector = '[data-workbench-row-id]' }: Options) {
  return useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (!onNavigate || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
    if (isWorkbenchTextEditorTarget(event.target)) return
    const target = event.target instanceof HTMLElement ? event.target : null
    const listSlot = event.currentTarget.querySelector<HTMLElement>('[data-workspace-slot="list"]')
    const row = target?.closest<HTMLElement>(rowSelector)
    if (!listSlot || !row || !listSlot.contains(row)) return
    const rows = Array.from(listSlot.querySelectorAll<HTMLElement>(rowSelector))
    const index = nextWorkbenchRowIndex(rows.indexOf(row), rows.length, event.key === 'ArrowDown' ? 'down' : 'up')
    const next = index >= 0 ? rows[index] : null
    if (!next || next === row) return
    event.preventDefault()
    const result = onNavigate(next.dataset.workbenchRowId ?? '', event.key === 'ArrowDown' ? 'down' : 'up')
    void Promise.resolve(result).then((outcome) => {
      if (!outcome || outcome.kind === 'allow') {
        next.focus({ preventScroll: true })
        next.scrollIntoView?.({ block: 'nearest' })
      }
    })
  }, [onNavigate, rowSelector])
}
