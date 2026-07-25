/**
 * Hardcoded Digital Transformation MCQs. PLACEHOLDER content pending Prof.
 * Singh's real course material — these are a surface for the mechanic, not
 * validated course questions.
 *
 * Each question belongs to a `set`:
 *  - "diagnostic": Stage 1, identical for everyone, MEASURES per-topic strength.
 *  - "practice":   Stage 2 pool, sampled preferentially from a student's weak topics.
 * `answer` is the index into `options`.
 */
export type QuestionSet = "diagnostic" | "practice";

export interface Question {
  id: string;
  topicId: string;
  set: QuestionSet;
  prompt: string;
  options: string[];
  answer: number;
}

export const QUESTIONS: Question[] = [
  // ---- Data & Analytics ----
  { id: "data-1", topicId: "data", set: "diagnostic",
    prompt: "A 'single source of truth' for analytics primarily reduces which problem?",
    options: ["Server costs", "Conflicting numbers across teams", "Model overfitting", "Network latency"], answer: 1 },
  { id: "data-2", topicId: "data", set: "diagnostic",
    prompt: "Which best describes a 'leading' metric versus a 'lagging' one?",
    options: ["Leading predicts future outcomes; lagging reports past results", "Leading is larger in value", "Leading is always financial", "There is no difference"], answer: 0 },
  { id: "data-3", topicId: "data", set: "practice",
    prompt: "'Data governance' is mainly about:",
    options: ["Buying more storage", "Rules for data quality, access, and ownership", "Training ML models", "Faster dashboards"], answer: 1 },
  { id: "data-4", topicId: "data", set: "practice",
    prompt: "A/B testing is used to:",
    options: ["Back up two databases", "Compare two versions to see which performs better", "Encrypt data twice", "Split the team in two"], answer: 1 },

  // ---- Digital Strategy ----
  { id: "strategy-1", topicId: "strategy", set: "diagnostic",
    prompt: "Digital transformation is best defined as:",
    options: ["Buying new software", "Rewiring how an organization creates value using digital capabilities", "Moving files to the cloud", "Hiring more engineers"], answer: 1 },
  { id: "strategy-2", topicId: "strategy", set: "diagnostic",
    prompt: "A 'platform' business model creates value mainly by:",
    options: ["Owning all inventory", "Facilitating exchanges between producers and consumers", "Advertising heavily", "Lowering prices below cost"], answer: 1 },
  { id: "strategy-3", topicId: "strategy", set: "practice",
    prompt: "'Network effects' mean a product becomes more valuable when:",
    options: ["Prices rise", "More people use it", "It has more features", "It is advertised more"], answer: 1 },
  { id: "strategy-4", topicId: "strategy", set: "practice",
    prompt: "A common first step in a digital strategy is to:",
    options: ["Replace all staff", "Identify the customer job to be done and where digital adds value", "Buy the newest hardware", "Outsource everything"], answer: 1 },

  // ---- Emerging Tech ----
  { id: "emerging-1", topicId: "emerging", set: "diagnostic",
    prompt: "The main value proposition of edge computing is:",
    options: ["Cheaper storage", "Processing data closer to its source to cut latency", "Prettier dashboards", "Eliminating the need for the cloud"], answer: 1 },
  { id: "emerging-2", topicId: "emerging", set: "diagnostic",
    prompt: "A digital twin is:",
    options: ["A backup employee", "A virtual model of a physical system, updated with live data", "A duplicate database", "A second monitor"], answer: 1 },
  { id: "emerging-3", topicId: "emerging", set: "practice",
    prompt: "'IoT' most directly enables organizations to:",
    options: ["Write better emails", "Collect real-time data from physical devices", "Reduce headcount", "Design logos"], answer: 1 },
  { id: "emerging-4", topicId: "emerging", set: "practice",
    prompt: "A key business risk of adopting generative AI is:",
    options: ["It uses electricity", "Confident but incorrect outputs reaching decisions unchecked", "It requires a keyboard", "It is too slow to type"], answer: 1 },

  // ---- Change Management ----
  { id: "change-1", topicId: "change", set: "diagnostic",
    prompt: "The most common reason digital transformations fail is:",
    options: ["Insufficient hardware", "People and change-management issues, not technology", "Slow internet", "Too few dashboards"], answer: 1 },
  { id: "change-2", topicId: "change", set: "diagnostic",
    prompt: "A 'change champion' in an organization is someone who:",
    options: ["Approves all budgets", "Advocates for and models the new way of working among peers", "Writes the code", "Runs the servers"], answer: 1 },
  { id: "change-3", topicId: "change", set: "practice",
    prompt: "Resistance to change is best reduced by:",
    options: ["Mandating it silently", "Involving people early and explaining the 'why'", "Removing all training", "Hiding the roadmap"], answer: 1 },
  { id: "change-4", topicId: "change", set: "practice",
    prompt: "A 'quick win' early in a transformation is valuable because it:",
    options: ["Ends the project", "Builds momentum and belief that change is possible", "Replaces strategy", "Cuts the budget"], answer: 1 },

  // third practice item per topic (gives ~3 rounds of fresh material)
  { id: "data-5", topicId: "data", set: "practice",
    prompt: "'Data literacy' across an organization means:",
    options: ["Everyone can code", "People can read, interpret, and question data in their work", "Only analysts touch data", "All data is encrypted"], answer: 1 },
  { id: "strategy-5", topicId: "strategy", set: "practice",
    prompt: "A 'minimum viable product' (MVP) is:",
    options: ["The cheapest possible product", "The smallest version that delivers value and tests key assumptions", "A fully finished product", "A marketing plan"], answer: 1 },
  { id: "emerging-5", topicId: "emerging", set: "practice",
    prompt: "The main advantage of cloud computing for scaling is:",
    options: ["It looks modern", "On-demand resources you pay for only as you use them", "It removes all cost", "It needs no internet"], answer: 1 },
  { id: "change-5", topicId: "change", set: "practice",
    prompt: "Transformation success is best measured with:",
    options: ["Gut feel", "Clear, agreed metrics tied to business outcomes", "The number of meetings held", "Lines of code written"], answer: 1 },
];

export function diagnosticQuestions(): Question[] {
  return QUESTIONS.filter((q) => q.set === "diagnostic");
}

export function practicePool(): Question[] {
  return QUESTIONS.filter((q) => q.set === "practice");
}
