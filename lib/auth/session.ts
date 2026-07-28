// Stateless signed session cookie (server-only). Payload { id, exp }, base64url-encoded,
// HMAC-SHA256 signed with SESSION_SECRET. No server-side session store — everything
// needed to verify a session lives in the cookie itself.
//
// Framework-agnostic on purpose (no next/headers here) so `proxy.ts` — which gets a
// plain cookie string off the request, not the cookies() API — can verify with it too.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'session'
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days — fine for a semester pilot

export interface SessionPayload {
  id: string
  exp: number // unix seconds
}

function secret(): string {
  const s = process.env.SESSION_SECRET
  if (!s) {
    throw new Error(
      'SESSION_SECRET is not set. Set it in .env.local (see .env.local.example) — refusing to sign or verify sessions without it.'
    )
  }
  return s
}

function sign(payloadB64: string): string {
  return createHmac('sha256', secret()).update(payloadB64).digest('base64url')
}

/** Generate the opaque student id: 's_' + 12 random bytes, base64url. Never the email. */
export function generateStudentId(): string {
  return `s_${randomBytes(12).toString('base64url')}`
}

export function signSession(id: string, maxAgeSeconds = SESSION_MAX_AGE_SECONDS): string {
  const payload: SessionPayload = { id, exp: Math.floor(Date.now() / 1000) + maxAgeSeconds }
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${payloadB64}.${sign(payloadB64)}`
}

/** Verify signature and expiry. Returns null on any failure — never throws on bad input. */
export function readSession(token: string | undefined | null): SessionPayload | null {
  if (!token) return null
  const dot = token.lastIndexOf('.')
  if (dot < 0) return null
  const payloadB64 = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  if (!payloadB64 || !sig) return null

  const expected = sign(payloadB64)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  let payload: SessionPayload
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (typeof payload?.id !== 'string' || typeof payload?.exp !== 'number') return null
  if (payload.exp < Math.floor(Date.now() / 1000)) return null
  return payload
}

/** Cookie flags shared by every route/response that sets or clears the session cookie. */
export function sessionCookieOptions(maxAgeSeconds = SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: maxAgeSeconds,
  }
}
