import type { ReactNode } from 'react'
import type { WorkspaceSurfaceVisibility } from '../../../workspace/types'

interface Props {
  visibility: WorkspaceSurfaceVisibility
  children: ReactNode
}

export function ProcessModuleAdapter({ visibility, children }: Props) {
  return <section className="process-module-adapter" data-visibility={visibility} aria-label="流程規劃完整工作台">{children}</section>
}
