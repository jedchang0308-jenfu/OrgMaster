import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Ellipsis } from 'lucide-react'
import { useAuthSession } from '../auth/AuthGate'
import { checkAppUpdate } from '../appUpdate'
import type { Employee } from '../types'

type UpdateState = 'idle' | 'checking' | 'current' | 'available' | 'failed'

export function AccountMenu({ employees, reloadBlocked }: { employees: Employee[]; reloadBlocked: boolean }) {
  const auth = useAuthSession()
  const [open, setOpen] = useState(false)
  const [update, setUpdate] = useState<UpdateState>('idle')
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const checkingRef = useRef(false)
  const mountedRef = useRef(true)
  const panelId = useId()
  const profile = auth?.session.developmentProfile
  const name = profile?.employeeName ?? employees.find((employee) => employee.id === auth?.session.user.employeeId)?.name ?? '目前使用者'
  const email = auth?.session.user.email?.trim() || null

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setOpen(false)
    }
    const closeEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
    }
    window.addEventListener('pointerdown', closeOutside)
    window.addEventListener('keydown', closeEscape, true)
    return () => {
      window.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('keydown', closeEscape, true)
    }
  }, [open])

  function navigateMenu(event: KeyboardEvent<HTMLDivElement>) {
    const buttons = [...(panelRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    let next: number
    if (event.key === 'ArrowDown') next = (index + 1) % buttons.length
    else if (event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = buttons.length - 1
    else return
    event.preventDefault()
    buttons[next]?.focus()
  }

  async function checkUpdate() {
    if (checkingRef.current) return
    checkingRef.current = true
    setUpdate('checking')
    try {
      const available = await checkAppUpdate()
      if (mountedRef.current) setUpdate(available ? 'available' : 'current')
    } catch {
      if (mountedRef.current) setUpdate('failed')
    } finally { checkingRef.current = false }
  }

  return <div className="account-menu" ref={menuRef} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }}>
    <button ref={triggerRef} type="button" className="icon-button account-menu__trigger" aria-label="更多選項"
      title="更多選項" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? panelId : undefined}
      onClick={() => setOpen((value) => !value)} onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true) }
      }}><Ellipsis size={21} aria-hidden="true" /></button>
    {open && <div ref={panelRef} id={panelId} className="account-menu__panel" role="menu" aria-label="帳號與更新" onKeyDown={navigateMenu}>
      <button type="button" role="menuitem" className="account-menu__update" aria-disabled={update === 'checking' || (update === 'available' && reloadBlocked)} onClick={() => {
        if (update === 'checking') return
        if (update === 'available') { if (!reloadBlocked) window.location.reload(); return }
        void checkUpdate()
      }}>{update === 'checking' ? '正在檢查更新…' : update === 'available' ? '更新並重新載入' : '立即檢查更新'}</button>
      {update !== 'idle' && update !== 'checking' && <p className={`account-menu__feedback${update === 'failed' ? ' is-error' : ''}`} role={update === 'failed' ? 'alert' : 'status'}>
        {update === 'current' ? '目前已是最新版本' : update === 'failed' ? '無法檢查更新，請再試一次' : reloadBlocked ? '請先儲存變更，再更新' : '有新版本可用'}
      </p>}
      {auth && <>
        <div className="account-menu__separator" role="separator" />
        <div className="account-menu__account">
          <div className="account-menu__identity"><strong>{name}</strong><span>{email ?? (profile ? profile.roleName : '未提供信箱')}</span></div>
          <button type="button" role="menuitem" className="account-menu__logout" aria-disabled={auth.phase === 'processing'} onClick={() => { if (auth.phase !== 'processing') void auth.logout() }}>
            {auth.phase === 'processing' ? '登出中…' : auth.phase === 'failed' ? '重試登出' : profile ? '切換角色' : '登出'}
          </button>
        </div>
        {auth.phase === 'failed' && <p className="account-menu__feedback is-error" role="alert">登出失敗，請再試一次</p>}
      </>}
    </div>}
  </div>
}
