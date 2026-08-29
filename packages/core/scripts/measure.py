"""The one measurement script. Both executors (Daytona sandbox, local python3) run this
exact file; Measurement.script_sha256 records which bytes ran.

    python3 measure.py --ledger <path.json> --table <charges|payouts> --criteria '<expr>'

stdout is the measurement, one line in the emoji grammar, and nothing else:

    🧮<matched rows> | <sum of amount_cents as dollars, two decimals> | <matched rows already irreversibly acted on>

The third field is refunded=true for `charges`; `payouts` has no such column, so it is always 0 there.

Criteria grammar (data-model.md §5, research D-04): `term (' AND ' term)*`, where a term is
`field op value`, `field` is a §5 criteria field of the chosen table, `op` is one of = != > >= < <=,
and `value` is a bare literal typed like the column — integer, true/false, or a bare word.
No OR, no parentheses, no quotes, no eval. Ordering operators apply to integers only.

Exit codes (contracts/measurement-executor.md): 0 measured · 2 criteria did not parse ·
3 ledger missing or malformed · 1 anything else. Standard library only. Never writes,
never opens a socket, never reads a path other than --ledger.
"""

import argparse
import json
import re
import sys

MEASUREMENT = "\U0001F9EE"

COLUMNS = {
    "charges": {
        "id": str,
        "customer_id": str,
        "status": str,
        "amount_cents": int,
        "opened_at": str,
        "age_days": int,
        "refunded": bool,
        "refunded_at": (str, type(None)),
    },
    "payouts": {
        "id": str,
        "merchant_id": str,
        "amount_cents": int,
        "payout_eligible": bool,
    },
}
# data-model §5: the only fields a predicate may name.
CRITERIA_FIELDS = {
    "charges": {"status", "refunded", "age_days", "amount_cents", "customer_id"},
    "payouts": {"payout_eligible", "merchant_id", "amount_cents"},
}
ACTED_ON = {"charges": "refunded", "payouts": None}

TERM = re.compile(r"^([a-z_]+)\s*(=|!=|>=|<=|>|<)\s*([A-Za-z0-9_-]+)$")
OPS = {
    "=": lambda a, b: a == b,
    "!=": lambda a, b: a != b,
    ">": lambda a, b: a > b,
    ">=": lambda a, b: a >= b,
    "<": lambda a, b: a < b,
    "<=": lambda a, b: a <= b,
}


class CriteriaError(Exception):
    """The criteria string is outside the grammar."""


class LedgerError(Exception):
    """The ledger file is missing or not the documented shape."""


def parse_literal(raw, column_type):
    """Turn a bare literal into a value of the column's type, or raise CriteriaError."""
    if column_type is int:
        if not re.fullmatch(r"-?\d+", raw):
            raise CriteriaError("integer column needs an integer literal: %s" % raw)
        return int(raw)
    if column_type is bool:
        if raw not in ("true", "false"):
            raise CriteriaError("boolean column needs true/false: %s" % raw)
        return raw == "true"
    return raw


def parse_criteria(text, table):
    """Parse `term (' AND ' term)*` into a list of (field, op, typed value)."""
    columns = COLUMNS[table]
    terms = []
    for part in text.split(" AND "):
        m = TERM.match(part.strip())
        if not m:
            raise CriteriaError("term does not parse: %r" % part)
        field, op, raw = m.groups()
        if field not in CRITERIA_FIELDS[table]:
            raise CriteriaError("field not in the criteria grammar for %s: %s" % (table, field))
        column_type = columns[field]
        if column_type is not int and op not in ("=", "!="):
            raise CriteriaError("ordering operator on a non-integer column: %s" % part)
        terms.append((field, op, parse_literal(raw, column_type)))
    return terms


def load_rows(path, table):
    """Read the ledger and return the requested table, validating every row's shape."""
    try:
        with open(path, "r", encoding="utf-8") as fh:
            ledger = json.load(fh)
    except (OSError, ValueError) as exc:
        raise LedgerError(str(exc))
    rows = ledger.get(table) if isinstance(ledger, dict) else None
    if not isinstance(rows, list):
        raise LedgerError("ledger has no %s table" % table)
    columns = COLUMNS[table]
    for row in rows:
        if not isinstance(row, dict):
            raise LedgerError("row is not an object")
        for field, column_type in columns.items():
            if field not in row or not isinstance(row[field], column_type):
                raise LedgerError("row %r: bad or missing %s" % (row.get("id"), field))
            if column_type is int and isinstance(row[field], bool):
                raise LedgerError("row %r: %s is a boolean" % (row.get("id"), field))
        if row["amount_cents"] <= 0:
            raise LedgerError("row %r: amount_cents must be > 0" % row["id"])
        if table == "charges" and row["refunded"] != (row["refunded_at"] is not None):
            raise LedgerError("row %r: refunded disagrees with refunded_at" % row["id"])
    return rows


def measure(rows, terms, acted_on):
    """Count matched rows, sum their amount_cents, count those already acted on."""
    matched = [r for r in rows if all(OPS[op](r[field], value) for field, op, value in terms)]
    total = sum(r["amount_cents"] for r in matched)
    duplicates = sum(1 for r in matched if r[acted_on]) if acted_on else 0
    return len(matched), total, duplicates


class Parser(argparse.ArgumentParser):
    def error(self, message):
        sys.stderr.write("measure.py: %s\n" % message)
        sys.exit(1)


def main(argv):
    parser = Parser(add_help=False)
    parser.add_argument("--ledger", required=True)
    parser.add_argument("--table", required=True, choices=sorted(COLUMNS))
    parser.add_argument("--criteria", required=True)
    args = parser.parse_args(argv)
    try:
        terms = parse_criteria(args.criteria, args.table)
    except CriteriaError as exc:
        sys.stderr.write("measure.py: criteria: %s\n" % exc)
        return 2
    try:
        rows = load_rows(args.ledger, args.table)
    except LedgerError as exc:
        sys.stderr.write("measure.py: ledger: %s\n" % exc)
        return 3
    count, total_cents, duplicates = measure(rows, terms, ACTED_ON[args.table])
    out = "%s%d | %d.%02d | %d\n" % (
        MEASUREMENT, count, total_cents // 100, total_cents % 100, duplicates
    )
    sys.stdout.buffer.write(out.encode("utf-8"))
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
