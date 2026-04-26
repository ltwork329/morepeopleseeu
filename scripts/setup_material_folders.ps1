param(
  [string]$Root = "$PSScriptRoot\..\local_materials"
)

$ErrorActionPreference = "Stop"

$resolvedRoot = [System.IO.Path]::GetFullPath($Root)
$folders = @("unused", "fragments", "used")

New-Item -ItemType Directory -Force -Path $resolvedRoot | Out-Null

foreach ($name in $folders) {
  $path = Join-Path $resolvedRoot $name
  New-Item -ItemType Directory -Force -Path $path | Out-Null
  $readme = Join-Path $path "README.txt"
  @"
Material folder: $name

Rules:
- unused: put new videos here. The app only auto-picks from this folder.
- fragments: short leftover clips go here. The app does not auto-pick them.
- used: used videos go here. Used videos are never reused.
"@ | Set-Content -LiteralPath $readme -Encoding UTF8
}

$configPath = Join-Path $resolvedRoot "material_folders.json"
$config = [ordered]@{
  root = $resolvedRoot
  unused = (Join-Path $resolvedRoot "unused")
  fragments = (Join-Path $resolvedRoot "fragments")
  used = (Join-Path $resolvedRoot "used")
  rule = "used videos are never reused"
}
$config | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $configPath -Encoding UTF8

Write-Output "MATERIAL_ROOT=$resolvedRoot"
Write-Output "UNUSED=$(Join-Path $resolvedRoot 'unused')"
Write-Output "FRAGMENTS=$(Join-Path $resolvedRoot 'fragments')"
Write-Output "USED=$(Join-Path $resolvedRoot 'used')"
Write-Output "CONFIG=$configPath"
