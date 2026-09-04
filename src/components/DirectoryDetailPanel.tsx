import { useState } from 'react'
import { BriefcaseBusiness, Building2, ChevronDown, ChevronRight, UserRound } from 'lucide-react'
import { groupByDepartmentAndLevel } from '../positionGrouping'
import { resolveDirectSupervisor, type DirectSupervisorUnresolvedReason } from '../directSupervisor'
import type { Assignment, Department, Employee, OrganizationLevel, PositionView } from '../types'
import type { DirectorySelection } from './DirectoryDock'
import { PanelDismissButton } from './PanelDismissButton'
import { EmployeeIdentitySection } from './EmployeeIdentitySection'

interface DirectoryDetailPanelProps {
  selection: DirectoryDetailSelection
  employees: Employee[]
  departments: Department[]
  organizationLevels: OrganizationLevel[]
  members: PositionView[]
  onSetPrimaryAssignment: (employeeId: string, assignmentId: string) => void
  onSelectPosition: (positionId: string) => void
  onSelectEntity: (selection: DirectorySelection) => void
  onClose: () => void
  editingEnabled?: boolean
  identityMutationAllowed?: boolean
  accountMutationEnvironmentAllowed?: boolean
  governanceRefreshToken?: number
  onGovernanceChanged?: () => void
}

export type DirectoryDetailSelection = {
  kind: 'employees' | 'departments'
  id: string
}

export function DirectoryDetailPanel({
  selection,
  employees,
  departments,
  organizationLevels,
  members,
  onSetPrimaryAssignment,
  onSelectPosition,
  onSelectEntity,
  onClose,
  editingEnabled = true,
  identityMutationAllowed = false,
  accountMutationEnvironmentAllowed,
  governanceRefreshToken = 0,
  onGovernanceChanged,
}: DirectoryDetailPanelProps) {
  const [expandedPositionIds, setExpandedPositionIds] = useState<Set<string>>(() => new Set())

  const togglePositionEmployees = (positionId: string) => {
    setExpandedPositionIds((current) => {
      const next = new Set(current)
      if (next.has(positionId)) next.delete(positionId)
      else next.add(positionId)
      return next
    })
  }

  if (selection.kind === 'employees') {
    const employee = employees.find((item) => item.id === selection.id)
    if (!employee) return null
    const employeeAssignments = members.flatMap((member) => member.activeAssignments
      .filter((assignment) => assignment.employeeId === employee.id)
      .map((assignment) => ({ assignment, position: member })))
      .sort((first, second) => (
        Number(second.assignment.id === employee.primaryAssignmentId) - Number(first.assignment.id === employee.primaryAssignmentId)
        || first.position.title.localeCompare(second.position.title, 'zh-Hant')
      ))
    const employeeDepartmentIds = Array.from(new Set([
      ...employee.departmentIds,
      ...employeeAssignments
        .map(({ position }) => position.departmentId)
        .filter((departmentId): departmentId is string => Boolean(departmentId)),
    ]))
    const primaryDepartmentId = employeeAssignments.find(({ assignment }) => assignment.id === employee.primaryAssignmentId)?.position.departmentId ?? null
    const employeeDepartments = employeeDepartmentIds
      .map((departmentId) => departments.find((department) => department.id === departmentId))
      .filter((department): department is Department => Boolean(department))
      .sort((first, second) => (
        Number(second.id === primaryDepartmentId) - Number(first.id === primaryDepartmentId)
      ))
    const directSupervisor = resolveDirectSupervisor(members, employees, employee.id)
    const assignmentRoleGroups = [
      {
        key: 'primary',
        label: '主職',
        items: employeeAssignments.filter(({ assignment }) => assignment.id === employee.primaryAssignmentId),
      },
      {
        key: 'secondary',
        label: '兼職',
        items: employeeAssignments.filter(({ assignment }) => assignment.id !== employee.primaryAssignmentId),
      },
    ].map((group) => ({ ...group, departmentGroups: groupEmployeeAssignmentsByDepartment(group.items, departments) }))
      .filter((group) => group.items.length > 0)

    return (
      <aside className="inspector directory-detail-panel" aria-label={`員工 ${employee.name} 細節`} data-workspace-panel="inspector" tabIndex={-1}>
        <DetailHeader title={employee.name} onClose={onClose} />
        <section className="inspector__section">
          <DetailSectionHeading label="部門與任職" count={`${employeeDepartments.length} 部門 · ${employeeAssignments.length} 職位`} />
          {assignmentRoleGroups.length > 0 ? (
            <div className="directory-detail__assignment-tree">
              {assignmentRoleGroups.map((roleGroup) => (
                <div key={roleGroup.key} className="directory-detail__assignment-role-group">
                  <div className="directory-detail__assignment-role-heading">
                    <strong>{roleGroup.label}</strong>
                  </div>
                  <div className="directory-detail__assignment-departments">
                    {roleGroup.departmentGroups.map((departmentGroup) => (
                      <div key={departmentGroup.key} className="directory-detail__assignment-department">
                        {departmentGroup.departmentId ? (
                          <button
                            className="directory-detail__assignment-department-link"
                            type="button"
                            onClick={() => onSelectEntity({ kind: 'departments', id: departmentGroup.departmentId! })}
                          >
                            <span><strong>{departmentGroup.departmentLabel}</strong></span>
                            <ChevronRight size={14} aria-hidden="true" />
                          </button>
                        ) : (
                          <div className="directory-detail__assignment-department-link is-static">
                            <span><strong>未設定部門</strong></span>
                          </div>
                        )}
                        <div className="directory-detail__assignment-positions">
                          {departmentGroup.items.map(({ assignment, position }) => (
                            <button key={position.id} type="button" onClick={() => onSelectPosition(position.id)}>
                              <span>
                                <strong>{position.title}</strong>
                                {assignment.assignmentType === 'acting' && <small>代理</small>}
                              </span>
                              <ChevronRight size={14} aria-hidden="true" />
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <DetailEmpty>尚未設定部門或任職</DetailEmpty>
          )}
        </section>

        <section className="inspector__section">
          <DetailSectionHeading label="直屬主管路徑" />
          <div className="directory-detail__route" data-supervisor-status={directSupervisor.status}>
            <strong>{directSupervisor.status === 'resolved'
              ? `直屬主管：${employees.find((candidate) => candidate.id === directSupervisor.supervisorEmployeeId)?.name ?? '未命名員工'}`
              : '直屬主管：尚未設定'}</strong>
            <small>{directSupervisor.status === 'resolved'
              ? `依主職上級職位：${directSupervisor.supervisorPositionTitle}`
              : unresolvedDirectSupervisorLabel(directSupervisor.reason)}</small>
          </div>
        </section>

        <EmployeeIdentitySection
          employee={employee}
          accountMutationEnvironmentAllowed={accountMutationEnvironmentAllowed ?? identityMutationAllowed}
          refreshToken={governanceRefreshToken}
          onChanged={onGovernanceChanged}
        />
      </aside>
    )
  }

  const department = departments.find((item) => item.id === selection.id)
  if (!department) return null
  const departmentEmployees = employees.filter((employee) => employee.departmentIds.includes(department.id))
  const departmentPositions = members.filter((member) => member.departmentId === department.id)
  const departmentPositionGroups = groupByDepartmentAndLevel(departmentPositions, departments, organizationLevels, (position) => position)

  return (
    <aside className="inspector directory-detail-panel" aria-label={`部門 ${department.name} 細節`} data-workspace-panel="inspector" tabIndex={-1}>
      <DetailHeader eyebrow="部門細節" title={department.name} onClose={onClose} />
      <section className="inspector__section">
        <DetailSectionHeading label="部門員工" count={`${departmentEmployees.length} 位`} />
        {departmentEmployees.length > 0 ? (
          <div className="directory-detail__links">
            {departmentEmployees.map((employee) => (
              <button key={employee.id} type="button" onClick={() => onSelectEntity({ kind: 'employees', id: employee.id })}>
                <UserRound size={15} aria-hidden="true" />
                <span>
                  <strong>{employee.name}</strong>
                  <small>員工主檔</small>
                </span>
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : (
          <DetailEmpty>目前沒有員工</DetailEmpty>
        )}
      </section>

      <section className="inspector__section">
        <DetailSectionHeading label="部門職位" count={`${departmentPositions.length} 個`} />
        {departmentPositions.length > 0 ? (
          <div className="directory-detail__position-groups">
            {departmentPositionGroups.map((group) => (
              <div className="directory-detail__position-group" key={group.key}>
                <div className="directory-detail__position-list">
                  {group.items.map((position) => {
                    const isExpanded = expandedPositionIds.has(position.id)
                    const employeeListId = `department-position-employees-${position.id}`
                    const positionEmployees = position.activeAssignments
                      .map((assignment) => employees.find((employee) => employee.id === assignment.employeeId))
                      .filter((employee): employee is Employee => Boolean(employee))

                    return (
                      <div className="directory-detail__position-item" key={position.id}>
                        <button
                          className="directory-detail__position-toggle"
                          type="button"
                          onClick={() => togglePositionEmployees(position.id)}
                          aria-expanded={isExpanded}
                          aria-controls={employeeListId}
                        >
                          <BriefcaseBusiness size={15} aria-hidden="true" />
                          <span>
                            <strong>{position.title}</strong>
                            <small>{position.activeAssignments.length > 0 ? `${position.activeAssignments.length} 位員工` : '尚未指派員工'}</small>
                          </span>
                          <ChevronDown className={isExpanded ? 'is-expanded' : undefined} size={15} aria-hidden="true" />
                        </button>
                        {isExpanded && (
                          <div className="directory-detail__position-members" id={employeeListId}>
                            {positionEmployees.length > 0 ? positionEmployees.map((employee) => (
                              <button
                                className="directory-detail__position-member"
                                key={employee.id}
                                type="button"
                                aria-label={`開啟 ${employee.name} 員工細節`}
                                onClick={() => onSelectEntity({ kind: 'employees', id: employee.id })}
                              >
                                <UserRound size={14} aria-hidden="true" />
                                <strong>{employee.name}</strong>
                              </button>
                            )) : (
                              <div className="directory-detail__position-members-empty">尚未指派員工</div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <DetailEmpty>目前沒有職位</DetailEmpty>
        )}
      </section>
    </aside>
  )
}

function DetailHeader({
  eyebrow,
  title,
  onClose,
}: {
  eyebrow?: string
  title: string
  onClose: () => void
}) {
  return (
    <div className={`inspector__header${eyebrow ? '' : ' inspector__header--title-only'}`}>
      <div className="inspector__header-copy">
        {eyebrow && <span>{eyebrow}</span>}
        <strong>{title}</strong>
      </div>
      <div className="panel-header-actions">
        <PanelDismissButton edge="right" label="關閉細節面板" onDismiss={onClose} className="inspector__close" />
      </div>
    </div>
  )
}

function DetailSectionHeading({ label, count }: { label: string; count?: string }) {
  return (
    <div className="section-heading">
      <span>{label}</span>
      {count && <small>{count}</small>}
    </div>
  )
}

function DetailEmpty({ children }: { children: string }) {
  return <div className="directory-detail__empty">{children}</div>
}

type EmployeeAssignmentItem = {
  assignment: Assignment
  position: PositionView
}

type EmployeeAssignmentDepartmentGroup = {
  key: string
  departmentId: string | null
  departmentLabel: string
  items: EmployeeAssignmentItem[]
}

function groupEmployeeAssignmentsByDepartment(items: EmployeeAssignmentItem[], departments: Department[]): EmployeeAssignmentDepartmentGroup[] {
  const departmentOrder = new Map(departments.map((department, index) => [department.id, index]))
  const departmentById = new Map(departments.map((department) => [department.id, department]))
  const groups = new Map<string, EmployeeAssignmentDepartmentGroup & { departmentIndex: number }>()

  for (const item of items) {
    const departmentId = item.position.departmentId
    const key = departmentId ?? 'unassigned-department'
    const department = departmentId ? departmentById.get(departmentId) : undefined
    const group = groups.get(key) ?? {
      key,
      departmentId,
      departmentLabel: department?.name ?? '未設定部門',
      items: [],
      departmentIndex: departmentId ? departmentOrder.get(departmentId) ?? departments.length : departments.length,
    }
    group.items.push(item)
    groups.set(key, group)
  }

  return [...groups.values()]
    .sort((first, second) => first.departmentIndex - second.departmentIndex || first.key.localeCompare(second.key))
    .map(({ departmentIndex: _departmentIndex, ...group }) => group)
}

function unresolvedDirectSupervisorLabel(reason: DirectSupervisorUnresolvedReason) {
  const labels: Record<DirectSupervisorUnresolvedReason, string> = {
    NO_PRIMARY_ASSIGNMENT: '尚未設定主職',
    PRIMARY_ASSIGNMENT_UNAVAILABLE: '主職目前無法辨識',
    NO_DIRECT_SUPERVISOR_POSITION: '目前主職為根職位',
    DIRECT_SUPERVISOR_POSITION_UNAVAILABLE: '直屬主管職位目前無法辨識',
    DIRECT_SUPERVISOR_VACANT: '直屬主管職位目前無人任職',
    DIRECT_SUPERVISOR_SELF_ONLY: '直屬主管職位目前只有本人',
    DIRECT_SUPERVISOR_MULTIPLE: '直屬主管職位有多位任職者',
  }
  return labels[reason] ?? '請確認組織階層設定'
}
