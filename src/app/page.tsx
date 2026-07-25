"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TOPICS, topicById } from "@/data/topics";
import { QUESTIONS, type Question } from "@/data/questions";
import { computeReward, type RewardResult } from "@/lib/rewardEngine";
import { logEvent } from "@/lib/logEvent";

type Phase = "entry" | "quiz" | "summary";
const AGE_BRACKETS = ["22–29", "30–39", "40+"] as const;

interface Outcome {
  question: Question;
  correct: boolean;
  reward: RewardResult | null;
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("entry");
  const [name, setName] = useState("");
  const [age, setAge] = useState<string>("");
  const sessionId = useMemo(
    () => (typeof crypto !== "undefined" ? crypto.randomUUID() : String(Math.random())),
    [],
  );

  const [qi, setQi] = useState(0);
  const [total, setTotal] = useState(0);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);

  function start() {
    if (!name.trim() || !age) return;
    void logEvent({
      session_id: sessionId, age_bracket: age, topic: null, question_id: null,
      is_correct: null, condition: null, strength_at_time: null,
      base_reward: null, awarded_reward: null, event_type: "quiz_start",
    });
    setPhase("quiz");
  }

  function recordAnswer(o: Outcome) {
    setOutcomes((prev) => [...prev, o]);
    if (o.reward) setTotal((t) => t + o.reward!.awarded);
  }

  function next() {
    if (qi + 1 >= QUESTIONS.length) {
      void logEvent({
        session_id: sessionId, age_bracket: age, topic: null, question_id: null,
        is_correct: null, condition: null, strength_at_time: null,
        base_reward: null, awarded_reward: total, event_type: "quiz_end",
      });
      setPhase("summary");
    } else {
      setQi((i) => i + 1);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-xl">
        <header className="mb-8">
          <p className="font-mono text-xs tracking-[0.2em] uppercase text-accent">
            Digital Transformation · variable-reward pilot
          </p>
          <h1 className="font-display text-3xl mt-2">The reward reads your weak spots.</h1>
        </header>

        {phase === "entry" && (
          <Entry name={name} setName={setName} age={age} setAge={setAge} onStart={start} />
        )}
        {phase === "quiz" && (
          <Quiz
            key={qi}
            question={QUESTIONS[qi]}
            index={qi}
            total={total}
            sessionId={sessionId}
            age={age}
            onRecord={recordAnswer}
            onNext={next}
          />
        )}
        {phase === "summary" && <Summary total={total} outcomes={outcomes} name={name} />}
      </div>
    </main>
  );
}

/* ---------- Entry ---------- */
function Entry(props: {
  name: string; setName: (v: string) => void;
  age: string; setAge: (v: string) => void; onStart: () => void;
}) {
  return (
    <section className="bg-surface border border-line rounded-2xl p-6 space-y-5">
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
      <button
        onClick={props.onStart}
        disabled={!props.name.trim() || !props.age}
        className="w-full bg-accent text-ground font-semibold rounded-lg py-3 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        Start
      </button>
      <p className="text-xs text-ink-soft/70">
        Anonymous session. Events log to the console (or Supabase if configured).
      </p>
    </section>
  );
}

/* ---------- Quiz ---------- */
function Quiz(props: {
  question: Question; index: number; total: number;
  sessionId: string; age: string;
  onRecord: (o: Outcome) => void; onNext: () => void;
}) {
  const topic = topicById(props.question.topicId)!;
  const [picked, setPicked] = useState<number | null>(null);
  const [reward, setReward] = useState<RewardResult | null>(null);
  const [display, setDisplay] = useState<string>("?");
  const rolling = useRef(false);

  function choose(idx: number) {
    if (picked !== null) return;
    setPicked(idx);
    const correct = idx === props.question.answer;
    const rw = correct ? computeReward(topic.strength, topic.condition) : null;

    void logEvent({
      session_id: props.sessionId, age_bracket: props.age, topic: topic.id,
      question_id: props.question.id, is_correct: correct, condition: topic.condition,
      strength_at_time: topic.strength, base_reward: rw?.base ?? null,
      awarded_reward: rw?.awarded ?? null, event_type: "answer",
    });

    props.onRecord({ question: props.question, correct, reward: rw });
    if (rw) revealReward(rw);
  }

  function revealReward(rw: RewardResult) {
    void logEvent({
      session_id: props.sessionId, age_bracket: props.age, topic: topic.id,
      question_id: props.question.id, is_correct: true, condition: topic.condition,
      strength_at_time: topic.strength, base_reward: rw.base,
      awarded_reward: rw.awarded, event_type: "reward_reveal",
    });

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Fixed = no suspense (deterministic, that's the point). Variable = brief roll.
    if (rw.condition === "fixed" || reduce) {
      setDisplay(`+${rw.awarded}`);
      setReward(rw);
      return;
    }
    rolling.current = true;
    let n = 0;
    const spin = setInterval(() => {
      setDisplay(`+${Math.round(Math.random() * rw.base * 1.5)}`);
      if (++n > 8) {
        clearInterval(spin);
        setDisplay(`+${rw.awarded}`);
        setReward(rw);
        rolling.current = false;
      }
    }, 55);
  }

  const answered = picked !== null;
  const correct = answered && picked === props.question.answer;

  return (
    <section className="bg-surface border border-line rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between font-mono text-xs text-ink-soft">
        <span>
          Q{props.index + 1}/{QUESTIONS.length} · {topic.name}
          <span className="ml-2 text-accent">[{topic.condition}]</span>
        </span>
        <span>Total <b className="text-ink tabular-nums">{props.total}</b></span>
      </div>

      <p className="text-lg">{props.question.prompt}</p>

      <div className="grid gap-2">
        {props.question.options.map((opt, idx) => {
          const isAnswer = idx === props.question.answer;
          const state = !answered
            ? "idle"
            : isAnswer
            ? "right"
            : idx === picked
            ? "wrong"
            : "dim";
          return (
            <button
              key={idx}
              onClick={() => choose(idx)}
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

      {answered && (
        <div className="pt-2 border-t border-line">
          {correct ? (
            <div className="flex items-center gap-4">
              <div
                className="w-24 h-24 rounded-xl grid place-items-center border-2 border-accent/60 shrink-0"
                style={{ background: "linear-gradient(150deg, rgba(240,170,60,.18), transparent)" }}
              >
                <span className="font-display font-bold text-3xl text-accent tabular-nums">
                  {display}
                </span>
              </div>
              <p className="text-sm text-ink-soft">
                {topic.condition === "variable" ? (
                  <>Big base, <b className="text-ink">genuinely uncertain</b> — the charge is in the not-knowing.</>
                ) : (
                  <>Fixed schedule — <b className="text-ink">the same, every time</b>. Low charge, by design.</>
                )}
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink-soft">
              Not quite — no reward this time. The right answer is highlighted.
            </p>
          )}
          <button
            onClick={props.onNext}
            className="mt-4 w-full bg-accent text-ground font-semibold rounded-lg py-2.5 transition"
          >
            {props.index + 1 >= QUESTIONS.length ? "See summary" : "Next question"}
          </button>
        </div>
      )}
    </section>
  );
}

/* ---------- Summary ---------- */
function Summary(props: { total: number; outcomes: Outcome[]; name: string }) {
  const byCondition = (cond: "fixed" | "variable") =>
    props.outcomes.filter((o) => o.reward && topicById(o.question.topicId)!.condition === cond);
  const sum = (os: Outcome[]) => os.reduce((s, o) => s + (o.reward?.awarded ?? 0), 0);

  const variable = byCondition("variable");
  const fixed = byCondition("fixed");
  const correct = props.outcomes.filter((o) => o.correct).length;

  return (
    <section className="bg-surface border border-line rounded-2xl p-6 space-y-5">
      <h2 className="font-display text-2xl">Nice work, {props.name || "learner"}.</h2>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-5xl text-accent tabular-nums">{props.total}</span>
        <span className="text-ink-soft">points · {correct}/{props.outcomes.length} correct</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-ground border border-line rounded-xl p-4">
          <p className="font-mono text-xs uppercase tracking-wider text-ink-soft">Variable topics</p>
          <p className="font-display text-2xl text-accent tabular-nums mt-1">{sum(variable)}</p>
          <p className="text-xs text-ink-soft mt-1">{variable.length} rewards, uncertain payout</p>
        </div>
        <div className="bg-ground border border-line rounded-xl p-4">
          <p className="font-mono text-xs uppercase tracking-wider text-ink-soft">Fixed topics</p>
          <p className="font-display text-2xl text-ink tabular-nums mt-1">{sum(fixed)}</p>
          <p className="text-xs text-ink-soft mt-1">{fixed.length} rewards, flat payout</p>
        </div>
      </div>
      <p className="text-xs text-ink-soft/80">
        This session logged one event per interaction (open the console to see them). In the pilot,
        the same instrument compares your engagement under the fixed vs. variable schedule — you as
        your own control.
      </p>
    </section>
  );
}
