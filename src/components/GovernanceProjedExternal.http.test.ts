import { createServer, type Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { openProjedExternalOperator } from '../../scripts/lib/dev057-projed-external-ui-fixture.mjs'

// Adapter/component regression only; the Platform DEV007 suite supplies the
// real owner Session/repositories and all three systems' PostgreSQL contracts.
const requestId = randomUUID()
const adminCookie = 'orgmaster_session=LOCAL_SIMULATION.operator'
let server: Server | undefined
let operator: Awaited<ReturnType<typeof openProjedExternalOperator>> | undefined
afterEach(async () => {
  await operator?.close(); operator = undefined
  if (server?.listening) await new Promise<void>((resolve, reject) => {
    server!.closeIdleConnections(); server!.close(error => error ? reject(error) : resolve())
  })
  server = undefined
})

async function fixture() {
  let record = { requestId, invitationId: requestId, boardId: 'board-local-fixture', role: 'viewer',
    inviterPrincipalId: 'inviter-local-fixture', contactEmail: 'local-fixture@example.invalid',
    principalId: null, googleSubject: null, company: '', note: '', status: 'PENDING', decision: 'PENDING',
    revision: '1', approvedBy: null, approvedAt: null, lastLoginAt: null }
  let origin = ''
  server = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json')
    if (request.url !== '/api/orgmaster/projed-external-requests/v1'
      || request.headers.cookie !== adminCookie || request.headers.origin !== origin) {
      response.writeHead(403); response.end(JSON.stringify({ code: 'EXTERNAL_ADMIN_REQUIRED' })); return
    }
    if (request.method === 'GET') { response.end(JSON.stringify({ requests: [record] })); return }
    let body = ''; for await (const chunk of request) body += chunk
    const command = JSON.parse(body)
    if (command.requestId !== requestId || command.expectedRevision !== record.revision || record.status !== 'PENDING') {
      response.writeHead(409); response.end(JSON.stringify({ code: 'EXTERNAL_REVISION_CONFLICT' })); return
    }
    record = { ...record, revision: '2', decision: 'APPROVED' }
    response.end(JSON.stringify(record))
  })
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('LOOPBACK_FIXTURE_REQUIRED')
  origin = `http://127.0.0.1:${address.port}`
  operator = await openProjedExternalOperator({ origin, adminCookie, principalId: 'admin-local-fixture' })
  return { operator, withdraw: () => { record = { ...record, revision: '2', status: 'WITHDRAWN' } } }
}

it('clicks the actual owner component over loopback HTTP and preserves pre-bind pending status', async () => {
  const { operator } = await fixture()
  expect(operator.text()).toContain('尚未驗證身分')
  await operator.click({ boardId: 'board-local-fixture', contactEmail: 'local-fixture@example.invalid', label: '核准' })
  expect(operator.requests.map((entry: { status: number }) => entry.status)).toEqual([200, 200, 200])
  expect(operator.requests[1].command).toMatchObject({ requestId, expectedRevision: '1', action: 'approve' })
  expect(operator.text()).toContain('已核准，等待身分驗證')
})

it('shows the late CAS denial and reloads the withdrawn terminal state through the existing controls', async () => {
  const { operator, withdraw } = await fixture()
  withdraw()
  await operator.click({ boardId: 'board-local-fixture', contactEmail: 'local-fixture@example.invalid', label: '核准' })
  expect(operator.requests[1].status).toBe(409)
  expect(operator.text()).toContain('資料已更新，請重新載入。')
  await operator.reload()
  expect(operator.text()).toContain('已撤回')
  expect(operator.text()).not.toContain('查詢並重送原操作')
  await expect(operator.click({ boardId: 'board-local-fixture', contactEmail: 'local-fixture@example.invalid', label: '核准' }))
    .rejects.toThrow('PROJED_EXTERNAL_OPERATOR_ACTION_UNAVAILABLE')
})

it('rejects a non-loopback owner before installing the operator surface', async () => {
  await expect(openProjedExternalOperator({ origin: 'https://orgmaster.example.test', adminCookie, principalId: 'admin' }))
    .rejects.toThrow('PROJED_EXTERNAL_OPERATOR_FIXTURE_TARGET_INVALID')
})
