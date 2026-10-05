import assert from 'node:assert/strict'
import crypto from 'node:crypto'

export const employeeNumberCases = Object.freeze(Array.from({ length: 10 }, (_, index) => `NUM-${String(index + 1).padStart(2, '0')}`))

// Runs only in the caller's freshly created disposable database. No external DSN.
export async function runEmployeeNumberChecks({ client, check, queryAs, expectDatabaseError, openAuxClient, closeAuxClient, currentWorkspaceRevision }) {
  const actor = 'principal-legacy'
  const ws = currentWorkspaceRevision()
  const signature = 'orgmaster_core.assign_employee_number_v2(text,text,text,text,text,text,timestamptz)'
  const sql = 'SELECT * FROM orgmaster_core.assign_employee_number_v2($1,$2,$3,$4,$5,$6,NULL)'
  const command = (id, employee, number, revision, principal = actor, database) => queryAs('jenfu_orgmaster_runtime', sql, [id, employee, number, principal, ws, revision], database)
  const snapshot = async () => (await client.query(`SELECT
    (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY employee_id),'[]') FROM orgmaster_core.employee_number_assignments a) AS assignments,
    (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY employee_number),'[]') FROM orgmaster_core.employee_number_tombstones t) AS tombstones,
    (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY command_id),'[]') FROM orgmaster_core.managed_identity_command_receipts r) AS receipts,
    (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY event_id),'[]') FROM orgmaster_core.managed_identity_audit_events e) AS audit`)).rows[0]
  const identityBaseline = (await client.query('SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY identity_record_id),\'[]\') AS records FROM orgmaster_core.managed_daily_identities i')).rows[0]
  const workspaceBaseline = (await client.query('SELECT artifact_key, canonical_sha256 FROM orgmaster_core.persistence_artifacts ORDER BY artifact_key')).rows

  await check('NUM-01', 'number assignment records canonical actor, exact receipt and audit atomically', async () => {
    const row = (await command('num-assign-one', 'employee-one', ' jfs9101 ', '0')).rows[0]
    assert.equal(row.disposition, 'applied'); assert.equal(row.revision, '1')
    assert.equal(row.assignment.employee_number, 'JFS9101'); assert.equal(row.assignment.assigned_by, actor)
    assert.ok(row.assignment.assigned_at)
    const receipt = (await client.query("SELECT * FROM orgmaster_core.managed_identity_command_receipts WHERE command_id='num-assign-one'")).rows[0]
    const framed = ['assign_employee_number_v2', 'employee-one', 'JFS9101', actor, ws, '0'].map(value => `${Buffer.byteLength(value)}:${value}`).join('')
    assert.equal(receipt.request_hash_sha256.trim(), crypto.createHash('sha256').update(framed).digest('hex'))
    assert.equal(receipt.response_payload.contractVersion, 'orgmaster.employee-number-command.v2')
    const audit = (await client.query("SELECT actor,command_id,before_hash,after_hash FROM orgmaster_core.managed_identity_audit_events WHERE command_id='num-assign-one'")).rows
    assert.equal(audit.length, 1); assert.equal(audit[0].actor, actor); assert.equal(audit[0].before_hash, null)
    assert.match(audit[0].after_hash.trim(), /^[a-f0-9]{64}$/u)
    return { disposition: row.disposition, revision: row.revision, actor, receiptAndAudit: true }
  })
  await check('NUM-02', 'same command replays original result despite its stale original CAS', async () => {
    const before = await snapshot()
    const row = (await command('num-assign-one', 'employee-one', 'JFS9101', '0')).rows[0]
    assert.equal(row.disposition, 'replayed'); assert.equal(row.revision, '1')
    assert.deepEqual(await snapshot(), before)
    return { originalRevision: row.revision, noAdditionalWrites: true }
  })
  await check('NUM-03', 'command reuse conflicts and stale new commands cannot mutate data', async () => {
    const before = await snapshot()
    for (const args of [ ['employee-one','JFS9102','0',actor], ['employee-two','JFS9101','0',actor], ['employee-one','JFS9101','0','principal-other'], ['employee-one','JFS9101','1',actor] ]) {
      await expectDatabaseError(() => command('num-assign-one', ...args), 'MANAGED_IDENTITY_IDEMPOTENCY_CONFLICT')
    }
    await expectDatabaseError(() => command('num-stale', 'employee-one','JFS9102','0'), 'MANAGED_IDENTITY_REVISION_CONFLICT')
    await expectDatabaseError(() => command('num-invalid', 'employee-two','JFS0000','0'), 'EMPLOYEE_NUMBER_INVALID')
    assert.deepEqual(await snapshot(), before)
    return { conflictDimensions: ['number','target','actor','CAS'], rejectedWithoutWrites: true }
  })
  await check('NUM-04', 'correction retains number history without changing Employee or identity ownership', async () => {
    const row = (await command('num-correct-one','employee-one','JFS9102','1')).rows[0]
    assert.equal(row.disposition, 'applied'); assert.equal(row.revision, '2')
    const retired = (await client.query("SELECT retired_at FROM orgmaster_core.employee_number_tombstones WHERE employee_number='JFS9101'")).rows[0]
    assert.ok(retired.retired_at)
    const audit = (await client.query("SELECT actor,before_hash,after_hash FROM orgmaster_core.managed_identity_audit_events WHERE command_id='num-correct-one'")).rows[0]
    assert.equal(audit.actor, actor); assert.match(audit.before_hash.trim(), /^[a-f0-9]{64}$/u)
    assert.notEqual(audit.before_hash, audit.after_hash)
    assert.deepEqual((await client.query('SELECT artifact_key, canonical_sha256 FROM orgmaster_core.persistence_artifacts ORDER BY artifact_key')).rows, workspaceBaseline)
    return { revision: row.revision, oldNumberRetired: true, workspaceUnchanged: true }
  })
  await check('NUM-05', 'retired numbers remain unavailable and a new noop command has one receipt and no audit', async () => {
    const before = await snapshot()
    await expectDatabaseError(() => command('num-retired','employee-one','JFS9101','2'), 'EMPLOYEE_NUMBER_RETIRED')
    await expectDatabaseError(() => command('num-reuse-retired','employee-two','JFS9101','0'), 'EMPLOYEE_NUMBER_CONFLICT')
    assert.deepEqual(await snapshot(), before)
    const row = (await command('num-noop','employee-one','JFS9102','2')).rows[0]
    assert.equal(row.disposition,'noop'); assert.equal(row.revision,'2')
    assert.equal((await client.query("SELECT count(*)::integer AS n FROM orgmaster_core.managed_identity_command_receipts WHERE command_id='num-noop'")).rows[0].n,1)
    assert.equal((await client.query("SELECT count(*)::integer AS n FROM orgmaster_core.managed_identity_audit_events WHERE command_id='num-noop'")).rows[0].n,0)
    return { noopReceipt: true, numberNeverReused: true }
  })
  await check('NUM-06', 'concurrent identical commands converge on one receipt, assignment and audit', async () => {
    const peers = await Promise.all([openAuxClient('num-replay-a'),openAuxClient('num-replay-b')])
    try {
      const results = await Promise.all(peers.map(peer => command('num-concurrent','employee-two','JFS9103','0',actor,peer)))
      assert.deepEqual(results.map(result => result.rows[0].disposition).sort(), ['applied','replayed'])
      for (const table of ['managed_identity_command_receipts','managed_identity_audit_events']) assert.equal((await client.query(`SELECT count(*)::integer AS n FROM orgmaster_core.${table} WHERE command_id='num-concurrent'`)).rows[0].n,1)
      return { oneReceipt: true, oneAudit: true, dispositions: ['applied','replayed'] }
    } finally { await Promise.all(peers.map(closeAuxClient)) }
  })
  await check('NUM-07', 'different employees racing for one number produce one winner and no duplicate', async () => {
    const peers = await Promise.all([openAuxClient('num-unique-a'),openAuxClient('num-unique-b')])
    try {
      const results = await Promise.allSettled(['employee-three','employee-four'].map((employee,index) => command(`num-unique-${index}`,employee,'JFS9104','0',actor,peers[index])))
      assert.equal(results.filter(result => result.status==='fulfilled').length,1)
      assert.match(results.find(result => result.status==='rejected').reason.message,/EMPLOYEE_NUMBER_CONFLICT/u)
      assert.equal((await client.query("SELECT count(*)::integer AS n FROM orgmaster_core.employee_number_assignments WHERE employee_number='JFS9104'")).rows[0].n,1)
      return { winnerCount: 1, noDuplicateAssignment: true }
    } finally { await Promise.all(peers.map(closeAuxClient)) }
  })
  for (const [id, table] of [['NUM-08','managed_identity_audit_events'],['NUM-09','managed_identity_command_receipts']]) {
    await check(id, `${table} failure rolls back assignment, tombstone, receipt and audit together`, async () => {
      const before = await snapshot()
      await client.query(`CREATE FUNCTION orgmaster_core.number_qc_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'NUMBER_QC_INJECTED_FAILURE'; END $$;
        CREATE TRIGGER number_qc_fault BEFORE INSERT ON orgmaster_core.${table} FOR EACH ROW EXECUTE FUNCTION orgmaster_core.number_qc_fault()`)
      try {
        await expectDatabaseError(() => command(`num-fault-${id}`,'employee-inactive','JFS9105','0'),'NUMBER_QC_INJECTED_FAILURE')
        assert.deepEqual(await snapshot(),before)
      } finally { await client.query(`DROP TRIGGER number_qc_fault ON orgmaster_core.${table}; DROP FUNCTION orgmaster_core.number_qc_fault()`) }
      return { fullTransactionRolledBack: true, employeeNotActivated: true }
    })
  }
  await check('NUM-10', 'owner command ACL denies sibling runtime and direct table mutation', async () => {
    const before = await snapshot()
    for (const role of ['jenfu_platform_runtime','jenfu_ai_pdm_runtime']) await expectDatabaseError(() => queryAs(role,sql,['num-cross','employee-inactive','JFS9105',actor,ws,'0']), {code:'42501'})
    assert.equal((await client.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS allowed',['jenfu_orgmaster_runtime',signature])).rows[0].allowed,true)
    await expectDatabaseError(() => queryAs('jenfu_orgmaster_runtime',"UPDATE orgmaster_core.employee_number_assignments SET employee_number='JFS9999' WHERE employee_id='employee-one'"),{code:'42501'})
    assert.deepEqual(await snapshot(),before)
    assert.deepEqual((await client.query('SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY identity_record_id),\'[]\') AS records FROM orgmaster_core.managed_daily_identities i')).rows[0],identityBaseline)
    return { ownerOnlyExecution: true, directDmlDenied: true, identityBindingsUnchanged: true }
  })
}
