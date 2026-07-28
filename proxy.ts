import { NextResponse, type NextRequest } from 'next/server'
import { readSession, SESSION_COOKIE } from '@/lib/auth/session'

// Route gate for the game itself. This is Next 16's `proxy.ts` convention (the
// renamed, Node.js-runtime successor to `middleware.ts` — see
// https://nextjs.org/docs/messages/middleware-to-proxy), which is why a signed-cookie
// check using node:crypto (via lib/auth/session) can run here at all: proxy always
// runs on the Node.js runtime, unlike edge middleware.
//
// Unauthenticated visitors to /quiz, /game-setup, or /results are sent to /login.
// The dashboard, auth pages, and API routes stay reachable either way.
const PROTECTED_PREFIXES = ['/quiz', '/game-setup', '/results']

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  if (!isProtected) return NextResponse.next()

  const session = readSession(req.cookies.get(SESSION_COOKIE)?.value)
  if (session) return NextResponse.next()

  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.search = ''
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/quiz/:path*', '/game-setup/:path*', '/results/:path*'],
}
