import { ApplicationEntitlementError } from './applicationEntitlementCommon'
import { publicationSnapshotHash } from '../src/governance/commands'

export type FmsCatalogIntent = {
  schemaVersion: 'fms.governance-intent.v1'
  intentId: string
  operationId: string
  principalId: string
  applicationId: 'financial-management-system'
  companyId: 'jenfu-machinery'
  catalogVersion: string
  artifactRef: string
  contentSha256: string
  artifactSha256: string
  previewHash: string
  expectedGovernanceRevision: string
  expectedAssignmentVersion: string
  expectedCatalogBindingRevision: string
  expectedGrantRevision: string
  expiresAt: string
  registeredReturnRouteId: 'roles'
  inputHash: string
}
export type FmsCatalogCheckpoint = {
  schemaVersion: 'fms.governance-checkpoint.v1'
  source: 'formal' | 'local_test'
  employeeId: string
  issuedAt: string
  intent: FmsCatalogIntent
  receipt: null
}
export type CatalogActivationExpected = {
  governanceRevision: string
  assignmentVersion: string
  catalogBindingRevision: string
  grantRevision: string
}
type BoundRequest = { operationId: string; principalId: string; employeeId: string; catalogVersion: string;
  contentSha256: string; artifactSha256: string; previewHash: string; expected: CatalogActivationExpected }
const FIELDS = ['schemaVersion', 'intentId', 'operationId', 'principalId', 'applicationId', 'companyId', 'catalogVersion',
  'artifactRef', 'contentSha256', 'artifactSha256', 'previewHash', 'expectedGovernanceRevision', 'expectedAssignmentVersion',
  'expectedCatalogBindingRevision', 'expectedGrantRevision', 'expiresAt', 'registeredReturnRouteId', 'inputHash']
const SHA = /^[a-f0-9]{64}$/u
export function readFinancialCatalogPeerOrigin(environment: NodeJS.ProcessEnv = process.env): string | null {
  const configured = environment.ORGMASTER_FMS_PUBLIC_ORIGIN
  if (!configured) return null
  try {
    const url = new URL(configured), source = readFinancialCatalogHandoffSource(environment)
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    return configured === url.origin && !url.username && !url.password &&
      (source === 'formal' && url.protocol === 'https:' || source === 'local_test' && url.protocol === 'http:' && loopback) ? url.origin : null
  } catch { return null }
}
const fail = (): never => { throw new ApplicationEntitlementError('INVALID_COMMAND') }
function record(value: unknown, keys: string[]) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length !== keys.length ||
    keys.some(key => !Object.hasOwn(value, key))) return fail()
  return value as Record<string, unknown>
}
function text(value: unknown, limit = 512): value is string { return typeof value === 'string' && !!value.trim() && value.length <= limit }
function instant(value: unknown): value is string { return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value }

/** Source is selected by the server configuration, never the browser's checkpoint. */
export function readFinancialCatalogHandoffSource(environment: NodeJS.ProcessEnv = process.env): FmsCatalogCheckpoint['source'] | undefined {
  if (environment.NODE_ENV === 'development' && environment.JENFU_LOCAL_SANDBOX_ENABLED === '1') return 'local_test'
  const configured = environment.ORGMASTER_FMS_GOVERNANCE_SOURCE
  if (configured === 'formal') return 'formal'
  if (configured === 'local_test' && environment.K_SERVICE !== 'orgmaster-prod') return 'local_test'
  return undefined
}

/** Accepted FMS v1 wire candidate. No issuer record is inferred or manufactured here. */
export function verifyFinancialCatalogCheckpoint(value: unknown, bound: BoundRequest,
  source: FmsCatalogCheckpoint['source'] | undefined, nowMs = Date.now(), requireUnexpired = true): FmsCatalogCheckpoint {
  if (!source) throw new ApplicationEntitlementError('FINANCIAL_CATALOG_UNAVAILABLE')
  const checkpoint = record(value, ['schemaVersion', 'source', 'employeeId', 'issuedAt', 'intent', 'receipt'])
  const intent = record(checkpoint.intent, FIELDS)
  if (checkpoint.schemaVersion !== 'fms.governance-checkpoint.v1' || checkpoint.source !== source ||
    checkpoint.employeeId !== bound.employeeId || checkpoint.receipt !== null || !instant(checkpoint.issuedAt) ||
    intent.schemaVersion !== 'fms.governance-intent.v1' || intent.applicationId !== 'financial-management-system' ||
    intent.companyId !== 'jenfu-machinery' || intent.registeredReturnRouteId !== 'roles' || !instant(intent.expiresAt)) fail()
  for (const key of ['intentId', 'principalId', 'catalogVersion', 'expectedGovernanceRevision', 'expectedAssignmentVersion', 'expectedCatalogBindingRevision', 'expectedGrantRevision'])
    if (!text(intent[key])) fail()
  if (!text(intent.operationId, 128) || !text(intent.artifactRef, 2048)) fail()
  for (const key of ['contentSha256', 'artifactSha256', 'previewHash', 'inputHash'])
    if (typeof intent[key] !== 'string' || !SHA.test(intent[key])) fail()
  const expected = { operationId: bound.operationId, principalId: bound.principalId, catalogVersion: bound.catalogVersion,
    contentSha256: bound.contentSha256, artifactSha256: bound.artifactSha256, previewHash: bound.previewHash,
    expectedGovernanceRevision: bound.expected.governanceRevision, expectedAssignmentVersion: bound.expected.assignmentVersion,
    expectedCatalogBindingRevision: bound.expected.catalogBindingRevision, expectedGrantRevision: bound.expected.grantRevision }
  if (Object.entries(expected).some(([key, expectedValue]) => intent[key] !== expectedValue)) throw new ApplicationEntitlementError('CATALOG_BINDING_CONFLICT')
  const { inputHash, ...hashInput } = intent
  if (publicationSnapshotHash(hashInput) !== inputHash) throw new ApplicationEntitlementError('REQUEST_HASH_CONFLICT')
  const issuedAt = Date.parse(checkpoint.issuedAt as string), expiresAt = Date.parse(intent.expiresAt as string)
  if (expiresAt - issuedAt !== 10 * 60 * 1000 || issuedAt > nowMs ||
    requireUnexpired && expiresAt <= nowMs) throw new ApplicationEntitlementError('PREVIEW_HASH_CONFLICT')
  return JSON.parse(JSON.stringify(checkpoint)) as FmsCatalogCheckpoint
}
