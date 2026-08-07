'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { configBelongsTo, type GameConfig, type RoundSummary } from './engine'
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
  // FIX 5 (A5 review): raw config is deliberately NOT exposed here. A game
  // must go through getConfig(ownerGameId) below -- there is no `config`
  // field to destructure by mistake and accidentally inherit another game's
  // persisted choice (see configBelongsTo's doc comment in lib/game/engine.ts).
  session: SessionTotals
  lastRound: RoundSummary | null
  // The student id this tab believes it's playing as (see fetchStudentId below).
  // Exposed so callers that POST outside of emit()/logEvent -- namely
  // app/quiz/page.tsx's direct fetch to /api/answer -- can attach the same
  // cross-tab mismatch guard app/api/events/route.ts already gets via emit()
  // (package Q1 FIX 6). Never trusted server-side as the identity to write.
  studentId: string | null
  setConfig: (c: GameConfig) => void
  // The one chokepoint for reading the persisted config: returns it only if
  // `config.ownerGameId === ownerGameId`, otherwise null -- exactly as if no
  // config had ever been set. Every game page calls this with its OWN id
  // (its GAME_ID constant, or QUIZ_OWNER_ID for the quiz) instead of reading
  // a raw `config` field, so a foreign game's config can never leak in.
  getConfig: (ownerGameId: string) => GameConfig | null
  recordRound: (r: RoundSummary) => void
  registerContinue: () => void
  // Emits 'round_offer' the first time the results screen actually renders the
  // Keep Going affordance for a given round, and never again for that same round
  // (see the ref guard in the provider below). Takes the round number plus the
  // context fields round_offer carries, mirroring the shape of the round_stop
  // emit already on this screen.
  announceRoundOffer: (round: number, ctx: { game_type?: string | null; mode?: string | null; lever?: string | null }) => void
  // Call on every path that ends a started round WITHOUT it completing normally
  // (a board/question fetch failure, a navigation away mid-round, an unrecoverable
  // submit error, an explicit give-up). See the comment on the implementation
  // below and on 'round_stop' in lib/log/logEvent.ts for why this exists.
  abandonRound: (round: number, ctx: { game_type?: string | null; mode?: string | null; lever?: string | null }) => void
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
  // Guards 'round_offer' so it fires exactly once per round. A ref, not the
  // effect dependency array that calls announceRoundOffer from app/results/page.tsx --
  // that effect can legitimately re-run (provider re-renders, React 19 StrictMode's
  // dev double-invoke) without the round changing, and this ref lives on the
  // provider mounted at the root layout, so it also survives a client-side
  // navigation away from /results and back (the results component itself
  // unmounts/remounts; this does not). Same pattern as app/quiz/page.tsx's
  // commitGuardRef, applied where a ref can outlive the component that needs it.
  const offeredRoundRef = useRef<number | null>(null)
  // Guards abandonRound the same way offeredRoundRef guards announceRoundOffer:
  // two abandonment paths can race for the same round (a board fetch failure
  // and the component's unmount cleanup both firing, say), and this must not
  // turn into two round_stop rows. In-memory only, unlike offeredRoundRef --
  // abandonRound is always called synchronously right before the caller
  // navigates away, so there is no hard-reload window to survive.
  const abandonedRoundRef = useRef<number | null>(null)

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
        // Restore the offer guard too. A ref alone dies on a hard reload, and a student
        // refreshing /results would emit a second round_offer for the same round -- which
        // inflates the denominator of the persistence measure this event exists to provide.
        if (typeof p.offeredRound === 'number') offeredRoundRef.current = p.offeredRound
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
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId, config, session, lastRound, offeredRound: offeredRoundRef.current }))
    } catch {
      /* ignore */
    }
  }, [sessionId, config, session, lastRound])

  const emit = (e: Omit<GameEvent, 'session_id' | 'client_student_id'>) => {
    // FIX (docs/PROJECT_MAP.md:573): an abandoned round never reaches recordRound,
    // so roundsPlayed alone under-counts and the next round's roundNo
    // (session.roundsPlayed + 1, computed in app/quiz/page.tsx) reuses the number
    // the abandoned round already had. round_stop's `round` is already the correct
    // number for however the round ended (roundNo on a mid-round exit, lastRound.round
    // on a completed-then-declined round) -- folding it into roundsPlayed here means
    // the *next* roundNo computed anywhere always comes out past it, without touching
    // the quiz-page call sites that emit round_stop.
    if (e.event_type === 'round_stop' && typeof e.round === 'number') {
      const stoppedRound = e.round
      setSession((s) => (stoppedRound > s.roundsPlayed ? { ...s, roundsPlayed: stoppedRound } : s))
    }
    if (sessionId) logEvent({ session_id: sessionId, client_student_id: studentId ?? undefined, ...e })
  }

  const announceRoundOffer = (round: number, ctx: { game_type?: string | null; mode?: string | null; lever?: string | null }) => {
    if (offeredRoundRef.current === round) return
    offeredRoundRef.current = round
    // Write through immediately rather than waiting for the persist effect: setting a ref
    // changes no state, so that effect does not re-run, and a hard reload before the next
    // state change would lose the guard and double-count the offer.
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId, config, session, lastRound, offeredRound: round }))
    } catch {
      /* ignore — the in-memory ref still guards the common cases */
    }
    emit({ event_type: 'round_offer', round, ...ctx })
  }

  // Exists because the *mechanism* was already shared (emit()'s round_stop
  // bump above) but the *discipline of calling it* was not: quiz's abandoned-
  // round bug (1 Aug 2026) and match's identical reintroduction on its own
  // board-fetch-failure path (package A1) were each a caller forgetting to
  // emit round_stop on one exit path, not a flaw in what round_stop does once
  // emitted. Centralising the call, not just the bookkeeping, is what this
  // helper is for -- every future game should reach for this instead of a
  // bare emit({ event_type: 'round_stop', ... }) on its abandonment paths.
  //
  // Do NOT use this for a decline-after-offer (a student who saw the Keep
  // Going screen and clicked "Back to Dashboard"/"Stop Round"). That is a
  // choice, not an abandonment, and stays a direct emit() call at its own
  // site (see app/results/page.tsx's stop() and app/games/match/page.tsx's
  // stopRound()) so the two cases remain distinguishable in the data purely
  // by whether a round_offer for that round number preceded the round_stop --
  // the entire point of the 1 Aug 2026 round_offer work.
  const abandonRound = (round: number, ctx: { game_type?: string | null; mode?: string | null; lever?: string | null }) => {
    if (abandonedRoundRef.current === round) return
    abandonedRoundRef.current = round
    emit({ event_type: 'round_stop', round, ...ctx })
  }

  const setConfig = (c: GameConfig) => setConfigState(c)
  const getConfig = (ownerGameId: string): GameConfig | null => configBelongsTo(config, ownerGameId)

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
    // A new session means round numbering restarts at 1, so a stale "already
    // offered round 1" guard from the previous student's session must not
    // suppress this one's first offer. abandonedRoundRef must be cleared in
    // the SAME breath -- leaving it set lets the next student's round 1
    // (the same number the previous student's abandoned round already used)
    // hit abandonRound's `=== round` idempotency guard and return silently:
    // no round_stop row at all, roundsPlayed stays 0, and the following Start
    // Round emits a second round_start for round 1. That is exactly the
    // round-number-reuse corruption the 1 Aug persistence work fixed,
    // reintroduced through this helper if only one of the two guards resets.
    offeredRoundRef.current = null
    abandonedRoundRef.current = null
    // The cookie identity just changed (login/signup/logout) — this tab's cached
    // studentId is now stale until re-fetched. Clear it immediately so nothing in
    // between is emitted under the old id, then re-fetch to learn the new one.
    setStudentId(null)
    logEvent({ session_id: id, event_type: 'session_start' })
    fetchStudentId().then(setStudentId)
  }

  return (
    <GameContext.Provider
      value={{ sessionId, session, lastRound, studentId, setConfig, getConfig, recordRound, registerContinue, announceRoundOffer, abandonRound, resetSession, emit }}
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
