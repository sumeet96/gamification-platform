'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { useGame } from '@/lib/game/game-context'

/** Signs the student out and mints a fresh client session so the next student on
 *  a shared classroom laptop never inherits the previous one's sessionId/game
 *  state — without this, their events would still write against the old
 *  session, and app/api/events/route.ts derives student_id from the cookie, so
 *  a stuck cookie means silent cross-student contamination of the DSR dataset.
 *  Its own client component so app/dashboard/page.tsx can stay a server
 *  component. Mirrors the logout button that used to live on the pre-D1
 *  app/page.tsx (see `git show HEAD:app/page.tsx`), including the resetSession()
 *  call it made. */
export default function LogoutButton() {
  const router = useRouter()
  const { resetSession } = useGame()

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      resetSession()
      router.push('/login')
      router.refresh()
    }
  }

  return (
    <button
      onClick={logout}
      className="group flex items-center gap-2 rounded-xl bg-slate-800/60 border border-slate-700/50 px-4 py-2 shadow-lg backdrop-blur-sm text-sm font-semibold text-slate-300 hover:bg-rose-500/10 hover:border-rose-500/40 hover:text-rose-300 transition-all duration-300"
    >
      <LogOut className="w-4 h-4 transition-colors group-hover:text-rose-300" />
      Log out
    </button>
  )
}
