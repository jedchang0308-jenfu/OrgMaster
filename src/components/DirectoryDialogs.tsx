import { useState, type FormEvent, type ReactNode } from 'react'
import { AlertTriangle, BriefcaseBusiness, Building2, Pencil, Plus, Trash2, UserRoundPlus } from 'lucide-react'
import { getDepartmentDescendantIds } from '../organization'
import type { Department, Employee } from '../types'

interface BaseDialogProps {
  onClose: () => void
}

interface AddEmployeeDialogProps extends BaseDialogProps {
  departments: Department[]
  onSubmit: (name: string, departmentIds: string[]) => void
}

export function AddEmployeeDialog({ departments, onClose, onSubmit }: AddEmployeeDialogProps) {
  const [name, setName] = useState('')
  const [departmentIds, setDepartmentIds] = useState<string[]>([])
  const [error, setError] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const normalizedName = name.trim()
    if (!normalizedName) {
      setError('請輸入員工姓名。')
      return
    }
    if (!departmentIds.every((departmentId) => departments.some((department) => department.id === departmentId))) {
      setError('請選擇所屬部門。')
      return
    }
    onSubmit(normalizedName, departmentIds)
  }

  return (
    <DialogBackdrop onClose={onClose}>
      <form className="dialog directory-dialog" role="dialog" aria-modal="true" aria-labelledby="add-employee-title" onSubmit={submit}>
        <div className="dialog__icon"><UserRoundPlus size={22} /></div>
        <div className="dialog__content">
          <h2 id="add-employee-title">新增員工</h2>
          <p>建立後會出現在員工清單，再拖曳或指派到職位。</p>
        </div>
        <div className="dialog__form">
          <label className="dialog-field">
            <span>員工姓名</span>
            <input
              autoFocus
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setError('')
              }}
              placeholder="例如：王小明"
            />
          </label>
          <DepartmentMultiSelect
            departments={departments}
            departmentIds={departmentIds}
            onChange={(nextDepartmentIds) => {
              setDepartmentIds(nextDepartmentIds)
              setError('')
            }}
          />
          {error && <p className="dialog-field__help is-error" role="alert">{error}</p>}
        </div>
        <div className="dialog__actions">
          <button type="button" className="button-secondary" onClick={onClose}>取消</button>
          <button type="submit" className="button-primary">
            <Plus size={16} />
            新增員工
          </button>
        </div>
      </form>
    </DialogBackdrop>
  )
}

interface AddDepartmentDialogProps extends BaseDialogProps {
  departments: Department[]
  onSubmit: (name: string, parentId: string | null) => void
}

export function AddDepartmentDialog({ departments, onClose, onSubmit }: AddDepartmentDialogProps) {
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const normalizedName = name.trim()
    if (!normalizedName) {
      setError('請輸入部門名稱。')
      return
    }
    const duplicate = departments.some((department) => (
      department.name.trim().toLocaleLowerCase('zh-Hant') === normalizedName.toLocaleLowerCase('zh-Hant')
    ))
    if (duplicate) {
      setError('已有相同名稱的部門。')
      return
    }
    onSubmit(normalizedName, parentId)
  }

  return (
    <DialogBackdrop onClose={onClose}>
      <form className="dialog directory-dialog" role="dialog" aria-modal="true" aria-labelledby="add-department-title" onSubmit={submit}>
        <div className="dialog__icon"><Building2 size={22} /></div>
        <div className="dialog__content">
          <h2 id="add-department-title">新增部門</h2>
          <p>部門建立後，新增員工時即可選擇。</p>
        </div>
        <div className="dialog__form">
          <label className="dialog-field">
            <span>上層部門</span>
            <select value={parentId ?? ''} onChange={(event) => {
              setParentId(event.target.value || null)
              setError('')
            }}>
              <option value="">無（根部門）</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </select>
          </label>
          <label className="dialog-field">
            <span>部門名稱</span>
            <input
              autoFocus
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setError('')
              }}
              placeholder="例如：行銷企劃"
            />
          </label>
          {error && <p className="dialog-field__help is-error" role="alert">{error}</p>}
        </div>
        <div className="dialog__actions">
          <button type="button" className="button-secondary" onClick={onClose}>取消</button>
          <button type="submit" className="button-primary"><Plus size={16} />新增部門</button>
        </div>
      </form>
    </DialogBackdrop>
  )
}

interface EditEmployeeDialogProps extends BaseDialogProps {
  employee: Employee
  departments: Department[]
  onSubmit: (name: string, departmentIds: string[]) => void
}

export function EditEmployeeDialog({ employee, departments, onClose, onSubmit }: EditEmployeeDialogProps) {
  const initialDepartmentIds = employee.departmentIds.filter((departmentId) => departments.some((department) => department.id === departmentId))
  const [name, setName] = useState(employee.name)
  const [departmentIds, setDepartmentIds] = useState(initialDepartmentIds)
  const [error, setError] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const normalizedName = name.trim()
    if (!normalizedName) {
      setError('請輸入員工姓名。')
      return
    }
    if (!departmentIds.every((departmentId) => departments.some((department) => department.id === departmentId))) {
      setError('請選擇所屬部門。')
      return
    }
    onSubmit(normalizedName, departmentIds)
  }

  return (
    <DialogBackdrop onClose={onClose}>
      <form className="dialog directory-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-employee-title" onSubmit={submit}>
        <div className="dialog__icon"><UserRoundPlus size={22} /></div>
        <div className="dialog__content">
          <h2 id="edit-employee-title">編輯員工</h2>
          <p>任職指派不會改變，儲存後立即同步清單與組織圖。</p>
        </div>
        <div className="dialog__form">
          <label className="dialog-field">
            <span>員工姓名</span>
            <input autoFocus value={name} onChange={(event) => {
              setName(event.target.value)
              setError('')
            }} />
          </label>
          <DepartmentMultiSelect
            departments={departments}
            departmentIds={departmentIds}
            onChange={(nextDepartmentIds) => {
              setDepartmentIds(nextDepartmentIds)
              setError('')
            }}
          />
          {error && <p className="dialog-field__help is-error" role="alert">{error}</p>}
        </div>
        <div className="dialog__actions">
          <button type="button" className="button-secondary" onClick={onClose}>取消</button>
          <button type="submit" className="button-primary"><Pencil size={15} />儲存變更</button>
        </div>
      </form>
    </DialogBackdrop>
  )
}

interface EditPositionDialogProps extends BaseDialogProps {
  title: string
  departmentId: string | null
  departments: Department[]
  onSubmit: (title: string, departmentId: string | null) => void
}

export function EditPositionDialog({ title, departmentId, departments, onClose, onSubmit }: EditPositionDialogProps) {
  const [nextTitle, setNextTitle] = useState(title)
  const [nextDepartmentId, setNextDepartmentId] = useState(departmentId ?? '')
  const [error, setError] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const normalizedTitle = nextTitle.trim()
    if (!normalizedTitle) {
      setError('請輸入職位名稱。')
      return
    }
    if (nextDepartmentId && !departments.some((department) => department.id === nextDepartmentId)) {
      setError('請選擇所屬部門。')
      return
    }
    onSubmit(normalizedTitle, nextDepartmentId || null)
  }

  return (
    <DialogBackdrop onClose={onClose}>
      <form className="dialog directory-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-position-title" onSubmit={submit}>
        <div className="dialog__icon"><BriefcaseBusiness size={22} /></div>
        <div className="dialog__content">
          <h2 id="edit-position-title">編輯職位</h2>
          <p>儲存後會同步組織圖、清單與搜尋結果。</p>
        </div>
        <div className="dialog__form">
          <label className="dialog-field">
            <span>職位名稱</span>
            <input autoFocus value={nextTitle} onChange={(event) => {
              setNextTitle(event.target.value)
              setError('')
            }} />
          </label>
          <label className="dialog-field">
            <span>所屬部門</span>
            <select value={nextDepartmentId} onChange={(event) => {
              setNextDepartmentId(event.target.value)
              setError('')
            }}>
              <option value="">未設定部門</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </select>
          </label>
          {departments.length === 0 && <p className="dialog-field__help is-warning">目前沒有可選部門；可先保存為未設定部門，之後再重新指定。</p>}
          {error && <p className="dialog-field__help is-error" role="alert">{error}</p>}
        </div>
        <div className="dialog__actions">
          <button type="button" className="button-secondary" onClick={onClose}>取消</button>
          <button type="submit" className="button-primary"><Pencil size={15} />儲存變更</button>
        </div>
      </form>
    </DialogBackdrop>
  )
}

interface EditDepartmentDialogProps extends BaseDialogProps {
  department: Department
  departments: Department[]
  onSubmit: (name: string, parentId: string | null) => void
}

export function EditDepartmentDialog({ department, departments, onClose, onSubmit }: EditDepartmentDialogProps) {
  const [name, setName] = useState(department.name)
  const [parentId, setParentId] = useState<string | null>(department.parentId)
  const [error, setError] = useState('')
  const descendantIds = getDepartmentDescendantIds(departments, department.id)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const normalizedName = name.trim()
    if (!normalizedName) {
      setError('請輸入部門名稱。')
      return
    }
    const normalizedKey = normalizedName.toLocaleLowerCase('zh-Hant')
    const duplicate = departments.some((item) => (
      item.id !== department.id
      && item.name.trim().toLocaleLowerCase('zh-Hant') === normalizedKey
    ))
    if (duplicate) {
      setError('已有相同名稱的部門。')
      return
    }
    if (parentId === department.id || (parentId && descendantIds.has(parentId))) {
      setError('不可將部門移到自己或自己的子部門底下。')
      return
    }
    onSubmit(normalizedName, parentId)
  }

  return (
    <DialogBackdrop onClose={onClose}>
      <form className="dialog directory-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-department-title" onSubmit={submit}>
        <div className="dialog__icon"><Building2 size={22} /></div>
        <div className="dialog__content">
          <h2 id="edit-department-title">編輯部門</h2>
          <p>改名後會同步更新所有該部門員工。</p>
        </div>
        <div className="dialog__form">
          <label className="dialog-field">
            <span>上層部門</span>
            <select value={parentId ?? ''} onChange={(event) => {
              setParentId(event.target.value || null)
              setError('')
            }}>
              <option value="">無（根部門）</option>
              {departments
                .filter((item) => item.id !== department.id && !descendantIds.has(item.id))
                .map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="dialog-field">
            <span>部門名稱</span>
            <input autoFocus value={name} onChange={(event) => {
              setName(event.target.value)
              setError('')
            }} />
          </label>
          {error && <p className="dialog-field__help is-error" role="alert">{error}</p>}
        </div>
        <div className="dialog__actions">
          <button type="button" className="button-secondary" onClick={onClose}>取消</button>
          <button type="submit" className="button-primary"><Pencil size={15} />儲存變更</button>
        </div>
      </form>
    </DialogBackdrop>
  )
}

interface DeleteEmployeeDialogProps extends BaseDialogProps {
  employee: Employee
  assignmentCount: number
  onConfirm: () => void
}

export function DeleteEmployeeDialog({ employee, assignmentCount, onClose, onConfirm }: DeleteEmployeeDialogProps) {
  return (
    <DialogBackdrop onClose={onClose}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="delete-employee-title">
        <div className="dialog__icon dialog__icon--danger"><AlertTriangle size={22} /></div>
        <div className="dialog__content">
          <h2 id="delete-employee-title">刪除「{employee.name}」？</h2>
          <p>
            {assignmentCount > 0
              ? `此員工目前身兼 ${assignmentCount} 個職位；刪除後會同步解除所有指派。`
              : '此員工尚未指派職位。'}
            可使用 Ctrl+Z 復原。
          </p>
        </div>
        <div className="dialog__actions">
          <button type="button" className="button-secondary" onClick={onClose}>取消</button>
          <button type="button" className="button-danger" onClick={onConfirm}><Trash2 size={16} />刪除員工</button>
        </div>
      </section>
    </DialogBackdrop>
  )
}

interface DeleteDepartmentDialogProps extends BaseDialogProps {
  department: Department
  departments: Department[]
  employeeCount: number
  positionCount: number
  issue?: { message: string } | null
  onConfirm: (replacementDepartmentId?: string) => void
}

export function DeleteDepartmentDialog({
  department,
  departments,
  employeeCount,
  positionCount,
  issue,
  onClose,
  onConfirm,
}: DeleteDepartmentDialogProps) {
  const descendants = getDepartmentDescendantIds(departments, department.id)
  const replacements = departments.filter((item) => item.id !== department.id && !descendants.has(item.id))
  const [replacementDepartmentId, setReplacementDepartmentId] = useState(replacements[0]?.id ?? '')
  const hasDependents = employeeCount > 0 || positionCount > 0
  const hasReplacement = replacements.length > 0

  return (
    <DialogBackdrop onClose={onClose}>
      <form
        className="dialog directory-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-department-title"
        onSubmit={(event) => {
          event.preventDefault()
          onConfirm(hasDependents && hasReplacement ? replacementDepartmentId : undefined)
        }}
      >
        <div className="dialog__icon dialog__icon--danger"><AlertTriangle size={22} /></div>
        <div className="dialog__content">
          <h2 id="delete-department-title">刪除「{department.name}」？</h2>
          <p>
            {hasDependents
              ? `此部門仍有 ${employeeCount} 位員工與 ${positionCount} 個職位；可先轉移，或刪除後暫列為未設定部門。`
              : '此部門沒有員工或職位，刪除後可使用 Ctrl+Z 復原。'}
          </p>
          {issue && <p className="dialog-field__help is-error" role="alert">{issue.message}</p>}
        </div>
        {hasDependents && (
          <div className="dialog__form">
            {!hasReplacement ? (
              <p className="dialog-field__help is-warning" role="status">刪除後，這些員工與職位會暫列為未設定部門，之後可再重新指定。</p>
            ) : (
              <label className="dialog-field">
                <span>員工轉移至</span>
                <select autoFocus value={replacementDepartmentId} onChange={(event) => setReplacementDepartmentId(event.target.value)}>
                  {replacements.map((replacement) => (
                    <option key={replacement.id} value={replacement.id}>{replacement.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
        <div className="dialog__actions">
          <button type="button" className="button-secondary" onClick={onClose}>取消</button>
          <button type="submit" className="button-danger">
            <Trash2 size={16} />
            {hasDependents && hasReplacement ? '轉移並刪除' : '刪除部門'}
          </button>
        </div>
      </form>
    </DialogBackdrop>
  )
}

function DepartmentMultiSelect({
  departments,
  departmentIds,
  onChange,
}: {
  departments: Department[]
  departmentIds: string[]
  onChange: (departmentIds: string[]) => void
}) {
  const toggleDepartment = (departmentId: string) => {
    onChange(
      departmentIds.includes(departmentId)
        ? departmentIds.filter((id) => id !== departmentId)
        : [...departmentIds, departmentId],
    )
  }

  return (
    <fieldset className="dialog-field dialog-field--multi">
      <legend>
        <span>所屬部門</span>
        <small>{departmentIds.length > 0 ? `已選 ${departmentIds.length} 個` : '未設定'}</small>
      </legend>
      {departments.length > 0 ? (
        <div className="dialog-multi-options">
          {departments.map((department) => (
            <label className="dialog-multi-option" key={department.id}>
              <input
                type="checkbox"
                checked={departmentIds.includes(department.id)}
                onChange={() => toggleDepartment(department.id)}
              />
              <span>{department.name}</span>
            </label>
          ))}
        </div>
      ) : (
        <p className="dialog-field__help is-warning">目前沒有可選部門；可先保存為未設定部門，之後再重新指定。</p>
      )}
      <p className="dialog-field__help">可複選；未勾選表示未設定部門。</p>
    </fieldset>
  )
}

function DialogBackdrop({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="dialog-backdrop__surface" onMouseDown={(event) => event.stopPropagation()}>{children}</div>
    </div>
  )
}
