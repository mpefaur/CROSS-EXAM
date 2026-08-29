<#
.SYNOPSIS
    sdd-vibecoding-template — one-shot toolchain bootstrap (Windows, PowerShell 5.1+).

.DESCRIPTION
    Idempotent by design: every step checks before it acts, so re-running is safe and
    never clobbers your constitution, specs, or agent config.

      1. uv                2. specify-cli        3. Spec Kit init (only if missing)
      4. RTK               5. rtk init (agent)   6. Caveman
      7. verification      8. summary

.EXAMPLE
    .\scripts\setup.ps1
    .\scripts\setup.ps1 -SkipRtk -Agent cursor
#>
[CmdletBinding()]
param(
    [switch]$SkipRtk,
    [switch]$SkipCaveman,
    [switch]$SkipSpeckit,
    [string]$Agent = ''
)

$ErrorActionPreference = 'Continue'
$ProgressPreference    = 'SilentlyContinue'   # much faster Invoke-WebRequest

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

# ── output helpers ────────────────────────────────────────────────────────────
$script:Warnings = 0
function Step($m) { Write-Host "`n> $m" -ForegroundColor White }
function Ok($m)   { Write-Host "  [ok]   $m" -ForegroundColor Green }
function Skip($m) { Write-Host "  [--]   $m (skipped)" -ForegroundColor DarkGray }
function Warn($m) { $script:Warnings++; Write-Host "  [warn] $m" -ForegroundColor Yellow }
function Fail($m) { $script:Warnings++; Write-Host "  [fail] $m" -ForegroundColor Red }
function Have($c) { $null -ne (Get-Command $c -ErrorAction SilentlyContinue) }

# Tools installed by uv/cargo land here; make them visible for this session.
$env:PATH = "$env:USERPROFILE\.local\bin;$env:USERPROFILE\.cargo\bin;$env:PATH"

Write-Host "+----------------------------------------------+" -ForegroundColor White
Write-Host "|  sdd-vibecoding-template - setup             |" -ForegroundColor White
Write-Host "+----------------------------------------------+" -ForegroundColor White
Write-Host "  $RepoRoot" -ForegroundColor DarkGray

# ── 1. uv ─────────────────────────────────────────────────────────────────────
Step '1/8  uv (Python toolchain manager)'
if (Have 'uv') {
    Ok "uv already installed ($(uv --version 2>$null))"
} else {
    Write-Host '  installing uv...'
    try {
        Invoke-RestMethod https://astral.sh/uv/install.ps1 | Invoke-Expression | Out-Null
        $env:PATH = "$env:USERPROFILE\.local\bin;$env:PATH"
        if (Have 'uv') { Ok "uv installed ($(uv --version 2>$null))" }
        else { Fail 'uv installed but not on PATH' }
    } catch {
        Fail 'uv install failed - see https://docs.astral.sh/uv/getting-started/installation/'
    }
}

# ── 2. specify-cli ────────────────────────────────────────────────────────────
Step '2/8  Spec Kit CLI (specify)'
if ($SkipSpeckit) {
    Skip 'specify-cli'
} elseif (-not (Have 'uv')) {
    Warn 'uv unavailable - cannot install specify-cli'
} else {
    # `uv tool install --force` both installs and upgrades: idempotent either way.
    uv tool install specify-cli --force *> $null
    if (Have 'specify') { Ok 'specify-cli ready' }
    else { Fail 'specify-cli install failed - retry: uv tool install specify-cli --force' }
}

# ── 3. Spec Kit project init ──────────────────────────────────────────────────
Step '3/8  Spec Kit project structure'
if ($SkipSpeckit) {
    Skip 'specify init'
} elseif (Test-Path '.specify/memory/constitution.md') {
    # Already initialized. Never re-run init here: it would overwrite the constitution.
    Ok '.specify/ already initialized - left untouched'
} elseif (-not (Have 'specify')) {
    Warn 'specify not on PATH - run manually: specify init . --integration claude'
} else {
    specify init . --integration claude --script ps --ignore-agent-tools --force *> $null
    if (Test-Path '.specify/memory/constitution.md') { Ok 'Spec Kit initialized (claude integration)' }
    else { Fail 'specify init failed - run it manually to see the error' }
}

# ── 4. RTK ────────────────────────────────────────────────────────────────────
Step '4/8  RTK (token-efficient CLI proxy)'
if ($SkipRtk) {
    Skip 'RTK'
} elseif (Have 'rtk') {
    Ok 'rtk already installed'
} else {
    Write-Host '  installing rtk...'
    $installed = $false
    if (Have 'winget') {
        winget install --id rtk-ai.rtk --accept-source-agreements --accept-package-agreements *> $null
        $installed = Have 'rtk'
    }
    if (-not $installed -and (Have 'cargo')) {
        cargo install --git https://github.com/rtk-ai/rtk *> $null
        $env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
        $installed = Have 'rtk'
    }
    if ($installed) { Ok 'rtk installed' }
    else { Warn 'rtk not installed - grab a Windows binary from https://github.com/rtk-ai/rtk/releases (agents fall back to raw commands)' }
}

# ── 5. rtk init for the detected agent ────────────────────────────────────────
Step '5/8  rtk init (agent integration)'
if ($SkipRtk -or -not (Have 'rtk')) {
    Skip 'rtk init'
} else {
    # Explicit -Agent wins; otherwise detect from what's present in the repo/machine.
    if (-not $Agent) {
        if     ((Test-Path '.claude')     -or (Have 'claude'))       { $Agent = 'claude' }
        elseif ((Test-Path '.cursor')     -or (Have 'cursor-agent')) { $Agent = 'cursor' }
        elseif (Test-Path '.clinerules')                             { $Agent = 'cline'  }
        elseif (Have 'gemini')                                       { $Agent = 'gemini' }
        elseif (Have 'codex')                                        { $Agent = 'codex'  }
        else                                                         { $Agent = 'claude' }
    }
    Ok "detected agent: $Agent"
    # -g = global config; --auto-patch = non-interactive. Re-running is a no-op patch.
    switch ($Agent) {
        { $_ -in 'claude','copilot' }                             { $rtkArgs = @('-g','--auto-patch') }
        'gemini'                                                  { $rtkArgs = @('-g','--gemini','--auto-patch') }
        'codex'                                                   { $rtkArgs = @('-g','--codex','--auto-patch') }
        { $_ -in 'cline','kilocode','antigravity','kimi','hermes' } { $rtkArgs = @('--agent',$Agent,'--auto-patch') }
        default                                                   { $rtkArgs = @('-g','--agent',$Agent,'--auto-patch') }
    }
    rtk init @rtkArgs *> $null
    if ($LASTEXITCODE -eq 0) { Ok "rtk init done (rtk init $($rtkArgs -join ' '))" }
    else { Warn "rtk init failed - run manually: rtk init $($rtkArgs -join ' ')" }
}

# ── 6. Caveman ────────────────────────────────────────────────────────────────
Step '6/8  Caveman (output compression, default level: full)'
if ($SkipCaveman) {
    Skip 'Caveman'
} elseif (-not (Have 'node')) {
    Warn 'Node >= 18 required by Caveman and not found - skipping'
} else {
    # The installer is idempotent and only patches agents that are actually present.
    try {
        Invoke-RestMethod https://raw.githubusercontent.com/JuliusBrussee/caveman/main/install.ps1 |
            Invoke-Expression | Out-Null
        Ok 'Caveman installed (activate with /caveman full - see CLAUDE.md)'
    } catch {
        Warn 'Caveman install failed - see https://github.com/JuliusBrussee/caveman'
    }
}

# ── 7. Verification ───────────────────────────────────────────────────────────
Step '7/8  Verification'
function Check($name, [scriptblock]$cond) {
    if (& $cond) { Ok $name } else { Warn "$name - MISSING" }
}
Check 'uv'                                   { Have 'uv' }
Check 'specify CLI'                          { Have 'specify' }
Check '.specify/memory/constitution.md'      { Test-Path '.specify/memory/constitution.md' }
Check '.specify/templates/'                  { Test-Path '.specify/templates' }
Check 'Claude skills (.claude/skills)'       { Test-Path '.claude/skills' }
Check '/speckit.* aliases (.claude/commands)' { Test-Path '.claude/commands/speckit.specify.md' }
Check 'Cursor rules (.cursor/rules)'         { Test-Path '.cursor/rules/karpathy.mdc' }
Check 'Cline rules (.clinerules)'            { Test-Path '.clinerules/00-agents.md' }
Check 'AGENTS.md'                            { Test-Path 'AGENTS.md' }
Check 'CLAUDE.md'                            { Test-Path 'CLAUDE.md' }
if (-not $SkipRtk)     { Check 'rtk'                  { Have 'rtk' } }
if (-not $SkipCaveman) { Check 'node >= 18 (Caveman)' { Have 'node' } }

# ── 8. Summary ────────────────────────────────────────────────────────────────
Step '8/8  Summary'
if ($script:Warnings -eq 0) {
    Write-Host '  Everything is ready.' -ForegroundColor Green
} else {
    Write-Host "  $($script:Warnings) item(s) need attention - see the [warn]/[fail] lines above." -ForegroundColor Yellow
}
Write-Host @'

  Next steps
    1. Edit AGENTS.md section 1 - project name, purpose, stack, run/test/lint commands.
    2. Open the repo in your agent (Claude Code, Cursor, Cline...).
    3. /speckit.constitution   tailor .specify/memory/constitution.md
       /speckit.specify        describe the first feature
       /speckit.clarify        resolve open questions
       /speckit.plan -> /speckit.tasks -> /speckit.analyze -> /speckit.implement

  Token savings
    rtk gain          token savings report
    /caveman full     compression level (lite | full | ultra)
    /caveman-stats    tokens and cost saved

'@
exit 0
