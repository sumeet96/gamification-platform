# Runbook — finish the Competitive Strategy grounded arm on the Mac mini

Written 7 Aug 2026. The grounded arm was killed three times on the Windows machine (items 155, 53,
then 14 of 170 — progressively sooner, i.e. memory pressure, not a timeout: 87.4% RAM with
`llama-server` resident at 8.4 GB). The Mac does this arm in **~36 minutes** against ~2 hours on
Windows, and it starts from a clean memory state.

## What this produces and why it matters

The grounded arm is the **quality gate** before the 170 Competitive Strategy items can be imported.
It asks only whether the source material answers the question at all. Ceiling here is a *good* sign,
which is why `--retention` is deliberately **off** — that flag exists to spread ability tiers for
difficulty estimation, not to judge quality.

The ungrounded arm is already done: **mean 0.773, IQR 0.37, 28% at ceiling, 23 items below 0.40.**

Benchmarks for the grounded arm: original bank of 50 → 5 broken, mean 0.90; gen2 29 → 1, 0.96;
gen3 37 → 0, 0.98; gen4 90 → 2, 0.964.

## Step 1 — copy two files from Windows to the Mac

Both live in `spike-data/`, which is **gitignored**, so `git pull` will not bring them.

On Windows, in the project folder:
```powershell
explorer .\spike-data
```
Copy **`cs-mcq.json`** and **`excerpts-cs.json`** to the Mac (AirDrop, iCloud Drive, USB — anything).

On the Mac, put them in the same place:
```bash
cd ~/gamification-platform
mkdir -p spike-data
# drop the two files into spike-data/ , then confirm:
ls -l spike-data/cs-mcq.json spike-data/excerpts-cs.json
```

## Step 2 — make sure the Mac is current and Ollama is fresh

```bash
cd ~/gamification-platform
git pull
npm install

# restart Ollama so it starts from clean memory — this is what failed on Windows
pkill -f ollama; sleep 3; open -a Ollama; sleep 5
ollama list        # expect llama3.2:latest
```

## Step 3 — run the grounded arm (~36 min)

`caffeinate -i` stops the Mac sleeping through it; `tmux` means closing the terminal does not kill it.

```bash
tmux new -s grounded

caffeinate -i node scripts/spike-simulate-difficulty.mjs spike-data/cs-mcq.json \
  --model llama3.2 --n 30 --concurrency 4 \
  --source spike-data/excerpts-cs.json \
  --out spike-data/cs-grounded.json --label cs-grounded
```

Detach with **Ctrl-B** then **D**. Reattach with `tmux attach -t grounded`.

⚠️ **The script writes its output only at the very end.** If it is interrupted at 99% you lose
everything and start over. Do not close the laptop lid, and do not run anything else heavy alongside.

## Step 4 — get the verdict

```bash
node scripts/analyse-item-gap.mjs \
  --ungrounded spike-data/cs-ungrounded.json \
  --grounded  spike-data/cs-grounded.json \
  --items     spike-data/cs-mcq.json \
  --json      spike-data/cs-gap.json
```

`cs-ungrounded.json` is also gitignored — copy it across from Windows too, or re-run the ungrounded
arm on the Mac (same command as step 3, minus the `--source` line).

**Read it as:** items with **grounded < 0.60 are broken** — the source does not answer them. Expect a
handful out of 170. Do **not** reject on the ungrounded number; it measures how *famous* a concept is,
not whether the item is defective.

## Step 5 — import the survivors (back on Windows, or wherever `DATABASE_URL` is set)

The `sources` rows for these 7 decks **do not exist yet**, and `import-terms.mjs` looks them up and
never creates them. Create them first, using the project's own id formula
`sha256(subject::filename::byteLength).slice(0,24)` — see the 6 Aug INSERT in git history for the
exact shape.

Then, filtering out any item whose `p_grounded < 0.60`:

```bash
node scripts/import-terms.mjs --subject "Competitive Strategy" \
  --from-json spike-data/clean-cs-*.json \
  --source-id <id1> <id2> <id3> <id4> <id5> <id6> <id7> \
  --expect <N> --additive --dry-run
```

**`--additive` is not optional.** Without it the script retires every live row in the subject that is
not in the import set — that is its cohort-swap behaviour, and it would be catastrophic here.
`--dry-run` is the default; read the plan, confirm `0 retirement(s)` and the `[mode: ADDITIVE]`
marker, then re-run with `--commit`.

## The finding this feeds, which is already settled

Do not re-derive it. Pooled across both banks (90 technical + 170 strategy = 260 items):

- **51 items** score below 0.60 ungrounded
- **83 items** below 0.80

Only those can carry an exposure-gated difficulty gradient — everything above the cut is answerable
without the deck by construction. **The calibration study filters on ungrounded score, not on
subject.** Running the n=120 stability study across all 260 would flatten the tier gradient and make
the method look broken when the item selection was at fault.

Note this inverts the standing rule deliberately: for **assessment**, the ungrounded arm is *not* a
rejection gate (`Agile Manifesto` scores 1.00 and is a good item — fame is not a defect). For
**calibration**, an item nobody needs the deck to answer has no gradient to measure. Same instrument,
two jobs, opposite verdicts.
