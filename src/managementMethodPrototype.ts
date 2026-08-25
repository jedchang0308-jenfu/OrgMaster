export type PrototypeResponsibilityType =
  | 'primary-execute'
  | 'execute'
  | 'review'
  | 'collaborate'
  | 'countersign'

export interface PrototypeWorkItem {
  id: string
  title: string
  description: string
}

export interface PrototypeResponsibilityAssignment {
  id: string
  workItemId: string
  positionId: string
  relationType: PrototypeResponsibilityType
}

export interface PrototypeMethodStep {
  id: string
  narrative: string
  workItemId: string | null
  resourceIds: string[]
}

export interface PrototypeMethodStage {
  id: string
  title: string
  steps: PrototypeMethodStep[]
}

export type PrototypeResourceType = '表單' | '參考文件' | '範例'

export interface PrototypeRelatedResource {
  id: string
  name: string
  type: PrototypeResourceType
  url: string
  stepIds: string[]
}

export interface ManagementMethodPrototypeState {
  method: {
    id: string
    code: string
    title: string
    purpose: string
    scope: string
    inputs: string
    outputs: string
    exceptionHandling: string
    metrics: string
    qualityRequirements: string[]
    controlPoints: string[]
    approvalRules: string[]
    evidenceRequirements: string[]
    stages: PrototypeMethodStage[]
    resources: PrototypeRelatedResource[]
  }
  workItems: PrototypeWorkItem[]
  assignments: PrototypeResponsibilityAssignment[]
}

export const MANAGEMENT_METHOD_SECTIONS = [
  '目的與預期結果',
  '適用範圍',
  '輸入與輸出',
  '相關職位與責任',
  '流程步驟',
  '品質要求與驗收標準',
  '風險與內部控制點',
  '核准權限及職責分離',
  '異常、退回與矯正處理',
  '監督指標與檢查頻率',
  '紀錄與執行證據要求',
  '相關資源與附件連結',
  'ISO／創櫃板／法規對照',
  '文件識別與建置註記',
] as const

export const RESPONSIBILITY_TYPE_OPTIONS: Array<{ value: PrototypeResponsibilityType; label: string }> = [
  { value: 'primary-execute', label: '主執行' },
  { value: 'execute', label: '共同執行' },
  { value: 'review', label: '審核' },
  { value: 'collaborate', label: '協作' },
  { value: 'countersign', label: '會簽' },
]

export const initialManagementMethodPrototype: ManagementMethodPrototypeState = {
  method: {
    id: 'method-personnel-requisition',
    code: 'MP-0001',
    title: '人員增補管理辦法',
    purpose: '確保人力需求經過必要性確認、條件定義與核准，並使招募、面試、錄用及試用考核有一致的作業依據。',
    scope: '適用於公司各部門提出新增編制、補缺或短期人力需求，以及後續招募至試用期結案作業。',
    inputs: '核定編制、部門人力需求、職位條件、預計到職日與預算資訊。',
    outputs: '核准或退回的人員增補需求、錄用決議、報到資料、試用考核結果及結案紀錄。',
    exceptionHandling: '資料不完整時退回需求單位補正；候選人條件未達標時停止錄用；試用考核未通過時依核准結果延長或終止。',
    metrics: '每月檢查職缺平均完成天數、試用期通過率與逾期未結案件；由管理部在月會提出異常說明。',
    qualityRequirements: [
      '增補條件須可追溯至實際工作需求，職位名稱、能力條件與預計到職日完整。',
      '面試評估須依同一職缺條件記錄，錄用條件不得高於核准範圍。',
    ],
    controlPoints: [
      '未經核准的人力需求不得對外招募或承諾錄用。',
      '錄用條件由人資彙整，核定者不得以口頭指示取代留存結果。',
    ],
    approvalRules: [
      '需求單位提出增補理由與條件；管理部確認編制及資料完整性；總經理核定增補與錄用條件。',
    ],
    evidenceRequirements: [
      '人員增補申請內容與核准結果',
      '候選人資料、面試評估與錄用決議',
      '報到文件與試用考核結果',
    ],
    stages: [
      {
        id: 'stage-demand',
        title: '人力需求',
        steps: [
          { id: 'step-demand-submit', narrative: '用人單位主管說明增補原因、工作內容、資格條件與預計到職日。', workItemId: 'work-demand-confirmation', resourceIds: ['resource-requisition-form'] },
          { id: 'step-demand-check', narrative: '管理部確認編制、預算與申請資料是否完整，缺漏時退回補正。', workItemId: 'work-demand-confirmation', resourceIds: ['resource-requisition-form'] },
        ],
      },
      {
        id: 'stage-recruitment',
        title: '招募甄選',
        steps: [
          { id: 'step-recruit-publish', narrative: '依核准條件發布職缺並收集候選人資料。', workItemId: 'work-recruitment', resourceIds: ['resource-candidate-form'] },
          { id: 'step-recruit-screen', narrative: '依職缺必要條件初步篩選候選人並安排面試。', workItemId: 'work-candidate-screening', resourceIds: ['resource-candidate-form'] },
        ],
      },
      {
        id: 'stage-interview',
        title: '面試',
        steps: [
          { id: 'step-interview', narrative: '人資與用人單位依職缺條件完成面談及評估紀錄。', workItemId: 'work-interview', resourceIds: ['resource-interview-guide'] },
        ],
      },
      {
        id: 'stage-approval',
        title: '內部審核',
        steps: [
          { id: 'step-offer-review', narrative: '彙整面試結果與擬錄用條件，送交具核定權限者決議。', workItemId: 'work-offer-approval', resourceIds: [] },
        ],
      },
      {
        id: 'stage-onboarding',
        title: '錄用報到',
        steps: [
          { id: 'step-onboarding', narrative: '通知錄用結果、確認到職資訊並完成報到資料。', workItemId: 'work-onboarding', resourceIds: ['resource-onboarding-list'] },
        ],
      },
      {
        id: 'stage-probation',
        title: '試用考核',
        steps: [
          { id: 'step-probation-review', narrative: '試用期屆滿前由直屬主管完成工作表現評估並提出建議。', workItemId: 'work-probation', resourceIds: [] },
        ],
      },
      {
        id: 'stage-close',
        title: '結案維護',
        steps: [
          { id: 'step-case-close', narrative: '人資確認核定結果與必要紀錄完整後結案。', workItemId: 'work-case-close', resourceIds: [] },
        ],
      },
    ],
    resources: [
      { id: 'resource-requisition-form', name: '人員增補申請表', type: '表單', url: 'https://example.com/forms/personnel-requisition', stepIds: ['step-demand-submit', 'step-demand-check'] },
      { id: 'resource-candidate-form', name: '應徵者基本資料表', type: '表單', url: 'https://example.com/forms/candidate-profile', stepIds: ['step-recruit-publish', 'step-recruit-screen'] },
      { id: 'resource-interview-guide', name: '面試提問與評估範例', type: '範例', url: 'https://example.com/examples/interview-guide', stepIds: ['step-interview'] },
      { id: 'resource-onboarding-list', name: '新進人員報到資料清單', type: '參考文件', url: 'https://example.com/references/onboarding-checklist', stepIds: ['step-onboarding'] },
    ],
  },
  workItems: [
    { id: 'work-demand-confirmation', title: '確認人員增補需求', description: '確認增補必要性、條件、編制與資料完整性。' },
    { id: 'work-recruitment', title: '執行職缺招募', description: '依核准條件發布職缺並管理招募來源。' },
    { id: 'work-candidate-screening', title: '篩選候選人', description: '依必要條件篩選並安排合適人選進入面試。' },
    { id: 'work-interview', title: '執行人員面試', description: '完成面談、評估與意見彙整。' },
    { id: 'work-offer-approval', title: '審核錄用條件', description: '確認錄用決議、職位與薪資條件。' },
    { id: 'work-onboarding', title: '辦理新進人員報到', description: '通知錄用並完成報到所需資料。' },
    { id: 'work-probation', title: '執行試用期考核', description: '完成試用期工作表現評估與核定建議。' },
    { id: 'work-case-close', title: '完成增補案件結案', description: '確認結果與紀錄完整後關閉案件。' },
  ],
  assignments: [
    { id: 'pa-1', workItemId: 'work-demand-confirmation', positionId: 'position-management-manager', relationType: 'primary-execute' },
    { id: 'pa-2', workItemId: 'work-demand-confirmation', positionId: 'position-general-manager', relationType: 'review' },
    { id: 'pa-3', workItemId: 'work-recruitment', positionId: 'position-hr-specialist', relationType: 'primary-execute' },
    { id: 'pa-4', workItemId: 'work-candidate-screening', positionId: 'position-hr-specialist', relationType: 'primary-execute' },
    { id: 'pa-5', workItemId: 'work-interview', positionId: 'position-hr-specialist', relationType: 'primary-execute' },
    { id: 'pa-6', workItemId: 'work-interview', positionId: 'position-management-manager', relationType: 'collaborate' },
    { id: 'pa-7', workItemId: 'work-offer-approval', positionId: 'position-general-manager', relationType: 'review' },
    { id: 'pa-8', workItemId: 'work-onboarding', positionId: 'position-hr-specialist', relationType: 'primary-execute' },
  ],
}

export function findPrototypeStep(state: ManagementMethodPrototypeState, stepId: string) {
  for (const stage of state.method.stages) {
    const step = stage.steps.find((candidate) => candidate.id === stepId)
    if (step) return { stage, step }
  }
  return null
}

export function getPrototypeStepNumber(state: ManagementMethodPrototypeState, stepId: string) {
  let index = 0
  for (const stage of state.method.stages) {
    for (const step of stage.steps) {
      index += 1
      if (step.id === stepId) return String(index).padStart(2, '0')
    }
  }
  return '--'
}

export function responsibilityTypeLabel(type: PrototypeResponsibilityType) {
  return RESPONSIBILITY_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type
}

export function togglePrototypeResponsibility(
  state: ManagementMethodPrototypeState,
  input: { workItemId: string; positionId: string; relationType: PrototypeResponsibilityType },
): ManagementMethodPrototypeState {
  const existing = state.assignments.find((assignment) =>
    assignment.workItemId === input.workItemId
      && assignment.positionId === input.positionId
      && assignment.relationType === input.relationType)
  if (existing) {
    return { ...state, assignments: state.assignments.filter((assignment) => assignment.id !== existing.id) }
  }

  const assignments = input.relationType === 'primary-execute'
    ? state.assignments.filter((assignment) => !(assignment.workItemId === input.workItemId && assignment.relationType === 'primary-execute'))
    : state.assignments

  return {
    ...state,
    assignments: [
      ...assignments,
      {
        id: `prototype-assignment-${input.workItemId}-${input.positionId}-${input.relationType}`,
        ...input,
      },
    ],
  }
}

export function movePrototypeStep(
  state: ManagementMethodPrototypeState,
  stageId: string,
  stepId: string,
  direction: -1 | 1,
): ManagementMethodPrototypeState {
  return {
    ...state,
    method: {
      ...state.method,
      stages: state.method.stages.map((stage) => {
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
  }
}
