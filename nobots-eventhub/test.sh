#!/bin/bash
# EventHub E2E Testing Quick Start
# Run this to execute the complete testing workflow

set -e

echo "=========================================="
echo "EventHub E2E Testing Quick Start"
echo "=========================================="
echo ""

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Pre-flight checks
echo -e "${BLUE}STEP 1: Running pre-flight checks...${NC}"
echo "Run this in your terminal:"
echo "  python nobots-eventhub/scripts/list-subscriptions.py"
echo ""
read -p "Press Enter after confirming subscription is active..."

# Step 2: Setup monitoring terminals
echo ""
echo -e "${BLUE}STEP 2: Setup monitoring (3 terminals needed)${NC}"
echo ""
echo "Open Terminal 1 - Event Hub Processor Logs:"
echo "  aws logs tail /aws/lambda/tmf-eventhub-processor-dev --follow --profile tmf-dev --region us-east-1"
echo ""
echo "Open Terminal 2 - Webhook Writer Logs:"
echo "  aws logs tail /aws/lambda/tmf-webhook-writer-dev --follow --profile tmf-dev --region us-east-1"
echo ""
echo "Open Terminal 3 - DynamoDB Checkpoints:"
echo "  watch -n 5 'aws dynamodb scan --table-name eventhub-checkpoints --profile tmf-dev --region us-east-1 --output table'"
echo ""
read -p "Press Enter once all 3 terminals are monitoring..."

# Step 3: Create test meeting
echo ""
echo -e "${BLUE}STEP 3: Creating test meeting...${NC}"
cd nobots-eventhub/scripts
python create-test-meeting.py --title "EventHub Test $(date +'%H:%M:%S')" --minutes 60
cd ../../

echo ""
echo -e "${GREEN}✓ Test meeting created!${NC}"
echo ""
echo "Watch the 3 terminal windows for:"
echo "  • Processor logs: Should show messages received"
echo "  • Writer logs: Should show S3 upload and checkpoint update"
echo "  • DynamoDB: Offset values should increase"
echo ""
read -p "Press Enter once you see activity in the logs (usually 1-2 minutes)..."

# Step 4: Verify S3
echo ""
echo -e "${BLUE}STEP 4: Verifying S3 payloads...${NC}"
echo "Run this command:"
echo "  aws s3api list-objects-v2 --bucket tmf-webhooks-eus-dev --profile tmf-dev --region us-east-1 --prefix webhooks/ --query 'Contents[-1]'"
echo ""
read -p "Press Enter after checking S3..."

# Step 5: Verify DynamoDB
echo ""
echo -e "${BLUE}STEP 5: Final verification...${NC}"
echo "Run these commands:"
echo ""
echo "Check checkpoints:"
echo "  aws dynamodb scan --table-name eventhub-checkpoints --profile tmf-dev --region us-east-1 --output table"
echo ""
echo "Check subscriptions:"
echo "  aws dynamodb scan --table-name graph_subscriptions --profile tmf-dev --region us-east-1 --output table"
echo ""

# Summary
echo ""
echo -e "${GREEN}=========================================="
echo "Testing Complete!"
echo "==========================================${NC}"
echo ""
echo "If all steps showed data flow, your EventHub scenario is working!"
echo ""
echo "Next steps:"
echo "  1. Review MONITORING.md for operational guidance"
echo "  2. Set up CloudWatch alerts"
echo "  3. Deploy to production"
echo ""
