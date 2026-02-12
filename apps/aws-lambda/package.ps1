$ErrorActionPreference = "Stop"
$zipPath = Join-Path $PSScriptRoot "lambda.zip"

if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}

Compress-Archive -Path (Join-Path $PSScriptRoot "handler.js") -DestinationPath $zipPath
Write-Host "Created $zipPath"
