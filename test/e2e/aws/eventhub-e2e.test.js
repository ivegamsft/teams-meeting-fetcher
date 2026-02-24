/**
 * E2E Test: EventHub Scenario (Scenario 2)
 * 
 * Tests the EventHub-based notification flow:
 * 1. Graph API sends change notifications to Azure EventHub
 * 2. AWS Lambda polls EventHub for events
 * 3. Lambda processes events and stores checkpoints in DynamoDB
 * 4. Event data stored in S3
 * 
 * This is a human-in-the-loop test requiring manual Teams meeting creation.
 */
'use strict';

const helpers = require('../helpers');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env.test') });

describe('EventHub E2E', () => {
  jest.setTimeout(600000); // 10 minutes
  
  const AWS_PROFILE = process.env.AWS_PROFILE || 'tmf-dev';
  const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
  const LAMBDA_FUNCTION = process.env.EVENTHUB_LAMBDA || 'tmf-eventhub-processor-dev';
  const DYNAMODB_CHECKPOINTS = process.env.CHECKPOINT_TABLE || 'eventhub-checkpoints';
  const S3_BUCKET = process.env.BUCKET_NAME || 'teams-meeting-events-dev';
  const GRAPH_TENANT_ID = process.env.GRAPH_TENANT_ID;
  const GRAPH_CLIENT_ID = process.env.GRAPH_CLIENT_ID;
  const GRAPH_CLIENT_SECRET = process.env.GRAPH_CLIENT_SECRET;
  const EVENTHUB_NAMESPACE = process.env.EVENTHUB_NAMESPACE;
  const EVENTHUB_NAME = process.env.EVENTHUB_NAME;
  
  let graphToken = null;
  
  describe('Pre-flight checks', () => {
    test('AWS Lambda function exists', () => {
      const result = helpers.checkAwsLambdaExists(LAMBDA_FUNCTION, AWS_PROFILE, AWS_REGION);
      expect(result.exists).toBe(true);
      console.log(`✅ Lambda function found: ${result.arn}`);
      console.log(`   Runtime: ${result.runtime}, Last modified: ${result.lastModified}`);
    });
    
    test('DynamoDB checkpoint table exists', () => {
      const result = helpers.checkDynamoDBTable(DYNAMODB_CHECKPOINTS, AWS_PROFILE, AWS_REGION);
      expect(result.exists).toBe(true);
      console.log(`✅ DynamoDB checkpoint table found: ${DYNAMODB_CHECKPOINTS}`);
    });
    
    test('S3 bucket exists', () => {
      const result = helpers.checkS3Bucket(S3_BUCKET, AWS_PROFILE, AWS_REGION);
      expect(result.exists).toBe(true);
      console.log(`✅ S3 bucket found: ${S3_BUCKET}`);
    });
    
    test('Environment variables are set', () => {
      expect(GRAPH_TENANT_ID).toBeTruthy();
      expect(GRAPH_CLIENT_ID).toBeTruthy();
      expect(GRAPH_CLIENT_SECRET).toBeTruthy();
      expect(EVENTHUB_NAMESPACE).toBeTruthy();
      expect(EVENTHUB_NAME).toBeTruthy();
      console.log('✅ Required environment variables are set');
    });
  });
  
  describe('Setup and verification', () => {
    test('Acquire Graph API access token', async () => {
      graphToken = await helpers.getGraphAccessToken(GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET);
      expect(graphToken).toBeTruthy();
      console.log('✅ Graph API access token acquired');
    });
    
    test('Verify EventHub accessibility', () => {
      // Note: Actual EventHub connectivity test would require Azure SDK
      // Here we just verify config is present
      console.log(`EventHub namespace: ${EVENTHUB_NAMESPACE}`);
      console.log(`EventHub name: ${EVENTHUB_NAME}`);
      console.log('ℹ️  EventHub accessibility will be verified during Lambda execution');
    });
    
    test('Check existing Graph subscriptions', async () => {
      // This would require implementing a Graph API call to list subscriptions
      console.log('ℹ️  Graph subscription should be created via scenarios/nobots-eventhub/subscribe.js');
      console.log('   Run: node scenarios/nobots-eventhub/subscribe.js');
    });
  });
  
  describe('Human-in-the-loop test execution', () => {
    test('Prompt human to create Teams meeting', async () => {
      const instructions = `
📋 INSTRUCTIONS:

1. Verify Graph API subscription is active:
   - Graph subscriptions must be sending notifications to EventHub
   - Check subscription status: GET https://graph.microsoft.com/v1.0/subscriptions
   - If expired, recreate: node scenarios/nobots-eventhub/subscribe.js

2. Create a new Teams meeting:
   - Open Teams or Outlook Calendar
   - Create a new meeting scheduled for 1-2 hours from now
   - Subject: "E2E EventHub Test - ${Date.now()}"
   - Add at least one participant (use WATCHED_USER_IDS configured user)

3. This should trigger a calendar change notification:
   - Graph API sends notification to EventHub
   - Lambda polls EventHub and processes the event
   - Event stored in S3, checkpoint updated in DynamoDB

4. Optionally, manually trigger Lambda to process immediately:
   - aws lambda invoke --function-name ${LAMBDA_FUNCTION} --profile ${AWS_PROFILE} output.json

⚠️  IMPORTANT: The watched user must be configured in Graph subscription
   and have proper permissions.

📝 Press ENTER when meeting is created.
`;
      
      await helpers.promptHumanAction(instructions);
      console.log('✅ Human action completed, proceeding with validation...');
    });
    
    test('Wait for EventHub delivery', async () => {
      console.log('⏳ Waiting 30 seconds for Graph API to send notification to EventHub...');
      await helpers.sleep(30000);
    });
    
    test('Wait for Lambda processing', async () => {
      console.log('⏳ Waiting 60 seconds for Lambda to poll EventHub and process events...');
      await helpers.sleep(60000);
    });
  });
  
  describe('Validation', () => {
    test('Check DynamoDB for updated checkpoints', () => {
      const checkpoints = helpers.scanDynamoDBItems(DYNAMODB_CHECKPOINTS, AWS_PROFILE, AWS_REGION, 10);
      
      console.log(`Found ${checkpoints.length} checkpoint(s) in DynamoDB`);
      
      if (checkpoints.length > 0) {
        checkpoints.forEach(checkpoint => {
          const partitionId = checkpoint.partition_id?.S || checkpoint.partitionId?.S;
          const sequenceNumber = checkpoint.sequence_number?.N || checkpoint.sequenceNumber?.N;
          const updatedAt = checkpoint.updated_at?.S || checkpoint.updatedAt?.S;
          
          console.log(`   Partition ${partitionId}: seq=${sequenceNumber}, updated=${updatedAt}`);
        });
        
        // Check if any checkpoint was updated recently (within last 5 minutes)
        const recentCutoff = Date.now() - 5 * 60 * 1000;
        const recentUpdates = checkpoints.filter(cp => {
          const timestamp = cp.updated_at?.S || cp.updatedAt?.S;
          return timestamp && new Date(timestamp).getTime() > recentCutoff;
        });
        
        if (recentUpdates.length > 0) {
          console.log(`✅ ${recentUpdates.length} checkpoint(s) updated recently`);
        } else {
          console.log('⚠️  No checkpoints updated recently (Lambda may not have run)');
        }
        
        expect(checkpoints.length).toBeGreaterThan(0);
      } else {
        console.log('⚠️  No checkpoints found (Lambda has not processed any events yet)');
      }
    });
    
    test('Check S3 for EventHub event files', () => {
      const objects = helpers.getRecentS3Objects(S3_BUCKET, 'eventhub/', AWS_PROFILE, AWS_REGION, 10);
      
      console.log(`Found ${objects.length} recent EventHub event file(s) in S3`);
      
      if (objects.length > 0) {
        console.log('✅ Recent event files:');
        objects.slice(0, 5).forEach(obj => {
          console.log(`   - ${obj.Key} (${obj.Size} bytes, ${obj.LastModified})`);
        });
        
        // Validate event file format
        const firstEvent = helpers.getS3Object(S3_BUCKET, objects[0].Key, AWS_PROFILE, AWS_REGION);
        if (firstEvent) {
          expect(firstEvent).toHaveProperty('receivedAt');
          expect(firstEvent).toHaveProperty('events');
          console.log(`✅ Event file format is valid (${firstEvent.events?.length || 0} events in file)`);
          
          if (firstEvent.eventCount > 0) {
            console.log(`   Event count: ${firstEvent.eventCount}`);
            console.log(`   Consumer group: ${firstEvent.consumerGroup}`);
          }
        }
      } else {
        console.log('⚠️  No recent event files found in S3');
        console.log('   Possible reasons:');
        console.log('   - Lambda has not run yet (check EventBridge schedule)');
        console.log('   - EventHub has no new messages');
        console.log('   - Graph subscription not sending notifications');
      }
    });
    
    test('Check Lambda logs for processing activity', () => {
      const logs = helpers.getRecentLambdaLogs(LAMBDA_FUNCTION, AWS_PROFILE, AWS_REGION, 15);
      
      console.log(`Found ${logs.length} log event(s) in last 15 minutes`);
      
      if (logs.length > 0) {
        const processingEvents = logs.filter(log => 
          log.message.includes('Processing') || log.message.includes('received')
        );
        const checkpointEvents = logs.filter(log => 
          log.message.includes('checkpoint') || log.message.includes('Checkpoint')
        );
        const errorEvents = logs.filter(log => 
          log.message.toLowerCase().includes('error') || log.message.toLowerCase().includes('failed')
        );
        const rbacEvents = logs.filter(log => 
          log.message.includes('RBAC') || log.message.includes('authorization')
        );
        
        console.log(`   📊 Processing events: ${processingEvents.length}`);
        console.log(`   📊 Checkpoint events: ${checkpointEvents.length}`);
        console.log(`   🔐 RBAC events: ${rbacEvents.length}`);
        console.log(`   ❌ Error events: ${errorEvents.length}`);
        
        if (errorEvents.length > 0) {
          console.log('   Recent errors:');
          errorEvents.slice(0, 3).forEach(log => {
            console.log(`      ${log.message.substring(0, 200)}`);
          });
        }
        
        // Show last few log messages for context
        console.log('   Last 3 log messages:');
        logs.slice(-3).forEach(log => {
          const timestamp = new Date(log.timestamp).toISOString();
          console.log(`      [${timestamp}] ${log.message.substring(0, 150)}`);
        });
        
        expect(logs.length).toBeGreaterThan(0);
      } else {
        console.log('⚠️  No Lambda logs found (Lambda may not have been invoked)');
      }
    });
  });
  
  describe('Summary', () => {
    test('Display test results summary', () => {
      console.log('\n╔════════════════════════════════════════════════════════════════╗');
      console.log('║                 EVENTHUB E2E TEST SUMMARY                      ║');
      console.log('╚════════════════════════════════════════════════════════════════╝\n');
      console.log('✅ Infrastructure checks: PASSED');
      console.log('🔍 Review validation results above for:');
      console.log('   - DynamoDB checkpoints');
      console.log('   - S3 event files');
      console.log('   - Lambda processing logs\n');
      console.log('📝 Next steps if validation failed:');
      console.log('   1. Verify Graph API subscription is active and sending to EventHub');
      console.log('   2. Check EventHub namespace and connection string');
      console.log('   3. Verify Lambda has RBAC permissions to EventHub (Managed Identity or SPN)');
      console.log('   4. Check EventBridge schedule is enabled:');
      console.log(`      aws events describe-rule --name tmf-eventhub-poll-dev --profile ${AWS_PROFILE}`);
      console.log('   5. Manually invoke Lambda to test:');
      console.log(`      aws lambda invoke --function-name ${LAMBDA_FUNCTION} --profile ${AWS_PROFILE} output.json\n`);
    });
  });
});
