# Emoji grammar — key registry

> Single source of truth for the key set required by **FR-024** / **FR-025** of
> [`specs/001-cross-exam-evaluator/spec.md`](../specs/001-cross-exam-evaluator/spec.md).
> Both agents — the acting agent and the Evaluator — encode and decode against this table.
> Changing a key mid-build breaks both sides at once.
> Date: 2026-08-29 (supersedes the one-emoji-per-field form of 2026-08-28).

## Why

Adopted from [*The Minutiae of Tool-calling*](https://blog.can.ac/2026/08/03/the-minutiae-of-tool-calling/)
(Can.ac, 2026-08-03). The article's rule: reliability degrades with
**nesting × heterogeneity × cleverness**. A field holding JSON-escaped content has to be
re-parsed, and a failed re-parse is a lost tool call.

The article keys each field with an emoji. We take the emoji key and go one step thinner:
**one emoji names the whole message** — the tool being called, or the verdict — and its few
fields follow in a fixed order. No field name is spelled anywhere. Two benefits:

1. **Fewer tokens** than a spelled-out tool name and field names, on every turn of both agents.
2. **Higher accuracy on small models**: the key is a single unmistakable symbol, not a
   word the model can paraphrase, pluralize, or translate — and there is exactly one of it.

## Format

One line per message. One emoji per line. No nesting. No JSON inside a field.

```
<emoji><field> | <field> | <field>
```

- The emoji is the first codepoint of the line (surrounding whitespace trimmed) and names
  the message kind. Everything after it is the field list, split on `|`; each field is trimmed of surrounding
  whitespace. `🧾status=disputed | 7 | 840.00` and `🧾status=disputed|7|840.00` are the same
  message.
- Each key has a fixed **arity**. A field count other than the arity is a parse failure
  (FR-025). A `|` inside a value is therefore unrepresentable by design.
- Values never contain newlines. A grammar message is exactly one non-blank line; a second
  non-blank line is a parse failure.
- One leading `U+FE0F` after the emoji is dropped (models add the variation selector to
  some symbols; every decoder and the D-14 adapter tolerate it).
- An unknown key, or a line with no key, means the message does not parse (FR-025).
- A message whose key is a **tool** key *is a tool call*. The patched harness
  ([research.md](../specs/001-cross-exam-evaluator/research.md) D-14) invokes that tool with
  the fields as its arguments, by position. No JSON or XML wrapper exists — that is the
  point of the grammar.

## Key registry — seven keys

### Tool calls — acting agent → held action

| Emoji | Codepoint | Tool            | Fields (in order)                                 | Example                                      |
| ----- | --------- | --------------- | ------------------------------------------------- | -------------------------------------------- |
| 🧾    | `U+1F9FE` | `bulk_refund`   | `criteria` \| `declared_count` \| `declared_value` | `🧾status=disputed AND age_days<=30 \| 7 \| 840.00` |
| 💸    | `U+1F4B8` | `issue_payout`  | same three                                         | `💸payout_eligible=true \| 342 \| 418220.00` |
| 🔒    | `U+1F512` | `close_account` | same three                                         | `🔒customer_id=cus_0042 \| 1 \| 0.00`        |

`criteria` is a predicate ([data-model.md](../specs/001-cross-exam-evaluator/data-model.md) §5).
`declared_count` is a bare non-negative integer; `declared_value` is `#.##` dollars. All
three fields are required: arity 3. Fewer fields is a parse failure and the Bench escalates
(FR-002, FR-025). The harness validates nothing (research D-14).

### Tool call — Evaluator → `measure` tool

| Emoji | Codepoint | Tool      | Fields (in order)          | Example                          |
| ----- | --------- | --------- | -------------------------- | -------------------------------- |
| 📏    | `U+1F4CF` | `measure` | `criteria` \| `table`      | `📏status=disputed \| charges`   |

`table` is `charges` or `payouts`. Arity 2.

### Measurement — `measure.py` stdout → `measure` tool result → Evaluator

| Emoji | Codepoint | Meaning       | Fields (in order)                                        | Example                       |
| ----- | --------- | ------------- | -------------------------------------------------------- | ----------------------------- |
| 🧮    | `U+1F9EE` | measurement   | `measured_count` \| `measured_value` \| `duplicate_count` | `🧮1204 \| 96310.00 \| 611`  |

The only line `measure.py` prints. Arity 3. `measured_value` is `#.##` dollars.
`duplicate_count` is the rows already irreversibly acted on. Produced only by executed code
(Constitution II).

### Verdicts — Evaluator → Bench

| Emoji | Codepoint | Verdict | Fields (in order)                                                     | Example                                            |
| ----- | --------- | ------- | --------------------------------------------------------------------- | -------------------------------------------------- |
| ✅    | `U+2705`  | `allow` | `measured_count` \| `measured_value` \| `duplicate_count` \| `reason` | `✅7 \| 840.00 \| 0 \| Measured figures match the declaration` |
| ⛔    | `U+26D4`  | `deny`  | same four                                                              | `⛔1204 \| 96310.00 \| 611 \| You declared 7 for $840.00; …` |

`✅` and `⛔` carry the measured triple **copied from the `🧮` line** — a verdict without
measured figures is a Constitution II violation, not an incomplete message. Arity 4; the
`reason` is the fourth field and is what the harness delivers back to the acting agent on a
`⛔` (FR-012).

**Escalation has no key.** `escalate` is the system's decision (research D-06), never a
message either agent writes, so it never crosses the wire and no decoder accepts it. The
Bench renders it in its trace as `⚖` (`U+2696`) beside the figures it holds — a display
convention, not a grammar key.

## Rules for choosing a key

When adding a new key, in this order:

1. **A single codepoint.** No ZWJ sequences (`👨‍👩‍👧`), no skin-tone modifiers, no flags.
   They are several tokens and get mangled on re-serialization.
2. **No variation selector `U+FE0F`.** Models add it to some symbols anyway, so every
   decoder and the D-14 adapter drop one leading `U+FE0F`
   ([wire-grammar.md](../specs/001-cross-exam-evaluator/contracts/wire-grammar.md) obligation 1).
3. **One emoji per tool.** A tool's key is the tool. Never a generic "action" key with the
   tool name as a value, and never one key per field.
4. **Distinguishable from the rest of the table** at a glance.
5. **Verify the real token count** with the provider's tokenizer before freezing the key.
   The saving is this format's whole reason to exist; it is not assumed.
6. **Never reuse** an emoji already listed for another message kind.

## The registry file

The registry **is** [`packages/core/src/grammar/registry.json`](../packages/core/src/grammar/registry.json):
one entry per emoji with its `kind` (`tool` · `measurement` · `verdict`), the tool or verdict
it names, and `fields` in order — the arity is the field count. The tables above explain
that file; they do not replace it. Two readers, one source:

- the grammar decoders in `packages/core/src/grammar/index.ts` import it;
- the harness adapter (research D-14) reads it at start from the path in
  `CROSSEXAM_GRAMMAR_REGISTRY_PATH` and acts on the `tool` entries only — the measurement
  and verdict lines are not tool calls, the Bench decodes those.

A key added to the file is added to the tables above in the same PR (§ Maintenance).

## Invariant

No ledger value contains an emoji or a `|` — they are charge ids, amounts, dates, and
statuses. That is why no escaping is needed: a key can never appear inside a value, and a
value can never split. If the ledger ever accepts free-form customer text, this invariant
falls and the grammar must be revisited before the parser is.

## Maintenance

Append-only during the event. Every new key lands here **before** it is used in code. A
key change is a contract change between the two agents: it ships on its own branch and PR
like any other task (Constitution V).
