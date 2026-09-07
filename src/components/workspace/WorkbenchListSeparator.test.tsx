/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { WorkbenchListSeparator } from './WorkbenchListSeparator'

describe('WorkbenchListSeparator', () => {
  it('commits clamped keyboard width and exposes ARIA state', async () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    const onChange = vi.fn()
    const onCommit = vi.fn()
    await act(async () => root.render(<WorkbenchListSeparator value={200} min={160} max={240} onChange={onChange} onCommit={onCommit} />))
    const separator = host.querySelector<HTMLElement>('[role="separator"]')!
    expect(separator.getAttribute('aria-valuenow')).toBe('200')
    await act(async () => separator.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    expect(onChange).toHaveBeenCalledWith(208)
    expect(onCommit).toHaveBeenCalledWith(208)
    expect(separator.getAttribute('aria-valuemax')).toBe('240')
    root.unmount()
  })

  it('keeps pointer drag on the separator and commits only after release', async () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    const onChange = vi.fn()
    const onCommit = vi.fn()
    await act(async () => root.render(<WorkbenchListSeparator value={200} min={160} max={240} onChange={onChange} onCommit={onCommit} />))
    const separator = host.querySelector<HTMLDivElement>('[role="separator"]')!
    let capturedPointerId: number | null = null
    separator.setPointerCapture = (pointerId) => { capturedPointerId = pointerId }
    separator.hasPointerCapture = (pointerId) => capturedPointerId === pointerId
    separator.releasePointerCapture = (pointerId) => { if (capturedPointerId === pointerId) capturedPointerId = null }
    const pointer = (type: string, clientX: number) => new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, clientX })

    await act(async () => separator.dispatchEvent(pointer('pointerdown', 100)))
    await act(async () => separator.dispatchEvent(pointer('pointermove', 130)))
    expect(onChange).toHaveBeenLastCalledWith(230)
    expect(onCommit).not.toHaveBeenCalled()
    await act(async () => separator.dispatchEvent(pointer('pointerup', 150)))
    expect(onChange).toHaveBeenLastCalledWith(240)
    expect(onCommit).toHaveBeenCalledWith(240)
    expect(capturedPointerId).toBeNull()
    root.unmount()
  })
})
