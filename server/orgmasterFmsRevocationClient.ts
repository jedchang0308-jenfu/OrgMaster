import { parseFmsRevocationReceipt } from '../scripts/lib/orgmaster-fms-revocation-wire.mts'
import { createOrgmasterRevocationTransport, type RevocationTransportDependencies } from './orgmasterRevocationTransport'

export function createOrgmasterFmsRevocationClient(dependencies: RevocationTransportDependencies = {}) {
  const { dispatch, readback } = createOrgmasterRevocationTransport({
    path: '/api/internal/fms-session-revocation/v1',
    invalidReceipt: 'FMS_REVOCATION_RECEIPT_INVALID',
    unavailable: 'FMS_REVOCATION_DISPATCH_UNAVAILABLE',
    conflict: 'FMS_REVOCATION_EVENT_CONFLICT',
    parseReceipt: parseFmsRevocationReceipt,
  }, dependencies)
  return { dispatch, readback }
}
