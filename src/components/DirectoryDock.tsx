import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
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
import type { Assignment, Department, Employee, EmployeeDragPayload, Position, PositionView } from '../types'
import type { OrganizationLevel } from '../types'
import { DirectoryContextMenu, type DirectoryContextMenuItem } from './DirectoryContextMenu'
import { PanelDismissButton } from './PanelDismissButton'

export type DirectoryKind = 'employees' | 'positions' | 'departments' | 'levels'

export interface DirectorySelection {
  kind: DirectoryKind
  id: string
}

interface DirectoryContextMenuState {
  kind: DirectoryKind
  entityId?: string
  x: number
  y: number
}

interface DirectoryDockProps {
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
  onEmployeeDragStart: (event: DragEvent<HTMLElement>, payload: EmployeeDragPayload) => void
  onEmployeeDragEnd: () => void
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
}

const directoryOptions: Array<{
  kind: DirectoryKind
  label: string
}> = [
  { kind: 'employees', label: '員工' },
  { kind: 'positions', label: '職位' },
  { kind: 'departments', label: '部門' },
  { kind: 'levels', label: '層級' },
]

export function DirectoryDock({
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
  onEmployeeDragStart,
  onEmployeeDragEnd,
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
}: DirectoryDockProps) {
  const [employeeQuery, setEmployeeQuery] = useState('')
  const [positionQuery, setPositionQuery] = useState('')
  const [departmentQuery, setDepartmentQuery] = useState('')
  const [contextMenu, setContextMenu] = useState<DirectoryContextMenuState | null>(null)
  const [newLevelName, setNewLevelName] = useState('')
  const [showLevelAddForm, setShowLevelAddForm] = useState(false)
  const [draftLevelIds, setDraftLevelIds] = useState<string[] | null>(null)
  const newLevelInputRef = useRef<HTMLInputElement>(null)
  const levelNameInputRefs = useRef(new Map<string, HTMLInputElement>())

  useEffect(() => {
    if (showLevelAddForm) newLevelInputRef.current?.focus()
  }, [showLevelAddForm])

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

  const visibleDepartments = useMemo(() => {
    const keyword = normalizeQuery(departmentQuery)
    if (!keyword) return departmentSummaries
    return departmentSummaries.filter((department) => normalizeQuery(getDepartmentLabel(departments, department.id)).includes(keyword))
  }, [departmentQuery, departmentSummaries, departments])

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
    openContextMenuAt(kind, entityId, event.clientX, event.clientY)
  }

  const openContextMenuFromKeyboard = (kind: DirectoryKind, entityId: string, event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return false
    event.preventDefault()
    event.stopPropagation()
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
              : openLevelAddForm),
        }
        if (!entityId) return [addItem]

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
          : '層級清單'}操作選單`
    : ''

  return (
    <div
      className={activeDirectory ? 'directory-dock is-open' : 'directory-dock is-collapsed'}
      data-directory-dock
    >
      <nav className="directory-rail" aria-label="主資料清單">
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
      </nav>

      {activeDirectory === 'employees' && (
        <DirectoryPanel
          id="directory-employees"
          title="員工清單"
          count={`${employees.length} 人`}
          addLabel="新增員工"
          onAdd={onAddEmployee}
          searchLabel="搜尋員工"
          query={employeeQuery}
          onQueryChange={setEmployeeQuery}
           onCollapse={() => onActiveDirectoryChange(null)}
          onContextMenu={(event) => openContextMenuFromEvent('employees', undefined, event)}
        >
          {visibleEmployees.map((employee) => {
            return (
              <article
                key={employee.id}
                className={directorySelection?.kind === 'employees' && directorySelection.id === employee.id
                  ? 'directory-card directory-card--employee directory-card--master is-selected'
                  : 'directory-card directory-card--employee directory-card--master'}
                draggable
                data-employee-id={employee.id}
                onDragStart={(event) => onEmployeeDragStart(event, {
                  employeeId: employee.id,
                  sourcePositionId: null,
                })}
                onDragEnd={onEmployeeDragEnd}
                onClick={() => onSelectEntity({ kind: 'employees', id: employee.id })}
                onContextMenu={(event) => openContextMenuFromEvent('employees', employee.id, event)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return
                  if (openContextMenuFromKeyboard('employees', employee.id, event)) return
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
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
                aria-label={`${employee.name}，員工主檔`}
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
          searchLabel="搜尋職位"
          query={positionQuery}
          onQueryChange={setPositionQuery}
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
          searchLabel="搜尋部門"
          query={departmentQuery}
          onQueryChange={setDepartmentQuery}
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
                  className="level-directory-row"
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
                    <input
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
                    />
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
  count: string
  addLabel: string
  onAdd: () => void
  searchLabel: string
  query: string
  onQueryChange: (query: string) => void
  onCollapse: () => void
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void
  children: ReactNode
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
  children,
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
          <strong>{title}</strong>
        </div>
        <div className="directory-panel__meta">
          {count && <span>{count}</span>}
          <button type="button" className="directory-panel__add" onClick={onAdd} aria-label={addLabel} title={addLabel}>
            <Plus size={15} aria-hidden="true" />
            <span>新增</span>
          </button>
          <PanelDismissButton edge="left" label={`收起${title}`} onDismiss={onCollapse} />
        </div>
      </div>

      {searchLabel && (
        <label className="directory-search">
          <Search size={14} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
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

function normalizeQuery(value: string) {
  return value.trim().toLocaleLowerCase('zh-Hant')
}
