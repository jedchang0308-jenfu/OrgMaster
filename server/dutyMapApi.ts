import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect } from 'vite'
import { buildDutyMapProjection, type DutyMapMethodLinkResult, type DutyMapProjection } from '../src/dutyMap'
import { evaluateVerifiedPrincipalPermission } from '../src/governance/evaluatePermission'
import type { GovernanceActorContext } from '../src/governance/types'
import type { ManagementMethodV1 } from '../src/managementMethods/types'
import type { WorkspaceDocumentResult } from '../src/versionWorkspace'
import { capabilityFor } from './managementMethodAuthorization'
import { getManagementMethodPaths, readManagementMethodStore } from './managementMethodStore'
import { developmentPermissionForActor } from './orgmasterGovernanceIdentity'
import { readStoredGovernanceDocument } from './orgmasterGovernanceStore'
import { persistenceArtifactExists } from './orgmasterPersistenceRepository'
import { verifiedGovernanceActor } from './orgmasterRequestIdentity'
import { getWorkspacePaths, getWorkspaceVersion, WorkspaceStoreError } from './orgmasterWorkspaceStore'
import { DutyMapError, dutyMapReviewInputSchema, reviewDutyMap, type DutyMapReviewDependencies } from './dutyMapReviewService'

export const DUTY_MAP_API_PATH = '/api/orgmaster/duty-map'
export type AuthorizeDutyMapWorkspace = (request: IncomingMessage, write: boolean) => Promise<string | undefined>
export interface DutyMapApiDependencies {
  readVersion?: (root: string, versionId: string) => Promise<WorkspaceDocumentResult>
  readMethods?: (root: string) => Promise<ManagementMethodV1[]>
  canReview?: (root: string, actor: GovernanceActorContext) => Promise<boolean>
  canReadMethod?: (root: string, actor: GovernanceActorContext, method: ManagementMethodV1) => Promise<boolean>
  review?: Omit<DutyMapReviewDependencies, 'loadContext'>
}

async function readVersion(root: string, versionId: string) {
  // Do not let an advisory read bootstrap/migrate a missing local workspace.
  if (!await persistenceArtifactExists(getWorkspacePaths(root).manifest, 'orgmaster-workspace.v1.json')) {
    throw new DutyMapError(503, 'DUTY_MAP_SOURCE_UNAVAILABLE')
  }
  return getWorkspaceVersion(root, versionId)
}
async function readMethods(root: string) {
  if (!await persistenceArtifactExists(getManagementMethodPaths(root).current, 'orgmaster-management-methods.v1.json')) return []
  return (await readManagementMethodStore(root)).store.methods
}
async function canReview(root: string, actor: GovernanceActorContext) {
  const local = developmentPermissionForActor(actor, 'orgmaster.duty_map.review')
  if (local !== null) return local
  const { document } = await readStoredGovernanceDocument(root)
  return evaluateVerifiedPrincipalPermission(document, actor, 'orgmaster.duty_map.review').status === 'allowed'
}

function send(response: ServerResponse, status: number, payload: unknown) {
  if (response.destroyed || response.writableEnded) return
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(payload))
}
export function mapDutyMapError(error: unknown): { status: number; code: string } {
  if (error instanceof DutyMapError) return { status: error.status, code: error.code }
  if (error instanceof WorkspaceStoreError) {
    return error.code === 'WORKSPACE_ENTRY_NOT_FOUND' ? { status: 404, code: 'WORKSPACE_ENTRY_NOT_FOUND' }
      : { status: 503, code: 'DUTY_MAP_SOURCE_UNAVAILABLE' }
  }
  // authorizeWorkspace owns its error class; preserve its public access decision only.
  const access = error as { status?: unknown; code?: unknown } | null
  if (access && [401, 403, 503].includes(Number(access.status))
    && typeof access.code === 'string' && /^WORKSPACE_[A-Z_]+$/.test(access.code)) {
    return { status: Number(access.status), code: access.code }
  }
  return { status: 503, code: 'DUTY_MAP_UNAVAILABLE' }
}

function versionIdFrom(url: URL) {
  const values = url.searchParams.getAll('versionId')
  if (values.length !== 1 || !/^[A-Za-z0-9-]{1,80}$/.test(values[0])) throw new DutyMapError(400, 'DUTY_MAP_INPUT_INVALID')
  return values[0]
}
async function readJson(request: IncomingMessage) {
  if (!/^application\/json(?:\s*;|$)/i.test(String(request.headers['content-type'] ?? ''))) {
    throw new DutyMapError(400, 'DUTY_MAP_INPUT_INVALID')
  }
  let length = 0
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk)
    length += bytes.length
    if (length > 16_384) throw new DutyMapError(400, 'DUTY_MAP_INPUT_INVALID')
    chunks.push(bytes)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown }
  catch { throw new DutyMapError(400, 'DUTY_MAP_INPUT_INVALID') }
}

function methodLinks(projection: DutyMapProjection, methodId: string): DutyMapMethodLinkResult {
  const result: DutyMapMethodLinkResult = { versionId: projection.versionId, revision: projection.revision, methodId, links: [] }
  const map = projection.map
  if (!map) return result
  const seen = new Set<string>()
  for (const link of map.methodLinks.filter(value => value.methodId === methodId)) {
    const group = link.target.kind === 'group' ? map.groups.find(value => value.id === link.target.id)
      : map.groups.find(value => value.id === map.memberships.find(member => member.dutyId === link.target.id)?.groupId)
    const department = projection.departments.find(value => value.id === group?.departmentId)
    const title = link.target.kind === 'group' ? group?.title : projection.duties.find(value => value.id === link.target.id)?.title
    const key = `${link.target.kind}:${link.target.id}`
    if (!group || !department || !title || seen.has(key)) continue
    seen.add(key)
    result.links.push({ target: link.target, title, departmentId: department.id, departmentName: department.name, groupId: group.id, groupTitle: group.title })
  }
  return result
}

/** Reads use exactly the existing workspace read boundary, never governance write access. */
export function createOrgmasterDutyMapMiddleware(root: string, authorizeWorkspace: AuthorizeDutyMapWorkspace,
  dependencies: DutyMapApiDependencies = {}): Connect.NextHandleFunction {
  const mayReadMethod = dependencies.canReadMethod ?? ((directory, actor) => capabilityFor(directory, actor, 'readReadable'))
  const mayReview = dependencies.canReview ?? canReview
  const loadVersion = dependencies.readVersion ?? readVersion
  const loadMethods = dependencies.readMethods ?? readMethods
  return (request, response, next) => {
    const pathname = request.url?.split('?')[0] ?? ''
    if (pathname !== DUTY_MAP_API_PATH && !pathname.startsWith(DUTY_MAP_API_PATH + '/')) return next()
    const controller = new AbortController()
    const cancel = () => controller.abort()
    const closed = () => { if (!response.writableEnded) cancel() }
    request.once('aborted', cancel)
    response.once('close', closed)
    const run = async () => {
      const actor = verifiedGovernanceActor(request)
      if (!actor?.principalId.trim()) throw new DutyMapError(401, 'IDENTITY_CONTEXT_REQUIRED')
      const authorize = async () => {
        const principal = await authorizeWorkspace(request, false)
        if (principal !== undefined && principal !== actor.principalId) throw new DutyMapError(403, 'WORKSPACE_ACCESS_FORBIDDEN')
      }
      await authorize()
      const url = new URL(request.url ?? '/', 'http://orgmaster.local')
      const projectionFor = async (versionId: string, includeMethods: boolean) => {
        const selected = await loadVersion(root, versionId)
        if (selected.version.status !== 'active') throw new DutyMapError(404, 'WORKSPACE_ENTRY_NOT_FOUND')
        const reviewAllowed = await mayReview(root, actor)
        const methods = includeMethods ? await loadMethods(root) : []
        const readable = []
        for (const method of methods) {
          if (method.readableSnapshot && await mayReadMethod(root, actor, method)) {
            readable.push({ id: method.id, code: method.code, title: method.readableSnapshot.title })
          }
        }
        const projection = buildDutyMapProjection(selected.document.state, {
          versionId: selected.version.id, versionName: selected.version.name,
          versionKind: selected.version.kind, revision: selected.version.revision,
        }, readable, reviewAllowed)
        const readableIds = new Set(readable.map(method => method.id))
        if (projection.map) projection.map.methodLinks = projection.map.methodLinks.filter(link => readableIds.has(link.methodId))
        return projection
      }
      if (pathname === DUTY_MAP_API_PATH && request.method === 'GET') {
        send(response, 200, await projectionFor(versionIdFrom(url), true)); return
      }
      if (pathname === DUTY_MAP_API_PATH + '/method-links' && request.method === 'GET') {
        const versionId = versionIdFrom(url)
        const methodId = url.searchParams.get('methodId')
        if (url.searchParams.getAll('methodId').length !== 1 || !methodId || methodId.length > 200) throw new DutyMapError(400, 'DUTY_MAP_INPUT_INVALID')
        const projection = await projectionFor(versionId, true)
        if (!projection.methods.some(method => method.id === methodId)) throw new DutyMapError(404, 'METHOD_NOT_FOUND')
        send(response, 200, methodLinks(projection, methodId)); return
      }
      if (pathname === DUTY_MAP_API_PATH + '/reviews' && request.method === 'POST') {
        const parsed = dutyMapReviewInputSchema.safeParse(await readJson(request))
        if (!parsed.success) throw new DutyMapError(400, 'DUTY_MAP_INPUT_INVALID')
        const result = await reviewDutyMap(root, actor, parsed.data, {
          ...dependencies.review,
          loadContext: async () => {
            let projection: DutyMapProjection
            try {
              await authorize()
              projection = await projectionFor(parsed.data.versionId, false)
            } catch (error) {
              const mapped = mapDutyMapError(error)
              throw new DutyMapError(mapped.status, mapped.code)
            }
            // Existing workspace roles grant the entire selected version; the review
            // permission evaluator accepts only effective global OrgMaster grants.
            return { projection, fullCompanyRead: true }
          },
        }, controller.signal)
        send(response, 200, result); return
      }
      if ([DUTY_MAP_API_PATH, DUTY_MAP_API_PATH + '/method-links', DUTY_MAP_API_PATH + '/reviews'].includes(pathname)) {
        response.setHeader('Allow', pathname.endsWith('/reviews') ? 'POST' : 'GET')
        throw new DutyMapError(405, 'METHOD_NOT_ALLOWED')
      }
      throw new DutyMapError(404, 'DUTY_MAP_NOT_FOUND')
    }
    void run().catch(error => {
      const mapped = mapDutyMapError(error)
      send(response, mapped.status, { error: mapped.code })
    }).finally(() => {
      request.removeListener('aborted', cancel)
      response.removeListener('close', closed)
    })
  }
}
