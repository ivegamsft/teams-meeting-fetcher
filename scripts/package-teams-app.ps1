param(
  [string]$ManifestPath = "teams-app/manifest.json",
  [string]$OutputPath = "teams-app/teams-app.zip",
  [switch]$SkipIconCheck
)

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$manifestFullPath = Join-Path $repoRoot $ManifestPath
$outputFullPath = Join-Path $repoRoot $OutputPath

if (-not (Test-Path $manifestFullPath)) {
  Write-Error "Manifest not found: $manifestFullPath"
  exit 1
}

try {
  $manifestJson = Get-Content $manifestFullPath -Raw | ConvertFrom-Json
} catch {
  Write-Error "Failed to parse manifest JSON: $manifestFullPath"
  exit 1
}

$filesToZip = @($manifestFullPath)

if (-not $SkipIconCheck) {
  $iconPaths = @()
  if ($manifestJson.icons -and $manifestJson.icons.color) {
    $iconPaths += $manifestJson.icons.color
  }
  if ($manifestJson.icons -and $manifestJson.icons.outline) {
    $iconPaths += $manifestJson.icons.outline
  }

  foreach ($iconPath in $iconPaths) {
    $iconFullPath = Join-Path (Split-Path $manifestFullPath -Parent) $iconPath
    if (-not (Test-Path $iconFullPath)) {
      Write-Error "Icon not found: $iconFullPath"
      Write-Error "Add the icon file or re-run with -SkipIconCheck"
      exit 1
    }
    $filesToZip += $iconFullPath
  }
}

if (Test-Path $outputFullPath) {
  Remove-Item $outputFullPath -Force
}

$zipRoot = Split-Path $manifestFullPath -Parent
$relativeFiles = $filesToZip | ForEach-Object { Resolve-Path $_ } | ForEach-Object { $_.Path.Substring($zipRoot.Length + 1) }

Push-Location $zipRoot
try {
  Compress-Archive -Path $relativeFiles -DestinationPath $outputFullPath
} finally {
  Pop-Location
}

Write-Host "Teams app package created: $outputFullPath"
