import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOrgDocumentFile } from '../src/documentStorage'
import { screenshotOrganizationState } from '../src/screenshotData'
import { getOrgMasterDocumentPaths, readStoredDocument, writeStoredDocument, createOrgmasterApiMiddleware } from './orgmasterApi'
import * as workspaceStore from './orgmasterWorkspaceStore'
import { setVerifiedRequestIdentity } from './orgmasterRequestIdentity'
import type { OrgmasterSession } from './orgmasterSessionRepository'

const temporaryRoots: string[] = []

async function temporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), 'orgmaster-dev019-'))
  temporaryRoots.push(root)
  return root
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function principalSession(): OrgmasterSession {
  return {
    id: 'session-1', identityIssuer: 'urn:test', identitySubject: 'subject-1', principalId: 'principal-verified', employeeId: 'employee-1',
    authEpoch: 0, sessionSchemaVersion: 2, epochKind: 'principal', principalAuthEpoch: 0,
    issuedAt: '2026-10-05T00:00:00.000Z', authenticatedAt: '2026-10-05T00:00:00.000Z', expiresAt: '2026-10-05T08:00:00.000Z',
    revokedAt: null, assuranceLevel: 'aal1',
  }
}

async function withPersistenceMode<T>(mode: 'local-json' | 'cloud-sql', run: () => Promise<T>) {
  const previous = process.env.ORGMASTER_PERSISTENCE_MODE
  process.env.ORGMASTER_PERSISTENCE_MODE = mode
  try {
    return await run()
  } finally {
    if (previous === undefined) delete process.env.ORGMASTER_PERSISTENCE_MODE
    else process.env.ORGMASTER_PERSISTENCE_MODE = previous
  }
}

async function dispatchWorkspaceRequest(method: string, url: string, body: Record<string, unknown>, session?: OrgmasterSession) {
  const request = new PassThrough() as PassThrough & IncomingMessage
  request.method = method
  request.url = url
  request.headers = {}
  if (session) setVerifiedRequestIdentity(request, session)
  let complete!: (result: { statusCode: number; body: string }) => void
  const completed = new Promise<{ statusCode: number; body: string }>((resolve) => { complete = resolve })
  const response = {
    statusCode: 0,
    writableEnded: false,
    setHeader: () => undefined,
    end(body?: string | Buffer) {
      this.writableEnded = true
      complete({ statusCode: this.statusCode, body: String(body ?? '') })
    },
  } as unknown as ServerResponse
  createOrgmasterApiMiddleware()(request, response, () => { throw new Error('Unexpected middleware continuation') })
  request.end(JSON.stringify(body))
  return completed
}

describe('OrgMaster local document file compatibility', () => {
  it('reads V2, writes V6, and preserves the V2 bytes', async () => {
    const root = await temporaryRoot()
    const paths = getOrgMasterDocumentPaths(root)
    await mkdir(dirname(paths.v2), { recursive: true })
    const stateV2 = Object.fromEntries(
      Object.entries(screenshotOrganizationState).filter(([key]) => key !== 'roleCombinationRiskRules'),
    )
    const rawV2 = `${JSON.stringify({
      app: 'OrgMaster',
      version: 2,
      kind: 'document',
      savedAt: '2026-08-15T00:00:00.000Z',
      state: stateV2,
    }, null, 2)}\n`
    await writeFile(paths.v2, rawV2, 'utf8')

    const loaded = await readStoredDocument(root)
    expect(loaded.document).toMatchObject({ version: 7, state: { roleCombinationRiskRules: [], duties: [], dutyPositionRelations: [], processes: [], processNodes: [], processEdges: [], processNodeDutyLinks: [], organizationLayout: { mode: 'tree' } } })
    await writeStoredDocument(loaded.document, root)
    expect(JSON.parse(await readFile(paths.v7, 'utf8'))).toMatchObject({ version: 7 })
    expect(await readFile(paths.v2, 'utf8')).toBe(rawV2)
  })

  it('does not fall back to a valid V2 file when newer V3 exists but is malformed', async () => {
    const root = await temporaryRoot()
    const paths = getOrgMasterDocumentPaths(root)
    await mkdir(dirname(paths.v2), { recursive: true })
    const v2State = Object.fromEntries(
      Object.entries(screenshotOrganizationState).filter(([key]) => key !== 'roleCombinationRiskRules'),
    )
    await writeFile(paths.v2, JSON.stringify({
      app: 'OrgMaster', version: 2, kind: 'document', savedAt: 'now', state: v2State,
    }), 'utf8')
    await writeFile(paths.v3, '{"app":"OrgMaster","version":3', 'utf8')

    await expect(readStoredDocument(root)).rejects.toBeTruthy()
  })

  it('round-trips an explicit V6 document through the V6 path', async () => {
    const root = await temporaryRoot()
    const document = createOrgDocumentFile(screenshotOrganizationState, 'document', '2026-08-15T00:00:00.000Z')
    const stored = await writeStoredDocument(document, root)
    expect(stored.document).toEqual(document)
  })
})

describe('workspace writer actor plumbing', () => {
  it('uses only the verified Principal for cloud-SQL create, save, and metadata actions', async () => {
    const create = vi.spyOn(workspaceStore, 'createWorkspaceDraft').mockResolvedValue({ workspace: {} as never, createdVersionId: 'draft-1' })
    const save = vi.spyOn(workspaceStore, 'saveWorkspaceVersion').mockResolvedValue({ version: { revision: 'revision-next' } } as never)
    const update = vi.spyOn(workspaceStore, 'updateWorkspaceEntry').mockResolvedValue({} as never)

    await withPersistenceMode('cloud-sql', async () => {
      const created = await dispatchWorkspaceRequest('POST', '/api/orgmaster/workspace/versions', {
        sourceVersionId: 'current-1', name: 'Draft A', expectedManifestRevision: 'manifest-1', actorPrincipalId: 'forged', updatedBy: 'forged',
      }, principalSession())
      const saved = await dispatchWorkspaceRequest('PUT', '/api/orgmaster/workspace/versions/current-1', {
        document: {}, expectedVersionRevision: 'version-1', mode: 'current-maintenance', actorPrincipalId: 'forged',
      }, principalSession())
      const renamed = await dispatchWorkspaceRequest('PATCH', '/api/orgmaster/workspace/versions/draft-1', {
        action: 'rename', name: 'Draft B', expectedManifestRevision: 'manifest-2', updatedBy: 'forged',
      }, principalSession())

      expect(created.statusCode).toBe(201)
      expect(saved.statusCode).toBe(200)
      expect(renamed.statusCode).toBe(200)
    })

    expect(create).toHaveBeenCalledWith(process.cwd(), 'current-1', 'Draft A', 'manifest-1', 'principal-verified')
    expect(save).toHaveBeenCalledWith(process.cwd(), 'current-1', {}, 'version-1', 'current-maintenance', 'principal-verified')
    expect(update).toHaveBeenCalledWith(process.cwd(), 'draft-1', 'rename', 'Draft B', 'manifest-2', 'principal-verified')
  })

  it('rejects cloud-SQL writes without a verified human Principal before calling the store', async () => {
    const create = vi.spyOn(workspaceStore, 'createWorkspaceDraft')
    const developmentSession = { ...principalSession(), sessionSchemaVersion: 1 as const, epochKind: 'provider_pair' as const, principalAuthEpoch: null }

    await withPersistenceMode('cloud-sql', async () => {
      const missing = await dispatchWorkspaceRequest('POST', '/api/orgmaster/workspace/versions', {
        sourceVersionId: 'current-1', name: 'Draft A', expectedManifestRevision: 'manifest-1', actorPrincipalId: 'forged',
      })
      const development = await dispatchWorkspaceRequest('POST', '/api/orgmaster/workspace/versions', {
        sourceVersionId: 'current-1', name: 'Draft A', expectedManifestRevision: 'manifest-1', actorPrincipalId: 'forged',
      }, developmentSession)
      expect(missing).toMatchObject({ statusCode: 401, body: expect.stringContaining('WORKSPACE_ACTOR_REQUIRED') })
      expect(development).toMatchObject({ statusCode: 401, body: expect.stringContaining('WORKSPACE_ACTOR_REQUIRED') })
    })

    expect(create).not.toHaveBeenCalled()
  })

  it('keeps standalone local-JSON API calls actorless and ignores body actor fields', async () => {
    const create = vi.spyOn(workspaceStore, 'createWorkspaceDraft').mockResolvedValue({ workspace: {} as never, createdVersionId: 'draft-1' })

    await withPersistenceMode('local-json', async () => {
      const result = await dispatchWorkspaceRequest('POST', '/api/orgmaster/workspace/versions', {
        sourceVersionId: 'current-1', name: 'Draft A', expectedManifestRevision: 'manifest-1', actorPrincipalId: 'forged', updatedBy: 'forged',
      })
      expect(result.statusCode).toBe(201)
    })

    expect(create).toHaveBeenCalledWith(process.cwd(), 'current-1', 'Draft A', 'manifest-1', undefined)
  })
})
