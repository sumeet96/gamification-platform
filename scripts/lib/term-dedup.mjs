// Cross-file dedup key for term/definition concepts, added for build-term-mcq-spike.mjs's
// --from-json screening path. Two independently-generated decks can teach the SAME concept under
// different strings -- "Minimum Viable Products (MVPs)" in one deck, "Minimum Viable Product (MVP)"
// in another -- and an exact-string dedup would let both through as two rows for one concept.
//
// Deliberately a shallow normaliser, same spirit as generate-terms.mjs's normaliseGlossaryKey: it
// only needs to catch the same concept restated with different casing/parenthetical/pluralisation,
// not decide that two different concepts are secretly the same one. No stemming, no synonym
// folding -- stripping a trailing plural is the one morphological step, not a general stemmer.
export function normaliseTermKey(term) {
  let key = (term ?? '').trim().toLowerCase()
  // Strip parenthetical suffixes, e.g. "extreme programming (xp)" -> "extreme programming".
  key = key.replace(/\s*\([^)]*\)/g, '')
  key = key.replace(/\s+/g, ' ').trim()
  // Strip a trailing plural. Simple heuristic -- ends in "s" but not "ss" -- deliberately not a
  // real stemmer; it exists to catch "products" vs "product", nothing more ambitious.
  if (key.endsWith('s') && !key.endsWith('ss')) key = key.slice(0, -1)
  return key.replace(/\s+/g, ' ').trim()
}
