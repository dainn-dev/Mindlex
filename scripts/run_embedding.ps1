# run_embedding.ps1 — Install deps and run the embedding pipeline on the host.
#
# The script auto-selects the crawlerdb read mode:
#   - direct TCP if CRAWL_DB_HOST:CRAWL_DB_PORT is reachable
#   - docker_exec fallback (uses `docker exec postgres psql COPY TO STDOUT CSV`)
#     for when the crawlerdb container has no exposed host port
#
# Mindlex postgres must be running (exposed on host port 55432 by default).
#
# Usage (from repo root):
#   .\scripts\run_embedding.ps1                      # full pipeline
#   .\scripts\run_embedding.ps1 -Limit 10            # test with 10 records
#   .\scripts\run_embedding.ps1 -BatchSize 50 -Limit 0

param(
    [int]$BatchSize = 100,
    [int]$Limit     = 0,
    [int]$Offset    = 0
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$REPO_ROOT = Split-Path $PSScriptRoot -Parent
$SCRIPTS   = $PSScriptRoot

# ── Load POSTGRES_HOST_PORT from .env (default: 55432) ───────────────────────
$mindlexPort = "55432"
$envFile = Join-Path $REPO_ROOT ".env"
if (Test-Path $envFile) {
    $line = Select-String -Path $envFile -Pattern "^POSTGRES_HOST_PORT\s*=" | Select-Object -First 1
    if ($line) { $mindlexPort = ($line.Line -split "=", 2)[1].Trim() }
}

# ── 1. Start Mindlex postgres ─────────────────────────────────────────────────
Write-Host "`n[1/3] Starting mylaw-postgres ..."
Push-Location $REPO_ROOT
docker compose up -d postgres
if ($LASTEXITCODE -ne 0) { throw "Failed to start Mindlex postgres." }
Pop-Location
Start-Sleep -Seconds 2

# ── 2. Install Python deps ────────────────────────────────────────────────────
Write-Host "`n[2/3] Installing Python dependencies ..."
# CPU-only torch first (avoids downloading the large GPU wheel)
pip install --quiet torch --index-url https://download.pytorch.org/whl/cpu
pip install --quiet -r "$SCRIPTS\requirements.txt"

# ── 3. Run pipeline ───────────────────────────────────────────────────────────
$extraArgs = @("--batch-size", "$BatchSize")
if ($Limit  -gt 0) { $extraArgs += @("--limit",  "$Limit")  }
if ($Offset -gt 0) { $extraArgs += @("--offset", "$Offset") }

Write-Host "`n[3/3] Running embedding pipeline ..."

$env:MINDLEX_DB_HOST = "localhost"
$env:MINDLEX_DB_PORT = $mindlexPort
$env:MINDLEX_DB_NAME = "mylaw"
$env:MINDLEX_DB_USER = "postgres"
$env:MINDLEX_DB_PASS = "postgres"
$env:CRAWL_CONTAINER = "postgres"   # crawlerdb container name
$env:CRAWL_MODE      = "auto"       # auto-detects direct TCP vs docker_exec
$env:HF_HUB_OFFLINE  = "0"          # allow download if model not cached
$env:CUDA_VISIBLE_DEVICES = ""

python "$SCRIPTS\embed_legal_data.py" @extraArgs
$exitCode = $LASTEXITCODE

if ($exitCode -eq 0) {
    Write-Host "`nEmbedding pipeline completed successfully."
} else {
    throw "Pipeline exited with code $exitCode."
}
