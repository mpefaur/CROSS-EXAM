# Research brief — Agent Harness Hackathon (WeMakeDevs × TrueFoundry)

> Basis for deep research BEFORE writing the full spec. This is not the spec.
>
> ⚠️ **PARTIALLY SUPERSEDED by [`research-findings.md`](research-findings.md)**
> (2026-08-28). That doc corrects the timeline, the tracks, the scope, and several
> technical claims here against the live site and the source code.
> On conflict, `research-findings.md` wins.
> Event: Saturday 2026-08-29, San Francisco (Bright Data), 09:00–18:00.
> This doc gathers what is confirmed (with sources), what is assumed (marked), and what
> still needs research, so the research session does not start from zero.

---

## 1. The project (working hypothesis, not settled)

**Working name**: "El Adversario" / "The Adversary" (to be decided).

**What it is**: a second agent (the Evaluator) that stands in front of a first agent's
(the Target's) irreversible actions and, instead of merely approving/rejecting,
**actively cross-examines it** — building the worst case against the action it is about
to take — before letting it through or escalating it to a human.

**Where it comes from**: an evolution of a simpler idea ("passive approval gate") that was
dropped because it overlaps with HumanLayer (see §4). This approach adopts the
Generator/Evaluator pattern Anthropic published for long-running agent harnesses, applied
to a problem they did not cover: the risk of irreversible actions, not output quality.

**Validated technical mechanism** (from reading the actual source code, not marketing docs
— see §3): the Evaluator is the one that CREATES the Target's session (it stays as
`created_by`), subscribes to its live event stream, and when the Target proposes a tool
call that requires approval, the Evaluator resolves that pause by sending a new turn with
the decision (`allow` / `deny` + an optional reason the Target sees).

**Why it competes well** (full rubric in §2): it uses approvals, sandboxing (to simulate
the worst case), subagents (the evaluator itself), and persistent sessions — the 4 axes
the main track scores — and it is not a variant of any of the 5 examples the hackathon
itself suggests.

---

## 2. The rubric (confirmed, from the official site)

Sources: [Rules](https://www.wemakedevs.org/hackathons/trueforge/rules) ·
[Getting Started](https://www.wemakedevs.org/blogs/agent-harness-hackathon-kick-off) ·
[Resources](https://www.wemakedevs.org/hackathons/trueforge/resources)

### Tracks

- **Best Use of TrueForge** → NVIDIA DGX Spark ($5k). Measures: real MCP tools, generated
  code running in a sandbox, a pause for human approval before something irreversible,
  work delegated to subagents. Direct quote: *"what matters is the harness doing the work,
  not being a thin wrapper."*
- **Best Code Quality** (Qodo) → Mac Mini. Using Qodo is mandatory, with evidence in the
  README (see the submission checklist below).
- **Best Blog Post** → Keychron. Optional, if a writeup is published.
- A team wins **a single track**, even though everyone competes in all of them.

### ⚠️ Unresolved inconsistency

One of the fetched pages also mentioned a "Best UI" track (iPad prize) which does NOT
appear in the event description the user pasted, nor in `/rules`. It may belong to another
hackathon by the same organization, mixed into the search result. **Confirm on the live
site tomorrow before assuming it exists.**

### Submission requirements (checklist)

- [ ] Public repo
- [ ] README with setup instructions
- [ ] 3-minute demo video showing the agent working
- [ ] Written explanation of the TrueForge integration
- [ ] A "Qodo Code Review Evidence" section: a link to a representative merged PR, a
      summary of Qodo's findings and what was done with them, and the history of reviewed
      PRs
- [ ] (Optional) a link to the blog post if competing in that track

### What they say NOT to build

Direct quote: *"the agent has to be doing the work, not merely generating a response."*
They give 5 example categories — **avoid direct clones**: developer ops agent, research
agent, data workflow agent, engineering workflow agent, ops agent.

---

## 3. TrueForge — what is technically confirmed from reading the source

Repo: [github.com/truefoundry/trueforge](https://github.com/truefoundry/trueforge)
(MIT, ~4.8k stars, launched 2026-08-19 — this hackathon is its debut, so there is no
history of previously winning projects with this particular tool).

### Session architecture (confirmed in `packages/trueforge/src/routes/*.ts`)

- Everything runs on `/api/v1/sessions/*`, REST + Server-Sent Events.
- **Every route is restricted to `created_by`** — whoever creates the session is the only
  one who can read it, list its turns/events, subscribe to it, or cancel it. **There is no
  native mechanism for one agent to spy on or decide over ANOTHER agent's session that it
  did not create itself.** This ruled out the naive version of "two independent agents
  crossing paths" — the version that does work is the Evaluator creating and owning the
  Target's session.
- A turn can end in `state.status: "done"` with a non-empty `required_actions`
  (`tool.approval_required`, `tool.response_required`, `mcp.auth_required`) — the turn is
  "paused", not blocked mid-execution.
- To resolve a pending approval: `POST /sessions/{id}/turns` with `previous_turn_id`
  pointing at the paused turn and `input: [{ type: 'user.tool_approval', thread_id,
  tool_call_id, approval: { status: 'allow' | 'deny', reason?: string } }]`.
- The `reason` field of a `deny` **is shown directly to the agent** on the next turn — "the
  Target corrects itself" is native behavior, it does not have to be programmed.
- The `tool.approval_required` event only carries `tool_calls: [{ id, source_event_id }]` —
  the tool's name and its arguments do NOT come with it, they have to be correlated with
  the preceding `model.message` event in the same stream. It is trivial, but it is real
  work to write.
- Key files to re-read tomorrow: `packages/trueforge/src/routes/sessionRoutes.ts`,
  `turnRoutes.ts`; `packages/trueforge-core/src/agent-session/schemas/turn.ts`;
  `packages/trueforge-core/src/core/events/schema.ts`.

### What marketing claims and I have NOT yet verified in code (pending, §6)

- Generative UI streaming via OpenUI (live dashboards/tables/forms) — there are docs at
  `docs/ui-sdk/reference/{atoms,containers,events,hooks,server,catalog}.mdx` still unread.
  This is CENTRAL to the demo (the cross-examination card) — it has to be read before
  committing to the visual design.
- Real sandbox execution (for the worst-case "dry-run") — `sandboxProviderRoutes.ts` and a
  `sandboxProviders` catalog exist; the contract is still unread.
- Subagents / delegation — only confirmed by marketing copy ("Delegate focused subtasks to
  parallel agents with their own clean context"); I have not yet found the exact
  schema/routes file. Pending grep: `subagent`, `delegate` in the repo.
- Schedules (`packages/trueforge-sdk/src/api/resources/schedules/`) — cron for agents. Not
  needed for the MVP, but it could be a "persistent session" bonus if there is time left.

### Setup

`npx @truefoundry/trueforge@latest` — configures models, MCP servers, skills, and the
sandbox. Docs at [trueforge.dev/introduction](https://trueforge.dev/introduction) and
[ui.trueforge.dev](https://ui.trueforge.dev/).

### Cookbook — examples already built by TrueFoundry (avoid cloning)

1. **Security Auditor** — reads a repo looking for vulnerabilities (GitHub + Exa) and files
   an issue for each one. Static analysis, not live interaction between agents — different
   from ours, but close in theme ("security"), so watch out for confusion in the pitch.
2. **Database Analyst** — answers natural-language questions by writing and running SQL via
   Supabase.
3. **Custom MCP Server** — a template for your own integrations.

---

## 4. Competitive landscape (what I researched, what is missing)

### Confirmed

- **HumanLayer** (YC, funded) — `require_approval()` over any function, routes to
  Slack/email/SMS/WhatsApp. It is the "passive approval gate" already productized — which
  is why the simple version of the idea was dropped.
  [Product Hunt](https://www.producthunt.com/products/humanlayer) ·
  [YC launch](https://ycombinator.com/launches/M8e-humanlayer-human-in-the-loop-for-ai-agents-and-beyond)
- **Anthropic — "Effective harnesses for long-running agents"** (engineering blog,
  2025-11-26): separates a Generator agent from a strict, independent Evaluator (a pattern
  inspired by GANs) because models tend to approve their own work. It is the conceptual
  basis of our approach.
  [Source](https://businessdatasolutions.github.io/ai-wiki/sources/2025-11-26-anthropic-effective-harnesses-long-running-agents)
- A tweet mentions that at **another, internal hackathon unrelated to this one** (30 teams,
  unidentified company), a project about "an agent that attacks another agent" inspired by
  that same Anthropic post won. **This is not evidence of what wins at OUR event** — it is
  only validation that the conceptual pattern has already proven to win in some real
  context, nothing more. [Source](https://x.com/aakashgupta/status/2078019250489561147)

### Not yet researched — do this before the spec

- [ ] Guardrails AI, CalypsoAI, Lakera Guard — other players in "agent
      firewalls/guardrails". Does any of them already do active adversarial evaluation
      (not just passive risk classification)?
- [ ] What teams built at sibling WeMakeDevs hackathons (AgentHack 2025, Scrape-Verse,
      Agents of SigNoz) using an "agent supervises/evaluates another agent" pattern —
      search `archive.wemakedevs.org` more deeply than the quick search I already did.
- [ ] What the teams attending THIS particular hackathon are announcing on WeMakeDevs'
      X/Discord — I found nothing yet; there may be no signal (normal the day before) or
      the search may be badly framed.

---

## 5. Open questions that define the spec's scope

Answer these before writing tasks — each one changes the design:

1. **Solo or on a team?** It changes the entire scope of the real 4-6 hacking hours
   (11:00–14:00 + 14:00–17:00 per the agenda).
2. **The Target's concrete domain/scenario.** We need 3-5 mocked tool calls with escalating
   risk and a credible narrative for the video (loose candidates so far: file cleanup +
   refunds, but not settled — look for something more visual/memorable during the research
   session).
3. **How much does the Evaluator cross-examine?** ONE single round trip was agreed
   (challenge → defense → decision), so as not to eat up the execution risk the adversarial
   version wins over the simple one. Do not open this up into free conversation between
   agents.
4. **How real is the worst-case sandbox?** Do we run actual code against a mocked
   filesystem/ledger, or is the "dry-run" a simulation reasoned out by the LLM itself with
   no real execution? Decide based on what we find in `sandboxProviderRoutes.ts`.
5. **Pitch name and narrative.** "El Adversario" vs other options — it has to sound good in
   a 3-minute video and in the README.

---

## 6. Technical checklist for the first 30 minutes at the venue

Do not start building without this:

1. `npx @truefoundry/trueforge@latest`, bring it up locally.
2. Read `/api/v1/docs` (interactive OpenAPI) — confirm that what §3 says about
   approval/session ownership behaves the same live.
3. Real smoke test: create a session, force a tool call that requests approval, send the
   decision with a `reason`, confirm the agent sees it.
4. Read `docs/ui-sdk/reference/*` to understand Generative UI before designing the
   cross-examination card.
5. Read the contract in `sandboxProviderRoutes.ts` to find out whether the dry-run is real
   execution or has to be simulated with reasoning.
6. Grep the repo for `subagent`/`delegate` to confirm the exact subagent API (today only
   confirmed by marketing, not by code).

If any of this does not behave as written above, **update this doc before writing the
spec** — do not carry on from memory.

---

## 7. Full bibliography (everything cited in this research)

- [The Agent Harness Hackathon | WeMakeDevs](https://www.wemakedevs.org/hackathons/trueforge)
- [Rules](https://www.wemakedevs.org/hackathons/trueforge/rules)
- [Resources](https://www.wemakedevs.org/hackathons/trueforge/resources)
- [Getting Started Guide](https://www.wemakedevs.org/blogs/agent-harness-hackathon-kick-off)
- [GitHub — truefoundry/trueforge](https://github.com/truefoundry/trueforge)
- [TrueForge docs — Agent Harness overview](https://www.truefoundry.com/docs/agent-platform/agent-harness/overview)
- [TrueForge introduction](https://trueforge.dev/introduction)
- [TrueForge SDK UI](https://ui.trueforge.dev/)
- [VentureBeat — TrueForge launch](https://venturebeat.com/orchestration/truefoundrys-open-source-ai-agent-harness-trueforge-boasts-30-75-cheaper-task-completion-than-claude-managed-agents)
- [Open Source For You — TrueForge launch](https://www.opensourceforu.com/2026/08/truefoundry-launches-trueforge/)
- [HumanLayer — Product Hunt](https://www.producthunt.com/products/humanlayer)
- [HumanLayer — YC launch](https://ycombinator.com/launches/M8e-humanlayer-human-in-the-loop-for-ai-agents-and-beyond)
- [Anthropic — Effective harnesses for long-running agents (summary)](https://businessdatasolutions.github.io/ai-wiki/sources/2025-11-26-anthropic-effective-harnesses-long-running-agents)
- [Tweet — internal hackathon, "an agent attacks another agent"](https://x.com/aakashgupta/status/2078019250489561147)
- [AgentHack 2025 archive](https://archive.wemakedevs.org/hackathons/agenthack25)

---

## 8. Scoring history (so the analysis is not repeated)

| Version | Realistic | Ceiling | Why |
|---|---|---|---|
| V0 — generic research desk / analytics / code review | — | — | Dropped: they match ideas the hackathon itself already suggests |
| V1 — passive approval gate | 50 | 70 | Overlaps with HumanLayer; technically solid but not very original |
| **V2 — adversarial evaluator (current)** | **70** | **90** | Same technical engine as V1 (de-risked by reading the code), but differentiated and backed by Anthropic's paper |
