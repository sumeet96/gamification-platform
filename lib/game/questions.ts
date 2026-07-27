// Seed question bank, tagged by difficulty (1 = easiest, 5 = hardest).
// P3 replaces this with AI-generated questions from an uploaded book PDF (served from Neon).
// Theme leans Digital-Transformation/business to fit the pilot course.

export interface Question {
  id: string
  difficulty: 1 | 2 | 3 | 4 | 5
  prompt: string
  options: string[]
  answer: number // index into options
}

export const QUESTIONS: Question[] = [
  // ---- difficulty 1 ----
  { id: 'q1', difficulty: 1, prompt: "What does 'CRM' stand for?", options: ['Customer Relationship Management', 'Cloud Resource Manager', 'Central Record Model', 'Corporate Risk Metric'], answer: 0 },
  { id: 'q2', difficulty: 1, prompt: 'Which of these is a cloud storage service?', options: ['Google Drive', 'Microsoft Word', 'Photoshop', 'Notepad'], answer: 0 },
  { id: 'q3', difficulty: 1, prompt: "What does 'AI' stand for?", options: ['Automated Input', 'Artificial Intelligence', 'Applied Integration', 'Analog Interface'], answer: 1 },
  { id: 'q4', difficulty: 1, prompt: 'A spreadsheet is primarily used to:', options: ['Edit photos', 'Organize data in rows and columns', 'Send emails', 'Host websites'], answer: 1 },

  // ---- difficulty 2 ----
  { id: 'q5', difficulty: 2, prompt: "What is 'the cloud' in computing?", options: ['A weather service', 'Remote servers accessed over the internet', 'A type of hard drive', 'An office suite'], answer: 1 },
  { id: 'q6', difficulty: 2, prompt: "Which best describes 'e-commerce'?", options: ['Buying and selling goods online', 'Sending company email', 'Encrypting files', 'Editing spreadsheets'], answer: 0 },
  { id: 'q7', difficulty: 2, prompt: "What is a 'KPI'?", options: ['A programming language', 'A measure of performance', 'A type of database', 'A security key'], answer: 1 },
  { id: 'q8', difficulty: 2, prompt: "'Big data' primarily refers to:", options: ['Large monitors', 'Extremely large datasets', 'Expensive software', 'A cloud provider'], answer: 1 },

  // ---- difficulty 3 ----
  { id: 'q9', difficulty: 3, prompt: "A 'minimum viable product' (MVP) is:", options: ['The cheapest possible product', 'The smallest version that tests key assumptions', 'A fully finished product', 'A marketing plan'], answer: 1 },
  { id: 'q10', difficulty: 3, prompt: "What is 'A/B testing' used for?", options: ['Backing up two databases', 'Comparing two versions to see which performs better', 'Encrypting data twice', 'Splitting a team in two'], answer: 1 },
  { id: 'q11', difficulty: 3, prompt: "'Data governance' mainly concerns:", options: ['Buying more storage', 'Rules for data quality, access, and ownership', 'Training ML models', 'Faster dashboards'], answer: 1 },
  { id: 'q12', difficulty: 3, prompt: 'What does an API enable?', options: ['Faster internet', 'Software systems to talk to each other', 'Cheaper storage', 'Better graphics'], answer: 1 },

  // ---- difficulty 4 ----
  { id: 'q13', difficulty: 4, prompt: "The 'network effect' means a product becomes more valuable when:", options: ['Prices rise', 'More people use it', 'It has more features', 'It is advertised more'], answer: 1 },
  { id: 'q14', difficulty: 4, prompt: "'Digital transformation' is best described as:", options: ['Buying new software', 'Rewiring how an organization creates value using digital capabilities', 'Moving files to the cloud', 'Hiring more engineers'], answer: 1 },
  { id: 'q15', difficulty: 4, prompt: "'Edge computing' processes data:", options: ['Only in the cloud', 'Closer to its source to cut latency', 'On paper first', 'After a nightly batch'], answer: 1 },
  { id: 'q16', difficulty: 4, prompt: "A 'digital twin' is:", options: ['A backup employee', 'A virtual model of a physical system, updated with live data', 'A duplicate database', 'A second monitor'], answer: 1 },

  // ---- difficulty 5 ----
  { id: 'q17', difficulty: 5, prompt: 'What is the biggest risk of unmonitored generative AI in decisions?', options: ['It uses electricity', 'Confident but incorrect outputs reaching decisions unchecked', 'It needs a keyboard', 'It is slow to type'], answer: 1 },
  { id: 'q18', difficulty: 5, prompt: "A 'platform' business model primarily creates value by:", options: ['Owning all inventory', 'Facilitating exchanges between producers and consumers', 'Advertising heavily', 'Lowering prices below cost'], answer: 1 },
  { id: 'q19', difficulty: 5, prompt: 'Most digital transformations fail primarily due to:', options: ['Insufficient hardware', 'People and change-management issues, not technology', 'Slow internet', 'Too few dashboards'], answer: 1 },
  { id: 'q20', difficulty: 5, prompt: "'Zero-trust security' assumes:", options: ['Everyone inside is trusted', 'No user or device is trusted by default', 'Passwords are enough', 'Firewalls are unnecessary'], answer: 1 },
]

/** Pick a random unused question from `pool` at the target difficulty; fall back to nearest, then any unused. */
export function pickQuestion(pool: Question[], difficulty: number, usedIds: Set<string>): Question | null {
  const target = Math.max(1, Math.min(5, Math.round(difficulty)))
  const unused = pool.filter((q) => !usedIds.has(q.id))
  if (unused.length === 0) return null
  // exact difficulty first, then widen outward
  for (let radius = 0; radius <= 4; radius++) {
    const pool = unused.filter((q) => Math.abs(q.difficulty - target) === radius)
    if (pool.length) return pool[Math.floor(Math.random() * pool.length)]
  }
  return unused[Math.floor(Math.random() * unused.length)]
}
