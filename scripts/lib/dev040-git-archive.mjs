import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const profiles = Object.freeze({
  CANONICAL_GIT_LF: ['core.autocrlf=false', 'core.eol=lf', 'tar.umask=0002'],
  LEGACY_GIT_CRLF: ['core.autocrlf=true', 'core.eol=crlf', 'tar.umask=0002'],
})
function fail(code) { throw Object.assign(new Error(code), { code }) }

/** Git itself applies committed attributes; no caller-side byte normalization. */
export function readGitSourceArchive(root, revision, profile = 'CANONICAL_GIT_LF') {
  if (typeof root !== 'string' || !/^[a-f0-9]{40}$/u.test(revision ?? '') || !Object.hasOwn(profiles, profile)) fail('SOURCE_ARCHIVE_PROFILE_INVALID')
  const args = [...profiles[profile].flatMap(value => ['-c', value]), 'archive', '--format=tar', '--prefix=source/', revision]
  const result = spawnSync('git', args, { cwd: root, encoding: null, maxBuffer: 256 * 1024 * 1024, windowsHide: true })
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout) || !result.stdout.length) fail('SOURCE_ARCHIVE_FAILED')
  return result.stdout
}

/** Original archive hashes remain immutable; accept only exact reproducible bytes. */
export function matchGitSourceArchive(root, revision, expanded) {
  if (!Buffer.isBuffer(expanded) || !expanded.length || expanded.length > 256 * 1024 * 1024) fail('SOURCE_ARCHIVE_PROFILE_MISMATCH')
  for (const exportProfile of Object.keys(profiles)) {
    if (expanded.equals(readGitSourceArchive(root, revision, exportProfile))) {
      return { exportProfile, tarSha256: createHash('sha256').update(expanded).digest('hex') }
    }
  }
  fail('SOURCE_ARCHIVE_PROFILE_MISMATCH')
}
