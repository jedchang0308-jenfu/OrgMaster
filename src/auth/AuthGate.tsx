import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { AuthApiError, exchangeFirebaseToken, getAuthMode, getCurrentSession, getDevelopmentAuthMode, loginDevelopmentProfile, logoutCurrentSession, type AuthMode, type AuthSessionView, type DevelopmentAuthMode, type DevelopmentAuthProfileView } from './authApiClient'
import { clearFirebaseClientSession, getFirebaseIdToken } from './firebaseClient'

export interface AuthSessionContextValue {
  session: AuthSessionView
  phase: 'active' | 'processing' | 'failed'
  logout: () => Promise<void>
}

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null)

export function useAuthSession() {
  return useContext(AuthSessionContext)
}

type GateState =
  | { kind: 'loading' }
  | { kind: 'authenticated'; session: AuthSessionView; mode: AuthMode | null }
  | { kind: 'login'; mode: AuthMode; message?: string }
  | { kind: 'development-login'; mode: DevelopmentAuthMode; message?: string }
  | { kind: 'blocked'; code: string; correlationId?: string }
  | { kind: 'unavailable'; correlationId?: string }
  | { kind: 'logout-processing'; session: AuthSessionView; mode: AuthMode | null }
  | { kind: 'logout-failed'; session: AuthSessionView; mode: AuthMode | null }
  | { kind: 'logout-complete' }

function blockedState(error: unknown): GateState {
  if (!(error instanceof AuthApiError)) return { kind: 'unavailable' }
  if (error.code === 'principal_not_active' || error.code === 'principal_ambiguous') return { kind: 'blocked', code: error.code, correlationId: error.correlationId }
  if (error.status === 503 || error.code === 'auth_contract_mismatch') return { kind: 'unavailable', correlationId: error.correlationId }
  return { kind: 'unavailable', correlationId: error.correlationId }
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>({ kind: 'loading' })
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [busyProfileId, setBusyProfileId] = useState<DevelopmentAuthProfileView['id'] | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      if (import.meta.env.DEV) {
        try {
          const developmentMode = await getDevelopmentAuthMode()
          if (!active) return
          if (developmentMode) {
            setState(developmentMode.session
              ? { kind: 'authenticated', session: developmentMode.session, mode: null }
              : { kind: 'development-login', mode: developmentMode })
            return
          }
        } catch {
          // Production runtimes intentionally do not expose development profiles.
        }
      }
      try {
        const session = await getCurrentSession()
        if (active) setState({ kind: 'authenticated', session, mode: null })
      } catch (error) {
        if (!active) return
        if (error instanceof AuthApiError && error.status === 401) {
          try {
            const mode = await getAuthMode()
            if (active) setState({ kind: 'login', mode, message: error.code === 'auth_epoch_stale' ? '登入已失效，請重新登入。' : undefined })
          } catch (modeError) {
            if (active) setState(blockedState(modeError))
          }
          return
        }
        setState(blockedState(error))
      }
    })()
    return () => { active = false }
  }, [])

  async function submitLogin(event: FormEvent) {
    event.preventDefault()
    if (state.kind !== 'login' || busy) return
    setBusy(true)
    try {
      const idToken = await getFirebaseIdToken(state.mode.firebase, email.trim(), password)
      const session = await exchangeFirebaseToken(idToken)
      setPassword('')
      setState({ kind: 'authenticated', session, mode: state.mode })
    } catch (error) {
      if (error instanceof AuthApiError && (error.code === 'principal_not_active' || error.code === 'principal_ambiguous')) setState(blockedState(error))
      else setState({ kind: 'login', mode: state.mode, message: '登入失敗，請確認帳號密碼後再試一次。' })
    } finally {
      setBusy(false)
    }
  }

  async function submitDevelopmentLogin(profileId: DevelopmentAuthProfileView['id']) {
    if (state.kind !== 'development-login' || busy) return
    setBusy(true)
    setBusyProfileId(profileId)
    try {
      const session = await loginDevelopmentProfile(profileId)
      setState({ kind: 'authenticated', session, mode: null })
    } catch {
      setState({ kind: 'development-login', mode: state.mode, message: '無法建立地端工作階段，請再試一次。' })
    } finally {
      setBusy(false)
      setBusyProfileId(null)
    }
  }

  async function logout() {
    if (state.kind !== 'authenticated' && state.kind !== 'logout-failed') return
    const previous = state
    setState({ kind: 'logout-processing', session: previous.session, mode: previous.mode })
    try {
      await logoutCurrentSession()
      if (previous.mode) await clearFirebaseClientSession(previous.mode.firebase).catch(() => undefined)
      if (previous.session.developmentProfile) {
        try {
          setState({ kind: 'development-login', mode: await getDevelopmentAuthMode() })
        } catch {
          setState({ kind: 'logout-complete' })
        }
      } else setState({ kind: 'logout-complete' })
    } catch {
      setState({ kind: 'logout-failed', session: previous.session, mode: previous.mode })
    }
  }

  if (state.kind === 'authenticated' || state.kind === 'logout-processing' || state.kind === 'logout-failed') {
    return <AuthSessionContext.Provider value={{
      session: state.session,
      phase: state.kind === 'logout-processing' ? 'processing' : state.kind === 'logout-failed' ? 'failed' : 'active',
      logout,
    }}>
      {children}
    </AuthSessionContext.Provider>
  }

  if (state.kind === 'loading') return <main className="auth-gate" aria-busy="true"><p>正在確認登入狀態…</p></main>
  if (state.kind === 'logout-complete') return <main className="auth-gate"><h1>已安全登出</h1><p>重新整理頁面即可再次登入。</p><button type="button" onClick={() => window.location.reload()}>返回登入</button></main>
  if (state.kind === 'blocked') return <main className="auth-gate"><h1>目前無法進入 OrgMaster</h1><p>{state.code === 'principal_ambiguous' ? '帳號對應存在衝突，請聯絡管理員處理。' : '帳號尚未連結有效員工，請聯絡管理員。'}</p>{state.correlationId && <small>追蹤碼：{state.correlationId}</small>}</main>
  if (state.kind === 'unavailable') return <main className="auth-gate"><h1>登入服務暫時無法使用</h1><p>系統採安全關閉，尚未載入任何組織資料。請稍後再試。</p>{state.correlationId && <small>追蹤碼：{state.correlationId}</small>}</main>
  if (state.kind === 'development-login') return <main className="auth-gate">
    <section className="auth-login auth-login--development" aria-labelledby="development-login-title">
      <div><p className="auth-login__eyebrow">地端開發環境</p><h1 id="development-login-title">選擇測試角色</h1></div>
      {state.message && <p className="auth-login__error" role="alert">{state.message}</p>}
      <div className="auth-development-profiles">
        {state.mode.profiles.map((profile) => <button
          key={profile.id}
          type="button"
          className="auth-development-profile"
          disabled={busy}
          onClick={() => { void submitDevelopmentLogin(profile.id) }}
        >
          <strong>{busyProfileId === profile.id ? '登入中…' : profile.roleName}</strong>
          <span>{profile.employeeName}</span>
          <small>{profile.description}</small>
        </button>)}
      </div>
    </section>
  </main>
  return <main className="auth-gate">
    <form className="auth-login" onSubmit={(event) => { void submitLogin(event) }}>
      <div><p className="auth-login__eyebrow">鉦富管理平台</p><h1>登入 OrgMaster</h1><p>使用公司統一帳號繼續。</p></div>
      {state.message && <p className="auth-login__error" role="alert">{state.message}</p>}
      <label>電子郵件<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <label>密碼<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      <button type="submit" disabled={busy}>{busy ? '登入中…' : '登入'}</button>
    </form>
  </main>
}
