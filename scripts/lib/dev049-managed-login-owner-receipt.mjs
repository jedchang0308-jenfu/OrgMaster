import crypto from 'node:crypto'

export const DEV049_OWNER_RECEIPT_VERSION = 'jenfu.managed-login.owner-receipt.v1'

export function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

export function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex') }

function fail(field) { throw new Error(`DEV049_OWNER_RECEIPT_INVALID:${field}`) }
function hash(value, field) { if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) fail(field) }

export function buildDev049OwnerReceipt(input) {
  const controlledFiles = [...input.controlledFiles].sort((a, b) => a.path.localeCompare(b.path))
  const controlledTreeSha256 = sha256(canonicalize(controlledFiles))
  const core = {
    contractVersion: DEV049_OWNER_RECEIPT_VERSION,
    devId: 'DEV-049',
    ownerApplicationId: 'orgmaster',
    evidenceScope: 'LOCAL_ISOLATED',
    status: 'LOCAL_OWNER_IMPLEMENTATION_PASS',
    producedAt: input.producedAt,
    source: { branch: input.branch, revision: input.revision, controlledTreeSha256, controlledFiles },
    endpoint: { method: 'POST', path: '/api/internal/managed-login/v1', contractVersion: 'jenfu.managed-login.v1', callerAuthentication: 'google-service-identity-email-and-subject', actions: ['resolveAlias', 'verifyIdentity'] },
    database: { migration: 'db/migrations/013_dev049_existing_google_primary_account_link.sql', migrationSha256: input.migrationSha256, ownerSchemas: ['orgmaster_core', 'orgmaster_contract'], directPlatformCoreAccess: false },
    evidence: [...input.evidence].sort((a, b) => a.kind.localeCompare(b.kind)),
    guarantees: { firebaseRevocationCheck: true, uniqueGoogleProviderId: true, directoryStableKeyRead: true, ownerCas: true, idempotentReceipt: true, lifecycleBarrier: true, providerWrites: 0, productionWrites: 0 },
    dataSafety: { containsCredentials: false, containsTokens: false, containsDirectIdentifiers: false },
    limitation: 'Local isolated owner implementation evidence only. It is not a provider, target, staging, production, traffic, or activation receipt.',
  }
  return assertDev049OwnerReceipt({ ...core, receiptSha256: sha256(canonicalize(core)) })
}

export function assertDev049OwnerReceipt(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('$')
  if (value.contractVersion !== DEV049_OWNER_RECEIPT_VERSION || value.devId !== 'DEV-049' || value.ownerApplicationId !== 'orgmaster'
    || value.evidenceScope !== 'LOCAL_ISOLATED' || value.status !== 'LOCAL_OWNER_IMPLEMENTATION_PASS') fail('identity')
  if (typeof value.producedAt !== 'string' || new Date(value.producedAt).toISOString() !== value.producedAt) fail('producedAt')
  if (!value.source || typeof value.source.branch !== 'string' || !value.source.branch || typeof value.source.revision !== 'string' || !/^[0-9a-f]{40}$/u.test(value.source.revision)) fail('source')
  hash(value.source.controlledTreeSha256, 'source.controlledTreeSha256')
  if (!Array.isArray(value.source.controlledFiles) || value.source.controlledFiles.length < 10) fail('source.controlledFiles')
  for (const item of value.source.controlledFiles) { if (!item || typeof item.path !== 'string' || item.path.includes('..')) fail('source.controlledFiles.path'); hash(item.sha256, 'source.controlledFiles.sha256') }
  if (sha256(canonicalize(value.source.controlledFiles)) !== value.source.controlledTreeSha256) fail('source.controlledTreeSha256')
  if (value.endpoint?.method !== 'POST' || value.endpoint?.path !== '/api/internal/managed-login/v1' || value.endpoint?.contractVersion !== 'jenfu.managed-login.v1') fail('endpoint')
  hash(value.database?.migrationSha256, 'database.migrationSha256')
  if (value.database?.directPlatformCoreAccess !== false || JSON.stringify(value.database?.ownerSchemas) !== JSON.stringify(['orgmaster_core', 'orgmaster_contract'])) fail('database.boundary')
  if (!Array.isArray(value.evidence) || value.evidence.length < 3) fail('evidence')
  for (const item of value.evidence) { if (!item || item.status !== 'PASS' || typeof item.kind !== 'string' || typeof item.path !== 'string') fail('evidence.item'); hash(item.sha256, 'evidence.sha256') }
  if (value.guarantees?.firebaseRevocationCheck !== true || value.guarantees?.uniqueGoogleProviderId !== true || value.guarantees?.directoryStableKeyRead !== true || value.guarantees?.ownerCas !== true || value.guarantees?.idempotentReceipt !== true || value.guarantees?.lifecycleBarrier !== true || value.guarantees?.providerWrites !== 0 || value.guarantees?.productionWrites !== 0) fail('guarantees')
  if (value.dataSafety?.containsCredentials !== false || value.dataSafety?.containsTokens !== false || value.dataSafety?.containsDirectIdentifiers !== false) fail('dataSafety')
  const { receiptSha256, ...core } = value
  hash(receiptSha256, 'receiptSha256')
  if (sha256(canonicalize(core)) !== receiptSha256) fail('receiptSha256')
  return value
}
