# Research findings — CROSS-EXAM / Agent Harness Hackathon

> Output of the deep research session on `docs/research-brief.md`.
> Date: 2026-08-28. Everything here is verified against the live site or against
> TrueForge's source code (clone of `main`, commit `a3a1395`, of 2026-08-28).
> Anything still an assumption is marked **[ASSUMPTION]**.
> This doc replaces the brief wherever they contradict each other. Basis for
> `/speckit.constitution` and `/speckit.specify`.
>
> ⚠️ **Design detail here is PARTIALLY SUPERSEDED by
> [`specs/001-cross-exam-evaluator/research.md`](../specs/001-cross-exam-evaluator/research.md)**
> — D-03 (one `measure.py`, not Code Mode), D-04 (predicate grammar, not SQL), D-05 (seeded
> JSON), D-08/D-14 (emoji grammar as the tool-call syntax; harness run with `pnpm exec`, pinned
> 0.1.4). On conflict, `research.md` wins.

---

## 0. TL;DR — what defines the day

1. **A single day, deadline Saturday the 29th at 18:00 PDT, presented LIVE to the
   judges.** The in-person Bright Data event has its own clock and its own judging
   panel — it is not the same close as the WeMakeDevs online hackathon (that one runs
   through Sunday the 30th). Real hacking windows: **11:00–14:00 and 14:00–17:00**.
   With a freeze at 16:00 for the README, Qodo evidence, and rehearsal, the build
   budget is **~4 net hours**.
2. **The deliverable is the live demo, not the README or the video.** *"present your
   project live to the judges at the end of the day."* Everything not seen in those
   minutes in front of the jury is dead weight. That reorders the entire priority list
   (see §7).
3. **Three tracks, and "Best UI" is not among them**: Best Use of the Agent Harness
   (DGX Spark), Best Code Quality (Qodo → Mac Mini), Best blog post (Keychron).
   Investing in the visual card still pays off, but for a different reason: it is what
   the judge looks at during the demo. See §4.
4. **The central mechanism is confirmed in code and is cheaper than you thought**: the
   "cross-examination" is not programmed as a conversation between agents. It is a
   `deny` with a `reason` — the harness shows that text to the Target and the Target
   self-corrects and re-proposes. A full round is free and 100% native. See §3.2.
5. **"Approval-gated assistant" is now one of the ideas the event itself suggests.**
   There will be clones. Our differentiator (measuring the damage, not classifying it)
   goes from a luxury to the only thing separating us from the pack, and it has to land
   in the first sentence in front of the jury. See §5.

---

## 1. The real rubric

Two different events share a sponsor and a tool. **The one that matters tomorrow is the
in-person one.**

| | In-person (Bright Data, SF) | Online (WeMakeDevs) |
|---|---|---|
| Date | **Sat Aug 29, 09:00–18:00 PDT** | Mon 24 → Sun 30 Aug |
| Deadline | **18:00 PDT on Saturday** | Sun 30, 20:00 London |
| Judging | **live presentation to the jury** | repo + 3-min video |
| Tracks | 3 (see §1.2) | 3, includes "Best UI" (iPads) |

If there is energy left by Sunday, the same repo also enters the online submission with
no extra work beyond the video and the README — but **that is not planned before the
project stands up**.

### 1.1 Saturday's agenda and the real budget

| Time | Block | What we do |
|---|---|---|
| 09:00–09:45 | Breakfast / check-in | Setup and environment verification |
| 09:45–10:00 | Kickoff | Listen; note the jury's signals |
| 10:00–11:00 | Workshops | **One listens, the other keeps building** |
| 11:00–14:00 | Hacking | Block 1 — 3h |
| 14:00 | Pizza | Eat while something runs |
| 14:00–17:00 | Hacking | Block 2 — freeze at 16:00 |
| 17:00–18:00 | Wrap-up | Pitch rehearsal and submission |
| **18:00** | **Deadline** | Live presentation |

Net build time: **~4 hours** (11:00–14:00 + 14:00–16:00, discounting integration and
food). The whole plan in §7 is calibrated to that number.

### 1.2 Tracks of the in-person event

| Track | Prize | What it measures (verbatim) |
|---|---|---|
| **Best Use of the Agent Harness** | NVIDIA DGX Spark (~$5k) | *"For the agent that gets the most out of the harness. What matters is that the harness is doing the work rather than sitting underneath a thin wrapper."* |
| **Best Code Quality** | Mac Mini | *"For the team that treats a hackathon repo like real software. Run your pull requests through Qodo and deal with what it finds before you merge."* Using Qodo is mandatory in this track |
| **Best blog post** | Keychron | *"Write up what you built, how you wired it together, and what broke along the way."* Published anywhere |

A team wins a single track. There is also a "surprise" announced by the host (last time
it was 10 keyboards and a second DGX Spark) — not actionable, but it reinforces being
present and on time.

Hard requirements: **open source repo**, teams of 1 to 4, laptop + charger + ID. OpenAI
gives **$50 in credits to every attendee**.

### 1.3 What the event says we are building

The event's opening line, which is literally our thesis:

> *"You get an agent working in an afternoon. Then you point it at something that
> matters and it can't reach your tools, can't run its own code safely, and **can't be
> stopped before it does damage**."*

And the bar: *"A chatbot answers questions. An agent acts on them... That is the bar."*

What the harness offers and the jury expects to see exercised: MCP connections (even
with OAuth), **sandboxed execution**, **human approvals**, **subagents**, and **sessions
that survive reconnections**. Those are the five axes of the main track, and the
architecture in §3 covers them by construction.

### 1.4 The suggested ideas — and why that is now a risk

The event suggests six starting points: code review agent, incident responder, analytics
agent, research desk, **approval-gated assistant**, untrusted code runner.

Two of those six revolve around human approval. **There will be several tables showing
"the agent asks permission before doing something irreversible."** That does not
invalidate CROSS-EXAM: it forces it to differentiate out loud. The difference is not
that we stop the action — it is **what happens during the pause**. They show a button;
we show an investigation with executed evidence.

### 1.5 Qodo — it is a process requirement, not a final task

Setup: qodo.ai → Integrations → SaaS → GitHub → install the app on the repo. A single
admin installs it and covers the team; 14-day trial, no card. The review starts when the
PR opens; otherwise it is triggered by commenting `/agentic_review`.

**Operational consequence**: you cannot work on `main` and assemble the PRs at the end.
From the first commit, **one task = one branch = one PR = one Qodo review = merge**. It
is the discipline `AGENTS.md §7` already requires. With 4 hours, the real cost is minutes
per PR — and it is the only way to compete in the second track without spending an extra
hour.

---

## 2. TrueForge — verification against the source code

Clone of `github.com/truefoundry/trueforge`, `main` @ `a3a1395` (2026-08-28; the commit
is from today: *"feat: Schedules (#472)"* — the repo moves fast).

### 2.1 What the brief claimed and was CONFIRMED

| Claim from brief §3 | Status | Evidence |
|---|---|---|
| Everything on `/api/v1/sessions/*`, REST + SSE | ✅ | `packages/trueforge/src/routes/{sessionRoutes,turnRoutes}.ts` |
| Every route restricted to `created_by` | ✅ | `apis/sessions.ts:216`, `apis/turns.ts:355-372` (`createdBy === user.userRef`) |
| A turn ends `done` with non-empty `required_actions` (a pause, not a block) | ✅ | `agent-session/schemas/turn.ts:100-103` |
| Resolving an approval = a new turn with `user.tool_approval` | ✅ | `core/events/schema.ts:83-90`; `docs/api/use-agent.mdx` |
| `deny.reason` is shown to the agent | ✅ | `schema.ts:72-76` — *"Optional reason shown to the agent when denied."* |
| `tool.approval_required` only carries `{id, source_event_id}`; it has to be correlated with the preceding `model.message` | ✅ | `schema.ts:322-338` (`ToolCallRefSchema`) + the official recipe in `docs/api/use-agent.mdx` |

### 2.2 Corrections and new findings (important)

**A. The `created_by` restriction is irrelevant in local mode.** Without OIDC, *every*
request resolves to the fixed identity `trueforge-default`
(`packages/trueforge/src/auth/identity.ts:15-18`, `LOCAL_USER_CONTEXT`). Meaning: in
local mode any client can read and drive *any* session. The brief dropped the "two
independent agents" architecture over this, and it did not need to. **It is still better
for the orchestrator to create both sessions** — it is cleaner, and it is the only thing
that keeps working if the harness runs with login. Note it in the README as a conscious
design decision, not an accident.

**B. `npx @truefoundry/trueforge@latest` requires Node ≥ 22.14**, runs on
`http://localhost:8790`, stores in local SQLite. There is also a hosted mode via
`docker compose` on `:8791`. Local is more than enough.

**C. There is a second channel besides allow/deny: `user.tool_response`.** The
`tool.response_required` event covers *any* client-side tool (it is the mechanism behind
`ask_user_question`). The client returns free-form `content`. We do not need it for the
MVP, but it is the path if we ever want the Evaluator to *inject* a result rather than
only approve/deny.

**D. Approval policy — confirmed and configurable per MCP server.** Default:
`require_approval_for_tools: ["@write", "@destructive"]`, derived from each tool's MCP
annotations. It can be forced to `["@all"]` or to literal names (`["process_refund"]`).
API only, not via UI (`agent-session/schemas/agentSpec.ts:95-101`).

**E. Subagents: confirmed in code, not just marketing.**
`core/capabilities/builtins/DynamicSubAgents.ts`,
`core/runtime/CreateDynamicSubAgentThread.ts`. Built-in `create_sub_agent` tool, **on by
default**. Rules: they run in parallel, share tools and sandbox with the root, **do not
nest** (one level), cannot talk to the user — **but their tool calls do pause for
approval**. They emit `thread.created` / `thread.done` on the stream, so they are visible
in the demo.

**F. Sandbox: there is a single provider and it needs an external account.**
Only **Daytona** (`packages/trueforge/catalog/sandbox-catalog.yaml`; the rest of the code
hardcodes it: `sandboxProviderCatalog.ts:23`). The API key needs **Snapshots (create)**
permission, not just Sandboxes — without it, configuration fails even with a valid key.
Daytona gives **$200 of free compute with no card**. The sandbox is **off by default**
per agent (`config.sandbox.enabled: true`), is provisioned on demand, and **persists
across turns of the same session** (files survive).
→ **Action for today: get the Daytona API key with snapshot permission and leave the
provider configured.** It is the only external dependency that can ruin Saturday, and the
sandbox is an entry requirement of the hackathon.

**G. Code Mode = the piece that joins sandbox + approval.** The agent writes a Python
script in the sandbox that calls MCP tools via `mcp_client.call_tool(...)`; the calls are
bridged back to the harness (tokens never enter the sandbox). And — crucially — **a script
calling a tool under `require_approval_for_tools` still pauses for approval**. Meaning:
"running code in a sandbox" and "pausing for human approval" can be a single scene of the
demo, not two.

**H. Skills = git repos with a `SKILL.md`**, sparse-cloned inside the sandbox (schema
`{type,name,url,path,ref,description}`). They require the sandbox to be on. Cheap to add:
our own skill with the cross-examination playbook, served from our own repo. Adds one more
"harness usage" axis for ~20 minutes.

**I. Schedules landed today** (`scheduleRoutes.ts`, PR #472). Cron for agents. We do not
need it; if there is time left it is the cheapest "persistent session" argument (an
overnight docket audit).

**J. MCP: remote servers by URL only.** There is no stdio transport — any URL can be
registered with auth via static headers or OAuth (`docs/mcp-servers.mdx`). Our own MCP has
to be a **local HTTP server** (streamable HTTP). The shipped catalog includes, among
others: `github`, `stripe`, `supabase`, `linear`, `sentry`, `exa`, `bright-data`,
`posthog`.
→ `bright-data` is in the catalog and Bright Data is the venue's host. Worth a cheap nod
if it fits; do not force it.

**K. Concurrency trap**: *"Creating a new turn in a session automatically cancels any turn
still running in that session."* The orchestrator has to serialize per session, never
sending a turn while another is running. And the default SDK client has a 60s timeout —
for long SSE it has to be raised (`timeoutInSeconds: 600`).

### 2.3 Models

The catalog ships `openai` (`gpt-5.4-mini`, among others), `anthropic`
(`anthropic/claude-sonnet-4-6` appears in the doc examples) and custom OpenAI-compatible
providers. OpenAI is the event's model partner and gives $50 in credits in person.
→ **[ASSUMPTION]** it is preferable to use OpenAI for the Target agent (cheap, and it is
the sponsor) and a stronger model for the Prosecutor if the adversarial reasoning demands
it. Decide with evidence on Saturday, not before.

---

## 3. Recommended architecture

### 3.1 The pitch in one sentence

> Every guardrail on the market **predicts** the blast radius of an irreversible action.
> CROSS-EXAM **measures** it: it executes the proposed action against a replica in a
> sandbox, rubs the evidence in the agent's face, and forces it to defend or correct its
> plan before touching production.

### 3.2 The finding that makes everything cheap: the cross-examination is a `deny` with a `reason`

The brief framed "challenge → defense → decision" as if a conversation channel between
agents had to be programmed. It does not, and programming it would be fragile.

The native cycle is:

```
Target proposes  bulk_refund(filter="status = 'disputed'")
      ↓ tool.approval_required  (pause, turn done)
Prosecutor measures in the sandbox → the replica says: 1,204 charges, $96,310,
                                     and 611 of them were ALREADY refunded
      ↓ deny(reason: "You declared 7 disputes for $840. The replica returns
                      1,204 charges for $96,310, of which 611 already have a
                      settled refund — you would refund them twice, and the
                      processor does not reverse those. Narrow the filter or
                      justify the amount.")
Target sees the reason (native harness behavior) and RE-PROPOSES
        bulk_refund(filter="status='disputed' AND refunded_at IS NULL
                            AND opened_at > now()-30d")
      ↓ tool.approval_required  (second pause)
Prosecutor measures again → 7 charges, $840, 0 duplicates → allow
      ↓ the Target executes the real refund
```

One single round, zero custom protocol, and the agent's correction is harness behavior —
not something we fake. For the video it is the whole scene: the agent lies without meaning
to, the prosecutor proves it with numbers, the agent corrects itself, and only then does it
go through.

**Mandatory third outcome: `escalate`.** When the Prosecutor can neither prove nor rule out
the damage (or the value exceeds a threshold), it does not decide: **it stops and hands it
to a human**. That is what genuinely satisfies the hard *"pausing for human approval"*
requirement — a human really decides, it is not theatre.

### 3.3 Components

| # | Component | What it is | Rubric axis it covers |
|---|---|---|---|
| 1 | **Target agent** | TrueForge session A. A normal ops agent with our own MCP of dangerous actions. `require_approval_for_tools: ["@all"]` | real MCP tools |
| 2 | **The Bench** (orchestrator) | Node service using the SDK. Creates both sessions, consumes the SSE, indexes events by `id`, correlates `tool.approval_required` → `model.message` to extract name + args, and serializes turns | (the glue; it is "the harness doing the work") |
| 3 | **Prosecutor agent** | TrueForge session B, **with the sandbox on**. Receives the charge sheet and delegates to **parallel subagents**: (a) blast radius — runs Code Mode against the replica; (b) policy — loads the playbook **skill**; (c) precedent — queries the docket of previous verdicts | sandbox + subagents + skills |
| 4 | **Replica / ledger** | Seeded SQLite or JSON, uploaded to the sandbox. This is what the damage is measured against. Deterministic → the demo does not depend on the model's mood | sandbox doing real work |
| 5 | **Human escalation** | `escalate` verdict → the decision surfaces to the UI and waits for a person | human approval |
| 6 | **Docket** *(optional, M7)* | Persistent record of charges, evidence, and verdicts across sessions | persistent sessions |
| 7 | **Verdict UI** | The Prosecutor emits an ```openui``` block with the verdict card | what the jury watches live |

The five axes of the main track are covered by construction, not by decorative addition.

### 3.4 Framing note — avoid sounding like "another approval button"

CROSS-EXAM is not demoed as an app: it is demoed as **a layer that stands in front of an
agent that already exists**. The Target has to look like a perfectly ordinary support agent
— not like something we wrote in order to fail. The more unremarkable the Target looks, the
more obvious it is that the prosecutor is the product.

With 4 hours there is no time to package a reusable `npx cross-exam`, and there is no need
to pretend otherwise. What does fit at no cost: the orchestrator taking the **Target agent's
name as a parameter**, and saying so in the demo — *"this hooks onto any agent in the
harness, not just ours."* Same idea, demonstrated in one line of configuration instead of a
published package.

---

## 4. The verdict card: what the jury watches during the demo

There is no UI track at the in-person event. But judging is **live**, and in a live demo the
interface *is* the argument: the jury does not read your code, it watches the screen for a
few minutes and decides whether the harness is doing real work. That is why the verdict card
remains a priority — the justification changes, not the decision.

I read the Generative UI instruction generator (`core/capabilities/builtins/OpenUI.ts`, ~300
lines of prompt). OpenUI is not "markdown with charts": it is a declarative DSL with
progressive streaming that the agent emits inside an ```openui``` fence and the client
renders as real React (no arbitrary code execution). **It is on by default** — meaning it
costs prompt, not frontend.

Available, verified in the prompt:

- **Layout**: `Stack`, `Card`, `Tabs`, `Accordion`, `Steps`, `Modal`, `Separator`.
- **Data**: `Table` (column-oriented, cells can be components), `Tag` with variants
  (`danger`/`warning`/`success`), `Callout`, `CodeBlock`.
- **Charts**: bars, horizontal bars, lines, area, pie, donut, radial, radar, scatter.
- **Forms**: `Form`, `Input`, `Select`, `Buttons`, with validation.
- **Reactivity**: `$variables` with two-way binding, `@Set`, `@Reset`, and data functions
  (`@Filter`, `@Sort`, `@Count`, `@Sum`, `@Each`, …).
- **Actions**: `Action([@ToAssistant("text")])` — **a UI button sends a message back to the
  agent**. A UI→agent round trip with no frontend to write.

The Prosecutor's card, then, comes out of the prompt: a header with the charge, a red
severity `Tag`, a bar chart of **declared vs. measured**, a table of affected charges, and
the Allow / Deny / Escalate buttons via `@ToAssistant`.

**Scope decision for a single day: only this.** Our own frontend (Docket / Courtroom panels
over `<TrueForgeUI>`) is **out of the plan**. With 4 net hours it does not fit, and it buys
nothing the card does not already buy.

---

## 5. Competitive landscape — closed

Open items from brief §4, resolved:

- **The space exists and is full of classifiers.** Prismor, EvalGuard, Snyk and several
  2026 papers (e.g. *AgentTrust: Runtime Safety Evaluation and Interception for AI Agent
  Tool Use*, arXiv 2605.04785) describe the same shape: a per-action trust layer returning
  *allow / warn / block / escalate* at the tool-call boundary.
- **They all decide by policy or by pre-execution classification.** None of the ones I found
  **executes the proposed action against a replica to measure the real damage and then
  confronts the agent with that evidence.** That is exactly our delta, and it is not
  cosmetic: it is the difference between an *a priori* judgment and an evidentiary one.
- **HumanLayer** is still the closest neighbor on the "approval gate" axis, and it is still
  passive (it routes to a human; it does not investigate).
- The conceptual backing from Anthropic's post on long-running harnesses (an independent
  Generator/Evaluator, because models approve their own work) still holds and is worth
  citing in the README — it gives the idea lineage without pretending we invented it.
- I found no public signal about what the other teams at this hackathon are building. That
  is normal; not worth spending more time there.

**Pitch line derived from this:** *"Every guardrail on the market predicts the blast radius.
CROSS-EXAM measures it."*

### 5.1 And the separation that has to be said in the room

The real competitor tomorrow is not Prismor or HumanLayer: it is the other tables that picked
"approval-gated assistant" from the event's idea list (§1.4). Against them the distinction
has to be immediate and physical, not conceptual:

> *"The others stop the action and show you a button. We stop the action, execute it against
> a replica in the sandbox, and show the agent the numbers that prove it was wrong — until it
> corrects its own plan. The human only steps in when not even the prosecutor can prove it."*

That sentence is the pitch. It goes in the first line of the README and in the first 15
seconds in front of the jury.

---

### 5.2 Field evidence: the guardrails the market actually sells, and why they fail here

Source: [Fini's roundup of refund agents](https://www.usefini.com/blog/top-10-ai-agents-for-handling-refunds-returns-cancellations-automatically)
(vendor listicle — Fini ranks itself #1, so its own metrics are marketing and are not cited).

What it contributes: **it validates the domain and exposes the exact gap.** These products
move real money today — they execute refunds against the processor, cancel subscriptions with
prorated credit, issue RMAs (Fini, Kustomer, Gorgias, Yuma). Our demo's Target agent is not a
straw man: it is what is already in production.

And the state of the art in protection, verbatim from the article, is entirely **static and
pre-execution**:

| Control the market sells | What it looks at | Why it does not catch our case |
|---|---|---|
| Per-action dollar ceiling (*"hard dollar ceiling above which no autonomous refund executes"*) | The amount of **one** refund | Every individual refund is small and legitimate. The damage is that the predicate touches 1,204 rows instead of 7 |
| Frequency cap | The **customer** who complains repeatedly | These are 611 charges from different customers who were already paid once |
| Policy exclusion | Attributes of **the order** | Every order is eligible; what is wrong is the `WHERE` |
| Confidence score | The agent **evaluating itself** | Exactly what Anthropic's post says fails. The agent is genuinely confident. And wrong |
| Audit log | What happened | **After** the money is gone |

All five sail past — the four pre-execution controls are the ones FR-017/FR-018 contrast. Not by chance: they all evaluate *the shape of the action*, none of them
*its real reach over the data*. That is, literally, the space where CROSS-EXAM lives.

From Intercom Fin and Lyzr, also verbatim: *"guardrails for money-moving actions must be
built rather than configured out of the box."* Anyone building a money-moving agent on a
framework has to hand-build the protections.

**Consequence for the demo (§7.3, a 10-minute task):** configure the Target **with those same
guardrails in place and visible**, and show them approving before the Prosecutor steps in:

```
Target proposes  bulk_refund(status='disputed')  →  "7 cases, $840"
  ✅ $2,000/refund ceiling ............. PASS
  ✅ frequency cap ..................... PASS
  ✅ eligibility policy ................ PASS
  ✅ confidence score: 0.94 ............ PASS
  ─────────────────────────────────────────────
  🔴 CROSS-EXAM measures in the sandbox: 1,204 charges · $96,310 · 611 duplicates
```

Four green checks and the real number underneath. It answers, in advance, the objection from
the judge who knows the space (*"wouldn't a dollar limit solve this?"*) without having to
argue it.

**Context numbers to open the pitch** (cited by the article, **verify against the primary
source before putting them on a slide**): NRF 2025 — 19.3% of online sales are returned
($849.9B), 9% fraudulent. Gartner — agentic AI would autonomously resolve 80% of common
service cases by 2029.

---

## 6. Risks, ordered by how much they can ruin Saturday

With 4 net hours, a risk that was "annoying" over two days is now terminal. Reordered for a
single day:

| # | Risk | Impact | Mitigation | When |
|---|---|---|---|---|
| R1 | Daytona API key without **Snapshots** permission → the sandbox provider does not configure. No sandbox, no project | **Terminal** | Get the key **tonight** with Sandboxes + Snapshots(create), configure the provider and **actually run a test script in the sandbox** | **Today** |
| R2 | Arriving at 11:00 with no environment and burning the first block installing | **Terminal** — it is 25% of the time | The §7.1 checklist completed tonight; at 09:00 it is only re-verified | **Today** |
| R3 | The end-to-end loop does not close before 14:30 | **Terminal** | Hard cutline (§7.3): if M4 is not done by 14:30, subagents, card, and docket are cut with no discussion | 14:30 |
| R4 | The Prosecutor reasons instead of measuring (hallucinates the blast radius) | High — it kills the entire differentiator | The replica is deterministic and the verdict **cites numbers that came out of the sandbox**. If the subagent did not execute code, the verdict is `escalate` by construction | Design |
| R5 | A new turn cancels the running turn in the same session | High — irreproducible races under pressure | The orchestrator serializes per session: one queue per `sessionId`, never two turns in flight | Design |
| R6 | The SDK's default 60s timeout against long SSE | High, and misleading (it looks like an agent bug) | `timeoutInSeconds: 600` on the client | Design |
| R7 | The live demo fails in front of the jury (wifi, slow model, non-determinism) | High — it is the deliverable | **Record a successful run at 16:00 as insurance.** Seeded, deterministic scenario. Rehearse twice | 16:00 |
| R8 | Qodo left for the end → no review trail | Medium, but it loses a whole track | A PR per task from commit 1; `/agentic_review`; fix; merge | All day |
| R9 | The TrueForge repo moves fast (commits from today) | Medium | Pin the `@truefoundry/trueforge` and SDK versions; note them in the README | **Today** |
| R10 | Scope creep: chasing our own frontend or the docket and leaving the core half-done | Medium | Already out of the plan (§4). Not reopened | — |

---

## 7. Battle plan — 4 net hours, 2 people

**Primary objective: Best Use of the Agent Harness (DGX Spark).** It is the track that
measures exactly what the architecture already does, and the sentence that defines it — *"the
harness is doing the work rather than sitting underneath a thin wrapper"* — describes
CROSS-EXAM better than almost anything else buildable in a day: two harness sessions, one
investigating the other.

**Best Code Quality is not chased, it is harvested**: it comes free by keeping the PR + Qodo
discipline. **Blog post: only if the project stands at 16:00** — it is the cheapest prize to
win with what we will already have written.

### 7.1 Tonight (~60–90 min) — environment only, no product

This is not "getting a head start on the project": it is not giving away the first hacking
block to installation. Everything here is infrastructure, not code for the idea.

- [ ] Daytona account + API key with **Sandboxes** and **Snapshots (create)** permissions.
- [ ] Node ≥ 22.14. `pnpm install && pnpm exec trueforge` from the workspace (pinned 0.1.4, research D-02 — never `npx`) → opens on `:8790`.
- [ ] Configure the model provider (own key today; tomorrow the $50 from OpenAI).
- [ ] Configure the sandbox provider with the Daytona key.
- [ ] **Acid test**: a throwaway agent with `config.sandbox.enabled: true`, ask it to run a
      Python script in the sandbox and **see the real output**. If this does not work
      tonight, there is no project tomorrow. It is the only checklist item that cannot be
      resolved at the venue.
- [ ] Public GitHub repo + Qodo app installed + `pnpm` scaffolding + SDK installed, with
      **pinned versions**.
- [ ] Manually verify in the chat UI that a `@write` tool pauses asking for approval and that
      a `deny` with a reason reaches the agent.
- [ ] Leave the two recipes from `docs/api/use-agent.mdx` open (approvals and event
      correlation). They are copy-paste; they do not have to be invented tomorrow.

### 7.2 Integration contract — agreed at 09:30, before typing

We are two people working in parallel against the same meeting point. The only artifact that
has to exist before the code is **the shape of the charge sheet**: the JSON the orchestrator
hands the Prosecutor (tool, args, relevant transcript, replica snapshot) and the shape of the
verdict the Prosecutor returns (`allow` / `deny` + `reason` / `escalate`, plus the cited
evidence). Ten minutes of written agreement save the hour lost at merge time.

### 7.3 Milestones, with a hard cutline

| Milestone | Window | What is done | Who |
|---|---|---|---|
| **M0** | 09:00–10:00 | Environment re-verified at the table. §7.2 contract agreed | Both |
| — | 10:00–11:00 | Workshops: **A listens** (jury signals), **B builds M1** | Split |
| **M1** | →11:30 | Our MCP up with `bulk_refund` / `issue_payout` / `close_account`; seeded ledger; Target agent created with `require_approval_for_tools: ["@all"]`; the pause is visible in the UI | B |
| **M1b** | →11:45 | **Static guardrails visible on the Target** (per-refund ceiling, frequency cap, policy check) that *approve* the damaging action — the contrast from §5.2. ~10 min, high demo return | B |
| **M2** | 11:00–12:30 | Orchestrator: creates the session, consumes the SSE, indexes events by `id`, catches `tool.approval_required` and **extracts name + args** by correlating with the `model.message` | A |
| **M3** | 12:30–13:30 | Prosecutor session with sandbox: receives the charge sheet, **measures against the replica with Code Mode**, returns a verdict with numbers | A |
| **M4** | 13:30–14:30 | **The loop closes**: `deny(reason)` → the Target re-proposes → second measurement → `allow` → it executes | A + B |
| 🚨 | **14:30** | **CUTLINE.** If M4 has not closed, M5, M6, and M7 are cancelled and everything goes into making M4 work. A loop that closes wins; three half-features do not | — |
| **M5** | 14:30–15:15 | Parallel subagents (blast radius / policy / precedent) + the `escalate` path with a real human deciding | A |
| **M6** | 15:15–16:00 | Verdict card in OpenUI | B |
| **M7** | 15:15–16:00 | Second persistent session / docket, only if M5 and M6 are already done | B |
| **FREEZE** | **16:00** | No more code | — |
| — | 16:00–17:00 | README with the §5.1 pitch, Qodo evidence, **record the successful run as insurance** | Both |
| — | 17:00–18:00 | Rehearse the pitch twice. Submit | Both |

**Note on M5**: dynamic subagents are **on by default** in TrueForge. If the Prosecutor's
prompt asks to investigate three angles in parallel, it will probably delegate on its own —
M5 may cost prompt instead of code. Verify that before budgeting 45 minutes for it.

### 7.4 The live demo script

Three minutes, no improvising. Written before 16:00:

1. **15 seconds**: the sentence from §5.1. No context, no "hi, we're…".
2. **30 s**: the Target receives a reasonable business request and proposes `bulk_refund`. It
   declares "7 disputes, $840".
3. **60 s**: the pause. The Prosecutor picks up the session, delegates to subagents, and in
   the sandbox **runs the query against the replica**: 1,204 charges, $96,310, 611 already
   refunded. Show the sandbox output, not a model summary.
4. **45 s**: the `deny` with the evidence. The Target **reads the reason and corrects its own
   predicate**. Second measurement: 7 charges, $840, 0 duplicates. `allow`.
5. **30 s**: the case the prosecutor cannot prove → `escalate` → a person decides. That is
   where genuine human approval is visible.

The number that has to stay in the jury's head is **$96,310 vs $840**.

---

## 8. Decisions taken (2026-08-28) — inputs for the spec

1. **Team: 2 people.** Split in §7.3: **A** takes the critical path (orchestrator →
   Prosecutor → loop), **B** takes MCP + ledger + OpenUI card. During the 10:00–11:00
   workshops, A listens and B builds. The meeting point is the §7.2 contract, agreed at 09:30.

2. **Domain: refunds / payments.** The Target is a support agent processing disputes in
   batches. Irreversible tools of our own MCP: `bulk_refund`, `issue_payout`, `close_account`.
   The replica is a seeded, deterministic ledger.

   The risk of this domain (flagged when choosing it): money is abstract on video, you do not
   see a service fall over. **It is offset by the damage that is visceral: the double
   refund.** A settled refund is not reversed by the processor — it is money gone that does
   not come back. The charge sheet shows three numbers together and large: *declared* ($840),
   *measured* ($96,310), *already refunded* (611).

   The seeded ledger must include, at minimum: recent legitimate disputes, disputes **already
   refunded** (the duplicate trap), and old disputes outside the policy window. That way the
   Target's corrected predicate arises naturally rather than forced. **Deterministic, with no
   randomness** — the live demo cannot depend on the model's mood or on a different seed.

3. **UI: the OpenUI card only (level 1).** Our own frontend is out of the plan due to the cut
   to a single day (§4). This decision revises the one taken when we still believed there
   were two days and a UI track: with 4 net hours and no such track, level 2 does not fit and
   buys nothing.

### Still open (does not block the spec)

- **[ASSUMPTION to validate at the table]** Which model for each agent. OpenAI for the Target
  (sponsor, $50 credit); the Prosecutor is decided by measuring, not beforehand.
- **Blog post**: decided at 16:00 with the project already standing. Open prize, and by then
  the README already has 70% of the text written.
- **Sunday's online submission**: only if there is energy left after Saturday. Not planned
  before then.

---

## 9. New sources from this session

- Code: `github.com/truefoundry/trueforge` @ `a3a1395` — `packages/trueforge/src/{routes,apis,auth}/`, `packages/trueforge-core/src/{core,agent-session}/`, `packages/trueforge/catalog/*.yaml`, `docs/**`.
- In-person event page (Luma, Bright Data SF, Aug 29) — agenda, tracks, and prizes, provided by the user.
- [Rules](https://www.wemakedevs.org/hackathons/trueforge/rules) · [Resources](https://www.wemakedevs.org/hackathons/trueforge/resources) · [Kick-off](https://www.wemakedevs.org/blogs/agent-harness-hackathon-kick-off)
- [Qodo — GitHub Marketplace](https://github.com/marketplace/qodo-merge-pro) · [Qodo Git plugin](https://www.qodo.ai/features/qodo-git/)
- [Daytona pricing](https://www.daytona.io/pricing) · [daytonaio/daytona](https://github.com/daytonaio/daytona)
- [AgentTrust (arXiv 2605.04785)](https://arxiv.org/pdf/2605.04785) · [Prismor](https://www.prismor.dev/ai-agent-guardrails) · [EvalGuard](https://evalguard.ai/agents) · [Snyk — future of AI agent security](https://snyk.io/blog/future-of-ai-agent-security-guardrails/)
