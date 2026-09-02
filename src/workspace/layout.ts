import { getWorkspaceModule, isWorkspaceModuleId } from './moduleRegistry'
import type {
  LayoutDropTarget,
  WorkspaceLayoutNodeV1,
  WorkspaceLayoutV1,
  WorkspaceModuleId,
} from './types'

const MAX_LAYOUT_DEPTH = 9
const DEFAULT_RATIO = 0.5

function stack(moduleId: WorkspaceModuleId): WorkspaceLayoutNodeV1 {
  return { kind: 'stack', tabs: [moduleId], activeTab: moduleId }
}

export function defaultWorkspaceLayout(): WorkspaceLayoutV1 {
  return { version: 1, root: stack('organization'), visualState: {} }
}

export function emptyWorkspaceLayout(): WorkspaceLayoutV1 {
  return { version: 1, root: null, visualState: {} }
}

function validVisualState(value: unknown): WorkspaceLayoutV1['visualState'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const next: WorkspaceLayoutV1['visualState'] = {}
  for (const [key, candidate] of Object.entries(value)) {
    if (!isWorkspaceModuleId(key) || !candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
    const source = candidate as Record<string, unknown>
    const visual: NonNullable<WorkspaceLayoutV1['visualState'][WorkspaceModuleId]> = {}
    if (typeof source.scrollTop === 'number' && Number.isFinite(source.scrollTop) && source.scrollTop >= 0) visual.scrollTop = source.scrollTop
    if (typeof source.localView === 'string' && source.localView.length <= 100) visual.localView = source.localView
    const viewport = source.canvasViewport
    if (viewport && typeof viewport === 'object' && !Array.isArray(viewport)) {
      const point = viewport as Record<string, unknown>
      if ([point.x, point.y, point.zoom].every((item) => typeof item === 'number' && Number.isFinite(item)) && (point.zoom as number) > 0) {
        visual.canvasViewport = { x: point.x as number, y: point.y as number, zoom: point.zoom as number }
      }
    }
    next[key] = visual
  }
  return next
}

function parseNode(value: unknown, depth: number, seen: Set<WorkspaceModuleId>): WorkspaceLayoutNodeV1 | null | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > MAX_LAYOUT_DEPTH) return undefined
  const source = value as Record<string, unknown>
  if (source.kind === 'stack') {
    if (!Array.isArray(source.tabs) || source.tabs.length < 1 || source.tabs.length > 10) return undefined
    const tabs: WorkspaceModuleId[] = []
    for (const tab of source.tabs) {
      if (typeof tab !== 'string' || !isWorkspaceModuleId(tab) || seen.has(tab)) return undefined
      seen.add(tab)
      tabs.push(tab)
    }
    if (typeof source.activeTab !== 'string' || !tabs.includes(source.activeTab as WorkspaceModuleId)) return undefined
    return { kind: 'stack', tabs, activeTab: source.activeTab as WorkspaceModuleId }
  }
  if (source.kind !== 'split' || (source.axis !== 'horizontal' && source.axis !== 'vertical')) return undefined
  if (typeof source.ratio !== 'number' || !Number.isFinite(source.ratio) || source.ratio <= 0 || source.ratio >= 1) return undefined
  const first = parseNode(source.first, depth + 1, seen)
  const second = parseNode(source.second, depth + 1, seen)
  if (!first || !second) return undefined
  return { kind: 'split', axis: source.axis, ratio: roundRatio(source.ratio), first, second }
}

export function parseWorkspaceLayout(value: unknown): WorkspaceLayoutV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const source = value as Record<string, unknown>
  if (source.version !== 1) return null
  if (source.root === null) return { version: 1, root: null, visualState: validVisualState(source.visualState) }
  const root = parseNode(source.root, 0, new Set())
  return root ? { version: 1, root, visualState: validVisualState(source.visualState) } : null
}

export function collectLayoutModules(layout: WorkspaceLayoutV1 | WorkspaceLayoutNodeV1 | null): WorkspaceModuleId[] {
  const root = layout && 'version' in layout ? layout.root : layout
  if (!root) return []
  if (root.kind === 'stack') return [...root.tabs]
  return [...collectLayoutModules(root.first), ...collectLayoutModules(root.second)]
}

function roundRatio(ratio: number) {
  return Math.round(ratio * 10000) / 10000
}

export function clampWorkspaceSplitRatio(
  requested: number,
  containerSize: number,
  firstMinimum: number,
  secondMinimum: number,
): number | null {
  if (![requested, containerSize, firstMinimum, secondMinimum].every(Number.isFinite) || containerSize <= 0 || firstMinimum < 0 || secondMinimum < 0) return null
  if (firstMinimum + secondMinimum > containerSize) return null
  const minimum = firstMinimum / containerSize
  const maximum = 1 - secondMinimum / containerSize
  return roundRatio(Math.min(maximum, Math.max(minimum, requested)))
}

function nodeAtPath(root: WorkspaceLayoutNodeV1 | null, path: number[]): WorkspaceLayoutNodeV1 | null {
  let current = root
  for (const part of path) {
    if (!current || current.kind !== 'split' || (part !== 0 && part !== 1)) return null
    current = part === 0 ? current.first : current.second
  }
  return current
}

function replaceAtPath(root: WorkspaceLayoutNodeV1, path: number[], replacement: WorkspaceLayoutNodeV1): WorkspaceLayoutNodeV1 | null {
  if (path.length === 0) return replacement
  if (root.kind !== 'split') return null
  const [part, ...remaining] = path
  if (part !== 0 && part !== 1) return null
  const child = part === 0 ? root.first : root.second
  const next = replaceAtPath(child, remaining, replacement)
  if (!next) return null
  return part === 0 ? { ...root, first: next } : { ...root, second: next }
}

function findStackPath(root: WorkspaceLayoutNodeV1 | null, moduleId: WorkspaceModuleId, path: number[] = []): number[] | null {
  if (!root) return null
  if (root.kind === 'stack') return root.tabs.includes(moduleId) ? path : null
  return findStackPath(root.first, moduleId, [...path, 0]) ?? findStackPath(root.second, moduleId, [...path, 1])
}

export function findWorkspacePanelPath(layout: WorkspaceLayoutV1, moduleId: WorkspaceModuleId) {
  return findStackPath(layout.root, moduleId)
}

function firstStackPath(root: WorkspaceLayoutNodeV1 | null, path: number[] = []): number[] | null {
  if (!root) return null
  if (root.kind === 'stack') return path
  return firstStackPath(root.first, [...path, 0]) ?? firstStackPath(root.second, [...path, 1])
}

function insertAtTarget(root: WorkspaceLayoutNodeV1, moduleId: WorkspaceModuleId, target: LayoutDropTarget): WorkspaceLayoutNodeV1 | null {
  const targetNode = nodeAtPath(root, target.stackPath)
  if (!targetNode || targetNode.kind !== 'stack') return null
  if (target.kind === 'stack') {
    return replaceAtPath(root, target.stackPath, { ...targetNode, tabs: [...targetNode.tabs, moduleId], activeTab: moduleId })
  }
  const incoming = stack(moduleId)
  const horizontal = target.edge === 'left' || target.edge === 'right'
  const incomingFirst = target.edge === 'left' || target.edge === 'top'
  const split: WorkspaceLayoutNodeV1 = {
    kind: 'split',
    axis: horizontal ? 'horizontal' : 'vertical',
    ratio: DEFAULT_RATIO,
    first: incomingFirst ? incoming : targetNode,
    second: incomingFirst ? targetNode : incoming,
  }
  return replaceAtPath(root, target.stackPath, split)
}

export function insertWorkspacePanel(
  layout: WorkspaceLayoutV1,
  moduleId: WorkspaceModuleId,
  target?: LayoutDropTarget,
): WorkspaceLayoutV1 {
  if (collectLayoutModules(layout).includes(moduleId)) return layout
  if (!layout.root) return { ...layout, root: stack(moduleId) }
  const fallbackPath = firstStackPath(layout.root)
  const resolvedTarget = target ?? (fallbackPath ? { kind: 'stack' as const, stackPath: fallbackPath } : null)
  if (!resolvedTarget) return layout
  const root = insertAtTarget(layout.root, moduleId, resolvedTarget)
  if (!root || parseWorkspaceLayout({ ...layout, root }) === null) return layout
  return { ...layout, root }
}

function removeFromNode(root: WorkspaceLayoutNodeV1, moduleId: WorkspaceModuleId): WorkspaceLayoutNodeV1 | null {
  if (root.kind === 'stack') {
    if (!root.tabs.includes(moduleId)) return root
    const tabs = root.tabs.filter((tab) => tab !== moduleId)
    if (tabs.length === 0) return null
    const removedIndex = root.tabs.indexOf(moduleId)
    const activeTab = root.activeTab === moduleId
      ? tabs[Math.min(removedIndex, tabs.length - 1)]
      : root.activeTab
    return { ...root, tabs, activeTab }
  }
  const first = removeFromNode(root.first, moduleId)
  const second = removeFromNode(root.second, moduleId)
  if (!first) return second
  if (!second) return first
  return { ...root, first, second }
}

export function removeWorkspacePanel(layout: WorkspaceLayoutV1, moduleId: WorkspaceModuleId): WorkspaceLayoutV1 {
  if (!layout.root || !collectLayoutModules(layout).includes(moduleId)) return layout
  const root = removeFromNode(layout.root, moduleId)
  const visualState = { ...layout.visualState }
  delete visualState[moduleId]
  return { ...layout, root, visualState }
}

export function moveWorkspacePanel(layout: WorkspaceLayoutV1, moduleId: WorkspaceModuleId, target: LayoutDropTarget): WorkspaceLayoutV1 {
  if (!layout.root || !collectLayoutModules(layout).includes(moduleId)) return layout
  const originalTarget = nodeAtPath(layout.root, target.stackPath)
  if (!originalTarget || originalTarget.kind !== 'stack') return layout
  const targetContainsModule = originalTarget.tabs.includes(moduleId)
  if (targetContainsModule && target.kind === 'stack') return layout
  const targetAnchor = targetContainsModule
    ? originalTarget.tabs.find((tab) => tab !== moduleId) ?? null
    : originalTarget.activeTab
  if (!targetAnchor) return layout
  const removed = removeWorkspacePanel(layout, moduleId)
  if (!removed.root) return layout
  const targetPath = findStackPath(removed.root, targetAnchor)
  if (!targetPath) return layout
  const inserted = insertWorkspacePanel(removed, moduleId, { ...target, stackPath: targetPath })
  return collectLayoutModules(inserted).includes(moduleId) ? inserted : layout
}

export function resizeWorkspaceSplit(layout: WorkspaceLayoutV1, splitPath: number[], ratio: number): WorkspaceLayoutV1 {
  if (!layout.root || !Number.isFinite(ratio) || ratio <= 0 || ratio >= 1) return layout
  const target = nodeAtPath(layout.root, splitPath)
  if (!target || target.kind !== 'split') return layout
  const root = replaceAtPath(layout.root, splitPath, { ...target, ratio: roundRatio(ratio) })
  return root ? { ...layout, root } : layout
}

export function setWorkspaceActiveTab(layout: WorkspaceLayoutV1, stackPath: number[], moduleId: WorkspaceModuleId): WorkspaceLayoutV1 {
  if (!layout.root) return layout
  const target = nodeAtPath(layout.root, stackPath)
  if (!target || target.kind !== 'stack' || !target.tabs.includes(moduleId) || target.activeTab === moduleId) return layout
  const root = replaceAtPath(layout.root, stackPath, { ...target, activeTab: moduleId })
  return root ? { ...layout, root } : layout
}

export function focusWorkspacePanel(layout: WorkspaceLayoutV1, moduleId: WorkspaceModuleId): WorkspaceLayoutV1 {
  if (!layout.root) return layout
  const path = findStackPath(layout.root, moduleId)
  return path ? setWorkspaceActiveTab(layout, path, moduleId) : layout
}

export function reconcileWorkspaceLayout(
  layout: WorkspaceLayoutV1,
  openPanels: readonly WorkspaceModuleId[],
  focusedPanel: WorkspaceModuleId | null,
): WorkspaceLayoutV1 {
  const desired = [...new Set(openPanels)]
  let next = layout
  for (const moduleId of collectLayoutModules(next)) if (!desired.includes(moduleId)) next = removeWorkspacePanel(next, moduleId)
  for (const moduleId of desired) {
    if (collectLayoutModules(next).includes(moduleId)) continue
    const focusPath = focusedPanel && next.root ? findStackPath(next.root, focusedPanel) : null
    next = insertWorkspacePanel(next, moduleId, focusPath ? { kind: 'stack', stackPath: focusPath } : undefined)
  }
  if (focusedPanel && desired.includes(focusedPanel)) next = focusWorkspacePanel(next, focusedPanel)
  return next
}

export function moduleMinimum(moduleId: WorkspaceModuleId, axis: 'horizontal' | 'vertical') {
  const descriptor = getWorkspaceModule(moduleId)
  return axis === 'horizontal' ? descriptor.minWidth : descriptor.minHeight
}

export function resolveAutomaticPanelTarget(
  layout: WorkspaceLayoutV1,
  focusedPanel: WorkspaceModuleId | null,
  incomingModuleId: WorkspaceModuleId,
  availableWidth: number,
): LayoutDropTarget | undefined {
  if (!layout.root) return undefined
  const focusedPath = focusedPanel ? findStackPath(layout.root, focusedPanel) : firstStackPath(layout.root)
  if (!focusedPath) return undefined
  const focusedStack = nodeAtPath(layout.root, focusedPath)
  if (!focusedStack || focusedStack.kind !== 'stack') return undefined
  if (layout.root.kind === 'stack') {
    const activeMinimum = moduleMinimum(focusedStack.activeTab, 'horizontal')
    const incomingMinimum = moduleMinimum(incomingModuleId, 'horizontal')
    if (Number.isFinite(availableWidth) && activeMinimum + incomingMinimum <= availableWidth) {
      return { kind: 'edge', stackPath: focusedPath, edge: 'right' }
    }
  }
  return { kind: 'stack', stackPath: focusedPath }
}
