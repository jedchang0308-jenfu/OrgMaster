import type { ReactNode } from 'react'
import type { WorkspaceSurfaceVisibility } from '../../../workspace/types'

interface Props {
  mode: 'list' | 'draft' | 'readable'
  visibility: WorkspaceSurfaceVisibility
  children: ReactNode
}

export function ManagementMethodModuleAdapter({ mode, visibility, children }: Props) {
  return <section className="management-method-module-adapter" data-mode={mode} data-visibility={visibility} aria-label="管理辦法完整工作台">{children}</section>
}
