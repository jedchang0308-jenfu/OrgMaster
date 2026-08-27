import { BriefcaseBusiness, Building2, ChevronRight, UserRound } from 'lucide-react'
import { getDepartmentLabel } from '../organization'
import { groupByDepartmentAndLevel } from '../positionGrouping'
import { resolveDirectSupervisor, type DirectSupervisorUnresolvedReason } from '../directSupervisor'
import type { Department, Employee, OrganizationLevel, PositionView } from '../types'
import type { DirectorySelection } from './DirectoryDock'
import { PanelDismissButton } from './PanelDismissButton'

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
}: DirectoryDetailPanelProps) {
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
    const groupedAssignmentIds = new Set(
      employeeDepartments.flatMap((department) => employeeAssignments
        .filter(({ position }) => position.departmentId === department.id)
        .map(({ assignment }) => assignment.id)),
    )
    const ungroupedAssignments = employeeAssignments.filter(({ assignment }) => !groupedAssignmentIds.has(assignment.id))
    const directSupervisor = resolveDirectSupervisor(members, employees, employee.id)
    const primaryAssignmentGroups = groupByDepartmentAndLevel(
      employeeAssignments.filter(({ assignment }) => assignment.assignmentType === 'regular'),
      departments,
      organizationLevels,
      ({ position }) => position,
    )

    return (
      <aside className="inspector directory-detail-panel" aria-label={`員工 ${employee.name} 細節`} data-workspace-panel="inspector" tabIndex={-1}>
        <DetailHeader eyebrow="員工細節" title={employee.name} onClose={onClose} />
        <section className="inspector__section">
          <DetailSectionHeading label="部門與任職" count={`${employeeDepartments.length} 部門 · ${employeeAssignments.length} 職位`} />
          {employeeDepartments.length > 0 || ungroupedAssignments.length > 0 ? (
            <div className="directory-detail__department-groups">
              {employeeDepartments.map((department) => {
                const departmentAssignments = employeeAssignments.filter(({ position }) => position.departmentId === department.id)
                const departmentAssignmentGroups = groupByDepartmentAndLevel(
                  departmentAssignments,
                  departments,
                  organizationLevels,
                  ({ position }) => position,
                )
                const isPrimaryDepartment = department.id === primaryDepartmentId
                const departmentLabel = departmentAssignments.some(({ assignment }) => assignment.id === employee.primaryAssignmentId)
                  ? '主職'
                  : departmentAssignments.some(({ assignment }) => assignment.assignmentType === 'acting')
                    ? '代理'
                    : departmentAssignments.length > 0 ? '兼任' : '未指派'

                return (
                  <div key={department.id} className="directory-detail__department-group">
                    {isPrimaryDepartment ? (
                      <div className="directory-detail__department-link directory-detail__department-link--primary">
                        <label className="directory-detail__primary-assignment">
                          <span>主職</span>
                          <select
                            aria-label={`${employee.name} 主職`}
                            value={employee.primaryAssignmentId ?? ''}
                            disabled={!editingEnabled}
                            onChange={(event) => event.target.value && onSetPrimaryAssignment(employee.id, event.target.value)}
                          >
                            <option value="">尚未設定主職</option>
                            {primaryAssignmentGroups.map((group) => (
                              <optgroup key={group.key} label={group.label}>
                                {group.items.map(({ assignment, position }) => (
                                  <option key={assignment.id} value={assignment.id}>{position.title} · {getDepartmentLabel(departments, position.departmentId)}</option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </label>
                        <button
                          className="directory-detail__department-link-action"
                          type="button"
                          aria-label={`開啟 ${department.name} 部門明細`}
                          onClick={() => onSelectEntity({ kind: 'departments', id: department.id })}
                        >
                          <ChevronRight size={15} aria-hidden="true" />
                        </button>
                      </div>
                    ) : (
                      <button className="directory-detail__department-link" type="button" onClick={() => onSelectEntity({ kind: 'departments', id: department.id })}>
                        <span>
                          <strong>{department.name} · {departmentLabel}</strong>
                        </span>
                        <ChevronRight size={15} aria-hidden="true" />
                      </button>
                    )}
                    {departmentAssignments.length > 0 && (
                      <div className="directory-detail__assignment-groups">
                        {departmentAssignmentGroups.map((group) => (
                          <div className="directory-detail__assignment-group" key={group.key}>
                            <div className="directory-detail__assignment-links">
                              {group.items.map(({ assignment, position }) => (
                                <button key={position.id} type="button" onClick={() => onSelectPosition(position.id)}>
                                  <span>
                                    <strong>{position.title} · {assignment.assignmentType === 'acting' ? '代理' : assignment.id === employee.primaryAssignmentId ? '主職' : '兼任'}</strong>
                                  </span>
                                  <ChevronRight size={15} aria-hidden="true" />
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              {ungroupedAssignments.length > 0 && (
                <div className="directory-detail__department-group">
                  <div className="directory-detail__department-link is-static">
                    <span>
                      <strong>未設定部門</strong>
                    </span>
                  </div>
                  <div className="directory-detail__assignment-groups">
                    {groupByDepartmentAndLevel(ungroupedAssignments, departments, organizationLevels, ({ position }) => position).map((group) => (
                      <div className="directory-detail__assignment-group" key={group.key}>
                        <div className="directory-detail__assignment-links">
                          {group.items.map(({ assignment, position }) => (
                            <button key={position.id} type="button" onClick={() => onSelectPosition(position.id)}>
                              <span>
                                <strong>{position.title} · {assignment.assignmentType === 'acting' ? '代理' : assignment.id === employee.primaryAssignmentId ? '主職' : '兼任'}</strong>
                              </span>
                              <ChevronRight size={15} aria-hidden="true" />
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
                <div className="directory-detail__links">
                  {group.items.map((position) => (
                    <button key={position.id} type="button" onClick={() => onSelectPosition(position.id)}>
                      <BriefcaseBusiness size={15} aria-hidden="true" />
                      <span>
                        <strong>{position.title}</strong>
                        <small>{position.activeAssignments.length > 0 ? `${position.activeAssignments.length} 位員工` : '尚未指派員工'}</small>
                      </span>
                      <ChevronRight size={15} aria-hidden="true" />
                    </button>
                  ))}
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
  eyebrow: string
  title: string
  onClose: () => void
}) {
  return (
    <div className="inspector__header">
      <div className="inspector__header-copy">
        <span>{eyebrow}</span>
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
