import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  LocateFixed,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
} from 'lucide-react'
import { summarizeDepartments } from '../directories'
import { getDepartmentLabel, getDepartmentPath } from '../organization'
import { groupByDepartmentAndLevel } from '../positionGrouping'
import type { Assignment, Department, Duty, DutyPositionRelation, Employee, Position, PositionView } from '../types'
import type { OrganizationLevel } from '../types'
import { dutyConfigurationLaneGroups, dutyConfigurationLaneLabels } from '../dutyConfiguration'
import type { DutyConfigurationExactLane, DutyConfigurationLocation } from '../dutyConfigurationRoute'
import type { RegisteredDropTarget, WorkspaceEntityDragPayloadV1 } from '../workspace/entityDrag'
import type { RelationPlacementCandidate } from '../workspace/relationPlacement'
import type { RelationPlacementBegin, RelationPlacementCancel, RelationPlacementCommit, RelationPlacementPreview } from '../workspace/relationDragInteraction'
import type { WorkspaceModuleId } from '../workspace/types'
import { DirectoryContextMenu, type DirectoryContextMenuItem } from './DirectoryContextMenu'
import { PanelDismissButton } from './PanelDismissButton'
import { createRelationDropTargetProps, createRelationDragSourceProps } from './workspace/relationPlacementBindings'

export type DirectoryKind = 'employees' | 'positions' | 'departments' | 'levels' | 'duties'

export interface DirectorySelection {
  kind: DirectoryKind
  id: string
}

type EmployeeRelationPlacementPayload = Extract<WorkspaceEntityDragPayloadV1, { kind: 'employee' }>

function createEmployeeRelationPlacementPayload(sourceModuleId: WorkspaceModuleId, employeeId: string): EmployeeRelationPlacementPayload {
  return {
    version: 1,
    kind: 'employee',
    sourceModuleId,
    employeeId,
    sourcePositionId: null,
  }
}

interface DirectoryContextMenuState {
  kind: DirectoryKind
  entityId?: string
  x: number
  y: number
}

interface DirectoryDockProps {
  presentation?: 'dock' | 'surface'
  employees: Employee[]
  departments: Department[]
  members: PositionView[]
  positions: Position[]
  assignments: Assignment[]
  organizationLevels: OrganizationLevel[]
  levelIssue: string | null
  editingEnabled: boolean
  selected: PositionView | null
  directorySelection: DirectorySelection | null
  activeDirectory: DirectoryKind | null
  onActiveDirectoryChange: (kind: DirectoryKind | null) => void
  onRelationBegin?: RelationPlacementBegin
  onRelationPreview?: RelationPlacementPreview
  onRelationCommit?: RelationPlacementCommit
  onRelationCancel?: RelationPlacementCancel
  onAssignEmployee: (employeeId: string, targetPositionId: string) => void
  onSelectPosition: (positionId: string) => void
  onSelectEntity: (selection: DirectorySelection) => void
  onAddEmployee: () => void
  onAddPosition: () => void
  onAddDepartment: () => void
  onDeleteEmployee: (employeeId: string) => void
  onDeletePosition: (positionId: string) => void
  onDeleteDepartment: (departmentId: string) => void
  onEditEmployee: (employeeId: string) => void
  onEditPosition: (positionId: string) => void
  onEditDepartment: (departmentId: string) => void
  onAddOrganizationLevel: (name: string) => boolean
  onRenameOrganizationLevel: (levelId: string, name: string) => boolean
  onDeleteOrganizationLevel: (levelId: string) => boolean
  onReorderOrganizationLevels: (levelIds: string[]) => boolean
  onPreviewOrganizationLevels: (levels: OrganizationLevel[] | null) => void
  duties?: Duty[]
  dutyPositionRelations?: DutyPositionRelation[]
  dutyConfigurationLocation?: DutyConfigurationLocation
  dutyConfigurationExpandedDutyId?: string | null
  dutyConfigurationWritable?: boolean
  dutyConfigurationError?: string | null
  onSelectDuty?: (dutyId: string) => void
  onSelectDutyLane?: (lane: DutyConfigurationExactLane) => void
  onOpenDutyConfigurationDetail?: (dutyId: string) => void
  onCreateDuty?: () => void
  onOpenDutyPlanning?: () => void
  workspaceEntityDragSource?: WorkspaceModuleId
  initialQuery?: string
  onQueryChange?: (query: string) => void
}

const directoryOptions: Array<{
  kind: DirectoryKind
  label: string
}> = [
  { kind: 'employees', label: '員工' },
  { kind: 'positions', label: '職位' },
  { kind: 'departments', label: '部門' },
  { kind: 'levels', label: '層級' },
  { kind: 'duties', label: '職掌' },
]

export function DirectoryDock({
  presentation = 'dock',
  employees,
  departments,
  members,
  positions,
  assignments,
  organizationLevels,
  levelIssue,
  editingEnabled,
  selected,
  directorySelection,
  activeDirectory,
  onActiveDirectoryChange,
  onRelationBegin,
  onRelationPreview,
  onRelationCommit,
  onRelationCancel,
  onAssignEmployee,
  onSelectPosition,
  onSelectEntity,
  onAddEmployee,
  onAddPosition,
  onAddDepartment,
  onDeleteEmployee,
  onDeletePosition,
  onDeleteDepartment,
  onEditEmployee,
  onEditPosition,
  onEditDepartment,
  onAddOrganizationLevel,
  onRenameOrganizationLevel,
  onDeleteOrganizationLevel,
  onReorderOrganizationLevels,
  onPreviewOrganizationLevels,
  duties = [],
  dutyPositionRelations = [],
  dutyConfigurationLocation,
  dutyConfigurationExpandedDutyId = null,
  dutyConfigurationWritable = false,
  dutyConfigurationError,
  onSelectDuty,
  onSelectDutyLane,
  onOpenDutyConfigurationDetail,
  onCreateDuty,
  onOpenDutyPlanning,
  workspaceEntityDragSource,
  initialQuery = '',
  onQueryChange,
}: DirectoryDockProps) {
  const [employeeQuery, setEmployeeQuery] = useState('')
  const [positionQuery, setPositionQuery] = useState('')
  const [dutyQuery, setDutyQuery] = useState('')
  const [contextMenu, setContextMenu] = useState<DirectoryContextMenuState | null>(null)
  const [newLevelName, setNewLevelName] = useState('')
  const [showLevelAddForm, setShowLevelAddForm] = useState(false)
  const [draftLevelIds, setDraftLevelIds] = useState<string[] | null>(null)
  const newLevelInputRef = useRef<HTMLInputElement>(null)
  const levelNameInputRefs = useRef(new Map<string, HTMLInputElement>())

  useEffect(() => {
    if (showLevelAddForm) newLevelInputRef.current?.focus()
  }, [showLevelAddForm])

  useEffect(() => {
    if (activeDirectory === 'employees') setEmployeeQuery(initialQuery)
    else if (activeDirectory === 'positions') setPositionQuery(initialQuery)
    else if (activeDirectory === 'duties') setDutyQuery(initialQuery)
  }, [activeDirectory, initialQuery])

  useEffect(() => {
    if (editingEnabled) return
    setContextMenu(null)
    setShowLevelAddForm(false)
    setDraftLevelIds(null)
  }, [editingEnabled])

  const employeeById = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee])),
    [employees],
  )
  const departmentById = useMemo(
    () => new Map(departments.map((department) => [department.id, department])),
    [departments],
  )
  const departmentSummaries = useMemo(
    () => summarizeDepartments(departments, employees, positions, assignments),
    [assignments, departments, employees, positions],
  )

  const visibleEmployees = useMemo(() => {
    const keyword = normalizeQuery(employeeQuery)
    if (!keyword) return employees
    return employees.filter((employee) => normalizeQuery([
      employee.name,
      ...employee.departmentIds.map((departmentId) => departmentById.get(departmentId)?.name ?? ''),
      ...(employee.departmentIds.length === 0 ? ['未設定部門'] : []),
    ].join(' ')).includes(keyword))
  }, [departmentById, employeeQuery, employees])

  const visiblePositions = useMemo(() => {
    const keyword = normalizeQuery(positionQuery)
    if (!keyword) return members
    return members.filter((member) => {
      const employeeNames = member.activeAssignments
        .map((assignment) => employeeById.get(assignment.employeeId)?.name ?? '')
        .join(' ')
      return normalizeQuery(`${member.title} ${employeeNames} ${member.departmentId ? departmentById.get(member.departmentId)?.name ?? '' : '未設定部門'}`).includes(keyword)
    })
  }, [departmentById, employeeById, members, positionQuery])

  const visiblePositionGroups = useMemo(
    () => groupByDepartmentAndLevel(visiblePositions, departments, organizationLevels, (position) => position),
    [departments, organizationLevels, visiblePositions],
  )
  const visibleDepartmentGroups = useMemo(() => {
    const groups: Array<{
      key: string
      departmentId: string | null
      departmentLabel: string
      groups: typeof visiblePositionGroups
    }> = []

    for (const group of visiblePositionGroups) {
      const current = groups[groups.length - 1]
      if (current && current.departmentId === group.departmentId) {
        current.groups.push(group)
        continue
      }
      groups.push({
        key: group.departmentId ?? 'unassigned-department',
        departmentId: group.departmentId,
        departmentLabel: group.departmentLabel,
        groups: [group],
      })
    }

    return groups
  }, [visiblePositionGroups])

  const visibleDepartments = departmentSummaries
  const visibleDuties = useMemo(() => {
    const keyword = normalizeQuery(dutyQuery)
    if (!keyword) return duties
    return duties.filter((duty) => normalizeQuery(`${duty.title} ${duty.description ?? ''}`).includes(keyword))
  }, [duties, dutyQuery])

  const sortedLevels = useMemo(
    () => [...organizationLevels].sort((first, second) => first.order - second.order || first.id.localeCompare(second.id)),
    [organizationLevels],
  )
  const displayedLevels = useMemo(() => {
    const byId = new Map(sortedLevels.map((level) => [level.id, level]))
    return (draftLevelIds ?? sortedLevels.map((level) => level.id)).flatMap((id, order) => {
      const level = byId.get(id)
      return level ? [{ ...level, order }] : []
    })
  }, [draftLevelIds, sortedLevels])
  const activePositions = positions.filter((position) => position.status === 'active')
  const assignedLevelCount = activePositions.filter((position) => position.organizationLevelId !== null).length
  const levelConfigurationComplete = assignedLevelCount === activePositions.length

  useEffect(() => {
    if (activeDirectory === 'levels') return
    setDraftLevelIds(null)
    onPreviewOrganizationLevels(null)
  }, [activeDirectory, onPreviewOrganizationLevels])

  const moveLevel = (levelId: string, delta: -1 | 1) => {
    const ids = displayedLevels.map((level) => level.id)
    const index = ids.indexOf(levelId)
    const target = index + delta
    if (index < 0 || target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    setDraftLevelIds(ids)
    const byId = new Map(organizationLevels.map((level) => [level.id, level]))
    onPreviewOrganizationLevels(ids.flatMap((id, order) => {
      const level = byId.get(id)
      return level ? [{ ...level, order }] : []
    }))
  }

  const cancelLevelOrder = () => {
    setDraftLevelIds(null)
    onPreviewOrganizationLevels(null)
  }

  const applyLevelOrder = () => {
    if (!draftLevelIds || !onReorderOrganizationLevels(draftLevelIds)) return
    cancelLevelOrder()
  }

  const toggleDirectory = (kind: DirectoryKind) => {
    onActiveDirectoryChange(activeDirectory === kind ? null : kind)
    setContextMenu(null)
  }

  const openLevelAddForm = () => {
    setShowLevelAddForm(true)
  }

  const openDepartmentEmployees = (departmentName: string) => {
    setEmployeeQuery(departmentName)
    onActiveDirectoryChange('employees')
  }

  const openContextMenuAt = (kind: DirectoryKind, entityId: string | undefined, x: number, y: number) => {
    if (!editingEnabled) return
    const menuWidth = 232
    const menuHeight = 286
    const margin = 8
    setContextMenu({
      kind,
      entityId,
      x: Math.max(margin, Math.min(x, window.innerWidth - menuWidth - margin)),
      y: Math.max(margin, Math.min(y, window.innerHeight - menuHeight - margin)),
    })
  }

  const openContextMenuFromEvent = (kind: DirectoryKind, entityId: string | undefined, event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (!editingEnabled) return
    openContextMenuAt(kind, entityId, event.clientX, event.clientY)
  }

  const openContextMenuFromKeyboard = (kind: DirectoryKind, entityId: string, event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return false
    event.preventDefault()
    event.stopPropagation()
    if (!editingEnabled) return true
    const rect = event.currentTarget.getBoundingClientRect()
    openContextMenuAt(kind, entityId, rect.left + Math.min(rect.width, 160), rect.bottom)
    return true
  }

  const closeAnd = (action: () => void) => {
    setContextMenu(null)
    action()
  }

  const contextMenuItems: DirectoryContextMenuItem[] = contextMenu
    ? (() => {
        const { kind, entityId } = contextMenu
        const employee = kind === 'employees' && entityId ? employeeById.get(entityId) : null
        const position = kind === 'positions' && entityId ? members.find((member) => member.id === entityId) : null
        const department = kind === 'departments' && entityId
          ? departmentSummaries.find((item) => item.id === entityId)
          : null
        const addItem: DirectoryContextMenuItem = {
          id: `add-${kind}`,
          label: kind === 'employees' ? '新增員工' : kind === 'positions' ? '新增職位' : kind === 'departments' ? '新增部門' : '新增層級',
          icon: <Plus size={15} />,
          onSelect: () => closeAnd(kind === 'employees'
            ? onAddEmployee
            : kind === 'positions'
              ? onAddPosition
              : kind === 'departments'
              ? onAddDepartment
              : kind === 'levels' ? openLevelAddForm : (() => undefined)),
        }
        if (!entityId) return kind === 'duties' ? [] : [addItem]

        if (kind === 'employees' && employee) {
          return [
            addItem,
            {
              id: 'assign',
              label: selected ? `指派到「${selected.title}」` : '先選擇職位',
              icon: <UserPlus size={15} />,
              disabled: !selected,
              onSelect: () => selected && closeAnd(() => onAssignEmployee(employee.id, selected.id)),
              separatorBefore: true,
            },
            {
              id: 'edit',
              label: `編輯員工 ${employee.name}`,
              icon: <Pencil size={15} />,
              onSelect: () => closeAnd(() => onEditEmployee(employee.id)),
            },
            {
              id: 'delete',
              label: `刪除員工 ${employee.name}`,
              icon: <Trash2 size={15} />,
              danger: true,
              onSelect: () => closeAnd(() => onDeleteEmployee(employee.id)),
              separatorBefore: true,
            },
          ]
        }

        if (kind === 'positions' && position) {
          return [
            addItem,
            {
              id: 'locate',
              label: `在畫布定位 ${position.title}`,
              icon: <LocateFixed size={15} />,
              onSelect: () => closeAnd(() => onSelectPosition(position.id)),
              separatorBefore: true,
            },
            {
              id: 'edit',
              label: `編輯職位 ${position.title}`,
              icon: <Pencil size={15} />,
              onSelect: () => closeAnd(() => onEditPosition(position.id)),
            },
            {
              id: 'delete',
              label: `刪除職位 ${position.title}`,
              icon: <Trash2 size={15} />,
              danger: true,
              onSelect: () => closeAnd(() => onDeletePosition(position.id)),
              separatorBefore: true,
            },
          ]
        }

        if (kind === 'departments' && department) {
          return [
            addItem,
            {
              id: 'employees',
              label: `查看 ${department.name} 員工`,
              icon: <ChevronRight size={15} />,
              onSelect: () => closeAnd(() => openDepartmentEmployees(department.name)),
              separatorBefore: true,
            },
            {
              id: 'edit',
              label: `編輯部門 ${department.name}`,
              icon: <Pencil size={15} />,
              onSelect: () => closeAnd(() => onEditDepartment(department.id)),
            },
            {
              id: 'delete',
              label: `刪除部門 ${department.name}`,
              icon: <Trash2 size={15} />,
              danger: true,
              onSelect: () => closeAnd(() => onDeleteDepartment(department.id)),
              separatorBefore: true,
            },
          ]
        }

        const level = kind === 'levels' && entityId
          ? displayedLevels.find((item) => item.id === entityId)
          : null
        if (kind === 'levels' && level) {
          const levelIndex = displayedLevels.findIndex((item) => item.id === level.id)
          const usedCount = positions.filter((position) => position.organizationLevelId === level.id).length
          return [
            addItem,
            {
              id: 'rename',
              label: `重新命名 ${level.name}`,
              icon: <Pencil size={15} />,
              onSelect: () => closeAnd(() => {
                const input = levelNameInputRefs.current.get(level.id)
                input?.focus()
                input?.select()
              }),
              separatorBefore: true,
            },
            {
              id: 'move-up',
              label: `將 ${level.name} 上移`,
              icon: <ChevronUp size={15} />,
              disabled: !editingEnabled || levelIndex <= 0,
              onSelect: () => closeAnd(() => moveLevel(level.id, -1)),
            },
            {
              id: 'move-down',
              label: `將 ${level.name} 下移`,
              icon: <ChevronDown size={15} />,
              disabled: !editingEnabled || levelIndex < 0 || levelIndex >= displayedLevels.length - 1,
              onSelect: () => closeAnd(() => moveLevel(level.id, 1)),
            },
            {
              id: 'delete',
              label: `刪除 ${level.name}`,
              icon: <Trash2 size={15} />,
              danger: true,
              disabled: !editingEnabled || usedCount > 0 || displayedLevels.length <= 1,
              onSelect: () => closeAnd(() => onDeleteOrganizationLevel(level.id)),
              separatorBefore: true,
            },
          ]
        }

        return [addItem]
      })()
    : []

  const contextMenuLabel = contextMenu
    ? `${contextMenu.kind === 'employees'
      ? employeeById.get(contextMenu.entityId ?? '')?.name ?? '員工清單'
      : contextMenu.kind === 'positions'
        ? members.find((member) => member.id === contextMenu.entityId)?.title ?? '職位清單'
          : contextMenu.kind === 'departments'
          ? departmentSummaries.find((item) => item.id === contextMenu.entityId)?.name ?? '部門清單'
          : contextMenu.kind === 'levels' ? '層級清單' : '工作執掌清單'}操作選單`
    : ''

  return (
    <div
      className={`${activeDirectory ? 'directory-dock is-open' : 'directory-dock is-collapsed'}${presentation === 'surface' ? ' is-surface' : ''}`}
      data-directory-dock
    >
      {presentation === 'dock' && <nav className="directory-rail" aria-label="主資料清單">
        {directoryOptions.map(({ kind, label }) => {
          const expanded = activeDirectory === kind
          return (
            <button
              key={kind}
              type="button"
              className={expanded ? 'is-active' : ''}
              aria-label={`${label}清單${expanded ? '，點擊收起' : '，點擊開啟'}`}
              aria-expanded={expanded}
              aria-controls={`directory-${kind}`}
              data-directory-rail-kind={kind}
              title={`${expanded ? '收起' : '開啟'}${label}清單`}
              onClick={() => toggleDirectory(kind)}
            >
              <span>{label}</span>
            </button>
          )
        })}
      </nav>}

      {activeDirectory === 'employees' && (
        <DirectoryPanel
          id="directory-employees"
          title="員工清單"
          count={`${employees.length} 人`}
          addLabel="新增員工"
          onAdd={onAddEmployee}
          showAdd={editingEnabled}
           onCollapse={() => onActiveDirectoryChange(null)}
          onContextMenu={(event) => openContextMenuFromEvent('employees', undefined, event)}
        >
          {visibleEmployees.map((employee) => {
            const employeeRelationBegin = editingEnabled
              && workspaceEntityDragSource === 'employees'
              && onRelationCancel
              ? onRelationBegin
              : undefined
            const employeePlacementEnabled = Boolean(employeeRelationBegin)
            const employeeRelationPayload = employeeRelationBegin && workspaceEntityDragSource
              ? createEmployeeRelationPlacementPayload(workspaceEntityDragSource, employee.id)
              : null
            return (
              <article
                key={employee.id}
                className={[
                  'directory-card directory-card--employee directory-card--master',
                  directorySelection?.kind === 'employees' && directorySelection.id === employee.id ? 'is-selected' : '',
                ].filter(Boolean).join(' ')}
                data-employee-id={employee.id}
                {...(employeeRelationPayload && employeeRelationBegin && onRelationCancel ? createRelationDragSourceProps({
                  enabled: true,
                  payload: employeeRelationPayload,
                  onBegin: employeeRelationBegin,
                  onCancel: onRelationCancel,
                }) : {})}
                onClick={() => onSelectEntity({ kind: 'employees', id: employee.id })}
                onContextMenu={(event) => openContextMenuFromEvent('employees', employee.id, event)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return
                  if (openContextMenuFromKeyboard('employees', employee.id, event)) return
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    if (event.key === ' ' && employeeRelationPayload && onRelationBegin) {
                      onRelationBegin(employeeRelationPayload, 'keyboard', event.currentTarget)
                      return
                    }
                    onSelectEntity({ kind: 'employees', id: employee.id })
                  }
                  if (event.key === 'F2') {
                    event.preventDefault()
                    onEditEmployee(employee.id)
                  }
                  if (event.key === 'Delete') {
                    event.preventDefault()
                    onDeleteEmployee(employee.id)
                  }
                }}
                tabIndex={0}
                data-selected={directorySelection?.kind === 'employees' && directorySelection.id === employee.id ? 'true' : undefined}
                aria-label={`${employee.name}，員工主檔${employeePlacementEnabled ? '，可拖曳至組織職位' : ''}`}
              >
                <div className="directory-card__copy">
                  <strong>{employee.name}</strong>
                </div>
              </article>
            )
          })}
          {visibleEmployees.length === 0 && <DirectoryEmpty>找不到符合的員工</DirectoryEmpty>}
        </DirectoryPanel>
      )}

      {activeDirectory === 'positions' && (
        <DirectoryPanel
          id="directory-positions"
          title="職位清單"
          count={`${members.length} 個`}
          addLabel="新增職位"
          onAdd={onAddPosition}
          showAdd={editingEnabled}
           onCollapse={() => onActiveDirectoryChange(null)}
          onContextMenu={(event) => openContextMenuFromEvent('positions', undefined, event)}
        >
          {visibleDepartmentGroups.map((departmentGroup) => (
            <section
              className="directory-list__department"
              key={departmentGroup.key}
              aria-label={`${departmentGroup.departmentLabel} 部門`}
            >
              <div className="directory-list__group-header">
                <strong className="directory-list__department-label">{departmentGroup.departmentLabel}</strong>
              </div>
              {departmentGroup.groups.flatMap((group) => group.items).map((member) => (
                <article
                  key={member.id}
                  className={directorySelection?.kind === 'positions' && directorySelection.id === member.id
                    ? 'directory-card directory-card--selectable directory-card--master is-selected'
                    : 'directory-card directory-card--selectable directory-card--master'}
                  data-directory-position-id={member.id}
                  tabIndex={0}
                  aria-label={`${member.title}，職位主檔`}
                  onClick={() => onSelectPosition(member.id)}
                  onContextMenu={(event) => openContextMenuFromEvent('positions', member.id, event)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return
                    if (openContextMenuFromKeyboard('positions', member.id, event)) return
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onSelectPosition(member.id)
                    }
                    if (event.key === 'F2') {
                      event.preventDefault()
                      onEditPosition(member.id)
                    }
                    if (event.key === 'Delete') {
                      event.preventDefault()
                      onDeletePosition(member.id)
                    }
                  }}
                >
                  <div className="directory-card__copy">
                    <strong>{member.title}</strong>
                  </div>
                </article>
              ))}
            </section>
          ))}
          {visiblePositions.length === 0 && <DirectoryEmpty>找不到符合的職位</DirectoryEmpty>}
        </DirectoryPanel>
      )}

      {activeDirectory === 'departments' && (
        <DirectoryPanel
          id="directory-departments"
          title="部門清單"
          count={`${departments.length} 個`}
          addLabel="新增部門"
          onAdd={onAddDepartment}
          showAdd={editingEnabled}
          searchLabel=""
          query=""
          onQueryChange={() => undefined}
           onCollapse={() => onActiveDirectoryChange(null)}
          onContextMenu={(event) => openContextMenuFromEvent('departments', undefined, event)}
        >
          {visibleDepartments.map((department) => {
            const depth = Math.max(0, getDepartmentPath(departments, department.id).length - 1)
            return (
            <article
              key={department.id}
              className={directorySelection?.kind === 'departments' && directorySelection.id === department.id
                ? 'directory-card directory-card--department directory-card--master is-selected'
                : 'directory-card directory-card--department directory-card--master'}
              data-department-id={department.id}
              data-selected={directorySelection?.kind === 'departments' && directorySelection.id === department.id ? 'true' : undefined}
              tabIndex={0}
              aria-label={`${getDepartmentLabel(departments, department.id)}，部門主檔`}
              onClick={() => onSelectEntity({ kind: 'departments', id: department.id })}
              onContextMenu={(event) => openContextMenuFromEvent('departments', department.id, event)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return
                if (openContextMenuFromKeyboard('departments', department.id, event)) return
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelectEntity({ kind: 'departments', id: department.id })
                }
                if (event.key === 'F2') {
                  event.preventDefault()
                  onEditDepartment(department.id)
                }
                if (event.key === 'Delete') {
                  event.preventDefault()
                  onDeleteDepartment(department.id)
                }
              }}
            >
              <div className="directory-card__copy directory-card__copy--hierarchy">
                {depth > 0 && <span className="directory-card__depth-guide" style={{ width: `${depth * 12}px` }} aria-hidden="true" />}
                <strong>{department.name}</strong>
              </div>
            </article>
            )
          })}
          {visibleDepartments.length === 0 && <DirectoryEmpty>找不到符合的部門</DirectoryEmpty>}
        </DirectoryPanel>
      )}
      {activeDirectory === 'levels' && (
        <DirectoryPanel
          id="directory-levels"
          title="組織層級"
          count=""
          addLabel="新增層級"
          onAdd={openLevelAddForm}
          showAdd={editingEnabled}
          searchLabel=""
          query=""
          onQueryChange={() => undefined}
          onCollapse={() => onActiveDirectoryChange(null)}
          onContextMenu={(event) => openContextMenuFromEvent('levels', undefined, event)}
        >
          {showLevelAddForm && (
            <form
              className="level-directory-add"
              onSubmit={(event) => {
                event.preventDefault()
                if (!newLevelName.trim() || !onAddOrganizationLevel(newLevelName)) return
                setNewLevelName('')
                setShowLevelAddForm(false)
              }}
            >
              <input
                ref={newLevelInputRef}
                value={newLevelName}
                onChange={(event) => setNewLevelName(event.target.value)}
                placeholder="新增層級名稱"
                aria-label="新增層級名稱"
                disabled={!editingEnabled}
              />
              <button type="submit" disabled={!editingEnabled || !newLevelName.trim()}>新增</button>
            </form>
          )}

          {levelIssue && <p className="level-directory-error" role="alert">{levelIssue}</p>}

          <div className="level-directory-list" role="list" aria-label="組織層級排序">
            {displayedLevels.map((level, index) => {
              return (
                <article
                  className="directory-card directory-card--master level-directory-row"
                  key={level.id}
                  role="listitem"
                  tabIndex={0}
                  data-level-id={level.id}
                  aria-label={`${level.name}，組織層級`}
                  onContextMenu={(event) => openContextMenuFromEvent('levels', level.id, event)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return
                    openContextMenuFromKeyboard('levels', level.id, event)
                  }}
                >
                  <span className="level-directory-row__code">L{index + 1}</span>
                  <div className="level-directory-row__main">
                    {editingEnabled ? <input
                      key={`${level.id}:${level.name}`}
                      ref={(element) => {
                        if (element) levelNameInputRefs.current.set(level.id, element)
                        else levelNameInputRefs.current.delete(level.id)
                      }}
                      defaultValue={level.name}
                      aria-label={`重新命名 ${level.name}`}
                      disabled={!editingEnabled}
                      onBlur={(event) => {
                        const name = event.currentTarget.value.trim()
                        if (!name || name === level.name) {
                          event.currentTarget.value = level.name
                          return
                        }
                        if (!onRenameOrganizationLevel(level.id, name)) event.currentTarget.value = level.name
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur()
                        if (event.key === 'Escape') {
                          event.currentTarget.value = level.name
                          event.currentTarget.blur()
                        }
                      }}
                    /> : <span className="level-directory-row__readonly-name">{level.name}</span>}
                  </div>
                </article>
              )
            })}
          </div>
          {draftLevelIds && (
            <div className="level-directory-draft-actions" role="status">
              <span>正在預覽新排序</span>
              <button type="button" onClick={cancelLevelOrder}>取消</button>
              <button type="button" className="is-primary" onClick={applyLevelOrder}>套用排序</button>
            </div>
          )}
        </DirectoryPanel>
      )}
      {activeDirectory === 'duties' && (
        <DirectoryPanel
          id="directory-duties"
          title="工作執掌"
          addLabel="新增工作執掌"
          onAdd={() => onCreateDuty?.()}
          showAdd={editingEnabled}
          searchLabel="搜尋工作執掌"
          query={dutyQuery}
          onQueryChange={(query) => { setDutyQuery(query); onQueryChange?.(query) }}
          onCollapse={() => onActiveDirectoryChange(null)}
          onContextMenu={(event) => openContextMenuFromEvent('duties', undefined, event)}
          headerAction={onOpenDutyPlanning ? <button type="button" className="directory-panel__workbench" onClick={onOpenDutyPlanning} aria-label="開啟責任規劃工作台" title="開啟責任規劃工作台">工作台</button> : undefined}
        >
          {dutyConfigurationError && <div className="duty-directory-error" role="alert">{dutyConfigurationError}</div>}
          {visibleDuties.map((duty) => (
            <DutyDirectoryRow
              key={duty.id}
              duty={duty}
              relations={dutyPositionRelations}
              location={dutyConfigurationLocation}
              expandedDutyId={dutyConfigurationExpandedDutyId}
              writable={dutyConfigurationWritable}
              onSelectDuty={onSelectDuty}
              onSelectLane={onSelectDutyLane}
              onOpenDetail={onOpenDutyConfigurationDetail}
               workspaceEntityDragSource={workspaceEntityDragSource}
               onRelationBegin={onRelationBegin}
               onRelationPreview={onRelationPreview}
               onRelationCommit={onRelationCommit}
               onRelationCancel={onRelationCancel}
            />
          ))}
          {visibleDuties.length === 0 && <DirectoryEmpty>找不到符合的工作執掌</DirectoryEmpty>}
        </DirectoryPanel>
      )}
      {contextMenu && (
        <DirectoryContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          label={contextMenuLabel}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}

interface DirectoryPanelProps {
  id: string
  title: string
  count?: string
  addLabel: string
  onAdd: () => void
  searchLabel?: string
  query?: string
  onQueryChange?: (query: string) => void
  onCollapse: () => void
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void
  showAdd?: boolean
  children: ReactNode
  headerAction?: ReactNode
}

function DirectoryPanel({
  id,
  title,
  count,
  addLabel,
  onAdd,
  searchLabel,
  query,
  onQueryChange,
  onCollapse,
  onContextMenu,
  showAdd = true,
  children,
  headerAction,
}: DirectoryPanelProps) {
  const panelRef = useRef<HTMLElement>(null)

  return (
    <aside
      ref={panelRef}
      id={id}
      className="directory-panel"
      aria-label={title}
      data-workspace-panel="directory"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.target === event.currentTarget) return
        const target = event.target instanceof HTMLElement
          ? event.target.closest('input, textarea, select, [contenteditable="true"], [data-org-editor]')
          : null
        if (!target) return
        event.preventDefault()
        event.stopPropagation()
        ;(target as HTMLElement).blur()
        window.requestAnimationFrame(() => panelRef.current?.focus())
      }}
    >
      <div className="directory-panel__header">
        <div>
          <strong className="directory-panel__title">{title}</strong>
        </div>
        <div className="directory-panel__meta">
          {count && <span>{count}</span>}
          {showAdd && <button type="button" className="directory-panel__add" onClick={onAdd} aria-label={addLabel} title={addLabel}>
            <Plus size={15} aria-hidden="true" />
            <span>新增</span>
          </button>}
          {headerAction}
          <PanelDismissButton edge="left" label={`收起${title}`} onDismiss={onCollapse} />
        </div>
      </div>

      {searchLabel && (
        <label className="directory-search">
          <Search size={14} aria-hidden="true" />
          <input
            value={query ?? ''}
            onChange={(event) => onQueryChange?.(event.target.value)}
            placeholder={searchLabel}
            aria-label={searchLabel}
          />
        </label>
      )}

      <div className="directory-list" onContextMenu={onContextMenu}>{children}</div>
    </aside>
  )
}

function DirectoryEmpty({ children }: { children: ReactNode }) {
  return <div className="directory-list__empty">{children}</div>
}

function DutyDirectoryRow({
  duty,
  relations,
  location,
  expandedDutyId,
  writable,
  onSelectDuty,
  onSelectLane,
  onOpenDetail,
  workspaceEntityDragSource,
  onRelationBegin,
  onRelationPreview,
  onRelationCommit,
  onRelationCancel,
}: {
  duty: Duty
  relations: DutyPositionRelation[]
  location?: DutyConfigurationLocation
  expandedDutyId?: string | null
  writable: boolean
  onSelectDuty?: (dutyId: string) => void
  onSelectLane?: (lane: DutyConfigurationExactLane) => void
  onOpenDetail?: (dutyId: string) => void
  workspaceEntityDragSource?: WorkspaceModuleId
  onRelationBegin?: RelationPlacementBegin
  onRelationPreview?: RelationPlacementPreview
  onRelationCommit?: RelationPlacementCommit
  onRelationCancel?: RelationPlacementCancel
}) {
  const selected = expandedDutyId === duty.id
  const selectedLane = selected ? location?.lane ?? null : null
  const pendingSource = selected && location?.sourceRelationId
    ? relations.find((relation) => relation.id === location.sourceRelationId && relation.target.kind === 'pending-reassignment') ?? null
    : null
  const relationForLane = (lane: DutyConfigurationExactLane) => relations.find((relation) => {
    if (relation.dutyId !== duty.id || relation.target.kind !== 'pending-reassignment') return false
    if (lane === 'primary-execute') return relation.relationType === 'execute' && relation.isPrimaryExecutor
    if (lane === 'collaborate') return (relation.relationType === 'execute' && !relation.isPrimaryExecutor) || relation.relationType === 'collaborate'
    return relation.relationType === lane
  })
  const start = (lane: DutyConfigurationExactLane, source: HTMLElement) => {
    if (!writable || !selected || !workspaceEntityDragSource || !onRelationBegin) return
    onRelationBegin({ version: 1, kind: 'duty', sourceModuleId: workspaceEntityDragSource, dutyId: duty.id, lane, sourceRelationId: relationForLane(lane)?.id ?? null }, 'keyboard', source)
  }
  const dutyDropProps = createRelationDropTargetProps({
    active: false,
    available: writable,
    target: { kind: 'duty', dutyId: duty.id },
    onPreview: onRelationPreview,
    onCommit: onRelationCommit,
  })
  return (
    <article
        className={`directory-card duty-directory-card${selected ? ' is-selected' : ''}`}
        {...dutyDropProps}
        tabIndex={onRelationCommit ? 0 : undefined}
      data-duty-id={duty.id}
    >
      <div className="duty-directory-card__header">
        <button
          type="button"
          className="duty-directory-card__detail-trigger"
          onClick={() => onOpenDetail?.(duty.id)}
          title={`開啟${duty.title}明細`}
          aria-label={`${duty.title}，開啟明細`}
        >
          <strong>{duty.title}</strong>
          {duty.description && <small>{duty.description}</small>}
          {pendingSource && <small className="duty-directory-card__pending">重新配置：{pendingSource.target.kind === 'pending-reassignment' ? pendingSource.target.formerPositionTitle : ''}／{selectedLane ? dutyConfigurationLaneLabels[selectedLane] : ''}</small>}
        </button>
        <button
          type="button"
          className="duty-directory-card__expand"
          onClick={() => onSelectDuty?.(duty.id)}
          aria-expanded={selected}
          aria-label={selected ? `收起${duty.title}責任設定` : `展開${duty.title}責任設定`}
          title={selected ? '收起責任設定' : '展開責任設定'}
        >
          {selected ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
        </button>
      </div>
      {selected && <div className="duty-directory-lanes" aria-label={`${duty.title}責任類型`}>
        {dutyConfigurationLaneGroups.map((group) => (
          <div className="duty-directory-lane-group" key={group.key}>
            <span>{group.label}</span>
            <div>
              {group.lanes.map((lane) => {
                const source = relationForLane(lane)
                const active = selectedLane === lane
                return <div className={`duty-directory-lane${active ? ' is-active' : ''}`} key={lane}>
                  <button
                    type="button"
                  className="duty-directory-lane__select"
                    onClick={() => onSelectLane?.(lane)}
                    disabled={Boolean(pendingSource && !active)}
                    aria-pressed={active}
                    title={`${dutyConfigurationLaneLabels[lane]}${active ? '，已選擇' : ''}`}
                    {...(active && writable && workspaceEntityDragSource && onRelationBegin && onRelationCancel
                      ? createRelationDragSourceProps({
                        enabled: true,
                        payload: { version: 1, kind: 'duty', sourceModuleId: workspaceEntityDragSource, dutyId: duty.id, lane, sourceRelationId: source?.id ?? null },
                        onBegin: onRelationBegin,
                        onCancel: onRelationCancel,
                      })
                      : {})}
                    onKeyDown={(event) => {
                      if (event.key !== ' ' || !active || !writable || !workspaceEntityDragSource || !onRelationBegin) return
                      event.preventDefault()
                      event.stopPropagation()
                      start(lane, event.currentTarget)
                    }}
                  >
                    {dutyConfigurationLaneLabels[lane]}
                  </button>
                </div>
              })}
            </div>
          </div>
        ))}
      </div>}
    </article>
  )
}

function normalizeQuery(value: string) {
  return value.trim().toLocaleLowerCase('zh-Hant')
}
