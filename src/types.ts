export type ChildrenAxis = 'horizontal' | 'vertical'
export type AssignmentType = 'regular' | 'acting'
export type RoleCombinationRiskLevel = 'low' | 'medium' | 'high'
export type OrganizationLayoutMode = 'tree' | 'levels'
export type DutyRelationType = 'execute' | 'review' | 'collaborate' | 'countersign'

export interface OrganizationLevel {
  id: string
  name: string
  order: number
}

export interface OrganizationLayoutSettings {
  mode: OrganizationLayoutMode
  showLevelGuides: boolean
  /** Fixed presentation Y positions used only by tree mode. */
  positionYOverrides?: Record<string, number>
}

export interface Employee {
  id: string
  name: string
  departmentIds: string[]
  primaryAssignmentId: string | null
  administrativeApproverOverrideEmployeeId: string | null
}

export interface Department {
  id: string
  name: string
  parentId: string | null
}

export interface Role {
  id: string
  name: string
}

export interface Position {
  id: string
  roleId: string
  departmentId: string | null
  parentPositionId: string | null
  organizationLevelId: string | null
  title: string
  status: 'active' | 'inactive'
  allowMultipleAssignees: boolean
}

export interface Assignment {
  id: string
  employeeId: string
  positionId: string
  assignmentType: AssignmentType
  validFrom: string
  validTo: string | null
}

export interface RoleCombinationRiskRule {
  id: string
  roleAId: string
  roleBId: string
  level: RoleCombinationRiskLevel
  reason: string
  enabled: boolean
}

export interface RoleCombinationRiskMatch {
  ruleId: string
  employeeId: string
  positionIds: readonly [string, string]
  level: RoleCombinationRiskLevel
}

export interface PositionRiskVisualState {
  positionId: string
  level: RoleCombinationRiskLevel
  counterpartPositionIds: string[]
}

export interface RoleRiskVisualRelation {
  id: string
  positionIds: readonly [string, string]
  level: RoleCombinationRiskLevel
}

export interface OrgMember {
  id: string
  order: number
  childrenAxis: ChildrenAxis
  collapsed?: boolean
}

export interface Duty {
  id: string
  title: string
  description: string | null
}

export type DutyRelationTarget =
  | { kind: 'position'; positionId: string }
  | {
      kind: 'pending-reassignment'
      formerPositionId: string
      formerPositionTitle: string
      formerDepartmentId: string | null
      formerDepartmentName: string | null
    }

export interface DutyPositionRelation {
  id: string
  dutyId: string
  relationType: DutyRelationType
  target: DutyRelationTarget
  isPrimaryExecutor: boolean
  order: number
}

export interface ProcessDefinition {
  id: string
  title: string
  description: string | null
  order: number
}

export interface ProcessNode {
  id: string
  processId: string
  title: string
  parentNodeId: string | null
  order: number
}

export interface ProcessEdge {
  id: string
  processId: string
  fromNodeId: string
  toNodeId: string
}

export interface ProcessNodeDutyLink {
  id: string
  processNodeId: string
  dutyId: string
  order: number
}

/**
 * Position data joined with the presentation layout state and current assignment.
 * The primary hierarchy comes from `Position.parentPositionId`; `OrgMember`
 * only owns canvas presentation preferences.
 */
export interface PositionView extends OrgMember {
  parentPositionId: string | null
  organizationLevelId: string | null
  title: string
  roleId: string
  departmentId: string | null
  allowMultipleAssignees: boolean
  activeAssignments: Assignment[]
}

export interface OrgDirectoryState {
  employees: Employee[]
  departments: Department[]
  roles: Role[]
  positions: Position[]
  assignments: Assignment[]
  members: OrgMember[]
  roleCombinationRiskRules: RoleCombinationRiskRule[]
  organizationLevels: OrganizationLevel[]
  organizationLayout: OrganizationLayoutSettings
  duties: Duty[]
  dutyPositionRelations: DutyPositionRelation[]
  processes: ProcessDefinition[]
  processNodes: ProcessNode[]
  processEdges: ProcessEdge[]
  processNodeDutyLinks: ProcessNodeDutyLink[]
}

/**
 * Read-only hierarchy adapter consumed by layout/drag/render helpers.
 * `parentId` is intentionally derived and never persisted in OrgDirectoryState.
 */
export interface HierarchyNode extends OrgMember {
  parentId: string | null
  organizationLevelId: string | null
  departmentId: string | null
  title: string
}

export interface Point {
  x: number
  y: number
}

export interface OrganizationLevelBand {
  levelId: string
  name: string
  order: number
  y: number
  height: number
}

export interface LayoutResult {
  positions: Record<string, Point>
  visibleIds: Set<string>
  width: number
  height: number
  levelBands?: OrganizationLevelBand[]
}
