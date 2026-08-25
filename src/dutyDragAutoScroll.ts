export interface DutyDragAutoScrollOptions {
  threshold?: number
  maxStep?: number
}

export function getDutyDragAutoScrollDelta(
  pointerY: number,
  rect: Pick<DOMRect, 'top' | 'bottom'>,
  options: DutyDragAutoScrollOptions = {},
) {
  const threshold = options.threshold ?? 48
  const maxStep = options.maxStep ?? 14
  if (threshold <= 0 || maxStep <= 0) return 0
  const distanceFromTop = pointerY - rect.top
  const distanceFromBottom = rect.bottom - pointerY
  if (distanceFromTop >= 0 && distanceFromTop < threshold) {
    return -Math.ceil(maxStep * (1 - distanceFromTop / threshold))
  }
  if (distanceFromBottom >= 0 && distanceFromBottom < threshold) {
    return Math.ceil(maxStep * (1 - distanceFromBottom / threshold))
  }
  return 0
}

export function resolveDutyDragScrollOwner(element: Element | null): HTMLElement | null {
  return element?.closest<HTMLElement>('[data-duty-scroll-owner="left"], [data-duty-scroll-owner="right"]') ?? null
}
