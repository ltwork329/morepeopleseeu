param(
  [switch]$IncludePrivateConfig
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$ReleaseRoot = Join-Path $Root "release"
$PackageName = "morepeopleseeu-windows-portable"
$PackageDir = Join-Path $ReleaseRoot $PackageName
$ZipPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "$PackageName.zip"
$NodeExe = (Get-Command node.exe).Source

if (Test-Path $PackageDir) { Remove-Item -LiteralPath $PackageDir -Recurse -Force }
New-Item -ItemType Directory -Path $PackageDir | Out-Null
New-Item -ItemType Directory -Path (Join-Path $PackageDir "runtime\node") -Force | Out-Null

$excludeDirs = @(
  ".git",
  "release",
  "local_materials\unused",
  "local_materials\used",
  "local_materials\fragments",
  "local_materials\source_backup",
  "public\generated_audio",
  "public\generated_subtitles",
  "public\generated_videos",
  "dist\generated_audio",
  "dist\generated_subtitles",
  "dist\generated_videos"
)
$excludeFiles = @("configs\tts_minimax.env", "public\material_inventory.json")

Get-ChildItem -LiteralPath $Root -Force | ForEach-Object {
  $name = $_.Name
  if ($name -in @(".git", "release")) { return }
  $target = Join-Path $PackageDir $name
  if ($_.PSIsContainer) {
    if ($name -eq "local_materials") {
      New-Item -ItemType Directory -Path (Join-Path $PackageDir "local_materials") -Force | Out-Null
      return
    }
    Copy-Item -LiteralPath $_.FullName -Destination $target -Recurse -Force
  } else {
    if ($name -eq "configs\tts_minimax.env") { return }
    Copy-Item -LiteralPath $_.FullName -Destination $target -Force
  }
}

foreach ($relative in $excludeFiles) {
  $file = Join-Path $PackageDir $relative
  if (Test-Path $file) { Remove-Item -LiteralPath $file -Force }
}

foreach ($relative in $excludeDirs) {
  $dir = Join-Path $PackageDir $relative
  if (Test-Path $dir) { Remove-Item -LiteralPath $dir -Recurse -Force }
}

if ($IncludePrivateConfig) {
  $privateConfig = Join-Path $Root "configs\tts_minimax.env"
  if (Test-Path $privateConfig) {
    New-Item -ItemType Directory -Path (Join-Path $PackageDir "configs") -Force | Out-Null
    Copy-Item -LiteralPath $privateConfig -Destination (Join-Path $PackageDir "configs\tts_minimax.env") -Force
  }
}

Copy-Item -LiteralPath $NodeExe -Destination (Join-Path $PackageDir "runtime\node\node.exe") -Force
New-Item -ItemType Directory -Path (Join-Path $PackageDir "local_materials\unused") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $PackageDir "local_materials\fragments") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $PackageDir "local_materials\used") -Force | Out-Null

if (Test-Path $ZipPath) { Remove-Item -LiteralPath $ZipPath -Force }
Compress-Archive -Path (Join-Path $PackageDir "*") -DestinationPath $ZipPath -Force

Write-Host "Windows portable package ready:"
Write-Host $ZipPath
Write-Host "Run 一键安装.bat first, then 一键启动.bat."
