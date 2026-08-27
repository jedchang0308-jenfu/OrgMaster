import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  GitFork,
  Search,
  ShieldAlert,
  ShieldCheck,
  BookOpenText,
} from 'lucide-react'
import { DocumentMenu } from './DocumentMenu'
import type { OrgDocumentKind } from '../documentStorage'
import { groupByDepartmentAndLevel } from '../positionGrouping'
import type { Department, Employee, OrganizationLevel, PositionView } from '../types'
import type { OrgWorkspaceVersionSummary, WorkspaceMode } from '../versionWorkspace'
import { VersionSwitcher } from './VersionSwitcher'

interface ToolbarProps {
  members: PositionView[]
  employees: Employee[]
  departments: Department[]
  organizationLevels: OrganizationLevel[]
  searchFocusToken: number
  onSearchSelect: (id: string) => void
  roleRiskSettingsOpen: boolean
  onOpenRoleRiskSettings: () => void
  governanceOpen: boolean
  onOpenGovernance: () => void
  onOpenManagementMethods: () => void
  onOpenProcessPlanning?: () => void
  governanceButtonRef: RefObject<HTMLButtonElement | null>
  isDirty: boolean
  savedAt: string | null
  persistenceKind: OrgDocumentKind | null
  autoSavePending: boolean
  autoSaveError: boolean
  onSave: () => void
  onSaveCopy: () => void
  onBackup: () => void
  versions: OrgWorkspaceVersionSummary[]
  activeVersionId: string | null
  workspaceMode: WorkspaceMode
  onSelectVersion: (versionId: string) => void
  onOpenWorkspace: () => void
  onToggleCurrentMaintenance: () => void
}

export function Toolbar({
  members,
  employees,
  departments,
  organizationLevels,
  searchFocusToken,
  onSearchSelect,
  roleRiskSettingsOpen,
  onOpenRoleRiskSettings,
  governanceOpen,
  onOpenGovernance,
  onOpenManagementMethods,
  onOpenProcessPlanning,
  governanceButtonRef,
  isDirty,
  savedAt,
  persistenceKind,
  autoSavePending,
  autoSaveError,
  onSave,
  onSaveCopy,
  onBackup,
  versions,
  activeVersionId,
  workspaceMode,
  onSelectVersion,
  onOpenWorkspace,
  onToggleCurrentMaintenance,
}: ToolbarProps) {
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const roleRiskButtonRef = useRef<HTMLButtonElement>(null)
  const previousRoleRiskSettingsOpen = useRef(false)
  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees])

  useEffect(() => {
    if (searchFocusToken > 0) {
      searchRef.current?.focus()
      setSearchOpen(true)
    }
  }, [searchFocusToken])

  useEffect(() => {
    if (previousRoleRiskSettingsOpen.current && !roleRiskSettingsOpen) roleRiskButtonRef.current?.focus()
    previousRoleRiskSettingsOpen.current = roleRiskSettingsOpen
  }, [roleRiskSettingsOpen])

  const results = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase('zh-Hant')
    if (!keyword) return []
    return members
      .filter((member) => {
        const employeeNames = member.activeAssignments
          .map((assignment) => employeeById.get(assignment.employeeId)?.name ?? '')
          .join(' ')
        return `${member.title} ${employeeNames}`.toLocaleLowerCase('zh-Hant').includes(keyword)
      })
      .slice(0, 6)
  }, [employeeById, members, query])
  const resultGroups = useMemo(
    () => groupByDepartmentAndLevel(results, departments, organizationLevels, (position) => position),
    [departments, organizationLevels, results],
  )

  const chooseResult = (id: string) => {
    onSearchSelect(id)
    setQuery('')
    setSearchOpen(false)
    searchRef.current?.blur()
  }

  return (
    <header className="topbar">
      <div className="brand" aria-label="OrgMaster">
        <div className="brand__mark"><GitFork size={18} /></div>
        <div>
          <strong>OrgMaster</strong>
          <span>公司組織圖</span>
        </div>
      </div>

      <div className="topbar__right">
        <VersionSwitcher
          versions={versions}
          activeVersionId={activeVersionId}
          mode={workspaceMode}
          onSelect={onSelectVersion}
          onOpenWorkspace={onOpenWorkspace}
          onToggleCurrentMaintenance={onToggleCurrentMaintenance}
        />
        <DocumentMenu
          isDirty={isDirty}
          savedAt={savedAt}
          persistenceKind={persistenceKind}
          autoSavePending={autoSavePending}
          autoSaveError={autoSaveError}
          onSave={onSave}
          onSaveCopy={onSaveCopy}
          onBackup={onBackup}
        />
        <div className="search-box">
          <Search size={16} aria-hidden="true" />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setSearchOpen(true)
            }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && results[0]) chooseResult(results[0].id)
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                setSearchOpen(false)
                searchRef.current?.blur()
              }
            }}
            placeholder="搜尋職位或姓名"
            aria-label="搜尋職位或姓名"
          />
          <kbd>/</kbd>
          {searchOpen && query.trim() && (
            <div className="search-results">
              {resultGroups.length > 0 ? resultGroups.map((group) => (
                <div className="search-results__group" key={group.key}>
                  <div className="search-results__group-header">{group.label}</div>
                  {group.items.map((member) => (
                    <button type="button" key={member.id} onMouseDown={() => chooseResult(member.id)}>
                      <span>{member.title}</span>
                      <small>
                        {member.activeAssignments.length > 0
                          ? member.activeAssignments
                            .map((assignment) => employeeById.get(assignment.employeeId)?.name ?? '')
                            .filter(Boolean)
                            .join('、')
                          : '未指派'}
                      </small>
                    </button>
                  ))}
                </div>
              )) : (
                <div className="search-results__empty">找不到符合的職位或姓名</div>
              )}
            </div>
          )}
        </div>
        <button
          ref={roleRiskButtonRef}
          type="button"
          className="icon-button"
          onClick={onOpenRoleRiskSettings}
          aria-label="兼任風險設定"
          aria-pressed={roleRiskSettingsOpen}
          title="兼任風險設定"
        >
          <ShieldAlert size={18} />
        </button>
        <button ref={governanceButtonRef} type="button" className="icon-button" onClick={onOpenGovernance} aria-label="角色指派治理" aria-pressed={governanceOpen} title="角色指派治理">
          <ShieldCheck size={18} />
        </button>
        <button type="button" className="icon-button" onClick={onOpenManagementMethods} aria-label="管理辦法" title="管理辦法">
          <BookOpenText size={18} />
        </button>
        {onOpenProcessPlanning && <button type="button" className="icon-button" onClick={onOpenProcessPlanning} aria-label="流程規劃" title="流程規劃"><GitFork size={18} /></button>}
      </div>
    </header>
  )
}
