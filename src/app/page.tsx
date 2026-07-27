"use client";

import { useRef, useState } from "react";
import { TOPICS, topicById, assignConditions } from "@/data/topics";
import { QUESTIONS, diagnosticQuestions, practicePool, type Question } from "@/data/questions";
import { computeReward, type RewardResult, type Condition } from "@/lib/rewardEngine";
import { inferStrengths, weakness, type TopicTally } from "@/lib/profile";
import { logEvent } from "@/lib/logEvent";

type Phase = "entry" | "diagnostic" | "profile" | "practice" | "results";
const AGE_BRACKETS = ["22–29", "30–39", "40+"] as const;
const ROUND_LEN = 4; // questions per practice round

function initTallies(): Record<string, TopicTally> {
  return Object.fromEntries(TOPICS.map((t) => [t.id, { correct: 0, total: 0 }]));
}

interface PracticeSummary {
  total: number;
  attempted: number;
  continues: number;
  rounds: number;
  byCondition: { fixed: number; variable: number };
}

// A round is a mix of fresh (measured, rewarded) and review (missed, re-served) items.
type RoundItem = { q: Question; mode: "fresh" | "review" };

export default function Home() {
  const [phase, setPhase] = useState<Phase>("entry");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [researcher, setResearcher] = useState(false);

  const sessionId = useRef(
    typeof crypto !== "undefined" ? crypto.randomUUID() : String(Math.random()),
  ).current;
  const conditions = useRef(assignConditions()).current;

  // Running strength model — updated LIVE by every answer (diagnostic + practice).
  const tallies = useRef<Record<string, TopicTally>>(initTallies());
  const [strengths, setStrengths] = useState<Record<string, number>>(
    inferStrengths(initTallies()),
  );
  const [baseline, setBaseline] = useState<Record<string, number>>({});
  const [result, setResult] = useState<PracticeSummary | null>(null);

  function base(event_type: GE["event_type"], over: Partial<GE> = {}): GE {
    return {
      session_id: sessionId, age_bracket: age, stage: null, topic: null,
      question_id: null, is_correct: null, condition: null, strength_at_time: null,
      base_reward: null, awarded_reward: null, event_type, ...over,
    };
  }

  // Called on every answered question — this is the live analytics capture.
  function recordAnswer(topicId: string, correct: boolean) {
    const t = tallies.current[topicId];
    t.total += 1;
    if (correct) t.correct += 1;
    setStrengths(inferStrengths(tallies.current));
  }

  function start() {
    if (!name.trim() || !age) return;
    void logEvent(base("quiz_start", { stage: "diagnostic" }));
    setPhase("diagnostic");
  }

  function onDiagnosticDone() {
    setBaseline(inferStrengths(tallies.current)); // snapshot to measure improvement against
    void logEvent(base("diagnostic_complete", { stage: "diagnostic" }));
    setPhase("profile");
  }

  function onPracticeDone(summary: PracticeSummary) {
    setResult(summary);
    void logEvent(base("quiz_end", { stage: "practice", awarded_reward: summary.total }));
    setPhase("results");
  }

  return (
    <main className="relative min-h-screen w-full flex flex-col items-center px-5 py-14 sm:py-16">
      <ResearcherToggle on={researcher} setOn={setResearcher} />
      <div className="w-full max-w-xl">
        <header className="mb-8 px-1 animate-rise">
          <p className="font-mono text-[11px] tracking-[0.22em] uppercase grad-text font-semibold">
            Digital Transformation · adaptive practice
          </p>
          <h1 className="font-display font-bold text-[30px] leading-[1.08] tracking-[-0.02em] mt-2.5 text-ink">
            Practice that reads your <span className="grad-text">weak spots</span>.
          </h1>
        </header>

        {phase === "entry" && (
          <Entry name={name} setName={setName} age={age} setAge={setAge} onStart={start} />
        )}
        {phase === "diagnostic" && (
          <Diagnostic
            sessionId={sessionId}
            age={age}
            onAnswer={recordAnswer}
            onDone={onDiagnosticDone}
          />
        )}
        {phase === "profile" && (
          <Profile strengths={strengths} conditions={conditions} researcher={researcher} onStart={() => setPhase("practice")} />
        )}
        {phase === "practice" && (
          <Practice
            sessionId={sessionId}
            age={age}
            strengths={strengths}
            baseline={baseline}
            conditions={conditions}
            researcher={researcher}
            onAnswer={recordAnswer}
            onDone={onPracticeDone}
          />
        )}
        {phase === "results" && result && (
          <Results name={name} strengths={strengths} baseline={baseline} result={result} researcher={researcher} />
        )}
      </div>
    </main>
  );
}

type GE = Parameters<typeof logEvent>[0];

/* ---------- shared bits ---------- */
function ResearcherToggle(props: { on: boolean; setOn: (v: boolean) => void }) {
  return (
    <label className="fixed top-4 right-4 z-20 flex items-center gap-2 rounded-full glass px-3 py-1.5 font-mono text-[11px] text-ink-soft cursor-pointer select-none transition-colors hover:text-ink">
      <input type="checkbox" checked={props.on} onChange={(e) => props.setOn(e.target.checked)} className="accent-brand2" />
      Researcher view
    </label>
  );
}

function Card(props: { children: React.ReactNode }) {
  return <section className="glass rounded-3xl p-6 sm:p-8 space-y-6 animate-materialize">{props.children}</section>;
}

function PrimaryButton(props: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      className="w-full grad-fill text-white font-semibold rounded-xl py-3.5 shadow-[0_12px_32px_-10px_rgb(var(--brand2)/0.75)] outline-none transition-[transform,filter] duration-150 ease-spring-out hover:brightness-110 active:scale-[0.98] focus-visible:ring-4 focus-visible:ring-brand2/40 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 disabled:hover:brightness-100"
    >
      {props.children}
    </button>
  );
}

function SecondaryButton(props: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      className="w-full rounded-xl py-3.5 bg-white/[0.04] border border-white/10 text-ink-soft outline-none transition-[transform,color,background-color,border-color] duration-150 ease-spring-out hover:text-ink hover:bg-white/[0.08] hover:border-white/20 active:scale-[0.98] focus-visible:ring-4 focus-visible:ring-brand2/30"
    >
      {props.children}
    </button>
  );
}

function Progress(props: { value: number }) {
  return (
    <div className="h-1.5 rounded-full bg-black/30 border border-white/5 overflow-hidden" aria-hidden>
      <div
        className="h-full rounded-full grad-bar shimmer transition-[width] duration-500 ease-spring-out"
        style={{ width: `${Math.max(0, Math.min(1, props.value)) * 100}%` }}
      />
    </div>
  );
}

function StrengthBars(props: { strengths: Record<string, number>; baseline?: Record<string, number>; researcher: boolean; conditions?: Record<string, Condition>; orderBy?: Record<string, number> }) {
  // Sort by a STABLE key (orderBy, e.g. the baseline) so bars don't reshuffle
  // between rounds — you can track each topic. Falls back to current strength.
  const key = props.orderBy ?? props.strengths;
  const sorted = [...TOPICS].sort((a, b) => key[a.id] - key[b.id]);
  return (
    <div className="space-y-3.5">
      {sorted.map((t, i) => {
        const s = props.strengths[t.id];
        const delta = props.baseline ? s - (props.baseline[t.id] ?? s) : 0;
        const arrow = delta > 0.03 ? "▲" : delta < -0.03 ? "▼" : "→";
        const arrowColor = delta > 0.03 ? "text-positive" : delta < -0.03 ? "text-negative" : "text-ink-faint";
        return (
          <div key={t.id} className="animate-rise" style={{ animationDelay: `${i * 55}ms` }}>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-ink font-medium">{t.name}</span>
              <span className="font-mono text-ink-soft">
                {s < 0.4 ? "weak" : s < 0.7 ? "mixed" : "strong"}
                {props.baseline && <span className={`ml-2 ${arrowColor}`}>{arrow}</span>}
                {props.researcher && (
                  <span className="ml-2 text-accent">
                    strength {s.toFixed(2)}
                    {props.conditions && ` · ${props.conditions[t.id]}`}
                  </span>
                )}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-black/30 border border-white/5 overflow-hidden">
              <div className="h-full rounded-full grad-bar shimmer transition-[width] duration-700 ease-spring-out" style={{ width: `${Math.round(s * 100)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* particle + ring burst on a landed reward */
function Burst() {
  const N = 12;
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <div className="absolute w-24 h-24 rounded-2xl border-2 border-amber-300/60 ring-pulse" />
      {Array.from({ length: N }).map((_, i) => {
        const a = (i / N) * Math.PI * 2;
        const d = 48;
        const tx = Math.cos(a) * d;
        const ty = Math.sin(a) * d;
        const c = i % 3 === 0 ? "bg-amber-300" : i % 3 === 1 ? "bg-brand3" : "bg-brand4";
        return (
          <span
            key={i}
            className={`absolute w-1.5 h-1.5 rounded-full spark ${c}`}
            style={{ ["--tx" as string]: `${tx}px`, ["--ty" as string]: `${ty}px` } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}

/* ---------- Entry ---------- */
function Entry(props: {
  name: string; setName: (v: string) => void;
  age: string; setAge: (v: string) => void; onStart: () => void;
}) {
  return (
    <Card>
      <label className="block">
        <span className="text-sm text-ink-soft">Display name</span>
        <input
          value={props.name}
          onChange={(e) => props.setName(e.target.value)}
          className="mt-1.5 w-full well rounded-xl px-3.5 py-2.5 text-ink placeholder:text-ink-faint outline-none transition focus:border-brand2 focus:ring-4 focus:ring-brand2/20"
          placeholder="e.g. Aisha"
        />
      </label>
      <div>
        <span className="text-sm text-ink-soft">Age bracket</span>
        <div className="mt-2 flex gap-2">
          {AGE_BRACKETS.map((b) => (
            <button
              key={b}
              onClick={() => props.setAge(b)}
              className={`font-mono text-sm px-4 py-2 rounded-xl border transition-[transform,color,border-color,background-color] duration-150 ease-spring-out active:scale-[0.96] ${
                props.age === b
                  ? "grad-fill text-white border-transparent font-semibold shadow-[0_8px_22px_-10px_rgb(var(--brand2)/0.8)]"
                  : "well text-ink-soft hover:text-ink hover:border-white/25"
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>
      <PrimaryButton onClick={props.onStart} disabled={!props.name.trim() || !props.age}>
        Start diagnostic
      </PrimaryButton>
      <p className="text-xs leading-relaxed text-ink-faint">
        A short diagnostic finds your weak spots — then personalized practice, refined each round.
      </p>
    </Card>
  );
}

/* ---------- Stage 1: Diagnostic ---------- */
function Diagnostic(props: {
  sessionId: string; age: string;
  onAnswer: (topicId: string, correct: boolean) => void;
  onDone: () => void;
}) {
  const questions = useRef(diagnosticQuestions()).current;
  const [di, setDi] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);

  const q = questions[di];
  const topic = topicById(q.topicId)!;

  function choose(idx: number) {
    if (picked !== null) return;
    setPicked(idx);
    const correct = idx === q.answer;
    props.onAnswer(q.topicId, correct);
    void logEvent({
      session_id: props.sessionId, age_bracket: props.age, stage: "diagnostic",
      topic: q.topicId, question_id: q.id, is_correct: correct, condition: null,
      strength_at_time: null, base_reward: null, awarded_reward: null, event_type: "answer",
    });
  }

  function next() {
    if (di + 1 >= questions.length) props.onDone();
    else { setDi((i) => i + 1); setPicked(null); }
  }

  return (
    <Card>
      <div className="space-y-3">
        <div className="flex items-center justify-between font-mono text-xs text-ink-soft">
          <span>Diagnostic · Q{di + 1}/{questions.length} · {topic.name}</span>
          <span className="text-ink-faint">measuring…</span>
        </div>
        <Progress value={(di + 1) / questions.length} />
      </div>
      <QuestionBody q={q} picked={picked} onChoose={choose} />
      {picked !== null && (
        <PrimaryButton onClick={next}>{di + 1 >= questions.length ? "See your profile" : "Next"}</PrimaryButton>
      )}
    </Card>
  );
}

/* ---------- Profile (measured strengths) ---------- */
function Profile(props: {
  strengths: Record<string, number>; conditions: Record<string, Condition>;
  researcher: boolean; onStart: () => void;
}) {
  return (
    <Card>
      <div>
        <h2 className="font-display font-bold text-2xl tracking-[-0.02em] text-ink">Here&apos;s what we measured.</h2>
        <p className="text-sm leading-relaxed text-ink-soft mt-1.5">Practice focuses on your weaker topics (top of the list) and re-measures as you go.</p>
      </div>
      <StrengthBars strengths={props.strengths} researcher={props.researcher} conditions={props.conditions} />
      <PrimaryButton onClick={props.onStart}>Start personalized practice</PrimaryButton>
      {props.researcher && (
        <p className="text-[11px] leading-relaxed font-mono text-ink-faint">
          Researcher: strength = share correct, shrunk toward 0.5. It updates live on every answer — more rounds → more confident bracketing.
        </p>
      )}
    </Card>
  );
}

/* ---------- Stage 2: Personalized practice (multi-round, live re-measure) ---------- */
function Practice(props: {
  sessionId: string; age: string;
  strengths: Record<string, number>; baseline: Record<string, number>;
  conditions: Record<string, Condition>;
  researcher: boolean;
  onAnswer: (topicId: string, correct: boolean) => void;
  onDone: (s: PracticeSummary) => void;
}) {
  const [round, setRound] = useState(1);
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [reward, setReward] = useState<RewardResult | null>(null);
  const [display, setDisplay] = useState("?");
  const [atRoundEnd, setAtRoundEnd] = useState(false);

  const total = useRef(0);
  const attempted = useRef(0);
  const continues = useRef(0);
  const byCondition = useRef({ fixed: 0, variable: 0 });

  // Fresh items are administered ONCE and drive the measurement. Items answered
  // WRONG go into `missed` and re-surface as flagged "Review" — so a weak topic
  // keeps coming back (spaced repetition) until mastered. A round is built by
  // WEAKEST TOPIC FIRST: that topic contributes its fresh items, then its review
  // items, before moving on — so the topic you keep failing leads every round.
  // Review re-attempts don't update the strength estimate (the answer was already
  // shown) and pay no points (so they can't game the reward economy).
  const seenFresh = useRef(new Set<string>());
  const missed = useRef(new Set<string>());
  function buildRound(str: Record<string, number>): RoundItem[] {
    const byWeakness = [...TOPICS].sort((a, b) => weakness(str[b.id]) - weakness(str[a.id]));
    const out: RoundItem[] = [];
    for (const t of byWeakness) {
      if (out.length >= ROUND_LEN) break;
      const fresh = practicePool().filter((qq) => qq.topicId === t.id && !seenFresh.current.has(qq.id));
      for (const qq of fresh) if (out.length < ROUND_LEN) out.push({ q: qq, mode: "fresh" });
      const review = QUESTIONS.filter((qq) => qq.topicId === t.id && missed.current.has(qq.id));
      for (const qq of review) if (out.length < ROUND_LEN && !out.some((r) => r.q.id === qq.id)) out.push({ q: qq, mode: "review" });
    }
    return out;
  }
  const queue = useRef<RoundItem[] | null>(null);
  if (queue.current === null) queue.current = buildRound(props.strengths);

  const item = queue.current[qi];
  const q = item.q;
  const mode = item.mode;
  const topic = topicById(q.topicId)!;
  const condition = props.conditions[q.topicId];
  const strength = props.strengths[q.topicId]; // live — reflects answers so far

  function choose(idx: number) {
    if (picked !== null) return;
    setPicked(idx);
    attempted.current += 1;
    const correct = idx === q.answer;

    if (mode === "review") {
      // Learning only: no measurement, no points. Correct = mastered → clear it.
      if (correct) missed.current.delete(q.id);
      void logEvent({
        session_id: props.sessionId, age_bracket: props.age, stage: "review",
        topic: q.topicId, question_id: q.id, is_correct: correct, condition: null,
        strength_at_time: null, base_reward: null, awarded_reward: null, event_type: "answer",
      });
      return;
    }

    // Fresh item — drives the measurement and the reward economy.
    seenFresh.current.add(q.id); // administered once
    props.onAnswer(q.topicId, correct); // live re-measure
    if (correct) missed.current.delete(q.id);
    else missed.current.add(q.id); // wrong → eligible for review
    const rw = correct ? computeReward(strength, condition) : null;

    void logEvent({
      session_id: props.sessionId, age_bracket: props.age, stage: "practice",
      topic: q.topicId, question_id: q.id, is_correct: correct, condition,
      strength_at_time: strength, base_reward: rw?.base ?? null,
      awarded_reward: rw?.awarded ?? null, event_type: "answer",
    });

    if (rw) {
      total.current += rw.awarded;
      byCondition.current[condition] += rw.awarded;
      revealReward(rw);
    }
  }

  function revealReward(rw: RewardResult) {
    void logEvent({
      session_id: props.sessionId, age_bracket: props.age, stage: "practice",
      topic: q.topicId, question_id: q.id, is_correct: true, condition,
      strength_at_time: strength, base_reward: rw.base, awarded_reward: rw.awarded,
      event_type: "reward_reveal",
    });
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (rw.condition === "fixed" || reduce) {
      window.setTimeout(() => { setDisplay(`+${rw.awarded}`); setReward(rw); }, reduce ? 0 : 260);
      return;
    }
    const delays = [60, 70, 85, 105, 130, 165, 210, 270, 350];
    let step = 0;
    const tick = () => {
      if (step < delays.length) {
        setDisplay(`+${Math.round(Math.random() * rw.base * 1.6)}`);
        window.setTimeout(tick, delays[step++]);
      } else { setDisplay(`+${rw.awarded}`); setReward(rw); }
    };
    tick();
  }

  function advance() {
    if (qi + 1 >= queue.current!.length) { setAtRoundEnd(true); return; }
    setQi(qi + 1); setPicked(null); setReward(null); setDisplay("?");
  }

  function nextRound() {
    continues.current += 1;
    void logEvent({
      session_id: props.sessionId, age_bracket: props.age, stage: "practice",
      topic: null, question_id: null, is_correct: null, condition: null,
      strength_at_time: null, base_reward: null, awarded_reward: null, event_type: "practice_continue",
    });
    queue.current = buildRound(props.strengths); // re-personalize from updated strengths
    setRound(round + 1); setQi(0); setPicked(null); setReward(null); setDisplay("?"); setAtRoundEnd(false);
  }

  function finish() {
    void logEvent({
      session_id: props.sessionId, age_bracket: props.age, stage: "practice",
      topic: null, question_id: null, is_correct: null, condition: null,
      strength_at_time: null, base_reward: null, awarded_reward: null, event_type: "practice_stop",
    });
    props.onDone({
      total: total.current, attempted: attempted.current, continues: continues.current,
      rounds: round, byCondition: { ...byCondition.current },
    });
  }

  if (atRoundEnd) {
    const freshLeft = practicePool().filter((qq) => !seenFresh.current.has(qq.id)).length;
    const reviewLeft = missed.current.size;
    const hasMore = freshLeft > 0 || reviewLeft > 0;
    return (
      <Card>
        <h2 className="font-display font-bold text-2xl tracking-[-0.02em] text-ink">Round {round} done — <span className="grad-text">{total.current} points</span>.</h2>
        <p className="text-sm leading-relaxed text-ink-soft">Your live picture, re-measured from this round. Arrows show change since the diagnostic.</p>
        <StrengthBars strengths={props.strengths} baseline={props.baseline} orderBy={props.baseline} researcher={props.researcher} conditions={props.conditions} />
        {hasMore ? (
          <div className="space-y-4">
            {freshLeft === 0 && reviewLeft > 0 && (
              <p className="text-xs leading-relaxed text-ink-faint">No fresh questions left. The next round is <b className="text-ink font-medium">Review</b> of items you missed on your weak topics — no points, and it doesn&apos;t change the measurement.</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <SecondaryButton onClick={finish}>See my results</SecondaryButton>
              <PrimaryButton onClick={nextRound}>{freshLeft > 0 ? "Practice another round" : "Review weak areas"}</PrimaryButton>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-ink-faint">Nothing left — every question cleared and all review items mastered. In the full system the AI would generate fresh items to keep going.</p>
            <PrimaryButton onClick={finish}>See my results</PrimaryButton>
          </div>
        )}
        {props.researcher && (
          <p className="text-[11px] leading-relaxed font-mono text-ink-faint">Researcher: strength updates only from fresh items (each administered once); review re-attempts keep the weak topic in rotation but are excluded from the measurement.</p>
        )}
      </Card>
    );
  }

  const answered = picked !== null;
  const correct = answered && picked === q.answer;

  return (
    <Card>
      <div className="space-y-3">
        <div className="flex items-center justify-between font-mono text-xs text-ink-soft">
          <span className="flex items-center gap-2">
            <span>Round {round} · Q{qi + 1}/{queue.current!.length} · {topic.name}</span>
            {mode === "review" && <span className="rounded-md bg-brand2/25 text-ink px-1.5 py-0.5 text-[10px] font-semibold tracking-wide border border-brand2/40">REVIEW</span>}
            {props.researcher && mode === "fresh" && <span className="text-accent">{condition} · strength {strength.toFixed(2)}</span>}
          </span>
          <span className="text-ink-soft">Points <b className="text-ink tabular-nums">{total.current}</b></span>
        </div>
        <Progress value={(qi + 1) / queue.current!.length} />
      </div>

      <QuestionBody q={q} picked={picked} onChoose={choose} />

      {answered && (
        <div className="pt-5 border-t border-white/10">
          {mode === "fresh" && correct ? (
            <div className="flex items-center gap-5">
              <div className="relative w-24 h-24 shrink-0">
                {reward && <Burst />}
                <div className={`w-24 h-24 rounded-2xl grid place-items-center border border-amber-300/40 bg-gradient-to-br from-amber-300/25 to-amber-500/[0.08] ${reward ? "shadow-[0_0_44px_-4px_rgba(251,191,36,0.65)]" : ""}`}>
                  <span className={`font-display font-bold text-3xl text-amber-200 tabular-nums ${reward ? "reward-num--land" : "reward-num--live"}`}>{display}</span>
                </div>
              </div>
              <p className="text-sm text-ink-soft">
                {reward ? "Reward earned." : "Opening…"}
                {props.researcher && reward && (
                  <span className="block text-[11px] font-mono text-accent mt-1">
                    {reward.condition === "fixed"
                      ? `fixed · +${reward.awarded} (flat)`
                      : `variable · base ${reward.base} → ${reward.hit ? "hit" : "miss"} (+${reward.awarded})`}
                  </span>
                )}
              </p>
            </div>
          ) : mode === "review" ? (
            <p className="text-sm leading-relaxed text-ink-soft">
              {correct ? (
                <>Mastered — cleared from your review list. <span className="text-ink-faint">(Review builds skill; the measurement moves only on fresh questions.)</span></>
              ) : (
                <>Not yet — we&apos;ll bring this one back. Correct answer highlighted.</>
              )}
            </p>
          ) : (
            <p className="text-sm leading-relaxed text-ink-soft">Not quite — no reward this time. Correct answer highlighted.</p>
          )}
          {(!(mode === "fresh" && correct) || reward) && <div className="mt-5"><PrimaryButton onClick={advance}>Next</PrimaryButton></div>}
        </div>
      )}
    </Card>
  );
}

/* ---------- shared question body ---------- */
function QuestionBody(props: { q: Question; picked: number | null; onChoose: (i: number) => void }) {
  const { q, picked } = props;
  const answered = picked !== null;
  return (
    <>
      <p className="text-lg leading-snug text-ink">{q.prompt}</p>
      <div className="grid gap-2.5">
        {q.options.map((opt, idx) => {
          const state = !answered ? "idle" : idx === q.answer ? "right" : idx === picked ? "wrong" : "dim";
          return (
            <button
              key={idx}
              onClick={() => props.onChoose(idx)}
              disabled={answered}
              className={
                "text-left px-4 py-3.5 rounded-xl border outline-none transition-[transform,color,border-color,background-color,box-shadow] duration-150 ease-spring-out focus-visible:ring-4 focus-visible:ring-brand2/25 " +
                {
                  idle: "well text-ink hover:border-white/25 hover:bg-white/[0.06] hover:-translate-y-0.5 active:scale-[0.99]",
                  right: "bg-positive/15 border-positive/60 text-positive shadow-[0_0_28px_-8px_rgb(var(--positive)/0.6)]",
                  wrong: "bg-negative/15 border-negative/60 text-negative",
                  dim: "well text-ink-soft opacity-40",
                }[state]
              }
            >
              {opt}
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ---------- Final measurement: strong & weak areas ---------- */
function Results(props: {
  name: string; strengths: Record<string, number>; baseline: Record<string, number>;
  result: PracticeSummary; researcher: boolean;
}) {
  const r = props.result;
  return (
    <Card>
      <h2 className="font-display font-bold text-2xl tracking-[-0.02em] text-ink">Your strong &amp; weak areas</h2>
      <p className="text-sm leading-relaxed text-ink-soft">
        Measured live across the diagnostic and {r.rounds} practice round{r.rounds === 1 ? "" : "s"}. Arrows show change since the diagnostic.
      </p>
      <StrengthBars strengths={props.strengths} baseline={props.baseline} orderBy={props.baseline} researcher={props.researcher} />
      <div className="pt-5 border-t border-white/10 text-sm leading-relaxed text-ink-soft">
        <b className="grad-text font-bold">{r.total}</b> points · <b className="text-ink font-medium">{r.attempted}</b> questions ·
        chose to keep practicing <b className="text-ink font-medium">{r.continues}</b> time{r.continues === 1 ? "" : "s"}.
        {props.researcher && (
          <span className="block mt-1 text-ink-faint">Voluntary persistence — not the score — is what the pilot measures.</span>
        )}
      </div>
      {props.researcher && (
        <div className="grid grid-cols-2 gap-3 pt-5 border-t border-white/10">
          <div className="well rounded-2xl p-4">
            <p className="font-mono text-xs uppercase tracking-wider text-ink-soft">Variable topics</p>
            <p className="font-display font-bold text-2xl grad-text tabular-nums mt-1">{r.byCondition.variable}</p>
          </div>
          <div className="well rounded-2xl p-4">
            <p className="font-mono text-xs uppercase tracking-wider text-ink-soft">Fixed topics</p>
            <p className="font-display font-bold text-2xl text-ink tabular-nums mt-1">{r.byCondition.fixed}</p>
          </div>
          <p className="col-span-2 text-[11px] leading-relaxed font-mono text-ink-faint">
            Researcher: strengths accumulated live (share-correct, shrunk). Condition hidden; compare persistence across fixed vs variable and by age bracket.
          </p>
        </div>
      )}
    </Card>
  );
}
