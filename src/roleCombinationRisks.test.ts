import { describe, expect, it } from 'vitest'
import {
  buildPositionRiskVisualStates,
  canonicalRolePairKey,
  deriveRoleCombinationRiskMatches,
  selectVisibleRoleRiskRelations,
  setRoleCombinationRiskRuleEnabled,
  upsertRoleCombinationRiskRule,
  validateRoleCombinationRiskRules,
} from './roleCombinationRisks'
import type { Assignment, Position, Role, RoleCombinationRiskRule } from './types'

const roles: Role[] = [
  { id: 'finance', name: '財務' },
  { id: 'procurement', name: '採購' },
  { id: 'audit', name: '稽核' },
]

const positions: Position[] = [
  { id: 'finance-1', roleId: 'finance', departmentId: null, parentPositionId: null, organizationLevelId: null, title: '財務', status: 'active', allowMultipleAssignees: false },
  { id: 'finance-2', roleId: 'finance', departmentId: null, parentPositionId: null, organizationLevelId: null, title: '財務代理', status: 'active', allowMultipleAssignees: false },
  { id: 'procurement-1', roleId: 'procurement', departmentId: null, parentPositionId: null, organizationLevelId: null, title: '採購', status: 'active', allowMultipleAssignees: false },
  { id: 'audit-1', roleId: 'audit', departmentId: null, parentPositionId: null, organizationLevelId: null, title: '稽核', status: 'active', allowMultipleAssignees: false },
  { id: 'inactive-procurement', roleId: 'procurement', departmentId: null, parentPositionId: null, organizationLevelId: null, title: '停用採購', status: 'inactive', allowMultipleAssignees: false },
]

const rule = (overrides: Partial<RoleCombinationRiskRule> = {}): RoleCombinationRiskRule => ({
  id: 'finance-procurement',
  roleAId: 'finance',
  roleBId: 'procurement',
  level: 'medium',
  reason: '測試用風險原因',
  enabled: true,
  ...overrides,
})

const assignment = (
  id: string,
  employeeId: string,
  positionId: string,
  assignmentType: Assignment['assignmentType'] = 'regular',
  validFrom = '2026-01-01',
  validTo: string | null = null,
): Assignment => ({ id, employeeId, positionId, assignmentType, validFrom, validTo })

function detect(rules: RoleCombinationRiskRule[], assignments: Assignment[]) {
  return deriveRoleCombinationRiskMatches({ rules, roles, positions, assignments, asOf: '2026-08-15' })
}

describe('role combination risk rules', () => {
  it('canonicalizes role pairs without direction', () => {
    expect(canonicalRolePairKey('finance', 'procurement')).toBe(canonicalRolePairKey('procurement', 'finance'))
  })

  it('upserts immutably and preserves an edited rule ID', () => {
    const original = [rule()]
    const result = upsertRoleCombinationRiskRule(original, roles, rule({ level: 'high' }))
    expect(result).toEqual({ ok: true, rules: [rule({ level: 'high' })] })
    expect(original).toEqual([rule()])
    if (!result.ok) return
    expect(result.rules).not.toBe(original)
  })

  it.each([
    ['RISK_RULE_SELF_PAIR', [rule({ roleBId: 'finance' })]],
    ['RISK_RULE_DUPLICATE_PAIR', [rule(), rule({ id: 'reverse', roleAId: 'procurement', roleBId: 'finance' })]],
    ['DUPLICATE_RISK_RULE_ID', [rule(), rule({ roleAId: 'finance', roleBId: 'audit' })]],
    ['RISK_RULE_UNKNOWN_ROLE', [rule({ roleBId: 'missing' })]],
    ['RISK_RULE_INVALID_LEVEL', [rule({ level: 'unknown' as RoleCombinationRiskRule['level'] })]],
  ])('rejects invalid rules with %s', (code, rulesToValidate) => {
    expect(validateRoleCombinationRiskRules(rulesToValidate, roles)).toMatchObject({ ok: false, code })
  })

  it('does not create changes for an unknown toggle ID', () => {
    const rules = [rule()]
    expect(setRoleCombinationRiskRuleEnabled(rules, 'missing', false)).toBe(rules)
  })
})

describe('role combination risk detection', () => {
  it.each(['regular', 'acting'] as const)('matches active %s assignments', (assignmentType) => {
    expect(detect([rule()], [
      assignment('finance', 'amy', 'finance-1', assignmentType),
      assignment('procurement', 'amy', 'procurement-1', assignmentType),
    ])).toHaveLength(1)
  })

  it('excludes disabled, future, expired, different-employee, inactive and orphan inputs', () => {
    expect(detect([rule({ enabled: false })], [
      assignment('finance', 'amy', 'finance-1'),
      assignment('procurement', 'amy', 'procurement-1'),
    ])).toEqual([])
    expect(detect([rule()], [
      assignment('future-finance', 'amy', 'finance-1', 'regular', '2026-08-16'),
      assignment('expired-procurement', 'amy', 'procurement-1', 'regular', '2026-01-01', '2026-08-15'),
      assignment('other-finance', 'ben', 'finance-1'),
      assignment('inactive', 'amy', 'inactive-procurement'),
      assignment('orphan', 'amy', 'missing-position'),
    ])).toEqual([])
  })

  it('creates each actual position pair once when a role has multiple positions or duplicate assignments', () => {
    const matches = detect([rule()], [
      assignment('finance-1-a', 'amy', 'finance-1'),
      assignment('finance-1-b', 'amy', 'finance-1', 'regular'),
      assignment('finance-2', 'amy', 'finance-2'),
      assignment('procurement', 'amy', 'procurement-1'),
    ])
    expect(matches.map((match) => match.positionIds)).toEqual([
      ['finance-1', 'procurement-1'],
      ['finance-2', 'procurement-1'],
    ])
  })

  it('aggregates the highest level and stable unique counterparts', () => {
    const matches = deriveRoleCombinationRiskMatches({
      rules: [rule(), rule({ id: 'finance-audit', roleBId: 'audit', level: 'high' })],
      roles,
      positions,
      assignments: [
        assignment('finance', 'amy', 'finance-1'),
        assignment('procurement', 'amy', 'procurement-1'),
        assignment('audit', 'amy', 'audit-1'),
      ],
      asOf: '2026-08-15',
    })
    expect(buildPositionRiskVisualStates(matches).find((state) => state.positionId === 'finance-1')).toEqual({
      positionId: 'finance-1',
      level: 'high',
      counterpartPositionIds: ['audit-1', 'procurement-1'],
    })
  })

  it('selects only directly related relations whose two ends are visible', () => {
    const matches = detect([rule()], [
      assignment('finance', 'amy', 'finance-1'),
      assignment('procurement', 'amy', 'procurement-1'),
    ])
    expect(selectVisibleRoleRiskRelations(matches, 'finance-1', new Set(['finance-1']))).toEqual([])
    expect(selectVisibleRoleRiskRelations(matches, 'finance-1', new Set(['finance-1', 'procurement-1']))).toEqual([{
      id: 'role-risk-relation::finance-1::procurement-1',
      positionIds: ['finance-1', 'procurement-1'],
      level: 'medium',
    }])
  })

  it('orders low below medium and high when aggregating visual state', () => {
    const matches = deriveRoleCombinationRiskMatches({
      rules: [
        rule({ level: 'low' }),
        rule({ id: 'finance-audit', roleBId: 'audit', level: 'medium' }),
        rule({ id: 'procurement-audit', roleAId: 'procurement', roleBId: 'audit', level: 'high' }),
      ],
      roles,
      positions,
      assignments: [
        assignment('finance', 'amy', 'finance-1'),
        assignment('procurement', 'amy', 'procurement-1'),
        assignment('audit', 'amy', 'audit-1'),
      ],
      asOf: '2026-08-15',
    })
    const states = buildPositionRiskVisualStates(matches)
    expect(states.find((state) => state.positionId === 'finance-1')?.level).toBe('medium')
    expect(states.find((state) => state.positionId === 'procurement-1')?.level).toBe('high')
  })
})
