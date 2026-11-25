import type { Connect, Plugin } from 'vite'
import { verifiedGovernanceActor } from './orgmasterRequestIdentity'
import { UserDirectoryError, type createUsersService } from './orgmasterUsers'
export const USERS_PATH = '/api/orgmaster/users/v1'
export function createUsersMiddleware(service?: ReturnType<typeof createUsersService>): Connect.NextHandleFunction {
  return (request, response, next) => {
    const url = new URL(request.url ?? '/', 'http://orgmaster.local')
    if (url.pathname !== USERS_PATH) return next()
    const run = async () => {
      const actor = verifiedGovernanceActor(request)
      if (!actor) throw new UserDirectoryError(401, 'IDENTITY_CONTEXT_REQUIRED')
      if (request.method !== 'GET') throw new UserDirectoryError(405, 'METHOD_NOT_ALLOWED')
      if (url.search) throw new UserDirectoryError(400, 'USER_DIRECTORY_REQUEST_INVALID')
      if (!service) throw new UserDirectoryError(503, 'USER_DIRECTORY_UNAVAILABLE')
      return service.read(actor)
    }
    const send = (status: number, value: unknown) => {
      response.statusCode = status; response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.setHeader('Cache-Control', 'private, no-store'); response.end(JSON.stringify(value))
    }
    void run().then(value => send(200, value)).catch(error => {
      request.resume()
      const known = error instanceof UserDirectoryError
      send(known ? error.status : 503, { code: known ? error.code : 'USER_DIRECTORY_UNAVAILABLE' })
    })
  }
}
export function usersApiPlugin(runtime: () => { users?: ReturnType<typeof createUsersService> }): Plugin {
  const configure = (server: { middlewares: { use: (middleware: Connect.NextHandleFunction) => unknown } }) => { server.middlewares.use(createUsersMiddleware(runtime().users)) }
  return { name: 'orgmaster-users-api', configureServer: configure, configurePreviewServer: configure }
}
