# v0 Brief: Student Learning-Game Dashboard

A design brief for generating the front-end in **v0** (v0.dev). v0 designs the screens; Claude Code wires the adaptive engine, game logic, Neon data, and per-question logging. Generate **one screen per prompt**, then iterate.

---

## What this is (context to paste into v0)

A **gamified adaptive-learning platform** for university students (age 22+, PGDM). Students answer AI-generated questions built from course material, earn points, and the challenge adapts to them. It should feel like a **game they want to keep playing**, not a corporate quiz tool or an analytics dashboard.

Core rules that shape the UI:
- **Points are fixed per question** (e.g., +20 correct), with **negative marking** on wrong answers (there's a stake).
- The student **chooses one challenge lever** before playing: **Adaptive Difficulty** (gets harder as you succeed) *or* **Time Pressure** (less time per question as you improve). Not both at once.
- Quizzes have **modes**: Rapid Round and Normal. More game types come later (crossword, word-search, match-the-following, fill-in-the-blank) — show them as tiles.
- The key emotional beat is **"keep going to the next round"** — voluntary persistence. Make that moment feel rewarding.

---

## Art direction (read this carefully — do NOT produce a generic dashboard)

**Vibe:** energetic, premium, game-like, alive. Think a polished game HUD crossed with a modern learning app — confident and a little bit *loud*, but grown-up (these are MBA students, not kids). It should have a **distinctive identity**, not the default gray shadcn/SaaS look.

- **Canvas:** deep, rich dark background with **depth** — subtle gradient mesh / aurora glow, not flat gray.
- **Color:** one confident, vivid identity. Suggested: electric indigo → violet → magenta gradients for primary/interactive, plus a warm **gold** reserved for points/rewards. High-saturation accents on the dark canvas so it *glows*. (Swap the exact hues, but keep it vivid — the client dislikes muted/minimal.)
- **Surfaces:** frosted-glass / translucent cards with soft glow and a bright top edge; generous rounding (16–24px).
- **Typography:** a characterful, slightly bold display face for headings and big numbers; clean, legible sans for body. Big, proud numbers for points.
- **Motion & "juice" (important):** animated point counters that tick up, a satisfying reward flash on a correct answer, a countdown timer that pulses under pressure, progress bars that fill with spring, hover lift on cards. Motion everywhere something changes.
- **Avoid:** flat gray cards, default shadcn styling, muted pastel minimalism, generic "AI dashboard" layouts, tiny timid type, static screens. If it looks like every other Tailwind admin template, it's wrong.

**Tech constraints for v0:** Next.js App Router, Tailwind, responsive (works on a laptop and a phone), dark theme, reusable components. Accessible (keyboard + reduced-motion friendly).

---

## Screens to generate (one prompt each)

### 1. Dashboard / Home
> Design a student learning-game **dashboard** home screen. Top: a friendly greeting and the player's **points**, shown two ways with animated counters — a large **Net Points** (after negative marking) and a smaller **Potential Points** (what you'd have with no penalties). A row of small stats: rounds played, current streak, best difficulty reached. Main area: a grid of **"Play" cards** — a prominent **Quiz** card (active, with a big Play CTA), and tiles for **Crossword, Word Search, Match-the-Following** marked "Coming soon." A bold primary **Continue Playing** button. Energetic, game-like, dark aurora canvas, glowing gradient accents, gold for points. [paste the art direction above]

### 2. Game setup / launcher (Quiz)
> Design a **quiz setup screen**. The student picks a **Mode** (two big selectable cards: **Rapid Round** and **Normal**) and a **Challenge** lever (a clear two-option toggle: **Adaptive Difficulty** — "gets harder as you win" — or **Time Pressure** — "less time as you improve"). Show a short "How points work" note: +20 correct, negative marking on wrong. Big **Start** button. Same energetic dark/glow aesthetic. Make the selected option obviously, satisfyingly selected.

### 3. In-quiz question screen
> Design the **in-quiz question screen**: one question at a time with four large answer options. Top bar shows **running Net score** (animated), round progress (e.g., Q3 of 10), and — depending on mode — either a **countdown timer ring** (Time Pressure) or a **difficulty level badge** that ramps up (Adaptive Difficulty). On answering: a **correct** state (green glow, +20 flies up) and a **wrong** state (negative flash, shows the penalty and the correct answer). Punchy, high-feedback, game-HUD feel. Dark aurora canvas.

### 4. Round-end / results
> Design a **round-results screen**. Show the round's **score** big and proud, a breakdown (correct vs wrong, points gained vs lost), and the peak stat (highest difficulty reached, or best answer time). The hero action is a large, tempting **"Keep going → Next Round"** button (this is the moment we want them to choose to continue), with a quieter **Back to Dashboard** secondary. Celebratory but not childish; animated counters; gold accents on the points.

---

## Handoff to Claude Code (what v0 does NOT need to build)

Leave these to wiring — just make the UI states exist:
- Adaptive-difficulty / time-pressure **logic**, question sourcing (from the book PDF via Neon), scoring math, negative marking.
- **Event logging** (per question + round + session).
- Real data — mock it with placeholders; I'll connect Neon.
