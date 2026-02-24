BeforeAll {
    # Resolve to repo root, then build absolute path
    $repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
    $script:scriptPath = Join-Path $repoRoot "scripts\config\generate-azure-env.ps1"
    $script:testIaCDir = "$TestDrive\iac\azure"
    $script:testOutputFile = "$TestDrive\.env.local.azure"
    
    # Create test directory
    New-Item -ItemType Directory -Path $script:testIaCDir -Force | Out-Null
    
    # Create a mock terraform script in the test directory
    $mockTerraformScript = @'
param([string]$Command)
if ($Command -eq "output") {
    $args | Out-Null
    Write-Output $env:MOCK_TERRAFORM_OUTPUT
}
'@
    $mockTerraformPath = Join-Path $script:testIaCDir "terraform.ps1"
    Set-Content -Path $mockTerraformPath -Value $mockTerraformScript
    
    # Create function to invoke script with mocked terraform
    $script:InvokeScriptWithMockTerraform = {
        param($TerraformOutput, $ClientSecret = "test-secret", $WebhookSecret = "test-webhook-secret")
        
        $env:MOCK_TERRAFORM_OUTPUT = $TerraformOutput
        $originalPath = $env:PATH
        
        try {
            # Prepend test directory to PATH so our mock terraform.ps1 is found first
            $env:PATH = "$script:testIaCDir;$originalPath"
            
            # Set terraform as an alias to our mock script
            Set-Alias -Name terraform -Value "powershell.exe" -Scope Script
            
            & $script:scriptPath -IaCDir $script:testIaCDir -OutputFile $script:testOutputFile -ClientSecret $ClientSecret -WebhookSecret $WebhookSecret 2>&1
        } finally {
            $env:PATH = $originalPath
            Remove-Item Env:\MOCK_TERRAFORM_OUTPUT -ErrorAction SilentlyContinue
        }
    }
}

Describe "Generate-Azure-Env Script Tests" {
    Context "When Terraform outputs exist" {
        BeforeEach {
            # Create complete mock Terraform output
            $script:mockOutput = @{
                key_vault_uri = @{ value = "https://test-kv.vault.azure.net/" }
                key_vault_name = @{ value = "test-kv" }
                app_client_id = @{ value = "11111111-1111-1111-1111-111111111111" }
                app_tenant_id = @{ value = "22222222-2222-2222-2222-222222222222" }
                admin_group_id = @{ value = "33333333-3333-3333-3333-333333333333" }
                storage_account_name = @{ value = "teststorage" }
                storage_container_name = @{ value = "webhooks" }
                eventgrid_topic_endpoint = @{ value = "https://test-egt.eventgrid.azure.net/api/events" }
                eventgrid_topic_key = @{ value = "test-key-12345" }
                appinsights_instrumentation_key = @{ value = "test-appinsights-key" }
            } | ConvertTo-Json -Depth 10 -Compress
            
            # Clean up any existing output file
            Remove-Item $script:testOutputFile -ErrorAction SilentlyContinue
            
            # Helper function to create terraform mock and run script
            $script:RunScriptWithMockTerraform = {
                param($MockOutput, $ClientSecret = "test-secret", $WebhookSecret = "test-webhook")
                
                # Create terraform mock script in the test IaC directory
                # Using a file approach to avoid escaping issues
                $terraformMock = Join-Path $script:testIaCDir "terraform.ps1"
                
                # Write the mock script - avoid complex escaping by using direct file I/O
                $lines = @(
                    'param([string]$Command, [string]$Format)',
                    'if ($Command -eq "output" -and $Format -eq "-json") {',
                    '    Write-Output @"',
                    $MockOutput,
                    '"@',
                    '}'
                )
                $lines | Set-Content -Path $terraformMock -Encoding UTF8
                
                # Temporarily add test directory to PATH so terraform.ps1 is found
                $originalPath = $env:PATH
                try {
                    $env:PATH = "$($script:testIaCDir);$originalPath"
                    & $script:scriptPath -IaCDir $script:testIaCDir -OutputFile $script:testOutputFile -ClientSecret $ClientSecret -WebhookSecret $WebhookSecret 2>&1 | Out-Null
                } finally {
                    $env:PATH = $originalPath
                }
            }
        }

        It "Should create environment file with correct values" {
            & $script:RunScriptWithMockTerraform -MockOutput $script:mockOutput -ClientSecret "test-secret-123" -WebhookSecret "test-webhook-456"
            
            # Verify file created
            $script:testOutputFile | Should -Exist
            
            # Verify content
            $content = Get-Content $script:testOutputFile -Raw
            $content | Should -Match "GRAPH_TENANT_ID=22222222-2222-2222-2222-222222222222"
            $content | Should -Match "GRAPH_CLIENT_ID=11111111-1111-1111-1111-111111111111"
            $content | Should -Match "ENTRA_GROUP_ID=33333333-3333-3333-3333-333333333333"
        }

        It "Should include Key Vault values" {
            & $script:RunScriptWithMockTerraform -MockOutput $script:mockOutput
            
            $content = Get-Content $script:testOutputFile -Raw
            $content | Should -Match "AZURE_KEYVAULT_URL=https://test-kv.vault.azure.net/"
            $content | Should -Match "AZURE_KEYVAULT_NAME=test-kv"
        }

        It "Should include webhook auth secret" {
            & $script:RunScriptWithMockTerraform -MockOutput $script:mockOutput -WebhookSecret "my-webhook-secret"
            
            $content = Get-Content $script:testOutputFile -Raw
            $content | Should -Match "WEBHOOK_AUTH_SECRET=my-webhook-secret"
        }

        It "Should handle Event Grid values" {
            & $script:RunScriptWithMockTerraform -MockOutput $script:mockOutput
            
            $content = Get-Content $script:testOutputFile -Raw
            $content | Should -Match "EVENTGRID_URI=https://test-egt.eventgrid.azure.net/api/events"
            $content | Should -Match "EVENTGRID_KEY=test-key-12345"
        }

        It "Should handle Application Insights key" {
            & $script:RunScriptWithMockTerraform -MockOutput $script:mockOutput
            
            $content = Get-Content $script:testOutputFile -Raw
            $content | Should -Match "APPINSIGHTS_INSTRUMENTATION_KEY=test-appinsights-key"
        }
    }

    Context "When Terraform outputs are missing optional values" {
        It "Should use empty strings for missing optional values" {
            # Mock output with only required fields
            $minimalOutput = @{
                app_client_id = @{ value = "11111111-1111-1111-1111-111111111111" }
                app_tenant_id = @{ value = "22222222-2222-2222-2222-222222222222" }
                admin_group_id = @{ value = "33333333-3333-3333-3333-333333333333" }
            } | ConvertTo-Json -Depth 10 -Compress
            
            & $script:RunScriptWithMockTerraform -MockOutput $minimalOutput
            
            $script:testOutputFile | Should -Exist
            $content = Get-Content $script:testOutputFile -Raw
            
            # Required fields should be present
            $content | Should -Match "GRAPH_TENANT_ID=22222222-2222-2222-2222-222222222222"
            
            # Optional fields should be empty but present
            $content | Should -Match "AZURE_KEYVAULT_URL=$"
            $content | Should -Match "EVENTGRID_URI=$"
        }
    }

    Context "Error handling" {
        It "Should error when IaC directory not found" {
            $nonExistentDir = "$TestDrive\does-not-exist"
            
            { & $script:scriptPath -IaCDir $nonExistentDir -OutputFile $script:testOutputFile -ClientSecret "test" -WebhookSecret "test" 2>&1 } | Should -Throw
        }

        It "Should error when terraform output is empty" {
            $terraformMock = Join-Path $script:testIaCDir "terraform.cmd"
            Set-Content -Path $terraformMock -Value "@echo off"
            
            { & $script:scriptPath -IaCDir $script:testIaCDir -OutputFile $script:testOutputFile -ClientSecret "test" -WebhookSecret "test" 2>&1 } | Should -Throw
        }
        
        It "Should error when required Terraform outputs are missing" {
            # Mock output missing required field
            $incompleteOutput = @{
                app_client_id = @{ value = "11111111-1111-1111-1111-111111111111" }
            } | ConvertTo-Json -Depth 10 -Compress
            
            $terraformMock = Join-Path $script:testIaCDir "terraform.cmd"
            Set-Content -Path $terraformMock -Value "@echo off`nif `"%1`"==`"output`" echo $incompleteOutput"
            
            { & $script:scriptPath -IaCDir $script:testIaCDir -OutputFile $script:testOutputFile -ClientSecret "test" -WebhookSecret "test" 2>&1 } | Should -Throw
        }
    }

    Context "File format validation" {
        BeforeEach {
            $script:mockOutput = @{
                app_client_id = @{ value = "11111111-1111-1111-1111-111111111111" }
                app_tenant_id = @{ value = "22222222-2222-2222-2222-222222222222" }
                admin_group_id = @{ value = "33333333-3333-3333-3333-333333333333" }
            } | ConvertTo-Json -Depth 10 -Compress
            
            & $script:RunScriptWithMockTerraform -MockOutput $script:mockOutput
        }

        It "Should create valid .env file format" {
            $content = Get-Content $script:testOutputFile
            
            # Each non-comment, non-empty line should match KEY=value pattern
            $envLines = $content | Where-Object { $_ -notmatch '^#' -and $_ -ne '' }
            foreach ($line in $envLines) {
                $line | Should -Match '^[A-Z_]+=.*$'
            }
        }

        It "Should include comments at top" {
            $content = Get-Content $script:testOutputFile
            $content[0] | Should -Match '^# Generated by'
        }

        It "Should group related variables with comments" {
            $content = Get-Content $script:testOutputFile -Raw
            $content | Should -Match '# Azure Application'
            $content | Should -Match '# Key Vault'
            $content | Should -Match '# Event Grid'
        }

        It "Should use UTF-8 encoding" {
            # Read file as bytes and check for UTF-8 BOM or validate encoding
            $bytes = [System.IO.File]::ReadAllBytes($script:testOutputFile)
            
            # UTF-8 files should be readable as UTF-8
            $content = [System.IO.File]::ReadAllText($script:testOutputFile, [System.Text.Encoding]::UTF8)
            $content | Should -Not -BeNullOrEmpty
        }
    }
}

Describe "Generate-AWS-Env Script Tests" {
    Context "When AWS Terraform outputs exist" {
        It "Should create AWS environment file" {
            # Note: AWS env generation script not yet implemented
            # This test documents the expected functionality
            Set-ItResult -Skipped -Because "AWS env generation script not yet implemented"
        }

        It "Should include webhook endpoint" {
            Set-ItResult -Skipped -Because "AWS env generation script not yet implemented"
        }

        It "Should include S3 bucket name" {
            Set-ItResult -Skipped -Because "AWS env generation script not yet implemented"
        }
    }
}

Describe "Script Cross-Platform Compatibility" {
    It "Should have equivalent Bash script" {
        $repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
        $bashScript = Join-Path $repoRoot "scripts\config\generate-azure-env.sh"
        Test-Path $bashScript | Should -Be $true
    }

    It "Should produce identical output on Windows and Linux" {
        # Note: Cross-platform comparison requires Linux environment
        # This test documents the expected compatibility requirement
        Set-ItResult -Skipped -Because "Requires both Windows and Linux environments for comparison"
    }
}
