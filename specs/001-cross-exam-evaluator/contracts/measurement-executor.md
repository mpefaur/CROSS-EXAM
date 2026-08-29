# Contract: measurement executor

The only interface in this system that may produce a `Measurement`. One transport, one
script — `measure.py` — run by the local executor (research D-03).

## The script

`packages/core/scripts/measure.py` — Python 3, **standard library only** (nothing to install on
venue wifi).

```
python3 measure.py --ledger <path.json> --table <charges|payouts> --criteria '<expr>'
```

**stdout** — the measurement, one line in the emoji grammar, and nothing else:

```
🧮1204 | 96310.00 | 611
```

**Exit codes**

| Code | Meaning | Executor maps to |
| --- | --- | --- |
| `0` | measurement produced on stdout | a `Measurement` |
| `2` | criteria did not parse under the grammar ([data-model.md](../data-model.md) §5) | `null` — no measurement (FR-025) |
| `3` | ledger file missing or malformed | `null` — no measurement |
| other | any failure | `null` — no measurement |

The third field, `duplicate_count`, counts rows matching the criteria that are **already irreversibly acted on** —
`refunded=true` for `charges`. It is the duplicate trap, and it is counted by the script,
never inferred.

The script never writes, never opens a socket, and never reads a path outside the one it
was given.

## The TypeScript function

One function, no interface — there is one transport (Constitution VIII; the sandbox was cut
on 2026-08-29, spec Clarifications, Session 2026-08-29):

```ts
function measure(input: {
  ledgerPath: string;              // CROSSEXAM_REPLICA_PATH — the only path the server holds
  table: 'charges' | 'payouts';
  criteria: string;
  signal: AbortSignal;             // fires at CROSSEXAM_MEASUREMENT_TIMEOUT_MS
}): Promise<Measurement | null>;   // null = no measurement produced
```

### What isolates it (FR-004)

Isolation from production is **by construction**: the `measure` server is configured with
`CROSSEXAM_REPLICA_PATH` only, so the production ledger's path does not exist in the process
that spawns the script. The subprocess itself is spawned as:

| Control | How | Checked by |
| --- | --- | --- |
| No host environment | `env` is `{ PATH }` only — no `PYTHON*`, no credentials | T015 unit test asserts the spawn options |
| No user site / env hooks | `python3 -I` (isolated mode) | same |
| Fresh working directory | `cwd` is a new `mkdtemp` directory, removed after the run | same |
| Only the replica | the ledger path is the argument; the script opens nothing else and never writes | script by inspection; `script_sha256` pins the bytes that ran |
| No network | the script opens no socket; **no OS-level network sandbox is enforced** | `script_sha256` — a changed script is a changed digest |

That is the whole claim. The word "sandbox" is not used for this executor.

## The tool the Evaluator calls

`measure`, on the read-only server `packages/measure` (`@crossexam/measure`, research D-15),
attached only to the Evaluator. Arguments `criteria` and `table` (strings; the harness passes
them from the two fields of the `📏` line). Non-destructive: no approval. It runs the resolution order
below. It opens only `CROSSEXAM_REPLICA_PATH` and listens on `CROSSEXAM_MEASURE_SERVER_URL`
(data-model §12).

| Outcome | `isError` | text content | `structuredContent` |
| --- | --- | --- | --- |
| measurement produced | `false` | the script's `🧮` line, verbatim — what the Evaluator reads and cites | the full `Measurement` (data-model §8): `{ criteria, table, measured_count, measured_value_cents, duplicate_count, executor, duration_ms, script_sha256 }` |
| no measurement — exit `2`, exit `3`, or the executor failed / timed out | `true` | one line: `no measurement: <criteria> on <table>`. `measure()` returns `null` for every failure and carries no exit code, so the line does not say which; the Bench never reads it (T017a, 2026-08-29) | `{ criteria, table, executor: null }` |

`criteria` and `table` are always present, copied from the call's own arguments, so the Bench
can tell a failed call on the proposal's criteria (D-06 rule 2b) from a call on other criteria
(rule 2a). The Bench builds `observed: MeasureAttempt | null` (data-model §8) from the
`structuredContent` of the **last** `measure` tool-result event of the Evaluator's turn; it
never parses grammar text and never runs the executors itself (research D-06).

## Resolution order and the 20-second budget

1. Spawn the script with a fresh 20,000 ms `AbortSignal`.
2. If it returns `null` — failure, or the signal fired — the tool returns the failure row
   above; when the call was on the proposal's criteria the verdict is `escalate` under rule
   2b. There is no second attempt and no retry loop.

**No attempt exceeds 20 s** (SC-011).

## Invariant

`Measurement.script_sha256` is the digest of the `measure.py` that actually ran, recorded on
every measurement, so a verdict names the exact script that produced its figures.
