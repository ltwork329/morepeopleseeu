param(
  [string]$Root = "$PSScriptRoot\..\local_materials"
)

$ErrorActionPreference = "Stop"

$resolvedRoot = [System.IO.Path]::GetFullPath($Root)
$folders = @("unused", "fragments", "used")
$kitchenPools = @(
  @{ Key = "outdoor"; Label = "外场" },
  @{ Key = "aerial"; Label = "航拍" },
  @{ Key = "warehouse"; Label = "仓库内部" }
)

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

foreach ($pool in $kitchenPools) {
  $poolRoot = Join-Path (Join-Path $resolvedRoot "kitchen") $pool.Key
  New-Item -ItemType Directory -Force -Path $poolRoot | Out-Null
  foreach ($name in $folders) {
    $path = Join-Path $poolRoot $name
    New-Item -ItemType Directory -Force -Path $path | Out-Null
    $readme = Join-Path $path "README.txt"
    @"
Kitchen pool: $($pool.Label) ($($pool.Key))
Material folder: $name

Rules:
- unused: put new videos for this pool here. The kitchen project picks from these folders first.
- fragments: short leftover clips for this pool go here.
- used: used kitchen clips go here. Used videos are never reused.
- kitchen compose: each final video must stitch clips from outdoor, aerial and warehouse by the configured ratios.
"@ | Set-Content -LiteralPath $readme -Encoding UTF8
  }
}

$configPath = Join-Path $resolvedRoot "material_folders.json"
$config = [ordered]@{
  root = $resolvedRoot
  unused = (Join-Path $resolvedRoot "unused")
  fragments = (Join-Path $resolvedRoot "fragments")
  used = (Join-Path $resolvedRoot "used")
  kitchen = [ordered]@{}
  rule = "used videos are never reused"
}
$config.kitchen.outdoor = [ordered]@{
  label = "外场"
  unused = (Join-Path $resolvedRoot "kitchen\\outdoor\\unused")
  fragments = (Join-Path $resolvedRoot "kitchen\\outdoor\\fragments")
  used = (Join-Path $resolvedRoot "kitchen\\outdoor\\used")
}
$config.kitchen.aerial = [ordered]@{
  label = "航拍"
  unused = (Join-Path $resolvedRoot "kitchen\\aerial\\unused")
  fragments = (Join-Path $resolvedRoot "kitchen\\aerial\\fragments")
  used = (Join-Path $resolvedRoot "kitchen\\aerial\\used")
}
$config.kitchen.warehouse = [ordered]@{
  label = "仓库内部"
  unused = (Join-Path $resolvedRoot "kitchen\\warehouse\\unused")
  fragments = (Join-Path $resolvedRoot "kitchen\\warehouse\\fragments")
  used = (Join-Path $resolvedRoot "kitchen\\warehouse\\used")
}
$config | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $configPath -Encoding UTF8

Write-Output "MATERIAL_ROOT=$resolvedRoot"
Write-Output "UNUSED=$(Join-Path $resolvedRoot 'unused')"
Write-Output "FRAGMENTS=$(Join-Path $resolvedRoot 'fragments')"
Write-Output "USED=$(Join-Path $resolvedRoot 'used')"
Write-Output "CONFIG=$configPath"
