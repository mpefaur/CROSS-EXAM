# Input for `/speckit.constitution`

Paste the block below verbatim as the command's argument:

```
/speckit.constitution <paste the contents of the "TEXT TO PASS" section>
```

Supporting context: [`research-findings.md`](research-findings.md) §7
(the 4-hour plan), §3.2 (mechanism), §5.2 (the evidence invariant).

---

## TEXT TO PASS

```text
Project: CROSS-EXAM. An adversarial Evaluator agent that stands in front of
another agent's irreversible actions, measures their real blast radius by
executing them against a replica in a sandbox, and cross-examines that agent
with the evidence before letting them reach production.

Context that conditions the whole constitution: this is built at a one-day
in-person hackathon (Saturday 2026-08-29, 09:00-18:00 PDT), with ~4 net hours
of build time, two people, and judging by a LIVE demo in front of a jury at
18:00. The constitution has to be defensible in a code review but calibrated to
that clock: rules that cost more than they save inside 4 hours are a luxury, not
a principle.

Adapt the existing constitution with these principles:

I. THE LIVE DEMO IS THE DEFINITION OF DONE. Every task is judged by whether its
result is visible in the three minutes of demo in front of the jury. What is not
seen is not built. There is a hard cutline: if the end-to-end loop (proposal ->
sandbox measurement -> denial with evidence -> the agent's re-proposal ->
approval) has not closed by 14:30, all remaining work is cancelled and the rest
of the time goes to closing it. Total code freeze at 16:00. A working loop wins;
three half-finished features do not.

II. EVIDENCE, NOT INFERENCE (NON-NEGOTIABLE). This is the product's invariant,
not a style preference. Every Evaluator verdict must cite numbers produced by
real code execution in the sandbox against the replica. If no execution
happened, the only permitted verdict is `escalate` to a human. Emitting `allow`
or `deny` based solely on model reasoning is forbidden: that makes us the same
classifier every product on the market already is, and erases the only reason
this project exists.

III. THE HARNESS DOES THE WORK. Before writing our own code, verify whether
TrueForge already provides the behavior natively - approvals with a reason
visible to the agent, dynamic subagents, generative UI, code mode, persistent
sessions. Own code is written only where the harness does not reach. This is
simultaneously the main prize criterion ("the harness doing the work, not a thin
wrapper") and the reason the project fits in 4 hours.

IV. VERIFIED BY A REAL COMMAND. "Done" means a command demonstrated it and its
output was read. The demo scenario is seeded and deterministic, with no
randomness: the live demo cannot depend on the model's mood. That end-to-end
scenario IS this project's required test. Given the 4-hour budget, a unit test
is not required for every behavior change; tests are required only where they
are cheaper than re-running the full scenario. This is a deliberate calibration
to the event clock, not a tacit exception.

V. ONE TASK = ONE BRANCH = ONE PR = ONE QODO REVIEW = MERGE. Never commit
directly to main. Every PR goes through Qodo (automatically on open, or
triggered with /agentic_review) and its findings are resolved before merge. It
is a mandatory requirement of the code-quality track and cannot be fabricated
retroactively at the end of the day.

VI. SECRETS NEVER ENTER THE REPO. The repository is public from the first commit
- a secret leaked there is irreversible and visible. Daytona and model-provider
keys live in the environment; `.env.example` documents only the names. A
secret's value is never printed or logged, not even truncated.

Also adjust the existing "Spec Before Code" principle: for this event there is
exactly ONE spec and ONE tasks.md covering the whole day. Per-task spec cycles
are not opened. Discovering new scope mid-implementation means cutting it, not
widening the spec.

Keep the existing Simplicity First and Surgical Change principles as they are:
they are still correct and they cost no time.

Update the Project field to CROSS-EXAM and bump the version.
```
