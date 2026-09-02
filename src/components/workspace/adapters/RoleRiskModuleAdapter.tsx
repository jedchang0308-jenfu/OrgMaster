import type { ReactNode } from 'react'
import type { WorkspaceSurfaceVisibility } from '../../../workspace/types'

interface Props {
  visibility: WorkspaceSurfaceVisibility
  children: ReactNode
}

export function RoleRiskModuleAdapter({ visibility, children }: Props) {
  return <section className="role-risk-module-adapter" data-visibility={visibility} aria-label="兼任風險完整工作台">{children}</section>
}
