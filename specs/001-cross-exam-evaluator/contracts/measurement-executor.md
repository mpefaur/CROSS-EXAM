# Contract: measurement executor

The only interface in this system that may produce a `Measurement`. Both transports run
**byte-identical code** — the same `measure.py` — which is what lets FR-004's "identical
measurement ... behind the same interface" be a fact rather than a claim (research D-03).

## The script

`packages/core/scripts/measure.py` — Python 3, **standard library only** (no `pip install`
inside a sandbox on venue wifi).

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

## The TypeScript interface

```ts
interface MeasurementExecutor {
  readonly kind: 'sandbox' | 'local';
  run(input: {
    ledgerPath: string;
    table: 'charges' | 'payouts';
    criteria: string;
    signal: AbortSignal;   // fires at CROSSEXAM_MEASUREMENT_TIMEOUT_MS
  }): Promise<Measurement | null>;   // null = no measurement produced
}
```

Two implementations, one behind each transport:

- **`SandboxExecutor` (default)** — uploads `measure.py` and the replica ledger into the
  Daytona sandbox, runs it, reads stdout. The sandbox persists across turns of a session,
  so the upload happens once per run.
- **`LocalExecutor` (fallback)** — runs the same file with `python3` in a temporary working
  directory, no network. Used **only** when the sandbox is unreachable (FR-004).

## The tool the Evaluator calls

`measure`, on the read-only server `packages/measure` (`@crossexam/measure`, research D-15),
attached only to the Evaluator. Arguments `criteria` and `table` (strings; the harness passes
them from the two fields of the `📏` line). Non-destructive: no approval. It runs the resolution order
below. It opens only `CROSSEXAM_REPLICA_PATH` and listens on `CROSSEXAM_MEASURE_SERVER_URL`
(data-model §12).

| Outcome | `isError` | text content | `structuredContent` |
| --- | --- | --- | --- |
| measurement produced | `false` | the script's `🧮` line, verbatim — what the Evaluator reads and cites | the full `Measurement` (data-model §8): `{ criteria, table, measured_count, measured_value_cents, duplicate_count, executor, duration_ms, script_sha256 }` |
| no measurement — exit `2`, exit `3`, or both executors failed / timed out | `true` | one reason line: `criteria did not parse: <detail>` · `ledger malformed: <detail>` · `both executors failed within 20 s` | `{ criteria, table, executor: null }` |

`criteria` and `table` are always present, copied from the call's own arguments, so the Bench
can tell a failed call on the proposal's criteria (D-06 rule 2b) from a call on other criteria
(rule 2a). The Bench builds `observed: MeasureAttempt | null` (data-model §8) from the
`structuredContent` of the **last** `measure` tool-result event of the Evaluator's turn; it
never parses grammar text and never runs the executors itself (research D-06).

## Resolution order and the 20-second budget

1. Try `SandboxExecutor` with a fresh 20,000 ms `AbortSignal`.
2. If it returns `null` — failure, or the signal fired — try `LocalExecutor` with its **own**
   fresh 20,000 ms signal (FR-010: "the fallback executor is then attempted under the same
   20-second limit").
3. If that also returns `null`, the tool returns the failure row above; when the call was on
   the proposal's criteria the verdict is `escalate` under rule 2b. There is no third attempt
   and no retry loop.

Worst case a single case spends 40 s across both attempts; **no single attempt exceeds
20 s** (SC-011).

## Invariant

`Measurement.script_sha256` is the digest of the `measure.py` that actually ran, recorded on
every measurement. If the sandbox copy and the local copy ever diverge, the digests differ
and the run says so instead of quietly comparing two different pieces of arithmetic.
