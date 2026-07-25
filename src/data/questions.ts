/**
 * Hardcoded Digital Transformation MCQs, tagged by topic (2 per topic).
 * Placeholder content — swap for Prof. Singh's real course material.
 * `answer` is the index into `options`.
 */
export interface Question {
  id: string;
  topicId: string;
  prompt: string;
  options: string[];
  answer: number;
}

export const QUESTIONS: Question[] = [
  {
    id: "data-1",
    topicId: "data",
    prompt: "A 'single source of truth' for analytics primarily reduces which problem?",
    options: ["Server costs", "Conflicting numbers across teams", "Model overfitting", "Network latency"],
    answer: 1,
  },
  {
    id: "data-2",
    topicId: "data",
    prompt: "Which best describes a 'leading' metric versus a 'lagging' one?",
    options: [
      "Leading predicts future outcomes; lagging reports past results",
      "Leading is larger in value",
      "Leading is always financial",
      "There is no difference",
    ],
    answer: 0,
  },
  {
    id: "strategy-1",
    topicId: "strategy",
    prompt: "Digital transformation is best defined as:",
    options: [
      "Buying new software",
      "Rewiring how an organization creates value using digital capabilities",
      "Moving files to the cloud",
      "Hiring more engineers",
    ],
    answer: 1,
  },
  {
    id: "strategy-2",
    topicId: "strategy",
    prompt: "A 'platform' business model creates value mainly by:",
    options: [
      "Owning all inventory",
      "Facilitating exchanges between producers and consumers",
      "Advertising heavily",
      "Lowering prices below cost",
    ],
    answer: 1,
  },
  {
    id: "emerging-1",
    topicId: "emerging",
    prompt: "The main value proposition of edge computing is:",
    options: [
      "Cheaper storage",
      "Processing data closer to its source to cut latency",
      "Prettier dashboards",
      "Eliminating the need for the cloud",
    ],
    answer: 1,
  },
  {
    id: "emerging-2",
    topicId: "emerging",
    prompt: "A digital twin is:",
    options: [
      "A backup employee",
      "A virtual model of a physical system, updated with live data",
      "A duplicate database",
      "A second monitor",
    ],
    answer: 1,
  },
  {
    id: "change-1",
    topicId: "change",
    prompt: "The most common reason digital transformations fail is:",
    options: [
      "Insufficient hardware",
      "People and change-management issues, not technology",
      "Slow internet",
      "Too few dashboards",
    ],
    answer: 1,
  },
  {
    id: "change-2",
    topicId: "change",
    prompt: "A 'change champion' in an organization is someone who:",
    options: [
      "Approves all budgets",
      "Advocates for and models the new way of working among peers",
      "Writes the code",
      "Runs the servers",
    ],
    answer: 1,
  },
];
