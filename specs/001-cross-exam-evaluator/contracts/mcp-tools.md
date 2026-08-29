# Contract: MCP server — the irreversible actions

Server: `packages/mcp`, a **streamable-HTTP** MCP server (`@modelcontextprotocol/sdk`
1.30.0). TrueForge registers remote MCP servers **by URL only** — there is no stdio
transport (`docs/research-findings.md §2.2 J`), so this runs as a local HTTP server the
harness connects to.

Registered with `require_approval_for_tools: ["@all"]`, so every call below pauses
(FR-001).

**How a call arrives.** The acting agent never sees this server's JSON schema. It writes the
proposal as grammar lines in its own text; the patched harness ([research.md](../research.md)
D-14) turns a message whose line starts with `🧾` into a call to `bulk_refund` (`💸` →
`issue_payout`, `🔒` → `close_account`), with the `|`-separated fields as string arguments
by position — `criteria`, `declared_count`, `declared_value`.
The argument tables below describe what the *harness* passes to this server, not what the
model types.

## Tools

### `bulk_refund`

| Argument | Type | Required | Notes |
| --- | --- | --- | --- |
| `criteria` | `string` | yes | Criteria grammar, [data-model.md](../data-model.md) §5 |
| `declared_count` | `string` | yes | passed raw from the second field; the Bench parses it, this server does not — the agent's own belief; missing ⇒ `escalate` (FR-002) |
| `declared_value` | `string` | yes | `#.##` dollars; missing ⇒ `escalate` |

Annotations: `destructive: true`, `idempotent: false`.

### `issue_payout`

Same three arguments. Used by the User Story 3 escalation scenario, whose measurement
($418,220.00) crosses the threshold.

### `close_account`

Same three arguments. Declared in the catalog for User Story 2's "a real money-moving agent"
framing; not exercised by the seeded scenario.

## Behavior on call

1. **Nothing runs at proposal time** — the harness holds the call at `tool.approval_required`.
   The Bench decodes the proposal from the model's own text (T026), never from this server.
2. On an `allow` resolution, and only then, apply the action to the **production** ledger
   and report completion (FR-014).
3. On `deny` or an unanswered `escalate`, leave the production ledger untouched (FR-014).

## What this server does not do

- The four guardrails (FR-017/FR-018) are computed by the Bench from the decoded proposal
  (research D-13), not here.
- Measurement is the `measure` tool on the separate read-only server `packages/measure`
  (research D-15, [measurement-executor.md](./measurement-executor.md)).

## What this server must never do

- Read, write, or open the **replica** ledger. Measurement is the executor's job
  ([measurement-executor.md](./measurement-executor.md)); the action server never measures,
  and the measurement never touches production (FR-004).
- Emit a count or a value it did not compute from the production ledger at execution time.
