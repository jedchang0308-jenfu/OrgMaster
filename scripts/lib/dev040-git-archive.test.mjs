import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { after, test } from 'node:test'
import { createGitArchive } from './dev012-owner-stage-executor.mjs'
import { readGitSourceArchive, matchGitSourceArchive } from './dev040-git-archive.mjs'

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))
const root = fs.mkdtempSync(path.join(repositoryRoot, '.dev040-git-archive-'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
function git(...args) {
  const result = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=.git/no-hooks', ...args],
    { cwd: root, encoding: null, windowsHide: true, maxBuffer: 32 * 1024 * 1024 })
  assert.equal(result.status, 0, result.stderr?.toString() || result.error?.message)
  return result.stdout
}
after(() => {
  assert.equal(path.dirname(path.resolve(root)), path.resolve(repositoryRoot))
  assert.ok(path.basename(root).startsWith('.dev040-git-archive-'))
  fs.rmSync(root, { recursive: true, force: true })
})
git('init', '--quiet')
git('config', 'user.name', 'Archive Profile Test')
git('config', 'user.email', 'archive-profile-test@example.invalid')
git('config', 'core.autocrlf', 'false')
git('config', 'core.eol', 'lf')
fs.writeFileSync(path.join(root, '.gitattributes'), '*.sh text eol=lf\n*.mjs text=auto\n')
const shell = Buffer.from('#!/bin/sh\nprintf "fixture"\n')
const moduleSource = Buffer.from('export const fixture = "original"\n')
const binary = Buffer.from([0, 1, 13, 10, 255, 10])
fs.writeFileSync(path.join(root, 'run.sh'), shell)
fs.writeFileSync(path.join(root, 'module.mjs'), moduleSource)
fs.writeFileSync(path.join(root, 'binary.dat'), binary)
git('add', '.')
git('commit', '--quiet', '-m', 'isolated archive fixture')
const revision = git('rev-parse', 'HEAD').toString().trim()
const tree = git('ls-tree', '-r', '--full-tree', revision)

// Test-only tar inspection locates mutations; production matching never parses or normalizes bytes.
function entries(tar) {
  const result = []
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const header = tar.subarray(offset, offset + 512)
    if (header.every(byte => byte === 0)) break
    const name = header.subarray(0, 100).toString().replace(/\0.*$/su, '')
    const size = Number.parseInt(header.subarray(124, 136).toString().replace(/\0.*$/su, '').trim(), 8) || 0
    const end = offset + 512 + Math.ceil(size / 512) * 512
    result.push({ name, type: String.fromCharCode(header[156]), start: offset, end,
      data: tar.subarray(offset + 512, offset + 512 + size) })
    offset = end
  }
  return result
}
function pinnedArchive(autocrlf, eol) {
  return git('-c', `core.autocrlf=${autocrlf}`, '-c', `core.eol=${eol}`, '-c', 'tar.umask=0002',
    'archive', '--format=tar', '--prefix=source/', revision)
}

test('fresh canonical archives ignore host autocrlf/eol/umask while honoring committed attributes', () => {
  git('config', 'core.autocrlf', 'true')
  git('config', 'core.eol', 'crlf')
  git('config', 'tar.umask', '0077')
  const fromWindowsConfig = readGitSourceArchive(root, revision)
  assert.deepEqual(createGitArchive(root, revision), fromWindowsConfig)
  git('config', 'core.autocrlf', 'false')
  git('config', 'core.eol', 'lf')
  git('config', 'tar.umask', '0000')
  const canonical = readGitSourceArchive(root, revision, 'CANONICAL_GIT_LF')
  assert.deepEqual(canonical, fromWindowsConfig)
  assert.deepEqual(canonical, pinnedArchive('false', 'lf'))
  assert.deepEqual(createGitArchive(root, revision), canonical)
  const files = new Map(entries(canonical).map(entry => [entry.name, entry.data]))
  assert.deepEqual(files.get('source/run.sh'), shell)
  assert.deepEqual(files.get('source/module.mjs'), moduleSource)
  assert.deepEqual(files.get('source/binary.dat'), binary)
  assert.deepEqual(matchGitSourceArchive(root, revision, canonical),
    { exportProfile: 'CANONICAL_GIT_LF', tarSha256: hash(canonical) })
  assert.equal(git('status', '--porcelain').toString(), '')
  assert.deepEqual(git('ls-tree', '-r', '--full-tree', revision), tree)
})

test('exact legacy CRLF archives match from an LF-configured host without changing shell or binary bytes', () => {
  git('config', 'core.autocrlf', 'false')
  git('config', 'core.eol', 'lf')
  const legacy = pinnedArchive('true', 'crlf')
  assert.deepEqual(readGitSourceArchive(root, revision, 'LEGACY_GIT_CRLF'), legacy)
  assert.notDeepEqual(legacy, readGitSourceArchive(root, revision))
  const files = new Map(entries(legacy).map(entry => [entry.name, entry.data]))
  assert.deepEqual(files.get('source/run.sh'), shell)
  assert.deepEqual(files.get('source/module.mjs'), Buffer.from('export const fixture = "original"\r\n'))
  assert.deepEqual(files.get('source/binary.dat'), binary)
  assert.deepEqual(matchGitSourceArchive(root, revision, legacy),
    { exportProfile: 'LEGACY_GIT_CRLF', tarSha256: hash(legacy) })
  assert.deepEqual(git('ls-tree', '-r', '--full-tree', revision), tree)
})

test('exact matching rejects byte/content tampering, missing/extra entries and altered pax metadata', () => {
  const canonical = readGitSourceArchive(root, revision)
  const listing = entries(canonical)
  const moduleEntry = listing.find(entry => entry.name === 'source/module.mjs')
  const pax = listing.find(entry => entry.type === 'g')
  assert.ok(moduleEntry)
  assert.ok(pax?.data.includes(Buffer.from(`comment=${revision}`)))
  const byteTamper = Buffer.from(canonical)
  byteTamper[byteTamper.length - 1] = 1
  const contentTamper = Buffer.from(canonical)
  contentTamper[moduleEntry.start + 512 + moduleEntry.data.indexOf('original')] ^= 1
  const missing = Buffer.concat([canonical.subarray(0, moduleEntry.start), canonical.subarray(moduleEntry.end)])
  const terminator = listing.at(-1).end
  const extra = Buffer.concat([canonical.subarray(0, terminator), canonical.subarray(moduleEntry.start, moduleEntry.end),
    canonical.subarray(terminator)])
  const paxTamper = Buffer.from(canonical)
  paxTamper[pax.start + 512 + pax.data.indexOf(revision)] ^= 1
  for (const [label, bytes] of Object.entries({ byteTamper, contentTamper, missing, extra, paxTamper })) {
    assert.throws(() => matchGitSourceArchive(root, revision, bytes),
      error => error.code === 'SOURCE_ARCHIVE_PROFILE_MISMATCH', label)
  }
})

test('only the two explicit Git profiles are available; no generic normalization fallback', () => {
  for (const profile of ['NORMALIZED', 'canonical_git_lf', null]) {
    assert.throws(() => readGitSourceArchive(root, revision, profile),
      error => error.code === 'SOURCE_ARCHIVE_PROFILE_INVALID')
  }
  for (const expanded of [Buffer.alloc(0), 'not an archive', new Uint8Array([1])]) {
    assert.throws(() => matchGitSourceArchive(root, revision, expanded),
      error => error.code === 'SOURCE_ARCHIVE_PROFILE_MISMATCH')
  }
})

test('real historical Windows build source reproduces the exact original CRLF and canonical LF tar hashes', () => {
  // Required CI fetches full ancestry: absence of this real source must fail, never skip.
  const oldRevision = '7b4caed847003509ca8668f0153952e05034c7f5'
  const legacyHash = '008f3bcd1d022e8b70e7b6e8eb47d937148bbcaad085a4a45cc59d5b85c219f4'
  const canonicalHash = 'c5162809069b6b02fa34dcf4a534d05b5d5c76cc84cd0f7a67dcc574247df896'
  const legacy = readGitSourceArchive(repositoryRoot, oldRevision, 'LEGACY_GIT_CRLF')
  const canonical = readGitSourceArchive(repositoryRoot, oldRevision, 'CANONICAL_GIT_LF')
  assert.equal(hash(legacy), legacyHash)
  assert.equal(hash(canonical), canonicalHash)
  assert.deepEqual(matchGitSourceArchive(repositoryRoot, oldRevision, legacy),
    { exportProfile: 'LEGACY_GIT_CRLF', tarSha256: legacyHash })
  assert.deepEqual(matchGitSourceArchive(repositoryRoot, oldRevision, canonical),
    { exportProfile: 'CANONICAL_GIT_LF', tarSha256: canonicalHash })
})
