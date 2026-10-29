import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrgmasterPersistenceError, resolveOrgmasterPersistenceMode, warnOrgmasterLocalPersistenceDiagnostic, withOrgmasterLocalSandboxPersistenceTarget } from './orgmasterPersistenceRepository'

afterEach(() => vi.unstubAllEnvs())

describe('OrgMaster local sandbox persistence scope', () => {
  it('routes normal persistence through the verified request target without changing process environment', async () => {
    vi.stubEnv('ORGMASTER_PERSISTENCE_MODE', '')
    vi.stubEnv('ORGMASTER_POSTGRES_URL', '')
    expect(resolveOrgmasterPersistenceMode()).toBe('local-json')
    const mode = await withOrgmasterLocalSandboxPersistenceTarget(
      'postgres://sandbox_runtime:synthetic@127.0.0.1:53761/jenfu_local_orgmaster_test',
      async () => {
        await Promise.resolve()
        return resolveOrgmasterPersistenceMode()
      },
    )
    expect(mode).toBe('cloud-sql')
    expect(resolveOrgmasterPersistenceMode()).toBe('local-json')
    expect(process.env.ORGMASTER_POSTGRES_URL).toBe('')
  })

  it('rejects a conflicting formal persistence target before downstream database access', () => {
    vi.stubEnv('ORGMASTER_PERSISTENCE_MODE', 'cloud-sql')
    vi.stubEnv('ORGMASTER_POSTGRES_URL', 'postgres://formal.invalid/db')
    expect(() => withOrgmasterLocalSandboxPersistenceTarget(
      'postgres://sandbox_runtime:synthetic@127.0.0.1:53761/jenfu_local_orgmaster_test',
      () => undefined,
    )).toThrowError(OrgmasterPersistenceError)
  })

  it('emits only sanitized local source diagnostics with a recognized stage and artifact key', () => {
    vi.stubEnv('ORGMASTER_PERSISTENCE_MODE', '')
    vi.stubEnv('ORGMASTER_POSTGRES_URL', '')
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const failure = Object.assign(new Error('postgres://private-user:private-password@db.invalid/private-db?secret=value'), { code: '42501' })
    try {
      warnOrgmasterLocalPersistenceDiagnostic('persistence_artifact_read', failure, 'orgmaster-versions/current-local.json')
      expect(warning).not.toHaveBeenCalled()

      withOrgmasterLocalSandboxPersistenceTarget(
        'postgres://sandbox_runtime:synthetic@127.0.0.1:53761/jenfu_local_orgmaster_test',
        () => warnOrgmasterLocalPersistenceDiagnostic('persistence_artifact_read', failure, 'orgmaster-versions/current-local.json'),
      )
      const line = String(warning.mock.calls[0][0])
      const record = JSON.parse(line)
      expect(record).toMatchObject({
        event: 'orgmaster_local_persistence_read_failed', stage: 'persistence_artifact_read',
        persistenceTargetActive: true, artifactKey: 'orgmaster-versions/current-local.json',
        errorName: 'Error', errorCode: '42501',
      })
      expect(record.stackFrames.length).toBeGreaterThan(0)
      expect(line).not.toContain('private-user')
      expect(line).not.toContain('private-password')
      expect(line).not.toContain('db.invalid')
      expect(line).not.toContain('secret=value')
      expect(line).not.toContain('message')
    } finally {
      warning.mockRestore()
    }
  })

  it('bounds validation diagnostics to schema codes and paths only', () => {
    vi.stubEnv('ORGMASTER_PERSISTENCE_MODE', '')
    vi.stubEnv('ORGMASTER_POSTGRES_URL', '')
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      withOrgmasterLocalSandboxPersistenceTarget(
        'postgres://sandbox_runtime:synthetic@127.0.0.1:53761/jenfu_local_orgmaster_test',
        () => warnOrgmasterLocalPersistenceDiagnostic(
          'governance_v3_document_validate',
          Object.assign(new Error('private validation details'), { code: 'GOVERNANCE_READ_FAILED' }),
          'orgmaster-governance.v3.json',
          { validationIssues: Array.from({ length: 12 }, (_, index) => ({
            code: 'SCHEMA_UNSUPPORTED', path: `draft.roleAssignments[${index}].metadata`,
            message: 'private message', value: 'private value',
          })).concat([{ code: 'PRIVATE_CODE', path: 'private-user@example.invalid', message: 'private message', value: 'private value' }]) },
        ),
      )
      const line = String(warning.mock.calls[0][0])
      const record = JSON.parse(line)
      expect(record.validationIssues).toHaveLength(10)
      expect(record.validationIssues[0]).toEqual({ code: 'SCHEMA_UNSUPPORTED', path: 'draft.roleAssignments[0].metadata' })
      expect(line).not.toContain('private validation details')
      expect(line).not.toContain('private message')
      expect(line).not.toContain('private value')
      expect(line).not.toContain('private-user')
      expect(line).not.toContain('example.invalid')
    } finally {
      warning.mockRestore()
    }
  })
})
