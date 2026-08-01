// Fix for the content-quality defect found by playing the game, not by tests (2 Aug 2026):
// choose-the-right-word items answerable by keyword matching alone, no material required.
// See scripts/lib/terms-validate.mjs for the two new rules this pins down.
//
// checkOptionSetGiveaway (Fix 1): a clue word shared with the correct term but with NO
// distractor is a giveaway even when checkClueLeak's whole-term/whole-word check passes it.
// checkChartTitle (Fix 2): a term that is itself a chart/exhibit caption, not a concept.
//
// Fix 3 (2 Aug 2026): checkOptionSetGiveaway's CURE was wrong, not its detection. Rejecting the
// whole item on a hit destroyed real items -- "Minimum Viable Products" on "product", "Story
// Wall" on "story", "User story cards" on "card" -- because you cannot define a term without
// words related to it. The fix moved the remedy to generate-terms.mjs (repair the distractor set,
// one retry) and made validateTerms bucket a pure giveaway hit as `repairable` rather than
// `rejected`. See the four fixtures below taken from the real content_items rows named in the
// brief, and the revalidateItem tests proving the detector still fires with no shared distractor
// and stops firing once one shares the token.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkOptionSetGiveaway, checkChartTitle, validateTerms, revalidateItem } from '../scripts/lib/terms-validate.mjs'

/** Minimal valid item shape, overridden per test. Matches what generate-terms.mjs writes. */
function makeItem(overrides = {}) {
  return {
    topic: 'test',
    cognitive_level: 'recall',
    term: 'Term',
    clue: 'A clue that does not mention the term.',
    example_sentence: null,
    variants: [],
    distractors: ['Distractor One', 'Distractor Two'],
    page: 1,
    ...overrides,
  }
}

// ---- checkOptionSetGiveaway: the five real failing examples from the live database ----

test('giveaway: "Leading Toy Brands USA" answered on USA/United States alone', () => {
  const item = makeItem({
    term: 'Leading Toy Brands USA',
    clue: 'Top toy companies by market share in the United States as of 2022.',
    distractors: ['Leading Toy Brands Japan', 'Leading Toy Brands China', 'Top Toy Markets 2024'],
  })
  const fail = checkOptionSetGiveaway(item)
  assert.ok(fail, 'must reject')
  assert.equal(fail.rule, 'option-set-giveaway')
})

test('giveaway: "toy" alone does not trip the rule (present in every distractor too)', () => {
  // Isolates the mechanism: "toy" is shared with the term but also with every distractor, so
  // it is not what makes the item above fail — "USA"/"United States" is.
  const item = makeItem({
    term: 'Leading Toy Brands Germany',
    clue: 'Top toy companies by market share, without naming the country.',
    distractors: ['Leading Toy Brands Japan', 'Leading Toy Brands China', 'Leading Toy Brands France'],
  })
  assert.equal(checkOptionSetGiveaway(item), null)
})

test('giveaway: year uniquely identifies the term ("Netflix Subscribers Statistics 2025")', () => {
  const item = makeItem({
    term: 'Netflix Subscribers Statistics 2025',
    clue: 'Streaming platform subscriber figures reported for 2025.',
    distractors: ['Netflix Subscribers Statistics 2020', 'Disney+ Subscribers Statistics', 'Hulu Growth Report'],
  })
  const fail = checkOptionSetGiveaway(item)
  assert.ok(fail)
  assert.equal(fail.rule, 'option-set-giveaway')
})

test('giveaway: "Mattel Japan Market Share" answered on Japan alone', () => {
  const item = makeItem({
    term: 'Mattel Japan Market Share',
    clue: 'A toy maker\'s share of the Japan market.',
    distractors: ['Mattel USA Market Share', 'Hasbro Global Market Share', 'Mattel Global Revenue'],
  })
  const fail = checkOptionSetGiveaway(item)
  assert.ok(fail)
})

test('giveaway: "China Coordination Group" answered on China alone (no distractor names a country)', () => {
  const item = makeItem({
    term: 'China Coordination Group',
    clue: 'The internal body responsible for coordinating China operations.',
    distractors: ['Regional Coordination Group', 'Global Coordination Group', 'Divisional Coordination Group'],
  })
  const fail = checkOptionSetGiveaway(item)
  assert.ok(fail, 'no distractor shares "china" with the term, so the clue names it for free')
})

test('giveaway: "New Retail Department" answered on "retail" alone', () => {
  const item = makeItem({
    term: 'New Retail Department',
    clue: 'The retail-focused arm formed to run physical and online stores together.',
    distractors: ['Legacy Sales Department', 'Digital Marketing Department', 'Customer Support Department'],
  })
  const fail = checkOptionSetGiveaway(item)
  assert.ok(fail)
})

test('giveaway: "User story cards" answered on "user" and "cards"', () => {
  const item = makeItem({
    term: 'User story cards',
    clue: 'Cards used to capture a user requirement in agile planning.',
    distractors: ['Kanban Board', 'Sprint Backlog', 'Burndown Chart'],
  })
  const fail = checkOptionSetGiveaway(item)
  assert.ok(fail)
})

// ---- negative controls: legitimate multi-word terms must NOT be rejected ----

test('negative control: "Minimum Viable Product" with a normal shared word in every distractor', () => {
  const item = makeItem({
    term: 'Minimum Viable Product',
    clue: 'A basic version of a product released to test market fit early.',
    distractors: ['Full Feature Product', 'Beta Product Release', 'Final Product Launch'],
  })
  assert.equal(checkOptionSetGiveaway(item), null)
})

test('negative control: "Lean and Agile Delivery Model" with an unrelated clue', () => {
  const item = makeItem({
    term: 'Lean and Agile Delivery Model',
    clue: 'An approach to shipping software in small, frequent increments.',
    distractors: ['Waterfall Delivery Model', 'Big Bang Delivery Model', 'Phased Rollout Model'],
  })
  assert.equal(checkOptionSetGiveaway(item), null)
})

test('negative control: "Thin Slice teams" with a shared word covered by every distractor', () => {
  const item = makeItem({
    term: 'Thin Slice teams',
    clue: 'Small cross-functional teams that deliver one narrow piece of value end to end.',
    distractors: ['Feature Teams', 'Component Teams', 'Platform Teams'],
  })
  assert.equal(checkOptionSetGiveaway(item), null)
})

test('negative control: "Story Wall" with no shared content word at all', () => {
  const item = makeItem({
    term: 'Story Wall',
    clue: 'A physical or digital board used to visualise work in progress.',
    distractors: ['Kanban Board', 'Sprint Board', 'Task Tracker'],
  })
  assert.equal(checkOptionSetGiveaway(item), null)
})

test('giveaway rule ignores stopwords: "of"/"the" never counts as a shared content word', () => {
  const item = makeItem({
    term: 'Balance of Trade',
    clue: 'The difference between the value of a country\'s exports and the value of its imports.',
    distractors: ['Balance of Payments', 'Terms of Trade', 'Trade Deficit'],
  })
  assert.equal(checkOptionSetGiveaway(item), null)
})

// ---- checkChartTitle ----

test('chart-title: "Leading Toy Brands USA" ends in a country', () => {
  const fail = checkChartTitle(makeItem({ term: 'Leading Toy Brands USA' }))
  assert.ok(fail)
  assert.equal(fail.rule, 'chart-title-term')
})

test('chart-title: "Netflix Subscribers Statistics 2025" ends in a year', () => {
  const fail = checkChartTitle(makeItem({ term: 'Netflix Subscribers Statistics 2025' }))
  assert.ok(fail)
})

test('chart-title: "Mattel Japan Market Share" ends in a metric word', () => {
  const fail = checkChartTitle(makeItem({ term: 'Mattel Japan Market Share' }))
  assert.ok(fail)
})

test('chart-title negative controls: legitimate management terms survive', () => {
  for (const term of ['Minimum Viable Product', 'Lean and Agile Delivery Model', 'Thin Slice teams', 'Story Wall']) {
    assert.equal(checkChartTitle(makeItem({ term })), null, `"${term}" must not be flagged as a chart title`)
  }
})

// ---- end-to-end through validateTerms, so the new rules are confirmed wired in ----

test('validateTerms rejects the live giveaway item end to end', () => {
  const { passed, rejected } = validateTerms([
    makeItem({
      term: 'Leading Toy Brands USA',
      clue: 'Top toy companies by market share in the United States as of 2022.',
      distractors: ['Leading Toy Brands Japan', 'Leading Toy Brands China', 'Top Toy Markets 2024'],
    }),
  ])
  assert.equal(passed.length, 0)
  assert.equal(rejected.length, 1)
  assert.ok(['option-set-giveaway', 'chart-title-term'].includes(rejected[0].rule))
})

test('validateTerms still passes a clean legitimate item end to end', () => {
  const { passed, rejected } = validateTerms([
    makeItem({
      term: 'Minimum Viable Product',
      clue: 'A basic version of a product released to test market fit early.',
      example_sentence: 'The team shipped a Minimum Viable Product in six weeks.',
      distractors: ['Full Feature Product', 'Beta Product Release', 'Final Product Launch'],
    }),
  ])
  assert.equal(rejected.length, 0, JSON.stringify(rejected))
  assert.equal(passed.length, 1)
})

// ---- Fix 3 (2 Aug 2026): the CURE — a giveaway hit is `repairable`, not `rejected` ----
// The four real content_items rows named in the incident report. Three were wrongly rejected by
// the old all-or-nothing rule; the fourth ("Thin Slice teams") is the control that already
// survived and shows why: one of its distractors already carries the giveaway token.

test('"Minimum Viable Products" (real row): repairable, not rejected, while no distractor shares "product"', () => {
  const item = makeItem({
    term: 'Minimum Viable Products',
    clue: 'A list of products focusing on core demands that customers will actually pay for.',
    distractors: ['Feature Backlog', 'Sprint Goals', 'Release Candidates'],
  })
  const { passed, rejected, repairable } = validateTerms([item])
  assert.equal(passed.length, 0)
  assert.equal(rejected.length, 0, JSON.stringify(rejected))
  assert.equal(repairable.length, 1)
  assert.equal(repairable[0].rule, 'option-set-giveaway')
  assert.equal(repairable[0].token, 'product')
})

test('"Minimum Viable Products": accepted once a repaired distractor also carries "product"', () => {
  const repaired = makeItem({
    term: 'Minimum Viable Products',
    clue: 'A list of products focusing on core demands that customers will actually pay for.',
    distractors: ['Full Feature Products', 'Beta Product Releases', 'Release Candidates'],
  })
  assert.equal(revalidateItem(repaired), null)
})

test('"Story Wall" (real row): repairable, not rejected, while no distractor shares "story"', () => {
  const item = makeItem({
    term: 'Story Wall',
    clue: 'A physical board using story cards to map timelines and track progress.',
    distractors: ['Kanban Board', 'Sprint Board', 'Task Tracker'],
  })
  const { rejected, repairable } = validateTerms([item])
  assert.equal(rejected.length, 0, JSON.stringify(rejected))
  assert.equal(repairable.length, 1)
  assert.equal(repairable[0].token, 'story')
})

test('"Story Wall": accepted once a repaired distractor also carries "story"', () => {
  const repaired = makeItem({
    term: 'Story Wall',
    clue: 'A physical board using story cards to map timelines and track progress.',
    distractors: ['Story Board', 'Sprint Board', 'Task Tracker'],
  })
  assert.equal(revalidateItem(repaired), null)
})

test('"User story cards" (real row): repairable, not rejected, while no distractor shares "card"', () => {
  const item = makeItem({
    term: 'User story cards',
    clue: 'Paper cards with descriptive information about a user need, used to plan agile work.',
    distractors: ['Kanban Board', 'Sprint Backlog', 'Burndown Chart'],
  })
  const { rejected, repairable } = validateTerms([item])
  assert.equal(rejected.length, 0, JSON.stringify(rejected))
  assert.equal(repairable.length, 1)
  assert.equal(repairable[0].token, 'card')
})

test('"User story cards": accepted once repaired distractors cover every shared token', () => {
  // This clue shares TWO tokens with the term ("card" and "user") -- realistic, since the real
  // row does too (brief: "Paper cards with descriptive information about user needs"). The
  // detector fires on the first uncovered token it finds ("card"; see the repairable test above),
  // but revalidation checks ALL shared tokens, so a full repair has to cover both, not just the
  // one the detector happened to report first. One distractor per token is enough.
  const repaired = makeItem({
    term: 'User story cards',
    clue: 'Paper cards with descriptive information about a user need, used to plan agile work.',
    distractors: ['Task cards', 'User Persona Board', 'Burndown Chart'],
  })
  assert.equal(revalidateItem(repaired), null)
})

test('"Thin Slice teams" (real row, the control): already passes cleanly, no repair needed', () => {
  // The item that survived the old rule and revealed the diagnosis: its distractor "Integrated
  // teams" already carries the giveaway token "teams", so the option set never leaks in the first
  // place — nothing to repair.
  const item = makeItem({
    term: 'Thin Slice teams',
    clue: 'Cross-functional teams responsible for delivering one narrow piece of value end to end.',
    distractors: ['Integrated teams', 'User story cards', 'Build-Measure-Learn model'],
  })
  const { passed, repairable, rejected } = validateTerms([item])
  assert.equal(passed.length, 1)
  assert.equal(repairable.length, 0)
  assert.equal(rejected.length, 0)
})

// ---- the genuinely broken items must still die outright — never sent for repair ----
// checkChartTitle runs before checkOptionSetGiveaway in the ordered pipeline specifically so a
// chart/exhibit caption never reaches the repairable bucket: better distractors cannot turn a
// caption into a concept.

test('chart-title captions are rejected outright and never bucketed as repairable', () => {
  const items = [
    makeItem({
      term: 'Leading Toy Brands USA',
      clue: 'Top toy companies by market share in the United States as of 2022.',
      distractors: ['Leading Toy Brands Japan', 'Leading Toy Brands China', 'Top Toy Markets 2024'],
    }),
    makeItem({
      term: 'Mattel Japan Market Share',
      clue: "A toy maker's share of the Japan market.",
      distractors: ['Mattel USA Market Share', 'Hasbro Global Market Share', 'Mattel Global Revenue'],
    }),
    makeItem({
      term: 'Netflix Subscribers Statistics 2025',
      clue: 'Streaming platform subscriber figures reported for 2025.',
      distractors: ['Netflix Subscribers Statistics 2020', 'Disney+ Subscribers Statistics', 'Hulu Growth Report'],
    }),
  ]
  const { passed, rejected, repairable } = validateTerms(items)
  assert.equal(passed.length, 0)
  assert.equal(repairable.length, 0)
  assert.equal(rejected.length, 3)
  for (const r of rejected) assert.equal(r.rule, 'chart-title-term')
})

// ---- the behavioural contract of the whole change ----

test('behavioural contract: the detector fires with no shared distractor and clears once one shares the token', () => {
  const broken = makeItem({
    term: 'Minimum Viable Products',
    clue: 'A list of products focusing on core demands that customers will actually pay for.',
    distractors: ['Feature Backlog', 'Sprint Goals', 'Release Candidates'],
  })
  const fixed = { ...broken, distractors: ['Full Feature Products', 'Beta Product Releases', 'Release Candidates'] }
  const fail = checkOptionSetGiveaway(broken)
  assert.ok(fail, 'must fire when no distractor shares the giveaway token')
  assert.equal(fail.token, 'product')
  assert.equal(checkOptionSetGiveaway(fixed), null, 'must clear once a distractor shares the token')
})
