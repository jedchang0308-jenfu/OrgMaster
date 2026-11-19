import { createHash } from 'node:crypto'
import type { Pool } from 'pg'
import { fmsRevocationCommand, parseFmsRevocationReceipt, type FmsRevocationPhase, type FmsRevocationReceipt } from './orgmaster-fms-revocation-wire.mts'

type Database = Pick<Pool, 'query'>
type Command = ReturnType<typeof fmsRevocationCommand>
export type FmsPublicationClient = {
  readback(command: Command): Promise<FmsRevocationReceipt | null>
  dispatch(command: Command): Promise<FmsRevocationReceipt>
}
export type FmsPublicationOptions = {
  enabled: boolean | ((database: Database) => Promise<boolean>)
  client?: FmsPublicationClient
}
export type FmsPublicationFields = {
  fms_principal_ids: string[]
  fms_impact_hash: string | null
  fms_prepare_event_id: string | null
  fms_terminal_event_id: string | null
  fms_prepare_receipt: FmsRevocationReceipt | null
  fms_terminal_receipt: FmsRevocationReceipt | null
}
type FmsPublicationRow = Partial<FmsPublicationFields> & {
  operation_id: string
  baseline_version: string
  publication_version: string
  decision: 'published' | 'cancelled' | null
}
type FmsEffect = readonly [string | null, string | null, readonly [
  string, string, string, string, unknown, readonly Record<string, unknown>[], readonly Record<string, unknown>[],
][]][]

function compareJson(left: unknown, right: unknown) {
  const a = JSON.stringify(left)
  const b = JSON.stringify(right)
  return a < b ? -1 : a > b ? 1 : 0
}

/** Native dry runs allocate new record IDs. Compare effects without those IDs,
 * and keep the actual committed IDs in the stored reviewer timeline. */
export function fmsPublicationEffect(value: unknown) {
  if (value == null) return null
  return (value as FmsEffect).map(([from, to, effects]) => [from, to, effects.map(
    ([employee, catalog, contentHash, artifactHash, accounts, assignments, grants]) => [
      employee, catalog, contentHash, artifactHash, accounts,
      assignments.map(({ assignmentId, sourceAssignmentId, ...effect }) => effect).sort(compareJson),
      grants.map(({ grantId, ...effect }) => effect).sort(compareJson),
    ],
  ).sort(compareJson)])
}

const publicationTable = 'orgmaster_core.pdm_session_publication_v1'
export const fmsPublicationColumns = ', fms_principal_ids, fms_impact_hash, fms_prepare_event_id, fms_terminal_event_id, fms_prepare_receipt, fms_terminal_receipt'
export const fmsPublicationPendingReceipt = '(cardinality(fms_principal_ids)>0 AND fms_terminal_receipt IS NULL)'

function version(generation: string) {
  return createHash('sha256').update(`orgmaster.fms-session-publication.v1:${generation}`).digest('hex')
}

export function fmsPublicationCommand(row: FmsPublicationRow, phase: FmsRevocationPhase, receiptId: string | null) {
  if (!row.fms_prepare_event_id || !row.fms_terminal_event_id || !row.fms_principal_ids?.length) {
    throw new Error('FMS_PUBLICATION_BINDING_INVALID')
  }
  return fmsRevocationCommand({ operationId: row.operation_id, prepareEventId: row.fms_prepare_event_id,
    terminalEventId: row.fms_terminal_event_id, baselineVersion: version(row.baseline_version),
    targetVersion: version(row.publication_version), principalIds: row.fms_principal_ids }, phase, receiptId)
}

export async function readFmsPublicationImpact(database: Database, at?: string) {
  const { rows } = await database.query<{ principal_id: string; effect: unknown }>(
    'SELECT * FROM orgmaster_core.read_fms_session_impact_v1(COALESCE($1::timestamptz,transaction_timestamp()))', [at ?? null],
  )
  return new Map(rows.map(row => [row.principal_id, row.effect]))
}

export async function prepareFmsPublication(row: FmsPublicationRow, client?: FmsPublicationClient) {
  if (!row.fms_principal_ids?.length) return null
  const command = fmsPublicationCommand(row, 'prepare', null)
  return parseFmsRevocationReceipt(row.fms_prepare_receipt ?? await client?.dispatch(command), command)
}

export async function finishFmsPublication(database: Database, client: FmsPublicationClient, row: FmsPublicationRow) {
  if (!row.fms_principal_ids?.length || !row.decision || row.fms_terminal_receipt) return
  const receipt = await prepareFmsPublication(row, client)
  if (!receipt) throw new Error('FMS_PUBLICATION_BINDING_INVALID')
  if (!row.fms_prepare_receipt) {
    // Cancellation after unknown delivery still requires the exact prepare to be
    // persisted before the consumer can independently see the owner decision.
    await database.query(`UPDATE ${publicationTable} SET fms_prepare_receipt=$2
      WHERE operation_id=$1 AND fms_prepare_receipt IS NULL`, [row.operation_id, JSON.stringify(receipt)])
  }
  const command = fmsPublicationCommand(row, row.decision, receipt.receiptId)
  const terminal = parseFmsRevocationReceipt(await client.dispatch(command), command)
  await database.query(`UPDATE ${publicationTable} SET fms_terminal_receipt=$2
    WHERE operation_id=$1 AND decision=$3 AND fms_terminal_receipt IS NULL`, [row.operation_id, JSON.stringify(terminal), row.decision])
}
