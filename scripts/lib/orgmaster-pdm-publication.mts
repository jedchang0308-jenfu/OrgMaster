import { createHash } from 'node:crypto'
import type { Pool } from 'pg'
import { pdmRevocationCommand, parsePdmRevocationReceipt, type PdmRevocationReceipt } from './orgmaster-pdm-revocation-wire.mts'

export type Database = Pick<Pool, 'query'>
export type Client = {
  readback(command: ReturnType<typeof pdmRevocationCommand>): Promise<PdmRevocationReceipt | null>
  dispatch(command: ReturnType<typeof pdmRevocationCommand>): Promise<PdmRevocationReceipt>
}
type Operation = {
  operation_id: string
  request_hash: string
  baseline_version: string
  publication_version: string
  principal_ids: string[]
  impact_hash: string
  impact_at: string
  prepare_event_id: string
  terminal_event_id: string
  expired: boolean
  prepare_receipt: PdmRevocationReceipt | null
  owner_delivery: boolean
  decision: 'published' | 'cancelled' | null
  terminal_receipt: PdmRevocationReceipt | null
}

const columns = `operation_id, request_hash, baseline_version::text, publication_version::text,
  principal_ids, impact_hash, impact_at::text, prepare_event_id, terminal_event_id, (expires_at <= clock_timestamp()) AS expired,
  prepare_receipt, owner_delivery, decision, terminal_receipt`
function publicationHash(value: unknown) {
  const sorted = (item: unknown): unknown => Array.isArray(item) ? item.map(sorted) : item && typeof item === 'object'
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, sorted((item as Record<string, unknown>)[key])])) : item
  return createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex')
}
const table = 'orgmaster_core.pdm_session_publication_v1'

export class PdmPublicationError extends Error {
  readonly code: 'PDM_PUBLICATION_PENDING' | 'PDM_PUBLICATION_CONFLICT'
  constructor(code: PdmPublicationError['code']) { super(code); this.code = code }
}

const conflict = () => new PdmPublicationError('PDM_PUBLICATION_CONFLICT')
const pending = () => new PdmPublicationError('PDM_PUBLICATION_PENDING')


async function readImpact(database: Database, at?: string) {
  const { rows } = await database.query<{ principal_id: string; effect: unknown }>(
    'SELECT * FROM orgmaster_core.read_pdm_session_impact_v1(COALESCE($1::timestamptz,transaction_timestamp())) ORDER BY principal_id COLLATE "C"',
    [at ?? null],
  )
  return new Map(rows.map(row => [row.principal_id, row.effect]))
}

function changesBetween(before: Map<string, unknown>, after: Map<string, unknown>) {
  return [...new Set([...before.keys(), ...after.keys()])].sort()
    .filter(id => JSON.stringify(before.get(id)) !== JSON.stringify(after.get(id)))
    .map(id => [id, before.get(id) ?? null, after.get(id) ?? null] as const)
}

function command(row: Operation, phase: 'prepare' | 'published' | 'cancelled') {
  return pdmRevocationCommand({
    operationId: row.operation_id, baselineVersion: row.baseline_version,
    publicationVersion: row.publication_version, principalIds: row.principal_ids,
  }, phase === 'prepare' ? row.prepare_event_id : row.terminal_event_id, phase)
}

async function finish(database: Database, client: Client, row: Operation) {
  if (!row.decision || row.terminal_receipt) return
  if (row.decision === 'published') {
    const { rows } = await database.query<{ clear: boolean }>(
      'SELECT orgmaster_core.pdm_reviewer_delivery_clear_v1($1::text[]) AS clear', [row.principal_ids],
    )
    if (rows[0]?.clear !== true) throw pending()
  }
  // Terminal commands require a prepare receipt in PDM. Ensure the exact
  // prepare can be reconciled even if the owner cancelled during a lost reply.
  if (!row.prepare_receipt) {
    const prepare = await client.readback(command(row, 'prepare'))
    if (!prepare) {
      // Another sender may already be in flight. Use the same event ID and
      // let the consumer serialize it with the terminal command.
      await client.dispatch(command(row, 'prepare'))
    }
  }
  const terminal = await client.dispatch(command(row, row.decision))
  await database.query(`UPDATE ${table} SET terminal_receipt=$2
    WHERE operation_id=$1 AND decision=$3 AND terminal_receipt IS NULL`,
  [row.operation_id, JSON.stringify(terminal), row.decision])
}

export async function reconcileOrgmasterPdmPublications(database: Database, client: Client) {
  await database.query(`UPDATE ${table} SET decision='cancelled', decided_at=clock_timestamp()
    WHERE decision IS NULL AND expires_at <= clock_timestamp()`)
  const { rows } = await database.query<Operation>(`SELECT ${columns} FROM ${table}
    WHERE decision IS NOT NULL AND terminal_receipt IS NULL ORDER BY decided_at, operation_id LIMIT 2`)
  const preparations = await database.query<Operation>(`SELECT ${columns} FROM ${table}
    WHERE owner_delivery AND decision IS NULL AND prepare_receipt IS NULL
      AND expires_at > clock_timestamp()
    ORDER BY prepared_at, operation_id LIMIT 2`)
  const outcomes = await Promise.allSettled([
    ...rows.map(row => finish(database, client, row)),
    ...preparations.rows.map(async row => {
      const prepare = command(row, 'prepare')
      const receipt = parsePdmRevocationReceipt(await client.dispatch(prepare), prepare)
      await database.query(`UPDATE ${table} SET prepare_receipt=$2
        WHERE operation_id=$1 AND decision IS NULL AND prepare_receipt IS NULL`,
      [row.operation_id, JSON.stringify(receipt)])
    }),
  ])
  return { selected: outcomes.length, completed: outcomes.filter(result => result.status === 'fulfilled').length }
}

/**
 * Plan by executing the verified owner path inside a savepoint and rolling it
 * back. Both passes use the native projection, v3 writer and authorization.
 * An external send happens only after the pending intent commits.
 */
export type PdmPublicationOptions<T> = {
  actor: string
  commandKey: string
  request: unknown
  enabled: boolean | ((database: Database) => Promise<boolean>)
  transaction: <V>(run: () => Promise<V>) => Promise<V>
  database: () => Database
  deliveryDatabase: () => Database
  write: () => Promise<T>
  replay?: () => Promise<T>
  advanceLifecycleVersion?: boolean
  ownerDelivery?: boolean
  client?: Client
}

export async function publishAfterOrgmasterPdmRevocation<T>(options: PdmPublicationOptions<T>): Promise<T> {
  if (!options.enabled) return options.write()
  const client = options.client
  const requestHash = publicationHash(options.request)
  const inTransaction = <V,>(fn: (database: Database) => Promise<V>) =>
    options.transaction(() => fn(options.database()))
  const load = async (database: Database) => {
    const { rows } = await database.query<Operation>(`SELECT ${columns} FROM ${table}
      WHERE actor_principal_id=$1 AND command_key=$2 FOR UPDATE`, [options.actor, options.commandKey])
    const row = rows[0]
    if (row && (row.request_hash !== requestHash || row.owner_delivery !== Boolean(options.ownerDelivery))) throw conflict()
    return row
  }
  const prepare = await inTransaction<{ result: T } | { row: Operation }>(async database => {
    const baseline = await lockVersion(database)
    if (typeof options.enabled === 'function' && !await options.enabled(database)) {
      return { result: await options.write() }
    }
    if (!client && !options.ownerDelivery) throw pending()
    await database.query("SET LOCAL orgmaster.pdm_publication_writer = 'coordinated'")
    const existing = await load(database)
    if (existing) {
      if (existing.expired && existing.decision === null) {
        await cancel(database, existing.operation_id)
        return { row: { ...existing, decision: 'cancelled' as const } } as const
      }
      return { row: existing } as const
    }

    const before = await readImpact(database)
    await database.query('SAVEPOINT pdm_publication_plan')
    const result = await options.write()
    const after = await readImpact(database)
    const impact = changesBetween(before, after)
    if (!impact.length) {
      await database.query('RELEASE SAVEPOINT pdm_publication_plan')
      return { result } as const
    }
    const publicationVersion = options.advanceLifecycleVersion ? (BigInt(baseline) + 1n).toString() : await lockVersion(database)
    await database.query('ROLLBACK TO SAVEPOINT pdm_publication_plan')
    await database.query('RELEASE SAVEPOINT pdm_publication_plan')
    if (BigInt(publicationVersion) !== BigInt(baseline) + 1n) throw conflict()
    const principalIds = impact.map(entry => entry[0])
    if (principalIds.length > 4096) throw conflict()
    // Serializing preparation under the existing authority row lock prevents
    // an overlapping operation from acquiring a second barrier.
    if ((await database.query(`SELECT 1 FROM ${table}
        WHERE terminal_receipt IS NULL AND principal_ids && $1::text[] LIMIT 1`, [principalIds])).rowCount) throw pending()
    const inserted = await database.query<Operation>(`INSERT INTO ${table}
      (operation_id, actor_principal_id, command_key, request_hash, baseline_version,
       publication_version, principal_ids, impact_hash, expires_at, owner_delivery)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6::text[], $7,
        clock_timestamp()+CASE WHEN $8 THEN interval '5 minutes' ELSE interval '60 seconds' END, $8)
      RETURNING ${columns}`, [options.actor, options.commandKey, requestHash, baseline, publicationVersion,
      principalIds, publicationHash(impact), Boolean(options.ownerDelivery)])
    command(inserted.rows[0], 'prepare')
    return { row: inserted.rows[0] } as const
  })
  if ('result' in prepare) return prepare.result
  const row = prepare.row
  if (row.decision) {
    if (client) await finish(options.deliveryDatabase(), client, row).catch(() => undefined)
    if (row.decision === 'cancelled') throw conflict()
    return (options.replay ?? options.write)()
  }
  let receipt: PdmRevocationReceipt
  const prepareCommand = command(row, 'prepare')
  try { receipt = parsePdmRevocationReceipt(row.prepare_receipt ?? await client?.dispatch(prepareCommand), prepareCommand) }
  catch { throw pending() }
  let outcome: { result: T } | { cancelled: true } | { replay: true }
  try {
    outcome = await inTransaction(async database => {
      const baseline = await lockVersion(database)
      await database.query("SET LOCAL orgmaster.pdm_publication_writer = 'coordinated'")
      const current = await load(database)
      if (!current || current.operation_id !== row.operation_id || current.decision === 'cancelled') throw conflict()
      if (current.decision === 'published') return { replay: true }
      if (baseline !== row.baseline_version || current.expired) {
        await cancel(database, row.operation_id)
        return { cancelled: true }
      }
      const before = await readImpact(database, row.impact_at)
      await database.query('SAVEPOINT pdm_publication_apply')
      const result = await options.write()
      const impact = changesBetween(before, await readImpact(database, row.impact_at))
      if (publicationHash(impact) !== row.impact_hash) {
        await database.query('ROLLBACK TO SAVEPOINT pdm_publication_apply')
        await cancel(database, row.operation_id)
        return { cancelled: true }
      }
      const version = options.advanceLifecycleVersion
        ? (await database.query<{ version: string }>(
          options.ownerDelivery
            ? `UPDATE orgmaster_core.persistence_authority
                 SET authority_version=authority_version+1, updated_at=clock_timestamp()
                 WHERE singleton AND authority_version=$1 RETURNING authority_version::text AS version`
            : 'SELECT orgmaster_core.advance_pdm_lifecycle_publication_v1($1)::text AS version', [baseline],
        )).rows[0].version
        : await lockVersion(database)
      if (version !== row.publication_version) {
        await database.query('ROLLBACK TO SAVEPOINT pdm_publication_apply')
        await cancel(database, row.operation_id)
        return { cancelled: true }
      }
      await database.query(`UPDATE ${table} SET prepare_receipt=$2, decision='published', decided_at=clock_timestamp(),
        authority_timeline=$3 WHERE operation_id=$1`, [row.operation_id, JSON.stringify(receipt),
        JSON.stringify(impact.map(([principal, , after]) => [principal, after ?? []]))])
      await database.query('RELEASE SAVEPOINT pdm_publication_apply')
      return { result }
    })
  } catch (error) {
    // A failed COMMIT response can hide a successful publication. Never
    // infer cancellation from an exception or replace the operation ID.
    const observed = await inTransaction(load).catch(() => undefined)
    if (observed?.decision !== 'published') {
      if (client && observed?.decision === 'cancelled') {
        await finish(options.deliveryDatabase(), client, observed).catch(() => undefined)
      }
      throw error
    }
    outcome = { replay: true }
  }
  const observed = await inTransaction(load).catch(() => undefined)
  if (client && observed) await finish(options.deliveryDatabase(), client, observed).catch(() => undefined)
  if ('cancelled' in outcome) throw conflict()
  if ('replay' in outcome) return (options.replay ?? options.write)()
  return outcome.result
}

async function lockVersion(database: Database) {
  const { rows } = await database.query<{ version: string }>(
    'SELECT orgmaster_core.lock_pdm_session_publication_v1()::text AS version',
  )
  return rows[0].version
}

async function cancel(database: Database, operationId: string) {
  await database.query(`UPDATE ${table} SET decision='cancelled', decided_at=clock_timestamp()
    WHERE operation_id=$1 AND decision IS NULL`, [operationId])
}
