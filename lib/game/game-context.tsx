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
  setConfig: (c: GameConfig) => void
  recordRound: (r: RoundSummary) => void
  registerContinue: () => void
  resetSession: () => void
  emit: (e: Omit<GameEvent, 'session_id'>) => void
}

const GameContext = createContext<GameState | null>(null)
const STORAGE_KEY = 'alg.session.v1'

export function GameProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState('')
  const [config, setConfigState] = useState<GameConfig | null>(null)
  const [session, setSession] = useState<SessionTotals>(EMPTY_SESSION)
  const [lastRound, setLastRound] = useState<RoundSummary | null>(null)
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

  // Persist after hydration.
  useEffect(() => {
    if (!hydrated.current) return
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId, config, session, lastRound }))
    } catch {
      /* ignore */
    }
  }, [sessionId, config, session, lastRound])

  const emit = (e: Omit<GameEvent, 'session_id'>) => {
    if (sessionId) logEvent({ session_id: sessionId, ...e })
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

  const resetSession = () => {
    setSession(EMPTY_SESSION)
    setLastRound(null)
    setConfigState(null)
    try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }

  return (
    <GameContext.Provider
      value={{ sessionId, config, session, lastRound, setConfig, recordRound, registerContinue, resetSession, emit }}
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
