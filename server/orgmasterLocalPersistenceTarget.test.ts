import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeOrgmasterLocalSandboxDatabase, createOrgmasterLocalSandboxDatabase } from './orgmasterDatabase'
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

  it('binds an alternate verified loopback port and rejects a conflicting configured target', async () => {
    vi.stubEnv('ORGMASTER_PERSISTENCE_MODE', '')
    vi.stubEnv('ORGMASTER_POSTGRES_URL', '')
    const target = 'postgresql://jenfu_orgmaster_runtime:synthetic@127.0.0.1:58727/jenfu_local_orgmaster_reset'
    const mode = await withOrgmasterLocalSandboxPersistenceTarget(target, async () => {
      await Promise.resolve()
      return resolveOrgmasterPersistenceMode()
    })
    expect(mode).toBe('cloud-sql')
    expect(resolveOrgmasterPersistenceMode()).toBe('local-json')

    vi.stubEnv('ORGMASTER_POSTGRES_URL', 'postgresql://jenfu_orgmaster_runtime:synthetic@127.0.0.1:53761/jenfu_local_orgmaster_reset')
    expect(() => withOrgmasterLocalSandboxPersistenceTarget(target, () => undefined))
      .toThrowError(OrgmasterPersistenceError)
  })

  it('opens only an OrgMaster sandbox target on a legal loopback port', async () => {
    const accepted = 'postgresql://jenfu_orgmaster_runtime:synthetic@127.0.0.1:58727/jenfu_local_orgmaster_reset'
    try {
      expect(createOrgmasterLocalSandboxDatabase(accepted)).toBeDefined()
      expect(() => createOrgmasterLocalSandboxDatabase(
        'postgresql://jenfu_orgmaster_runtime:synthetic@127.0.0.1:58727/jenfu_local_ai_pdm_reset',
      )).toThrow('ORGMASTER_LOCAL_SANDBOX_TARGET_INVALID')
      expect(() => createOrgmasterLocalSandboxDatabase(
        'postgresql://jenfu_orgmaster_runtime:synthetic@127.0.0.1:0/jenfu_local_orgmaster_reset',
      )).toThrow('ORGMASTER_LOCAL_SANDBOX_TARGET_INVALID')
    } finally {
      await closeOrgmasterLocalSandboxDatabase()
    }
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
