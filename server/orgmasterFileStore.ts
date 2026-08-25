import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const locks = new Map<string, Promise<void>>()

export class OrgMasterFileStoreError extends Error {
  constructor(public readonly code: 'ATOMIC_WRITE_FAILED' | 'INVALID_TEMP_FILE', message: string = code) {
    super(message)
    this.name = 'OrgMasterFileStoreError'
  }
}

export function hashFileContent(raw: string) {
  return createHash('sha256').update(raw).digest('hex')
}

export async function fileExists(path: string) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

export async function withOrgMasterRootLock<T>(rootDirectory: string, operation: () => Promise<T>) {
  const key = resolve(rootDirectory)
  const previous = locks.get(key) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolveRelease) => { release = resolveRelease })
  const queued = previous.then(() => current)
  locks.set(key, queued)
  await previous
  try {
    return await operation()
  } finally {
    release()
    if (locks.get(key) === queued) locks.delete(key)
  }
}

export async function writeVerifiedAtomicFile(path: string, raw: string) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, raw, 'utf8')
    const verified = await readFile(temporary, 'utf8')
    if (verified !== raw) throw new OrgMasterFileStoreError('INVALID_TEMP_FILE')
    await rename(temporary, path)
  } catch (error) {
    try { await unlink(temporary) } catch { /* best-effort cleanup; recovery uses journal when applicable */ }
    if (error instanceof OrgMasterFileStoreError) throw error
    throw new OrgMasterFileStoreError('ATOMIC_WRITE_FAILED', error instanceof Error ? error.message : 'atomic write failed')
  }
}
