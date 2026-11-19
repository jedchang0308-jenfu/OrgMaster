import { parsePdmRevocationReceipt, pdmRevocationCommand } from '../scripts/lib/orgmaster-pdm-revocation-wire.mts'
import { createOrgmasterRevocationTransport, type RevocationTransportDependencies } from './orgmasterRevocationTransport'

export type { OrgmasterPdmRevocationOperation, OrgmasterPdmRevocationPhase, PdmRevocationReceipt } from '../scripts/lib/orgmaster-pdm-revocation-wire.mts'

const PATH = '/api/internal/pdm-session-revocation/v1'
const INVALID = 'PDM_REVOCATION_RECEIPT_INVALID'
const UNAVAILABLE = 'PDM_REVOCATION_DISPATCH_UNAVAILABLE'

export { pdmRevocationCommand }
export function createOrgmasterPdmRevocationClient(dependencies: RevocationTransportDependencies = {}) {
  const { post, readBoundedJson, readback, dispatch } = createOrgmasterRevocationTransport({
    path: PATH, invalidReceipt: INVALID, unavailable: UNAVAILABLE, conflict: 'PDM_REVOCATION_EVENT_CONFLICT',
    parseReceipt: parsePdmRevocationReceipt,
  }, dependencies)
  return {
    async reconcileGlobalLogout() {
      const response = await post(PATH + '/reconcile')
      if (response.status === 404) {
        await response.body?.cancel()
        return 'route-absent' as const
      }
      const body = await readBoundedJson(response)
      if (body && typeof body === 'object') {
        if (response.status === 503 && 'code' in body && body.code === 'pdm_revocation_relay_disabled') {
          return 'relay-disabled' as const
        }
        if (response.status === 200 && 'selected' in body && 'completed' in body &&
            typeof body.selected === 'number' && Number.isSafeInteger(body.selected) &&
            body.selected >= 0 && body.selected === body.completed) return 'ready' as const
      }
      throw new Error(UNAVAILABLE)
    },
    readback,
    dispatch,
  }
}
