param(
  [string]$Message = "",
  [int]$RetryCount = 4,
  [int]$RetryDelaySeconds = 3,
  [string]$Remote = "origin",
  [string]$RemoteBranch = "autosave/main"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-WithRetry {
  param(
    [scriptblock]$Action,
    [string]$Label
  )

  for ($i = 1; $i -le $RetryCount; $i++) {
    try {
      & $Action
      return
    } catch {
      if ($i -ge $RetryCount) {
        throw "[$Label] failed after retries: $($_.Exception.Message)"
      }
      Write-Host "[$Label] attempt $i failed, retrying in $RetryDelaySeconds s..."
      Start-Sleep -Seconds $RetryDelaySeconds
    }
  }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

$localBranch = (git branch --show-current).Trim()
if (-not $localBranch) {
  throw "cannot detect current branch"
}

$remoteExists = git remote | Where-Object { $_.Trim() -eq $Remote }
if (-not $remoteExists) {
  throw "remote '$Remote' not found"
}

$status = git status --porcelain
$hasChanges = [bool]$status

if ($hasChanges) {
  git add -A
  if (-not $Message.Trim()) {
    $Message = "chore: save $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
  }
  git commit -m $Message
  Write-Host "local commit done"
} else {
  Write-Host "no local file changes, skip commit"
}

Invoke-WithRetry -Label "push" -Action {
  git push $Remote "HEAD:refs/heads/$RemoteBranch"
}

$head = (git rev-parse --short HEAD).Trim()
Write-Host "sync done: local=$localBranch remote=$Remote/$RemoteBranch @ $head"
