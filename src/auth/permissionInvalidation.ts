export type PermissionInvalidationReason = 'unauthenticated' | 'forbidden' | 'permissions-changed'
type Subscription = { notify: (reason: PermissionInvalidationReason) => void }
const listeners = new Set<Subscription>()
/** Bind asynchronous results to the session subscriptions present when a request starts. */
export function captureOrgMasterPermissionInvalidation() {
  const recipients = [...listeners]
  return (reason: PermissionInvalidationReason) => {
    for (const recipient of recipients) if (listeners.has(recipient)) recipient.notify(reason)
  }
}
export function invalidateOrgMasterPermissions(reason: PermissionInvalidationReason) { captureOrgMasterPermissionInvalidation()(reason) }
export function subscribeOrgMasterPermissionInvalidation(listener: (reason: PermissionInvalidationReason) => void) {
  const subscription = { notify: listener }
  listeners.add(subscription); return () => { listeners.delete(subscription) }
}
export async function orgMasterPermissionFetch(input: RequestInfo | URL, init?: RequestInit) {
  const invalidate = captureOrgMasterPermissionInvalidation()
  const response = await fetch(input, init)
  if (response.status === 401) invalidate('unauthenticated')
  else if (response.status === 403) invalidate('forbidden')
  return response
}
