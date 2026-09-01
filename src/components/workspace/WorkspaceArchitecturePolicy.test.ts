import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const sourceRoot = join(repositoryRoot, 'src')

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(?:tsx?|css)$/.test(entry.name) ? [path] : []
  })
}

function read(path: string) {
  return readFileSync(path, 'utf8')
}

describe('DEV-039 panel boundary source policy', () => {
  it('keeps React DOM portal creation behind the typed overlay host', () => {
    const rawPortalImports = sourceFiles(sourceRoot)
      .filter((path) => !path.endsWith('WorkspaceOverlayHosts.tsx'))
      .filter((path) => /from\s+['"]react-dom['"]/.test(read(path)) && /\bcreatePortal\b/.test(read(path)))
    expect(rawPortalImports).toEqual([])
    expect(read(join(sourceRoot, 'components/workspace/WorkspaceOverlayHosts.tsx'))).toMatch(/createPortal/)
  })

  it('removes viewport-fixed persistent feature rules from the legacy stylesheet', () => {
    const css = read(join(sourceRoot, 'index.css'))
    expect(css).not.toMatch(/position:\s*fixed/)
    expect(css).not.toMatch(/\.(?:duty-center|process-planning-page|process-planning-grid|management-method-document-page|management-methods-page)[^{]*\{[^}]*100vh/)
    expect(css).not.toMatch(/\.(?:duty-center|process-planning-page|process-planning-grid|management-method-document-page|management-methods-page)[^{]*\{[^}]*100vw/)
  })

  it('keeps the global fixed viewport rule only on the global overlay host', () => {
    const workspaceCss = read(join(sourceRoot, 'components/workspace/workspace.css'))
    const fixedRules = [...workspaceCss.matchAll(/([^{}]+)\{[^{}]*position:\s*fixed[^{}]*\}/g)].map((match) => match[1].trim())
    expect(fixedRules).toEqual(expect.arrayContaining(['[data-workspace-overlay-host="global"]', '.workspace-live-region']))
    expect(fixedRules).toHaveLength(2)
  })

  it('does not keep a cross-module master-data detail ReactNode or global inspector owner', () => {
    const app = read(join(sourceRoot, 'App.tsx'))
    expect(app).not.toContain('selectedMasterDataDetail')
    expect(app).not.toMatch(/const\s+inspectorOpen\s*=\s*.*selectedMasterDataDetail/)
  })

  it('keeps panel content and host contracts explicit', () => {
    const frame = read(join(sourceRoot, 'components/workspace/WorkspacePanelFrame.tsx'))
    expect(frame).toContain('data-workspace-panel-content="true"')
    expect(frame).toContain('<PanelOverlayHost />')
    const shell = read(join(sourceRoot, 'components/workspace/WorkspaceShell.tsx'))
    expect(shell).toContain('<GlobalOverlayHost />')
    expect(statSync(join(sourceRoot, 'components/workspace/WorkspaceOverlayHosts.tsx')).isFile()).toBe(true)
  })

  it('keeps the Process canvas inside its panel geometry contract', () => {
    const css = read(join(sourceRoot, 'index.css'))
    const workspaceCss = read(join(sourceRoot, 'components/workspace/workspace.css'))
    expect(css).toContain('.process-planning-canvas { position: relative; width: 100%; height: auto; min-width: 0; min-height: 180px; flex: 1 1 180px; }')
    expect(css).toContain('.process-planning-canvas .react-flow { width: 100%; height: 100%; min-width: 0; min-height: 0; background: #fbfcfe; }')
    expect(css).not.toMatch(/\.process-planning-canvas\s*\{[^}]*flex:\s*0\s+0\s+390px/)
    expect(workspaceCss).toContain('.process-planning-grid.is-shared-organization { grid-template-columns: minmax(140px, 24%) minmax(0, 1fr) minmax(160px, 26%); }')
  })

  it('uses one relation placement owner without legacy drag state or MIME paths', () => {
    const sources = sourceFiles(sourceRoot)
      .filter((path) => !/\.test\.tsx?$/.test(path))
      .map((path) => read(path))
      .join('\n')
    expect(sources).not.toMatch(/\b(?:employeeDrag|employeeKeyboardDrag|dutyDragState|WorkspaceDragSession|dragSession)\b/)
    expect(sources).not.toContain('DUTY_CONFIGURATION_DRAG_MIME')
    expect(read(join(sourceRoot, 'App.tsx'))).toContain('useReducer(\n    reduceRelationPlacementSession')
    expect(read(join(sourceRoot, 'workspace/entityDrag.ts'))).toContain('resolveRegisteredDrop')
  })

  it('keeps registered-drop resolution and commit ownership at the composition root', () => {
    const production = sourceFiles(sourceRoot)
      .filter((path) => !/\.test\.tsx?$/.test(path))
      .filter((path) => !/[\\/]workspace[\\/]entityDrag\.ts$/.test(path))
    const resolverCallSites = production.flatMap((path) => {
      const matches = read(path).match(/resolveRegisteredDrop\s*\(/g) ?? []
      return matches.map(() => path)
    })
    expect(resolverCallSites).toEqual([join(sourceRoot, 'App.tsx'), join(sourceRoot, 'App.tsx')])
    expect((read(join(sourceRoot, 'App.tsx')).match(/const commitDomainMutationIntent\s*=/g) ?? [])).toHaveLength(1)
    expect(existsSync(join(sourceRoot, 'components', 'DutyMatrixView.tsx'))).toBe(false)
    expect(read(join(sourceRoot, 'components', 'ProcessPlanningCanvas.tsx'))).not.toContain('onWorkspaceEntityDrop')
  })
})
