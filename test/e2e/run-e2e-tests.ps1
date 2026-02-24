#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Quick runner for E2E tests

.DESCRIPTION
    Helper script to set up and run E2E tests with proper environment

.PARAMETER Scenario
    Which scenario to test: teams-bot, eventhub, direct-graph, or all

.EXAMPLE
    .\run-e2e-tests.ps1 -Scenario teams-bot
    .\run-e2e-tests.ps1 -Scenario all
#>

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet('teams-bot', 'eventhub', 'direct-graph', 'all')]
    [string]$Scenario = 'all'
)

$ErrorActionPreference = "Stop"

Write-Host "`n╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║              Teams Meeting Fetcher - E2E Tests                 ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Check if we're in the right directory
$e2eDir = Join-Path $PSScriptRoot "test" "e2e"
if (-not (Test-Path $e2eDir)) {
    Write-Host "❌ Error: test/e2e directory not found" -ForegroundColor Red
    Write-Host "   Run this script from the project root: .\test\e2e\run-e2e-tests.ps1" -ForegroundColor Yellow
    exit 1
}

# Check for .env.test file
$envTestFile = Join-Path $PSScriptRoot ".env.test"
if (-not (Test-Path $envTestFile)) {
    Write-Host "⚠️  Warning: .env.test file not found" -ForegroundColor Yellow
    Write-Host "   Copying .env.test.example to .env.test..." -ForegroundColor Yellow
    
    $envExampleFile = Join-Path $e2eDir ".env.test.example"
    if (Test-Path $envExampleFile) {
        Copy-Item $envExampleFile $envTestFile
        Write-Host "✅ Created .env.test from example" -ForegroundColor Green
        Write-Host "`n⚠️  IMPORTANT: Edit .env.test with your actual values before running tests!" -ForegroundColor Yellow
        Write-Host "   Opening .env.test in default editor..." -ForegroundColor Cyan
        Start-Process $envTestFile
        Write-Host "`nPress any key when ready to continue..."
        $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    } else {
        Write-Host "❌ Error: .env.test.example not found" -ForegroundColor Red
        exit 1
    }
}

# Check for node_modules in e2e directory
$nodeModulesDir = Join-Path $e2eDir "node_modules"
if (-not (Test-Path $nodeModulesDir)) {
    Write-Host "📦 Installing E2E test dependencies..." -ForegroundColor Cyan
    Push-Location $e2eDir
    try {
        npm install
        Write-Host "✅ Dependencies installed" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to install dependencies: $_" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Pop-Location
}

# Run the appropriate test
Write-Host "`n🧪 Running E2E tests for scenario: $Scenario`n" -ForegroundColor Cyan

Push-Location $e2eDir
try {
    switch ($Scenario) {
        'teams-bot' {
            Write-Host "Testing Teams Bot scenario (Scenario 1)..." -ForegroundColor Yellow
            npm run test:teams-bot
        }
        'eventhub' {
            Write-Host "Testing EventHub scenario (Scenario 2)..." -ForegroundColor Yellow
            npm run test:eventhub
        }
        'direct-graph' {
            Write-Host "Testing Direct Graph API scenario (Scenario 3)..." -ForegroundColor Yellow
            npm run test:direct-graph
        }
        'all' {
            Write-Host "Testing all scenarios..." -ForegroundColor Yellow
            npm test
        }
    }
    
    $exitCode = $LASTEXITCODE
    
    if ($exitCode -eq 0) {
        Write-Host "`n✅ E2E tests completed successfully!" -ForegroundColor Green
    } else {
        Write-Host "`n⚠️  E2E tests completed with failures" -ForegroundColor Yellow
        Write-Host "   Review the output above for details" -ForegroundColor Yellow
    }
    
} catch {
    Write-Host "`n❌ Error running tests: $_" -ForegroundColor Red
    exit 1
} finally {
    Pop-Location
}

Write-Host "`n📚 For more information, see test/e2e/README.md`n" -ForegroundColor Cyan
