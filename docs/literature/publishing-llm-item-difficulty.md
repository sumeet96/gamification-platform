# Publishing the LLM-based item-difficulty method: prior work and venue fit

_Compiled 1 Aug 2026_

## Question
Two things, for the retention-gated LLM-student-simulation method built into this project (see
`docs/literature/item-difficulty-without-students.md` and
`docs/experiments/2026-07-31_grounded-difficulty-simulation.md`): (1) where does the current state of
the art on student-free / LLM-based item-difficulty estimation sit relative to our five findings —
retention-gated grounding, the memorisation confound, ceiling as model×material, a facility/
discrimination tradeoff, and seed-based reproducibility — and (2) where, realistically, could this be
published, given there is still no human ground truth.

## What the evidence says

### 1. Direct LLM rating of difficulty (no simulation)

Acquaye et al. (2026, arXiv preprint, "Take Out Your Calculators") explicitly test this as a baseline
before moving to simulation and report that direct difficulty judgements from LLMs are unreliable —
consistent with what this project already tried and abandoned (A3 in the prior note)
([arXiv:2601.09953](https://arxiv.org/abs/2601.09953)).

The more optimistic result on direct rating is Hoard et al. (2026, arXiv preprint, "Estimating Item
Difficulty with Large Language Models as Experts"), which evaluates three off-the-shelf LLMs as
difficulty raters, without response data, on an item bank of **primary-school mathematics** from an
online learning system across six sub-domains. Absolute judgement alone is weak; **pairwise
comparison** (is item A harder than item B?) "consistently outperformed absolute judgement," and
absolute judgement recovers moderate-to-strong performance only when token-level probabilities and
worked examples of known-difficulty items are added to the prompt
([arXiv:2605.18562](https://arxiv.org/pdf/2605.18562)). This is a **peer-review status unclear (arXiv
preprint, May 2026)** finding, and it is math-only, like the simulation literature below — it does not
establish that direct rating works on prose/case-study content. **Partially overlaps** with A3 in the
prior note: it doesn't reverse the "plain rating fails" conclusion, but shows rating can be rescued by
reframing as comparison plus calibration examples, which this project has not tried.

### 2. Simulation-based estimation — domain matters more than the headline figure suggests

The r = 0.75–0.82 figure already cited in this project (Acquaye et al. 2026,
[arXiv:2601.09953](https://arxiv.org/html/2601.09953v2)) is confirmed as **NAEP mathematics MCQs
only**, grades 4/8/12, ~300 simulated students per item, against real IRT difficulty parameters. That
characterisation was correct; no correction needed. The paper also reports the "weaker models simulate
better" pattern this project depends on: **Gemma (weaker at math) outpredicts Llama and Qwen (stronger
at math)** — support for the local-weak-model choice, on a different domain than ours.

Critically, **the same correlation range does not hold outside math.** SMART (Chen et al. 2026 preprint
via arXiv, [2507.05129](https://arxiv.org/html/2507.05129)) aligns simulated students to IRT ability on
two non-math domains — Smarter Balanced grade-6 open-ended reading/argumentation items (49 items,
~8.5M real responses) and CodeWorkout Java programming problems (50 items, ~10.8K real responses) —
and reports **Pearson 0.67 / Spearman 0.57** on reading and **Pearson 0.39 / Spearman 0.42** on coding,
roughly half the NAEP-math figure. This directly confirms the caution already flagged in the prior
note ("treat 0.75 as an optimistic ceiling, not an expectation" for management prose) and gives it a
number: reading-comprehension-style domains land closer to r ≈ 0.5–0.7, and this project's management
prose is closer to that family than to closed-form math. **Supports** the project's existing caution,
with a concrete comparator SMART didn't have when the prior note was written.

A related feature-based (not simulation) approach, Yeo et al. (2026, preprint,
[arXiv:2602.00034](https://arxiv.org/abs/2602.00034)), reaches r ≈ 0.78 on 250k+ math responses by
training a regressor on LLM-extracted item features. Also math-only; already noted in the prior file.

### 3. Memorisation / contamination as a confound — general mechanism is known, this specific application is not

The general literature is unambiguous that training-data contamination inflates LLM benchmark
performance and that the effect is **not uniform across items**: contamination surveys report that
"easy items are more likely to appear verbatim in training data" than specialist-authored hard items,
which differentially and non-randomly distorts difficulty measurement
([Benchmark Data Contamination of Large Language Models: A Survey](https://arxiv.org/pdf/2406.04244);
[NLP Evaluation in Trouble](https://arxiv.org/pdf/2310.18018)). Separately, Petrov et al. (2026,
preprint, "Can LLMs Estimate Student Struggles?", [arXiv:2512.18880](https://arxiv.org/pdf/2512.18880))
run 20+ models across math and medical-knowledge domains and find that **scaling model size does not
help difficulty alignment with humans; instead models "converge toward a shared machine consensus"
distinct from human difficulty, and high performance itself impedes accurate difficulty estimation** —
close in spirit to finding 2, but framed as a general capability effect, not as a document-specific
recognition effect measured by cross-simulator agreement on memorised versus unmemorised source
material.

**No paper found in this search directly reports what finding 2 measures**: a controlled ρ comparison
between two simulator families on genre-matched *unfamiliar* material versus a *famous* document,
isolating memorisation as the cause of low cross-simulator agreement. The closest analogue is the
general contamination-detection literature's standard method — comparing performance on an original
item versus a paraphrased/varied item to detect memorisation
([Benchmark Data Contamination Survey](https://arxiv.org/pdf/2406.04244)) — which is the same logic
applied here (known deck vs. unknown deck) but has not, as far as this search found, been applied to
*grounded LLM student-simulation for item difficulty* specifically. **This looks like the strongest
candidate for a genuine, if narrow, contribution**: not the discovery that contamination confounds
LLM measurement (well established), but its **quantification inside this specific method** — ρ = 0.62
[0.26, 0.83] on unmemorised decks versus ρ = 0.14 on a memorised one. State this as "extends a known
general mechanism to a specific method," not as a novel mechanism.

### 4. Weaker models and the discrimination/facility tradeoff

The "weaker models simulate better" direction is established for math (finding above,
[arXiv:2601.09953](https://arxiv.org/abs/2601.09953)). Two papers bear on whether this continues to an
inversion point: Petrov et al. 2026 ([arXiv:2512.18880](https://arxiv.org/pdf/2512.18880)) find models
"struggle to simulate the capability limitations of students even when being explicitly prompted to
adopt specific proficiency levels" and that general capability doesn't imply understanding of student
struggle — consistent with weak-tracks-ability-poorly, but framed around strong models failing to act
weak, not weak models failing to discriminate. Ilić & Roll (2026, preprint, "LLMs Struggle to Measure
What Distinguishes Students of Different Proficiency Levels,"
[arXiv:2606.18709](https://arxiv.org/pdf/2606.18709)) find LLM-generated reading-comprehension items
show markedly worse discrimination indices than human-written items across model families (GPT-4o,
Claude, Gemini, Llama, Mistral, Phi, Qwen) — evidence that discrimination is a general weak point for
LLM-based item work, not evidence of a facility/discrimination *tradeoff specifically tied to model
size*. **Partially overlaps**, does not scoop: no source found reports the specific pattern in finding
4 — that the one model weak enough to match human-like mean facility (llama3.2:1b, 0.38) is also the
one whose ability gradient inverts, i.e. a U-shaped relationship between model strength and
simulation validity rather than a monotonic "weaker is always better." Flag as **suggestive novel**,
consistent with the project's own caveat that n≈3 per Advanced tier makes this preliminary.

### 5. Classical psychometric baseline for what a student-free estimate is worth

Linacre (1994, *Rasch Measurement Transactions*, "Sample Size and Item Calibration Stability") is the
standard citation for classical calibration sample sizes: **150–500 responses per item** are typically
needed for Rasch/1PL item parameters to stabilise within ±0.5 logits at conventional confidence, with
lower bounds around 50 for coarse "well-targeted" estimates
([ResearchGate copy](https://www.researchgate.net/publication/235361463_Sample_Size_and_Item_Calibration_Stability)).
This is consistent with, and independently corroborates, the 200–500-response Elo convergence figures
already in the prior note from Bolsinova, Gergely & Brinkhuis (2025/26, *British Journal of
Mathematical and Statistical Psychology*, "Keeping Elo alive,"
[open access](https://pmc.ncbi.nlm.nih.gov/articles/PMC12784335/)). Framing for the paper: a
zero-response simulated estimate is not a replacement for this — it's a cold-start prior that a
150–500-response online update (Elo or IRT) can correct, which is exactly the two-stage design already
recommended in the prior note.

## Contested / mixed findings

- **Does model size trade off against simulation fidelity monotonically, or is it U-shaped?**
  Acquaye et al. 2026 show weaker beats stronger (math, Gemma vs Llama/Qwen). This project's own
  five-model run (finding 4, unpublished-so-far) suggests the trend reverses below some strength
  floor. No published source resolves this either way; treat as open.
- **Direct rating: dead end or rescuable?** A3 in the prior note and Acquaye et al.'s own rejected
  baseline both say plain difficulty rating fails. Hoard et al. 2026
  ([arXiv:2605.18562](https://arxiv.org/pdf/2605.18562)) show pairwise comparison plus calibration
  examples substantially improves it — on math, untested on prose. Not a contradiction so much as an
  unexplored middle ground this project hasn't tried.
- **Discrimination is a general LLM weakness** (Ilić & Roll 2026), independent of the facility question
  this project has focused on. A paper built only around facility/difficulty risks reviewers asking why
  discrimination (item quality, not just hardness) wasn't measured.

## Gaps this project could address

- A controlled memorised-vs-unmemorised cross-simulator agreement comparison, run on purpose-built
  material (not a post hoc discovery on a famous deck), would turn finding 2 from suggestive into a
  clean, citable result.
- No published work applies retention-gated grounding to non-benchmark, real-world prose (case
  studies, slide decks) the way this project does — SMART's reading-comprehension domain is the
  closest, and it is standardized-assessment prose with a huge existing response pool (8.5M), not
  novel unpretested course content. **This is the actual gap**: student-free calibration in the
  zero-existing-response, real-classroom-content setting, which none of the surveyed papers address.
- Human validation (simulated-vs-observed correlation on management-prose items) does not exist
  anywhere in this literature outside math and one reading/coding pair (SMART) — the September pilot
  would be a genuinely new data point in a domain nobody has reported.

## Unverified / needs checking

- Peer-review status of every arXiv-only paper cited above (Acquaye et al., Hoard et al., SMART,
  Petrov et al., Ilić & Roll, Yeo et al.) is **unverified** — all found as arXiv preprints in this
  search; none confirmed as accepted/published at a venue. Treat all as preprints, not peer-reviewed
  results, until checked again closer to submission.
- Whether Bolsinova et al.'s BJMSP paper is 2025 (online first) or 2026 (print) is inconsistently dated
  across sources found in this and the prior search; cite with "2025/2026" until the print record is
  checked.
- LAK 2027 submission deadline was not found in this search (conference date confirmed: 8–12 Mar 2027,
  Recife); needs a direct check of the LAK 2027 CFP page closer to the time.
- No paper was found that names "retention-gated grounding" or an equivalent thinning-by-ability
  mechanism as its own contribution — this search did not turn one up, but the search was not
  exhaustive (no systematic review conducted), so treat "this appears novel" as provisional, not
  confirmed absence.

## Venue options

| Venue | Type | Human-validation expectation | Typical scope fit | Timing vs. Sept–Dec 2026 pilot |
|---|---|---|---|---|
| BEA workshop (ACL SIGEDU) | Peer-reviewed workshop, short (4pp) or long (8pp) papers | Workshops tolerate preliminary/negative results better than main conferences; simulator-only work has appeared before | NLP-for-education audience, exactly the simulate-a-student method type | BEA 2026 deadline (Mar 2026) has passed; **BEA 2027 deadline ~Mar 2027** is realistic for a paper written after the pilot completes (~Dec 2026) |
| EDM (Educational Data Mining) | Peer-reviewed conference + JEDM journal track | Conference program strongly favours empirical validation against real student data | Good fit for the Elo/adaptive-testing half of this work | EDM 2027 deadline ~Feb 2027 (pattern from 2024–26); tight but feasible with pilot data in hand |
| LAK (Learning Analytics & Knowledge) | Peer-reviewed conference | Expects learner-outcome or real-log validation, less tolerant of simulator-only claims | Adaptive dashboard + logging angle fits better than the difficulty-simulation method alone | LAK 2027, Recife, 8–12 Mar 2027; deadline unconfirmed (UNVERIFIED, likely ~Oct 2026 — check CFP) |
| AIED | Peer-reviewed conference, full + short/late-breaking tracks | Full papers expect evaluation; short/late-breaking tracks accept early-stage work | Strong fit — simulated-student methods are an active AIED topic (SMART, Acquaye et al. sit here) | AIED 2027 deadline ~Feb 2027 (pattern from prior years); short/late-breaking track is the realistic pre-pilot-validation slot |
| Journal of Educational Data Mining (JEDM) | Peer-reviewed, open access, rolling, ~3-month review target | Expects rigorous validation but has run methodological/simulation papers | Good long-term fit once pilot data exists | Rolling submission — no deadline pressure; best target for the full post-pilot paper |
| Computers & Education / Computers and Education: Artificial Intelligence | Peer-reviewed journal | High bar for empirical/human validation, education-practice framing | Plausible once pilot data exists; less suited to a methods-only submission | Rolling; realistic only after human validation data lands |
| IEEE Transactions on Learning Technologies (TLT) | Peer-reviewed journal | Expects rigorous evaluation, technical depth welcome | Good fit for the build+method combination (dashboard artifact + calibration method) | Rolling; post-pilot target |
| DESRIST | Peer-reviewed DSR conference, LNCS proceedings | DSR methodology (design rigor, evaluation against Hevner-style criteria) more than statistical human-validation | Best fit for the **whole project** (dashboard artifact, DSR framing) rather than the difficulty-simulation sub-method alone | DESRIST 2026 already ran (Jun, Münster); **DESRIST 2027 CFP not yet found (UNVERIFIED)** — check desristconference.org |
| ICIS / ECIS (general IS) | Peer-reviewed conference | Expects theoretical contribution and rigorous evaluation; DSR track exists at both | Fit is for the parent DSR artifact paper, not a standalone difficulty-method paper | ICIS/ECIS cycles run roughly Jan–Feb (short papers) and spring (full papers) for the following year's conference; check current cycle nearer the time |

## Honest recommendation

**The five findings above are not yet publishable as a standalone paper.** Every comparison so far is
simulator-vs-simulator (finding 2's ρ = 0.62/0.14 memorisation contrast, finding 4's facility/
discrimination pattern) or a build-engineering result (finding 5's reproducibility). No venue in the
table above — including the workshop-tier ones — would accept a difficulty-*calibration* method paper
with zero correlation to observed human facility; `empirical_p` is null on every item, and that is the
single fact reviewers will ask about first. The literature surveyed here (SMART, Acquaye et al.,
Hoard et al.) all report human correlations as their headline result; a paper with none is missing the
result the whole genre exists to report.

What is realistic is a **two-paper plan**, not one:

1. **Now → post-pilot, short/workshop framing (BEA 2027 or AIED short/late-breaking track).** A method
   paper on retention-gated grounding plus the memorisation confound (findings 1–3), explicitly framed
   as *"a cold-start calibration method and its known failure mode, validated against itself across
   three simulators, human validation pending."* Workshops and short/late-breaking tracks are the
   correct home for exactly this honesty level — negative and partial results are welcome there in a
   way they are not in EDM/LAK full papers or journals.
2. **After the pilot, full paper (JEDM, EDM full paper, or TLT).** Add the simulated-vs-observed
   correlation from real pilot responses (the genuinely new data point nobody in this literature has
   for management-prose content), and fold in the DSR framing for a DESRIST or IS-track submission if
   the emphasis shifts to the whole dashboard artifact rather than the calibration sub-method.

Do not submit findings 2 and 4 as headline claims without flagging their sample-size limits
prominently (n=15 items/one deck for finding 2's method development, n≈3 simulated Advanced-tier
students for finding 4) — reviewers at any of the venues above will treat both as pilot observations,
not results, at these sizes, and the project's own conventions already require the same honesty
internally.

## Sources

1. Acquaye, C., Huang, Y. T., Carpuat, M., & Rudinger, R. (2026). Take Out Your Calculators:
   Estimating the Real Difficulty of Question Items with LLM Student Simulations. arXiv preprint.
   https://arxiv.org/abs/2601.09953
2. Hoard, B. et al. (2026). Estimating Item Difficulty with Large Language Models as Experts. arXiv
   preprint. https://arxiv.org/pdf/2605.18562
3. Chen et al. (2026). SMART: Simulated Students Aligned with Item Response Theory for Question
   Difficulty Prediction. arXiv preprint. https://arxiv.org/html/2507.05129
4. Yeo et al. (2026). Synthetic Student Responses: LLM-Extracted Features for IRT Difficulty Parameter
   Estimation. arXiv preprint. https://arxiv.org/abs/2602.00034
5. Petrov et al. (2026). Can LLMs Estimate Student Struggles? Human-AI Difficulty Alignment with
   Proficiency Simulation for Item Difficulty Prediction. arXiv preprint.
   https://arxiv.org/pdf/2512.18880
6. Ilić & Roll (2026). LLMs Struggle to Measure What Distinguishes Students of Different Proficiency
   Levels: A Study of Item Discrimination in Reading Comprehension Assessment. arXiv preprint.
   https://arxiv.org/pdf/2606.18709
7. (Survey) Benchmark Data Contamination of Large Language Models: A Survey (2024/2026 revisions).
   arXiv preprint. https://arxiv.org/pdf/2406.04244
8. NLP Evaluation in Trouble: On the Need to Measure LLM Data Contamination for Each Benchmark (2023).
   arXiv preprint. https://arxiv.org/pdf/2310.18018
9. Linacre, J. M. (1994). Sample Size and Item Calibration Stability. Rasch Measurement Transactions.
   https://www.researchgate.net/publication/235361463_Sample_Size_and_Item_Calibration_Stability
10. Bolsinova, M., Gergely, B., & Brinkhuis, M. J. S. (2025/2026). Keeping Elo alive: Evaluating and
    improving measurement properties of learning systems based on Elo ratings. British Journal of
    Mathematical and Statistical Psychology. https://pmc.ncbi.nlm.nih.gov/articles/PMC12784335/ ;
    https://bpspsychub.onlinelibrary.wiley.com/doi/10.1111/bmsp.12395
11. BEA 2026 (21st Workshop on Innovative Use of NLP for Building Educational Applications) — call for
    papers, dates. https://sig-edu.org/news/bea21-call-for-papers/
12. AIED 2027 — conference listing and historical deadline pattern.
    https://mlciv.com/ai-deadlines/conference/?id=aied27
13. LAK 2027 (International Conference on Learning Analytics & Knowledge) — conference listing.
    https://kmeducationhub.de/international-conference-learning-analytics-knowledge-lak/
14. EDM 2026 Call for Papers / Journal Track description.
    https://educationaldatamining.org/edm2026/call-for-papers/ ; https://jedm.educationaldatamining.org/
15. DESRIST conference overview and 2026 (Münster) record.
    https://desristconference.org/ ; https://www.myhuiban.com/conference/2399
16. Prior project note (background, not independently re-cited above): item-difficulty-without-students.md
    and 2026-07-31_grounded-difficulty-simulation.md (internal, this repository).
