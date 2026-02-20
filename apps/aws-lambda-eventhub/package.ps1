$ErrorActionPreference = "Stop"
$zipPath = Join-Path $PSScriptRoot "lambda.zip"

if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}

Push-Location $PSScriptRoot
Compress-Archive -Path handler.js,node_modules -DestinationPath $zipPath
Pop-Location

Write-Host "Created $zipPath"
