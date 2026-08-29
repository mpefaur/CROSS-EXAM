# Contracts — CROSS-EXAM

Four interfaces cross a boundary in this feature. Each has a file here; nothing else is a
contract.

| Contract | Boundary | File |
| --- | --- | --- |
| Emoji grammar | acting agent ⇄ Evaluator (the wire format) | [docs/emoji-grammar.md](../../../docs/emoji-grammar.md) — **the registry is the source of truth**; [wire-grammar.md](./wire-grammar.md) adds only the parser's obligations |
| MCP tools | harness → our two MCP servers (the irreversible actions; the read-only `measure` tool is in measurement-executor.md) | [mcp-tools.md](./mcp-tools.md) |
| Charge sheet & verdict | orchestrator ⇄ Evaluator (the `§7.2` hand-off) | [charge-sheet.md](./charge-sheet.md) |
| Measurement | Evaluator → `measure` tool (`packages/measure`) → local executor | [measurement-executor.md](./measurement-executor.md) |

Entity field lists live in [data-model.md](../data-model.md) and are not repeated here.
