# Grounded vs ungrounded LLM student simulation

Run 31 Jul 2026. Method background and citations: `docs/literature/item-difficulty-without-students.md`.

The Phase 0 spike (30 Jul, n=4, ungrounded) proved the pipeline ran but measured the wrong thing: the
simulated students had never seen the deck, so a high success rate meant "answerable without the
material", not "easy". This run tests the fix.

## Design

Same 15 questions (`Pitch_Session 12` deck, Airbnb worked example), same seeds, three arms, n=30
simulated students each, NAEP-shaped ability mix, `llama3.2` (~3B) local via Ollama. 450 responses per
arm, 1,350 total, 0 unparseable.

| Arm | Grounding |
|---|---|
| A ungrounded | control — the student has never seen the deck |
| B grounded, full | every ability tier reads the whole source excerpt |
| C grounded, retention | the excerpt is thinned per tier (Below Basic keeps 30% of its lines, Basic 55%, Proficient 80%, Advanced 100%) |

Commands:
```
node scripts/extract-slide-text.mjs "<deck>.pdf" spike-data/source-session12.json
node scripts/spike-simulate-difficulty.mjs spike-data/questions-session12.json --n 30 --concurrency 4 \
  [--source spike-data/excerpts-session12.json [--retention]] --out spike-data/run-X.json
node scripts/spike-compare-arms.mjs spike-data/run-A-*.json spike-data/run-B-*.json spike-data/run-C-*.json
```

## Result 1 — grounding alone is not enough; the tier must control *access* to the material

This is the headline and it was not predicted.

| Arm | Below Basic | Basic | Proficient | Advanced | slope |
|---|---|---|---|---|---|
| A ungrounded | 46% | 41% | 50% | 42% | **−4 pts**, non-monotonic |
| B grounded, full | 81% | 87% | 85% | 89% | **+8 pts**, non-monotonic |
| C grounded, retention | 57% | 71% | 78% | 89% | **+31 pts, monotonic** |

In arms A and B the ability personas are **decorative** — telling a 3B model "you are a struggling
student" does not make it answer like one. Only arm C produces an ability gradient, because there the
tier changes what the student can actually see.

The published work (arXiv 2601.09953) does not hit this, because NAEP maths items are self-contained:
the model's own competence supplies the gradient. Our items are source-dependent recall, so with the
source in context the task collapses into reading comprehension and the gradient disappears. **For
source-dependent material, retention must be modelled explicitly.** This is a domain-transfer finding
worth reporting in the paper.

## Result 2 — no ceiling, and the distribution is binnable

| Arm | mean | min | max | spread | sd | at ceiling (≥95%) | at floor (≤5%) |
|---|---|---|---|---|---|---|---|
| A ungrounded | 0.45 | 0.17 | 1.00 | 0.83 | 0.23 | — | — |
| B grounded, full | 0.85 | 0.30 | 1.00 | 0.70 | 0.21 | — | — |
| C grounded, retention | 0.71 | 0.33 | 1.00 | 0.67 | 0.19 | **1/15** | **0/15** |

The pre-stated gate (spread < 0.20 = fail) is passed in every arm. Arm B is compressed high (mean
0.85) as predicted — grounding without retention *is* mostly a reading test — but it does not fully
ceiling. Arm C sits at a mean facility of 0.71 with usable spread, which quintile-bins into the 1–5
column without collapsing.

Rank agreement between arms: A↔B 0.51, A↔C 0.66, B↔C 0.70. **The grounding choice materially changes
the item ordering**, so it is a real methodological decision and not a detail.

## Result 3 — the ordering is not an artifact of the thinning mechanism

The obvious objection to arm C: a long excerpt loses more lines, so "difficulty" might just be slide
length. It is not.

| | ρ(p, excerpt lines) | ρ(p, excerpt chars) |
|---|---|---|
| A ungrounded | −0.26 | +0.17 |
| B grounded, full | −0.19 | +0.12 |
| C grounded, retention | **−0.08** | **+0.33** |

At n=15 the critical value is ≈0.52, so none of these is significant, and the character correlation
runs *opposite* to the artifact hypothesis. Excerpt length does not explain arm C's ordering.

## Result 4 — the model-asserted 1–5 labels discriminate better than the project has been assuming

**This contradicts a stated premise and needs attention.**

Rank correlation of simulated success against the asserted label (negative is the correct direction —
harder label should mean lower success):

| Arm | ρ vs asserted difficulty |
|---|---|
| A ungrounded | −0.68 |
| B grounded, full | −0.50 |
| C grounded, retention | −0.63 |

Arm C mean facility by label: **d1 91% (n=3), d2 70% (n=8), d3 66% (n=3), d4 33% (n=1)** — monotonic.
At n=15 the critical ρ is ≈0.52, so −0.63 is significant at p<0.05.

The existing claim — "model-asserted difficulty labels do not discriminate, confirmed on three
independent samples" (`docs/consult-brief.md`, `docs/PROJECT_MAP.md` §1.6) — rests on **eyeballing**:
"a question labelled 4 was answerable cold, and 1s and 2s were indistinguishable." This run measures
that sample rather than judging it, and gets a different answer:

- The d4 item (#8) is **not** answerable cold — 33% ungrounded, the hardest item in the set.
- "1s and 2s are indistinguishable" **is** supported at the fine grain: d1 #9 scores 80% while d2 #1
  scores 93%. Adjacent bands overlap heavily.

So the accurate statement is **"the labels discriminate coarsely across the full range but are
unreliable between adjacent levels"**, not "they do not discriminate." That is a weaker problem than
the one the simulation work was justified against.

Caveats before acting on this: n=15, one deck, one d4 item and no d5; the same model wrote both the
questions and their labels, so label and content share a source; and llama3.2's failure rate may track
surface complexity for the same reasons the labeller did.

The decision to simulate still stands on its own merits — a continuous empirical estimate supports
quintile binning and later validation against observed facility, which a coarse ordinal opinion cannot.
But the *justification* in `CLAUDE.md`, `docs/PROJECT_MAP.md` §1.6 and `docs/consult-brief.md` overstates
the evidence and should be corrected.

## Result 5 — the question-quality detector, corrected

The 30 Jul n=4 run flagged **4 of 15** items as answerable with zero deck knowledge. At n=30 only
**1 of 15** is at ceiling in both the ungrounded and grounded arms:

- **[0]** "What is a primary use case for a standard pitch deck structure based on analyzing thousands
  of successful pitches?" — 100% in every arm.

The other three were **n=4 sampling noise**. The detector is real but needs n≥30; at n=4 it
over-flags by 4×. Worth adding to `scripts/validate-questions.mjs` as a gate, at n=30, not n=4.

## Result 6 — items whose source is a diagram do not survive text transcription

Item #8 (Competitive Landscape, the only d4) scores 33% / 30% / 33% — **grounding does not help it at
all**. It asks how AirBed&Breakfast is positioned on a 2×2 of affordability against transaction type.
The transcription recovers every label on that slide but not the *positions*, so the excerpt genuinely
cannot answer it.

Consequence for package G1: `source_excerpt` as plain text is lossy for matrix, chart and positional
slides. Either those items need a different provenance representation, or questions generated from
such slides cannot be difficulty-calibrated by text simulation.

## Incidental findings about the source deck

- **False slide attribution is 3/15, not the 2/15 estimated in `generator-spec.md`.** Items #0 and #1
  are both attributed to Airbnb slide 1 when their content is on template pages 2 and 4; item #13
  cites the Airbnb Product screenshot while asking about the template bullets on page 17. Slide 1 was
  used as a dumping ground, exactly as the spec predicted. This run corrected the three attributions
  before grounding, and the corrections are recorded in `spike-data/excerpts-session12.json`.
- **12 of 26 pages have no text layer.** The Airbnb example slides are images. `scripts/extract-slide-text.mjs`
  recovers them via Gemini vision on the PDF (13,885 in / 2,841 out tokens, one call).
- **The deck's "Competitive Advantages" slide is Lorem ipsum** under all six real headings.

## Limits — do not overstate these results

- **n=15 items, one deck, one topic.** Every correlation here is at the edge of significance.
- **This validates the ordering, not the magnitude.** Whether a simulated 0.71 corresponds to a real
  student facility of 0.71 is untested and needs the pilot.
- **The retention fractions (0.30/0.55/0.80/1.00) are a chosen knob**, not a calibrated one. The
  result is sensitive to them and no sensitivity analysis was run.
- **Thinning drops whole lines at random.** A real student forgets selectively, not uniformly.
- **No real-student comparison exists.** That remains the point of Result 3 in the literature note and
  the DSR contribution.

## Timing

2.6–5.8 s per response; the ungrounded arm was slowest (44m) and the two grounded arms faster (23m,
19m), which is the opposite of expected and most likely reflects cold model load on the first arm
rather than anything about prompt length. Treat ~3 s/response as the planning figure: **400 items ×
n=30 ≈ 10 hours**, an overnight job.
