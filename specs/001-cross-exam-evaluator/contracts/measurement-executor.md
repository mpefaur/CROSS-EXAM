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

**stdout** — the measurement, in the emoji grammar, and nothing else:

```
🧮1204
💰96310.00
♻611
```

**Exit codes**

| Code | Meaning | Orchestrator maps to |
| --- | --- | --- |
| `0` | measurement produced on stdout | a `Measurement` |
| `2` | criteria did not parse under the grammar ([data-model.md](../data-model.md) §5) | no measurement → `escalate` (FR-025 → FR-010) |
| `3` | ledger file missing or malformed | no measurement → `escalate` |
| other | any failure | no measurement → `escalate` |

`♻` counts rows matching the criteria that are **already irreversibly acted on** —
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

## Resolution order and the 20-second budget

1. Try `SandboxExecutor` with a fresh 20,000 ms `AbortSignal`.
2. If it returns `null` — failure, or the signal fired — try `LocalExecutor` with its **own**
   fresh 20,000 ms signal (FR-010: "the fallback executor is then attempted under the same
   20-second limit").
3. If that also returns `null`, the measurement is `null` and the verdict is `escalate`
   under rule 2. There is no third attempt and no retry loop.

Worst case a single case spends 40 s across both attempts; **no single attempt exceeds
20 s** (SC-011).

## Invariant

`Measurement.script_sha256` is the digest of the `measure.py` that actually ran, recorded on
every measurement. If the sandbox copy and the local copy ever diverge, the digests differ
and the run says so instead of quietly comparing two different pieces of arithmetic.
