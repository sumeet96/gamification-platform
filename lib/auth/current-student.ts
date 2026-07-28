// Server-only helper for Server Components and Route Handlers. Never import this
// (or anything under lib/auth/) into a 'use client' file — node:crypto and
// next/headers both break the client bundle.

import { cookies } from 'next/headers'
import { readSession, SESSION_COOKIE } from './session'

export async function getCurrentStudent(): Promise<{ id: string } | null> {
  const jar = await cookies()
  const session = readSession(jar.get(SESSION_COOKIE)?.value)
  return session ? { id: session.id } : null
}
