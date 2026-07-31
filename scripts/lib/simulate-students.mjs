// The reusable core of LLM student simulation: ability tiers, retention-gated recall, the seeded
// shuffle, and the provider calls. Extracted from `scripts/spike-simulate-difficulty.mjs` (31 Jul
// 2026) so `scripts/calibrate-difficulty.mjs` can share it instead of re-implementing it.
//
// IMPORTANT: this is the instrument the published results in
// `docs/experiments/2026-07-31_grounded-difficulty-simulation.md` came from. The spike script must
// keep behaving exactly as before after importing from here — same flags, same seeds, same output.
// Do not "improve" the method while moving it; that is a different, unreviewed change.
//
// Method background: docs/literature/item-difficulty-without-students.md

// Ability mix mirrors the source paper's NAEP-shaped distribution. `retention` is the fraction of
// the source excerpt a student at this tier still remembers — the mechanism by which an item can be
// hard even with the material in front of you.
export const TIERS = [
  { name: 'Below Basic', weight: 0.25, retention: 0.30, persona: 'You are a student who has struggled with this subject. You attended the session but retained little, and you often confuse similar-sounding concepts. You guess when unsure.' },
  { name: 'Basic',       weight: 0.35, retention: 0.55, persona: 'You are an average student. You attended the session and remember the main points, but details and figures are hazy. You reason plausibly but make mistakes on specifics.' },
  { name: 'Proficient',  weight: 0.25, retention: 0.80, persona: 'You are a solid student. You paid attention, took notes, and recall most of the material accurately, though very fine details can slip.' },
  { name: 'Advanced',    weight: 0.15, retention: 1.00, persona: 'You are a top student. You know this material thoroughly and reason carefully about distinctions between options.' },
]

export const LETTERS = ['A', 'B', 'C', 'D']

const OLLAMA = 'http://localhost:11434/api/chat'

/** Expand the weighted tier mix into exactly N concrete simulated students. */
export function buildCohort(n) {
  const cohort = []
  for (const t of TIERS) cohort.push(...Array(Math.round(n * t.weight)).fill(t))
  while (cohort.length < n) cohort.push(TIERS[1])
  return cohort.slice(0, n)
}

/** Seeded xorshift, so every run is reproducible and the arms/items are directly comparable. */
export function rng(seed) {
  let s = seed || 1
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 }
}

/** Deterministic-per-call shuffle so option position can't bias the estimate.
 *  The generator already put 15/15 correct answers at index 0; a model with an
 *  A-bias would otherwise score high for the wrong reason. */
export function shuffled(options, answerIdx, seed) {
  const idx = options.map((_, i) => i)
  const rand = rng(seed)
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  return { options: idx.map((i) => options[i]), answer: idx.indexOf(answerIdx) }
}

/** What this student still remembers of the slide: the heading, plus a tier-sized sample of the
 *  remaining lines in their original order. Dropping lines rather than paraphrasing keeps the
 *  surviving text verbatim, so a wrong answer means the fact was forgotten, not garbled.
 *  `retentionEnabled` mirrors the spike's `--retention` flag: without it every tier sees the whole
 *  excerpt (the "grounded, full" arm). */
export function recall(text, tier, seed, retentionEnabled) {
  if (!retentionEnabled || tier.retention >= 1) return text
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length <= 2) return text
  const [head, ...rest] = lines
  const keep = Math.max(1, Math.round(rest.length * tier.retention))
  const rand = rng(seed)
  const order = rest.map((l, i) => ({ l, i, r: rand() })).sort((a, b) => a.r - b.r).slice(0, keep)
  return [head, ...order.sort((a, b) => a.i - b.i).map((o) => o.l)].join('\n')
}

async function askOllama(model, system, user, seed) {
  const body = {
    model,
    stream: false,
    options: {
      temperature: 0.8, // >0 so students of a tier differ; tiny output keeps CPU inference fast
      num_predict: 4,
      // Deterministic sampling. Without this the calibration was not reproducible: two consecutive
      // runs over the same 17 items with the same n moved success rates by up to 0.10 -- the
      // binomial noise you expect at n=30 -- which was enough to flip items between difficulty
      // bands. Reproducibility is the whole reason the simulator is a local model rather than a
      // hosted one ("a hosted model can change mid-pilot and silently shift calibration"), so an
      // instrument that shifts between runs on the same machine defeats the point.
      //
      // The seed varies per (item, student), so simulated students still differ from each other --
      // it removes run-to-run drift, not the variation between the cohort.
      seed,
    },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  }
  const res = await fetch(OLLAMA, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`)
  return (await res.json())?.message?.content ?? ''
}

/** OpenAI chat completions. Default is the PINNED snapshot gpt-3.5-turbo-0125, not the floating
 *  `gpt-3.5-turbo` alias — a simulator that silently changes underneath the calibration would
 *  invalidate the item bank mid-pilot, which is the same reproducibility argument that put the
 *  primary simulator on a local model. */
async function askOpenAI(model, apiKey, system, user) {
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }]
  for (let attempt = 0; ; attempt++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature: 0.8, max_tokens: 4 }),
    })
    if (res.ok) return (await res.json())?.choices?.[0]?.message?.content ?? ''
    const text = await res.text()
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      await new Promise((r) => setTimeout(r, Math.min(60000, 2000 * 2 ** attempt)))
      continue
    }
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 200)}`)
  }
}

/** Same prompt, same temperature, hosted model. NOTE: `thinkingConfig.thinkingBudget` is rejected by
 *  gemini-3.5-flash-lite with a 400, so thinking cannot be turned off — the hosted simulator gets a
 *  reasoning step the local one does not. That asymmetry favours Gemini and must be stated with any
 *  comparison. Retries on 429/5xx because free-tier RPM is low and project-specific. */
async function askGemini(model, apiKey, system, user) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { temperature: 0.8, maxOutputTokens: 8 },
  }
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) {
      const data = await res.json()
      return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    }
    const text = await res.text()
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      await new Promise((r) => setTimeout(r, Math.min(60000, 2000 * 2 ** attempt)))
      continue
    }
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 200)}`)
  }
}

/**
 * Build the one-argument `ask(system, user)` function callers pass around, closing over the
 * provider, model and key so the rest of the pipeline never branches on provider again.
 * @param {{provider: 'ollama'|'gemini'|'openai', model: string, apiKey?: string}} opts
 */
export function makeAsker({ provider, model, apiKey }) {
  // `seed` is threaded through so the local provider can sample deterministically. The hosted
  // providers ignore it: OpenAI's `seed` is documented as best-effort only and Gemini exposes none,
  // which is one more reason the primary simulator is local.
  if (provider === 'ollama') return (system, user, seed) => askOllama(model, system, user, seed)
  if (provider === 'openai') return (system, user) => askOpenAI(model, apiKey, system, user)
  if (provider === 'gemini') return (system, user) => askGemini(model, apiKey, system, user)
  throw new Error(`Unknown provider "${provider}". Known: ollama, gemini, openai`)
}

/** Simulate one student (one tier, one seed) attempting one question. */
export async function askOnce({ ask, question, tier, seed, excerpt, retention }) {
  const { options, answer } = shuffled(question.options, question.answer, seed)
  const remembered = excerpt ? recall(excerpt.text, tier, seed + 1, retention) : null
  const system = remembered
    ? `${tier.persona}\n\nThis is what you remember from the session slide "${excerpt.title}":\n"""\n${remembered}\n"""\nAnswer from that memory. If it does not cover the question, answer as best you can.\nAnswer with a single letter (A, B, C or D) and nothing else.`
    : `${tier.persona}\nAnswer with a single letter (A, B, C or D) and nothing else.`
  const user = `${question.prompt}\n\n${options.map((o, i) => `${LETTERS[i]}. ${o}`).join('\n')}\n\nAnswer with one letter only.`
  const raw = (await ask(system, user, seed)).trim().toUpperCase()
  const m = raw.match(/[ABCD]/)
  if (!m) return { correct: false, parsed: null, tier: tier.name }  // unparseable counts as wrong, like a real blank
  return { correct: LETTERS.indexOf(m[0]) === answer, parsed: m[0], tier: tier.name }
}

/** Run tasks with a fixed concurrency cap — CPU inference dies under unbounded fan-out. */
export async function pool(tasks, limit) {
  const out = []
  let cursor = 0
  await Promise.all(Array(Math.min(limit, tasks.length)).fill(0).map(async () => {
    while (cursor < tasks.length) out.push(await tasks[cursor++]())
  }))
  return out
}

/**
 * Run a whole cohort against one question and summarise the result. A transport error is NOT a
 * wrong answer — scoring one as wrong invents a hard question out of a rate limit — so it is
 * counted separately in `errorCount` and left for the caller to decide whether to abort.
 *
 * @param {{ask: Function, question: object, excerpt: {text: string, title: string}|null|undefined,
 *   cohort: object[], seedBase: number, retention: boolean, concurrency: number}} opts
 * @returns {Promise<{results: object[], p: number, byTier: Record<string, number>,
 *   errorCount: number, unparseableCount: number}>}
 */
export async function simulateQuestion({ ask, question, excerpt, cohort, seedBase, retention, concurrency }) {
  const tasks = cohort.map((tier, si) => () => askOnce({ ask, question, tier, seed: seedBase + si * 104729, excerpt, retention }).catch((e) => {
    console.error(`  ! ${e.message}`)
    return { correct: false, parsed: null, tier: tier.name, errored: true }
  }))
  const results = await pool(tasks, concurrency)
  const errorCount = results.filter((r) => r.errored).length
  const unparseableCount = results.filter((r) => r.parsed === null && !r.errored).length
  const p = results.filter((r) => r.correct).length / results.length
  const byTier = {}
  for (const t of TIERS) {
    const rs = results.filter((r) => r.tier === t.name)
    if (rs.length) byTier[t.name] = rs.filter((r) => r.correct).length / rs.length
  }
  return { results, p, byTier, errorCount, unparseableCount }
}
