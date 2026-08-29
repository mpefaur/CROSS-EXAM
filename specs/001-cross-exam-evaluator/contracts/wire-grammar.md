# Contract: emoji wire grammar — parser obligations

**Key registry**: [docs/emoji-grammar.md](../../../docs/emoji-grammar.md). That table is the
single source of truth for keys, arities and field order and is **not** duplicated here.
This file states only what the encoder and decoder in `packages/core/src/grammar/` must do
(FR-024, FR-025).

## Decoder

```ts
type DecodeResult<T> = { ok: true; value: T } | { ok: false; error: string };

decodeProposal(text: string): DecodeResult<ProposedAction>     // 🧾 💸 🔒 — data-model §4
decodeVerdict(text: string): DecodeResult<EvaluatorVerdict>     // ✅ ⛔ — data-model §9
decodeMeasurement(text: string): DecodeResult<MeasuredTriple>   // 🧮 — measure.py stdout, data-model §8
```

Obligations:

1. Ignore lines that are empty or whitespace-only. Exactly one line MUST remain; zero or
   more than one is a parse failure. Its first codepoint MUST be a registered key accepted
   by **that decoder** — a verdict key in `decodeProposal`, or a tool key in
   `decodeVerdict`, is a parse failure. One leading `U+FE0F` after the key is dropped
   (models add the variation selector to some symbols; the D-14 adapter drops it the same way).
   `📏` is the measurement request, which no Bench decoder accepts — the harness passes it
   to the `measure` server — so all three decoders reject it.
2. The rest of the line is split on `|`; each field is trimmed of surrounding whitespace.
   The field count MUST equal the key's arity (registry). Fewer or more is a parse failure.
   Return `{ ok: false }`. Never attempt a second, looser parse (FR-025).
3. Never infer an undelimited field value (FR-025). Never strip or interpret quotes. A `|`
   inside a value is unrepresentable: it shows up as a wrong field count and fails.
4. Fields are positional. The key fixes the meaning of each position; no field is optional.
5. `decodeMeasurement` accepts exactly `🧮`. It is the executors' decoder for `measure.py`
   stdout ([measurement-executor.md](./measurement-executor.md)) and runs nowhere else —
   the Bench builds `observed` from the `measure` tool's `structuredContent`, never from its
   text.
6. `decodeProposal` accepts `🧾`, `💸`, `🔒` and maps the key to `action`. All three fields
   are required by arity; a two-field proposal is a parse failure and the caller maps it to
   `escalate` (FR-002).
7. Numbers: `declared_count`, `measured_count` and `duplicate_count` are bare non-negative
   integers. `declared_value` and `measured_value` are `#.##` dollars, parsed to integer
   cents. Any other numeric form is a parse failure.
8. `decodeVerdict` accepts `✅` and `⛔` only, each with its three figures and a non-empty
   `reason`. There is no escalate key: escalation is the system's decision (`decide()`),
   never the Evaluator's, and a message under any other key is a parse failure that rule 4
   answers with guidance (data-model §9, research D-06).

## Encoder

1. Emits one line: key first, then the fields joined by ` | `, in registry order, no
   trailing newline.
2. `✅` and `⛔` MUST be emitted with the measured triple. Emitting either without it is a
   Constitution II violation, and is prevented by the type — the encoder takes a `Verdict`
   whose `evidence` is non-null for those two cases, not three loose numbers. An `escalate`
   `Verdict` has no wire form; the Bench renders it in its trace (registry § Verdicts).
3. A value containing `\n` or `|` is a programming error, not an escapable case: the
   encoder throws. Multi-line and multi-field values are unrepresentable by design
   (registry § Format).
4. No escaping is performed, and none is needed: no ledger value contains an emoji or a `|`
   (registry § Invariant, [data-model.md](../data-model.md) §1).

## Round-trip test obligation

`decodeProposal(encodeProposal(p))` deep-equals `p`, for every proposal in the fixture set;
and every malformed input class above has a test asserting `ok: false` (research D-12).

## Who decodes what

The patched harness ([research.md](../research.md) D-14) also reads the tool line — to turn the
message into a tool call — but it maps fields to string arguments by position and validates
nothing. `decodeProposal` runs in the Bench on the `model.message` content and is the only
source of truth for what was proposed. The harness's synthesised arguments are never decoded
by the Bench. `observed` is built from the `measure` tool result's `structuredContent`; no
grammar text is decoded for it.
