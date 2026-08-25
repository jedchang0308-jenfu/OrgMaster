import type { ChildrenAxis } from '../types'

interface ChildrenLayoutPreviewProps {
  axis: ChildrenAxis
  compact?: boolean
}

export function ChildrenLayoutPreview({ axis, compact = false }: ChildrenLayoutPreviewProps) {
  return (
    <svg
      className={compact ? 'children-layout-preview is-compact' : 'children-layout-preview'}
      viewBox="0 0 72 38"
      role="img"
      aria-label={axis === 'horizontal' ? '下一階水平排列示意圖' : '下一階垂直排列示意圖'}
    >
      {axis === 'horizontal' ? (
        <>
          <rect x="29" y="2" width="14" height="7" rx="2" />
          <path d="M36 9v7M11 16h50M17 16v4M36 16v4M55 16v4" />
          <rect x="10" y="20" width="14" height="7" rx="2" />
          <rect x="29" y="20" width="14" height="7" rx="2" />
          <rect x="48" y="20" width="14" height="7" rx="2" />
        </>
      ) : (
        <>
          <rect x="6" y="2" width="14" height="7" rx="2" />
          <path d="M13 9v5h17v17M30 14h8M30 22h8M30 30h8" />
          <rect x="38" y="10" width="14" height="7" rx="2" />
          <rect x="38" y="18" width="14" height="7" rx="2" />
          <rect x="38" y="26" width="14" height="7" rx="2" />
        </>
      )}
    </svg>
  )
}
