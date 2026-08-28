<#
.SYNOPSIS
  Create the annotator's own venv and install torch (cu130) + the backend deps.

.NOTES
  Per this workspace's convention every tool gets its own venv. Do not install
  into training\ai-toolkit.
#>
[CmdletBinding()]
param(
    [string]$Python = "python",
    [string]$TorchIndex = "https://download.pytorch.org/whl/cu130"
)

$ErrorActionPreference = "Stop"
$appDir = Split-Path -Parent $PSScriptRoot
$venv = Join-Path $appDir "venv"
$venvPy = Join-Path $venv "Scripts\python.exe"

if (-not (Test-Path $venvPy)) {
    Write-Host "Creating venv at $venv"
    & $Python -m venv $venv
    if ($LASTEXITCODE -ne 0) { throw "venv creation failed" }
} else {
    Write-Host "Reusing existing venv at $venv"
}

& $venvPy -m pip install --upgrade pip setuptools wheel
if ($LASTEXITCODE -ne 0) { throw "pip upgrade failed" }

Write-Host "Installing torch + torchvision from $TorchIndex"
& $venvPy -m pip install torch torchvision --index-url $TorchIndex
if ($LASTEXITCODE -ne 0) { throw "torch install failed" }

Write-Host "Installing backend requirements"
& $venvPy -m pip install -r (Join-Path $appDir "requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "requirements install failed" }

& $venvPy -c "import torch, transformers; print('torch', torch.__version__, 'cuda', torch.version.cuda, 'available', torch.cuda.is_available()); print('transformers', transformers.__version__)"

Write-Host ""
Write-Host "Done. Next:"
Write-Host "  .\scripts\copy_models.ps1     # bring weights into models\vlm\hub"
Write-Host "  npm install; npm run dev      # frontend + backend in dev mode"
