# HANDOFF: Gamified Adaptive Learning Platform (FBT Research Project)

**Prepared:** 22 Jul 2026. **Updated:** 4 Aug 2026 (the screened term cohort went live — 34 items
replace the 43 unscreened rows, verified independently against the database; a clue-precision rule
requiring a clue to name what distinguishes its answer from its nearest distractor, checked per
distractor at write time; a templated-distractor detector built, tested against real items, and
deleted because the signal it chased is semantic, not structural; `db/010` widened the retirement
reason allowlist and is applied; the gen3 item bank screens at 0 broken but the gate is now at
ceiling and only catches catastrophic items; a pre-existing "match-the-following not started" error
in §16 corrected; the between-arm experimental contrast is unchanged and still the top blocker; see
§18). Previous update: 3 Aug 2026 (the term generator was rebuilt after playing
choose-the-right-word surfaced chart-caption items; a two-stage glossary-then-items generation
replaces the single quota-driven call; distractors are now generated, never selected from the
glossary; a new clue-precision finding from a confusable-distractor item that scored worse than its
looser predecessor; the item gap screen distinguishing broken items from merely famous ones; content
items are now retired, never deleted, `db/009` applied live; a screen-before-write build step; a
correction to the simulator-selection criterion; nothing new written to the database — 29 regenerated
items are screened JSON only; the between-arm experimental contrast is unchanged and still the top
open blocker; see §17). Previous update: 1 Aug 2026 (package G2, the term/definition generator, shipped
and unblocked four games; a validator over-rejection bug found and fixed; Wordle's viability now in
doubt on one deck; voluntary persistence made measurable via `round_offer`; deck screening adopted as
a standing cheap gate before full simulation; an unverified anomaly on the Thoughtworks case flagged,
not resolved; a git-hygiene fix after a course PDF was committed by accident; see §16). Previous
update: 31 Jul 2026, later the same day (three P0 packages shipped —
G1 generator, D1 dashboard, Q1 quiz hardening; the simulation method replicated on two more model
families while the difficulty values did not; simulator reproducibility via seeding; the cohort-size
correction to 60–120; the leaderboard/XP decisions; the move to OpenAI as generation provider now that
Gemini credits are depleted; see §15). Previous update, same day: 31 Jul 2026 (grounded LLM student
simulation for item
difficulty — the ability tier must control how much of the source excerpt the simulated student sees,
not just whether it is grounded; the `extract-slide-text.mjs` image-slide recovery step; the
question-quality gate's n=4→n=30 correction; the ~10-hour full-run planning figure; see §14). Previous
update: 30 Jul 2026, second checkpoint (cold-start item-difficulty
research, the decision to seed difficulty by LLM student simulation on a local Ollama model rather
than Elo, the Phase 0 spike and what it did and did not validate, and the `source_excerpt` column
consequence; see §13). Previous update, same day: 30 Jul 2026 (transcript re-read surfacing five corrections to `CLAUDE.md`, the new `docs/PROJECT_MAP.md` project spine, per-game lever semantics and the `resolveLever` design, the platform's live-ingestion/subject-agnostic/PDF-input direction, the project's first automated tests, and a `sol-consult` GPT-5.6 Sol consultation reversing three design decisions; see §12). Previous update: 29 Jul 2026 (question-generation pipeline design decisions, 28-29 Jul, plus the source-diagnostic build, a LibreOffice rationale correction, a codex-steering correction, a `/simplify` pass removing 673 dead/misfiring lines, and a `round_stop` event-shape fix, all recorded same day; see §3a). Previous update: 28 Jul 2026 (post-pivot rebuild; authentication wired same day, commit b569cc5; app gated end to end and lifetime stats added same day, commit 408bd54). Original text consolidates 3 Claude.ai conversations (19-22 Jul 2026), the transcribed 21-minute supervisor call of 21 Jul 2026, and 8 project reference papers. The 27 Jul supervisor call pivoted the project; the 28 Jul 2026 rebuild (commit e0b3fd9) implemented the pivot, a same-day follow-up (commit b569cc5) wired real authentication, and a further same-day commit (408bd54) closed the login gate and wired lifetime stats. All three commits are pushed to `origin/main`. This doc now records both the original vision (history) and the current state.

---

## 1. Project identity

- **Researcher:** Sumeet Mohanty, PGDM (GM) Co'26, XLRI. Prior: BYJU'S (FIFA Math Cup gamification launch); has independently shipped agent-based tools (a CX analysis app, a domain chatbot), used as a build-credibility signal with the professor.
- **Supervisor:** Prof. Harshit Kumar Singh (name per earlier conversations; verify spelling before putting it in any document). An IS/management academic who publishes in AJIS/ACIS/HICSS. His comfort zone is theory-building reviews, MCDM frameworks, and SDT-grounded engagement studies, not software builds. He is teaching a Gamification course from mid-September 2026.
- **Container:** a 6-month Field-Based Training (FBT) project. Budget is roughly 3 hrs/day, so about 400-450 productive hours total.
- **Sumeet's stated priorities:** (1) a deployed, demo-able artifact for the employment portfolio; (2) realistic scope; (3) publication is a bonus under XLRI's name, not the driver. The professor explicitly de-prioritized the paper on the 21 Jul call ("project first, paper if possible, not a pressure point").

## 2. How the idea evolved (important for continuity)

1. **19 Jul (brainstorm + email):** Started as workplace agentic gamification. A literature scan (web plus project PDFs) found that adaptive/personalized gamification is saturated in education and health, that workplace is the under-studied domain, and that existing LLM work uses models as content generators rather than orchestrators. Three problem statements were emailed to the prof: (PS1) an agentic orchestrator for hyper-personalized workplace gamification grounded in his 2023 AJIS relatedness paper, as a Slack/Teams bot plus a DSR pilot; (PS2) a workplace-learning/L&D variant; (PS3) an MCDM framework for evaluating agentic gamification platforms (no build).
2. **21 Jul (meeting prep):** Deep-read of 4 papers. Key correctness notes: the AJIS paper's moderated mediation was non-significant (the earlier email slightly overstated the moderation finding, and a correction was planned for the call); the intellectual-engagement path was null; surveillance/voluntariness was flagged as an ethics topic.
3. **21 Jul call (initial pivot):** The prof proposed combining PS1 and PS2 and shifting the context to education, specifically his own classroom (lower access risk, and he can pilot it himself). The workplace framing is effectively parked. The "agentic orchestration, not content generation" novelty claim carries over intact; it is now expressed as AI designing the game mechanics per student.

## 3. The 27 Jul pivot (supervisor decision on 27 Jul 2026)

**Who:** Prof. Harshit Kumar Singh.

**What changed:** On 27 Jul at 3:39 PM, after reviewing the architecture doc and model comparison (the §7 deliverable), the supervisor pivoted the project from the AI-designed-quests model to a **gamified adaptive-learning dashboard**. 

**Old design (21 Jul call, §3 below):** AI layer designs quests, badges, and point values per student. Anti-comfort-zone economy (points diminish in strong areas, higher rewards for weak areas). Phase 1 baseline, Phase 2+ AI-personalized. Teacher approval per quest (HITL). Teacher dashboard showing inferred strengths/weaknesses and pending AI proposals.

**New design (27 Jul call, 28 Jul rebuild):** Fixed-point scoring (+20 correct, −10 negative marking). Students see net score against potential. Each student picks ONE adaptivity lever: either **adaptive difficulty** (ramps up/down per performance) or **time pressure** (clock tightens). Rapid/normal velocity modes. "Keep going → next round" persistence loop. All mechanics are pre-coded; no AI-designed quests. Framed as a Design Science Research artifact. Per-question event logging (session, round, interactions, score, adaptivity feedback) is the research dataset. MCQ generation from course PDFs remains, but it is pre-generated, not real-time.

**Rationale (prof's reasoning, from call audio):** The AI-quest design added complexity (prompt engineering, HITL workflow, approval latency) that would consume most of the 6-month budget without guaranteeing research insights. The adaptive-learning dashboard is a cleaner DSR artifact: a tight mechanic with a clear experimental treatment (the adaptivity lever), immediate feedback loops, and rich event logging. It is deployable faster and more defensible as research.

**Parked, not dead:** Personality/player-type profiling, age × variable-reward thesis, and teacher-approval HITL quest design are deferred to future work. The repo history preserves the earlier code and thinking.

**Implementation:** 28 Jul 2026 00:45 UTC, commit e0b3fd9 ("Rebuild as adaptive learning game"). The rebuild:
- Moved off Next 14 / src structure to Next 16 / app structure.
- Adopted v0 scaffolding for the front-end (React 19, Tailwind v4).
- Moved from Supabase to Neon serverless Postgres for the DB.
- Replaced the reward-engine and student-profiler code with a clean game engine (lib/game/engine.ts, lib/game/game-context.tsx) tracking session/round/score/adaptivity.
- Wired dashboard, game-setup, quiz, results screens to the engine.
- Generated MCQ pipeline (scripts/generate-questions.mjs) using Gemini from course PDFs.
- Event logging API (app/api/events) to store per-question interactions.
- Login and signup UI scaffolded for future wiring (not yet functional).

**Follow-up (28 Jul 2026, commit b569cc5): authentication wired.** Under the scaffolded UI, `events.student_id` was always null, which ruled out per-student analysis (learning curves, cross-session comparison, any link to roster or demographic data) and was the top-ranked gap in the data-layer review. Real email+password authentication now closes it: every event carries the student's id.

Built with no new dependencies: `node:crypto` scrypt for password hashing (per-password salt, stored as `salt:hash` in hex, verified with `timingSafeEqual`), and a stateless HMAC-SHA256 signed session cookie (httpOnly, sameSite lax, secure in production, 30 days; `SESSION_SECRET` is required server-side with no fallback). `package.json` is unchanged. A root-level `proxy.ts` (Next 16's successor to `middleware.ts`) gates `/quiz`, `/game-setup`, and `/results`.

New table `students`, keyed by an opaque id rather than the email, so no direct identifier reaches the event log. `events.student_id` is now a nullable foreign key to it, indexed alongside `(session_id, round)`. Migration `db/001_add_students.sql`, establishing the convention `NNN_short_name.sql`, re-runnable.

Two decisions matter more for the research design than the implementation: `student_id` is read from the session cookie inside `/api/events`, never from the request body, because a client-supplied id would be forgeable and would corrupt the dataset undetectably; and signup persists `dob` (age as a future covariate) and records research consent as `consented_at`, enforced server-side rather than trusted from the client.

Six defects were found by review and fixed before commit. The one worth keeping on record: `resetSession()` had no call sites, so on a shared classroom laptop one `session_id` could span two students, with round numbers and the persistence counter bleeding across them. It now runs on login, signup, and logout.

**Follow-up (28 Jul 2026, commit 408bd54): whole app gated, lifetime stats from the database.** `proxy.ts` changed from allow-by-default to deny-by-default. Previously only `/quiz`, `/game-setup`, and `/results` were protected, so `localhost:3000` dropped an unauthenticated visitor straight into the dashboard and the game. Now only `/login`, `/signup`, and the login/signup/logout API routes are public; everything else requires a valid session. Pages redirect to `/login`; API routes return 401. Logout stays public on purpose: gating it means the 401 would fire before the handler runs, so the `Set-Cookie` that clears a stale cookie would never send.

Nothing in the codebase had ever read the `events` table back. The dashboard's lifetime numbers came from `sessionStorage`, which is cleared on logout, so a student who logged out and back in saw zero while their history sat untouched in Neon. A new `GET /api/stats` aggregates lifetime totals for the cookie-identified student, and the dashboard now reads that, including a "sessions played" figure it could not show before. Per-tab session state still drives gameplay, round numbering, and event logging exactly as before, so the research semantics were not disturbed.

A decision worth recording: anonymous pre-login play is deliberately not merged into an account. Those events carry a null `student_id`, and attributing them retroactively would invent data — on a shared device it would credit one student's answers to whoever logged in next.

A data-model correction came out of this work: `events.round` is 1-based as written and restarts at 1 in every session, so any lifetime round count must aggregate on `(session_id, round)`, not on row count. An earlier note describing it as 0-based was wrong. This was checked against live rows, not assumed.

Eight defects were found and fixed across two review rounds before commit.

**Status, stated plainly:** the application has now run end to end against a live Neon database for the first time — schema applied (3 tables, foreign key in place), real accounts created, real gameplay recorded. All three of 28 Jul's commits (e0b3fd9, b569cc5, 408bd54) are pushed to `origin/main`. There is still no automated test of any kind; correctness so far rests on manual review and this one live run.

## 3a. Question-generation pipeline: design decisions (28-29 Jul 2026, not yet built)

The pipeline itself does not exist yet. `scripts/inspect-source.mjs` (committed in `fa38a2a`/`a75a79c`; superseded `scripts/inspect-pdf.mjs`, which was deleted as dead on 29 Jul, commit `08df8b1`) is the first piece of it. Everything below is a design decision taken during the 28-29 Jul 2026 planning work, recorded before any of the rest is built.

**The direction decision.** Sumeet proposed building the pipeline first against a Grade 11 mathematics textbook, on the reasoning that maths is the hardest case and everything else becomes easy by comparison. On examination this holds for *infrastructure* only: notation-capable storage, a renderer, and multimodal ingestion are strict supersets of what plain prose needs. It does not hold for the AI layer: maths questions test procedure, management questions test understanding, so the generation prompt, the difficulty rubric, and the validation approach do not transfer from one domain to the other. Maths-first risked roughly 60-100 hours on a capability the pilot may never need, against a total budget of ~400-450 hours and a mid-September pilot. **Decision: build against clean text documents first; treat mathematics as a later generalisation proof**, run once the pilot path already works. That ordering is also the stronger research claim — demonstrated generalisation across subject domains, rather than an untested design goal carried into the pilot.

**The constraint behind the decision.** Prof. Singh writes his lecture material only days before term begins, and has told Sumeet to use any document to build the pipeline against. The real requirement this creates is not "handle mathematics" but "ingest an unfamiliar document within days, unattended." Automation, idempotency, and robustness to malformed input matter more than notation support.

**Architecture decisions:**

- **LibreOffice is the single rendering backend** for PDF, DOCX, and PPTX (`soffice --headless --convert-to pdf`), chosen over an npm ZIP/OOXML library. It is a system dependency, installed on the machine rather than a package; `package.json` is unaffected.
  - _Rationale corrected 29 Jul 2026:_ the original reasoning (LibreOffice "also produces the page/slide images needed for the multimodal read") was tested and is wrong. `soffice --headless --convert-to png` on a 26-slide PPTX produced exactly 1 PNG, the first slide only — it does not do per-slide image export. The actual reason one tool suffices: `--convert-to pdf` does work correctly (26 slides → 26 PDF pages, confirmed by page count), and the Gemini API reads PDFs with native vision — it extracts embedded text and processes rendered images of each page for documents up to ~1000 pages, and does not charge for tokens from natively embedded text (https://ai.google.dev/gemini-api/docs/document-processing). So the PDF LibreOffice already produces is the finished input to the model; no separate PNG extraction step or second tool (e.g. Poppler) is needed.
  - _Refined 29 Jul 2026, verified by running it:_ the PPTX → PDF export must pass explicit FilterData JSON options on the command line, since LibreOffice's GUI export dialog never appears in an automated run and defaults apply silently. Confirmed on `Pitch_Session 12.pptx`: exit 0, 26 slides → 26 pages, 2.76 MB. Non-obvious values: `ExportNotesPages` false (true appends a notes page per slide, 26→52, breaking the slide N = page N mapping question attribution depends on — notes are already read natively via `resolveNotesEntry()` in `scripts/inspect-source.mjs`); `UseLosslessCompression` true (decks carry wording baked into images and JPEG artefacts land on the letters; Gemini bills per page not per byte and rasterises each page regardless, so the only cost is file size — 1.17 MB default vs 2.76 MB lossless, same token cost); `UseTaggedPDF` true (preserves structure for the text half of Gemini's dual read); `EncryptFile` false (an encrypted PDF reports UNUSABLE in `inspect-source.mjs`).
    - **Hazard for the pipeline build:** "Export hidden pages" is off by default, correctly — hidden slides were hidden deliberately — but that means a deck with hidden slides renders fewer PDF pages than it has slides, shifting every subsequent slide's page number and silently misattributing questions. The pipeline must assert PDF page count equals PPTX slide count before generating anything; both counts already come from `scripts/inspect-source.mjs`.
    - `soffice --version` hangs / returns no output on this Windows install; test LibreOffice availability with an actual `--convert-to` run, not `--version`.
- **Two ingestion channels per document.** Structure and text come from the native format (Word heading levels, PowerPoint speaker notes); the visual read comes from the rendered version. Converting everything to PDF first was rejected because it would destroy the heading hierarchy that makes DOCX the easiest format to ingest.
- **A normalized `ContentUnit`** is the interface between format adapters and the rest of the pipeline: `{source_doc, unit_kind: slide|section|page, unit_ref, title, text, notes, image_path?}`. Everything downstream of this is format-agnostic, so adding a new source type later is one adapter, not a pipeline change.
- **Chunking is format-dependent.** A slide is already a chunk, so PPTX needs no chunking strategy. DOCX chunks on headings. Only PDF needs an inferred chunk boundary, because PDF carries no reliable structure of its own.
- **PDF is treated as a container, not a format** — it can be a clean export, a scan, or a scan with broken OCR underneath. `scripts/inspect-source.mjs` is a **permanent mandatory gate** in the pipeline for this reason, not a one-off troubleshooting script. Built 29 Jul 2026, commit `a75a79c`: it routes rather than rejects, returning one of three verdicts — TEXT PATH, IMAGE PATH, UNUSABLE — with exit codes 0 (routable, either path), 2 (unusable), 1 (operational failure, e.g. bad args or unreadable file). A PDF with a garbled OCR text layer routes to IMAGE PATH because the page images underneath are intact, so it is still usable, just via the other route.
- **Generate only self-contained questions.** The model reads charts and diagrams in the source material to write questions, but a question must not require the student to see the image to answer it. This captures the pedagogical value of B-school visuals while keeping every question plain text — no asset storage, no image rendering in the quiz UI. Chart-reading questions that do require the image remain a later, additive feature via an `asset_path` column.
- **Add a `format` column to `questions`** (`plain` | `latex` | `markdown`, default `plain`) now, before it is needed, so that mathematics support later is an additive change rather than a migration plus a render-path rewrite.

**Source-material findings.** A 728-page mathematics textbook (140 MB) was tested against this design and found unusable: it is a scan with a poor OCR layer, dense enough (~2,500 characters per page) that a naive pipeline would report success while producing garbage. The mathematics is destroyed rather than degraded — superscripts lost, set braces randomised, set-membership symbols collapsed to plain letters. It is also a watermarked commercial practice guide rather than the NCERT textbook, which would be a problem for a published paper's methods section. NCERT publishes Class 11 Mathematics free and official at ncert.nic.in, digitally typeset and split per chapter — the correct source if the mathematics generalisation proof is attempted later.

Expected pilot document formats are PPTX mostly, plus DOCX and PDF.

**The image path is mandatory, not a fallback (confirmed 29 Jul 2026).** Sumeet confirmed that `Pitch_Session 12.pptx` — a real MBA lecture deck, 26 slides, ~62 characters of text per slide, 1 genuine speaker note — is representative of how the course material will arrive. Separately, a design-tool-exported deck was found to contain 2 text runs across 16 slides, with all wording baked into images. Text extraction alone cannot carry this pipeline; the image route via LibreOffice-rendered PDF (see the LibreOffice rationale above) is load-bearing for most of the expected material, not a rare-case fallback.

**Gemini free-tier limits, checked live 29 Jul 2026:** Flash-Lite 15 RPM / 1,000 RPD; Flash 10 RPM / 250 RPD; 250k TPM shared across a project. Question generation is a one-off offline batch of roughly 20 decks, so volume is not the binding constraint. Google cut free-tier quotas 50-80% in December 2025 without notice and does not guarantee them, so the existing "develop on free tier, architect for paid Tier 1" rule (§5a) stands. Open question for Prof. Singh: the free tier's training-data clause would apply to his unpublished course material during the offline generation batch, even though no student data ever reaches the LLM (questions are pre-generated before the pilot runs).

**Validation stage added 29 Jul 2026: `scripts/validate-questions.mjs` (commit `10fd55b`).** Generated questions must pass it before any database write. It exists because the first real generation run — one lecture deck through Gemini — produced output that looked good and was not usable as-is: three of fifteen questions cited slide 1, which contains only the deck title, and one asked about Amazon's mission statement, which does not appear in the deck at all — the model supplied its own knowledge and attributed it to the source. Separately, 8 of 15 correct answers sat at index 1 and none at index 3: a student always guessing B scores 53%, which is profitable under +20/−10 scoring while learning nothing, contaminating the measure the study depends on. The correct option was also frequently the longest and most detailed. And several questions referred to "the competitive landscape slide", "the team slide", "the examples provided" — unanswerable for a student who never sees the source.

The script rejects on self-containment, shape (mirroring the `questions` table), duplicate options, option-length imbalance, and slide provenance. It then shuffles the options and recomputes `answer`, seeded from a hash of the question prompt so the same input always yields the same output and a research run stays reproducible. Exit 0 all passed, 2 some rejected, 1 operational failure.

Two things learned by testing, not assumed: answer-position bias is fixed in code, not by prompting — instructing the model to vary the correct position was tried and not complied with reliably. And self-containment matching must be word-boundary, not substring — a `"the slide"` substring check misses `"the competitive landscape slide"`, which was the actual failing sentence, and words with innocent business meanings (`figure` as a number, `image` as in brand image) need qualifying, since bare matching rejected a valid question.

The `slide` field on each generated question is permanent, not a test artefact — it is how fabrication is detected, and it caught three cases on the first run.

**Pipeline shape as it stands:** source document → `inspect-source.mjs` routes it → LibreOffice renders to PDF if it is on the image path → Gemini generates questions → `validate-questions.mjs` rejects and repairs → database.

One aside from this session: the AI Studio playground demanded a paid API key, but a `GEMINI_API_KEY` already exists in `.env.local`. That was a playground gate, not an account restriction — the API path is not blocked.

**`/simplify` pass, 29 Jul 2026 (commits `08df8b1`, `7895e69`, `404f2cb`).** A whole-codebase quality pass removed 673 lines and added 102, roughly 16% of the codebase, with no capability lost.

The OCR heuristics in `scripts/inspect-source.mjs` were deleted, not tuned (`7895e69`). Four regexes had detected "OCR tells" to distinguish a clean text layer from a garbled scan. Two problems, both verified by running them: they misfire on the pilot's own subject matter — a real, clean, digitally-typeset business PDF tripped 2 of 4 tells, enough to meet the threshold, on the strings `IndianOil` (reads as run-together words) and `D2C` (reads as a digit fused into a word); `PowerPoint` and `B2B` do the same. A clean Digital Transformation PDF was being classified as a broken scan. And they never changed a routing outcome: low-quality text and sparse text both route to the image path, so the discrimination between them decided nothing. `spaceRatio < 0.12` and the caret/superscript check survive — both are honest signals, and the scanned maths book still routes to the image path through the caret check. `scripts/inspect-source.mjs` went from 750 to 560 lines. The maths-notation panel (printed, never read, a deferred feature) and the DOCX heading-walk and section table (fed a report that drove no decision) were also removed.

Five files were deleted as dead (`08df8b1`): `scripts/inspect-pdf.mjs` (superseded by its own behaviour-preserving superset, `scripts/inspect-source.mjs`), `GIT_SETUP.sh` (one-time bootstrap, already ran), `components.json` and `lib/utils.ts` (shadcn scaffolding — no `components/` directory, no caller of `cn()`), and `supabase/migrations/0001_events.sql`, which matters most: it defined a second, conflicting `events` table from the design the project pivoted away from on 27 Jul, with `not null` columns that would collide with the real one. Nothing in the repo referenced Supabase.

Consequence left in place rather than fixed unilaterally: `clsx` and `tailwind-merge` are now unused in `package.json`.

**Generation-path gap this exposed:** `scripts/generate-questions.mjs:79-81` has its own weaker inline validity check that clamps rather than rejects — `Number(q.answer) || 0` turns a null or NaN answer into index 0 and upserts it. When the generator is wired end to end, its output must pass through `scripts/validate-questions.mjs` instead.

**Same pass, research-dataset fix (`404f2cb`).** `round_stop` was emitted with two different shapes: `app/results/page.tsx` omitted `game_type` and re-derived the round number from session state, while `app/quiz/page.tsx` used its own. Each was correct at its own call site, and they agreed numerically only because of commit timing between the two screens — undocumented and fragile. Analysing the event required knowing which screen the student quit from, which was never recorded. The round number is now stamped onto `RoundSummary` when the round is committed, and both screens read it.

Remaining known issue, not fixed: an abandoned round reuses a round number. Quitting mid-quiz never increments `session.roundsPlayed`, so two distinct real attempts can share a `round` value in the event log.

## 4. The agreed product (from the 21 Jul call) — SUPERSEDED

⚠️ **SUPERSEDED by §3 (27 Jul pivot).** The design below is the original vision from the 21 Jul call. It is now parked. Refer to §3 for the current product definition.

**One-liner:** A gamified learning platform where an AI layer designs the gamification itself (quests, badges, point values) individually per student from their performance history, with a human-in-the-loop teacher approval layer.

Core mechanics agreed:

- **Anti-comfort-zone point economy:** points diminish for practicing areas the student is already strong in, and weak areas get more quests and higher rewards. This is the central design thesis, as opposed to traditional fixed, equal-weight gamification.
- **Two phases per student:** Phase 1 is an identical baseline for everyone (for example, the first N tasks). From Phase 2 onward, tasks and quests are AI-designed per individual.
- **Human-in-the-loop (HITL):** the AI proposes each quest with its reasoning, and the teacher approves, edits, or rejects it before delivery. The prof was most energized by this layer.
- **Teacher/admin dashboard:** a 360-degree view of each student (history, achievements, the AI's inferred strengths and weaknesses, and pending AI proposals), where the teacher can chat with the AI to redesign a quest.
- **Pilot use case:** his Digital Transformation course (about 20 sessions). The AI generates MCQs per session. Phase 1 is the same for all; later phases adapt. The system also doubles as a dynamic survey and data-collection instrument (satisfaction plus engagement), and that dataset is the raw material for the optional case-study paper.
- **Knowledge layer:** the book *Gamification for Dummies* (the prof will forward the PDF if it isn't findable online) plus his course content. This grounds what the AI knows about gamification design.

## 5. Tech stack (prof's suggestions 21 Jul plus decisions ratified 22 Jul; updated 28 Jul post-rebuild)

**What the prof suggested on the call:** a Firebase backend, Vercel hosting ⚠️ *(garbled in transcript, best-guess reconstruction, confirm)*, Google AI Studio (Gemini) free tier, and "free tier only until something works." Model choice was delegated to Sumeet with a mandatory "why this and not that" justification. ⚠️ Sumeet mentioned a Chinese model good for development, but the name didn't transcribe (likely DeepSeek or Qwen).

**Decisions after 22 Jul analysis (the deviations are deliberate and must be pitched to the prof as reliability plus student-data privacy, not as overruling him):**

### 5a. Runtime stack (what the deployed app uses)

- **LLM: Gemini paid Tier 1, NOT free tier.** As of mid-2026, the free tier is Flash/Flash-Lite only, roughly 5 to 15 RPM and about 1,000 to 1,500 RPD, and free-tier prompts may be used for Google training, which is unacceptable for classroom student data and guaranteed to collapse under simultaneous classroom load. Tier 1 is pay-per-use only (no upfront), about 150 to 300 RPM, with no training-data clause. Estimated pilot cost is $2 to 10/month (unverified, check live pricing). Pitch to the prof: "About ₹500-800 total buys production rate limits and keeps student data out of training pipelines."
- **Architecture rule, design out the rate limits:** MCQs are pre-generated from session PDFs and served from the database; no live LLM calls on the critical path. Every LLM call gets a queue, exponential backoff, and a response cache.
- **Provider abstraction:** all LLM calls go through a thin adapter (Vercel AI SDK style) so switching provider is a config change. The fallback chain is Gemini paid, then a retry, then an alternate provider. Data-governance rule: student-derived data must never fail over to Chinese-hosted endpoints (an IRB/consent risk). Open-model fallback only via US/EU-hosted providers (for example, OpenRouter pinned) or restricted to non-student-data calls (MCQ drafting from course material is fine; profiling a named student is not).
- **Database: Neon serverless Postgres (as of 28 Jul rebuild).** Event logs (session, round, per-question interactions, score, adaptivity feedback) are queryable in SQL and directly serve the DSR dataset. Schema in `db/schema.sql`. Previously planned Supabase; switched to Neon for simpler provisioning. Either would serve the deployment.
- **Front-end: Next.js 16 / React 19 / Tailwind v4** (v0 scaffolding, rebuilt 28 Jul). Router-based screens (dashboard, game-setup, quiz, results) use React Context (sessionStorage-backed) for game state persistence across nav.
- **Auth (added 28 Jul 2026, commit b569cc5; gate widened and lifetime stats added same day, commit 408bd54):** email+password login/signup, no new dependencies — `node:crypto` scrypt for password hashing and a stateless HMAC-SHA256 signed session cookie. New `students` table (opaque primary key, not the email) so `events.student_id` is populated from the session instead of always null. `proxy.ts` now denies by default: only `/login`, `/signup`, and the login/signup/logout API routes are public, everything else requires a valid session, pages redirect and API routes return 401. `GET /api/stats` aggregates lifetime totals (score, accuracy, sessions played) from `events` for the dashboard, counting rounds on distinct `(session_id, round)` pairs since round numbering restarts at 1 every session. Exercised end to end against a live Neon database.
- **Hosting: Vercel Hobby tier.** Fine for an academic pilot; no change.

### 5b. Dev tooling (what Sumeet codes with), decided via structured comparison 22 Jul

| Role | Tool | Notes |
|---|---|---|
| Primary builder (backend, AI layer, glue) | **Claude Code** (existing Claude Pro sub) | $0 marginal; this repo's CLAUDE.md targets it |
| Frontend scaffolding | **v0 free tier** | React/Tailwind UI generation, native Vercel deploy; generate dashboard/leaderboard/approval screens, then hand to Claude Code to wire up |
| Overflow agent + Gemini prompt debugging | **Antigravity** (free, Google) | Backup when Claude Code quota exhausts; same model family as runtime |
| Code review, 2nd opinion | **DeepSeek V4 (Flash routine / Pro hard bugs) via OpenRouter**; Qwen 3.6 free preview as $0 fallback | One OpenRouter key means model-switching freedom; ~$2-5/mo estimated |
| Code review, 3rd opinion (sparingly) | **Codex via existing API credits**, a mini-tier model, diffs only (`git diff \| codex exec "review"`), hard budget cap $10/mo | API-key auth bills every token with no subscription buffer; never use as builder, only as a bounded reviewer |
| **Cut** | Cursor (redundant $20/mo vs Claude Code), Emergent (demo-grade free tier, fights the fixed stack) | |

Weekly ritual: before each prof meeting, run the week's diff through DeepSeek (occasionally Codex-mini) for adversarial review; Claude Code triages the comments. This doubles as firsthand evidence for the "why this model and not that" justification doc.

⚠️ The model-landscape facts above (rankings, prices, quotas) date from web sources of Apr to Jul 2026 and change weekly, so re-verify against live pricing pages before writing them into any deliverable. The prof himself said whatever is current will be weeks old soon.

## 6. Working relationship and cadence

- **Next meeting: Monday 3 Aug 2026, afternoon.** ⚠️ **Corrected 30 Jul 2026 — see §12.** A re-read of
  the transcript found he is travelling Monday and proposed Tuesday same time instead: likely
  **Tue 4 Aug 2026**, treat as needing confirmation. Recurring weekly Mon/Tue slots.
- The prof is reachable by phone up to about 8 pm and on WhatsApp anytime for small things; he also said planning independently is "even better."
- **27 Jul meeting (completed):** Delivered architecture doc + model comparison. The prof pivoted the project (see §3).
- **Expectation for 3 Aug:** Implementation progress on the rebuild (§3), any blockers, next sprint plan.

## 7. Roadmap (proposed in-chat on 22 Jul; SUPERSEDED by 27 Jul pivot)

⚠️ **The roadmap below predates the 27 Jul pivot and is now moot.** It planned an AI-quest design architecture with HITL approval. The rebuild (28 Jul) implements the new adaptive-learning dashboard (§3) with a tighter, pre-coded mechanic. The new roadmap is TBD at the 3 Aug meeting.

| Weeks | Focus |
|---|---|
| **1** | Architecture doc + model comparison (the 27 Jul deliverable; see §7) |
| 2-3 | Knowledge layer (ingest *Gamification for Dummies* into a RAG/KB) + Phase-1 static skeleton: auth, one module, fixed quiz, hardcoded points/badges/leaderboard. No AI yet; prove the game loop |
| 4-5 | AI personalization layer: student-profile schema, a prompt pipeline emitting structured quest designs (JSON: quest, difficulty, point value, reasoning), and diminishing-returns point logic |
| 6-7 | HITL admin dashboard: student list, profile, AI proposals with reasoning, approve/reject/edit, chat-to-redesign |
| 8 | Content pipeline: MCQ generation per Digital Transformation session plus an instructor review queue |
| 9-10 | Pilot prep: seed data, dry run with classmates, and engagement/satisfaction logging built in now (the paper dataset) |
| Sept+ | Classroom pilot aligned with his gamification course; iterate; optional case-study write-up |

## 8. Week-1 deliverable (completed Mon 27 Jul; now superseded)

A 3-to-5 page/slide document containing:

1. A **layered architecture diagram** with labeled data flows: Frontend (Vercel), Firebase, the AI layer (quest designer, MCQ generator, student profiler), the knowledge layer, and the Admin/HITL layer.
2. A **model comparison table plus pick plus rationale:** 3 to 4 candidates (Gemini via AI Studio free tier; DeepSeek/Qwen; Claude/GPT) scored on free-tier limits, structured-output reliability, reasoning quality for quest design, latency, and cost at pilot scale. Verify current free-tier quotas; they change frequently.
3. A **data model draft:** student profile, skill/topic taxonomy, quest object, point-transaction log, and approval-workflow states.
4. A **Phase-1 vs Phase-2 definition** plus the switching trigger.
5. **2 to 3 open questions for the prof** (for example, skill-taxonomy granularity for his course, and whether approval blocks delivery or runs async).

Also this week: obtain *Gamification for Dummies* (nudge the prof by **Wed 23 Jul** if not found); skim the project PDFs for the standard gamification element taxonomy.

## 9. Theory and literature context (for the eventual paper)

- **Novelty claim (verified by live search, ~5 searches, not a systematic review):** LLM-as-orchestrator/designer of gamification mechanics per user, with HITL, is an open corner. LLM-as-content-generator and static-typology tailoring (Hexad, etc.) are crowded. A proper Scopus/WoS pass is still owed before claiming the gap in writing.
- **Prof's papers on hand (project PDFs):** Singh & Dev 2023 AJIS (ICT interventions, relatedness, engagement; moderated mediation non-significant; intellectual engagement null); Singh & Verma 2020 ACIS (gamification taxonomy/theory); Singh & Singh 2021 ACIS (gamification in hybrid teacher PD, SDT plus goal theories); the MCDM chatbot-ranking paper (Delphi + CRITIC + WASPAS/EDAS); the mandatory-telework paper; Klock et al. 2020 IJHCS (tailored gamification); Alioto & Persico (corporate training gamification). Note: several PDFs are scanned/image-based, so text was extracted via OCR; verify any quoted passage against the source.
- **Likely paper framing:** a Design Science Research case study (artifact plus classroom deployment plus engagement/satisfaction data). Ethics topics to raise before the pilot: consent/voluntariness for interaction telemetry, the IRB/institutional review timeline, and scale reuse from the AJIS paper.

## 10. Open items and risks (updated 29 Jul)

- [x] **Resolved 31 Jul 2026 (package G1, §15):** the question-generation pipeline is built. `scripts/generate-questions.mjs` writes `content_items` rows plus `source_excerpt`, currently running on OpenAI (Gemini credits depleted, §15). LibreOffice, listed here as a prerequisite on 29 Jul, was removed from the pipeline entirely on 30 Jul (§12).
- [ ] `db/002_add_question_format.sql` is written but **not applied** to Neon — `psql` is not installed on this machine, so it must be pasted into the Neon web SQL editor by hand.
- [ ] `db/001_add_students.sql` (~line 60) has an unscoped `pg_constraint` existence guard: it matches by `conname` alone, which Postgres only guarantees unique per table, not database-wide. Deliberately left as is since it is already applied to the live database; would only bite in a fresh environment.
- [x] **Resolved 28 Jul 2026 (commit b569cc5):** anonymous event log. `events.student_id` was always null under the mockup login/signup UI, which made per-student analysis impossible. Real authentication now populates it from the session cookie.
- [x] **Resolved 28 Jul 2026 (commit 408bd54):** the dashboard itself was unauthenticated. `proxy.ts` only gated `/quiz`, `/game-setup`, and `/results`, so an unauthenticated visitor landed on the dashboard and could reach the game. Now deny-by-default, and both fixes have been exercised end to end against a live Neon database: schema applied, real accounts created, real gameplay recorded.
- [ ] New residual risk: shared devices. A student who does not log out on a shared classroom laptop leaves the session live for whoever uses it next; nothing currently forces logout.
- [ ] New residual risk: the signup form has a cosmetic terms-of-service checkbox sitting next to the real, server-enforced research-consent checkbox. The two could be confused; needs a UI fix before the pilot.
- [ ] Model-assigned difficulty is uncalibrated, and the adaptive-difficulty lever depends on it entirely. If an item labelled difficulty 4 is not actually harder than one labelled 2, the study's primary independent variable is noise. Needs each item's empirical p-value from `events` compared against its assigned label, ideally via a small pilot-of-the-pilot before the real cohort, since recalibrating mid-pilot would change what the difficulty scale means partway through the dataset.
- [x] **Superseded 31 Jul 2026 (§15):** the ceiling-saturation item below was resolved not by carrying difficulty across rounds but by requiring two consecutive same-direction answers before the ramp moves at all, which damps the run to the ceiling. The per-round reset itself is now a recorded deliberate choice, not a defect awaiting a fix — carrying difficulty across rounds would conflate performance across six different games into one global student level. Original wording, kept for the record: "Adaptive difficulty saturates at the ceiling by roughly question four (starts at 2, caps at 5, resets every round), so a strong student stops being differentiated by the lever for most of a round."
- [ ] Confirm hosting is Vercel and identify the "Chinese model" (the transcript garbled both).
- [ ] Get the *Gamification for Dummies* PDF.
- [ ] Pitch Gemini paid Tier 1 to the prof (privacy plus reliability framing, about ₹500-800/pilot); verify live Tier 1 pricing and rate limits first.
- [ ] Decide Supabase vs Firebase within week 1 (before the data model is coded); default lean is Supabase.
- [ ] Set the Codex hard budget cap ($10/mo) in the OpenAI dashboard and create the OpenRouter key.
- [ ] Skill-taxonomy granularity for the Digital Transformation course; ask the prof.
- [ ] Ethics/IRB requirement and timeline for classroom data collection; ask the prof before the pilot, not after.
- [ ] Scope-creep risk: build one artifact (platform plus AI designer plus HITL) and resist adding orchestration extras. The hour budget is ~400-450 total.
- [ ] The Scopus/WoS systematic search is still pending if the paper goes ahead.

## 11. File inventory (as of 29 Jul 2026; `git ls-files` reconciled; additions from 30-31 Jul noted inline, not fully reconciled)

**Orchestration (tracked as of df8fe57):**
- `.claude/agents/` — scout, builder, reviewer, codex-review, gemini-bulk, db-engineer, scribe, researcher.
- `.claude/commands/checkpoint.md`, `.claude/commands/resume.md` — session lifecycle commands. Other `.claude/` contents (personal settings, third-party skills) stay untracked.

**Architecture and docs:**
- `CLAUDE.md` — working brief (updated 28 Jul).
- `HANDOFF.md` — this file.
- `docs/architecture/2026-07-27_architecture-and-model-comparison.md` — pre-pivot deliverable (27 Jul); superseded by the post-pivot notes below.
- `docs/architecture/2026-07-28_architecture-as-built.md` — post-pivot architecture, written after the rebuild.
- `docs/architecture/data-layer.md` — event-log and schema design notes (data-layer review that flagged the null `student_id` gap, since resolved by b569cc5; corrected 408bd54 to state `events.round` is 1-based, not 0-based).
- `docs/architecture/roadmap-and-flow.md` — pre-pivot; superseded.
- `docs/architecture/agent-orchestration.md` — orchestration rules (28 Jul).
- `docs/design/v0-dashboard-brief.md` — v0 scaffolding brief.
- `docs/design/user-journey.md` — user-journey notes.
- `docs/meeting/Jul 27 at 3-39 PM.m4a` — supervisor call audio (27 Jul pivot).
- `docs/meeting/Jul 27 at 3-39 PM.txt` — call transcript.
- `docs/meeting/2026-07-27_supervisor-briefing.md` — pre-pivot briefing.
- `docs/CURRENT_STATE.md` — written by `/checkpoint`; hand-maintained, not edited by scribe passes.
- `docs/PROJECT_MAP.md` — new 30 Jul 2026, the project spine (decomposition, work packages, decided vs
  assumed); replaces the since-deleted `docs/PROJECT_BACKLOG.md`.
- `docs/architecture/generator-spec.md` — new 30 Jul 2026, per-window generator spec; also carries the
  LibreOffice-removal rationale.
- `docs/consult-brief.md` — new 30 Jul 2026, standing context handed to `sol-consult`; contains no
  solutions by design.
- `docs/consults/2026-07-30-content-layer-and-difficulty.md` — new 30 Jul 2026, full `sol-consult`
  transcript (see §12).
- `.claude/agents/sol-consult.md` — new 30 Jul 2026, the two-pass GPT-5.6 Sol consultation agent.
- `tests/lever.test.ts` — new 30 Jul 2026, the project's first automated tests (§12).
- `tests/quintile-difficulty.test.ts`, `tests/registry.test.ts` — new 31 Jul 2026 (§15), part of the
  10 → 18 test count. Cover tie-binning monotonicity and `GAME_REGISTRY` shape/lever invariants.
- `docs/experiments/2026-07-31_grounded-difficulty-simulation.md` — new 31 Jul 2026, the grounded vs
  ungrounded simulation run; five results as of §14, extended same day with Result 7 (replication on
  `gpt-3.5-turbo-0125` and `gemma2:9b`) and the abandoned Gemini Flash-Lite attempt (§15).

**Application code (Next 16 / React 19 / Tailwind v4):**
- `app/page.tsx` — no longer the dashboard as of 31 Jul 2026 (package D1); redirects to `/dashboard`
  so there is one implementation, not two.
- `app/dashboard/page.tsx` — new 31 Jul 2026 (package D1), the real dashboard: renders one tile per
  `GAME_REGISTRY` entry, closing the gap §12 flagged as the professor's first instruction.
- `app/game-setup/page.tsx` — quest selection and adaptivity-lever picker.
- `app/quiz/page.tsx` — main game loop (questions, scoring, adaptivity feedback).
- `app/results/page.tsx` — round results and persistence prompt.
- `app/login/page.tsx`, `app/signup/page.tsx` — auth UI, wired to real endpoints as of b569cc5 (previously scaffolded only).
- `app/api/auth/login/route.ts`, `app/api/auth/signup/route.ts`, `app/api/auth/logout/route.ts`, `app/api/auth/me/route.ts` — auth endpoints (added 28 Jul, commit b569cc5).
- `app/api/events/route.ts` — event logging API; `student_id` now read from the session cookie, not the request body.
- `app/api/questions/route.ts` — MCQ serving API (DB pool + seed-bank fallback).
- `app/api/answer/route.ts` — new 31 Jul 2026 (package Q1), the server-side scoring route. Looks the
  answer up from `content_items` (falling back to the seed bank), is the only writer of
  `question_answered`, and returns `correctIndex` only on the commit that scores an item, never on a
  repeat (§15).
- `app/api/stats/route.ts` — new (commit 408bd54); aggregates lifetime totals (score, accuracy, sessions played) from `events` for the cookie-identified student.
- `app/layout.tsx`, `app/globals.css` — layout and base styles.
- `proxy.ts` — Next 16's successor to `middleware.ts`; deny-by-default as of commit 408bd54 — only `/login`, `/signup`, and the login/signup/logout API routes are public, everything else requires a valid session. Previously only gated `/quiz`, `/game-setup`, `/results` (added b569cc5).

**Game engine, state, and auth:**
- `lib/game/engine.ts` — core game logic (scoring, adaptivity ramp/clock, round progression). Gained
  `LeverState`, `initialLeverState`, `resolveLever`, `advanceLeverState` 30 Jul 2026 (package K-4,
  additive, ~36 lines; see §12) — the structural fix so games never branch on `config.lever`.
- `lib/game/game-context.tsx` — React Context for game state (survives route nav via sessionStorage).
- `lib/game/questions.ts` — question data fetch and normalization.
- `lib/games/registry.ts` — new 31 Jul 2026 (package K-2/D1), `GAME_REGISTRY`: the single source of
  truth for what games exist and how each scores, read by both the dashboard (tiles) and the scorer
  (`app/api/answer/route.ts`). Deliberately a distinct `lib/games/` (plural) from `lib/game/` (singular)
  — see the comment in the file for why the two are not merged.
- `lib/log/logEvent.ts` — event logging to `/api/events` (or console if DB unavailable).
- `lib/db/client.ts` — Neon Postgres client.
- `lib/auth/password.ts` — scrypt hashing and `timingSafeEqual` verification (added b569cc5).
- `lib/auth/session.ts` — HMAC-SHA256 signed session cookie, `resetSession()` (added b569cc5).
- `lib/auth/current-student.ts` — reads the authenticated student id from the session cookie server-side (added b569cc5).
- `lib/utils.ts` — utility functions.

**Database and config:**
- `db/schema.sql` — Neon Postgres schema (questions, events tables).
- `db/001_add_students.sql` — adds the `students` table and the `events.student_id` FK; establishes the `NNN_short_name.sql` migration convention (added b569cc5). Applied to the live Neon database as of the 408bd54 end-to-end run — 3 tables, foreign key `events_student_id_fkey` present.
- `db/005_add_simulated_difficulty.sql`, `db/006_add_content_item_difficulty.sql` — new 31 Jul 2026,
  add `simulated_p`, `simulated_n`, `simulator_model`, `source_excerpt` and the binned 1-5 difficulty
  column to `content_items`. Applied and verified live on Neon project `ancient-brook-62806105` (§15).
- `.env.local.example` — environment variable template (Neon credentials, Gemini key, `SESSION_SECRET`); restored in b569cc5 after being lost in a move rather than a copy.
- `.gitignore` — new (commit 408bd54); tracked so a stray Windows reserved-device-name file (`nul`/`NUL`, produced by a `> nul` redirect in Git Bash) stays out of the index.
- `skills-lock.json` — new (commit 408bd54); lockfile pinning the `neon` and `neon-postgres` agent skills (source `neondatabase/agent-skills`) used during the Neon setup and end-to-end run.
- `package.json`, `package-lock.json` — Next 16 / React 19 / Tailwind v4 dependencies; unchanged by the auth or gating work (no new dependencies). `clsx` and `tailwind-merge` are unused as of the 29 Jul `/simplify` pass, left in place rather than removed unilaterally. Gained a `"test": "node --test tests/*.test.ts"` script 30 Jul 2026 — no new dependency, Node's native test runner.
- `tsconfig.json`, `next.config.mjs`, `postcss.config.mjs` — build config. `tsconfig.json` gained `allowImportingTsExtensions: true` 30 Jul 2026 so `next build` does not fail on `tests/` (its glob includes `**/*.ts`).
- `README.md` — project readme.

**Content generation:**
- `scripts/generate-questions.mjs` — MCQ generator from course PDFs (reads `COURSE_PDFS` env, writes
  `content_items` plus `source_excerpt` as of package G1, 31 Jul 2026). Runs on **OpenAI** as of 31 Jul
  2026 (`--provider openai`, default `gpt-4.1-mini`) since Gemini prepayment credits are depleted (§15);
  provider is selected through `scripts/lib/llm-client.mjs`. Its old inline validity check (lines 79-81)
  clamping rather than rejecting a bad answer index, noted in §3a, is superseded by G1's own validation.
- `scripts/lib/llm-client.mjs` — new (date not recorded precisely; in place by 31 Jul), the
  provider-agnostic adapter — Gemini/OpenAI selectable via `--provider`, the mechanism that made the
  31 Jul provider switch a flag change rather than a rewrite (§15).
- `scripts/lib/quintile-difficulty.mjs` — new 31 Jul 2026, bins continuous `simulated_p` into the
  existing 1-5 column by quintiles, ties sharing a band; covered by `tests/quintile-difficulty.test.ts`.
- `scripts/generate-terms.mjs`, `scripts/lib/terms-validate.mjs` — new 1 Aug 2026 (package G2),
  extract `term_definition` primitives into `content_items`; unblocks match-the-following,
  fill-in-the-blanks, choose-the-right-word, and Wordle (§16). The clue-leak validator was fixed this
  session — see §16 for the multi-word rule.
- `scripts/inspect-source.mjs` — the permanent mandatory routing gate for the pipeline (commit `a75a79c`; OCR heuristics removed 29 Jul, commit `7895e69`, see §3a). Design decisions for the rest of the pipeline are in §3a.
- `scripts/validate-questions.mjs` — rejects generated questions that break pipeline rules (commit `10fd55b`); see §3a.
- `scripts/extract-slide-text.mjs` — new 31 Jul 2026, recovers text from image-only slides via Gemini
  vision on the PDF; uncommitted (§14).
- `scripts/spike-simulate-difficulty.mjs` — the difficulty-simulation spike script; gained `--source`,
  `--retention`, `--out`, `--label`, per-tier breakdown, and (later the same day) `options.seed` keyed
  on item id for run-to-run reproducibility (§14, §15); uncommitted.
- `scripts/spike-compare-arms.mjs` — new 31 Jul 2026, Spearman agreement / ability slope / ceiling-floor
  comparison across simulation arms; uncommitted (§14).

**Literature (refs for the paper):**
- `docs/literature/` — 16 research PDFs and a README index (Gamification for Dummies-adjacent, SDT, HEXAD, MDA framework, aging/gamification, MBTI/personality, McKinsey job satisfaction, pymetrics, etc.). See `docs/literature/README.md` for full list.

**Call transcripts:**
- `transcript_2026-07-21_prof_call.txt` — 21 Jul supervisor call (problem statement + initial vision).

**Historical (pre-pivot, retained for reference):**
- `docs/venture-analysis/` — Sumeet's earlier venture-analysis scaffolding exercise on the project (7 prompts, pitch deck, 19-22 Jul). Archived for reference; not the current direction.
- Git history up to commit e0b3fd9 preserves the old reward-engine, student-profiler, and Supabase-based code.

## 12. Transcript re-read, project map, first tests, sol-consult (30 Jul 2026)

**Nature of this session: planning and decision-making, not feature building.** The 27 Jul meeting
transcript (`docs/meeting/Jul 27 at 3-39 PM.txt`) was re-read as a primary source, against the standing
rule that summaries are lossy. Five places were found where `CLAUDE.md` had drifted from what the
professor actually said. Three change the build; full detail, quotes, and rationale live in the new
`docs/PROJECT_MAP.md` §0, which is now the project spine for decomposition and work packages. This
section records the outcome, not the derivation — read `docs/PROJECT_MAP.md` for that.

**The five corrections** (all applied to `CLAUDE.md` this session):
1. Points are fixed *within* a game, not flat +20/−10 everywhere. They vary *across* games and
   difficulty — that spread is the "high and low" feeling the professor described, and the old flat
   reading deleted the mechanic he actually asked for.
2. The dashboard is the spine and the quiz is one tile in it. This was his first instruction on the
   27 Jul call and remains the least-built part of the app — there is still no `app/dashboard/`.
3. Course material is not a build prerequisite. He said to use any PDF on any topic; his own content
   blocks the *pilot*, not the *build*.
4. Next meeting is likely **Tue 4 Aug 2026**, not Monday — he said he is travelling Monday. Needs
   confirmation, not yet locked.
5. LibreOffice is out of the ingestion pipeline (see below) — its only job was PPTX→PDF, and
   professors export their own PDFs from PowerPoint.

**Multi-game architecture.** The professor named eight games on the call: crossword, word search,
match-the-following, fill-in-the-blanks, choose-the-right-word, quiz (rapid/normal), and
watch-video/read-article-then-answer. Building seven generation pipelines is not tractable in the
remaining budget; the design instead reduces them to renderers over a small set of content
primitives (`term_definition`, `mcq`, `passage`) so one ingestion pass serves several games. **Pilot
roster, decided 30 Jul: quiz, match-the-following, fill-in-the-blanks, choose-the-right-word,
Wordle.** Crossword and word search are deferred past the pilot — grid layout is the most expensive
remaining work in the project, not a rejection of those games. Full primitive table and generation
notes in `docs/PROJECT_MAP.md` §1.

**Per-game lever semantics and `resolveLever`.** Decided **per-game granularity (option b)**: each
game declares one difficulty knob and one time knob and whether adaptation can fire per-item or only
between boards (e.g. match-the-following adapts per board, quiz per item). The chosen call is to
maximise measurable engagement surface over defending one tidy construct for the paper. The
mutual-exclusion rule ("never both levers") now has a structural fix rather than a convention: package
K-4 added `resolveLever(config, streak) → { difficulty, timeLimit }` to `lib/game/engine.ts`
(`LeverState`, `initialLeverState`, `resolveLever`, `advanceLeverState`, additive, ~36 lines). Games
consume the two resolved values and never branch on `config.lever` themselves, so a both-levers
student collapses from ~25 scattered branches into one tested function — not literally
unrepresentable, since the return type does not forbid both varying, but centralised and covered by
tests (overstatement conceded to `sol-consult`, 30 Jul). Verified the existing quiz already
respected the rule in four places before this landed (`engine.ts:10`; `app/quiz/page.tsx:100,133,112`).
Also decided: **rapid means fewer questions (10 vs 20), not a faster clock** — a tighter clock under
rapid would collide with the difficulty lever for a difficulty-lever student. `roundLength()` already
implements this; confirm the word "rapid" with the professor regardless, since he used it and the
transcript is ambiguous.

**Platform direction: live ingestion, subject-agnostic, PDF input.** The target is not a
Digital-Transformation-only tool — any professor uploads material and gets every game type generated
from it, matching what he described on the call. Ingestion stays live (background job on upload);
generation never runs on the student's critical path, unchanged from the existing rule. **Input is
PDF; LibreOffice is removed from the pipeline** — professors export their own PDFs from PowerPoint, and
its only prior job (PPTX→PDF) is now redundant. Full rationale in `docs/architecture/generator-spec.md`.
This also deletes the page-count-vs-slide-count guard the old pipeline needed. **Multi-tenant schema
now, single-tenant operator surface after the pilot:** a `sources` table and a subject/course id on
`content_items` are built from day one because reversing that later is expensive, but upload UI, job
queue, and faculty login are deliberately deferred — the professor himself deferred courses and
faculty login ("we are not building a portal, it's just for experimentation").

**First automated tests.** `tests/lever.test.ts` is the first automated test this project has had.
`npm test` (added to `package.json`: `node --test tests/*.test.ts`) passes 4/4, covering the two
lever-resolution invariants (20 answers under `adaptive` never move `timeLimit`; 20 answers under
`time` never move `difficulty`). `tsconfig.json` gained `allowImportingTsExtensions: true` so
`next build` does not choke on `tests/`. Deliberately no vitest or jest — Node's native `--test` runner
with TypeScript stripping is enough for a 400ms suite. `node --test tests/` (no glob) fails on this
Node version (24.11.1 resolves `tests/` as a module name); the working form is
`node --test tests/*.test.ts`, already in `package.json`.

**`sol-consult` (new agent) and its three reversals.** A two-pass GPT-5.6 Sol consultation
(blank-slate pass, then critique-our-plan pass, each a fresh `codex exec` session; full text at
`docs/consults/2026-07-30-content-layer-and-difficulty.md`) reversed three design decisions taken
earlier in the same session:
1. **Cognitive level is a generation control, not a difficulty scale.** The plan had proposed a
   five-level taxonomy (recall/apply/discriminate/deduce/transfer) as a difficulty replacement. Sol's
   objection holds: a recall question about an obscure fact can be harder than an "apply" question
   with an obvious answer, so numbering the levels 1–5 and calling that difficulty just renames the
   problem. The surviving half: asking a generator for a named cognitive level is a structural
   instruction it can actually follow, which fixes the real defect (every generated question on 29 Jul
   was recall, so there was no variance to discriminate). Cognitive level and empirical difficulty are
   now two separate columns; difficulty comes from observed facility only.
2. **Calibrate generation recipes, not individual items.** A recipe (knowledge unit × task type × cue
   strength) pools responses across every item sharing it, so an estimate is usable far sooner than
   waiting for per-item data, and a new item inherits its family's prior.
3. **Wordle is an intervention, not a neutral retention instrument.** Daily gating, streak loss, and no
   catch-up are designed to drive return behaviour, so using Wordle's return data as evidence of the
   artifact's persistence claim would measure the mechanic acting on the student rather than the
   student's own behaviour. Wordle stays in scope — it is a genuine daily-engagement signal over four
   weeks that nothing else in the design captures — but its data is now analysed as a **separate
   treatment**, never folded into the primary voluntary-persistence claim (which rests on the
   within-session round loop).

A fourth Sol finding was reviewed and **rejected**: his proposed three-layer knowledge-unit
architecture, in favour of enriching the existing `term_definition` primitive with the missing fields
(blank position and answer variants for fill-in-the-blanks; distractors for choose-the-right-word;
normalised form and length bounds for word search) and dropping `passage`, which no pilot game
consumes. Rejected because it repeats this project's documented failure mode of over-building past
the point of a routing/behaviour change — the same story as the OCR-heuristics removal on 29 Jul. This
decision was interrupted, not completed: the enriched column list still needs to be written into
`docs/PROJECT_MAP.md` §3 under K-1 before `db-engineer` and `builder` can be dispatched.

**Not committed.** Everything in this section exists on disk (`lib/game/engine.ts`, `tests/`,
`package.json`, `tsconfig.json`, `docs/PROJECT_MAP.md`, `docs/consult-brief.md`,
`docs/consults/2026-07-30-content-layer-and-difficulty.md`, `.claude/agents/sol-consult.md`) but is
uncommitted as of this session. Last commit remains `bd123b3`. `docs/PROJECT_BACKLOG.md` was created
and then deleted this session; `docs/PROJECT_MAP.md` replaces it — do not recreate it.

Full open-questions list, the package table for parallel sessions, and the points-table placeholder
values all live in `docs/PROJECT_MAP.md` — not duplicated here to avoid a second copy drifting out of
sync.

## 13. Cold-start item-difficulty calibration (30 Jul 2026, second checkpoint)

**The problem.** §10 already flagged that the model-asserted 1–5 difficulty labels do not discriminate
and the adaptive-difficulty lever depends entirely on them. Classical pre-calibration (test the item on
a cohort first, fit an IRT model) needs a cohort. **There is none** — no pilot-of-the-pilot, no prior
class to draw on. This is a named, active research problem, cold-start item calibration, researched and
written up with citations in `docs/literature/item-difficulty-without-students.md`; full detail there,
not repeated here.

**Two solution families, and why only one is in scope now.**
1. **LLM student simulation (in scope, seeding).** Do not ask a model how hard an item is — prompt it
   to role-play a student at a stated ability tier, have it *attempt* the item, and take the failure
   rate across a spread of ability tiers as the difficulty estimate. Published results correlate
   r = 0.75–0.82 against real IRT difficulty on maths MCQs (631-item NAEP set); our domain is management
   prose, untested, so treat that as an optimistic ceiling. The counterintuitive finding that decided our
   model choice: **weaker models simulate better** — Gemma 9B–27B beat Llama-3.3-70B, which answered 92%
   of items correctly but could not convincingly fail.
2. **Elo rating (deferred, online refinement).** Treat each answer as a student-vs-item match; ratings
   update after every response, so a new item needs no prior difficulty. **Deferred because it needs
   real responses and a server-authoritative answer path, neither of which exists yet** (`/api/questions`
   still ships `answer` for all rows; `/api/events` trusts the client). It is also deferred at the
   *item* level specifically: our expected volume is ~20 responses per item, far short of the 200–500
   Elo needs to converge, so **when Elo lands it will rate recipes (knowledge-unit × task-type ×
   cue-strength), not individual items** — 10–20 recipes each pooling 400–800 responses, inside the
   convergence range. Naive Elo combined with adaptive item selection also has a known failure mode
   (Bolsinova et al. 2026): selection and rating error reinforce each other and variance diverges rather
   than converges. The documented fix, Parallel Elo (two independent rating chains, alternating which
   one updates vs which one is used to select), is noted for when this is built, not built now.

**Both premises above are now stale, corrected 31 Jul 2026 (§15).** The server-authoritative answer
path this paragraph called missing shipped the same day as package Q1 (`app/api/answer/route.ts`).
And "~20 responses per item" assumed a ~20-student cohort; the cohort is actually 60–120 (§15), so the
real volume is 24,000–48,000 responses across the pilot, not ~8,000 — more headroom above the
200–500-response Elo convergence threshold, not less. The deferral decision (rate recipes, not items)
still stands; the arithmetic behind it needs re-running before anyone quotes it.

**Decisions made this session:**
- Difficulty is seeded by LLM student simulation, not asserted by a model.
- Simulation runs on a **small local model via Ollama**, not a hosted one — reproducibility (a hosted
  model can change mid-pilot and silently shift calibration), course material never leaves the machine,
  and weaker models simulate better, so small-and-local is methodologically correct, not a cost
  compromise. `gemma4:31b-cloud` in `ollama list` is a cloud model despite its name and must not be used.
- The continuous simulated score is **binned into the existing 1–5 integer column**, by quintiles over
  the run's observed distribution (not fixed thresholds, which would collapse into one or two bands on
  uniformly easy or hard material). This was chosen over rewriting difficulty as a continuous field
  because ~11 sites already assume difficulty is a small int (`pickQuestion`'s radius algorithm, the
  lever constants, the badge, the tests), and the student-facing display only ever needed five bands.
- The raw score is stored in a new `content_items.simulated_p`, kept strictly separate from
  `empirical_p` (reserved for observed human facility) — simulated must never masquerade as observed.

**Phase 0 spike — read this precisely, the headline is narrower than the pass/fail suggests.**
`scripts/spike-simulate-difficulty.mjs` ran 15 real generated questions through `llama3.2` (~3B, 2 GB)
at n=4 per question, concurrency 4, options shuffled per call so the generator's known index-0 bias
could not inflate the result.

- **It passed its stated kill criterion.** Success rates spread the full range, min 0.00, mean 0.47,
  max 1.00, no clustering — the feared failure mode (every item scoring near-identically) did not
  happen. Zero unparseable replies. 2.1 s per response.
- **It did not validate that the method measures difficulty.** The simulated students never saw the
  source deck, so what actually got measured is *how much a question depends on the source material*.
  Four of fifteen items scored 100%, and all four are answerable from general knowledge with zero deck
  content (pitch deck purpose, Amazon's purpose, price matters to travellers, search→review→book). A
  real student attended the session and has seen the material; the spike's simulated student has not.
- **n=4 allows only five possible per-question values.** Directional only, no claim about magnitude.
- **The grounded method — simulating with the source excerpt supplied, the actual proposal — has not
  been run.** That comparison, grounded vs ungrounded on the same 15 items, is the next step and the
  real validation.
- **Free bonus finding:** the ungrounded run is a good question-quality detector on its own. An item
  answerable at ~100% without the source teaches nothing and rewards general knowledge, the same defect
  class as answer-position bias. It flagged the same 4 of 15 items. Worth adding to
  `scripts/validate-questions.mjs` as a gate, independent of whether the grounded difficulty method pans
  out.

**Consequence: `content_items` needs a new `source_excerpt` column.** Two independent needs converged
on it in the same session: grounded difficulty simulation needs to hand the simulated student the actual
material (with ability tier controlling how well they use it, otherwise the spike's source-dependence
problem repeats); and separately, `sol-consult` (§12) had already flagged that the generator's page-loop
proves which window was *prompted*, not that the answer is *supported* by it, and wanted an evidence
span checked against extracted text. `db/005_add_simulated_difficulty.sql` (not yet written) should
carry `simulated_p`, `simulated_n`, `simulator_model`, and `source_excerpt` together, and the generator
(package G1) must start storing the text it actually used.

**Not committed.** `docs/literature/item-difficulty-without-students.md` and
`scripts/spike-simulate-difficulty.mjs` (throwaway, produced the spike numbers above) are both
uncommitted as of this session; `docs/CURRENT_STATE.md` has the working-tree detail. Last commit
remains `559dd40`.

## 14. Grounded difficulty simulation — the ability tier must gate access, not just grounding (31 Jul 2026)

**The Phase 0 spike (§13) was directionally right but measured the wrong thing.** It ran the simulated
students ungrounded — they never saw the deck — so a high success rate meant "answerable from general
knowledge", not "easy". This session ran the grounded comparison the spike deferred. Full write-up,
commands, and all five results: `docs/experiments/2026-07-31_grounded-difficulty-simulation.md`. Three
arms, 15 questions, n=30 simulated students each, 1,350 responses total, 0 unparseable, all on
`llama3.2` (~3B) via Ollama.

**The headline, not predicted going in: grounding alone does not work.** Handing every ability tier the
full source excerpt (arm B) produced 81/87/85/89% success across Below Basic/Basic/Proficient/Advanced
— the persona instruction was ignored and the task collapsed into reading comprehension. Only when the
excerpt was **thinned per tier** (arm C: Below Basic keeps 30% of its lines, Basic 55%, Proficient 80%,
Advanced 100%) did a proper gradient appear: 57/71/78/89%, monotonic. Implemented as `recall()` in
`scripts/spike-simulate-difficulty.mjs`, behind a new `--retention` flag. The published paper the method
was cited from (arXiv 2601.09953) does not hit this because NAEP maths items are self-contained; our
items are source-dependent recall, so with the source in context the model's own competence stops
supplying the gradient. This is a domain-transfer finding worth reporting in the paper.

Arm C passes the pre-stated gate (spread ≥ 0.20, no ceiling/floor pile-up): mean facility 0.71, spread
0.67, 1/15 at ceiling, 0/15 at floor — bins cleanly into the existing 1–5 quintile column. Rank
agreement across arms (A↔B 0.51, A↔C 0.66, B↔C 0.70) shows the grounding choice materially changes item
ordering, so it is a methodological decision, not a detail. The ordering is not an artifact of excerpt
length — neither line-count nor character-count correlation with facility is significant at n=15, and
the character correlation runs opposite to the artifact hypothesis.

**New pipeline step: `scripts/extract-slide-text.mjs`.** 12 of 26 pages of the test deck (`Pitch_Session
12.pdf`) have no text layer — the Airbnb example slides are images. This script recovers their text by
sending the PDF to **Gemini vision** (one call, 13,885 in / 2,841 out tokens). Consistent with the
existing split: Gemini does content work, Ollama stays local and simulation-only, LibreOffice stays out
of the pipeline. Gemini's `kind` classification is unreliable — it mislabelled a real example slide
(page 16) as a template — so slide provenance is keyed on the number printed on the slide, not on
`kind`.

**Known limit for package G1: text transcription loses position.** Chart, matrix, and 2×2 slides cannot
be difficulty-calibrated by text simulation. The one d4 item in the set (Competitive Landscape, a 2×2 of
affordability against transaction type) scores 33/30/33% across all three arms — grounding does not help
it at all, because every label on the slide is recovered but not the positions. Either such items need a
different provenance representation, or they cannot be difficulty-calibrated this way. Open, affects G1.

**The question-quality gate needs n≥30, not n=4.** At n=4 (the 30 Jul spike) it flagged 4/15 items as
answerable with zero deck knowledge; at n=30 only 1/15 survives — the other three were sampling noise.
Worth adding to `scripts/validate-questions.mjs` at n≥30.

**Planning figure revised.** 2.6–5.8 s per response, ~3 s/response as the planning number: **400 items ×
n=30 ≈ 10 hours**, an overnight job. This supersedes the 30 Jul spike's "2.1 s per response" extrapolation
wherever it appears.

**Working-tree state.** `spike-data/` (course material and run outputs) is now gitignored — added to
`.gitignore` this session. Uncommitted as of this session: `.gitignore`,
`scripts/spike-simulate-difficulty.mjs` (gained `--source`, `--retention`, `--out`, `--label`, per-tier
breakdown), `scripts/extract-slide-text.mjs` (new), `scripts/spike-compare-arms.mjs` (new — Spearman
agreement, ability slope, ceiling/floor counts), `docs/experiments/` (new). Last commit remains
`44a2443`. Full working-tree detail, the reproduction commands, and the open question the session ended
on (whether to correct the "labels do not discriminate" claim — **not yet answered, do not edit that
claim without it**) are in `docs/CURRENT_STATE.md`.

## 15. Three P0 packages built, the method replicated, three product decisions (31 Jul 2026, later the same session)

**This is a continuation of the same 31 Jul 2026 day, after §14.** Where §14 closed on an open question
(whether the "labels do not discriminate" claim needed correcting) and no job running, this stretch
built the three highest-priority packages and ran the replication that answers part of that question.
Source of truth for the state described here: `docs/CURRENT_STATE.md`, rewritten at the end of this
stretch. Full simulation detail: `docs/experiments/2026-07-31_grounded-difficulty-simulation.md`
(Result 7 and the Gemini Flash-Lite attempt were added to it this stretch).

**Three P0 packages shipped: G1 (generator), D1 (dashboard), Q1 (quiz hardening).** `app/dashboard/page.tsx`
is now real — it renders one tile per entry in `GAME_REGISTRY` (`lib/games/registry.ts`), closing the
gap §12 flagged as the professor's first instruction and the least-built part of the app. The generator
(`scripts/generate-questions.mjs`) writes `content_items` rows plus their `source_excerpt`. The quiz no
longer trusts the client: `app/api/answer/route.ts` is the only place `question_answered` gets written,
looks the answer up server-side, and returns `correctIndex` only on the commit that actually scores an
item. Migrations `db/005` and `db/006` are applied and verified live on Neon project
`ancient-brook-62806105`. Tests went **10 → 18** (`tests/registry.test.ts` and
`tests/quintile-difficulty.test.ts` are new), `tsc --noEmit` is clean, `npx next build` succeeds.
Eight commits this stretch, oldest first: `a00964d` (db/005) → `17e21e9` (G1) → `f4fa360` (D1) →
`aefb6c5` (hydration fix) → `e7af686` (Q1) → `66853ec` (lever resolver) → `748accf` (tie binning) →
`9239f2a` (reproducible simulator + calibration). Nothing pushed, as usual.

**Process lesson worth keeping.** The first Q1 attempt reported success while the answer key still
shipped in the client JS bundle and the scoring route returned `correctIndex` on every POST, not just
the one that scores. Caught by a review pass, not by the builder's own report. **New standing rule:
anything touching scoring or auth gets a `reviewer` pass before commit** — added to `CLAUDE.md`.

**Cohort corrected: 60–120 students, not ~20.** This number had propagated into
`docs/PROJECT_MAP.md:560` and `docs/literature/item-difficulty-without-students.md:112`. Three
experimental arms now give 20–40 students per group, so underpowering is no longer the decisive
objection to self-selected arms. Every response-budget figure computed off ~20 students needs
revisiting — the real range is 24,000–48,000 responses across the pilot, not ~8,000, which changes the
recipe-level Elo convergence argument in §13 (more headroom above the 200–500-response threshold, not
less; see the correction note added there).

**The simulator is now reproducible by construction, not just in principle.** `options.seed` in
`scripts/spike-simulate-difficulty.mjs` is threaded per (item, student), and seeds derive from the
item's **id**, not its position in the result array — seeding from position was tried and silently
breaks reproducibility the moment item order changes between runs. The honest limit: this makes runs
repeat under a **pinned model and environment**, not deterministic across a model update or a change of
CPU/GPU. OpenAI's `seed` parameter is documented as best-effort, and Gemini exposes no seed parameter
at all, so this property is only available on the local Ollama path — one more argument, alongside the
three already in `CLAUDE.md`, for why the simulator must stay local rather than a convenience.

**The method replicated on two more model families; the difficulty values did not.** The same 15
items, same seeds, same thinning ran through `gpt-3.5-turbo-0125` and `gemma2:9b`. Two unrelated model
families agree with `llama3.2` on the core finding: only retention-gated grounding produces an ability
gradient; full grounding without retention gating inverts it or flattens it. They do **not** agree on
*which* items are hard — Spearman ρ ≈ 0.23 between every pair of simulators on the grounded-retention
arm. `llama3.2` stays the simulator: `gpt-3.5-turbo` scores 0.72 with no source material at all against
`llama3.2`'s 0.45, and ceilings on 7 of 15 items; `gemma2:9b` ceilings on 8 of 15 and is roughly 6×
slower. Both recognise the Airbnb pitch deck from training data, which disqualifies either one from
playing a struggling student, however it is prompted. **New standing rule: one simulator is one
measurement — any difficulty claim must name the simulator that produced it**, added to `CLAUDE.md`.
A Gemini 3.5 Flash-Lite attempt was also made and abandoned: free-tier throttling ran it at ~13 s per
response before it hit 33 consecutive 429s on the depleted prepayment credits, and the two responses
that did complete showed the same memorisation signature as `gpt-3.5-turbo`, more pronounced.

**Consequence for the "do the 1–5 labels discriminate" question, left open at the end of §14: still
UNRESOLVED, and now provably so.** ρ between simulated facility and the asserted label is −0.63 under
`llama3.2` and −0.09 under `gpt-3.5-turbo-0125` on the identical 15 items. A simulator that ceilings on
7–15 items mechanically destroys rank correlation, so `gpt-3.5-turbo`'s near-zero reading cannot be
trusted either. **No simulator available can settle this** — only observed student responses can.
`CLAUDE.md`, `docs/PROJECT_MAP.md` §1.6 and `docs/consult-brief.md` should not claim either direction
until the pilot runs.

**Difficulty stays at five levels, decided explicitly this stretch.** At n=30 simulated students per
item the standard error on a success rate is ~0.09, so a ten-band scale would be about one standard
error wide — false precision the data cannot support. Ties share a band; binning by rank position was
rejected because it invents distinctions the measurement never made.

**The adaptive ramp now requires two consecutive same-direction answers, and the per-round reset is
recorded as deliberate, not the defect §10 had flagged it as.** Two-in-a-row damps single-question
noise in the ramp. The per-round reset stands because carrying difficulty across rounds would imply one
global student ability level, which would conflate performance across six different games into a
single number — exactly the kind of cross-construct mixing the per-game lever design (§12) was built to
avoid.

**Three product decisions, none yet discussed with the professor:**
- **A leaderboard will be built (package L1).** Decided by the user.
- **A global XP/level bar is wanted, as a wrapper over all games.** Safe only because it is an output
  of gameplay, not an input to it: **XP must never feed back into item selection**, or it recreates the
  cross-game conflation the per-round difficulty reset was just rejected for.
- **Any motivational overlay (XP, leaderboard) must be identical across every experimental arm.**
  Identical across conditions makes it a constant the study can ignore; varying by condition makes it
  an uncontrolled confound. Leaderboard ethics and its interaction with the persistence dependent
  variable remain unresolved despite the decision to build it.

**Provider reality: Gemini prepayment credits are depleted.** Every Gemini call 429s. Generation
currently runs on **OpenAI** through the existing provider-agnostic adapter
(`scripts/lib/llm-client.mjs`, default `gpt-4.1-mini`, `--provider openai`) — the adapter rule from §5a
paying off exactly as designed: swapping the provider under an outage is a flag, not a rewrite.

**Not committed.** Everything in this section exists on disk but is uncommitted as of this session; last
commit remains `9239f2a`. `docs/CURRENT_STATE.md` carries the full working-tree detail, the next
concrete step (Step 4 of the approved plan — logging the continuation offer), and the complete
do-not-redo list.

## 16. Package G2, a validator lesson, and Wordle's viability in doubt (1 Aug 2026)

**Four P0 packages are now shipped: G1, G2, D1, Q1.** `scripts/generate-terms.mjs` plus
`scripts/lib/terms-validate.mjs` (package G2) extract `term_definition` primitives into
`content_items`. This unblocks `match-the-following`, `fill-in-the-blanks`, `choose-the-right-word`,
and Wordle — all four consume this primitive and were blocked on a table holding zero such rows.
Migrations `db/005` and `db/006` remain applied and verified live on Neon project
`ancient-brook-62806105`. 18 tests pass, `tsc --noEmit` is clean, `npx next build` succeeds.

**A validator lesson worth keeping as a standing convention.** G2's first clue-leak rule tested each
word of a multi-word term independently, so a clue for "Minimum Viable Product" was rejected for
containing the ordinary word "product" — it rejected 5 of 8 valid items. Fixed: a single-word term
leaks on any inflection of itself; a multi-word term only leaks if the clue contains every content
word. Yield went from 3 items to 13 on the same deck. General lesson, worth applying beyond G2: an
over-rejecting guard is not automatically the safe direction — it can silently destroy yield the same
way an under-rejecting one lets bad data through.

**Package A0 result: Wordle (A4) is probably not viable, pending a second deck.** 0 of the 13 terms
G2 extracted from the Thoughtworks deck are single words of 4-8 letters. Management terminology comes
out phrasal ("Lean and Agile Delivery Model", "Cross-functional demand analysis"); the one single
word, "Inception", is nine letters. The A0 gate was eight candidate terms from one deck. Recorded as:
**run A0 against a second deck before dropping A4** — but the reason likely generalises past this one
deck, since a case study yields a taxonomy of terms, not a lexicon of words.

**Voluntary persistence is now measurable.** `round_offer` was added to `EventType`
(`lib/log/logEvent.ts`), emitted when the Keep Going affordance renders (`app/results/page.tsx`,
`lib/game/game-context.tsx`). The event log now distinguishes accepted (`round_continue`), declined
(`round_stop`), and abandoned (an offer with neither) — previously, declining and never being offered
were indistinguishable in the data. The same pass fixed round-number reuse on abandoned rounds, which
had been corrupting this same measure.

**Deck screening adopted as a standing cheap gate.** An ungrounded simulation run (~20 min on
`llama3.2`) now runs before the ~85-minute grounded `gemma2:9b` run, to check whether a source deck is
already memorised by a model rather than genuinely being read. Screened so far, all usable: CAGE
slides (mean facility 0.42, 0 at ceiling), the Thoughtworks case (0.51, 0 at ceiling), Thoughtworks
slides (0.50, 0 at ceiling), Airbnb (0.45, 1 at ceiling).

**An observation on the Thoughtworks case that qualifies §14's finding — UNVERIFIED, not settled.**
The *ungrounded* screening run on the Thoughtworks case showed a monotonic positive ability gradient
(43/51/54/63% across Below Basic/Basic/Proficient/Advanced), where every slide deck screened so far
showed a flat or inverted one. Possible explanation, not confirmed: the case's items are
reasoning-heavier than the slide decks' recall items, and general ability helps on a reasoning item
even without the source, whereas a recall item gives ability nothing to work with. This is explicitly
**unverified** — the Advanced tier in this screening run is only 3 simulated students — and the clean
test is the grounded-retention arm on the same case, which has not been run. Do not fold this into the
§14 grounding finding until that arm runs.

**A process rule for git hygiene.** A 9.8 MB course-material deck was committed to the repo by
accident this session via a broad `git add`, and had to be amended out. **New rule: never stage with
a broad add (e.g. `git add -A`) when course-material PDFs are sitting in the working tree** — stage
files by name instead. Root-level `*.pdf` is now gitignored so this cannot recur silently.

**Correction, entered 4 Aug 2026: match-the-following did not stay not-started.** This paragraph was
accurate when written earlier on 1 Aug 2026 but was never updated — package A1 (match-the-following)
shipped later the same day, commit `fe871e1`, with the per-pair-vs-per-board scoring question resolved
as per-board grading (15 points per correct pair, +30 clean-board bonus, −20 floor penalty at ≤2
pairs). Package A3 (choose-the-right-word) also shipped 1 Aug 2026, commit `1805d62`. Both are listed
in CLAUDE.md's shipped-package line. A prior scribe run spotted this stale paragraph on 4 Aug and
correctly declined to invent the fix without reading the commit history; this correction supplies it.

**Working tree.** Branch `main`, last commit `9728d19`, working tree clean, 14 commits ahead of
`origin/main` — not yet pushed. `spike-data/` and root-level `*.pdf` are gitignored; three source
PDFs sit untracked in the repo root. Full commit list, next-3-actions, and the complete do-not-redo
list are in `docs/CURRENT_STATE.md`, rewritten at the end of this session and now the single
authoritative snapshot (supersedes the 31 Jul checkpoint entirely).

## 17. The term generator rebuilt after playing the game caught a bad item bank (3 Aug 2026)

**What started it.** Playing choose-the-right-word surfaced a term item answerable by matching a
country name — the clue and answer were about a chart, not the deck's content. Root cause was
`scripts/generate-terms.mjs`: one model call per page window, under a quota, asked in a single pass to
find a concept, define it, and invent wrong answers. A page of charts still had to yield N items, so
it yielded chart captions.

**Fix: the generator is now two-stage.** A glossary pass asks only what the deck teaches — no quota,
empty is a valid answer — and items are written from that glossary afterward. Verified on the same 9
pages that previously gave 6 drafts and 3 captions: the new flow gave zero captions.

**A method lesson, now standing: caption detection cannot be done with lexical rules on the model's
output.** Three separate rule-based attempts failed. The validator rejected `Google's Market Share`
and passed `Market Share of Google`; the prompt named `Netflix Subscribers Statistics 2025` and
`Mattel Japan Market Share` as forbidden examples and the model produced `Mattel Market Share
Variation` anyway. Rephrasing defeats every string rule tried; only the structural fix — ask what the
deck teaches before asking for questions — worked.

**Distractors are generated, never selected from the glossary.** Tried and verified worse:
glossary-sourced distractors paired near-synonym concepts (`Globalization Journey` / `Global
Footprint`) as each other's distractor, and both items became unanswerable — the clue for each
described both. Invention cannot accidentally produce a correct answer; selection from a glossary of
near-synonyms routinely does. `scripts/lib/distractor-select.mjs` was deleted, per the
delete-obsoleted-machinery convention.

**New finding: confusable distractors raise the bar on clue precision.** "Never a synonym" is not
enough — the clue must state what distinguishes the answer from its nearest distractor.
`Extreme Programming`, with distractors Scrum / Kanban / Lean Startup and a clue describing a
framework that "integrates business demands with software development rules to achieve shared and
realizable goals," scored 0.10 grounded — worse than chance — because that clue fits Scrum equally
well. The old, looser version of the same item scored 0.93. Making the distractors more confusable
without tightening the clue made the item worse.

**The item gap screen** (`scripts/analyse-item-gap.mjs`) runs an item both ungrounded and grounded on
`llama3.2:3b`; the grounded arm uses the full excerpt and deliberately skips `--retention` (which
exists to spread ability tiers for difficulty calibration, not to gate quality — this arm only asks
whether the source answers the question at all, so ceiling is a good sign here, not a problem). The
grounded arm is the gate and it works: on 29 regenerated items it caught the one broken item above,
which reading the text would never have surfaced. The ungrounded arm does not work as a rejection
gate — it measures how famous a concept is, not whether an item is defective. `Agile Manifesto`,
`User Story`, and `Standup Meeting` all score 1.00 ungrounded because `llama3.2:3b` has read every
Agile blog ever written, not because the items are broken — the same memorisation confound already
found on the Airbnb deck, in a new instrument. When the grounded arm ceilings, the gap collapses to
`1 − ungrounded` and carries no separate information. Measured: old bank of 50 items — 5 broken,
grounded mean 0.90, ungrounded 0.72; regenerated 29 — 1 broken, grounded mean 0.96, ungrounded 0.687.

**Content items are retired, never deleted.** `db/009_add_item_retirement.sql`, applied to Neon
`ancient-brook-62806105` on 3 Aug, adds `retired_at` and `retired_reason` as a matched pair on a CHECK
allowlist plus a partial index on live rows; all three item-selection routes now exclude retired rows.
Reason: 6 of the first 7 retired items (the chart captions) already had `events` rows, and events are
the append-only research dataset — a hard delete would either hit the foreign key or cascade through
it. Widening the reason allowlist later needs a DROP and re-ADD of the named CHECK; Postgres has no
`alter constraint`.

**Screen before writing, never after.** `build-term-mcq-spike.mjs --from-json` now reads the
generator's `--dry-run` output directly, so items are judged before any decision to write them. It
computes ids with the same `sha256(subject::term)` the generator uses on write, so screen results join
back to the row that will actually exist. `--subject` must be passed explicitly — it is part of that
id, and one pass defaulted every item to a single subject and mis-keyed 15 of them.

**A correction to the simulator-selection criterion.** Discrimination (mean facility, ceiling rate,
gradient, IQR) is necessary but not sufficient. A weak simulator's low facility score can mean the
simulator is ignorant, not that the item is hard: `llama3.2:1b` does not know Microsoft's search
engine is Bing (`3b` does), and the 1b calibration ranked `Bing` (0.23) and `Yandex` (0.17) as its two
hardest items, where the item gap screen shows one is trivia and the other is broken. None of the
discrimination criteria detect this. Stated plainly: **difficulty calibration cannot distinguish a
broken item from a hard one — both read as low facility.**

**An open design question for the professor, not a bug.** If a course teaches public professional
vocabulary — the gap screen's examples are the Agile Manifesto, User Story, Standup Meeting — no
recall-style item can require the deck, because that vocabulary predates and outlives the course
material. That argues for term games testing *application* rather than recall, the way the quiz's
reasoning MCQs already do. Not resolved; raise at the 4 Aug meeting alongside the still-open
experimental-contrast question.

**Tooling.** Playwright MCP was removed and the Playwright CLI installed globally instead — an MCP
server loads its tool schemas every session, a CLI costs nothing until called. `.playwright-cli/` and
`.playwright/` are gitignored. The `UV_HANDLE_CLOSING` assertion is confirmed to be a Node
24.11.1-on-Windows process-exit bug, not a neon-serverless defect — `playwright-cli --version`
triggers the identical assertion with no Neon involved; a prior checkpoint had mis-attributed it.

**Nothing has shipped to the database.** The 29 regenerated items exist as screened JSON only
(`spike-data/`, gitignored). The app still serves the old cohort: 43 live term rows plus 7 retired.
159 tests, `tsc --noEmit` clean.

**Working tree.** Branch `main`, clean, four commits: `ef61550`, `4a0a557`, `70a4c37`, `3a8dcf5`. Full
next-actions and do-not-redo list: `docs/CURRENT_STATE.md`.

**Unchanged and still the top blocker: the between-arm experimental contrast.** The professor
reportedly dropped the adaptive-difficulty lever; there is still no transcript. This session's work
does not touch that question. Top item for the 4 Aug meeting.

## 18. The screened cohort goes live, a detector is built and deleted, and the gap screen hits ceiling (4 Aug 2026)

Continues §17 (the generator rebuild, screening infrastructure, 29 regenerated items sitting as
screened JSON only). This section covers what happened after that JSON existed: one more validator
finding, one detector tried and rejected, a migration, and the cohort swap itself.

**A clue must name what distinguishes its answer from its nearest distractor — "not a synonym" is not
enough.** Commit `e243022`. `Extreme Programming`, with distractors Scrum / Kanban / Lean Startup and
a clue describing "a framework that integrates business demands with software development rules to
achieve shared and realizable goals," scored 0.10 grounded — worse than chance — because that clue
also fits Scrum. The older, looser version of the same item scored 0.93. Making distractors more
confusable without tightening the clue is what broke it; checking the clue against each distractor in
turn, inside the same call that writes them, fixed it — after the rule, the same item scores 0.97. This
is now a standing rule, recorded in CLAUDE.md's Conventions.

**A templated-distractor detector was built, tested, and deleted in the same commit.** Hypothesis: a
caption's distractors are template variants with one slot swapped (`Android Sessions by Game Category`
→ `iOS Sessions by Game Category`); a real item's distractors are different concepts. Run against the
38 real generated items it flagged 8, and 4 of those 8 were good items: `Agile Software Development`
vs Waterfall/Spiral, `Thin Slice Team` vs Scrum Team, `Intraregional Trade` vs International Trade,
`User Story` vs User Scenario — all share a head noun with their distractors, which the clue-precision
rule above requires rather than forbids. The signal does not exist: `Agile Software Development →
Waterfall Software Development` is structurally identical to the chart-caption swap above. The
difference — rival concepts vs two slices of one chart — is semantic, not structural, and no token rule
reaches it. Recorded in CLAUDE.md as a do-not-redo. This was the third over-rejecting guard of the
session, after the clue-leak and example-sentence rules; it cost nothing only because it was caught
before shipping, not after.

**`db/010_widen_retirement_reasons.sql`, written and applied 4 Aug.** Widens the
`content_items_retired_reason_check` constraint to permit `superseded`, `under-determined`, and
`trivia` alongside the existing `chart-title-term`. Postgres has no `alter constraint`, so widening an
allowlist is DROP + re-ADD of the same named CHECK regardless of size — a redefinition, not a
data-destructive operation — and the whole statement is one `do $$ ... end $$` block, atomic. Verified
after: the constraint carries all four values, nothing else moved. The file itself carries the caveat
that `trivia` is for human judgement only, never an automated threshold — the gap screen's ungrounded
arm measures how famous a concept is, not whether an item is defective, so it must never assign this
reason on its own.

**The cohort swap — the headline of this session.** `scripts/import-terms.mjs` (new) imports
already-screened items from generator JSON rather than re-running the generator, because generation is
not deterministic: a second run would write items nobody looked at, making screen-before-write
meaningless. Commit `ea3dcb4`. Verified independently against the live database, not taken from an
agent report:

- **34 live term rows: 25 Digital Transformation, 9 International Management** (replacing 43
  unscreened rows).
- 34 rows retired as `superseded` (10 DT, 24 IM); 7 remain retired as `chart-title-term` from the prior
  session.
- 92 `content_items` total, 17 `mcq` unchanged, **184 events unchanged**, no orphaned `source_id`.
- **`simulated_p`, `difficulty`, and `empirical_p` are still null on every term row** — the calibration
  write is deliberately unmade, exactly as before the swap.

**Three items were excluded by hand after passing the screen**, not by any automated rule:
`Android Sessions by Game Category`, `Globalization Case Study`, `Other Dimensions of Distance`. All
score above 0.9 grounded and all are chart captions or slide headings. This is the honest boundary of
the instrument: the grounded arm certifies that an item is answerable from its source, never that the
item is worth asking. It does not replace human judgement, it bounds where human judgement is still
required.

**The gen3 screen result: 0 broken, but the gate is now at ceiling.** 37 items screened — grounded mean
0.98, ungrounded mean 0.79. The three-generation trend on broken items is 5 (old 50) → 1 (gen2 29) → 0
(gen3 37), which reads as a clean pass but is not one: grounded IQR on gen3 is 0.00, with 36 of the 37
items at ceiling. The gate now only catches catastrophic items; it no longer discriminates among the
items that pass. State that plainly rather than presenting 0-broken as evidence of item quality beyond
"not obviously defective."

**Two gaps left open, not fixed.**
- `scripts/generate-terms.mjs --out` writes no provenance. `generator_model`
  (`openai/gpt-4.1-mini`) and `recipe` (windows of 3) were inferred at import time from the run logs,
  and both values are correct, but the next person cannot verify that from the file itself — `--out`
  should record what produced it and currently does not.
- **The pending term calibration (`spike-data/termcal-llama3-2-1b.json`) is now stale, not merely
  unapplied.** It was computed against the cohort that the swap above just superseded. Do not write it
  to `difficulty`/`simulated_p` — recompute against the live 34 rows first.

**Open risk carried into the next session: International Management is down to 9 live term rows.**
Match builds 6-tile bijection boards with least-recently-served rotation; 9 rows is thin for that,
and a thin pool is exactly how this project previously manufactured a ceiling — a student was locked
out of match after exactly 8 boards, found only by playing, not by any static check. Playing match
against the live International Management pool has not yet been done this session.

**Unchanged and still the top blocker: the between-arm experimental contrast.** Nothing in this
section touches it. No item-bank work substitutes for it. The lever-drop decision still has no
transcript.

## 19. Game 4 chosen, a bank screened, and the MCQ generator rebuilt (5-6 Aug 2026)

**No `app/` or `lib/` code changed.** 188 tests, `tsc --noEmit` clean, database untouched since the
4 Aug cohort swap. This was content-pipeline and research-design work.

**Game 4 is Connections, not crossword.** An RFC (`docs/architecture/game4-rfc-prompt.md`) went to
five model families — ChatGPT via API and Playground, Claude, Gemini, DeepSeek, Grok — and all five
chose Connections, on learning value, research value and build cost. **Carry the caveat with the
verdict:** §7.1 listed crossword's open problems against §7.2's settled advantages, and the system
message fixed the justification order as the one Connections wins in. Effort estimates spread 7×
(30–40h to 215–285h) entirely on whether the content pipeline was counted; three of five
independently recommended hand-authoring boards for the pilot and building the pipeline afterwards.

Crossword was not rejected for entry length — the user's fragment insight (any content word can be
the grid entry, plus constituent expansion, CAGE → CULTURAL/ADMINISTRATIVE/GEOGRAPHIC/ECONOMIC)
solved that, reaching ≤8 cells on about a third of the bank. It was rejected on crossing density,
the 90s board clock, and build cost.

**Connections' headline claim measured down.** The reason to prefer it was that partitioning
requires the material's own structure. A no-source screen (`scripts/spike-connections-solve.mjs`)
found the verdict is **entirely instrument-determined**: boards rejected 0/3 on `gpt-4.1-nano`, 1/3
on `gemma2:9b`, 3/3 on `gpt-4.1-mini` and `gpt-5-nano`. The defensible claim is only the weaker one —
grouping is *harder* to do cold than recall is, not that it requires the deck. Do not put
"Connections requires the material's structure" in the paper without human data.

**Two near-miss false signals, now standing conventions in CLAUDE.md.** `llama3.2` 3B returned a
clean-looking 0.10/4, then scored **0.00/4** on a control board of Colours/Animals/Countries/Fruits —
it cannot do the task at all, so the result measured the instrument. And the screen pooled one
verdict across boards, hiding a 40% board beside a 0% one. A rejection gate now requires a
capability control, and a verdict never pools across the unit being rejected.

**A 90-item term bank is screened and ready to import** (not imported). Five session decks — Cloud,
Big Data, Blockchain, Sessions 5 and 6 — through the two-stage term generator, then the gap screen:
grounded mean **0.964**, **2 broken** of 90, against gen3's 0 of 37. **37 of 90 are fully answerable
with no deck**, much higher than the management decks; that is the public-vocabulary finding at a
larger sample, not a defect.

**G1 rebuilt three-stage**, mirroring G2's 3 Aug rebuild, because it still ran a `--per-window`
quota — visible in a live bank containing "Which team member has a background in computer science
from Harvard". Full detail and the unresolved length-giveaway finding are in CLAUDE.md under the G1
entry; the short version is that MCQ options leak their answer by length (65% → 81% → 89% across
three fix attempts, chance 25%), a prompt cannot fix it, blinding made it worse, but it does **not**
contaminate difficulty calibration.

**A Mac mini M4/16GB is set up and benchmarked** at 0.42 s/item-trial against Windows' 1.485 —
**3.5× faster**, turning the projected 15-hour calibration job into roughly 4 hours. It needs only
`DATABASE_URL`, since calibration reads `source_excerpt` from Neon rather than local PDFs.

**Unchanged and still the top blocker: the between-arm experimental contrast is undecided**, now
four days after the 4 Aug meeting, and the lever-drop still has no transcript in `docs/meeting/`.
