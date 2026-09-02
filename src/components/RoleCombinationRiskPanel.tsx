import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Pencil, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import type { RoleCombinationRiskRuleMutationResult } from '../roleCombinationRisks'
import type { Role, RoleCombinationRiskLevel, RoleCombinationRiskRule } from '../types'

export interface RoleCombinationRiskDraft {
  id: string | null
  roleAId: string
  roleBId: string
  level: RoleCombinationRiskLevel
  reason: string
  enabled: boolean
}

interface RoleCombinationRiskPanelProps {
  roles: Role[]
  rules: RoleCombinationRiskRule[]
  onUpsert: (draft: RoleCombinationRiskDraft) => RoleCombinationRiskRuleMutationResult
  onSetEnabled: (ruleId: string, enabled: boolean) => void
  onDelete: (ruleId: string) => void
  editingEnabled?: boolean
  requestCloseGuardRegistration?: (guard: (() => Promise<{ kind: 'allow' } | { kind: 'keep-open'; focusTarget?: string }>) | null) => void
}

function createDraft(roles: Role[]): RoleCombinationRiskDraft {
  return {
    id: null,
    roleAId: roles[0]?.id ?? '',
    roleBId: roles.find((role) => role.id !== roles[0]?.id)?.id ?? '',
    level: 'medium',
    reason: '',
    enabled: true,
  }
}

function riskLevelLabel(level: RoleCombinationRiskLevel) {
  if (level === 'high') return '高風險'
  if (level === 'medium') return '中風險'
  return '低風險'
}

function validationMessage(result: Extract<RoleCombinationRiskRuleMutationResult, { ok: false }>) {
  switch (result.code) {
    case 'RISK_RULE_SELF_PAIR': return '兩個職務不能相同。'
    case 'RISK_RULE_DUPLICATE_PAIR': return '這組職務已經設定。'
    case 'RISK_RULE_UNKNOWN_ROLE': return '選取的職務已不存在，請重新選擇。'
    case 'RISK_RULE_INVALID_LEVEL': return '請選擇有效的風險等級。'
    case 'DUPLICATE_RISK_RULE_ID': return '規則識別重複，請取消後再試一次。'
    default: return '請完整選擇兩個不同職務。'
  }
}

export function RoleCombinationRiskPanel({
  roles,
  rules,
  onUpsert,
  onSetEnabled,
  onDelete,
  editingEnabled = true,
  requestCloseGuardRegistration,
}: RoleCombinationRiskPanelProps) {
  const [draft, setDraft] = useState<RoleCombinationRiskDraft | null>(null)
  const [error, setError] = useState('')
  const panelRef = useRef<HTMLElement>(null)
  const firstSelectRef = useRef<HTMLSelectElement>(null)
  const sortedRoles = useMemo(
    () => [...roles].sort((first, second) => first.name.localeCompare(second.name, 'zh-Hant')),
    [roles],
  )
  const roleNameById = useMemo(() => new Map(roles.map((role) => [role.id, role.name])), [roles])

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  useEffect(() => {
    if (draft) firstSelectRef.current?.focus()
  }, [draft?.id])

  useEffect(() => {
    requestCloseGuardRegistration?.(draft ? async () => ({ kind: 'keep-open', focusTarget: 'role-risk-panel-title' }) : null)
    return () => requestCloseGuardRegistration?.(null)
  }, [draft, requestCloseGuardRegistration])

  const startCreate = () => {
    if (!editingEnabled) return
    setDraft(createDraft(sortedRoles))
    setError('')
  }

  const startEdit = (rule: RoleCombinationRiskRule) => {
    if (!editingEnabled) return
    setDraft({ ...rule })
    setError('')
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!draft) return
    const result = onUpsert(draft)
    if (!result.ok) {
      setError(validationMessage(result))
      return
    }
    setDraft(null)
    setError('')
  }

  return (
    <aside
      ref={panelRef}
      className="role-risk-panel role-risk-panel--workspace"
      role="region"
      aria-modal="false"
      aria-labelledby="role-risk-panel-title"
      tabIndex={-1}
      data-workspace-panel="role-risk"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        if (draft) {
          setDraft(null)
          setError('')
          window.requestAnimationFrame(() => panelRef.current?.focus())
        }
      }}
    >
      <header className="role-risk-panel__header">
        <div className="role-risk-panel__header-copy">
          <ShieldAlert size={16} aria-hidden="true" />
          <h2 id="role-risk-panel-title">兼任風險設定</h2>
        </div>
      </header>

      <div className="role-risk-panel__body">
        <div className="role-risk-panel__actions">
          <span>{rules.length} 組</span>
          {editingEnabled && (
            <button type="button" onClick={startCreate} disabled={sortedRoles.length < 2 || draft !== null}>
              <Plus size={14} aria-hidden="true" />
              新增規則
            </button>
          )}
        </div>

        {draft && (
          <form className="role-risk-form" onSubmit={submit} data-org-editor>
            <div className="role-risk-form__fields">
              <label>
                <span>職務 A</span>
                <select
                  ref={firstSelectRef}
                  value={draft.roleAId}
                  disabled={!editingEnabled}
                  onChange={(event) => {
                    setDraft({ ...draft, roleAId: event.target.value })
                    setError('')
                  }}
                >
                  {sortedRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                </select>
              </label>
              <label>
                <span>職務 B</span>
                <select
                  value={draft.roleBId}
                  disabled={!editingEnabled}
                  onChange={(event) => {
                    setDraft({ ...draft, roleBId: event.target.value })
                    setError('')
                  }}
                >
                  {sortedRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                </select>
              </label>
              <label>
                <span>等級</span>
                <select
                  value={draft.level}
                  disabled={!editingEnabled}
                  onChange={(event) => setDraft({ ...draft, level: event.target.value as RoleCombinationRiskLevel })}
                >
                  <option value="low">低風險</option>
                  <option value="medium">中風險</option>
                  <option value="high">高風險</option>
                </select>
              </label>
            </div>
              <label className="role-risk-form__reason">
                <span>原因</span>
                <textarea
                  value={draft.reason}
                  disabled={!editingEnabled}
                maxLength={160}
                rows={3}
                placeholder="例如：採購與付款權限集中，需保留獨立覆核。"
                onChange={(event) => {
                  setDraft({ ...draft, reason: event.target.value })
                  setError('')
                }}
              />
            </label>
            {error && <p className="role-risk-form__error" role="alert">{error}</p>}
            <div className="role-risk-form__actions">
              <button type="button" onClick={() => {
                setDraft(null)
                setError('')
              }}>取消</button>
              <button type="submit" disabled={!editingEnabled}>儲存</button>
            </div>
          </form>
        )}

        <div className={`role-risk-list${editingEnabled ? '' : ' role-risk-list--readonly'}`} role="table" aria-label="兼任風險規則">
          <div className="role-risk-list__head" role="row">
            <span role="columnheader">職務組合與原因</span>
            <span role="columnheader">等級</span>
            <span role="columnheader">啟用</span>
            {editingEnabled && <span role="columnheader">動作</span>}
          </div>
          {rules.length === 0 ? (
            <div className="role-risk-list__empty">尚無規則</div>
          ) : rules.map((rule) => (
            <div className="role-risk-list__row" role="row" key={rule.id}>
              <div className="role-risk-list__pair" role="cell">
                <div className="role-risk-list__role-pair">
                  <strong>{roleNameById.get(rule.roleAId) ?? '未知職務'}</strong>
                  <span aria-hidden="true">＋</span>
                  <strong>{roleNameById.get(rule.roleBId) ?? '未知職務'}</strong>
                </div>
                <span className="role-risk-list__reason" title={rule.reason}>{rule.reason}</span>
              </div>
              <span className={`role-risk-level role-risk-level--${rule.level}`} role="cell">
                {riskLevelLabel(rule.level)}
              </span>
              <label className="role-risk-toggle" role="cell">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  disabled={!editingEnabled}
                  onChange={(event) => onSetEnabled(rule.id, event.target.checked)}
                  aria-label={`${roleNameById.get(rule.roleAId) ?? '職務 A'}與${roleNameById.get(rule.roleBId) ?? '職務 B'}規則啟用`}
                />
                <span aria-hidden="true" />
              </label>
              {editingEnabled && (
                <div className="role-risk-list__row-actions" role="cell">
                  <button type="button" onClick={() => startEdit(rule)} aria-label="編輯規則" title="編輯">
                    <Pencil size={14} />
                  </button>
                  <button type="button" onClick={() => onDelete(rule.id)} aria-label="刪除規則" title="刪除">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
