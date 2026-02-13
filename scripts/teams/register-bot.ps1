<#
.SYNOPSIS
  Registers the Teams bot in Azure Bot Service so the bot ID is recognized by Bot Framework.

.DESCRIPTION
  Creates an Azure Bot resource linked to the existing Entra app registration.
  Sets the messaging endpoint to the API Gateway URL.

.PARAMETER BotAppId
  The Entra app registration (client ID) for the bot. Defaults to env or manifest value.

.PARAMETER MessagingEndpoint
  The HTTPS endpoint where Bot Framework will POST activities.

.PARAMETER ResourceGroup
  Azure resource group to create the bot in.

.PARAMETER BotName
  Display name for the Azure Bot resource.

.EXAMPLE
  ./scripts/teams/register-bot.ps1 `
    -BotAppId "47b8b5b3-45de-4087-86d6-5f6687ef7c90" `
    -MessagingEndpoint "https://h0m58vi4y5.execute-api.us-east-1.amazonaws.com/bot/messages" `
    -ResourceGroup "tmf-bot-rg" `
    -BotName "meeting-fetcher-bot"
#>

param(
  [Parameter(Mandatory=$false)]
  [string]$BotAppId = "47b8b5b3-45de-4087-86d6-5f6687ef7c90",

  [Parameter(Mandatory=$false)]
  [string]$MessagingEndpoint = "https://h0m58vi4y5.execute-api.us-east-1.amazonaws.com/bot/messages",

  [Parameter(Mandatory=$false)]
  [string]$ResourceGroup = "tmf-bot-rg",

  [Parameter(Mandatory=$false)]
  [string]$BotName = "meeting-fetcher-bot",

  [Parameter(Mandatory=$false)]
  [string]$Location = "global"
)

$ErrorActionPreference = "Stop"

Write-Host "`n=== Azure Bot Registration ===" -ForegroundColor Cyan
Write-Host "Bot App ID:         $BotAppId"
Write-Host "Messaging Endpoint: $MessagingEndpoint"
Write-Host "Resource Group:     $ResourceGroup"
Write-Host "Bot Name:           $BotName"
Write-Host ""

# 1. Verify az CLI login
Write-Host "Checking Azure CLI login..." -ForegroundColor Yellow
$account = az account show --output json 2>$null | ConvertFrom-Json
if (-not $account) {
  Write-Error "Not logged in to Azure CLI. Run 'az login' first."
  exit 1
}
Write-Host "Logged in as: $($account.user.name) | Subscription: $($account.name)" -ForegroundColor Green

# 2. Create resource group if it doesn't exist
Write-Host "`nEnsuring resource group '$ResourceGroup' exists..." -ForegroundColor Yellow
$rgExists = az group exists --name $ResourceGroup --output tsv 2>$null
if ($rgExists -ne "true") {
  Write-Host "Creating resource group in eastus..."
  az group create --name $ResourceGroup --location eastus --output none
  Write-Host "Resource group created." -ForegroundColor Green
} else {
  Write-Host "Resource group already exists." -ForegroundColor Green
}

# 3. Check if bot already exists
Write-Host "`nChecking for existing bot resource..." -ForegroundColor Yellow
$existingBot = az bot show --name $BotName --resource-group $ResourceGroup --output json 2>$null | ConvertFrom-Json
if ($existingBot) {
  Write-Host "Bot '$BotName' already exists. Updating messaging endpoint..." -ForegroundColor Yellow
  az bot update `
    --name $BotName `
    --resource-group $ResourceGroup `
    --endpoint $MessagingEndpoint `
    --output none
  Write-Host "Messaging endpoint updated." -ForegroundColor Green
} else {
  # 4. Create the Azure Bot resource
  Write-Host "Creating Azure Bot resource..." -ForegroundColor Yellow
  az bot create `
    --resource-group $ResourceGroup `
    --name $BotName `
    --app-type SingleTenant `
    --appid $BotAppId `
    --endpoint $MessagingEndpoint `
    --sku F0 `
    --output none

  Write-Host "Azure Bot resource created." -ForegroundColor Green
}

# 5. Enable the Teams channel
Write-Host "`nEnabling Microsoft Teams channel..." -ForegroundColor Yellow
$channelExists = $false
try {
  $channels = az bot show --name $BotName --resource-group $ResourceGroup --msbot --output json 2>$null | ConvertFrom-Json
  # Try the direct channel command
  az bot msteams show --name $BotName --resource-group $ResourceGroup --output none 2>$null
  $channelExists = $true
  Write-Host "Teams channel already enabled." -ForegroundColor Green
} catch {
  $channelExists = $false
}

if (-not $channelExists) {
  try {
    az bot msteams create --name $BotName --resource-group $ResourceGroup --output none
    Write-Host "Teams channel enabled." -ForegroundColor Green
  } catch {
    Write-Host "Warning: Could not auto-enable Teams channel. Enable it manually in Azure Portal > Bot Services > $BotName > Channels > Microsoft Teams" -ForegroundColor Yellow
  }
}

# 6. Summary
Write-Host "`n=== Registration Complete ===" -ForegroundColor Cyan
Write-Host "Bot Name:           $BotName"
Write-Host "Bot App ID:         $BotAppId"
Write-Host "Messaging Endpoint: $MessagingEndpoint"
Write-Host "Resource Group:     $ResourceGroup"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Verify in Azure Portal: portal.azure.com > Bot Services > $BotName"
Write-Host "  2. Ensure Teams channel is enabled under Channels"
Write-Host "  3. Re-upload the Teams app package"
Write-Host "  4. Test with: curl -X POST $MessagingEndpoint -H 'Content-Type: application/json' -d '{""type"":""message"",""text"":""Hi""}'"
