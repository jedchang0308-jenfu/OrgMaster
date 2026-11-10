import { createHash } from 'node:crypto'

export const DEV057_PRINCIPAL_SMOKE_RECIPE = 'infra/google-cloud/dev-040-production-release/candidate-smoke.tf'

export const DEV057_PRINCIPAL_SMOKE_BLOBS = Object.freeze({
  historical: '1add0e6508568d591faa190cabf64e2470fb620c',
  principal: 'b8d6b8a92a044bcd59e11efd8a6c0f7f2e319b55',
  corrected: 'b9c6bfeca843c6ef551d95834b59f5471c097abc',
  managedLogin: '1d5ee4a8bd0958ef59ebe8db05a19e24b1837851',
})

/** One authority for the exact reviewed candidate-smoke source transitions. */
export function isDev057PrincipalSmokeBlobTransition(before, after) {
  const blobs = DEV057_PRINCIPAL_SMOKE_BLOBS
  return (before === blobs.historical && [blobs.principal, blobs.corrected].includes(after))
    || (before === blobs.principal && after === blobs.corrected)
    || (before === blobs.corrected && after === blobs.managedLogin)
    // The managed-login source was deployed while the smoke credential remained
    // a Firebase password provider. Restore the already-reviewed bare session
    // contract with no other workflow or infrastructure field change.
    || (before === blobs.managedLogin && after === blobs.corrected)
}

export function gitBlobOid(bytes) {
  const value = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  return createHash('sha1').update(`blob ${value.length}\0`).update(value).digest('hex')
}
