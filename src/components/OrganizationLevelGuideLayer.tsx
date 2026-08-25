import type { OrganizationLevelBand } from '../types'

interface OrganizationLevelGuideLayerProps {
  bands: OrganizationLevelBand[]
  width: number
}

export function OrganizationLevelGuideLayer({ bands, width }: OrganizationLevelGuideLayerProps) {
  return (
    <div className="organization-level-guide-layer" aria-hidden="true">
      {bands.map((band) => (
        <div
          key={band.levelId}
          className="organization-level-guide"
          style={{ width: Math.max(320, width), transform: `translateY(${band.y}px)` }}
          data-organization-level-id={band.levelId}
        >
          <span>L{band.order + 1}　{band.name}</span>
        </div>
      ))}
    </div>
  )
}
