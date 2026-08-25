import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpenText,
  ExternalLink,
  Link2,
  Plus,
  UsersRound,
} from 'lucide-react'
import {
  MANAGEMENT_METHOD_SECTIONS,
  RESPONSIBILITY_TYPE_OPTIONS,
  getPrototypeStepNumber,
  responsibilityTypeLabel,
  type ManagementMethodPrototypeState,
  type PrototypeResponsibilityType,
  type PrototypeResourceType,
} from '../managementMethodPrototype'
import type { PositionView } from '../types'

interface ManagementMethodPrototypeProps {
  state: ManagementMethodPrototypeState
  setState: Dispatch<SetStateAction<ManagementMethodPrototypeState>>
  positions: PositionView[]
  focusStepId: string | null
  onClose: () => void
  onConfigureResponsibility: (input: {
    methodId: string
    stageId: string
    stepId: string
    workItemId: string
    relationType: PrototypeResponsibilityType
  }) => void
}

function useMobileReadOnly() {
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches)
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setMobile(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return mobile
}

function sectionId(index: number) {
  return `method-section-${String(index + 1).padStart(2, '0')}`
}

export function ManagementMethodPrototype({
  state,
  setState,
  positions,
  focusStepId,
  onClose,
  onConfigureResponsibility,
}: ManagementMethodPrototypeProps) {
  const readOnly = useMobileReadOnly()
  const [workItemDrafts, setWorkItemDrafts] = useState<Record<string, string>>({})
  const [resourceDraft, setResourceDraft] = useState({ name: '', type: '表單' as PrototypeResourceType, url: '' })
  const positionTitleById = useMemo(() => new Map(positions.map((position) => [position.id, position.title])), [positions])

  useEffect(() => {
    if (!focusStepId) return
    const timer = window.setTimeout(() => {
      document.querySelector<HTMLElement>(`[data-method-step-id="${focusStepId}"]`)?.scrollIntoView({ block: 'center' })
      document.querySelector<HTMLElement>(`[data-method-step-focus="${focusStepId}"]`)?.focus()
    }, 40)
    return () => window.clearTimeout(timer)
  }, [focusStepId])

  const updateMethodField = (field: 'title' | 'purpose' | 'scope' | 'inputs' | 'outputs' | 'exceptionHandling' | 'metrics', value: string) => {
    setState((current) => ({ ...current, method: { ...current.method, [field]: value } }))
  }

  const updateStep = (stageId: string, stepId: string, patch: { narrative?: string; workItemId?: string | null }) => {
    setState((current) => ({
      ...current,
      method: {
        ...current.method,
        stages: current.method.stages.map((stage) => stage.id === stageId
          ? { ...stage, steps: stage.steps.map((step) => step.id === stepId ? { ...step, ...patch } : step) }
          : stage),
      },
    }))
  }

  const moveStep = (stageId: string, stepId: string, direction: -1 | 1) => {
    setState((current) => ({
      ...current,
      method: {
        ...current.method,
        stages: current.method.stages.map((stage) => {
          if (stage.id !== stageId) return stage
          const from = stage.steps.findIndex((step) => step.id === stepId)
          const to = from + direction
          if (from < 0 || to < 0 || to >= stage.steps.length) return stage
          const steps = [...stage.steps]
          const [moved] = steps.splice(from, 1)
          steps.splice(to, 0, moved)
          return { ...stage, steps }
        }),
      },
    }))
  }

  const moveStage = (stageId: string, direction: -1 | 1) => {
    setState((current) => {
      const from = current.method.stages.findIndex((stage) => stage.id === stageId)
      const to = from + direction
      if (from < 0 || to < 0 || to >= current.method.stages.length) return current
      const stages = [...current.method.stages]
      const [moved] = stages.splice(from, 1)
      stages.splice(to, 0, moved)
      return { ...current, method: { ...current.method, stages } }
    })
  }

  const addStep = (stageId: string) => {
    const id = `prototype-step-${crypto.randomUUID()}`
    setState((current) => ({
      ...current,
      method: {
        ...current.method,
        stages: current.method.stages.map((stage) => stage.id === stageId
          ? { ...stage, steps: [...stage.steps, { id, narrative: '', workItemId: null, resourceIds: [] }] }
          : stage),
      },
    }))
  }

  const addStage = () => {
    setState((current) => ({
      ...current,
      method: {
        ...current.method,
        stages: [...current.method.stages, { id: `prototype-stage-${crypto.randomUUID()}`, title: '新流程階段', steps: [] }],
      },
    }))
  }

  const createWorkItemForStep = (stageId: string, stepId: string) => {
    const title = workItemDrafts[stepId]?.trim()
    if (!title) return
    const existing = state.workItems.find((item) => item.title.trim().toLocaleLowerCase('zh-Hant') === title.toLocaleLowerCase('zh-Hant'))
    if (existing) {
      updateStep(stageId, stepId, { workItemId: existing.id })
      setWorkItemDrafts((current) => ({ ...current, [stepId]: '' }))
      return
    }
    const workItemId = `prototype-work-${crypto.randomUUID()}`
    setState((current) => ({
      ...current,
      workItems: [...current.workItems, { id: workItemId, title, description: '' }],
      method: {
        ...current.method,
        stages: current.method.stages.map((stage) => stage.id === stageId
          ? { ...stage, steps: stage.steps.map((step) => step.id === stepId ? { ...step, workItemId } : step) }
          : stage),
      },
    }))
    setWorkItemDrafts((current) => ({ ...current, [stepId]: '' }))
  }

  const updateWorkItem = (workItemId: string, patch: { title?: string; description?: string }) => {
    setState((current) => ({
      ...current,
      workItems: current.workItems.map((item) => item.id === workItemId ? { ...item, ...patch } : item),
    }))
  }

  const addResource = () => {
    if (!resourceDraft.name.trim() || !resourceDraft.url.trim()) return
    setState((current) => ({
      ...current,
      method: {
        ...current.method,
        resources: [...current.method.resources, {
          id: `prototype-resource-${crypto.randomUUID()}`,
          name: resourceDraft.name.trim(),
          type: resourceDraft.type,
          url: resourceDraft.url.trim(),
          stepIds: [],
        }],
      },
    }))
    setResourceDraft({ name: '', type: '表單', url: '' })
  }

  const responsibilitySummary = (workItemId: string) => {
    const matches = state.assignments.filter((assignment) => assignment.workItemId === workItemId)
    if (matches.length === 0) return '尚未配置'
    return RESPONSIBILITY_TYPE_OPTIONS
      .map((option) => {
        const titles = matches
          .filter((assignment) => assignment.relationType === option.value)
          .map((assignment) => positionTitleById.get(assignment.positionId) ?? '職位已無法取得')
        return titles.length > 0 ? `${option.label}：${titles.join('、')}` : null
      })
      .filter(Boolean)
      .join('　')
  }

  const scrollToSection = (index: number) => {
    document.getElementById(sectionId(index))?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  return (
    <div className={`method-prototype${readOnly ? ' is-read-only' : ''}`}>
      <header className="method-prototype__appbar">
        <button type="button" className="method-prototype__back" onClick={onClose}>
          <ArrowLeft size={17} />
          組織架構
        </button>
        <div className="method-prototype__brand">
          <BookOpenText size={18} />
          <strong>管理辦法</strong>
        </div>
        <div className="method-prototype__switcher">
          <label>
            <span className="sr-only">切換管理辦法</span>
            <select aria-label="切換管理辦法" value={state.method.id} disabled>
              <option value={state.method.id}>{state.method.code}　{state.method.title}</option>
            </select>
          </label>
          {!readOnly && <button type="button" className="method-prototype__new" disabled title="原型目前只驗證一份辦法">新增管理辦法</button>}
        </div>
      </header>

      <div className="method-prototype__identity">
        <div className="method-prototype__identity-meta">
          <span className="method-prototype__code">{state.method.code}</span>
          <span>建置中草稿</span>
          <span className="method-prototype__prototype-tag">互動原型</span>
          {readOnly && <span className="method-prototype__readonly-tag">手機唯讀</span>}
        </div>
        {readOnly ? (
          <h1>{state.method.title}</h1>
        ) : (
          <input
            className="method-prototype__title-input"
            value={state.method.title}
            onChange={(event) => updateMethodField('title', event.target.value)}
            aria-label="管理辦法標題"
          />
        )}
      </div>

      <div className="method-prototype__workspace">
        <nav className="method-prototype__nav" aria-label="管理辦法章節">
          <label className="method-prototype__mobile-nav">
            <span>跳至章節</span>
            <select defaultValue="" onChange={(event) => scrollToSection(Number(event.target.value))}>
              <option value="" disabled>選擇章節</option>
              {MANAGEMENT_METHOD_SECTIONS.map((section, index) => <option key={section} value={index}>{index + 1}. {section}</option>)}
            </select>
          </label>
          <div className="method-prototype__desktop-nav">
            {MANAGEMENT_METHOD_SECTIONS.map((section, index) => (
              <button type="button" key={section} onClick={() => scrollToSection(index)}>
                <span>{String(index + 1).padStart(2, '0')}</span>{section}
              </button>
            ))}
          </div>
        </nav>

        <main className="method-prototype__content" aria-label="管理辦法正文">
          <MethodTextSection index={0} value={state.method.purpose} readOnly={readOnly} onChange={(value) => updateMethodField('purpose', value)} />
          <MethodTextSection index={1} value={state.method.scope} readOnly={readOnly} onChange={(value) => updateMethodField('scope', value)} />

          <section id={sectionId(2)} className="method-prototype__section">
            <h2><span>03</span>{MANAGEMENT_METHOD_SECTIONS[2]}</h2>
            <div className="method-prototype__two-columns">
              <MethodField label="輸入" value={state.method.inputs} readOnly={readOnly} onChange={(value) => updateMethodField('inputs', value)} />
              <MethodField label="輸出" value={state.method.outputs} readOnly={readOnly} onChange={(value) => updateMethodField('outputs', value)} />
            </div>
          </section>

          <section id={sectionId(3)} className="method-prototype__section">
            <h2><span>04</span>{MANAGEMENT_METHOD_SECTIONS[3]}</h2>
            <p className="method-prototype__section-intro">下列職位由流程步驟引用的共用工作事項即時彙整，不在本章重複輸入。</p>
            <div className="method-prototype__responsibility-overview">
              {state.workItems.map((item) => {
                const summary = responsibilitySummary(item.id)
                if (summary === '尚未配置' && !state.method.stages.some((stage) => stage.steps.some((step) => step.workItemId === item.id))) return null
                return <div key={item.id}><strong>{item.title}</strong><span>{summary}</span></div>
              })}
            </div>
          </section>

          <section id={sectionId(4)} className="method-prototype__section method-prototype__process">
            <div className="method-prototype__section-heading">
              <div>
                <h2><span>05</span>{MANAGEMENT_METHOD_SECTIONS[4]}</h2>
                <p>階段保留流程脈絡；每個步驟只描述一個主要動作，責任仍屬於共用工作事項。</p>
              </div>
              {!readOnly && <button type="button" className="method-prototype__secondary-action" onClick={addStage}><Plus size={15} />新增階段</button>}
            </div>

            {state.method.stages.map((stage, stageIndex) => (
              <div className="method-stage" key={stage.id}>
                <div className="method-stage__heading">
                  <span>階段 {String(stageIndex + 1).padStart(2, '0')}</span>
                  {readOnly ? <h3>{stage.title}</h3> : (
                    <input
                      value={stage.title}
                      aria-label={`階段 ${stageIndex + 1} 名稱`}
                      onChange={(event) => setState((current) => ({
                        ...current,
                        method: {
                          ...current.method,
                          stages: current.method.stages.map((candidate) => candidate.id === stage.id ? { ...candidate, title: event.target.value } : candidate),
                        },
                      }))}
                    />
                  )}
                  {!readOnly && (
                    <div className="method-stage__actions">
                      <button type="button" onClick={() => moveStage(stage.id, -1)} disabled={stageIndex === 0} aria-label={`上移 ${stage.title}`}><ArrowUp size={14} /></button>
                      <button type="button" onClick={() => moveStage(stage.id, 1)} disabled={stageIndex === state.method.stages.length - 1} aria-label={`下移 ${stage.title}`}><ArrowDown size={14} /></button>
                    </div>
                  )}
                </div>

                {stage.steps.length === 0 && <p className="method-stage__empty">此階段尚無步驟。</p>}
                {stage.steps.map((step, stepIndex) => {
                  const workItem = state.workItems.find((item) => item.id === step.workItemId)
                  const stepNumber = getPrototypeStepNumber(state, step.id)
                  const resources = state.method.resources.filter((resource) => step.resourceIds.includes(resource.id))
                  return (
                    <article className="method-step" key={step.id} data-method-step-id={step.id}>
                      <div className="method-step__number">步驟 {stepNumber}</div>
                      <div className="method-step__body">
                        <label className="method-step__narrative">
                          <span>情境操作描述</span>
                          {readOnly ? <p>{step.narrative || '尚未填寫'}</p> : (
                            <textarea
                              value={step.narrative}
                              onChange={(event) => updateStep(stage.id, step.id, { narrative: event.target.value })}
                              rows={2}
                              data-method-step-focus={step.id}
                            />
                          )}
                        </label>

                        <div className="method-step__work-item">
                          <div className="method-step__work-item-heading">
                            <strong>共用工作事項</strong>
                            {!workItem && <span className="method-step__empty-label">尚未連結</span>}
                          </div>
                          {!readOnly && (
                            <select
                              value={step.workItemId ?? ''}
                              onChange={(event) => updateStep(stage.id, step.id, { workItemId: event.target.value || null })}
                              aria-label={`步驟 ${stepNumber} 的工作事項`}
                            >
                              <option value="">尚未連結工作事項</option>
                              {state.workItems.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                            </select>
                          )}
                          {workItem && (
                            <div className="method-step__shared-editor">
                              {readOnly ? <strong>{workItem.title}</strong> : (
                                <input value={workItem.title} onChange={(event) => updateWorkItem(workItem.id, { title: event.target.value })} aria-label="共用工作事項名稱" />
                              )}
                              {readOnly ? <p>{workItem.description || '尚無簡要內容'}</p> : (
                                <input value={workItem.description} onChange={(event) => updateWorkItem(workItem.id, { description: event.target.value })} placeholder="共用簡要內容" aria-label="共用工作事項簡要內容" />
                              )}
                            </div>
                          )}
                          {!readOnly && !workItem && (
                            <div className="method-step__quick-create">
                              <input
                                value={workItemDrafts[step.id] ?? ''}
                                onChange={(event) => setWorkItemDrafts((current) => ({ ...current, [step.id]: event.target.value }))}
                                placeholder="輸入新工作事項名稱"
                              />
                              <button type="button" onClick={() => createWorkItemForStep(stage.id, step.id)}>建立並引用</button>
                            </div>
                          )}
                        </div>

                        {workItem && (
                          <div className="method-step__responsibility">
                            <div>
                              <span>責任投影</span>
                              <strong>{responsibilitySummary(workItem.id)}</strong>
                            </div>
                            {!readOnly && (
                              <button type="button" onClick={() => onConfigureResponsibility({
                                methodId: state.method.id,
                                stageId: stage.id,
                                stepId: step.id,
                                workItemId: workItem.id,
                                relationType: 'primary-execute',
                              })}>
                                <UsersRound size={15} />配置責任
                              </button>
                            )}
                          </div>
                        )}

                        {resources.length > 0 && (
                          <div className="method-step__resources">
                            <Link2 size={13} />
                            {resources.map((resource) => <a key={resource.id} href={resource.url} target="_blank" rel="noreferrer">{resource.name}</a>)}
                          </div>
                        )}
                      </div>
                      {!readOnly && (
                        <div className="method-step__actions">
                          <button type="button" onClick={() => moveStep(stage.id, step.id, -1)} disabled={stepIndex === 0} aria-label={`上移步驟 ${stepNumber}`}><ArrowUp size={14} /></button>
                          <button type="button" onClick={() => moveStep(stage.id, step.id, 1)} disabled={stepIndex === stage.steps.length - 1} aria-label={`下移步驟 ${stepNumber}`}><ArrowDown size={14} /></button>
                        </div>
                      )}
                    </article>
                  )
                })}
                {!readOnly && <button type="button" className="method-stage__add-step" onClick={() => addStep(stage.id)}><Plus size={14} />新增步驟</button>}
              </div>
            ))}
          </section>

          <MethodListSection index={5} values={state.method.qualityRequirements} readOnly={readOnly} setState={setState} field="qualityRequirements" />
          <MethodListSection index={6} values={state.method.controlPoints} readOnly={readOnly} setState={setState} field="controlPoints" />
          <MethodListSection index={7} values={state.method.approvalRules} readOnly={readOnly} setState={setState} field="approvalRules" />
          <MethodTextSection index={8} value={state.method.exceptionHandling} readOnly={readOnly} onChange={(value) => updateMethodField('exceptionHandling', value)} />
          <MethodTextSection index={9} value={state.method.metrics} readOnly={readOnly} onChange={(value) => updateMethodField('metrics', value)} />
          <MethodListSection index={10} values={state.method.evidenceRequirements} readOnly={readOnly} setState={setState} field="evidenceRequirements" />

          <section id={sectionId(11)} className="method-prototype__section">
            <h2><span>12</span>{MANAGEMENT_METHOD_SECTIONS[11]}</h2>
            <p className="method-prototype__section-intro">只保存目前仍使用的名稱、類型與連結；不保存舊文件來源或版次追溯。</p>
            <div className="method-resource-list">
              {state.method.resources.map((resource) => (
                <a key={resource.id} href={resource.url} target="_blank" rel="noreferrer">
                  <span>{resource.type}</span><strong>{resource.name}</strong><ExternalLink size={14} />
                </a>
              ))}
            </div>
            {!readOnly && (
              <div className="method-resource-create">
                <input value={resourceDraft.name} onChange={(event) => setResourceDraft((current) => ({ ...current, name: event.target.value }))} placeholder="資源顯示名稱" />
                <select value={resourceDraft.type} onChange={(event) => setResourceDraft((current) => ({ ...current, type: event.target.value as PrototypeResourceType }))}>
                  <option>表單</option><option>參考文件</option><option>範例</option>
                </select>
                <input value={resourceDraft.url} onChange={(event) => setResourceDraft((current) => ({ ...current, url: event.target.value }))} placeholder="https://…" />
                <button type="button" onClick={addResource}>新增連結</button>
              </div>
            )}
          </section>

          <section id={sectionId(12)} className="method-prototype__section">
            <h2><span>13</span>{MANAGEMENT_METHOD_SECTIONS[12]}</h2>
            <p className="method-prototype__section-intro">只作人工參考對照，不計分，也不形成符合性結論。</p>
            <div className="method-compliance-table" role="table" aria-label="合規參考對照">
              <div role="row"><strong role="cell">ISO 9001:2015</strong><span role="cell">7.1.2 人員、7.2 能力、7.5 文件化資訊</span><em role="cell">待確認</em></div>
              <div role="row"><strong role="cell">創櫃板內控</strong><span role="cell">薪工循環／職務授權與紀錄留存</span><em role="cell">待確認</em></div>
            </div>
          </section>

          <section id={sectionId(13)} className="method-prototype__section method-prototype__identification">
            <h2><span>14</span>{MANAGEMENT_METHOD_SECTIONS[13]}</h2>
            <dl>
              <div><dt>永久代碼</dt><dd>{state.method.code}</dd></div>
              <div><dt>文件型態</dt><dd>管理辦法（MP）</dd></div>
              <div><dt>目前狀態</dt><dd>建置中草稿／非正式受控文件</dd></div>
              <div><dt>原型資料</dt><dd>只存在目前瀏覽器工作階段，不寫入正式組織資料</dd></div>
            </dl>
          </section>
        </main>
      </div>
    </div>
  )
}

function MethodTextSection({ index, value, readOnly, onChange }: { index: number; value: string; readOnly: boolean; onChange: (value: string) => void }) {
  return (
    <section id={sectionId(index)} className="method-prototype__section">
      <h2><span>{String(index + 1).padStart(2, '0')}</span>{MANAGEMENT_METHOD_SECTIONS[index]}</h2>
      {readOnly ? <p className="method-prototype__reading-copy">{value}</p> : <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} />}
    </section>
  )
}

function MethodField({ label, value, readOnly, onChange }: { label: string; value: string; readOnly: boolean; onChange: (value: string) => void }) {
  return (
    <label className="method-prototype__field">
      <span>{label}</span>
      {readOnly ? <p>{value}</p> : <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} />}
    </label>
  )
}

function MethodListSection({
  index,
  values,
  readOnly,
  setState,
  field,
}: {
  index: number
  values: string[]
  readOnly: boolean
  setState: Dispatch<SetStateAction<ManagementMethodPrototypeState>>
  field: 'qualityRequirements' | 'controlPoints' | 'approvalRules' | 'evidenceRequirements'
}) {
  return (
    <section id={sectionId(index)} className="method-prototype__section">
      <h2><span>{String(index + 1).padStart(2, '0')}</span>{MANAGEMENT_METHOD_SECTIONS[index]}</h2>
      <div className="method-prototype__structured-list">
        {values.map((value, itemIndex) => (
          <div key={`${field}-${itemIndex}`}>
            <span>{itemIndex + 1}</span>
            {readOnly ? <p>{value}</p> : (
              <textarea
                value={value}
                rows={2}
                onChange={(event) => setState((current) => ({
                  ...current,
                  method: {
                    ...current.method,
                    [field]: current.method[field].map((item, index) => index === itemIndex ? event.target.value : item),
                  },
                }))}
              />
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
