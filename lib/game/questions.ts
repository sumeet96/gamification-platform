// Seed question bank, tagged by difficulty (1 = easiest, 5 = hardest).
// P3 replaces this with AI-generated questions from an uploaded book PDF (served from Neon).
// Theme leans Digital-Transformation/business to fit the pilot course.
//
// CLIENT-SAFE MODULE (package Q1 rework). `Question` has NO `answer` field --
// not optional, not present at all. This file is imported by app/quiz/page.tsx
// ('use client'), so anything exported from here ships in the browser bundle.
// The answer key lives only in lib/game/questions.server.ts, a server-only
// companion that no client file may import. Keeping the two genuinely separate
// (rather than one Question shape with an optional `answer` stripped at
// runtime) is what makes "the client never has the key" true of the bundled
// JS, not just of the values the server chooses to serialize.

export interface Question {
  id: string
  // 1 (easiest) .. 5 (hardest) once calibrated; null when uncalibrated -- which is
  // every content_items row today (db/006_add_content_item_difficulty.sql: the
  // column exists but nothing has run the simulation pass yet). pickQuestion below
  // never invents a value for a null and never ranks by one.
  difficulty: 1 | 2 | 3 | 4 | 5 | null
  stem: string // the question text -- named to match the content_items column (Q1)
  options: string[]
  topic?: string | null
}

export const QUESTIONS: Question[] = [
  // ---- difficulty 1 ----
  { id: 'q1', difficulty: 1, stem: "What does 'CRM' stand for?", options: ['Customer Relationship Management', 'Cloud Resource Manager', 'Central Record Model', 'Corporate Risk Metric'] },
  { id: 'q2', difficulty: 1, stem: 'Which of these is a cloud storage service?', options: ['Google Drive', 'Microsoft Word', 'Photoshop', 'Notepad'] },
  { id: 'q3', difficulty: 1, stem: "What does 'AI' stand for?", options: ['Automated Input', 'Artificial Intelligence', 'Applied Integration', 'Analog Interface'] },
  { id: 'q4', difficulty: 1, stem: 'A spreadsheet is primarily used to:', options: ['Edit photos', 'Organize data in rows and columns', 'Send emails', 'Host websites'] },

  // ---- difficulty 2 ----
  { id: 'q5', difficulty: 2, stem: "What is 'the cloud' in computing?", options: ['A weather service', 'Remote servers accessed over the internet', 'A type of hard drive', 'An office suite'] },
  { id: 'q6', difficulty: 2, stem: "Which best describes 'e-commerce'?", options: ['Buying and selling goods online', 'Sending company email', 'Encrypting files', 'Editing spreadsheets'] },
  { id: 'q7', difficulty: 2, stem: "What is a 'KPI'?", options: ['A programming language', 'A measure of performance', 'A type of database', 'A security key'] },
  { id: 'q8', difficulty: 2, stem: "'Big data' primarily refers to:", options: ['Large monitors', 'Extremely large datasets', 'Expensive software', 'A cloud provider'] },

  // ---- difficulty 3 ----
  { id: 'q9', difficulty: 3, stem: "A 'minimum viable product' (MVP) is:", options: ['The cheapest possible product', 'The smallest version that tests key assumptions', 'A fully finished product', 'A marketing plan'] },
  { id: 'q10', difficulty: 3, stem: "What is 'A/B testing' used for?", options: ['Backing up two databases', 'Comparing two versions to see which performs better', 'Encrypting data twice', 'Splitting a team in two'] },
  { id: 'q11', difficulty: 3, stem: "'Data governance' mainly concerns:", options: ['Buying more storage', 'Rules for data quality, access, and ownership', 'Training ML models', 'Faster dashboards'] },
  { id: 'q12', difficulty: 3, stem: 'What does an API enable?', options: ['Faster internet', 'Software systems to talk to each other', 'Cheaper storage', 'Better graphics'] },

  // ---- difficulty 4 ----
  { id: 'q13', difficulty: 4, stem: "The 'network effect' means a product becomes more valuable when:", options: ['Prices rise', 'More people use it', 'It has more features', 'It is advertised more'] },
  { id: 'q14', difficulty: 4, stem: "'Digital transformation' is best described as:", options: ['Buying new software', 'Rewiring how an organization creates value using digital capabilities', 'Moving files to the cloud', 'Hiring more engineers'] },
  { id: 'q15', difficulty: 4, stem: "'Edge computing' processes data:", options: ['Only in the cloud', 'Closer to its source to cut latency', 'On paper first', 'After a nightly batch'] },
  { id: 'q16', difficulty: 4, stem: "A 'digital twin' is:", options: ['A backup employee', 'A virtual model of a physical system, updated with live data', 'A duplicate database', 'A second monitor'] },

  // ---- difficulty 5 ----
  { id: 'q17', difficulty: 5, stem: 'What is the biggest risk of unmonitored generative AI in decisions?', options: ['It uses electricity', 'Confident but incorrect outputs reaching decisions unchecked', 'It needs a keyboard', 'It is slow to type'] },
  { id: 'q18', difficulty: 5, stem: "A 'platform' business model primarily creates value by:", options: ['Owning all inventory', 'Facilitating exchanges between producers and consumers', 'Advertising heavily', 'Lowering prices below cost'] },
  { id: 'q19', difficulty: 5, stem: 'Most digital transformations fail primarily due to:', options: ['Insufficient hardware', 'People and change-management issues, not technology', 'Slow internet', 'Too few dashboards'] },
  { id: 'q20', difficulty: 5, stem: "'Zero-trust security' assumes:", options: ['Everyone inside is trusted', 'No user or device is trusted by default', 'Passwords are enough', 'Firewalls are unnecessary'] },
]

// Same floor as app/api/word/question/route.ts's MIN_CALIBRATED_FOR_DIFFICULTY.
// The quiz has no per-question server route -- selection happens client-side,
// right here, against the full pool GET /api/questions already returns (only
// the answer key is secret, never difficulty) -- but the reasoning for the
// floor is identical: with `ranked.length >= 1` alone, the moment a single
// content_items row anywhere gets calibrated it would become "the whole
// difficulty-ranked pool" and PickedQuestion.difficultyHonored would go true
// for every student, forever. 20 is the same number word uses: roughly 4 rows
// per difficulty band across the 5 bins difficulty is fixed at (CLAUDE.md,
// "Difficulty stays at five levels").
const MIN_CALIBRATED_FOR_DIFFICULTY = 20

export interface PickedQuestion {
  question: Question
  // Mirrors item-select.ts's RankedSelection.difficultyHonored (word/match):
  // true only when the pick was actually influenced by `difficulty`, i.e. the
  // unused pool had at least MIN_CALIBRATED_FOR_DIFFICULTY calibrated items to
  // rank over. This does NOT change which question gets picked below -- a
  // handful of calibrated rows can still rank and be served -- it only gates
  // whether that pick is honestly reportable to the student as "your level
  // changed what you got" (the quiz page's Level N badge).
  difficultyHonored: boolean
}

/** Pick a random unused question from `pool` at the target difficulty; fall back to
 *  nearest among calibrated items, then any unused item (including uncalibrated ones)
 *  at random.
 *
 *  A null `difficulty` (uncalibrated -- see db/006_add_content_item_difficulty.sql) is
 *  never coerced into a number here: `null - target` evaluates to `0 - target` in JS,
 *  i.e. it would silently rank an uncalibrated item as difficulty 0 if it leaked into
 *  the radius math. So ranking only ever runs over items that actually have a
 *  difficulty; uncalibrated items are reachable only through the final unranked
 *  fallback below -- the honest behaviour for content the adaptive lever cannot rank
 *  (package Q1). */
export function pickQuestion(pool: Question[], difficulty: number, usedIds: Set<string>): PickedQuestion | null {
  const target = Math.max(1, Math.min(5, Math.round(difficulty)))
  const unused = pool.filter((q) => !usedIds.has(q.id))
  if (unused.length === 0) return null
  const ranked = unused.filter(
    (q): q is Question & { difficulty: 1 | 2 | 3 | 4 | 5 } => q.difficulty !== null
  )
  const difficultyHonored = ranked.length >= MIN_CALIBRATED_FOR_DIFFICULTY
  // exact difficulty first, then widen outward, among calibrated items only
  for (let radius = 0; radius <= 4; radius++) {
    const atRadius = ranked.filter((q) => Math.abs(q.difficulty - target) === radius)
    if (atRadius.length) return { question: atRadius[Math.floor(Math.random() * atRadius.length)], difficultyHonored }
  }
  // Nothing calibrated left (or nothing calibrated at all, e.g. every content_items
  // row today) -- pick any unused item at random. Not a difficulty match; the honest
  // fallback for uncalibrated content. Never honoured.
  return { question: unused[Math.floor(Math.random() * unused.length)], difficultyHonored: false }
}
