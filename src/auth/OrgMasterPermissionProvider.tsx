import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuthSession } from './AuthGate'
import { GovernanceApiError, loadGovernanceSession } from '../governance/apiClient'
import { type OrgMasterPermissionCode, type OrgMasterPermissionProjectionV1 } from './permissionContract'
import { subscribeOrgMasterPermissionInvalidation, type PermissionInvalidationReason } from './permissionInvalidation'
import './OrgMasterPermissionProvider.css'

type State = { kind: 'loading' } | { kind: 'ready'; projection: OrgMasterPermissionProjectionV1 } | { kind: 'unauthenticated' } | { kind: 'unavailable' }
type ContextValue = { state: State; allows: (code: OrgMasterPermissionCode) => boolean; invalidate: (reason: PermissionInvalidationReason) => void; retry: () => void }
const Context = createContext<ContextValue | null>(null)

function SessionPermissionProvider({ principalId, active, failed, recoverSession, children }: { principalId: string; active: boolean; failed: boolean; recoverSession: () => Promise<void>; children: ReactNode }) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [permissionChanged, setPermissionChanged] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const generation = useRef(0)
  const flight = useRef<Promise<void> | null>(null)
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(false)
  const invalidate = useCallback((reason: PermissionInvalidationReason) => {
    generation.current++; controller.current?.abort(); flight.current = null
    if (reason === 'forbidden') setPermissionChanged(true)
    if (reason === 'unauthenticated') setState({ kind: 'unauthenticated' })
    else { setState({ kind: 'loading' }); setAttempt(value => value + 1) }
  }, [])
  // Establish the session fence before child passive effects dispatch requests.
  // Projection retry does not replace this subscription; logout does.
  useLayoutEffect(() => active ? subscribeOrgMasterPermissionInvalidation(invalidate) : undefined, [active, invalidate])
  useEffect(() => {
    mounted.current = true
    if (!active) {
      generation.current++; controller.current?.abort(); flight.current = null; setState({ kind: 'loading' })
      return () => { mounted.current = false }
    }
    const version = generation.current
    if (!flight.current) {
      setState({ kind: 'loading' })
      const request = new AbortController()
      controller.current = request
      const timeout = setTimeout(() => {
        if (mounted.current && version === generation.current) {
          generation.current++; request.abort(); flight.current = null; setState({ kind: 'unavailable' })
        }
      }, 10000)
      flight.current = (async () => {
        try {
          const { payload } = await loadGovernanceSession(principalId, request.signal)
          if (!mounted.current || version !== generation.current) return
          setState({ kind: 'ready', projection: payload })
        } catch (error) {
          if (mounted.current && version === generation.current) setState({ kind: error instanceof GovernanceApiError && error.status === 401 ? 'unauthenticated' : 'unavailable' })
        } finally {
          clearTimeout(timeout)
          if (version === generation.current) flight.current = null
        }
      })()
    }
    return () => {
      mounted.current = false
      queueMicrotask(() => {
        if (!mounted.current) { generation.current++; controller.current?.abort(); flight.current = null }
      })
    }
  }, [principalId, active, attempt, invalidate])
  const retry = useCallback(() => {
    if (failed) { void recoverSession(); return }
    setPermissionChanged(false); invalidate('permissions-changed')
  }, [failed, recoverSession, invalidate])
  const visibleState: State = active ? state : { kind: failed ? 'unavailable' : 'loading' }
  const value = useMemo(() => ({ state: visibleState, allows: (code: OrgMasterPermissionCode) => visibleState.kind === 'ready' && visibleState.projection.permissions[code] === true, invalidate, retry }), [visibleState, invalidate, retry])
  const feedback = visibleState.kind === 'unavailable'
    ? <>目前無法確認操作權限。<button type="button" onClick={retry}>重試權限</button></>
    : visibleState.kind === 'unauthenticated'
      ? <>登入已失效，請重新登入。<button type="button" onClick={() => window.location.reload()}>返回登入</button></>
      : permissionChanged ? <>操作權限可能已變更。請確認目前可用的操作後再繼續。</>
        : visibleState.kind === 'loading' ? <>正在確認操作權限…</> : null
  return <Context.Provider value={value}>
    {feedback ? <div className="orgmaster-permission-feedback" role={visibleState.kind === 'loading' && !permissionChanged ? 'status' : 'alert'}>{feedback}</div> : null}
    {visibleState.kind !== 'unauthenticated' && children}
  </Context.Provider>
}
export function OrgMasterPermissionProvider({ children }: { children: ReactNode }) {
  const auth = useAuthSession()
  if (!auth) throw new Error('OrgMasterPermissionProvider requires AuthGate')
  return <SessionPermissionProvider key={auth.session.user.principalId} principalId={auth.session.user.principalId} active={auth.phase === 'active'} failed={auth.phase === 'failed'} recoverSession={auth.recoverSession}>{children}</SessionPermissionProvider>
}
export function useOrgMasterPermissions() {
  const value = useContext(Context)
  if (!value) throw new Error('useOrgMasterPermissions requires OrgMasterPermissionProvider')
  return value
}
