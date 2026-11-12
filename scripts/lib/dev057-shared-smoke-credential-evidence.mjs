import { identityPairHash, sha256 } from './dev057-smoke-credential-reauth.mjs'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const VERSION = /^[1-9][0-9]*$/u
const UID = /^[A-Za-z0-9_-]{6,128}$/u
const EXPECTED = Object.freeze({
  projectId: 'jenfu-platform-prod',
  issuer: 'https://securetoken.google.com/jenfu-platform-prod',
  principalId: 'principal-firebase-b71682bf0d7cc5596b48dfad991e4096',
  employeeId: 'employee-shijie',
  platformRepository: 'jedchang0308-jenfu/Jenfu-Platform',
  platformSecretId: 'platform-prod-smoke-firebase-refresh-token',
  platformGithubSecret: 'DEV012_PLATFORM_FIREBASE_REFRESH_TOKEN',
})

function fail(code) { throw Object.assign(new Error(code), { code }) }
const keys = value => Object.keys(value ?? {}).sort().join(',')

function validatePlatformCredential(receipt, nowMs) {
  const { receiptSha256, ...core } = receipt ?? {}
  const observedAt = Date.parse(receipt?.observedAt)
  const authenticatedAt = Date.parse(receipt?.authenticatedAt)
  const authAt = Number(receipt?.authTime) * 1000
  if (receipt?.schemaVersion !== 'jenfu.dev015.smoke-credential-reauth.v1' ||
      receipt.ownerApplicationId !== 'platform' || receipt.projectId !== EXPECTED.projectId ||
      !H40.test(receipt.sourceRevision ?? '') || receipt.identityIssuer !== EXPECTED.issuer ||
      !H64.test(receipt.identityPairSha256 ?? '') || receipt.principalId !== EXPECTED.principalId ||
      receipt.employeeId !== EXPECTED.employeeId || receipt.passwordAuthenticated !== true ||
      receipt.emailVerified !== true || receipt.assuranceLevel !== 'aal1' || receipt.sessionReloaded !== true ||
      receipt.logoutRevoked !== true || receipt.results?.providerPairVerified !== true ||
      receipt.results?.accountEnabled !== true || receipt.results?.sessionCreated !== true ||
      receipt.results?.principalReloaded !== true || receipt.results?.logoutRevoked !== true ||
      receipt.secret?.id !== EXPECTED.platformSecretId || !VERSION.test(receipt.secret?.previousVersion ?? '') ||
      !VERSION.test(receipt.secret?.newVersion ?? '') || Number(receipt.secret.newVersion) !== Number(receipt.secret.previousVersion) + 1 ||
      receipt.secret.state !== 'ENABLED' || receipt.github?.repository !== EXPECTED.platformRepository ||
      receipt.github?.environment !== 'production' || receipt.github?.secretName !== EXPECTED.platformGithubSecret ||
      receipt.github?.configured !== true || receipt.status !== 'PASS' || receipt.releaseAuthority !== false ||
      receipt.evidenceScope !== 'APP_SMOKE_CREDENTIAL_REAUTH' || receipt.credentialMaterialPresent !== false ||
      !Number.isSafeInteger(receipt.authTime) || !Number.isFinite(authenticatedAt) || !Number.isFinite(observedAt) ||
      observedAt > nowMs + 30000 || authenticatedAt < authAt - 30000 || authenticatedAt > authAt + 300000 ||
      observedAt < authenticatedAt || observedAt - authenticatedAt > 120000 || receiptSha256 !== sha256(core) ||
      keys(receipt) !== ['assuranceLevel', 'authTime', 'authenticatedAt', 'credentialMaterialPresent', 'emailVerified',
        'employeeId', 'evidenceScope', 'github', 'identityIssuer', 'identityPairSha256', 'logoutRevoked', 'observedAt',
        'ownerApplicationId', 'passwordAuthenticated', 'principalId', 'projectId', 'receiptSha256', 'releaseAuthority',
        'results', 'schemaVersion', 'secret', 'sessionReloaded', 'sourceRevision', 'status'].sort().join(',')) {
    fail('SHARED_SMOKE_PLATFORM_CREDENTIAL_INVALID')
  }
  return { observedAt, receipt }
}

export function validateSharedSmokeCredentialEvidence({ identity, platformCredential, nowMs = Date.now() }) {
  const platform = validatePlatformCredential(platformCredential, nowMs)
  const receiptSha256 = identity?.receiptSha256
  const producerCore = {
    schemaVersion: identity?.schemaVersion,
    status: identity?.status,
    releaseAuthority: identity?.releaseAuthority,
    evidenceScope: identity?.evidenceScope,
    projectId: identity?.projectId,
    issuer: identity?.issuer,
    uid: identity?.uid,
    emailSha256: identity?.emailSha256,
    emailVerified: identity?.emailVerified,
    firstFactor: identity?.firstFactor,
    mfaEnrolled: identity?.mfaEnrolled,
    mfaFactor: identity?.mfaFactor,
    assuranceLevel: identity?.assuranceLevel,
    assuranceEvidence: identity?.assuranceEvidence,
    firebaseUserCount: identity?.firebaseUserCount,
    smokeRefreshTokenSecretVersions: {
      platform: identity?.smokeRefreshTokenSecretVersions?.platform,
      'ai-pdm': identity?.smokeRefreshTokenSecretVersions?.['ai-pdm'],
      orgmaster: identity?.smokeRefreshTokenSecretVersions?.orgmaster,
    },
    githubProductionEnvironmentSecrets: {
      platform: identity?.githubProductionEnvironmentSecrets?.platform,
      'ai-pdm': identity?.githubProductionEnvironmentSecrets?.['ai-pdm'],
      orgmaster: identity?.githubProductionEnvironmentSecrets?.orgmaster,
    },
    credentialMaterialPresent: identity?.credentialMaterialPresent,
    observedAt: identity?.observedAt,
  }
  const observedAt = Date.parse(identity?.observedAt)
  const versions = identity?.smokeRefreshTokenSecretVersions
  const github = identity?.githubProductionEnvironmentSecrets
  const hasBinding = Object.hasOwn(identity ?? {}, 'platformCredentialBinding')
  const binding = identity?.platformCredentialBinding
  if (hasBinding) {
    if (keys(binding) !== 'authTime,receiptSha256' || binding.receiptSha256 !== platformCredential.receiptSha256 ||
        binding.authTime !== platformCredential.authTime) fail('SHARED_SMOKE_IDENTITY_EVIDENCE_INVALID')
    producerCore.platformCredentialBinding = { receiptSha256: binding.receiptSha256, authTime: binding.authTime }
  }
  if (identity?.schemaVersion !== 'jenfu.dev012.firebase-identity-readback.v1' || identity.status !== 'PASS' ||
      identity.releaseAuthority !== true || identity.evidenceScope !== 'PRODUCTION_PROVIDER' ||
      identity.projectId !== EXPECTED.projectId || identity.issuer !== EXPECTED.issuer || !UID.test(identity.uid ?? '') ||
      !H64.test(identity.emailSha256 ?? '') || identity.emailVerified !== true || identity.firstFactor !== 'password' ||
      identity.mfaEnrolled !== false || identity.mfaFactor !== null || identity.assuranceLevel !== 'aal1' ||
      identity.assuranceEvidence !== 'SIGNED_ID_TOKEN_AFTER_PASSWORD_SIGNIN' || identity.firebaseUserCount !== 1 ||
      identity.credentialMaterialPresent !== false || !Number.isFinite(observedAt) || observedAt > nowMs + 30000 ||
      observedAt < platform.observedAt || (!hasBinding && observedAt - platform.observedAt > 180000) ||
      !['platform', 'orgmaster', 'ai-pdm'].every(id => VERSION.test(versions?.[id] ?? '') && github?.[id] === true) ||
      versions.platform !== platformCredential.secret.newVersion ||
      identityPairHash(identity.issuer, identity.uid) !== platformCredential.identityPairSha256 ||
      receiptSha256 !== sha256(JSON.stringify(producerCore)) ||
      keys(identity) !== ['assuranceEvidence', 'assuranceLevel', 'credentialMaterialPresent', 'emailSha256', 'emailVerified',
        'evidenceScope', 'firebaseUserCount', 'firstFactor', 'githubProductionEnvironmentSecrets', 'issuer', 'mfaEnrolled',
        'mfaFactor', 'observedAt', 'projectId', 'receiptSha256', 'releaseAuthority', 'schemaVersion',
        'smokeRefreshTokenSecretVersions', 'status', 'uid', ...(hasBinding ? ['platformCredentialBinding'] : [])].sort().join(',')) {
    fail('SHARED_SMOKE_IDENTITY_EVIDENCE_INVALID')
  }
  const nextVersion = versions.orgmaster
  const previousVersion = String(Number(nextVersion) - 1)
  if (!VERSION.test(previousVersion)) fail('SHARED_SMOKE_IDENTITY_EVIDENCE_INVALID')
  return {
    previousVersion,
    nextVersion,
    versionChain: [previousVersion, nextVersion],
    principalId: EXPECTED.principalId,
    employeeId: EXPECTED.employeeId,
    assuranceLevel: 'aal1',
  }
}
