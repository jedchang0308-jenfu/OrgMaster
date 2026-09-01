import type { ReactNode } from 'react'
import type { WorkspaceSurfaceVisibility } from '../../../workspace/types'

interface Props {
  visibility: WorkspaceSurfaceVisibility
  children: ReactNode
}

export function GovernanceModuleAdapter({ visibility, children }: Props) {
  return <section className="governance-module-adapter" data-visibility={visibility} aria-label="角色治理完整工作台">{children}</section>
}
