import { describe, expect, it } from 'vitest'
import {
  clampWorkspaceSplitRatio,
  collectLayoutModules,
  defaultWorkspaceLayout,
  emptyWorkspaceLayout,
  insertWorkspacePanel,
  moveWorkspacePanel,
  parseWorkspaceLayout,
  removeWorkspacePanel,
  resolveAutomaticPanelTarget,
  resizeWorkspaceSplit,
} from './layout'

describe('workspace layout', () => {
  it('parses zero-panel state and rejects unknown, duplicate and over-deep trees', () => {
    expect(parseWorkspaceLayout(emptyWorkspaceLayout())).toEqual(emptyWorkspaceLayout())
    expect(parseWorkspaceLayout({ version: 1, root: { kind: 'stack', tabs: ['unknown'], activeTab: 'unknown' }, visualState: {} })).toBeNull()
    expect(parseWorkspaceLayout({
      version: 1,
      root: {
        kind: 'split', axis: 'horizontal', ratio: 0.5,
        first: { kind: 'stack', tabs: ['organization'], activeTab: 'organization' },
        second: { kind: 'stack', tabs: ['organization'], activeTab: 'organization' },
      },
      visualState: {},
    })).toBeNull()
    let root: unknown = { kind: 'stack', tabs: ['organization'], activeTab: 'organization' }
    for (let index = 0; index < 11; index += 1) root = { kind: 'split', axis: 'horizontal', ratio: 0.5, first: root, second: { kind: 'stack', tabs: ['employees'], activeTab: 'employees' } }
    expect(parseWorkspaceLayout({ version: 1, root, visualState: {} })).toBeNull()
  })

  it('inserts, moves, resizes and collapses split nodes without duplicating modules', () => {
    const split = insertWorkspacePanel(defaultWorkspaceLayout(), 'duties', { kind: 'edge', stackPath: [], edge: 'right' })
    expect(collectLayoutModules(split)).toEqual(['organization', 'duties'])
    const tabbed = insertWorkspacePanel(split, 'processes', { kind: 'stack', stackPath: [1] })
    expect(collectLayoutModules(tabbed)).toEqual(['organization', 'duties', 'processes'])
    expect(insertWorkspacePanel(tabbed, 'duties')).toBe(tabbed)
    const moved = moveWorkspacePanel(tabbed, 'processes', { kind: 'stack', stackPath: [0] })
    expect(collectLayoutModules(moved)).toEqual(['organization', 'processes', 'duties'])
    const resized = resizeWorkspaceSplit(moved, [], 0.62555)
    expect(resized.root?.kind === 'split' ? resized.root.ratio : null).toBe(0.6256)
    const collapsed = removeWorkspacePanel(resized, 'duties')
    expect(collectLayoutModules(collapsed)).toEqual(['organization', 'processes'])
  })

  it('can split one tab out of its current stack without losing either module', () => {
    const tabbed = insertWorkspacePanel(defaultWorkspaceLayout(), 'duties', { kind: 'stack', stackPath: [] })
    const split = moveWorkspacePanel(tabbed, 'duties', { kind: 'edge', stackPath: [], edge: 'right' })
    expect(split.root?.kind).toBe('split')
    expect(collectLayoutModules(split)).toEqual(['organization', 'duties'])
  })

  it('returns null when panel minimums cannot fit and otherwise clamps the ratio', () => {
    expect(clampWorkspaceSplitRatio(0.5, 800, 480, 420)).toBeNull()
    expect(clampWorkspaceSplitRatio(0.1, 1000, 480, 420)).toBe(0.48)
    expect(clampWorkspaceSplitRatio(0.9, 1000, 480, 420)).toBe(0.58)
  })

  it('opens a second visible region only when both minimum widths fit', () => {
    expect(resolveAutomaticPanelTarget(defaultWorkspaceLayout(), 'organization', 'duties', 1000)).toEqual({ kind: 'edge', stackPath: [], edge: 'right' })
    expect(resolveAutomaticPanelTarget(defaultWorkspaceLayout(), 'organization', 'duties', 899)).toEqual({ kind: 'stack', stackPath: [] })
  })
})
