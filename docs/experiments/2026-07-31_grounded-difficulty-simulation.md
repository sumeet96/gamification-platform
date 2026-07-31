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

## Result 4 — the 1–5 labels: measured twice, two different answers

**Superseded in part by Result 7. Read both.** What follows is the llama3.2 measurement; a second
simulator did not reproduce it, and the honest conclusion is now "unresolved".

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

On this evidence alone the statement would be "the labels discriminate coarsely across the full range
but are unreliable between adjacent levels," not "they do not discriminate." **Result 7 shows that
conclusion does not survive a change of simulator.**

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

## Result 7 — replication on a second simulator: the method holds, the difficulty values do not

Run the same 15 items, same seeds, same personas, same thinning through **`gpt-3.5-turbo-0125`**
(pinned snapshot, not the floating alias). 1,350 more responses, 0 unparseable, 0 transport errors,
~2 minutes per arm, about $0.25.

**What replicates — the core method finding.**

| Arm | Below Basic | Basic | Proficient | Advanced | slope |
|---|---|---|---|---|---|
| gpt-3.5, ungrounded | 68% | 72% | 73% | 73% | +5, flat |
| gpt-3.5, grounded full | 98% | 98% | 95% | 93% | **−5, backwards** |
| gpt-3.5, grounded retention | 73% | 87% | 95% | 96% | **+23, monotonic** |

Two unrelated model families, same conclusion: **only retention-gated grounding produces an ability
gradient.** Given the full excerpt the gradient inverts; given no excerpt it vanishes. Result 1 is
not an artifact of llama3.2.

**What does not replicate — which items are hard.**

| Arms compared | Spearman |
|---|---|
| ungrounded: llama3.2 vs gpt-3.5 | **0.75** |
| grounded full: llama3.2 vs gpt-3.5 | 0.43 |
| grounded retention: llama3.2 vs gpt-3.5 | **0.23** |
| grounded retention, excluding items at ceiling in either (n=8) | 0.59 |

The two simulators agree strongly about **which questions are answerable without the deck** (0.75) —
that is a property of the item, so agreement is expected. They agree poorly about **difficulty**
(0.23). Part of that is range restriction: gpt-3.5-turbo ceilings on 7 of 15 items against llama3.2's
1, and tied ranks attenuate the correlation. Removing the ceiling items lifts it to 0.59 on eight
items, which is moderate, not strong.

Largest disagreements (llama3.2 → gpt-3.5): item 8, the 2×2 competitive matrix, 33% → 97%; item 3,
Solution value proposition, 47% → 100%; item 13, 73% → 100%.

**Why gpt-3.5-turbo is the wrong simulator, structurally.** With no source material at all it scores
**0.72** against llama3.2's **0.45** — it recognises this famous pitch deck from training data. A
model that answers ~97% of grounded items correctly cannot represent a struggling student however it
is prompted. This is the source paper's own argument against Llama-3.3-70B (92% correct, r fell to
0.46–0.56), reproduced here on our material. **Keep the weak local simulator.**

**Consequence for Result 4.** The correlation between simulated facility and the asserted 1–5 labels
is **−0.63 under llama3.2 and −0.09 under gpt-3.5-turbo** on identical items. Whether those labels
discriminate is therefore **unresolved**, and no simulator can settle it — only observed student
responses can. `CLAUDE.md`, `docs/PROJECT_MAP.md` §1.6 and `docs/consult-brief.md` were amended to say
so, after briefly stating the llama3.2 result as settled.

**Rule this establishes:** one simulator is one measurement. Any difficulty claim must name the
simulator, and anything load-bearing must be replicated on a second.

### Gemini 3.5 Flash-Lite — attempted, abandoned

Free-tier rate limiting throttled it to ~13 s/response against 0.2 s for the other two providers, and
the run then aborted outright on depleted prepayment credits after 33 consecutive 429s. Two things
survive from the partial run:

- Ungrounded, it scored 97% and 100% on the first two items where llama3.2 scored 100% and 67% —
  the same memorisation signature as gpt-3.5-turbo, more pronounced.
- **`thinkingConfig.thinkingBudget` is rejected by `gemini-3.5-flash-lite` with a 400**, so its
  reasoning step cannot be disabled. Any future comparison including it is tilted in its favour and
  must say so.

Operationally it is also unusable for the real job: at throttled rates a 400-item bank at n=30 would
take about a week.

## Limits — do not overstate these results

- **n=15 items, one deck, one topic.** Every correlation here is at the edge of significance.
- **Difficulty values are simulator-specific** (Result 7). The method — retention-gated grounding —
  replicates across model families; the numbers it produces do not. Never quote a facility figure
  without naming the simulator that produced it.
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
