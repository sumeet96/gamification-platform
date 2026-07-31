'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { GameConfig, RoundSummary } from './engine'
import { logEvent, type GameEvent } from '@/lib/log/logEvent'

interface SessionTotals {
  net: number
  potential: number
  roundsPlayed: number
  continues: number // "keep going" count — the persistence dependent variable
  correct: number
  wrong: number
  answered: number
}

const EMPTY_SESSION: SessionTotals = {
  net: 0, potential: 0, roundsPlayed: 0, continues: 0, correct: 0, wrong: 0, answered: 0,
}

interface GameState {
  sessionId: string
  config: GameConfig | null
  session: SessionTotals
  lastRound: RoundSummary | null
  // The student id this tab believes it's playing as (see fetchStudentId below).
  // Exposed so callers that POST outside of emit()/logEvent -- namely
  // app/quiz/page.tsx's direct fetch to /api/answer -- can attach the same
  // cross-tab mismatch guard app/api/events/route.ts already gets via emit()
  // (package Q1 FIX 6). Never trusted server-side as the identity to write.
  studentId: string | null
  setConfig: (c: GameConfig) => void
  recordRound: (r: RoundSummary) => void
  registerContinue: () => void
  resetSession: () => void
  emit: (e: Omit<GameEvent, 'session_id' | 'client_student_id'>) => void
}

const GameContext = createContext<GameState | null>(null)
const STORAGE_KEY = 'alg.session.v1'

// Ask the server who this tab is signed in as, straight from the session cookie —
// used only as a client-side mismatch signal (see lib/log/logEvent.ts and
// app/api/events/route.ts), never trusted as the identity written to the DB.
async function fetchStudentId(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/me')
    if (!res.ok) return null
    const data = await res.json().catch(() => null)
    return data?.ok && typeof data.id === 'string' ? data.id : null
  } catch {
    return null
  }
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState('')
  const [config, setConfigState] = useState<GameConfig | null>(null)
  const [session, setSession] = useState<SessionTotals>(EMPTY_SESSION)
  const [lastRound, setLastRound] = useState<RoundSummary | null>(null)
  // The student id this tab currently believes it's playing as. Populated from
  // /api/auth/me, not from anything the server would trust back — see fetchStudentId.
  // Null until the fetch resolves (or if it fails); events go out without it until then.
  const [studentId, setStudentId] = useState<string | null>(null)
  const hydrated = useRef(false)

  // Hydrate (or start) the session once, after mount.
  useEffect(() => {
    let id = ''
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (raw) {
        const p = JSON.parse(raw)
        id = p.sessionId || ''
        if (p.config) setConfigState(p.config)
        if (p.session) setSession({ ...EMPTY_SESSION, ...p.session })
        if (p.lastRound) setLastRound(p.lastRound)
      }
    } catch {
      /* ignore corrupt storage */
    }
    const isNew = !id
    if (!id) id = (globalThis.crypto?.randomUUID?.() ?? `s_${Date.now()}_${Math.random()}`)
    setSessionId(id)
    hydrated.current = true
    if (isNew) logEvent({ session_id: id, event_type: 'session_start' })
  }, [])

  // Learn who this tab is signed in as, once on mount (independent of session
  // hydration above — it's fine for this to resolve a tick later).
  useEffect(() => {
    let cancelled = false
    fetchStudentId().then((id) => { if (!cancelled) setStudentId(id) })
    return () => { cancelled = true }
  }, [])

  // Persist after hydration.
  useEffect(() => {
    if (!hydrated.current) return
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId, config, session, lastRound }))
    } catch {
      /* ignore */
    }
  }, [sessionId, config, session, lastRound])

  const emit = (e: Omit<GameEvent, 'session_id' | 'client_student_id'>) => {
    if (sessionId) logEvent({ session_id: sessionId, client_student_id: studentId ?? undefined, ...e })
  }

  const setConfig = (c: GameConfig) => setConfigState(c)

  const recordRound = (r: RoundSummary) => {
    setSession((s) => ({
      net: s.net + r.net,
      potential: s.potential + r.potential,
      roundsPlayed: s.roundsPlayed + 1,
      continues: s.continues,
      correct: s.correct + r.correct,
      wrong: s.wrong + r.wrong,
      answered: s.answered + r.answered,
    }))
    setLastRound(r)
  }

  const registerContinue = () => {
    setSession((s) => ({ ...s, continues: s.continues + 1 }))
    emit({ event_type: 'round_continue', mode: config?.mode ?? null, lever: config?.lever ?? null, round: session.roundsPlayed })
  }

  // Called on every identity transition (logout, login, signup) so a session_id
  // never spans two students. Clearing the totals alone isn't enough — sessionId
  // itself must be replaced, otherwise the persist effect below just writes the
  // reset totals back under the *same* old id and the next student inherits it.
  const resetSession = () => {
    try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    const id = globalThis.crypto?.randomUUID?.() ?? `s_${Date.now()}_${Math.random()}`
    setSessionId(id)
    setSession(EMPTY_SESSION)
    setLastRound(null)
    setConfigState(null)
    // The cookie identity just changed (login/signup/logout) — this tab's cached
    // studentId is now stale until re-fetched. Clear it immediately so nothing in
    // between is emitted under the old id, then re-fetch to learn the new one.
    setStudentId(null)
    logEvent({ session_id: id, event_type: 'session_start' })
    fetchStudentId().then(setStudentId)
  }

  return (
    <GameContext.Provider
      value={{ sessionId, config, session, lastRound, studentId, setConfig, recordRound, registerContinue, resetSession, emit }}
    >
      {children}
    </GameContext.Provider>
  )
}

export function useGame(): GameState {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error('useGame must be used within <GameProvider>')
  return ctx
}
