import type { DepartmentGroupView } from '../departmentGroups'

interface DepartmentGroupLayerProps {
  groups: DepartmentGroupView[]
  onSelectDepartment: (departmentId: string) => void
}

export function DepartmentGroupLayer({ groups, onSelectDepartment }: DepartmentGroupLayerProps) {
  return (
    <>
      <div className="department-group-layer" aria-hidden="true">
        {groups.map((group) => (
          <div
            key={group.departmentId}
            className={`department-group department-group--${group.paletteIndex}`}
            style={{
              width: group.bounds.width,
              height: group.bounds.height,
              transform: `translate(${group.bounds.x}px, ${group.bounds.y}px)`,
            }}
            data-department-group-id={group.departmentId}
            data-palette-index={group.paletteIndex}
          />
        ))}
      </div>

      <div className="department-group-label-layer">
        {groups.map((group) => (
          <button
            key={group.departmentId}
            type="button"
            className="department-group__label"
            style={{
              width: Math.max(0, group.bounds.width - 28),
              transform: `translate(${group.bounds.x}px, ${group.bounds.y}px)`,
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onSelectDepartment(group.departmentId)
            }}
            aria-label={`開啟 ${group.label} 部門明細`}
          >
            {group.label}
          </button>
        ))}
      </div>
    </>
  )
}
