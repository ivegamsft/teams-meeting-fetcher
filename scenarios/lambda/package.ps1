$ErrorActionPreference = "Stop"
$buildDir = Join-Path $PSScriptRoot ".build"
$zipPath = Join-Path $PSScriptRoot "lambda.zip"

if (Test-Path $buildDir) { Remove-Item $buildDir -Recurse -Force }
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

New-Item -ItemType Directory -Path $buildDir -Force | Out-Null

# Install Python dependencies into build directory
pip install -r (Join-Path $PSScriptRoot "requirements.txt") -t $buildDir --quiet
Copy-Item (Join-Path $PSScriptRoot "renewal-function.py") $buildDir

Push-Location $buildDir
Compress-Archive -Path * -DestinationPath $zipPath
Pop-Location

Write-Host "Created $zipPath"
