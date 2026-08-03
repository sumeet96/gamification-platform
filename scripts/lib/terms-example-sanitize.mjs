// example_sentence is consumed ONLY by fill-in-the-blanks (package A2, not yet built) --
// choose-the-right-word and match-the-following never read it. terms-validate.mjs's
// checkExampleContainsTerm rejects the WHOLE item when the model writes an example that does not
// contain the term verbatim; on the last verified 18-page run that killed 2 of 5 drafts for a
// field neither shipped game uses. Same shape of over-rejection CLAUDE.md already names once
// (G2's clue-leak rule killing 5 of 8 valid items by testing each word of a multi-word term
// independently).
//
// The fix: null the doomed field instead of discarding the whole item, BEFORE the mandatory
// validator (terms-validate.mjs) ever sees it. Nulling first, rather than special-casing the
// rejection afterward, matters because checks in terms-validate.mjs run in order and stop at the
// first failure -- an item that would fail example-missing-term AND something later (bad
// distractors, a source leak, ...) never got that second check to run at all. Nulling up front
// lets the normal validator pass reach that later check and reject on it if it's really there.
//
// terms-validate.mjs is NOT touched -- it must keep REPORTING example-missing-term as a defect,
// per the brief; this module only changes how the generator RESPONDS to that report.

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Mirrors terms-validate.mjs's checkExampleContainsTerm exactly (duplicated, not imported --
// that file must not change): true if `sentence` contains `term` as a whole word/phrase.
function containsTermVerbatim(sentence, term) {
  const re = new RegExp(`\\b${escapeRegex(term.trim())}\\b`, 'i')
  return re.test(sentence)
}

// example_sentence feeds fill-in-the-blanks as ONE blankable sentence. A live draft put an
// entire bulleted slide dump (a Netflix timeline, ~8 lines) in this field -- useless for
// blanking, and NOT caught by "missing term" since the term text happened to appear somewhere in
// the dump too. Threshold: any newline, or over 220 characters, is not a single sentence. 220 is
// chosen against this generator's own prose fields -- clue/gloss run 60-140 chars in practice on
// verified runs -- giving headroom for a real compound sentence while still being well short of
// what a multi-line dump collapses to on one line.
const EXAMPLE_MAX_CHARS = 220
function looksLikeOneSentence(sentence) {
  return !sentence.includes('\n') && sentence.trim().length <= EXAMPLE_MAX_CHARS
}

/**
 * Mutates `drafts` in place: nulls any example_sentence that is not a real single sentence, or
 * that does not contain its item's term verbatim, instead of leaving the item to be rejected
 * outright by terms-validate.mjs's checkExampleContainsTerm. Every other rejection rule is
 * untouched -- an item nulled here still goes through the full validator afterward, so a second,
 * unrelated defect (clue leak, bad distractors, chart-title term, ...) still rejects it.
 *
 * @returns {{ nulledForLength: number, nulledForMissingTerm: number }}
 */
export function sanitizeExampleSentences(drafts) {
  let nulledForLength = 0
  let nulledForMissingTerm = 0
  for (const item of drafts) {
    if (typeof item?.example_sentence !== 'string') continue
    if (!looksLikeOneSentence(item.example_sentence)) {
      item.example_sentence = null
      nulledForLength++
      continue
    }
    if (typeof item.term === 'string' && !containsTermVerbatim(item.example_sentence, item.term)) {
      item.example_sentence = null
      nulledForMissingTerm++
    }
  }
  return { nulledForLength, nulledForMissingTerm }
}

export { EXAMPLE_MAX_CHARS }
