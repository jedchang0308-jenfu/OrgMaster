import { useEffect, useRef, useState } from 'react'
import {
  GitBranch,
  Info,
  Trash2,
  UserMinus,
  UserRound,
} from 'lucide-react'
import { ChildrenLayoutPreview } from './ChildrenLayoutPreview'
import { PanelDismissButton } from './PanelDismissButton'
import type { Assignment, ChildrenAxis, Department, Employee, OrganizationLevel, PositionView, Role } from '../types'
import type { Duty, DutyPositionRelation } from '../types'
import { PositionDutySection } from './PositionDutySection'

export interface PositionParentOption {
  id: string | null
  label: string
}

export interface PositionParentGroup {
  key: string
  label: string
  options: PositionParentOption[]
}

export interface OrganizationUiIssue {
  target: 'department' | 'parent' | 'level' | 'drag' | 'delete' | 'document'
  code: string
  message: string
}

interface InspectorProps {
  member: PositionView | null
  employees: Employee[]
  departments: Department[]
  roles: Role[]
  organizationLevels: OrganizationLevel[]
  parentOptions: PositionParentOption[]
  parentOptionGroups: PositionParentGroup[]
  issue: OrganizationUiIssue | null
  activeAssignments: Assignment[]
  departmentName: string
  childCount: number
  depth: number
  focusTitleToken: number
  onPatch: (patch: Partial<Pick<PositionView, 'title' | 'roleId' | 'departmentId' | 'organizationLevelId' | 'childrenAxis' | 'allowMultipleAssignees'>>) => void
  onParentChange: (parentPositionId: string | null) => void
  onUnassignEmployee: (employeeId: string) => void
  onDelete: () => void
  onOpenLevelDirectory: () => void
  onClose: () => void
  editingEnabled?: boolean
  duties?: Duty[]
  dutyRelations?: DutyPositionRelation[]
  onOpenDutyConfiguration?: (positionId: string) => void
}

export function Inspector({
  member,
  employees,
  departments,
  roles,
  organizationLevels,
  parentOptions,
  parentOptionGroups,
  issue,
  activeAssignments,
  departmentName,
  childCount,
  depth,
  focusTitleToken,
  onPatch,
  onParentChange,
  onUnassignEmployee,
  onDelete,
  onOpenLevelDirectory,
  onClose,
  editingEnabled = true,
  duties = [],
  dutyRelations = [],
  onOpenDutyConfiguration,
}: InspectorProps) {
  const [titleDraft, setTitleDraft] = useState({
    memberId: member?.id ?? null,
    value: member?.title ?? '',
  })
  const titleRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    setTitleDraft({
      memberId: member?.id ?? null,
      value: member?.title ?? '',
    })
  }, [member?.id, member?.title])

  useEffect(() => {
    if (member && focusTitleToken > 0) {
      titleRef.current?.focus()
      titleRef.current?.select()
    }
  }, [focusTitleToken, member?.id])

  if (!member) {
    return (
      <aside
        ref={panelRef}
        className="inspector inspector--empty"
        data-workspace-panel="inspector"
        tabIndex={-1}
      >
        <div className="empty-inspector__icon"><CornerIcon /></div>
        <strong>選擇一個職位</strong>
        <p>點選卡片即可編輯職位、切換下層排列或調整組織結構。</p>
        <div className="empty-inspector__hint"><kbd>Tab</kbd><span>快速新增子職位</span></div>
        <div className="empty-inspector__hint"><kbd>Enter</kbd><span>快速新增同階</span></div>
      </aside>
    )
  }

  const commitTitle = () => {
    if (titleDraft.memberId !== member.id) return
    const clean = titleDraft.value.trim() || '未命名職位'
    setTitleDraft({ memberId: member.id, value: clean })
    if (clean !== member.title) onPatch({ title: clean })
  }

  const visibleTitle = titleDraft.memberId === member.id
    ? titleDraft.value
    : member.title
  const sortedRoles = [...roles].sort((first, second) => first.name.localeCompare(second.name, 'zh-Hant'))
  const sortedLevels = [...organizationLevels].sort((first, second) => first.order - second.order)
  const selectedLevel = sortedLevels.find((level) => level.id === member.organizationLevelId) ?? null

  const setChildrenAxis = (childrenAxis: ChildrenAxis) => {
    if (childrenAxis !== member.childrenAxis) onPatch({ childrenAxis })
  }

  return (
    <aside
      ref={panelRef}
      className="inspector"
      data-workspace-panel="inspector"
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
      <div className="inspector__header">
        <div className="inspector__header-copy">
          <span>職位屬性</span>
          <strong>{member.title}</strong>
        </div>
        <div className="panel-header-actions">
          <PanelDismissButton edge="right" label="關閉屬性面板" onDismiss={onClose} className="inspector__close" />
        </div>
      </div>

      <section className="inspector__section">
        <label htmlFor="position-title">職位</label>
        <div className="field-with-icon">
          <GitBranch size={16} />
          <input
            id="position-title"
            ref={titleRef}
            data-org-editor
            value={visibleTitle}
            disabled={!editingEnabled}
            onChange={(event) => setTitleDraft({ memberId: member.id, value: event.target.value })}
            onBlur={commitTitle}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                setTitleDraft({ memberId: member.id, value: member.title })
                event.currentTarget.blur()
                window.requestAnimationFrame(() => panelRef.current?.focus())
              }
            }}
          />
        </div>
        <label className="inspector-field">
          <span>職務定義 Role</span>
          <select
            aria-label="職務定義"
            value={member.roleId}
            disabled={!editingEnabled}
            onChange={(event) => onPatch({ roleId: event.target.value })}
          >
            {sortedRoles.map((role) => (
              <option key={role.id} value={role.id}>{role.name}</option>
            ))}
          </select>
          <small className="inspector-field__help">兼任風險規則依此職務定義配對。</small>
        </label>
        <label className="inspector-field">
          <span>所屬部門</span>
          <select
            aria-label="所屬部門"
            aria-invalid={issue?.target === 'department' ? 'true' : undefined}
            aria-describedby={issue?.target === 'department' ? 'position-department-error' : undefined}
            value={member.departmentId ?? ''}
            disabled={!editingEnabled}
            onChange={(event) => onPatch({ departmentId: event.target.value || null })}
          >
            <option value="">未設定部門</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>{department.name}</option>
            ))}
          </select>
          {issue?.target === 'department' && <small id="position-department-error" className="inspector-field__error" role="alert">{issue.message}</small>}
        </label>
        <label className="inspector-field">
          <span>上級職位</span>
          <select
            aria-label="上級職位"
            aria-invalid={issue?.target === 'parent' ? 'true' : undefined}
            aria-describedby={issue?.target === 'parent' ? 'position-parent-error' : undefined}
            value={member.parentPositionId ?? ''}
            disabled={!editingEnabled}
            onChange={(event) => onParentChange(event.target.value || null)}
          >
            {parentOptions.map((option) => (
              <option key={option.id ?? 'root'} value={option.id ?? ''}>{option.label}</option>
            ))}
            {parentOptionGroups.map((group) => (
              <optgroup key={group.key} label={group.label}>
                {group.options.map((option) => (
                  <option key={option.id ?? group.key} value={option.id ?? ''}>{option.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {issue?.target === 'parent' && <small id="position-parent-error" className="inspector-field__error" role="alert">{issue.message}</small>}
        </label>
        <label className="inspector-field">
          <span className="inspector-field__heading">
            <span>組織層級</span>
            <button type="button" onClick={onOpenLevelDirectory}>管理層級</button>
          </span>
          <select
            aria-label="組織層級"
            aria-invalid={issue?.target === 'level' ? 'true' : undefined}
            aria-describedby={issue?.target === 'level' ? 'position-level-error' : undefined}
            value={member.organizationLevelId ?? ''}
            disabled={!editingEnabled}
            onChange={(event) => onPatch({ organizationLevelId: event.target.value || null })}
          >
            <option value="">尚未設定</option>
            {sortedLevels.map((level) => (
              <option key={level.id} value={level.id}>L{level.order + 1}　{level.name}</option>
            ))}
          </select>
          {issue?.target === 'level' && <small id="position-level-error" className="inspector-field__error" role="alert">{issue.message}</small>}
        </label>

        <div className="section-heading">
          <span>員工指派</span>
          <small>{activeAssignments.length > 0 ? `${activeAssignments.length} 位` : '尚未指派'}</small>
        </div>
        <label className="inspector-toggle">
          <input
            type="checkbox"
            checked={member.allowMultipleAssignees}
            disabled={!editingEnabled}
            onChange={(event) => onPatch({ allowMultipleAssignees: event.target.checked })}
          />
          <span>允許多人同時任職</span>
        </label>
        <div className="info-line"><Info size={14} /><span>多人職位目前不設人數上限。</span></div>
        {activeAssignments.length > 0 ? activeAssignments.map((assignment) => {
          const employee = employees.find((item) => item.id === assignment.employeeId)
          if (!employee) return null
          return (
            <div className="inspector-assignee" key={assignment.id}>
              <div><UserRound size={15} /></div>
              <span>
                <strong>{employee.name}</strong>
                <small>{assignmentTypeLabel(assignment, employee)} · {departmentName}</small>
              </span>
              <button
                type="button"
                onClick={() => onUnassignEmployee(employee.id)}
                aria-label={`將 ${employee.name} 移出此職位`}
                title="移出職位"
                disabled={!editingEnabled}
              >
                <UserMinus size={15} />
              </button>
            </div>
          )
        }) : (
          <div className="inspector-assignee inspector-assignee--empty">
            <UserRound size={15} />
            <span>從左側員工清單拖入</span>
          </div>
        )}
      </section>

      <section className="inspector__section">
        <div className="section-heading">
          <span>子職位排列</span>
          <small>{childCount} 個直接子職位</small>
        </div>
        <div className="direction-picker">
          <button
            type="button"
            className={member.childrenAxis === 'horizontal' ? 'is-active' : ''}
            onClick={() => setChildrenAxis('horizontal')}
            disabled={!editingEnabled}
            aria-label="設定下一階為橫向排列"
            title="下層橫排：下一階由左至右排列"
          >
            <ChildrenLayoutPreview axis="horizontal" />
            <span>下層橫排</span>
            <small>下一階水平排列</small>
          </button>
          <button
            type="button"
            className={member.childrenAxis === 'vertical' ? 'is-active' : ''}
            onClick={() => setChildrenAxis('vertical')}
            disabled={!editingEnabled}
            aria-label="設定下一階為縱向排列"
            title="下層縱排：下一階由上至下排列"
          >
            <ChildrenLayoutPreview axis="vertical" />
            <span>下層縱排</span>
            <small>下一階垂直排列</small>
          </button>
        </div>
        <div className="info-line"><Info size={14} /><span>只影響此職位的直接子職位，其他階層維持原設定。</span></div>
      </section>

      <PositionDutySection
        member={member}
        duties={duties}
        relations={dutyRelations}
        onOpenDutyConfiguration={onOpenDutyConfiguration ?? (() => undefined)}
        editingEnabled={editingEnabled}
      />

      <section className="inspector__section inspector__meta">
        <div><span>組織層級</span><strong>{selectedLevel ? `L${selectedLevel.order + 1} ${selectedLevel.name}` : '尚未設定'}</strong></div>
        <div><span>報告深度</span><strong>第 {depth} 階</strong></div>
        <div><span>直接子職位</span><strong>{childCount} 個職位</strong></div>
      </section>

      <div className="inspector__footer">
        <button type="button" className="danger-link" onClick={onDelete} disabled={!editingEnabled}>
          <Trash2 size={16} />
          刪除此職位
        </button>
      </div>
    </aside>
  )
}

function assignmentTypeLabel(assignment: Assignment, employee: Employee) {
  if (assignment.assignmentType === 'acting') return '代理'
  return employee.primaryAssignmentId === assignment.id ? '主職' : '兼任'
}

function CornerIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="9" height="7" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <rect x="16" y="18" width="9" height="7" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M7.5 10v5.5h13V18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
