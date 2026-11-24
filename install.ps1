# 把插件复制到 YesPlayMusic 的插件目录。
# 用法：在项目目录里执行  powershell -ExecutionPolicy Bypass -File .\install.ps1
$ErrorActionPreference = 'Stop'

$src = Join-Path $PSScriptRoot 'plugin'
if (-not (Test-Path (Join-Path $src 'plugin.json'))) {
  throw '找不到 plugin\plugin.json，请在项目目录里运行。'
}

$destRoot = Join-Path $env:APPDATA 'YesPlayMusic\plugins'
New-Item -ItemType Directory -Force -Path $destRoot | Out-Null
$destRoot = (Resolve-Path -LiteralPath $destRoot).Path
$dest = Join-Path $destRoot 'lastfm-scrobbler'

if (-not $dest.StartsWith($destRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "目标路径不在 YesPlayMusic 插件目录里：$dest"
}

if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -Path (Join-Path $src '*') -Destination $dest -Recurse -Force

Write-Host ''
Write-Host "已安装到：$dest" -ForegroundColor Green
Write-Host '接下来在 YesPlayMusic 里打开：设置 -> 插件 -> 重新加载' -ForegroundColor Yellow