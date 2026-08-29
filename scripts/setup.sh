#!/usr/bin/env bash
#
# sdd-vibecoding-template — one-shot toolchain bootstrap (Linux / macOS / WSL).
#
#   ./scripts/setup.sh [--skip-rtk] [--skip-caveman] [--skip-speckit] [--agent NAME]
#
# Idempotent by design: every step checks before it acts, so re-running is safe and
# never clobbers your constitution, specs, or agent config.
#
#   1. uv                2. specify-cli        3. Spec Kit init (only if missing)
#   4. RTK               5. rtk init (agent)   6. Caveman
#   7. verification      8. summary
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SKIP_RTK=0; SKIP_CAVEMAN=0; SKIP_SPECKIT=0; AGENT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --skip-rtk)     SKIP_RTK=1 ;;
    --skip-caveman) SKIP_CAVEMAN=1 ;;
    --skip-speckit) SKIP_SPECKIT=1 ;;
    --agent)        AGENT="${2:-}"; shift ;;
    -h|--help)      sed -n '2,20p' "$0" | sed 's/^#\s\?//'; exit 0 ;;
    *) echo "unknown option: $1 (try --help)" >&2; exit 2 ;;
  esac
  shift
done

# ── output helpers ────────────────────────────────────────────────────────────
if [ -t 1 ]; then B=$'\033[1m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; D=$'\033[2m'; N=$'\033[0m'
else B=""; G=""; Y=""; R=""; D=""; N=""; fi
step() { printf '\n%s▸ %s%s\n' "$B" "$1" "$N"; }
ok()   { printf '  %s✓%s %s\n' "$G" "$N" "$1"; }
skip() { printf '  %s•%s %s %s(skipped)%s\n' "$D" "$N" "$1" "$D" "$N"; }
warn() { printf '  %s!%s %s\n' "$Y" "$N" "$1"; }
fail() { printf '  %s✗%s %s\n' "$R" "$N" "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

WARNINGS=0
note_warn() { WARNINGS=$((WARNINGS + 1)); warn "$1"; }

# Tools installed by uv/cargo/npm land here; make them visible to this script run.
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"

printf '%s╭──────────────────────────────────────────────╮%s\n' "$B" "$N"
printf '%s│  sdd-vibecoding-template — setup             │%s\n' "$B" "$N"
printf '%s╰──────────────────────────────────────────────╯%s\n' "$B" "$N"
printf '%s  %s%s\n' "$D" "$REPO_ROOT" "$N"

# ── 1. uv ─────────────────────────────────────────────────────────────────────
step "1/8  uv (Python toolchain manager)"
if have uv; then
  ok "uv already installed ($(uv --version 2>/dev/null))"
else
  echo "  installing uv…"
  if curl -LsSf https://astral.sh/uv/install.sh | sh >/dev/null 2>&1; then
    export PATH="$HOME/.local/bin:$PATH"
    have uv && ok "uv installed ($(uv --version 2>/dev/null))" || fail "uv installed but not on PATH"
  else
    fail "uv install failed — see https://docs.astral.sh/uv/getting-started/installation/"
  fi
fi

# ── 2. specify-cli ────────────────────────────────────────────────────────────
step "2/8  Spec Kit CLI (specify)"
if [ "$SKIP_SPECKIT" = 1 ]; then
  skip "specify-cli"
elif ! have uv; then
  note_warn "uv unavailable — cannot install specify-cli"
else
  # `uv tool install --force` both installs and upgrades: idempotent either way.
  if uv tool install specify-cli --force >/dev/null 2>&1; then
    ok "specify-cli ready ($(specify --version 2>/dev/null | tail -1))"
  else
    fail "specify-cli install failed — retry: uv tool install specify-cli --force"
  fi
fi

# ── 3. Spec Kit project init ──────────────────────────────────────────────────
step "3/8  Spec Kit project structure"
if [ "$SKIP_SPECKIT" = 1 ]; then
  skip "specify init"
elif [ -f .specify/memory/constitution.md ]; then
  # Already initialized. Never re-run init here: it would overwrite the constitution.
  ok ".specify/ already initialized — left untouched"
elif ! have specify; then
  note_warn "specify not on PATH — run manually: specify init . --integration claude"
else
  if specify init . --integration claude --script sh --ignore-agent-tools --force >/dev/null 2>&1; then
    ok "Spec Kit initialized (claude integration)"
  else
    fail "specify init failed — run it manually to see the error"
  fi
fi

# ── 4. RTK ────────────────────────────────────────────────────────────────────
step "4/8  RTK (token-efficient CLI proxy)"
if [ "$SKIP_RTK" = 1 ]; then
  skip "RTK"
elif have rtk; then
  ok "rtk already installed ($(rtk --version 2>/dev/null | head -1))"
else
  echo "  installing rtk…"
  if have brew && brew install rtk >/dev/null 2>&1; then
    ok "rtk installed via Homebrew"
  elif curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh >/dev/null 2>&1; then
    export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
    ok "rtk installed via install.sh"
  elif have cargo && cargo install --git https://github.com/rtk-ai/rtk >/dev/null 2>&1; then
    ok "rtk installed via cargo"
  else
    note_warn "rtk install failed — see https://github.com/rtk-ai/rtk (agents fall back to raw commands)"
  fi
fi

# ── 5. rtk init for the detected agent ────────────────────────────────────────
step "5/8  rtk init (agent integration)"
if [ "$SKIP_RTK" = 1 ] || ! have rtk; then
  skip "rtk init"
else
  # Explicit --agent wins; otherwise detect from what's present in the repo/machine.
  if [ -z "$AGENT" ]; then
    if   [ -d .claude ]   || have claude;       then AGENT="claude"
    elif [ -d .cursor ]   || have cursor-agent; then AGENT="cursor"
    elif [ -d .clinerules ];                    then AGENT="cline"
    elif have gemini;                           then AGENT="gemini"
    elif have codex;                            then AGENT="codex"
    else                                             AGENT="claude"
    fi
  fi
  ok "detected agent: $AGENT"
  # -g = global config; --auto-patch = non-interactive. Re-running is a no-op patch.
  case "$AGENT" in
    claude|copilot) RTK_ARGS=(-g --auto-patch) ;;
    gemini)         RTK_ARGS=(-g --gemini --auto-patch) ;;
    codex)          RTK_ARGS=(-g --codex --auto-patch) ;;
    cline|kilocode|antigravity|kimi|hermes)
                    RTK_ARGS=(--agent "$AGENT" --auto-patch) ;;
    *)              RTK_ARGS=(-g --agent "$AGENT" --auto-patch) ;;
  esac
  if rtk init "${RTK_ARGS[@]}" >/dev/null 2>&1; then
    ok "rtk init done (rtk init ${RTK_ARGS[*]})"
  else
    note_warn "rtk init failed — run manually: rtk init ${RTK_ARGS[*]}"
  fi
fi

# ── 6. Caveman ────────────────────────────────────────────────────────────────
step "6/8  Caveman (output compression, default level: full)"
if [ "$SKIP_CAVEMAN" = 1 ]; then
  skip "Caveman"
elif ! have node; then
  note_warn "Node ≥18 required by Caveman and not found — skipping"
else
  # The installer is idempotent and only patches agents that are actually present.
  if curl -fsSL https://raw.githubusercontent.com/JuliusBrussee/caveman/main/install.sh | bash >/dev/null 2>&1; then
    ok "Caveman installed (activate with /caveman full — see CLAUDE.md)"
  else
    note_warn "Caveman install failed — see https://github.com/JuliusBrussee/caveman"
  fi
fi

# ── 7. Verification ───────────────────────────────────────────────────────────
step "7/8  Verification"
check() { # name, condition-command
  if eval "$2" >/dev/null 2>&1; then ok "$1"; else note_warn "$1 — MISSING"; fi
}
check "uv"                          "have uv"
check "specify CLI"                 "have specify"
check ".specify/memory/constitution.md" "[ -f .specify/memory/constitution.md ]"
check ".specify/templates/"         "[ -d .specify/templates ]"
check "Claude skills (.claude/skills)"   "[ -d .claude/skills ]"
check "/speckit.* aliases (.claude/commands)" "[ -f .claude/commands/speckit.specify.md ]"
check "Cursor rules (.cursor/rules)"     "[ -f .cursor/rules/karpathy.mdc ]"
check "Cline rules (.clinerules)"        "[ -f .clinerules/00-agents.md ]"
check "AGENTS.md"                   "[ -f AGENTS.md ]"
check "CLAUDE.md"                   "[ -f CLAUDE.md ]"
[ "$SKIP_RTK" = 1 ]     || check "rtk"     "have rtk"
[ "$SKIP_CAVEMAN" = 1 ] || check "node ≥18 (Caveman)" "have node"

# ── 8. Summary ────────────────────────────────────────────────────────────────
step "8/8  Summary"
if [ "$WARNINGS" -eq 0 ]; then
  printf '  %sEverything is ready.%s\n' "$G" "$N"
else
  printf '  %s%d item(s) need attention — see the ! lines above.%s\n' "$Y" "$WARNINGS" "$N"
fi
cat <<EOF

  ${B}Next steps${N}
    1. Edit ${B}AGENTS.md${N} §1 — project name, purpose, stack, run/test/lint commands.
    2. Open the repo in your agent (Claude Code, Cursor, Cline…).
    3. ${B}/speckit.constitution${N}   tailor .specify/memory/constitution.md
       ${B}/speckit.specify${N}        describe the first feature
       ${B}/speckit.clarify${N}        resolve open questions
       ${B}/speckit.plan${N} → ${B}/speckit.tasks${N} → ${B}/speckit.analyze${N} → ${B}/speckit.implement${N}

  ${B}Token savings${N}
    rtk gain          token savings report
    /caveman full     compression level (lite | full | ultra)
    /caveman-stats    tokens and cost saved

  ${D}If PATH complains, add: export PATH="\$HOME/.local/bin:\$PATH"${N}

EOF
exit 0
