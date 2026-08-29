# Feature Specification: CROSS-EXAM — Adversarial Evaluator with Measured Blast Radius

**Feature Branch**: `001-cross-exam-evaluator`

**Created**: 2026-08-28

**Status**: Draft

**Input**: User description: "todo lo necesario para escribir lo encuentras aca en la carpeta docs de este proyecto" — sourced from [docs/research-findings.md](../../docs/research-findings.md) (authoritative), [docs/research-brief.md](../../docs/research-brief.md) (superseded where they conflict), and [docs/constitution-input.md](../../docs/constitution-input.md).

## Overview

Every guardrail on the market **predicts** the blast radius of an irreversible action.
CROSS-EXAM **measures** it: it executes the proposed action against a replica of the
production data, confronts the acting agent with the resulting numbers, and forces it to
correct or defend its plan before anything touches production.

This is the single specification covering the whole event (Constitution VII). It is
scoped to one day, ~4 net build hours, two people, and one three-minute live demo in
front of a jury. Priorities below are the cut order: everything at P3 or lower is
cancelled outright if the P1 loop has not closed by the 14:30 PDT cutline
(Constitution I).

## Clarifications

### Session 2026-08-28

- Q: Where does the replica ledger's data come from — copied from the production ledger at hold time, or seeded separately? → A: Generated independently from its own seeded fixture (not a copy of production)
- Q: Where do the declared figures (7 disputes, $840) come from — a required field on the proposal, or parsed from the agent's text? → A: Required field on the proposed action's arguments; missing declaration escalates
- Q: What makes a measurement "inconclusive" and so an escalation? → A: No such branch — the only escalation triggers are no measurement produced and measured value over the configured threshold
- Q: If the external sandbox is unreachable during the demo, fall back or escalate? → A: Local isolated executor behind the same interface; the sandbox stays the default
- Q: How long may a single measurement run before the Evaluator gives up on it? → A: 20 seconds per attempt

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The measured denial loop (Priority: P1)

An operations agent handling customer disputes is asked to refund a batch of them. It
proposes a bulk refund it believes covers 7 disputes worth $840. The action is
irreversible, so it pauses for approval.

Instead of a human seeing a button, the Evaluator takes the pause: it executes the
agent's exact proposed action against a seeded replica of the ledger and gets back what
the action would really do — 1,204 charges, $96,310, and 611 of them already refunded
once. It denies the action and hands the agent those numbers as the reason. The agent
reads the reason, narrows its own selection criteria, and proposes again. The Evaluator
measures the new proposal against the same replica: 7 charges, $840, 0 duplicates. It
approves, and only then does the action run for real.

**Why this priority**: This loop is the entire product. It is the only thing that
separates CROSS-EXAM from the approval-gated assistants other teams will demo, and it is
the deliverable the jury scores. Nothing else ships before it closes.

**Independent Test**: Run the seeded scenario end to end and read the output: the first
proposal is denied with measured numbers, the agent's second proposal differs from the
first, the second measurement returns the safe numbers, the action executes. Delivers the
complete value of the product on its own.

**Acceptance Scenarios**:

1. **Given** the seeded replica contains 1,204 charges matching the agent's broad
   criteria, of which 611 already carry a settled refund, **When** the agent proposes the
   bulk refund declaring 7 disputes for $840, **Then** the action is held and the
   Evaluator produces a measurement citing 1,204 charges, $96,310, and 611 duplicates.
2. **Given** that measurement, **When** the Evaluator issues its verdict, **Then** the
   verdict is `deny`, its stated reason contains the measured figures, and the reason is
   delivered to the acting agent.
3. **Given** the agent has received the denial reason, **When** it proposes again,
   **Then** its new proposal has narrower selection criteria than the first.
4. **Given** the narrowed proposal, **When** the Evaluator measures it against the same
   replica, **Then** the result is 7 charges, $840, 0 duplicates, and the verdict is
   `allow`.
5. **Given** an `allow` verdict, **When** the action proceeds, **Then** it executes
   against the production ledger and the run reports completion.
6. **Given** the measurement step fails or produces no numbers, **When** the Evaluator
   must produce a verdict, **Then** the verdict is `escalate` — never `allow` or `deny`.
7. **Given** the same seed, **When** the full scenario is run three times, **Then** all
   three runs report the same charge counts and dollar amounts.

---


### User Story 2 - The guardrails that pass while the damage goes through (Priority: P2)
Before the Evaluator gets involved, the acting agent runs the protections a real
money-moving agent ships with today: a per-refund dollar ceiling, a per-customer
frequency cap, an eligibility-policy check, and its own confidence score. All four pass —
correctly, because each individual refund is small, legitimate, eligible, and the agent is
genuinely confident. The damaging action sails through every one of them. Then the
Evaluator measures the action's real reach and stops it.

**Why this priority**: It answers the informed judge's obvious objection ("wouldn't a
dollar limit catch this?") without anyone having to argue it, and it costs roughly ten
minutes. It is worthless without User Story 1, so it never precedes it.

**Independent Test**: Run the same proposal through the guardrail checks alone and read
the output: four passes, no block. Then run the Evaluator and see it stop the identical
action.

**Acceptance Scenarios**:

1. **Given** the damaging bulk-refund proposal, **When** the static guardrails evaluate
   it, **Then** all four report pass and none blocks the action.
2. **Given** those four passes, **When** the Evaluator measures the same proposal,
   **Then** it reports the measured figures and denies the action.

---

### User Story 3 - The case the Evaluator cannot prove goes to a human (Priority: P2)

The acting agent proposes a different irreversible action the Evaluator must not decide
alone — either no measurement could be produced at all, or the measured value at stake
exceeds the threshold above which a machine is not the last word. The Evaluator does not
guess. It returns `escalate`, the decision surfaces to a person, and a real human
allows or denies it.

**Why this priority**: It is what makes the human-approval claim genuine rather than
theatre, it is the closing beat of the demo script, and it is the behavioral expression of
the constitution's non-negotiable evidence rule.

**Independent Test**: Feed the scenario whose measured value exceeds the escalation
threshold and confirm the run stops, presents the case to a person, and waits for a human
decision before doing anything.

**Acceptance Scenarios**:

1. **Given** a proposal whose measurement could not be produced, **When** the Evaluator
   concludes, **Then** the verdict is `escalate` and no `allow` or `deny` is emitted.
2. **Given** an `escalate` verdict, **When** the case surfaces, **Then** the run waits for
   a human decision and the action stays unexecuted until that decision arrives.
3. **Given** a proposal whose measured value exceeds the escalation threshold, **When**
   the Evaluator concludes, **Then** the verdict is `escalate` even though the measurement
   itself succeeded.

---

### User Story 4 - Three investigators working the case in parallel (Priority: P3)

The Evaluator does not investigate alone. It splits the case into three angles worked in
parallel: blast radius (execute the action against the replica and count), policy (does
this action comply with the written refund playbook), and precedent (what was decided on
similar charges before). Their findings converge into one verdict.

**Why this priority**: It broadens what the harness is visibly doing and makes the
investigation legible on screen, but the P1 loop closes without it. Cancelled at 14:30 if
User Story 1 is not done.

**Independent Test**: Run a single case and confirm three investigation angles are visible
as separate concurrent activities and that the verdict references findings from more than
one of them.

**Acceptance Scenarios**:

1. **Given** a charge under investigation, **When** the Evaluator works the case, **Then**
   three investigation angles run concurrently and each is individually visible.
2. **Given** three completed angles, **When** the verdict is produced, **Then** it cites
   the blast-radius numbers and references at least one other angle's finding.

---

### User Story 5 - The verdict card the jury reads (Priority: P3)

The verdict is not a wall of text. It renders as a card: the charge at the top, a severity
tag, a chart putting *declared* next to *measured*, a table of the affected charges, and
the allow / deny / escalate controls a human can act on.

**Why this priority**: In a live demo the screen is the argument. But it presents work
that must already exist; it cannot substitute for it.

**Independent Test**: Trigger one verdict and confirm the card renders with the charge,
severity, the declared-versus-measured comparison, the affected-charge table, and working
decision controls.

**Acceptance Scenarios**:

1. **Given** a completed verdict, **When** it is presented, **Then** the card shows the
   charge, a severity indicator, declared versus measured figures side by side, and the
   affected charges.
2. **Given** an escalated verdict card, **When** a person selects a decision on it,
   **Then** that decision reaches the run and determines whether the action executes.

---

### User Story 6 - The docket remembers (Priority: P4)

Charges, evidence, and verdicts persist across sessions, so a later investigation can cite
what was decided earlier.

**Why this priority**: Lowest value per minute of everything listed. Built only if User
Stories 4 and 5 are already done before the 16:00 freeze.

**Independent Test**: Produce a verdict, end the session, start a new one, and confirm the
earlier verdict is retrievable.

**Acceptance Scenarios**:

1. **Given** a verdict recorded in one session, **When** a new session queries the docket
   for that action type, **Then** the earlier verdict and its cited evidence are returned.

---

### Edge Cases

- **The measurement cannot run** (neither the sandbox nor the local executor can run it,
  replica not loaded, execution errors): the verdict is `escalate`. No inferred `allow` or `deny`, at any point in the
  day, for any reason.
- **The agent re-proposes something still dangerous**: it is measured and denied again on
  the same terms. The scenario is seeded so the second proposal is safe, but a second
  denial is correct behavior, not a failure.
- **The agent re-proposes something outside the demo's seeded path**: the run reports the
  divergence rather than pretending the scripted numbers were measured.
- **The agent gives up instead of re-proposing**: the run ends with the action unexecuted
  and reports the denial as final. Nothing executes.
- **The proposal omits its declared figures**: the action is held and the verdict is
  `escalate`; the declared-versus-measured comparison is never shown with a blank side.
- **Two decisions are attempted on the same held action at once**: the first decision
  stands; the second is rejected rather than overwriting it.
- **The measured result is identical to what the agent declared**: the verdict is `allow`,
  and it still cites the measured numbers — an approval without cited execution is as
  much a violation as a denial without one.
- **A human never answers an escalation**: the action stays unexecuted indefinitely. There
  is no timeout that auto-approves.

## Requirements *(mandatory)*

### Functional Requirements

**Holding the action**

- **FR-001**: The system MUST hold every irreversible action the acting agent proposes,
  before any effect reaches production data.
- **FR-002**: The system MUST recover, for each held action, the action's name and its
  full arguments as proposed. Those arguments MUST include the agent's declared
  figures — the number of records it believes the action affects and their total
  value. A proposal missing either declared figure MUST produce `escalate`.
- **FR-003**: The system MUST process one held action at a time per acting agent, never
  issuing a second instruction to that agent while one is in flight.

**Measuring the blast radius**

- **FR-004**: The system MUST execute the held action's exact proposed selection criteria
  against a replica of the production ledger, in an isolated environment, without touching
  production data. The external sandbox is the default environment; when it is
  unreachable, the system MUST run the identical measurement through a local isolated
  executor behind the same interface. FR-010 applies only when neither executor produces
  a measurement.
- **FR-005**: The measurement MUST report, at minimum: the number of records the action
  would affect, their total monetary value, and how many of them have already been acted
  on in a way that cannot be reversed.
- **FR-006**: The replica MUST be seeded and deterministic — the same seed produces the
  same measurement on every run, with no randomness anywhere in the data path. The
  replica MUST be generated from its own seeded fixture rather than copied from the
  production ledger; the two stores are generated to be equivalent for the demo
  scenario, and neither is required to be byte-identical to the other.
- **FR-007**: The seeded ledger MUST contain, at minimum: recent legitimate disputes,
  disputes already refunded (the duplicate trap), and disputes outside the policy window —
  so that a correctly narrowed proposal arises naturally from the data rather than by
  script.

**The verdict**

- **FR-008**: A verdict MUST be exactly one of `allow`, `deny`, or `escalate`.
- **FR-009**: `allow` and `deny` MUST each cite numbers produced by the measurement.
  A verdict path MUST NOT emit `allow` or `deny` from reasoning alone.
- **FR-010**: When no measurement was produced — for any reason, including infrastructure
  failure — the verdict MUST be `escalate`. A measurement attempt that has not returned
  within 20 seconds MUST be abandoned and counts as producing no measurement; the fallback
  executor of FR-004 is then attempted under the same 20-second limit.
- **FR-011**: When the measured value at stake exceeds the configured escalation
  threshold, the verdict MUST be `escalate` even though the measurement succeeded.
  Escalation is a **data** condition: no measurable proposal (FR-025), no measurement
  produced (FR-010), or a value over the threshold (this requirement) — these are the only
  three escalation triggers; there is no separate "inconclusive measurement" branch. A
  verdict the Evaluator writes incorrectly — malformed, measured on other criteria, citing
  figures it did not measure, or approving what its measurement contradicts — is a
  tool-usage mistake, not a data condition: the system MUST return it to the Evaluator with
  the measured figures as guidance and read the re-issued verdict, and MUST NOT escalate
  or execute on it.
- **FR-012**: A `deny` verdict MUST carry a reason containing the measured figures, and
  that reason MUST be delivered to the acting agent.
- **FR-013**: An `escalate` verdict MUST present the case, with its evidence, to a human
  and MUST leave the action unexecuted until that person decides.
- **FR-014**: An `allow` verdict MUST result in the held action executing against
  production; `deny` and an unanswered `escalate` MUST leave it unexecuted.

**Cross-examination**

- **FR-015**: After a denial, the acting agent MUST be able to propose a revised action,
  and that revision MUST be held and measured on the same terms as the original.
- **FR-016**: The system MUST make the whole sequence — proposal, measurement, verdict,
  re-proposal, second measurement, final decision — observable as it happens.

**Contrast with conventional controls (P2)**

- **FR-017**: The acting agent MUST apply and report a per-action monetary ceiling, a
  per-customer frequency cap, an eligibility-policy check, and its own confidence score
  before proposing.
- **FR-018**: Those four checks MUST each report their pass/fail result visibly, and MUST
  all pass on the damaging proposal of User Story 1.

**Investigation and presentation (P3)**

- **FR-019**: The Evaluator MUST work each case along three concurrent angles — blast
  radius, policy, and precedent — each individually observable.
- **FR-020**: The verdict MUST render as a card showing the charge, a severity indicator,
  declared versus measured figures side by side, the affected records, and controls a
  human can use to allow, deny, or escalate.

**Docket (P4)**

- **FR-021**: Charges, cited evidence, and verdicts MUST persist beyond the session that
  produced them and be retrievable by a later session.

**Operational**

- **FR-022**: The system MUST attach to an acting agent identified by configuration, not
  by hardcoded identity — attaching to a different agent must not require a code change.
- **FR-023**: Credentials MUST come from the environment. No credential value may appear
  in the repository, in output, or in logs — not even truncated.

**Proposal and verdict encoding**

- **FR-024**: The proposal the acting agent emits, and the `📝` reason text the Evaluator
  produces for a denial, MUST use a flat, emoji-keyed grammar — each field introduced by a unicode emoji that
  names it, one field per line, no nested structures, and no JSON-escaped payload inside
  any field. The selection criteria, the declared count, and the declared value each carry
  their own emoji key. Emoji keys are chosen because they are compact and visually
  unambiguous: they cost fewer tokens than a spelled-out field name and they raise parse
  accuracy on small models. The key set is the registry in
  [docs/emoji-grammar.md](../../docs/emoji-grammar.md), which is the single source of
  truth both agents encode and decode against. The harness's own envelope around a denied
  call (its native tool-result wrapper) is outside the grammar and outside this requirement.
- **FR-025**: A proposal that does not parse under that grammar MUST NOT be re-parsed
  under a looser one, and no undelimited field value may be inferred. An unparseable
  proposal yields no measurement and therefore `escalate` under FR-010.

### Key Entities

- **Proposed Action**: An irreversible operation the acting agent wants to perform — its
  name, its arguments, its selection criteria, and the declared affected count and total
  value the agent asserts (both required).
- **Charge Sheet**: What the Evaluator receives about a held action — the proposed action,
  the relevant conversation context, and the state of the replica. It is the agreed
  hand-off between holding and investigating.
- **Replica Ledger**: A seeded, deterministic stand-in for the production ledger, generated
  from its own fixture rather than copied from it — charges with
  their status, amount, dispute date, and whether a refund has already settled. Measurement
  runs against this and never against production.
- **Measurement**: The numeric result of executing a proposed action's criteria against
  the replica — affected count, total value, irreversible-duplicate count.
- **Verdict**: `allow` | `deny` | `escalate`, with the reason shown to the agent and the
  measured evidence it cites.
- **Docket Entry**: A persisted record of a charge, its evidence, and its verdict,
  retrievable by later sessions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The full loop — proposal, denial with measured evidence, the agent's
  re-proposal, approval, execution — completes without human intervention in a single run.
- **SC-002**: Three consecutive runs of the seeded scenario report identical charge counts
  and dollar amounts.
- **SC-003**: 100% of `allow` and `deny` verdicts cite numbers that came from an executed
  measurement; 0 verdicts are `allow` or `deny` without one.
- **SC-004**: Every measurement failure, in every run, produces `escalate` — never a
  guessed verdict.
- **SC-005**: The demonstrated contrast is unambiguous: four conventional controls pass
  the damaging action, and the measured figure that stops it is at least two orders of
  magnitude larger than what the agent declared ($96,310 measured against $840 declared).
- **SC-006**: A person watching the run can name the two numbers — declared and measured —
  without being told them.
- **SC-007**: The whole story is demonstrable inside three minutes.
- **SC-008**: The end-to-end loop closes by 14:30 PDT on 2026-08-29; all code is frozen by
  16:00 PDT.
- **SC-009**: Every change merged that day arrived on its own branch, through its own pull
  request, with its automated code review resolved before merge.
- **SC-010**: Zero credential values appear anywhere in the repository or its output.
- **SC-011**: No single measurement attempt blocks the run for more than 20 seconds; on
  expiry the run moves to the fallback executor or to `escalate`, never to silence.
- **SC-012**: Across three consecutive runs, zero proposals and zero denial reasons are
  lost to a parse or escaping failure.

## Assumptions

These are decisions taken from [docs/research-findings.md](../../docs/research-findings.md)
§8 and §2, recorded here so they are reviewable rather than implicit.

- **Domain is refunds and payments.** The acting agent is a customer-support agent
  processing disputes in batches; its irreversible operations are a bulk refund, a payout,
  and an account closure. Money is abstract on video, so the visceral damage is the
  **double refund**: a settled refund is not reversed by the processor.
- **The acting agent is ordinary, not a straw man.** It is written to look like the
  support agents already in production today. The more unremarkable it looks, the more
  clearly the Evaluator is the product.
- **The demo numbers are the seeded numbers**: 7 disputes and $840 declared; 1,204
  charges, $96,310, and 611 already-refunded measured. They come from the seed, not from
  hardcoded strings in the verdict.
- **"Production" in this event means the seeded production ledger** — a separate store
  from the replica. There is no external payment processor in scope.
- **The replica is generated, not mirrored.** Both stores come from seeded generators;
  the replica is never a snapshot of production. CROSS-EXAM is a concept demonstration,
  so the data is generated on both sides.
- **One round of cross-examination.** Challenge → the agent's correction → decision. Free
  conversation between the two agents is explicitly out of scope.
- **Escalation reaches a human through the run's own approval surface**, not through
  email, chat, or any external routing.
- **The escalation value threshold is a configured amount**, set so that the User Story 3
  scenario crosses it and the User Story 1 corrected proposal does not.
- **The proposal grammar is flat and emoji-keyed, not nested JSON.** Adopted from
  [*The Minutiae of Tool-calling*](https://blog.can.ac/2026/08/03/the-minutiae-of-tool-calling/)
  (Can.ac, 2026-08-03), whose rule is that reliability degrades with
  *nesting × heterogeneity × cleverness*: a field holding JSON-escaped content must be
  re-parsed, and a failed re-parse is a lost tool call. Its top-ranked format keys each
  field with an emoji (`🔍2=7`) rather than spelling the field out — cheaper in tokens and
  more reliably emitted by small models, which is why we adopt it. Our proposal carries
  selection criteria plus two declared figures — few enough fields that the thinnest
  grammar wins.
  Two deviations are accepted deliberately and MUST be recorded in `plan.md` under
  Complexity Tracking: this is a *how* living in the spec (Constitution VII), and it
  prefers our own grammar over the harness's native tool-calls (Constitution III). The
  simpler alternative rejected is native tool-calling, which the same article notes wins
  on ergonomics past ~10 tools — a scale this feature does not reach.
- **Two builders, ~4 net hours**, on Saturday 2026-08-29. Priorities P3 and below are
  expected casualties, not commitments.

## Dependencies

- **The agent harness** provides the session, the pause for approval, the delivery of a
  denial reason back to the agent, concurrent sub-investigations, sandboxed code
  execution, and the rendered verdict card. Where it provides a behavior natively, that
  behavior is used rather than rebuilt (Constitution III).
- **An external sandbox provider account** with permission to create snapshots, funded and
  verified before the event. It is verified the night before, not on the day; its loss
  during the run is covered by the local executor of FR-004 rather than ending the demo.
- **A model provider account** for both agents.
- **An automated pull-request review** on every merged pull request, live from the first
  commit.

## Out of Scope

Named explicitly so they are not rediscovered as "small additions" mid-build
(Constitution VII: new scope gets cut, not added).

- A custom frontend beyond the verdict card — no docket or courtroom panels.
- A reusable, installable package. Attaching to another agent is demonstrated as one line
  of configuration (FR-022), not as a published artifact.
- Free-form dialogue between the two agents, or more than one round of cross-examination.
- Any real external payment processor, refund network, or production customer data.
- Scheduled or recurring audits.
- Unit tests beyond the ones that are cheaper than re-running the seeded scenario
  (Constitution IV).
