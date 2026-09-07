import { useEffect, useMemo, useRef, useState } from 'react'
import {
  GitFork,
  Search,
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
  isDirty: boolean
  savedAt: string | null
  persistenceKind: OrgDocumentKind | null
  autoSavePending: boolean
  autoSaveError: boolean
  onSave: () => void
  onSaveCopy: () => void
  onBackup: () => void
  workspaceMutationAllowed?: boolean
  versions: OrgWorkspaceVersionSummary[]
  activeVersionId: string | null
  workspaceMode: WorkspaceMode
  onSelectVersion: (versionId: string) => void
  onOpenWorkspace: () => void
  onToggleCurrentMaintenance: () => void
  versionMutationAllowed?: boolean
}

export function Toolbar({
  members,
  employees,
  departments,
  organizationLevels,
  searchFocusToken,
  onSearchSelect,
  isDirty,
  savedAt,
  persistenceKind,
  autoSavePending,
  autoSaveError,
  onSave,
  onSaveCopy,
  onBackup,
  workspaceMutationAllowed = true,
  versions,
  activeVersionId,
  workspaceMode,
  onSelectVersion,
  onOpenWorkspace,
  onToggleCurrentMaintenance,
  versionMutationAllowed = true,
}: ToolbarProps) {
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees])

  useEffect(() => {
    if (searchFocusToken > 0) {
      searchRef.current?.focus()
      setSearchOpen(true)
    }
  }, [searchFocusToken])

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
          mutationAllowed={versionMutationAllowed}
        />
        <DocumentMenu
          isDirty={isDirty}
          savedAt={savedAt}
          persistenceKind={persistenceKind}
          autoSavePending={autoSavePending}
          autoSaveError={autoSaveError}
          mutationAllowed={workspaceMutationAllowed}
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
      </div>
    </header>
  )
}
