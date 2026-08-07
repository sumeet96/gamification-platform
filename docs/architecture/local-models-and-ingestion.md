# Local models and source ingestion

Moved verbatim out of `CLAUDE.md` on 7 Aug 2026. Operational infrastructure owned by neither
the generator spec nor an experiment log: the local-only Ollama rule and its reasoning, and the
PDF-in / LibreOffice-out ingestion path.

---

- **Ollama, local-only, added 30 Jul 2026 — difficulty simulation only, never content generation
  (that stays on Gemini).** Already installed, v0.32.1. Three reasons it must be local, in order:
  (1) reproducibility — a hosted model can change mid-pilot and silently shift calibration, which
  would break the paper's instrument; (2) course material never leaves the machine; (3) the research
  finds **weaker models simulate students better up to a point — the live selection rule is
  discrimination, not raw weakness** (`docs/literature/item-difficulty-without-students.md`; corrected
  1 Aug 2026, see the bake-off result above), so a small local model is the methodologically correct
  choice, not a compromise. **Warning: `gemma4:31b-cloud` shows up in `ollama list` but is a CLOUD
  model — do not use it for simulation.** **Locally installed as of 1 Aug 2026:** `llama3.2:1b`,
  `qwen2.5:1.5b`, `gemma2:2b`, plus the earlier `llama3.2` (3B) and `gemma2:9b`.
  - _Tooling lesson, 1 Aug 2026:_ the simulation runner scripts guarded against concurrent Ollama jobs
    by waiting for `ollama ps` to be **empty**. That check is wrong: `ollama ps` lists **loaded**
    models, not **busy** ones, and Ollama keeps a model resident ~5 minutes after use — a warm idle
    model is not a conflict, and two runs sat in the wait loop until they aborted instead of running.
    The check was **removed, not repaired**; the mutex is the real protection. Second half: a hard
    kill does not fire an EXIT trap, so a killed run left its lock directory behind and silently
    blocked the next run. **A mutex whose release depends on graceful exit is only half a mutex** —
    the lock now records the owning PID so a stale lock is distinguishable from a live one
    (`spike-data/run-term-llama3b.sh` has the working pattern; copy it, don't re-derive the fix).
- Knowledge layer: **input is PDF. LibreOffice is out of the pipeline** (corrected 30 Jul 2026 —
  professors export PDFs from PowerPoint themselves; rationale in `docs/architecture/generator-spec.md`).
  Course material is not a build prerequisite — the professor said any PDF on any topic works for
  building against — but pilot content is sourced from Prof. Singh's decks, no hardcoded questions.
  Clean text/prose material first; mathematics support is deferred (see HANDOFF.md §3a).
  - _Added 31 Jul 2026:_ `scripts/extract-slide-text.mjs` recovers text from image-only slides by
    sending the PDF to **Gemini vision** — 12 of 26 pages of the test deck have no text layer. This is
    content work, so it stays on Gemini, consistent with the existing split: Ollama is local and
    simulation-only, LibreOffice stays out of the pipeline. Gemini's `kind` classification is
    unreliable (mislabelled a real example slide as a template); slide provenance is keyed on the
    number printed on the slide, not on `kind`.
- Total budget ~400–450 hours over 6 months and near-zero cash (~$0–15/mo dev, <$10/mo runtime during pilot). One artifact. Resist scope creep.
