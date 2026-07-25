"use client";

import { useMemo, useRef, useState } from "react";
import { TOPICS, topicById } from "@/data/topics";
import { diagnosticQuestions, practicePool, type Question } from "@/data/questions";
import { computeReward, type RewardResult } from "@/lib/rewardEngine";
import { inferStrengths, weakness, type TopicTally } from "@/lib/profile";
import { logEvent } from "@/lib/logEvent";

type Phase = "entry" | "diagnostic" | "profile" | "practice" | "summary";
const AGE_BRACKETS = ["22–29", "30–39", "40+"] as const;
const INITIAL_PRACTICE = 4; // questions before the first "keep practicing?" choice

export default function Home() {
  const [phase, setPhase] = useState<Phase>("entry");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [researcher, setResearcher] = useState(false);
  const [strengths, setStrengths] = useState<Record<string, number>>({});
  const [result, setResult] = useState<PracticeSummary | null>(null);

  const sessionId = useMemo(
    () => (typeof crypto !== "undefined" ? crypto.randomUUID() : String(Math.random())),
    [],
  );

  function start() {
    if (!name.trim() || !age) return;
    void logEvent(base("quiz_start", { stage: "diagnostic" }));
    setPhase("diagnostic");
  }

  function base(event_type: Parameters<typeof logEvent>[0]["event_type"], over: Partial<GE> = {}): GE {
    return {
      session_id: sessionId, age_bracket: age, stage: null, topic: null,
      question_id: null, is_correct: null, condition: null, strength_at_time: null,
      base_reward: null, awarded_reward: null, event_type, ...over,
    };
  }

  function onDiagnosticDone(tallies: Record<string, TopicTally>) {
    const s = inferStrengths(tallies);
    setStrengths(s);
    void logEvent(base("diagnostic_complete", { stage: "diagnostic" }));
    setPhase("profile");
  }

  function onPracticeDone(summary: PracticeSummary) {
    setResult(summary);
    void logEvent(base("quiz_end", { stage: "practice", awarded_reward: summary.total }));
    setPhase("summary");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <ResearcherToggle on={researcher} setOn={setResearcher} />
      <div className="w-full max-w-xl">
        <header className="mb-8">
          <p className="font-mono text-xs tracking-[0.2em] uppercase text-accent">
            Digital Transformation · adaptive practice
          </p>
          <h1 className="font-display text-3xl mt-2">Practice that reads your weak spots.</h1>
        </header>

        {phase === "entry" && (
          <Entry name={name} setName={setName} age={age} setAge={setAge} onStart={start} />
        )}
        {phase === "diagnostic" && (
          <Diagnostic sessionId={sessionId} age={age} onDone={onDiagnosticDone} />
        )}
        {phase === "profile" && (
          <Profile strengths={strengths} researcher={researcher} onStart={() => setPhase("practice")} />
        )}
        {phase === "practice" && (
          <Practice
            sessionId={sessionId}
            age={age}
            strengths={strengths}
            researcher={researcher}
            onDone={onPracticeDone}
          />
        )}
        {phase === "summary" && result && (
          <Summary name={name} result={result} researcher={researcher} />
        )}
      </div>
    </main>
  );
}

type GE = Parameters<typeof logEvent>[0];

interface PracticeSummary {
  total: number;
  attempted: number;
  continues: number;
  byCondition: { fixed: number; variable: number };
}

/* ---------- shared bits ---------- */
function ResearcherToggle(props: { on: boolean; setOn: (v: boolean) => void }) {
  return (
    <label className="fixed top-3 right-3 flex items-center gap-2 font-mono text-[11px] text-ink-soft/70 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={props.on}
        onChange={(e) => props.setOn(e.target.checked)}
        className="accent-accent"
      />
      Researcher view
    </label>
  );
}

function Card(props: { children: React.ReactNode }) {
  return (
    <section className="bg-surface border border-line rounded-2xl p-6 space-y-5">{props.children}</section>
  );
}

function PrimaryButton(props: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      className="w-full bg-accent text-ground font-semibold rounded-lg py-3 disabled:opacity-40 disabled:cursor-not-allowed transition"
    >
      {props.children}
    </button>
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
          className="mt-1 w-full bg-ground border border-line rounded-lg px-3 py-2 outline-none focus:border-accent"
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
              className={`font-mono text-sm px-4 py-2 rounded-lg border transition ${
                props.age === b
                  ? "bg-accent text-ground border-accent font-semibold"
                  : "bg-ground text-ink-soft border-line hover:border-accent"
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
      <p className="text-xs text-ink-soft/70">
        First a short diagnostic (same for everyone) to find your weak spots — then personalized practice.
      </p>
    </Card>
  );
}

/* ---------- Stage 1: Diagnostic ---------- */
function Diagnostic(props: {
  sessionId: string; age: string;
  onDone: (tallies: Record<string, TopicTally>) => void;
}) {
  const questions = useMemo(() => diagnosticQuestions(), []);
  const [di, setDi] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const tallies = useRef<Record<string, TopicTally>>(
    Object.fromEntries(TOPICS.map((t) => [t.id, { correct: 0, total: 0 }])),
  );

  const q = questions[di];
  const topic = topicById(q.topicId)!;

  function choose(idx: number) {
    if (picked !== null) return;
    setPicked(idx);
    const correct = idx === q.answer;
    const tally = tallies.current[q.topicId];
    tally.total += 1;
    if (correct) tally.correct += 1;

    void logEvent({
      session_id: props.sessionId, age_bracket: props.age, stage: "diagnostic",
      topic: q.topicId, question_id: q.id, is_correct: correct, condition: null,
      strength_at_time: null, base_reward: null, awarded_reward: null, event_type: "answer",
    });
  }

  function next() {
    if (di + 1 >= questions.length) props.onDone(tallies.current);
    else {
      setDi((i) => i + 1);
      setPicked(null);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between font-mono text-xs text-ink-soft">
        <span>Diagnostic · Q{di + 1}/{questions.length} · {topic.name}</span>
        <span className="text-ink-soft/60">measuring…</span>
      </div>
      <QuestionBody q={q} picked={picked} onChoose={choose} />
      {picked !== null && (
        <PrimaryButton onClick={next}>
          {di + 1 >= questions.length ? "See your profile" : "Next"}
        </PrimaryButton>
      )}
    </Card>
  );
}

/* ---------- Profile (the measured strengths) ---------- */
function Profile(props: {
  strengths: Record<string, number>; researcher: boolean; onStart: () => void;
}) {
  const sorted = [...TOPICS].sort((a, b) => props.strengths[a.id] - props.strengths[b.id]);
  return (
    <Card>
      <div>
        <h2 className="font-display text-2xl">Here's what we measured.</h2>
        <p className="text-sm text-ink-soft mt-1">
          Practice will focus on your weaker topics (top of the list).
        </p>
      </div>
      <div className="space-y-3">
        {sorted.map((t) => {
          const s = props.strengths[t.id];
          return (
            <div key={t.id}>
              <div className="flex justify-between text-sm mb-1">
                <span>{t.name}</span>
                <span className="font-mono text-ink-soft">
                  {s < 0.4 ? "weak" : s < 0.7 ? "mixed" : "strong"}
                  {props.researcher && (
                    <span className="ml-2 text-accent">
                      {s.toFixed(2)} · [{t.condition}]
                    </span>
                  )}
                </span>
              </div>
              <div className="h-2 bg-ground rounded-full overflow-hidden">
                <div className="h-full bg-accent rounded-full" style={{ width: `${Math.round(s * 100)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <PrimaryButton onClick={props.onStart}>Start personalized practice</PrimaryButton>
      {props.researcher && (
        <p className="text-[11px] font-mono text-ink-soft/70">
          Researcher: strength = share correct, shrunk toward 0.5 (few items → less confidence).
          Reward magnitude scales with weakness; fixed/variable is the hidden manipulation.
        </p>
      )}
    </Card>
  );
}

/* ---------- Stage 2: Personalized practice ---------- */
function Practice(props: {
  sessionId: string; age: string;
  strengths: Record<string, number>; researcher: boolean;
  onDone: (s: PracticeSummary) => void;
}) {
  // Weakest-topic questions first — the visible personalization.
  const queue = useMemo(
    () =>
      [...practicePool()].sort(
        (a, b) => weakness(props.strengths[b.topicId]) - weakness(props.strengths[a.topicId]),
      ),
    [props.strengths],
  );

  const [pi, setPi] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [reward, setReward] = useState<RewardResult | null>(null);
  const [display, setDisplay] = useState("?");
  const [gate, setGate] = useState(false);

  const total = useRef(0);
  const attempted = useRef(0);
  const continues = useRef(0);
  const byCondition = useRef({ fixed: 0, variable: 0 });

  const q = queue[pi];
  const topic = topicById(q.topicId)!;
  const strength = props.strengths[q.topicId];

  function choose(idx: number) {
    if (picked !== null) return;
    setPicked(idx);
    attempted.current += 1;
    const correct = idx === q.answer;
    const rw = correct ? computeReward(strength, topic.condition) : null;

    void logEvent({
      session_id: props.sessionId, age_bracket: props.age, stage: "practice",
      topic: q.topicId, question_id: q.id, is_correct: correct, condition: topic.condition,
      strength_at_time: strength, base_reward: rw?.base ?? null,
      awarded_reward: rw?.awarded ?? null, event_type: "answer",
    });

    if (rw) {
      total.current += rw.awarded;
      byCondition.current[topic.condition] += rw.awarded;
      revealReward(rw);
    }
  }

  function revealReward(rw: RewardResult) {
    void logEvent({
      session_id: props.sessionId, age_bracket: props.age, stage: "practice",
      topic: q.topicId, question_id: q.id, is_correct: true, condition: topic.condition,
      strength_at_time: strength, base_reward: rw.base, awarded_reward: rw.awarded,
      event_type: "reward_reveal",
    });

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Fixed = predictable (short, no roll). Variable = decelerating suspense roll.
    if (rw.condition === "fixed" || reduce) {
      window.setTimeout(() => { setDisplay(`+${rw.awarded}`); setReward(rw); }, reduce ? 0 : 260);
      return;
    }
    const delays = [60, 70, 85, 105, 130, 165, 210, 270, 350]; // decelerating ~1.4s
    let step = 0;
    const tick = () => {
      if (step < delays.length) {
        setDisplay(`+${Math.round(Math.random() * rw.base * 1.6)}`);
        window.setTimeout(tick, delays[step++]);
      } else {
        setDisplay(`+${rw.awarded}`);
        setReward(rw);
      }
    };
    tick();
  }

  function advance() {
    const nextIdx = pi + 1;
    // Offer a voluntary "keep going?" choice — the engagement signal.
    if (nextIdx === INITIAL_PRACTICE && nextIdx < queue.length) {
      setGate(true);
      return;
    }
    if (nextIdx >= queue.length) {
      finish();
      return;
    }
    step(nextIdx);
  }

  function step(idx: number) {
    setPi(idx);
    setPicked(null);
    setReward(null);
    setDisplay("?");
  }

  function keepGoing() {
    continues.current += 1;
    void logEvent({
      session_id: props.sessionId, age_bracket: props.age, stage: "practice",
      topic: null, question_id: null, is_correct: null, condition: null,
      strength_at_time: null, base_reward: null, awarded_reward: null,
      event_type: "practice_continue",
    });
    setGate(false);
    step(INITIAL_PRACTICE);
  }

  function stopNow() {
    void logEvent({
      session_id: props.sessionId, age_bracket: props.age, stage: "practice",
      topic: null, question_id: null, is_correct: null, condition: null,
      strength_at_time: null, base_reward: null, awarded_reward: null,
      event_type: "practice_stop",
    });
    finish();
  }

  function finish() {
    props.onDone({
      total: total.current,
      attempted: attempted.current,
      continues: continues.current,
      byCondition: { ...byCondition.current },
    });
  }

  if (gate) {
    return (
      <Card>
        <h2 className="font-display text-2xl">Nice run — {total.current} points so far.</h2>
        <p className="text-sm text-ink-soft">
          You've cleared the core set. Want to keep practicing your weak areas, or wrap up?
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={stopNow} className="bg-ground border border-line rounded-lg py-3 text-ink-soft hover:border-accent transition">
            Wrap up
          </button>
          <PrimaryButton onClick={keepGoing}>Keep practicing</PrimaryButton>
        </div>
        {props.researcher && (
          <p className="text-[11px] font-mono text-ink-soft/70">
            Researcher: this voluntary choice IS the engagement DV — did variable-topic reward pull them onward?
          </p>
        )}
      </Card>
    );
  }

  const answered = picked !== null;
  const correct = answered && picked === q.answer;

  return (
    <Card>
      <div className="flex items-center justify-between font-mono text-xs text-ink-soft">
        <span>
          Practice · {topic.name}
          {props.researcher && <span className="ml-2 text-accent">[{topic.condition}] s={strength.toFixed(2)}</span>}
        </span>
        <span>Points <b className="text-ink tabular-nums">{total.current}</b></span>
      </div>

      <QuestionBody q={q} picked={picked} onChoose={choose} />

      {answered && (
        <div className="pt-2 border-t border-line">
          {correct ? (
            <div className="flex items-center gap-4">
              <div
                className="w-24 h-24 rounded-xl grid place-items-center border-2 border-accent/60 shrink-0"
                style={{ background: "linear-gradient(150deg, rgba(240,170,60,.18), transparent)" }}
              >
                <span className="font-display font-bold text-3xl text-accent tabular-nums">{display}</span>
              </div>
              <p className="text-sm text-ink-soft">
                {reward ? "Reward earned." : "Opening…"}
                {props.researcher && reward && (
                  <span className="block text-[11px] font-mono text-accent mt-1">
                    {topic.condition} · base {reward.base} · {reward.hit ? "hit" : "miss"}
                  </span>
                )}
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink-soft">Not quite — no reward this time. Correct answer highlighted.</p>
          )}
          {(reward || !correct) && <div className="mt-4"><PrimaryButton onClick={advance}>Next</PrimaryButton></div>}
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
      <p className="text-lg">{q.prompt}</p>
      <div className="grid gap-2">
        {q.options.map((opt, idx) => {
          const state = !answered
            ? "idle"
            : idx === q.answer
            ? "right"
            : idx === picked
            ? "wrong"
            : "dim";
          return (
            <button
              key={idx}
              onClick={() => props.onChoose(idx)}
              disabled={answered}
              className={
                "text-left px-4 py-3 rounded-lg border transition " +
                {
                  idle: "bg-ground border-line hover:border-accent",
                  right: "bg-emerald-500/15 border-emerald-500 text-emerald-200",
                  wrong: "bg-red-500/15 border-red-500 text-red-200",
                  dim: "bg-ground border-line opacity-50",
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

/* ---------- Summary ---------- */
function Summary(props: { name: string; result: PracticeSummary; researcher: boolean }) {
  const r = props.result;
  return (
    <Card>
      <h2 className="font-display text-2xl">Nice work, {props.name || "learner"}.</h2>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-5xl text-accent tabular-nums">{r.total}</span>
        <span className="text-ink-soft">points · {r.attempted} questions practiced</span>
      </div>
      <p className="text-sm text-ink-soft">
        You chose to keep practicing <b className="text-ink">{r.continues}</b> time{r.continues === 1 ? "" : "s"}.
        That voluntary persistence — not the score — is what the pilot measures.
      </p>
      {props.researcher && (
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-line">
          <div className="bg-ground border border-line rounded-xl p-4">
            <p className="font-mono text-xs uppercase tracking-wider text-ink-soft">Variable topics</p>
            <p className="font-display text-2xl text-accent tabular-nums mt-1">{r.byCondition.variable}</p>
          </div>
          <div className="bg-ground border border-line rounded-xl p-4">
            <p className="font-mono text-xs uppercase tracking-wider text-ink-soft">Fixed topics</p>
            <p className="font-display text-2xl text-ink tabular-nums mt-1">{r.byCondition.fixed}</p>
          </div>
          <p className="col-span-2 text-[11px] font-mono text-ink-soft/70">
            Researcher: within-subject, condition hidden from the student. Compare persistence &amp; return across
            fixed vs variable topics, and across age brackets — points are EV-matched, so any behavior gap is the uncertainty.
          </p>
        </div>
      )}
    </Card>
  );
}
