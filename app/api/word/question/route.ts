import { getSql } from '@/lib/db/client'
import { getCurrentStudent } from '@/lib/auth/current-student'
import { selectItems, shuffle } from '@/lib/games/item-select'
import { itemOptions } from '@/lib/games/word'

// GET /api/word/question -- serves one choose-the-right-word item (package A3).
//
// THE ANSWER MUST NEVER BE RECOVERABLE FROM THE RESPONSE: `options` is a bare,
// shuffled array of strings (the item's term plus up to 3 distractors) -- no
// index into it, no term-first ordering, no parallel id array. Scoring happens
// server-side in app/api/word/answer/route.ts, off the same content_items row
// this route reads, never off anything echoed back by the client. Unlike
// match-the-following there is no signed board token here: the option SET is
// deterministic from the item's own `distractors` column (see MAX_DISTRACTORS
// in lib/games/word.ts), so the answer route can recompute exactly what could
// have been offered and reject anything else, without needing a token to carry
// "which 3 distractors were shown" across the two requests.
//
// Item selection is least-recently-served ranking ACROSS rounds, not hard
// exclusion -- generalised from lib/games/match-board-select.ts into
// lib/games/item-select.ts (package A3) specifically because A3 burns items
// far faster than match: a 20-question round consumes 20 of the 50
// term_definition rows, so hard exclusion would starve a student inside a
// couple of rounds, not the ~8 boards it took to surface the same defect in
// match. See item-select.ts for the ranking rules. Unlike match, this route
// has no subject concept in its contract (no ?subject= param) -- every
// eligible term_definition row is one pool.
//
// WITHIN a round, though, a repeat is not just stale, it is unplayable: the
// same item re-served after it was already answered this round 409s the
// student's own submit (one committed row per session/round/item -- see
// app/api/word/answer/route.ts). FIX 5: items already answered in THIS
// (session_id, round) are hard-EXCLUDED below, derived from `events` off the
// AUTHENTICATED student, never the request body -- a per-round exclusion is
// safe (a round is bounded, unlike the whole-history exclusion match's
// header describes trying and rejecting). When that exclusion starves the
// pool this route returns a DISTINCT 409 ('round exhausted') from the
// genuinely-too-small-pool case ('not enough term items'), so the page can
// treat "the round is naturally over" as a graceful ending rather than a
// failure.
//
// `retired_at is null` (db/009_add_item_retirement.sql) excludes soft-withdrawn
// items -- e.g. chart-caption rows that are not real term/definition pairs.
// The row is never deleted (events may already reference it), it just stops
// being served.
//
// `recipe is distinct from 'connections-tile-v1'` excludes Connections tiles
// (scripts/mint-connections-tiles.mjs, package A5) from this pool. Some of
// those rows were minted under a deliberately loosened "--clue-bar=provenance"
// standard (see that script's header) -- their clue proves the deck teaches
// the term but does NOT distinguish it from its group-mates, because a
// Connections tile's clue is never rendered during play. This route DOES
// render the clue, as the prompt -- an under-specified clue here is the exact
// "worse than chance" failure the strict bar exists to prevent (CLAUDE.md,
// the `Extreme Programming` / Scrum example). `recipe` is tagged at mint time
// by author-connections-boards.mjs's --mint-file insert path.
//
// A single-row minimum-distractor filter (FIX 2) also applies below: this
// game always shows 4 options (term + up to 3 distractors -- MAX_DISTRACTORS
// in lib/games/word.ts), so a row with fewer than 3 distractors would be
// served with 1-3 options total. At 0 distractors that is ONE option, i.e. a
// guaranteed correct click -- a wrong answer becomes unrepresentable. `db/003`
// defaults `distractors` to `'[]'` and scripts/generate-terms.mjs's validator
// permits an empty array, so this is not merely theoretical.
// FIX 3: an absolute floor on calibrated rows before this route ever honours
// a difficulty preference -- see item-select.ts's `minCalibrated` param. With
// `count` fixed at 1 (this route serves one item at a time), the ordinary
// `calibrated.length >= count` guard is vacuous the instant a single row
// anywhere gets calibrated: that one row would become "the whole pool" for
// every student, forever, until it 409-loops the moment it is also the only
// row never re-served (see FIX 3 in the review). 20 is chosen as roughly 4
// rows per difficulty band across the 5 bins difficulty is fixed at
// (CLAUDE.md, "Difficulty stays at five levels") -- enough that "closest to
// target" reflects a real distribution instead of being decided by whichever
// single row happened to get calibrated first.
const MIN_CALIBRATED_FOR_DIFFICULTY = 20

export async function GET(req: Request) {
  const student = await getCurrentStudent()
  if (!student) return Response.json({ ok: false, error: 'not signed in' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('session_id')
  if (!sessionId) return Response.json({ ok: false, error: 'missing session_id' }, { status: 400 })

  // Required (FIX 5): the per-round exclusion below is keyed on this round
  // number. Missing or non-numeric means the caller cannot possibly be
  // scoping a round -- same treatment as a missing session_id, not a
  // silent "no preference" fallback the way `difficulty` gets.
  const roundParam = searchParams.get('round')
  if (roundParam === null || !/^\d+$/.test(roundParam)) {
    return Response.json({ ok: false, error: 'missing round' }, { status: 400 })
  }
  const round = Number(roundParam)

  // Only an integer 1-5 counts as a preference; anything else (missing, out
  // of range, non-numeric) means "no preference" rather than a guessed
  // default -- same convention as app/api/match/board/route.ts.
  const difficultyParam = searchParams.get('difficulty')
  const targetDifficulty =
    difficultyParam !== null && /^[1-5]$/.test(difficultyParam) ? Number(difficultyParam) : null

  const sql = getSql()
  if (!sql) {
    // No DB means zero eligible term_definition rows, not a different
    // failure mode -- there is no seed bank for this primitive the way the
    // quiz has one.
    console.warn('word/question: database not configured, cannot serve an item')
    return Response.json({ ok: false, error: 'not enough term items' }, { status: 409 })
  }

  let allRows: Array<{ id: string; clue: string; term: string; distractors: string[]; difficulty: number | null }>
  try {
    const rows = (await sql`
      select id, clue, term, distractors, difficulty
      from content_items
      where kind = 'term_definition'
        and term is not null and trim(term) <> ''
        and clue is not null and trim(clue) <> ''
        and jsonb_array_length(distractors) >= 3
        and retired_at is null
        and recipe is distinct from 'connections-tile-v1'
    `) as Array<{ id: string; clue: string; term: string; distractors: unknown; difficulty: number | null }>
    allRows = rows.map((r) => ({
      id: r.id,
      clue: r.clue,
      term: r.term,
      distractors: Array.isArray(r.distractors) ? (r.distractors as string[]) : [],
      difficulty: r.difficulty,
    }))
  } catch (err) {
    console.error('word/question: content_items query failed', err)
    return Response.json({ ok: false, error: 'not enough term items' }, { status: 409 })
  }
  if (allRows.length === 0) {
    // Genuine content shortage -- not something a round exclusion below could
    // have caused. Distinct from the 'round exhausted' 409 further down.
    console.warn('word/question: no eligible term_definition items exist')
    return Response.json({ ok: false, error: 'not enough term items' }, { status: 409 })
  }

  // Least-recently-served ranking (see header): keyed on the AUTHENTICATED
  // student only, scoped to their whole history with choose-the-right-word
  // (any session, any round). Fails open on the lookup itself -- same
  // trade-off match/board.ts makes -- losing the "prefer least-recently-served"
  // property for one item is a data-quality regression, not a security
  // property. An empty map just means every item ranks as never-served,
  // correct for a genuinely new student.
  let lastSeen = new Map<string, number>()
  try {
    const served = (await sql`
      select content_item_id, max(created_at) as last_seen
      from events
      where event_type = 'question_answered'
        and game_type = 'choose-word'
        and student_id = ${student.id}
        and content_item_id is not null
      group by content_item_id
    `) as Array<{ content_item_id: string; last_seen: string | Date }>
    lastSeen = new Map(served.map((r) => [r.content_item_id, new Date(r.last_seen).getTime()]))
  } catch (err) {
    console.error('word/question: last-served lookup failed', err)
  }

  // FIX 5: hard-exclude items already answered THIS (session_id, round) --
  // re-serving one mid-round would just 409 the student's own submit (one
  // committed row per session/round/item). Scoped to this session+round
  // only, never the student's whole history -- a whole-history hard
  // exclusion is exactly the mistake match/board.ts's header documents and
  // rejected (starves a student permanently at this pool size). Keyed on the
  // AUTHENTICATED student, never anything from the request body.
  let answeredThisRound = new Set<string>()
  try {
    const answered = (await sql`
      select distinct content_item_id
      from events
      where event_type = 'question_answered'
        and game_type = 'choose-word'
        and student_id = ${student.id}
        and session_id = ${sessionId}
        and round = ${round}
        and content_item_id is not null
    `) as Array<{ content_item_id: string }>
    answeredThisRound = new Set(answered.map((r) => r.content_item_id))
  } catch (err) {
    console.error('word/question: this-round answered lookup failed', err)
  }

  const poolForRound = allRows.filter((r) => !answeredThisRound.has(r.id))
  if (poolForRound.length === 0) {
    // The overall pool (allRows) is non-empty -- checked above -- so this can
    // only happen because this round's own exclusion consumed every eligible
    // item. Distinct from 'not enough term items' so the page can treat it as
    // a graceful end of round, not a failure.
    console.warn('word/question: this round has exhausted the eligible pool', {
      session_id: sessionId,
      round,
      poolSize: allRows.length,
    })
    return Response.json({ ok: false, error: 'round exhausted' }, { status: 409 })
  }

  const selection = selectItems(poolForRound, lastSeen, targetDifficulty, 1, Math.random, MIN_CALIBRATED_FOR_DIFFICULTY)
  if (!selection) {
    // Unreachable given the poolForRound.length === 0 check above (selectItems
    // only returns null when candidates.length < count, and count is 1) --
    // kept as a defensive fallback rather than a non-null assertion.
    console.warn('word/question: selectItems returned null despite a non-empty pool')
    return Response.json({ ok: false, error: 'round exhausted' }, { status: 409 })
  }

  const chosen = selection.rows[0]
  const options = shuffle(itemOptions(chosen.term, chosen.distractors))

  // `difficultyHonored` is the server's decision about whether this item was
  // actually chosen by difficulty rank, and it must reach the client: the page
  // gates its "Level N" badge on it, so that a student is never shown a level
  // that changed nothing. All 50 term_definition rows currently have a NULL
  // difficulty, so this is false in practice today -- but the page defaults a
  // missing field to false, which makes "the route forgot to send it" and
  // "difficulty genuinely was not honoured" look identical. Sending it
  // explicitly is what makes the badge meaningful once calibration lands.
  return Response.json({
    ok: true,
    itemId: chosen.id,
    clue: chosen.clue,
    options,
    difficultyHonored: selection.difficultyHonored,
  })
}
