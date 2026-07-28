import { NextResponse, type NextRequest } from 'next/server'
import { readSession, SESSION_COOKIE } from '@/lib/auth/session'

// Route gate for the game itself. This is Next 16's `proxy.ts` convention (the
// renamed, Node.js-runtime successor to `middleware.ts` — see
// https://nextjs.org/docs/messages/middleware-to-proxy), which is why a signed-cookie
// check using node:crypto (via lib/auth/session) can run here at all: proxy always
// runs on the Node.js runtime, unlike edge middleware.
//
// Deny by default: nothing is reachable without a valid session except the auth pages
// themselves and the two API routes their forms submit to. The matcher below already
// excludes Next's internals/static assets, so this list only needs the app's own public
// surface.
const PUBLIC_PAGES = ['/login', '/signup']
// Logout is public on purpose: signing out must always work, including when the
// cookie is already expired or malformed. Gating it means the 401 fires before the
// handler runs, so the Set-Cookie that clears the stale cookie never gets sent and
// the user is stuck with it. There is nothing to protect — the route only clears
// the caller's own cookie. Flagged independently by two reviewers, 28 Jul 2026.
const PUBLIC_API_ROUTES = ['/api/auth/login', '/api/auth/signup', '/api/auth/logout']

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const session = readSession(req.cookies.get(SESSION_COOKIE)?.value)

  const isPublicPage = PUBLIC_PAGES.includes(pathname)
  if (isPublicPage) {
    // A signed-in visitor doesn't need the login/signup form — send them to the
    // dashboard instead of showing it again.
    if (session) {
      const url = req.nextUrl.clone()
      url.pathname = '/'
      url.search = ''
      return NextResponse.redirect(url)
    }
    return NextResponse.next()
  }

  if (PUBLIC_API_ROUTES.includes(pathname)) return NextResponse.next()

  if (session) return NextResponse.next()

  // Unauthenticated and not on the public list. API routes get a 401 so fetch()
  // callers see a clean failure instead of following an HTML redirect; pages get
  // sent to /login.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 })
  }

  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.search = ''
  return NextResponse.redirect(url)
}

export const config = {
  // Everything except Next's internals and the favicon — deny-by-default happens
  // inside proxy() above, not via a narrow matcher.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
