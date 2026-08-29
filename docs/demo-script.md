# The three-minute demo script

**Task**: T049 · **Traces to**: SC-006, SC-007 · **Source**:
[research-findings.md](./research-findings.md) §5.1, §7.4

Spoken over a recorded run of `pnpm demo`. Three minutes, no improvising.

**The number that has to stay in the jury's head: $96,310 against $840.**

> **One correction to §7.4**: it says "sandbox". The sandbox transport was cut on
> 2026-08-29 (spec Clarifications, T016) — the measurement runs in a **local isolated
> executor**: `python3 -I measure.py`, fresh temp dir, `env: { PATH }`, handed nothing but
> the replica path. Say "isolated executor", never "sandbox". The claim is unchanged: the
> action is really executed against a replica.

---

## Timing

| Block | Clock | Beat |
| --- | --- | --- |
| A | 0:00–0:19 | The one sentence |
| B | 0:19–0:49 | The agent proposes · four guardrails pass |
| C | 0:49–1:33 | The measurement · **1,204 / $96,310 / 611** · deny |
| D | 1:33–1:59 | The agent corrects itself · 7 / $840 / 0 · allow · executed |
| E | 1:59–2:26 | What it cannot prove → escalate → a human |
| F | 2:26–2:58 | How it is built · the close |

**433 spoken words.** At 145 wpm that is 2:59 with the beat in block C. Do not add
sentences — cut from §Cut lines instead. Rehearse against a stopwatch twice: adrenaline
adds about 10 wpm, which buys roughly twelve seconds, and that is the only slack there is.

---

## The script

### A — 0:00–0:19 · the sentence

> The others stop the action and show you a button.
> We stop it, **run it against a replica**, and show the agent the numbers proving it was
> wrong — until it fixes its own plan.
> A human steps in only when not even we can prove it.

*No "hi, we're…". No context. Start on the sentence.*

### B — 0:19–0:49 · an ordinary agent, and four guardrails that pass

**On screen**: round 1, the `🧾` proposal line, the four `PASS` lines.

> This is an ordinary support agent, told to refund the disputed charges. It proposes a
> bulk refund and declares what it thinks it is doing: **7 charges, $840**.
> The harness holds the call. Now watch the four controls the market actually sells — a
> dollar ceiling, a frequency cap, an eligibility policy, and the model's own confidence,
> **0.94**.
> All four pass. Every one of them is grading the $840 the agent *declared*.

### C — 0:49–1:33 · the measurement

**On screen**: `▸ measuring (local)`, the `🧮` line, the `⛔ deny` reason.

> Nobody ran it. So we run it.
> The proposed criteria go to an isolated executor — a Python script, standard library
> only, no network, no writes, that reads one file: a replica ledger generated from its own
> seed. It never touches production.
> [**beat — let the line land**]
> **1,204 charges. $96,310. And 611 of them already carry a settled refund** — the
> processor does not reverse those, so that is money paid twice.
> The agent said $840. It is off by two orders of magnitude, and it was 94% confident.
> That is a **deny**, and the denial hands the agent the measured figures as its reason.

### D — 1:33–1:59 · the correction

**On screen**: round 2's `🧾` line, the second `🧮`, `✅ allow`, the execution line.

> Now the part we did not script. The agent reads the numbers and **narrows its own
> predicate** — excludes what was already refunded, bounds the window to thirty days.
> That is native harness behavior, not a second turn we wrote.
> Same measurement, again: **7 charges, $840, zero duplicates**. It matches what it
> promised. **Allow** — and only now does the refund run against production.

### E — 1:59–2:26 · what it cannot prove

**On screen**: `pnpm demo -- --scenario over-threshold`, `⚖ escalate`.

> Third outcome, and it is the important one. A payout proposal measures at **$418,220** —
> over the configured ceiling. We do not decide that. It **escalates**: the action stays
> unexecuted and a person decides, with the evidence in front of them.
> A proposal that does not parse, or a measurement that fails, does the same. No execution,
> no number, no verdict — the system never guesses.

### F — 2:26–2:58 · how, and why us

> Almost none of this is our code. The pause, the denial reaching the agent, the
> re-proposal, the subagents, the human decision — that is the harness doing the work.
> We wrote the five pieces it does not reach: the event correlation, the predicate grammar,
> the seeded ledgers, the measurement, and the verdict rules.
> Spec-driven, one task per PR, every PR through Qodo, same seed every run.
> Every guardrail on the market predicts the blast radius. **We measure it.**

---

## Cut lines, in the order to drop them

Running long is the failure mode. Drop from the top:

1. B: the naming of the four controls → *"All four conventional controls pass — every one
   of them grading the $840 the agent declared."* (−20 words, ≈8 s)
2. F: *"Spec-driven, one task per PR, every PR through Qodo, same seed every run."*
   (−13 words, ≈5 s) — only if the recording already shows the PR trail.
3. E: *"A proposal that does not parse, or a measurement that fails, does the same."*
   (−14 words, ≈6 s)
4. C: *"standard library only, no network, no writes,"* (−7 words, ≈3 s)

Never cut: the $96,310 / $840 pair, the word *escalate*, or the closing sentence.

---

## The figures, and where they come from

Verified by running the measurement script directly against the committed replica:

```
$ python3 packages/core/scripts/measure.py --ledger fixtures/replica.json \
    --table charges --criteria "status=disputed"
🧮1204 | 96310.00 | 611

$ python3 packages/core/scripts/measure.py --ledger fixtures/replica.json \
    --table charges --criteria "status=disputed AND refunded=false AND age_days<=30"
🧮7 | 840.00 | 0

$ python3 packages/core/scripts/measure.py --ledger fixtures/replica.json \
    --table payouts --criteria "payout_eligible=true"
🧮342 | 418220.00 | 0
```

The fixtures are generated from fixed seeds with no RNG, so a re-record reports the same
digits (FR-006, SC-002). `$418,220.00` against `CROSSEXAM_ESCALATION_THRESHOLD_USD=250000`
is what makes the payout escalate under rule 3.

---

## What the recording must contain

The narration above is timed to [quickstart.md](../specs/001-cross-exam-evaluator/quickstart.md)
Scenario 1's trace, plus one `--scenario over-threshold` run for block E. Record after T030
and T038 land; keep the take from T048 as the insurance copy.

| Block | Command on screen |
| --- | --- |
| B | `pnpm demo` — round 1 and the four guardrail lines |
| C–D | the same run, through `executed against production ledger` |
| E | `pnpm demo -- --scenario over-threshold` |

If the guardrail lines (T038) are not in the trace, block B is spoken over the round 1
proposal alone and the four controls are named, not shown — say *"four controls of this
kind"*, do not claim the screen shows them.

---

## If the jury asks

| Question | Answer |
| --- | --- |
| Is this only refunds? | The deciding layer is not. It compares a declared figure to a measured one. The replica dataset is a payments ledger; pointing it elsewhere means supplying that replica and its tables. |
| Why not just ask the model to double-check? | The model was 94% confident and wrong. A verdict here cannot exist without a number that came out of an execution. |
| What if the agent proposes something you cannot parse? | It escalates. The grammar has no `OR`, no parentheses, no functions, no `eval` — measurable or escalated, nothing in between. |
| Does the measurement see production? | Never. The replica is generated from its own seed, not copied, so a measurement cannot silently read the real ledger. |
| What stops the replica and production drifting? | Nothing, and that is the honest limit: a stale replica measures a stale blast radius. Both are seeded and regenerated together here. |
| Is it a policy engine? | No. The four guardrails are hardcoded, and they exist to be shown passing. |
