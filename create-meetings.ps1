# Create Teams meetings via Graph API - PowerShell version
# This bypasses Python environment issues

$ErrorActionPreference = "Stop"

# Load environment variables
$envFile = "F:\Git\teams-meeting-fetcher\.env.local.azure"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^([^=]+)=(.*)$') {
            [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
        }
    }
}

$tenantId = $env:GRAPH_TENANT_ID
$clientId = $env:GRAPH_CLIENT_ID
$clientSecret = $env:GRAPH_CLIENT_SECRET
$userEmail = "trustingboar@ibuyspy.net"

if (-not $tenantId -or -not $clientId -or -not $clientSecret) {
    Write-Host "ERROR: Missing environment variables in .env.local.azure" -ForegroundColor Red
    exit 1
}

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "CREATING TEST MEETINGS FOR EVENT HUB" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "`nStep 1: Acquiring Graph API token..." -ForegroundColor Yellow

# Get access token
$tokenUrl = "https://login.microsoftonline.com/$tenantId/oauth2/v2.0/token"
$tokenBody = @{
    client_id     = $clientId
    client_secret = $clientSecret
    scope         = "https://graph.microsoft.com/.default"
    grant_type    = "client_credentials"
}

try {
    $tokenResponse = Invoke-RestMethod -Method Post -Uri $tokenUrl -Body $tokenBody -ContentType "application/x-www-form-urlencoded"
    $accessToken = $tokenResponse.access_token
    Write-Host "   ✅ Token acquired" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Failed to get token: $_" -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $accessToken"
    "Content-Type"  = "application/json"
}

Write-Host "`nStep 2: Creating 5 test meetings..." -ForegroundColor Yellow

$successCount = 0
$failedCount = 0


for ($i = 1; $i -le 5; $i++) {
    $startTime = (Get-Date).AddHours(1).AddMinutes($i * 5).ToUniversalTime()
    $endTime = $startTime.AddMinutes(30)
    
    $meetingData = @{
        subject = "Event Hub Test Meeting #$i"
        body = @{
            contentType = "HTML"
            content = "Event Hub test meeting #$i<br><b>Transcription enabled</b>"
        }
        start = @{
            dateTime = $startTime.ToString("yyyy-MM-ddTHH:mm:ss")
            timeZone = "UTC"
        }
        end = @{
            dateTime = $endTime.ToString("yyyy-MM-ddTHH:mm:ss")
            timeZone = "UTC"
        }
        location = @{
            displayName = "Microsoft Teams Meeting"
        }
        attendees = @()
        isOnlineMeeting = $true
        onlineMeetingProvider = "teamsForBusiness"
    } | ConvertTo-Json -Depth 5
    
    Write-Host "`n   [$i] Creating: Event Hub Test Meeting #$i" -ForegroundColor White
    Write-Host "       Start: $($startTime.ToString('yyyy-MM-dd HH:mm')) UTC" -ForegroundColor Gray
    
    try {
        $url = "https://graph.microsoft.com/v1.0/users/$userEmail/events"
        $response = Invoke-RestMethod -Method Post -Uri $url -Headers $headers -Body $meetingData
        
        Write-Host "       ✅ Created: $($response.id.Substring(0,40))..." -ForegroundColor Green
       if ($response.onlineMeetingUrl) {
            Write-Host "       Join URL: $($response.onlineMeetingUrl.Substring(0,50))..." -ForegroundColor Gray
        }
        $successCount++
        
        Start-Sleep -Seconds 2
    } catch {
        Write-Host "       ❌ Failed: $_" -ForegroundColor Red
        $failedCount++
    }
}

Write-Host "`n======================================================================" -ForegroundColor Cyan
Write-Host "SUMMARY" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "✅ Successful: $successCount" -ForegroundColor Green
Write-Host "❌ Failed: $failedCount" -ForegroundColor Red

if ($successCount -gt 0) {
    Write-Host "`n📝 Next Steps:" -ForegroundColor Yellow
    Write-Host "   1. Wait 30-60 seconds for Graph notifications to be sent" -ForegroundColor White
    Write-Host "   2. Lambda polls Event Hub every 1 minute via EventBridge" -ForegroundColor White
    Write-Host "   3. Check results in AWS:" -ForegroundColor White
    Write-Host "      - S3: s3://tmf-webhooks-eus-dev/eventhub/" -ForegroundColor Gray
    Write-Host "      - DynamoDB: eventhub-checkpoints table" -ForegroundColor Gray
    Write-Host "      - CloudWatch: /aws/lambda/tmf-eventhub-processor-dev" -ForegroundColor Gray
}

Write-Host "======================================================================" -ForegroundColor Cyan
