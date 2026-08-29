# Contract: emoji wire grammar — parser obligations

**Key registry**: [docs/emoji-grammar.md](../../../docs/emoji-grammar.md). That table is the
single source of truth for keys and is **not** duplicated here. This file states only what
the encoder and decoder in `packages/core/src/grammar/` must do (FR-024, FR-025).

## Decoder

```ts
type DecodeResult<T> = { ok: true; value: T } | { ok: false; error: string };

decodeProposal(text: string): DecodeResult<ProposedAction>
decodeVerdict(text: string): DecodeResult<EvaluatorVerdict>      // ⚖ 📝 and the cited 🧮 💰 ♻ — data-model §9
decodeMeasurement(text: string): DecodeResult<MeasuredTriple>     // 🧮 💰 ♻ only — measure.py stdout, data-model §8
```

Obligations:

1. Split on `\n`. Ignore lines that are empty or whitespace-only. Every other line MUST
   begin with a registered key from the registry **for that direction** — a verdict key in
   a proposal, or a proposal key in a verdict, is a parse failure; its value is the rest of the line,
   literal, trimmed of trailing whitespace only, after dropping one leading `U+FE0F` (models add
   the variation selector to `⚖`, `♻`, `🗂`; the D-14 adapter drops it the same way).
   `🗂` and `🧾measure` belong to the measurement request (registry § Measurement request),
   which no Bench decoder accepts — the harness passes it to the `measure` server —
   so `decodeProposal` rejects both.
2. An unregistered leading character, or a line with no key, is a **parse failure**. Return
   `{ ok: false }`. Never attempt a second, looser parse (FR-025).
3. A repeated key is a parse failure. A missing required key is a parse failure.
4. Never infer an undelimited field value (FR-025). Never strip or interpret quotes.
5. Line order is irrelevant — index by key, not by position.
6. `decodeMeasurement` accepts exactly `🧮`, `💰`, `♻` — all three required, `⚖`/`📝` are a
   parse failure. It is the executors' decoder for `measure.py` stdout
   ([measurement-executor.md](./measurement-executor.md)) and runs nowhere else — the Bench
   builds `observed` from the `measure` tool's `structuredContent`, never from its text.
7. `🔢` and `💵` are required on a proposal. Their absence is a parse failure and the caller
   maps it to `escalate` (FR-002).
8. Numbers: `🔢` is a bare non-negative integer. `💵` and `💰` are `#.##` dollars, parsed to
   integer cents. Any other numeric form is a parse failure.

## Encoder

1. Emits one line per field, key first, no padding, `\n`-separated.
2. `⚖allow` and `⚖deny` MUST be emitted together with `🧮`, `💰`, and `♻` in the same
   message. Emitting either without all three is a Constitution II violation, and is
   prevented by the type — the encoder takes a `Verdict` whose `evidence` is non-null for
   those two cases, not three loose numbers.
3. A value containing `\n` is a programming error, not an escapable case: the encoder
   throws. Multi-line values are unrepresentable by design (registry § Format).
4. No escaping is performed, and none is needed: no ledger value contains an emoji
   (registry § Invariant, [data-model.md](../data-model.md) §1).

## Round-trip test obligation

`decodeProposal(encodeProposal(p))` deep-equals `p`, for every proposal in the fixture set;
and every malformed input class above has a test asserting `ok: false` (research D-12).

## Who decodes what

The patched harness ([research.md](../research.md) D-14) also reads the `🧾` line — to turn the
message into a tool call — but it maps lines to strings and validates nothing. `decodeProposal`
runs in the Bench on the `model.message` content and is the only source of truth for what was
proposed. The harness's synthesised arguments are never decoded by the Bench. `observed` is
built from the `measure` tool result's `structuredContent`; no grammar text is decoded for it.
