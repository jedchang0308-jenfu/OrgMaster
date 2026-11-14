import { administrationHash } from '../src/governance/administration'
import { AsyncLocalStorage } from 'node:async_hooks'

import type { OrgmasterDatabase } from './orgmasterDatabase'
import {
  createOrgmasterPdmRevocationClient,
  pdmRevocationCommand,
  type PdmRevocationReceipt,
} from './orgmasterPdmRevocationClient'

type Database = Pick<OrgmasterDatabase, 'query'>
type Client = ReturnType<typeof createOrgmasterPdmRevocationClient>
type Operation = {
  operation_id: string
  request_hash: string
  baseline_version: string
  publication_version: string
  principal_ids: string[]
  impact_hash: string
  prepare_event_id: string
  terminal_event_id: string
  expires_at: Date
  prepare_receipt: PdmRevocationReceipt | null
  decision: 'published' | 'cancelled' | null
  terminal_receipt: PdmRevocationReceipt | null
}

const columns = `operation_id, request_hash, baseline_version::text, publication_version::text,
  principal_ids, impact_hash, prepare_event_id, terminal_event_id, expires_at,
  prepare_receipt, decision, terminal_receipt`
const table = 'orgmaster_core.pdm_session_publication_v1'

export class PdmPublicationError extends Error {
  constructor(readonly code: 'PDM_PUBLICATION_PENDING' | 'PDM_PUBLICATION_CONFLICT') { super(code) }
}

const conflict = () => new PdmPublicationError('PDM_PUBLICATION_CONFLICT')
const pending = () => new PdmPublicationError('PDM_PUBLICATION_PENDING')


const configuredClient = new AsyncLocalStorage<Client>()
export function withOrgmasterPdmRevocationClient<T>(client: Client, run: () => T): T {
  return configuredClient.run(client, run)
}

async function readImpact(database: Database) {
  const { rows } = await database.query<{ principal_id: string; effect: unknown }>(
    'SELECT * FROM orgmaster_core.read_pdm_session_impact_v1() ORDER BY principal_id COLLATE "C"',
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

export async function reconcileOrgmasterPdmPublications(database: Database, client = configuredClient.getStore() ?? createOrgmasterPdmRevocationClient()) {
  await database.query(`UPDATE ${table} SET decision='cancelled', decided_at=clock_timestamp()
    WHERE decision IS NULL AND expires_at <= clock_timestamp()`)
  const { rows } = await database.query<Operation>(`SELECT ${columns} FROM ${table}
    WHERE decision IS NOT NULL AND terminal_receipt IS NULL ORDER BY decided_at, operation_id LIMIT 2`)
  const outcomes = await Promise.allSettled(rows.map(row => finish(database, client, row)))
  return { selected: rows.length, completed: outcomes.filter(result => result.status === 'fulfilled').length }
}

/**
 * Plan by executing the verified owner path inside a savepoint and rolling it
 * back. Both passes use the native projection, v3 writer and authorization.
 * An external send happens only after the pending intent commits.
 */
export async function publishAfterOrgmasterPdmRevocation<T>(options: {
  actor: string
  commandKey: string
  request: unknown
  enabled: boolean
  transaction: <V>(run: () => Promise<V>) => Promise<V>
  database: () => Database
  deliveryDatabase: () => Database
  write: () => Promise<T>
  replay?: () => Promise<T>
  advanceLifecycleVersion?: boolean
  client?: Client
}): Promise<T> {
  if (!options.enabled) return options.write()
  const client = options.client ?? configuredClient.getStore() ?? createOrgmasterPdmRevocationClient()
  const requestHash = administrationHash(options.request)
  const inTransaction = <V>(fn: (database: Database) => Promise<V>) =>
    options.transaction(() => fn(options.database()))
  const load = async (database: Database) => {
    const { rows } = await database.query<Operation>(`SELECT ${columns} FROM ${table}
      WHERE actor_principal_id=$1 AND command_key=$2 FOR UPDATE`, [options.actor, options.commandKey])
    const row = rows[0]
    if (row && row.request_hash !== requestHash) throw conflict()
    return row
  }
  const prepare = await inTransaction(async database => {
    const baseline = await lockVersion(database)
    const existing = await load(database)
    if (existing) return { row: existing } as const

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
       publication_version, principal_ids, impact_hash, expires_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6::text[], $7, clock_timestamp()+interval '60 seconds')
      RETURNING ${columns}`, [options.actor, options.commandKey, requestHash, baseline, publicationVersion, principalIds, administrationHash(impact)])
    command(inserted.rows[0], 'prepare')
    return { row: inserted.rows[0] } as const
  })
  if ('result' in prepare) return prepare.result as T
  const row = prepare.row
  if (row.decision) {
    await finish(options.deliveryDatabase(), client, row).catch(() => undefined)
    if (row.decision === 'cancelled') throw conflict()
    return (options.replay ?? options.write)()
  }
  let receipt: PdmRevocationReceipt
  try { receipt = await client.dispatch(command(row, 'prepare')) }
  catch { throw pending() }
  let outcome: { result: T } | { cancelled: true }
  try {
    outcome = await inTransaction(async database => {
      const baseline = await lockVersion(database)
      const current = await load(database)
      if (!current || current.operation_id !== row.operation_id || current.decision === 'cancelled') throw conflict()
      if (current.decision === 'published') return { result: await (options.replay ?? options.write)() }
      if (baseline !== row.baseline_version || current.expires_at.getTime() <= Date.now()) {
        await cancel(database, row.operation_id)
        return { cancelled: true }
      }
      const before = await readImpact(database)
      await database.query('SAVEPOINT pdm_publication_apply')
      const result = await options.write()
      const impact = changesBetween(before, await readImpact(database))
      if (administrationHash(impact) !== row.impact_hash) {
        await database.query('ROLLBACK TO SAVEPOINT pdm_publication_apply')
        await cancel(database, row.operation_id)
        return { cancelled: true }
      }
      const version = options.advanceLifecycleVersion
        ? (await database.query<{ version: string }>(
          'SELECT orgmaster_core.advance_pdm_lifecycle_publication_v1($1)::text AS version', [baseline],
        )).rows[0].version
        : await lockVersion(database)
      if (version !== row.publication_version) {
        await database.query('ROLLBACK TO SAVEPOINT pdm_publication_apply')
        await cancel(database, row.operation_id)
        return { cancelled: true }
      }
      await database.query(`UPDATE ${table} SET prepare_receipt=$2, decision='published', decided_at=clock_timestamp()
        WHERE operation_id=$1`, [row.operation_id, JSON.stringify(receipt)])
      await database.query('RELEASE SAVEPOINT pdm_publication_apply')
      return { result }
    })
  } catch (error) {
    // A failed COMMIT response can hide a successful publication. Never
    // infer cancellation from an exception or replace the operation ID.
    const observed = await inTransaction(load).catch(() => undefined)
    if (observed?.decision !== 'published') {
      if (observed?.decision === 'cancelled') {
        await finish(options.deliveryDatabase(), client, observed).catch(() => undefined)
      }
      throw error
    }
    outcome = { result: await (options.replay ?? options.write)() }
  }
  const observed = await inTransaction(load).catch(() => undefined)
  if (observed) await finish(options.deliveryDatabase(), client, observed).catch(() => undefined)
  if ('cancelled' in outcome) throw conflict()
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
