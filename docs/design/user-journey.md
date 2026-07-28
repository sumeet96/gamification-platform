# User Journey: Student Experience (28 Jul 2026, updated same day for authentication)

As of commit e0b3fd9 plus the authentication work added later on 28 Jul 2026, the application is a single-session adaptive learning quiz that now sits behind a login. A student signs up or logs in before reaching the quiz screens, plays through a single unbroken session, and their score persists only while the browser tab is open — but the identity behind that session now persists in the database. None of the auth flow described below has been exercised against a live database or a real browser session; it is built and reviewed, not yet manually tested.

---

## The Journey

### 1. You sign up or log in

You arrive at the dashboard first (`/`), which is not gated — you can look at it without an account. But the moment you try to play (clicking into `/game-setup`, `/quiz`, or `/results`), `proxy.ts` checks for a valid session cookie and, if you don't have one, redirects you straight to `/login`.

**If you're new,** you go to `/signup` and fill in your name, email, phone, password, date of birth, gender, education level, and (optionally) your learning goals. Two checkboxes gate submission: a generic terms-of-service checkbox (cosmetic — nothing server-side reads it), and a required consent checkbox: "I agree that my gameplay data may be used in anonymized research." Leaving that unchecked, or submitting an invalid email or a password under 8 characters, blocks the form with an inline error message. On success, the server hashes your password, creates your account, and signs you in immediately — you land back on the dashboard.

**If you already have an account,** you go to `/login` and enter your email and password. A wrong password or an unrecognized email produce the same generic message ("Invalid email or password") — the app deliberately doesn't tell you which one was wrong. On success you're signed in and returned to the dashboard.

Either way, logging in or signing up starts a clean slate: the app mints a brand-new session (clearing any leftover score, round count, or continues from before) so your gameplay is never mixed with whatever happened on this browser before you signed in.

Once signed in, the dashboard shows your name in the header along with a small logout control. Logging out clears your session cookie, starts a fresh anonymous session on this browser, and sends you back to `/login`.

### 2. The dashboard

You see:
- **Net Points**: your score after all penalties have been applied. This is the headline number, big and animated.
- **Potential Points**: the score you would have if every answer had been correct. A smaller, secondary stat to show what perfect play would be worth.
- Four supporting stats below: **Rounds Played** (how many times you've hit "Start Round"), **Accuracy** (percentage correct), **Continues** (times you've chosen "Keep Going"), and one more that tracks your performance under your chosen challenge lever — either **Peak Difficulty** (in Adaptive Difficulty mode) or **Fastest Answer** (in Time Pressure mode).
- A grid of game mode cards. Today, only **Quiz** is active, with two entry paths: **Rapid Round** (10 questions) and **Normal** (20 questions). Other cards — Crossword, Word Search, Match-the-Following — exist but are marked "Coming soon".
- A bold **Play Quiz** button that anchors the card.

There's no teacher waiting on the other end, and no per-student personalization yet — the questions and difficulty logic are identical for every student. But the app now knows who you are: your answers are attributed to your account, not just to a browser tab.

### 3. You pick your mode and challenge

You click **Rapid** or **Normal**, and the app drops you into the game-setup screen.

You see:
- A recap of your choice: "Rapid Round (10 questions)" or "Normal (20 questions)".
- A clear statement of the points rules: **+20 for correct, −10 for wrong**. There's real downside to guessing.
- Two large, clickable cards for your **Challenge Lever**. You pick exactly one:
  - **Adaptive Difficulty**: questions get harder after you answer correctly (difficulty goes up by 1), and easier after you're wrong (difficulty goes down by 1). Difficulty is locked to a range of 1 to 5. All questions start at level 3.
  - **Time Pressure**: you start with 10 seconds to answer. Each correct answer shaves 2 seconds off the timer for the next question. Each wrong answer or timeout leaves the timer as is. The timer never drops below 5 seconds. Difficulty stays at level 3 for all questions.
  
  You cannot pick both. You cannot pick neither.

- A large **Start Round** button to begin.

### 4. You play the quiz

You're now in the quiz. One question appears on screen, with four answer options arranged as large, clickable buttons.

As you play, you see:
- Your **Net Score** running at the top, updating immediately after each answer.
- **Progress**: which question you're on (e.g., "Question 3 of 10").
- **Your chosen challenge**: either a badge showing your current **Difficulty Level** (if you picked Adaptive), or a **countdown timer** pulsing (if you picked Time Pressure).

When you answer:
- **Correct**: the screen glows green, **+20 points** animates upward, the correct answer is highlighted, and you see a brief "Correct" message. You tap **Next Question** to move on.
- **Wrong**: the screen flashes red, **−10 points** animates downward, the correct answer is highlighted, and you see a brief "Wrong" message. You tap **Next Question**.
- **Time runs out** (only in Time Pressure mode): the timer hits zero before you click anything. That's treated as a wrong answer: **−10 points**, red flash, the correct answer is shown, and you see "Time up". You tap **Next Question**.

This repeats for every question in your round. On the last question, the button changes to **See Results**.

### 5. Your round ends — and you decide what's next

The results screen shows you the score you just earned, broken down:
- Your **Net Score** (after penalties).
- **Correct** vs **Wrong** counts.
- **Gross Points** gained and **Penalty** applied.
- A **Peak Stat**: either the highest difficulty level you reached (if you played Adaptive), or your fastest answer time (if you played Time Pressure).

Two buttons compete for your attention:
- **Keep Going → Next Round**: a large, tempting, energetic button. Tapping it increments your **Continues** counter and drops you straight back into the quiz — the **same challenge lever you picked carries over**, the **same mode carries over** (Rapid or Normal), and you play another round without returning to game-setup. This is the persistence loop we're measuring.
- **Back to Dashboard**: a quieter secondary option that takes you back to the home screen.

Most of the time, you'll see the "Keep Going" button and feel the pull to keep playing. Tapping it feels like the natural thing to do.

---

## What you never see

**AI personalization** is not here yet. All students see the same 20-question seed bank of multiple-choice questions about Digital Transformation (the course material). Your answers don't cause the AI to retool the next question — they only change difficulty or time pressure based on the lever you chose. No AI has looked at your performance to design a quest for you.

**A teacher-facing view** does not exist. There is no approval dashboard. No reasoning behind questions. The teacher is not in this loop.

**A cumulative dashboard across sessions** does not exist. Even though your account and answers are now linked in the database, the app itself has no UI for you or anyone else to see a week-over-week progress chart or a running total across days — that data sits in the `events` table, readable only by whoever queries the database directly. Playing today and tomorrow gives you two separate browser sessions (separate `sessionId`s, separate on-screen scores) that are attributable to the same account in the data, but not shown to you as one continuous history in the app.

**What used to be true and no longer is:** earlier drafts of this document said "if you close the browser and return tomorrow, the app starts fresh with zero memory of you" and described login/signup as unlinked shells. That was accurate before 28 Jul 2026's authentication work landed; it is not accurate now. Your identity is remembered by the server (in `students` and in every `events` row `student_id` can attach to) even though your on-screen score still resets per browser session.

---

## Where the experience breaks

**If you close the browser tab**, your session is gone. Your score, your round count, your continues — all of it lives in `sessionStorage` under the key `alg.session.v1`. The moment the tab closes, the session ends.

**If the database (Neon) is not configured** or the network fails, the app still runs. It falls back to a hardcoded 20-question seed bank and continues to ask those same questions every time. Event logging (clicks, answers, rounds) silently fails — no error message, no alert. You, the student, notice nothing wrong; the game feels normal and keeps score normally. But nothing is being recorded for the research paper.

**If you refresh the page mid-round**, the round restarts from the first question. Everything the round was tracking — which question you were on, your streak, the difficulty you had climbed to, the time remaining — is component state and does not survive the reload. Your cumulative session totals do survive, along with your mode and lever choice, because those live in `sessionStorage`. So you keep your score and stay in the same game; you just lose the round in progress and start it over.

**If you don't log out on a shared device**, the next person to use that browser inherits your still-valid session cookie and their answers get attributed to your account until they explicitly log in as themselves. Logging in or signing up as a different student does start a clean session (see step 1), but only once that person actively does it — nothing forces a logout automatically. This is a pilot-protocol matter for classroom lab machines, not something the app currently prevents on its own.

---

## Flow Diagram

```mermaid
graph TD
    Z0["Land on Dashboard<br/>(not gated)"] -->|Click Play Quiz,<br/>no session cookie| Z1["Redirected to /login<br/>by proxy.ts"]
    Z1 -->|Have account| Z2["Log In"]
    Z1 -->|New here| Z3["Sign Up<br/>+ research consent"]
    Z2 -->|Success:<br/>fresh session| A
    Z3 -->|Success:<br/>fresh session| A
    A["Dashboard<br/>Net Points + Stats"] -->|Play Quiz| B["Choose Mode<br/>Rapid or Normal"]
    B -->|Selected| C["Choose Challenge<br/>Adaptive or Time Pressure"]
    C -->|Ready| D["Quiz Starts<br/>Question 1"]
    D -->|Answer| E{Correct?}
    E -->|Yes<br/>+20 pts| F["Show Feedback<br/>Green Glow"]
    E -->|No or Timeout<br/>-10 pts| G["Show Feedback<br/>Red Flash"]
    F --> H{Last<br/>Question?}
    G --> H
    H -->|No| D
    H -->|Yes| I["Results Screen<br/>Score + Peak Stat"]
    I -->|Keep Going| D
    I -->|Back to Dashboard| A
    A -->|Logout| Z1
    
    style Z0 fill:#1a1a2e
    style Z1 fill:#472a1a
    style Z2 fill:#16213e
    style Z3 fill:#16213e
    style A fill:#1a1a2e
    style B fill:#16213e
    style C fill:#16213e
    style D fill:#0f3460
    style E fill:#e94560
    style F fill:#00d084
    style G fill:#ff4757
    style H fill:#e94560
    style I fill:#1a1a2e
```

---

## Where this lives in the code

- **Login**: `/app/login/page.tsx` — email/password form, posts to `POST /api/auth/login`, calls `resetSession()` and redirects to `/` on success.
- **Signup**: `/app/signup/page.tsx` — registration form plus the required research-consent checkbox, posts to `POST /api/auth/signup`, calls `resetSession()` and redirects to `/` on success.
- **Auth API**: `/app/api/auth/signup/route.ts`, `/login/route.ts`, `/logout/route.ts`, `/me/route.ts` — credential checking, password hashing (`/lib/auth/password.ts`), and the signed session cookie (`/lib/auth/session.ts`).
- **Route gate**: `/proxy.ts` — redirects unauthenticated visitors away from `/quiz`, `/game-setup`, and `/results`.
- **Dashboard**: `/app/page.tsx` — renders the entry screen, fetches session state from `sessionStorage`, fetches the signed-in student's name from `GET /api/auth/me`, displays the stats, and provides the "Play Quiz" entry point and the logout control.
- **Mode selection**: `/app/game-setup/page.tsx` — shows the Rapid / Normal choice and the Adaptive / Time Pressure toggle. Validates that exactly one challenge is selected, then sets up the session and navigates to the quiz.
- **Quiz screen**: `/app/quiz/page.tsx` — manages question sequencing, answer validation, scoring, and timeout logic. Updates the session state after each answer and drives the adaptive-difficulty or time-pressure logic.
- **Results screen**: `/app/results/page.tsx` — displays the round score breakdown and the peak stat. The "Keep Going" button increments the continues counter and loops back to the quiz. "Back to Dashboard" clears the round state and navigates home.
- **Session state**: stored in `sessionStorage` under `alg.session.v1` as a JSON object containing score, round count, continues, accuracy, current difficulty, and timer state. This persists only for the duration of the browser tab.
- **Game logic**: `/lib/gameLogic.ts` handles scoring, difficulty adjustments, time-pressure math, and outcome determination.
- **Questions**: `/lib/questions.json` contains the hardcoded 20-question seed bank. When Neon is configured, this will be replaced with queries from the database, but the fallback bank allows the app to run offline.
