import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type { OrgDirectoryState } from '../../types'
import { buildDutyReadRows } from '../../managementMethods/dutyReadAdapter'

export function ManagementMethodDutyDrawer({ state, onClose }: { state: OrgDirectoryState; onClose: () => void }) { const [query, setQuery] = useState(''); const rows = useMemo(() => buildDutyReadRows(state, query), [query, state]); return <aside className="management-method-duty-drawer" aria-label="職掌對照"><header><strong>職掌對照</strong><button type="button" aria-label="關閉" onClick={onClose}><X size={16} /></button></header><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋職掌或職位" />{rows.length ? <div className="management-method-duty-drawer__rows">{rows.map((row) => <div key={`${row.dutyId}-${row.positionId}`}><strong>{row.title}</strong><span>{row.relationType} · {row.positionTitle}</span><p>{row.description || '未提供說明'}</p></div>)}</div> : <p>目前沒有符合的職掌對照。</p>}</aside> }
