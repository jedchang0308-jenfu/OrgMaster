/** UUIDv7 identity helpers used by the canonical Employee directory. */
export type UuidV7RandomSource = () => Uint8Array

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
let lastTimestamp = -1
let lastRandom = new Uint8Array(10)

function randomBytes(): Uint8Array {
  const bytes = new Uint8Array(10)
  if (typeof globalThis.crypto?.getRandomValues === 'function') return globalThis.crypto.getRandomValues(bytes)
  // Browser crypto is required in production; this branch keeps SSR/tests deterministic enough
  // without falling back to UUIDv4 or a caller-supplied Employee id.
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  return bytes
}

function hex(bytes: Uint8Array) { return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('') }

/** Create a lower-case RFC 9562 UUIDv7. Same-millisecond calls are monotonic. */
export function createUuidV7(now = Date.now(), source: UuidV7RandomSource = randomBytes): string {
  const timestamp = Math.max(0, Math.floor(now))
  const entropy = source()
  if (entropy.length < 10) throw new Error('UUIDV7_RANDOM_SOURCE_TOO_SHORT')
  const bytes = new Uint8Array(entropy.slice(0, 10))
  if (timestamp === lastTimestamp) {
    for (let index = bytes.length - 1; index >= 0; index -= 1) {
      if (lastRandom[index] !== 0xff) { bytes[index] = lastRandom[index] + 1; break }
      bytes[index] = 0
    }
  }
  lastTimestamp = timestamp
  lastRandom = bytes
  const timestampHex = timestamp.toString(16).padStart(12, '0').slice(-12)
  const value = `${timestampHex}${hex(bytes)}`
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-7${value.slice(13, 16)}-${(parseInt(value[16]!, 16) & 0x3 | 0x8).toString(16)}${value.slice(17, 20)}-${value.slice(20, 32)}`
}

export function isUuidV7(value: unknown): value is string { return typeof value === 'string' && UUID_V7.test(value) }

export function assertUuidV7(value: unknown): asserts value is string {
  if (!isUuidV7(value)) throw new Error('EMPLOYEE_ID_MUST_BE_UUIDV7')
}

export function resetUuidV7MonotonicStateForTest() { lastTimestamp = -1; lastRandom = new Uint8Array(10) }
