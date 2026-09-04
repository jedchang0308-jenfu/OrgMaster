import { useEffect, useRef, useState } from 'react'
import {
  Info,
  Trash2,
  UserMinus,
  UserRound,
} from 'lucide-react'
import { ChildrenLayoutPreview } from './ChildrenLayoutPreview'
import { PanelDismissButton } from './PanelDismissButton'
import type { Assignment, ChildrenAxis, Department, Employee, OrganizationLevel, PositionView } from '../types'
import type { Duty, DutyPositionRelation } from '../types'
import { PositionDutySection } from './PositionDutySection'

export interface OrganizationUiIssue {
  target: 'department' | 'parent' | 'level' | 'drag' | 'delete' | 'document'
  code: string
  message: string
}

interface InspectorProps {
  member: PositionView | null
  employees: Employee[]
  departments: Department[]
  organizationLevels: OrganizationLevel[]
  issue: OrganizationUiIssue | null
  activeAssignments: Assignment[]
  focusTitleToken: number
  onPatch: (patch: Partial<Pick<PositionView, 'title' | 'departmentId' | 'organizationLevelId' | 'childrenAxis' | 'allowMultipleAssignees'>>) => void
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
  organizationLevels,
  issue,
  activeAssignments,
  focusTitleToken,
  onPatch,
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
  const sortedLevels = [...organizationLevels].sort((first, second) => first.order - second.order)
  const departmentName = member.departmentId
    ? departments.find((department) => department.id === member.departmentId)?.name ?? '未設定部門'
    : '未設定部門'
  const organizationLevelName = member.organizationLevelId
    ? sortedLevels.find((level) => level.id === member.organizationLevelId)?.name ?? '尚未設定'
    : '尚未設定'

  const setChildrenAxis = (childrenAxis: ChildrenAxis) => {
    if (childrenAxis !== member.childrenAxis) onPatch({ childrenAxis })
  }

  return (
    <aside
      ref={panelRef}
      className="inspector position-detail-panel"
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
          {editingEnabled ? (
            <input
              ref={titleRef}
              className="inspector__header-title-editor"
              id="position-title"
              aria-label="職位名稱"
              data-org-editor
              value={visibleTitle}
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
          ) : (
            <strong>{member.title}</strong>
          )}
        </div>
        <div className="panel-header-actions">
          <PanelDismissButton edge="right" label="關閉屬性面板" onDismiss={onClose} className="inspector__close" />
        </div>
      </div>

      <section className="inspector__section">
        <label className="inspector-field">
          <span>所屬部門</span>
          {editingEnabled ? <select
              aria-label="所屬部門"
              aria-invalid={issue?.target === 'department' ? 'true' : undefined}
              aria-describedby={issue?.target === 'department' ? 'position-department-error' : undefined}
              value={member.departmentId ?? ''}
              onChange={(event) => onPatch({ departmentId: event.target.value || null })}
            >
              <option value="">未設定部門</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </select> : <p className="inspector-field__value">{departmentName}</p>}
          {issue?.target === 'department' && <small id="position-department-error" className="inspector-field__error" role="alert">{issue.message}</small>}
        </label>
        <label className="inspector-field">
          <span className="inspector-field__heading">
            <span>組織層級</span>
            {editingEnabled && <button type="button" onClick={onOpenLevelDirectory}>管理層級</button>}
          </span>
          {editingEnabled ? <select
              aria-label="組織層級"
              aria-invalid={issue?.target === 'level' ? 'true' : undefined}
              aria-describedby={issue?.target === 'level' ? 'position-level-error' : undefined}
              value={member.organizationLevelId ?? ''}
              onChange={(event) => onPatch({ organizationLevelId: event.target.value || null })}
            >
              <option value="">尚未設定</option>
              {sortedLevels.map((level) => (
                <option key={level.id} value={level.id}>L{level.order + 1}　{level.name}</option>
              ))}
            </select> : <p className="inspector-field__value">{organizationLevelName}</p>}
          {issue?.target === 'level' && <small id="position-level-error" className="inspector-field__error" role="alert">{issue.message}</small>}
        </label>

        <div className="section-heading employee-assignment-heading">
          <span>員工指派</span>
          <div className="employee-assignment-heading__controls">
            <small>{activeAssignments.length > 0 ? `${activeAssignments.length} 位` : '尚未指派'}</small>
            {editingEnabled && <label className="inspector-toggle">
              <input
                type="checkbox"
                checked={member.allowMultipleAssignees}
                onChange={(event) => onPatch({ allowMultipleAssignees: event.target.checked })}
              />
              <span>預設允許</span>
            </label>}
          </div>
        </div>
        {activeAssignments.length > 0 ? activeAssignments.map((assignment) => {
          const employee = employees.find((item) => item.id === assignment.employeeId)
          if (!employee) return null
          return (
            <div className="inspector-assignee" key={assignment.id}>
              <div><UserRound size={15} /></div>
              <span>
                <strong>{employee.name}</strong>
              </span>
              {editingEnabled && <button
                type="button"
                onClick={() => onUnassignEmployee(employee.id)}
                aria-label={`將 ${employee.name} 移出此職位`}
                title="移出職位"
              >
                <UserMinus size={15} />
              </button>}
            </div>
          )
        }) : (
          <div className="inspector-assignee inspector-assignee--empty">
            <UserRound size={15} />
            <span>{editingEnabled ? '從左側員工清單拖入' : '尚未指派員工'}</span>
          </div>
        )}
      </section>

      <section className="inspector__section">
        <div className="section-heading">
          <span>子職位排列</span>
        </div>
        {editingEnabled ? <div className="direction-picker">
          <button
            type="button"
            className={member.childrenAxis === 'horizontal' ? 'is-active' : ''}
            onClick={() => setChildrenAxis('horizontal')}
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
            aria-label="設定下一階為縱向排列"
            title="下層縱排：下一階由上至下排列"
          >
            <ChildrenLayoutPreview axis="vertical" />
            <span>下層縱排</span>
            <small>下一階垂直排列</small>
          </button>
        </div> : <div className="inspector-field__value">{member.childrenAxis === 'horizontal' ? '下層橫排' : '下層縱排'}</div>}
        {editingEnabled && <div className="info-line"><Info size={14} /><span>只影響此職位的直接子職位，其他階層維持原設定。</span></div>}
      </section>

      <PositionDutySection
        member={member}
        duties={duties}
        relations={dutyRelations}
        interactive={editingEnabled}
        onOpenDutyConfiguration={onOpenDutyConfiguration ?? (() => undefined)}
      />

      {editingEnabled && <div className="inspector__footer">
        <button type="button" className="danger-link" onClick={onDelete} disabled={!editingEnabled}>
          <Trash2 size={16} />
          刪除此職位
        </button>
      </div>}
    </aside>
  )
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
