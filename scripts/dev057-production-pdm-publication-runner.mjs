import pg from 'pg'
import { assertRunnerTarget, canonicalize, metadataAccessToken, publishGcsJson, readGcsObject, sha256 } from './lib/dev012-production-migration-runner.mjs'
import { TARGET, databaseOptions } from './lib/orgmaster-production-database.mjs'
import { assertAcceptance, assertControlOperation, controlIdentity, publicationControlForMode,
  exactKeys, executePublicationControl, fail, pathsForControl, same } from './lib/dev057-pdm-publication-control.mjs'

export async function runPdmPublicationControlJob({ argv, environment, fetchImpl, Client = pg.Client }) {
  const options = Object.fromEntries(Array.from({ length: argv.length / 2 }, (_, index) => argv.slice(index * 2, index * 2 + 2)))
  const control = publicationControlForMode(options['--operation-mode'])
  if (argv.length !== 10 || !exactKeys(options, ['--operation-mode', '--operation-ref', '--operation-sha256', '--source-revision', '--output-ref']) ||
      !control) fail('JOB_ARGUMENT_INVALID')
  assertRunnerTarget(environment, TARGET)
  const token = await metadataAccessToken(fetchImpl)
  const read = async (uri, hash, prefix) => {
    const object = await readGcsObject({ uri, expectedBucket: TARGET.releaseBucket, expectedPrefix: prefix, token, fetchImpl })
    if (sha256(object.bytes) !== hash) fail('INPUT_HASH_MISMATCH')
    return JSON.parse(object.bytes.toString('utf8'))
  }
  const sourceRevision = options['--source-revision']
  const operation = await read(options['--operation-ref'], options['--operation-sha256'], control.inputPrefix)
  assertControlOperation(operation, sourceRevision, Date.now(), control)
  const identity = controlIdentity(operation)
  const { inputUri, outputUri } = pathsForControl(sourceRevision, identity, options['--operation-sha256'], control)
  if (options['--operation-ref'] !== inputUri || options['--output-ref'] !== outputUri) fail('JOB_PATH_MISMATCH')
  const readRef = (ref, prefix = 'receipts') => {
    if (!exactKeys(ref, ['uri', 'sha256'])) fail('RECEIPT_REF_INVALID')
    return read(ref.uri, ref.sha256, prefix)
  }
  const [acceptance, terminal, release] = await Promise.all([
    readRef(operation.acceptanceRef, control.acceptancePrefix), readRef(operation.terminalRef), readRef(operation.releaseIntentRef),
  ])
  assertAcceptance(acceptance, operation.action, control)
  const { receiptSha256, ...core } = terminal
  if (receiptSha256 !== sha256(canonicalize(core)) || terminal.schemaVersion !== 'jenfu.dev012.stage-receipt.v1' ||
      terminal.status !== 'PASS' || terminal.stage !== 'terminal' ||
      terminal.ownerApplicationId !== 'orgmaster' || release.ownerApplicationId !== 'orgmaster' ||
      terminal.releaseId !== release.releaseId || terminal.sourceRevision !== sourceRevision ||
      release.sourceRevision !== sourceRevision || acceptance.sources.orgmaster.sourceRevision !== sourceRevision ||
      terminal.facts?.result !== 'RELEASED' || terminal.facts.remainingHumanAction !== 0 ||
      terminal.facts.artifactDigest !== acceptance.sources.orgmaster.artifactDigest ||
      !same(operation.releaseIntentRef.uri, `gs://${TARGET.releaseBucket}/receipts/releases/${release.releaseId}/release-intent.json`) ||
      operation.terminalRef.uri !== `gs://${TARGET.releaseBucket}/receipts/releases/${release.releaseId}/${operation.releaseIntentRef.sha256}/terminal.json`) fail('RELEASE_INVALID')
  const database = new Client(databaseOptions(environment, token))
  await database.connect()
  try {
    const state = await executePublicationControl({ database, operation, operationSha256: identity, control })
    const proof = {
      schemaVersion: control.receiptSchema, status: 'PASS',
      ownerApplicationId: 'orgmaster', sourceRevision, action: operation.action,
      operationSha256: identity, acceptanceRef: operation.acceptanceRef, releaseIntentRef: operation.releaseIntentRef, state,
    }
    const value = { ...proof, receiptSha256: sha256(canonicalize(proof)) }
    const published = await publishGcsJson({ uri: outputUri, expectedBucket: TARGET.releaseBucket,
      expectedPrefix: control.receiptPrefix, value, token, fetchImpl })
    return { ...value, outputRef: outputUri, outputSha256: published.sha256 }
  } finally {
    await database.end()
  }
}
