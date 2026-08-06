#!/usr/bin/env node
// SPIKE (6 Aug 2026) — THE NO-SOURCE PARTITION TEST.
//
// The whole learning-value case for Connections over crossword rests on one claim: that partitioning
// 16 tiles requires the material's own structure, where recall items do not (our recall items score
// ~1.00 against a model given no source, because the vocabulary is public professional language).
//
// This is that claim's ungrounded arm, pointed at a new item type. Give a model the 16 shuffled
// tiles and NOTHING ELSE — no deck, no excerpt, no group labels — and ask it to partition. If it
// recovers the intended groups, a Connections board is answerable from world knowledge and is a
// fourth measurement of the same priors, not a new construct.
//
// Reading the result: this is a REJECTION gate, so unlike the difficulty calibrator, a HIGH score
// is the bad outcome. Boards recovered at or near 4/4 are memorisable; boards near 0/4 require the
// deck. Scores are per intended group, exact set equality after normalisation.
//
// Not measured here: whether a board is solvable WITH the source, or by a human. A board scoring 0
// ungrounded could still be broken rather than deck-dependent — the same "calibration cannot
// distinguish a broken item from a hard one" limit this project already recorded, in a new instrument.
//
// Usage:
//   node scripts/spike-connections-solve.mjs spike-data/connections-boards-v1.json
//        [--model llama3.2:3b] [--trials 10] [--out spike-data/connections-nosource.json]

import { readFileSync, writeFileSync } from 'node:fs'
import { loadEnv } from './lib/llm-client.mjs'

loadEnv()

const OLLAMA = 'http://localhost:11434/api/chat'
const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(name)
  if (i === -1) return fallback
  const v = process.argv[i + 1]
  if (!v || v.startsWith('--')) { console.error(`${name} needs a value.`); process.exit(1) }
  return v
}

const boardsPath = process.argv[2]
if (!boardsPath || boardsPath.startsWith('--')) {
  console.error('Usage: node scripts/spike-connections-solve.mjs <boards.json> [--model M] [--trials N] [--out f.json]')
  process.exit(1)
}
const PROVIDER = arg('--provider', 'ollama')
if (!['ollama', 'openai'].includes(PROVIDER)) { console.error('--provider must be "ollama" or "openai"'); process.exit(1) }
const MODEL = arg('--model', PROVIDER === 'openai' ? 'gpt-4.1-mini' : 'llama3.2:latest')
const TRIALS = Number(arg('--trials', 10))
const outPath = arg('--out')

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Seeded xorshift, same shape as scripts/lib/simulate-students.mjs, so a run repeats. */
function rng(seed) {
  let s = seed || 1
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 }
}
function shuffle(items, seed) {
  const out = [...items]; const rand = rng(seed)
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]] }
  return out
}

/** Ollama honours `seed` so a run repeats; OpenAI's is best-effort only, which is the same honest
 *  limit already recorded for the difficulty spike. Temperature is held at 0.7 on both so the two
 *  families are compared under the same sampling regime. */
async function ask(model, system, user, seed) {
  if (PROVIDER === 'openai') {
    const key = process.env.OPENAI_API_KEY
    if (!key) throw new Error('OPENAI_API_KEY is not set')
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, temperature: 0.7, seed, messages: [
        { role: 'system', content: system }, { role: 'user', content: user },
      ] }),
    })
    if (!res.ok) throw new Error(`openai ${res.status}: ${await res.text()}`)
    return (await res.json()).choices[0].message.content
  }
  const res = await fetch(OLLAMA, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, stream: false, options: { seed, temperature: 0.7 }, messages: [
      { role: 'system', content: system }, { role: 'user', content: user },
    ] }),
  })
  if (!res.ok) throw new Error(`ollama ${res.status}: ${await res.text()}`)
  return (await res.json()).message.content
}

const SYSTEM = 'You sort terms into groups. You reply with exactly four lines and nothing else. No preamble, no explanation, no numbering, no group names.'

const userPrompt = (tiles) => `Below are 16 terms. They divide into exactly 4 groups of 4. Every term belongs to exactly one group.

${tiles.map((t) => `- ${t}`).join('\n')}

Reply with exactly 4 lines. Each line must contain 4 of the terms above, separated by " | ". Use each term exactly once across the 4 lines. Copy the terms exactly as written.`

/** Map a model-written term back to the canonical tile it most plausibly means. Exact normalised
 *  match first, then containment — a 3B model routinely drops a word or changes case, and scoring
 *  that as a miss would measure transcription, not grouping. */
function resolve(written, tiles) {
  const w = norm(written)
  if (!w) return null
  const exact = tiles.find((t) => norm(t) === w)
  if (exact) return exact
  const contains = tiles.filter((t) => norm(t).includes(w) || w.includes(norm(t)))
  return contains.length === 1 ? contains[0] : null
}

function parse(reply, tiles) {
  const lines = reply.split('\n').map((l) => l.trim()).filter(Boolean)
  const groups = []
  for (const line of lines) {
    const parts = line.replace(/^[-*\d.)\s]+/, '').split(/\s*[|,;]\s*/).map((p) => p.trim()).filter(Boolean)
    const resolved = parts.map((p) => resolve(p, tiles)).filter(Boolean)
    if (resolved.length === 4 && new Set(resolved).size === 4) groups.push(new Set(resolved))
    if (groups.length === 4) break
  }
  return groups
}

const data = JSON.parse(readFileSync(boardsPath, 'utf8'))
console.log(`No-source partition test — ${PROVIDER}/${MODEL}, ${TRIALS} trials/board\n`)
console.log(`REMINDER: high scores are the BAD outcome. 4/4 means the board needs no course material.\n`)

const results = []
for (const board of data.boards) {
  const tiles = board.groups.flatMap((g) => g.members)
  const intended = board.groups.map((g) => new Set(g.members))
  const perTrial = []
  let unparseable = 0
  for (let t = 0; t < TRIALS; t++) {
    const seed = 1000 + t
    let reply
    try { reply = await ask(MODEL, SYSTEM, userPrompt(shuffle(tiles, seed)), seed) }
    catch (err) { console.error(`  ${board.id} trial ${t}: FAILED — ${err.message}`); continue }
    const got = parse(reply, tiles)
    if (got.length < 4) unparseable++
    const recovered = intended.filter((want) =>
      got.some((g) => g.size === want.size && [...want].every((m) => g.has(m)))).length
    perTrial.push(recovered)
    process.stdout.write(`  ${board.id} trial ${String(t + 1).padStart(2)}: ${recovered}/4\r`)
  }
  const mean = perTrial.reduce((a, b) => a + b, 0) / (perTrial.length || 1)
  const solved = perTrial.filter((r) => r === 4).length
  const dist = [0, 1, 2, 3, 4].map((k) => perTrial.filter((r) => r === k).length)
  console.log(`  ${board.id.padEnd(18)} mean ${mean.toFixed(2)}/4   fully solved ${solved}/${perTrial.length}   dist(0..4) ${dist.join('/')}   unparseable ${unparseable}`)
  results.push({ board: board.id, mean, fullySolved: solved, trials: perTrial.length, dist, unparseable, perTrial })
}

const totalTrials = results.reduce((a, r) => a + r.trials, 0)
console.log(`\n=== VERDICT ===`)
// A gate that reports PASS when nothing ran is a false signal, and this project has shipped one of
// those before. No trials means no verdict, and a non-zero exit so a wrapper cannot ignore it.
if (totalTrials === 0) {
  console.error(`NO VERDICT: every trial failed (model unreachable or wrong tag?). Nothing was measured.`)
  process.exit(1)
}
const overallMean = results.reduce((a, r) => a + r.mean * r.trials, 0) / totalTrials
const totalSolved = results.reduce((a, r) => a + r.fullySolved, 0)

// PER BOARD, never pooled. The first version of this script printed one aggregate verdict, and on
// the 6 Aug run that averaged a board solved cold 40% of the time together with one solved 0% of the
// time into a reassuring 1.10 "pass". Memorability is a property of a board, not of a corpus, and a
// board is what gets shipped — so the gate has to fire at the grain of the thing being rejected.
const REJECT_SOLVE_RATE = 0.2
console.log(`Pooled (context only, NOT the gate): mean ${overallMean.toFixed(2)}/4, ${totalSolved}/${totalTrials} solved cold\n`)
console.log(`Per-board gate — reject above ${REJECT_SOLVE_RATE * 100}% solved cold:`)
let rejected = 0
for (const r of results) {
  const rate = r.trials ? r.fullySolved / r.trials : 0
  const verdict = rate > REJECT_SOLVE_RATE ? 'REJECT — memorisable' : 'keep'
  if (rate > REJECT_SOLVE_RATE) rejected++
  console.log(`  ${r.board.padEnd(20)} ${(rate * 100).toFixed(0).padStart(3)}% solved cold   mean ${r.mean.toFixed(2)}/4   ${verdict}`)
}
console.log(`\n${rejected} of ${results.length} board(s) rejected.`)
// A high score here cannot distinguish "solved because the concepts are famous" from "solved because
// the member names share a visible pattern" — Six Thinking Hats all end in "Hat", the big-data Vs all
// begin with V. Both read as memorisable. Same shape as the standing limit that difficulty
// calibration cannot tell a broken item from a hard one.
console.log(`Caveat: this cannot separate famous-concept recall from orthographic giveaway. Both score high.`)

if (outPath) {
  writeFileSync(outPath, JSON.stringify({ model: MODEL, trials: TRIALS, boardsFile: boardsPath, overallMean, totalSolved, totalTrials, results }, null, 2))
  console.log(`\nWrote ${outPath}`)
}
