# Estimating item difficulty without a student cohort

Researched 30 Jul 2026. The problem: adaptive difficulty needs to know which items are hard, our
model-asserted 1–5 labels demonstrably do not discriminate, and there is **no cohort available to
pre-test against**. Classical pre-calibration is therefore off the table.

This is a named, active research problem — **cold-start item calibration**. There are two families of
solution and they compose.

---

## Family A — Predict difficulty before anyone answers

### A1. LLM student simulation — the strongest option

**Do not ask a model how hard an item is. Make models *attempt* it and measure how often they fail.**

This distinction matters, because asking directly is exactly what we already tried and it failed. A
judgment is an opinion; a simulated response distribution is a behaviour.

Method: prompt an LLM to role-play a student at a stated ability tier, have it answer the item, repeat
across a realistic ability mix, and take the simulated success rate as the difficulty estimate.

Reported results ([arXiv 2601.09953](https://arxiv.org/html/2601.09953v2), 631 NAEP maths MCQs):

| Grade | Pearson r vs real IRT difficulty |
|---|---|
| 4 | 0.75 |
| 8 | 0.76 |
| 12 | 0.82 |

AUC for discriminating easy from hard items: **0.77–0.90**. They simulated ~300 students per item over
a NAEP-shaped ability mix (25% Below Basic / 35% Basic / 25% Proficient / 15% Advanced).

**The counterintuitive finding, and the one that decides which model we use: weaker models simulate
better.** Gemma 9B–27B produced the best correlations. Llama-3.3-70B — which answered 92% of the
questions correctly — managed only r = 0.46–0.56. A model that finds a problem hard reproduces
realistic failure patterns; a model that aces it cannot convincingly pretend to struggle. **Do not
reach for the expensive model here.** Flash-Lite is the right tier for reasons beyond cost.

Related: [SMART](https://arxiv.org/pdf/2507.05129) aligns simulated students to IRT ability levels;
[arXiv 2602.00034](https://arxiv.org/abs/2602.00034) reaches r ≈ 0.78 on 250k+ maths responses by
training on LLM-extracted features (solution step count, cognitive complexity, likely misconceptions).

**Limits that bite us specifically:**
- **It predicts difficulty, not misconceptions.** Simulated students matched real students' *distractor
  choice* only **31–47%** of the time, barely above chance. So this cannot substitute for the
  `selected_option` data — that still needs real humans.
- **Domain transfer is unverified.** All of this is maths MCQs against a national benchmark. Ours is
  management prose. In-paper content variation was already large (measurement ρ = 0.75–0.88 versus
  algebra ρ = 0.45–0.64), so **treat 0.75 as an optimistic ceiling, not an expectation.**
- Cost in the paper was 4–48 GPU-hours per item set at 300 simulations. At our scale on Flash-Lite
  ($0.30/$2.50 per 1M) roughly 30 simulations × 400 items lands near **$3–4** — trivial.

### A2. Response-free models from item text — not viable for us

Fine-tuned transformers predicting difficulty from stem and options
([arXiv 2605.16991](https://arxiv.org/pdf/2605.16991)), and embedding-to-item-parameter regression
([arXiv 2607.07141](https://arxiv.org/html/2607.07141)). Both need a **training corpus of items with
known difficulty**. We have none, and building one is the original problem again. Noted and rejected.

### A3. LLM-as-expert judgment — already tried, already failed

[arXiv 2605.18562](https://arxiv.org/pdf/2605.18562) evaluates off-the-shelf LLMs simulating expert
difficulty judgements. This is essentially what produced our non-discriminating 1–5 labels. The
literature is consistent that expert judgement alone is not reliable enough as a sole source.

---

## Family B — Don't pre-calibrate at all; learn it online

### B1. Elo rating

Treat each answer as a match between a student and an item. Both carry a rating; after every response
both update. Ability rises when performance beats expectation, item difficulty moves inversely.

Why it fits our situation
([Pelánek](https://www.sciencedirect.com/science/article/abs/pii/S036013151630080X)):
- **A new item needs no initial difficulty.** The system learns it from use.
- It gives usable estimates **at small sample sizes where IRT cannot**.
- It is computationally trivial to implement.

**The failure mode we would have walked into.** Bolsinova et al., *Keeping Elo alive*, BJMSP 2026
([open access](https://pmc.ncbi.nlm.nih.gov/articles/PMC12784335/)) show that when item selection is
driven by the same ratings the responses are updating, **rating variance inflates rather than
converging** — the estimates diverge. The cause is not that strong students see harder items; it is
that *selection depends on the current estimation error*. Strong students preferentially draw
overestimated items, weak students draw underestimated ones, and the error reinforces itself.

**That is precisely our adaptive-difficulty lever.** Naive Elo plus adaptive selection would produce
confidently wrong difficulty by the end of the pilot.

**Their fix — Parallel Elo — is easy.** Keep *two* independent rating chains per student and per item.
Odd-numbered responses update chain 0, even-numbered update chain 1. When selecting an item using
chain 0, update chain 1, and vice versa. This breaks the dependence between selection and error.
Average the two chains for anything user-facing.

Convergence figures from the paper (responses needed for a rating to settle):

| Condition | Responses |
|---|---|
| K = 0.5 (aggressive) | ~100 |
| K = 0.3 (baseline) | ~200–300 |
| K = 0.1 (cautious) | ~600 |
| Parallel Elo, baseline | ~512 |
| Hard items (p = 0.9) | ~50% more than above |

---

## What this means for our numbers

Our likely response budget: ~20 students × ~20 sessions × ~20 items ≈ **8,000 responses**.

Spread over a bank of ~400 items that is **20 responses per item** — far short of the 200–500 Elo
needs per rating. **Per-item Elo will not converge for us.**

But rate **recipes** rather than items — a recipe being knowledge-unit × task-type × cue-strength —
and with 10–20 recipes each accumulates **400–800 responses**. That is inside the convergence range,
including the Parallel Elo figure. This is the same pooling argument that came out of the
`sol-consult` session, now with numbers attached.

---

## Recommended design

1. **Seed** every item's difficulty by LLM student simulation (A1), on a deliberately weak model.
   Costs a few dollars and no students.
2. **Refine online** with Parallel Elo (B1) rated **at recipe level**, so it converges inside the
   pilot's data volume rather than needing a cohort we do not have.
3. **Validate** the seed against observed facility once responses arrive. Correlation between
   simulated and real difficulty in a management-prose domain is **an unreported result** — the
   published work is maths-only.

Point 3 is worth stating plainly: this is not just a workaround. "Generative AI calibrated the item
bank without human pre-testing, and here is how well that held up" is a **DSR contribution in its own
right**, and it sits exactly on the artifact's thesis that generative AI can be used for adaptive
learning.

**Still requires real humans, and no method above substitutes:** misconception analysis via
`selected_option`, and any claim about learning gains.
