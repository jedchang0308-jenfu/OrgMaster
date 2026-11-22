import assert from 'node:assert/strict'
import { constants, createCipheriv, createDecipheriv, generateKeyPairSync, privateDecrypt, publicEncrypt } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import { createSecureContext } from 'node:tls'
import loader from './dev015-aligned-new-loader-inspection.cjs'

const args = process.argv.slice(2)
assert.ok(args.length === 0 || (args.length === 1 && args[0] === '--base-runtime'), 'Invalid runtime smoke mode')
const baseRuntime = args.length === 1
assert.equal(process.platform, 'linux')
assert.equal(process.arch, 'x64')
assert.equal(process.getuid(), 65532)
assert.equal(process.getgid(), 65532)
assert.equal(process.versions.node, '24.21.0')
const removedPaths = [
  '/usr/lib/x86_64-linux-gnu/libssl.so.3',
  '/usr/lib/x86_64-linux-gnu/libcrypto.so.3',
  '/usr/lib/x86_64-linux-gnu/engines-3/afalg.so',
  '/usr/lib/x86_64-linux-gnu/engines-3/loader_attic.so',
  '/usr/lib/x86_64-linux-gnu/engines-3/padlock.so',
  '/var/lib/dpkg/status.d/libssl3t64',
  '/var/lib/dpkg/status.d/libssl3t64.md5sums',
]
for (const file of removedPaths) {
  assert.throws(() => lstatSync(file), { code: 'ENOENT' }, `Unused OS package path remains: ${file}`)
}
const ca = readFileSync('/etc/ssl/certs/ca-certificates.crt', 'utf8')
assert.match(ca, /-----BEGIN CERTIFICATE-----/u)
createSecureContext({ ca, minVersion: 'TLSv1.2', maxVersion: 'TLSv1.3' })
const key = Buffer.alloc(32, 1)
const iv = Buffer.alloc(12, 2)
const plain = Buffer.from('Principal-only runtime packaging smoke')
const cipher = createCipheriv('aes-256-gcm', key, iv)
const encrypted = Buffer.concat([cipher.update(plain), cipher.final()])
const decipher = createDecipheriv('aes-256-gcm', key, iv)
decipher.setAuthTag(cipher.getAuthTag())
assert.deepEqual(Buffer.concat([decipher.update(encrypted), decipher.final()]), plain)
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 })
const encryptedRsa = publicEncrypt({ key: rsa.publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, plain)
assert.deepEqual(privateDecrypt({ key: rsa.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, encryptedRsa), plain)
// This runs after the final application COPY. A missing app or unloadable addon
// fails instead of silently accepting a base-image-only probe.
const nativeModules = baseRuntime ? [] : loader.collectNativeModules()
const sharedObjects = loader.collectSharedObjectRows(process.report.getReport().sharedObjects)
const osOpenSSL = /\/(?:libssl|libcrypto)\.so(?:\.|$)|\/engines-3\//u
for (const row of sharedObjects) {
  assert.doesNotMatch(row.path, osOpenSSL)
  if (row.physicalPath) assert.doesNotMatch(row.physicalPath, osOpenSSL)
}
assert.doesNotMatch(readFileSync('/proc/self/maps', 'utf8'), osOpenSSL)
console.log(JSON.stringify({ result: 'PASS', mode: baseRuntime ? 'base-runtime' : 'application',
  node: process.versions.node, nodeOpenSSL: process.versions.openssl, uid: process.getuid(), gid: process.getgid(),
  removedPaths, caBundle: 'PASS', tlsContext: 'PASS', authenticatedEncryption: 'PASS', rsaOaep: 'PASS',
  nativeModulesChecked: !baseRuntime, nativeModules, sharedObjects, osOpenSSLLoaded: false }))
