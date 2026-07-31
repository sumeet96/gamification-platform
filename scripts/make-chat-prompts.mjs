#!/usr/bin/env node
// Build paste-into-the-chat-window prompts for the difficulty simulation, for when the API is
// rate-limited. One block per question; paste each into a FRESH chat.
//
// Fidelity note: the excerpt thinning is done HERE, with the same rule and seeds as
// spike-simulate-difficulty.mjs, so the model is asked only to attempt the question in character —
// never to judge difficulty or to decide what it "remembers". That distinction is the whole method.
//
// Usage:
//   node scripts/make-chat-prompts.mjs <questions.json> <excerpts.json> <out.txt> [--students 8]

import { readFileSync, writeFileSync } from 'node:fs'

const [qPath, ePath, outPath] = process.argv.slice(2)
if (!qPath || !ePath || !outPath) { console.error('Usage: node scripts/make-chat-prompts.mjs <questions.json> <excerpts.json> <out.txt> [--students 8]'); process.exit(1) }
const i = process.argv.indexOf('--students')
const STUDENTS = i === -1 ? 8 : Number(process.argv[i + 1])

const TIERS = [
  { name: 'Below Basic', weight: 0.25, retention: 0.30, persona: 'has struggled with this subject, attended the session but retained little, often confuses similar-sounding concepts, and guesses when unsure' },
  { name: 'Basic',       weight: 0.35, retention: 0.55, persona: 'is average, attended and remembers the main points but is hazy on details and figures, reasons plausibly but makes mistakes on specifics' },
  { name: 'Proficient',  weight: 0.25, retention: 0.80, persona: 'is solid, paid attention and took notes, recalls most of the material accurately though very fine details can slip' },
  { name: 'Advanced',    weight: 0.15, retention: 1.00, persona: 'is a top student who knows the material thoroughly and reasons carefully about distinctions between options' },
]

function rng(seed) {
  let s = seed || 1
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 }
}

/** Identical rule to recall() in spike-simulate-difficulty.mjs: keep the heading, then a tier-sized
 *  sample of the remaining lines in their original order. */
function recall(text, tier, seed) {
  if (tier.retention >= 1) return text
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length <= 2) return text
  const [head, ...rest] = lines
  const keep = Math.max(1, Math.round(rest.length * tier.retention))
  const rand = rng(seed)
  return [head, ...rest.map((l, idx) => ({ l, idx, r: rand() })).sort((a, b) => a.r - b.r).slice(0, keep)
    .sort((a, b) => a.idx - b.idx).map((o) => o.l)].join('\n')
}

function shuffled(options, answerIdx, seed) {
  const idx = options.map((_, k) => k)
  const rand = rng(seed)
  for (let k = idx.length - 1; k > 0; k--) {
    const j = Math.floor(rand() * (k + 1))
    ;[idx[k], idx[j]] = [idx[j], idx[k]]
  }
  return { options: idx.map((k) => options[k]), answer: idx.indexOf(answerIdx) }
}

const LETTERS = ['A', 'B', 'C', 'D']
const questions = JSON.parse(readFileSync(qPath, 'utf8'))
const excerpts = JSON.parse(readFileSync(ePath, 'utf8'))

// Expand the tier mix into concrete students, same shape as buildCohort().
const cohort = []
for (const t of TIERS) cohort.push(...Array(Math.round(STUDENTS * t.weight)).fill(t))
while (cohort.length < STUDENTS) cohort.push(TIERS[1])

const key = []
const blocks = questions.map((q, qi) => {
  const seed = (qi + 1) * 7919
  const { options, answer } = shuffled(q.options, q.answer, seed)
  key.push(`Q${qi}: correct = ${LETTERS[answer]}   (asserted difficulty ${q.difficulty ?? '?'}, topic: ${q.topic ?? ''})`)
  const students = cohort.map((tier, si) => {
    const remembered = recall(excerpts[qi].text, tier, seed + si * 104729 + 1)
    return `STUDENT ${si + 1} — ${tier.name}. This student ${tier.persona}.\nWhat this student remembers of the slide "${excerpts[qi].title}":\n"""\n${remembered}\n"""`
  }).join('\n\n')

  return `${'='.repeat(78)}
QUESTION ${qi} of ${questions.length - 1}   —  paste everything below into a FRESH chat
${'='.repeat(78)}

You are simulating ${STUDENTS} different university students sitting a quiz after a lecture.

Each student below has a stated ability level and a note of what they remember from the lecture
slide. Answer the question ONCE AS EACH STUDENT, in character, using ONLY what that student
remembers plus whatever general knowledge a student of that ability would plausibly have. A student
whose memory does not cover the question must guess, exactly as they would in a real exam.

Do NOT judge how hard the question is. Do NOT explain. Do NOT look anything up. Just answer as each
student would.

THE QUESTION
${q.prompt}

${options.map((o, k) => `${LETTERS[k]}. ${o}`).join('\n')}

THE STUDENTS

${students}

OUTPUT — this exact format, nothing else:
1:<letter> 2:<letter> 3:<letter> 4:<letter> 5:<letter> 6:<letter> 7:<letter> 8:<letter>
`
})

writeFileSync(outPath, `SIMULATION PROMPTS — ${questions.length} questions x ${STUDENTS} students
Cohort per question: ${TIERS.map((t) => `${t.name} ${cohort.filter((c) => c === t).length}`).join(', ')}

HOW TO RUN
1. Paste each QUESTION block below into a FRESH chat with gemini-3.5-flash-lite. A fresh chat each
   time matters: in one long chat the model sees its own earlier answers and stops being independent.
2. Record the ${STUDENTS} letters it returns.
3. Score against the ANSWER KEY at the bottom. Success rate = correct / ${STUDENTS}.
4. A question everyone gets right carries no difficulty information. A question where the Below
   Basic students fail and the Advanced student succeeds is the signal you are looking for.

LIMIT, STATE IT IN ANY WRITE-UP: ${STUDENTS} students per item gives only ${STUDENTS + 1} possible
success rates, so this is directional only. The API run uses 30. Do not report these as calibrated
difficulty values.

${blocks.join('\n')}

${'='.repeat(78)}
ANSWER KEY — do not paste this into the chat
${'='.repeat(78)}
${key.join('\n')}
`)

console.log(`Wrote ${outPath}: ${questions.length} blocks, ${STUDENTS} students each.`)
console.log(`Cohort: ${TIERS.map((t) => `${t.name} ${cohort.filter((c) => c === t).length}`).join(', ')}`)
