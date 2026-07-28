// Password hashing (server-only). scrypt with a per-password random salt, stored
// as "<saltHex>:<hashHex>". Never compare hashes with === — timingSafeEqual only.

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const KEY_LENGTH = 64

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer
  return `${salt.toString('hex')}:${derived.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':')
  if (parts.length !== 2) return false
  const [saltHex, hashHex] = parts
  if (!saltHex || !hashHex) return false
  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(hashHex, 'hex')
  // Derive at the fixed KEY_LENGTH regardless of what the stored value decodes to, and
  // reject anything that doesn't decode to exactly KEY_LENGTH bytes before deriving —
  // otherwise a malformed stored hash (e.g. a zero-byte "expected") can make scrypt
  // produce a zero-byte key and timingSafeEqual(<empty>, <empty>) trivially returns true.
  if (salt.length === 0 || expected.length !== KEY_LENGTH) return false
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer
  return timingSafeEqual(derived, expected)
}
