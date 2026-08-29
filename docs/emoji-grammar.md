# Emoji grammar — key registry

> Single source of truth for the key set required by **FR-024** / **FR-025** of
> [`specs/001-cross-exam-evaluator/spec.md`](../specs/001-cross-exam-evaluator/spec.md).
> Both agents — the acting agent and the Evaluator — encode and decode against this table.
> Changing a key mid-build breaks both sides at once.
> Date: 2026-08-28.

## Why

Adopted from [*The Minutiae of Tool-calling*](https://blog.can.ac/2026/08/03/the-minutiae-of-tool-calling/)
(Can.ac, 2026-08-03). The article's rule: reliability degrades with
**nesting × heterogeneity × cleverness**. A field holding JSON-escaped content has to be
re-parsed, and a failed re-parse is a lost tool call.

The article's top-ranked format keys each field with an emoji (`🔍2=7`) instead of
spelling the field name out. Two benefits, and they are the ones we are after:

1. **Fewer tokens** than a spelled-out field name, on every turn of both agents.
2. **Higher accuracy on small models**: the key is a single unmistakable symbol, not a
   word the model can paraphrase, pluralize, or translate.

## Format

One line per field. No nesting. No JSON inside a field.

```
<emoji><value>
```

- The emoji is the first character of the line; everything after it up to the newline is
  the value, literal.
- Values never contain newlines. A multi-line value is unrepresentable by design — if one
  is needed, that is a sign the field is modeled wrong.
- Line order is free. The parser indexes by key, not by position.
- An unknown key, or a line with no key, means the proposal does not parse (FR-025).

## Key registry

### Proposal — acting agent → Evaluator

| Emoji | Codepoint | Field            | Type    | Example                          |
| ----- | --------- | ---------------- | ------- | -------------------------------- |
| 🧾    | `U+1F9FE` | `action`         | string  | `🧾bulk_refund`                  |
| 🔍    | `U+1F50D` | `criteria`       | string  | `🔍status=disputed AND days<=30` |
| 🔢    | `U+1F522` | `declared_count` | integer | `🔢7`                            |
| 💵    | `U+1F4B5` | `declared_value` | decimal | `💵840.00`                       |

All four are required. If end without all 4 then harness should send reminder
### Verdict and measurement — Evaluator → acting agent

| Emoji | Codepoint | Field             | Type                            | Example                      |
| ----- | --------- | ----------------- | ------------------------------- | ---------------------------- |
| ⚖     | `U+2696`  | `verdict`         | `allow` \| `deny` \| `escalate` | `⚖deny`                      |
| 🧮    | `U+1F9EE` | `measured_count`  | integer                         | `🧮1204`                     |
| 💰    | `U+1F4B0` | `measured_value`  | decimal                         | `💰96310.00`                 |
| ♻     | `U+267B`  | `duplicate_count` | integer                         | `♻611`                       |
| 📝    | `U+1F4DD` | `reason`          | string                          | `📝1204 charges, $96,310...` |

`⚖allow` and `⚖deny` require `🧮`, `💰`, and `♻` in the same message — a verdict without
measured figures is a Constitution II violation, not an incomplete message.

## Rules for choosing a key

When adding a new key, in this order:

1. **A single codepoint.** No ZWJ sequences (`👨‍👩‍👧`), no skin-tone modifiers, no flags.
   They are several tokens and get mangled on re-serialization.
2. **No variation selector `U+FE0F`.** This is why the registry uses `⚖` (`U+2696`) and
   not `⚖️` (`U+2696 U+FE0F`), and `♻` and not `♻️`. It costs an extra token and survives
   round-trips poorly.
3. **Distinguishable from the rest of the table** at a glance. `💵` declared vs `💰`
   measured is the closest pair we have; it is accepted because they never travel in the
   same message.
4. **Verify the real token count** with the provider's tokenizer before freezing the key.
   The saving is this format's whole reason to exist; it is not assumed.
5. **Never reuse** an emoji already listed for another field, not even in the other
   direction.

## Invariant

No ledger value contains emoji — they are charge ids, amounts, dates, and statuses. That
is why no escaping is needed: a key can never appear inside a value. If the ledger ever
accepts free-form customer text, this invariant falls and the grammar must be revisited
before the parser is.

## Maintenance

Append-only during the event. Every new key lands here **before** it is used in code. A
key change is a contract change between the two agents: it ships on its own branch and PR
like any other task (Constitution V).
