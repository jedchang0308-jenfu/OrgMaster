export type PermissionInvalidationReason = 'unauthenticated' | 'forbidden' | 'permissions-changed'
const listeners = new Set<(reason: PermissionInvalidationReason) => void>()
export function invalidateOrgMasterPermissions(reason: PermissionInvalidationReason) { listeners.forEach(listener => listener(reason)) }
export function subscribeOrgMasterPermissionInvalidation(listener: (reason: PermissionInvalidationReason) => void) {
  listeners.add(listener); return () => { listeners.delete(listener) }
}
export async function orgMasterPermissionFetch(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init)
  if (response.status === 401) invalidateOrgMasterPermissions('unauthenticated')
  else if (response.status === 403) invalidateOrgMasterPermissions('forbidden')
  return response
}
