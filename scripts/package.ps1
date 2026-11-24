# Build a zip for a GitHub Release.
$ErrorActionPreference = 'Stop'

$root = Split-Path $PSScriptRoot -Parent
$plugin = Join-Path $root 'plugin'
$manifest = Get-Content (Join-Path $plugin 'plugin.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$outDir = Join-Path $root 'dist'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$zip = Join-Path $outDir ("{0}-{1}.zip" -f $manifest.id, $manifest.version)
Compress-Archive -Path (Join-Path $plugin '*') -DestinationPath $zip -Force

Write-Host "Built: $zip" -ForegroundColor Green
