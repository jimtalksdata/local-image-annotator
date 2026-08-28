<#
.SYNOPSIS
  Copy the annotator's model repos out of the user-profile HF cache into the
  project's models\vlm\hub folder.

.NOTES
  Copies (does not move) so any process still using the C: cache keeps working.
  Re-runnable: robocopy skips files that are already identical.
#>
[CmdletBinding()]
param(
    [string]$Source = (Join-Path $env:USERPROFILE ".cache\huggingface\hub"),
    [string]$Destination,
    [string[]]$Repos = @(
        "models--Qwen--Qwen3.5-9B",
        "models--fancyfeast--llama-joycaption-alpha-two-hf-llava",
        "models--florence-community--Florence-2-large"
    ),
    [switch]$Move
)

$ErrorActionPreference = "Stop"
$appDir = Split-Path -Parent $PSScriptRoot
$projectRoot = (Resolve-Path (Join-Path $appDir "..\..")).Path

if (-not $Destination) {
    $Destination = Join-Path $projectRoot "models\vlm\hub"
}

Write-Host "Source      : $Source"
Write-Host "Destination : $Destination"
Write-Host ("Mode        : " + $(if ($Move) { "MOVE" } else { "COPY" }))
Write-Host ""

New-Item -ItemType Directory -Force -Path $Destination | Out-Null

foreach ($repo in $Repos) {
    $src = Join-Path $Source $repo
    $dst = Join-Path $Destination $repo

    if (-not (Test-Path $src)) {
        Write-Warning "Missing in source, skipping: $repo"
        continue
    }

    $sizeGb = [math]::Round(((Get-ChildItem $src -Recurse -File | Measure-Object Length -Sum).Sum / 1GB), 2)
    Write-Host "==> $repo ($sizeGb GB)"

    $args = @($src, $dst, "/E", "/R:2", "/W:2", "/NFL", "/NDL", "/NJH", "/NP", "/MT:8")
    if ($Move) { $args += "/MOVE" }

    robocopy @args | Out-Null
    $code = $LASTEXITCODE
    $global:LASTEXITCODE = 0

    # robocopy: 0-7 are success codes, 8+ are real failures.
    if ($code -ge 8) {
        throw "robocopy failed for $repo (exit $code)"
    }
    Write-Host "    done (robocopy exit $code)"
}

Write-Host ""
Write-Host "All repos present under: $Destination"
Write-Host "The backend sets HF_HOME to models\vlm automatically."

# robocopy leaves a non-zero (but successful) exit code behind; do not leak it.
exit 0
