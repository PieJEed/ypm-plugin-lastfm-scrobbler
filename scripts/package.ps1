# 生成可上传到 GitHub Release 的插件压缩包。
$ErrorActionPreference = 'Stop'

$root = Split-Path $PSScriptRoot -Parent
$plugin = Join-Path $root 'plugin'
$manifest = Get-Content (Join-Path $plugin 'plugin.json') -Raw | ConvertFrom-Json
$outDir = Join-Path $root 'dist'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$zip = Join-Path $outDir ("{0}-{1}.zip" -f $manifest.id, $manifest.version)
Compress-Archive -Path (Join-Path $plugin '*') -DestinationPath $zip -Force

Write-Host "已生成：$zip" -ForegroundColor Green
