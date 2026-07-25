"use client";

import { useRef, useState } from "react";
import { TOPICS, topicById, assignConditions } from "@/data/topics";
import { diagnosticQuestions, practicePool, type Question } from "@/data/questions";
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
    <label className="fixed top-3 right-3 flex items-center gap-2 font-mono text-[11px] text-ink-soft/70 cursor-pointer select-none">
      <input type="checkbox" checked={props.on} onChange={(e) => props.setOn(e.target.checked)} className="accent-accent" />
      Researcher view
    </label>
  );
}

function Card(props: { children: React.ReactNode }) {
  return <section className="bg-surface border border-line rounded-2xl p-6 space-y-5">{props.children}</section>;
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

function StrengthBars(props: { strengths: Record<string, number>; baseline?: Record<string, number>; researcher: boolean; conditions?: Record<string, Condition> }) {
  const sorted = [...TOPICS].sort((a, b) => props.strengths[a.id] - props.strengths[b.id]);
  return (
    <div className="space-y-3">
      {sorted.map((t) => {
        const s = props.strengths[t.id];
        const delta = props.baseline ? s - (props.baseline[t.id] ?? s) : 0;
        const arrow = delta > 0.03 ? "▲" : delta < -0.03 ? "▼" : "→";
        const arrowColor = delta > 0.03 ? "text-emerald-400" : delta < -0.03 ? "text-red-400" : "text-ink-soft/60";
        return (
          <div key={t.id}>
            <div className="flex justify-between text-sm mb-1">
              <span>{t.name}</span>
              <span className="font-mono text-ink-soft">
                {s < 0.4 ? "weak" : s < 0.7 ? "mixed" : "strong"}
                {props.baseline && <span className={`ml-2 ${arrowColor}`}>{arrow}</span>}
                {props.researcher && (
                  <span className="ml-2 text-accent">
                    {s.toFixed(2)}
                    {props.conditions && ` · [${props.conditions[t.id]}]`}
                  </span>
                )}
              </span>
            </div>
            <div className="h-2 bg-ground rounded-full overflow-hidden">
              <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${Math.round(s * 100)}%` }} />
            </div>
          </div>
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
      <div className="flex items-center justify-between font-mono text-xs text-ink-soft">
        <span>Diagnostic · Q{di + 1}/{questions.length} · {topic.name}</span>
        <span className="text-ink-soft/60">measuring…</span>
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
        <h2 className="font-display text-2xl">Here's what we measured.</h2>
        <p className="text-sm text-ink-soft mt-1">Practice focuses on your weaker topics (top of the list) and re-measures as you go.</p>
      </div>
      <StrengthBars strengths={props.strengths} researcher={props.researcher} conditions={props.conditions} />
      <PrimaryButton onClick={props.onStart}>Start personalized practice</PrimaryButton>
      {props.researcher && (
        <p className="text-[11px] font-mono text-ink-soft/70">
          Researcher: strength = share correct, shrunk toward 0.5. It updates live on every answer — more rounds → more confident bracketing.
        </p>
      )}
    </Card>
  );
}

/* ---------- Stage 2: Personalized practice (multi-round, live re-measure) ---------- */
function Practice(props: {
  sessionId: string; age: string;
  strengths: Record<string, number>; conditions: Record<string, Condition>;
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

  // Each round's questions are snapshotted at round start from the CURRENT strengths
  // (weakest topics first) — so later rounds re-personalize as the student improves.
  function buildRound(str: Record<string, number>): Question[] {
    const pool = [...practicePool()].sort((a, b) => weakness(str[b.topicId]) - weakness(str[a.topicId]));
    return Array.from({ length: ROUND_LEN }, (_, i) => pool[i % pool.length]);
  }
  const queue = useRef<Question[] | null>(null);
  if (queue.current === null) queue.current = buildRound(props.strengths);

  const q = queue.current[qi];
  const topic = topicById(q.topicId)!;
  const condition = props.conditions[q.topicId];
  const strength = props.strengths[q.topicId]; // live — reflects answers so far

  function choose(idx: number) {
    if (picked !== null) return;
    setPicked(idx);
    attempted.current += 1;
    const correct = idx === q.answer;
    props.onAnswer(q.topicId, correct); // live re-measure
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
    if (qi + 1 >= ROUND_LEN) { setAtRoundEnd(true); return; }
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
    return (
      <Card>
        <h2 className="font-display text-2xl">Round {round} done — {total.current} points.</h2>
        <p className="text-sm text-ink-soft">Here's your live picture. Keep going to re-measure and re-focus, or see your full results.</p>
        <StrengthBars strengths={props.strengths} researcher={props.researcher} conditions={props.conditions} />
        <div className="grid grid-cols-2 gap-3">
          <button onClick={finish} className="bg-ground border border-line rounded-lg py-3 text-ink-soft hover:border-accent transition">See my results</button>
          <PrimaryButton onClick={nextRound}>Practice another round</PrimaryButton>
        </div>
        {props.researcher && (
          <p className="text-[11px] font-mono text-ink-soft/70">Researcher: the continue/stop choice is the engagement DV; each round re-personalizes from the updated strengths.</p>
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
          Round {round} · Q{qi + 1}/{ROUND_LEN} · {topic.name}
          {props.researcher && <span className="ml-2 text-accent">[{condition}] s={strength.toFixed(2)}</span>}
        </span>
        <span>Points <b className="text-ink tabular-nums">{total.current}</b></span>
      </div>

      <QuestionBody q={q} picked={picked} onChoose={choose} />

      {answered && (
        <div className="pt-2 border-t border-line">
          {correct ? (
            <div className="flex items-center gap-4">
              <div className="w-24 h-24 rounded-xl grid place-items-center border-2 border-accent/60 shrink-0"
                style={{ background: "linear-gradient(150deg, rgba(240,170,60,.18), transparent)" }}>
                <span className="font-display font-bold text-3xl text-accent tabular-nums">{display}</span>
              </div>
              <p className="text-sm text-ink-soft">
                {reward ? "Reward earned." : "Opening…"}
                {props.researcher && reward && (
                  <span className="block text-[11px] font-mono text-accent mt-1">{condition} · base {reward.base} · {reward.hit ? "hit" : "miss"}</span>
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
          const state = !answered ? "idle" : idx === q.answer ? "right" : idx === picked ? "wrong" : "dim";
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

/* ---------- Final measurement: strong & weak areas ---------- */
function Results(props: {
  name: string; strengths: Record<string, number>; baseline: Record<string, number>;
  result: PracticeSummary; researcher: boolean;
}) {
  const r = props.result;
  return (
    <Card>
      <h2 className="font-display text-2xl">Your strong &amp; weak areas</h2>
      <p className="text-sm text-ink-soft">
        Measured live across the diagnostic and {r.rounds} practice round{r.rounds === 1 ? "" : "s"}. Arrows show change since the diagnostic.
      </p>
      <StrengthBars strengths={props.strengths} baseline={props.baseline} researcher={props.researcher} />
      <div className="pt-2 border-t border-line text-sm text-ink-soft">
        <b className="text-ink">{r.total}</b> points · <b className="text-ink">{r.attempted}</b> questions ·
        chose to keep practicing <b className="text-ink">{r.continues}</b> time{r.continues === 1 ? "" : "s"}.
        <span className="block mt-1 text-ink-soft/80">Voluntary persistence — not the score — is what the pilot measures.</span>
      </div>
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
            Researcher: strengths accumulated live (share-correct, shrunk). Condition hidden; compare persistence across fixed vs variable and by age bracket.
          </p>
        </div>
      )}
    </Card>
  );
}
