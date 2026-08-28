<#
.SYNOPSIS
  Start the local image annotator.

.DESCRIPTION
  -Dev   starts the Python backend and the Vite dev server together (UI on :3000).
  Default (production) builds the frontend if needed and serves everything from
  the backend on :8077.
#>
[CmdletBinding()]
param(
    [switch]$Dev,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$appDir = $PSScriptRoot
$venvPy = Join-Path $appDir "venv\Scripts\python.exe"

if (-not (Test-Path $venvPy)) {
    throw "No venv found. Run .\scripts\setup_venv.ps1 first."
}

Push-Location $appDir
try {
    if ($Dev) {
        if (-not (Test-Path (Join-Path $appDir "node_modules"))) {
            Write-Host "Installing npm dependencies..."
            npm install
            if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
        }

        Write-Host "Starting backend on http://127.0.0.1:8077 ..."
        $backend = Start-Process -FilePath $venvPy -ArgumentList "-m", "backend.main" -WorkingDirectory $appDir -PassThru -NoNewWindow

        try {
            Write-Host "Starting Vite dev server on http://127.0.0.1:3000 ..."
            npm run dev
        } finally {
            if ($backend -and -not $backend.HasExited) {
                Write-Host "Stopping backend (pid $($backend.Id))"
                Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
            }
        }
    } else {
        if (-not $SkipBuild) {
            if (-not (Test-Path (Join-Path $appDir "node_modules"))) {
                Write-Host "Installing npm dependencies..."
                npm install
                if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
            }
            Write-Host "Building frontend..."
            npm run build
            if ($LASTEXITCODE -ne 0) { throw "vite build failed" }
        }

        Write-Host "Serving UI + API on http://127.0.0.1:8077"
        & $venvPy -m backend.main
    }
} finally {
    Pop-Location
}
