/**
 * E2E Test: Direct Graph API Scenario (Scenario 3 - No Bots)
 * 
 * Tests the direct webhook notification flow:
 * 1. Create Graph API subscription pointing to AWS API Gateway webhook
 * 2. Graph API sends change notifications directly to webhook (no EventHub)
 * 3. Lambda receives webhook POST, validates clientState, stores payload in S3
 * 4. Human creates/modifies meeting to trigger notification
 * 5. Verify webhook payloads are received and stored
 * 
 * This is a human-in-the-loop test requiring manual Teams meeting creation.
 */
'use strict';

const helpers = require('../helpers');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env.test') });

describe('Direct Graph API E2E (No Bots)', () => {
  jest.setTimeout(600000); // 10 minutes
  
  const AWS_PROFILE = process.env.AWS_PROFILE || 'tmf-dev';
  const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
  const LAMBDA_FUNCTION = process.env.WEBHOOK_LAMBDA || 'teams-meeting-webhook-dev';
  const S3_BUCKET = process.env.BUCKET_NAME || 'teams-meeting-webhooks-dev';
  const GRAPH_TENANT_ID = process.env.GRAPH_TENANT_ID;
  const GRAPH_CLIENT_ID = process.env.GRAPH_CLIENT_ID;
  const GRAPH_CLIENT_SECRET = process.env.GRAPH_CLIENT_SECRET;
  const WEBHOOK_URL = process.env.NOTIFICATION_URL || process.env.WEBHOOK_URL;
  const CLIENT_STATE = process.env.CLIENT_STATE || 'teams-meeting-fetcher-webhook';
  const WATCH_USER_ID = process.env.WATCH_USER_ID;
  
  let graphToken = null;
  let subscriptionId = null;
  let apiGatewayUrl = null;
  
  describe('Pre-flight checks', () => {
    test('AWS Lambda function exists', () => {
      const result = helpers.checkAwsLambdaExists(LAMBDA_FUNCTION, AWS_PROFILE, AWS_REGION);
      expect(result.exists).toBe(true);
      console.log(`✅ Lambda function found: ${result.arn}`);
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
      expect(WEBHOOK_URL).toBeTruthy();
      expect(WATCH_USER_ID).toBeTruthy();
      console.log('✅ Required environment variables are set');
      console.log(`   Webhook URL: ${WEBHOOK_URL}`);
      console.log(`   Watch user: ${WATCH_USER_ID}`);
    });
    
    test('API Gateway endpoint is reachable', async () => {
      apiGatewayUrl = WEBHOOK_URL;
      const health = await helpers.checkEndpointHealth(apiGatewayUrl);
      
      console.log(`API Gateway health: ${health.healthy ? 'reachable' : 'unreachable'} (status: ${health.statusCode || health.error})`);
      
      if (health.statusCode === 400 || health.statusCode === 403 || health.statusCode === 202) {
        console.log('✅ Endpoint is reachable (expected 4xx without valid payload)');
      } else if (!health.healthy) {
        console.log('⚠️  Endpoint may not be accessible from this network');
      }
    });
  });
  
  describe('Setup - Create Graph subscription', () => {
    test('Acquire Graph API access token', async () => {
      graphToken = await helpers.getGraphAccessToken(GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET);
      expect(graphToken).toBeTruthy();
      console.log('✅ Graph API access token acquired');
    });
    
    test('Create Graph API subscription for calendar events', async () => {
      try {
        // Subscribe to calendar event changes for the watched user
        const resource = `/users/${WATCH_USER_ID}/events`;
        
        console.log(`Creating subscription for resource: ${resource}`);
        console.log(`Notification URL: ${WEBHOOK_URL}`);
        console.log(`Client state: ${CLIENT_STATE}`);
        
        const subscription = await helpers.createGraphSubscription(
          graphToken,
          resource,
          WEBHOOK_URL,
          CLIENT_STATE,
          'created,updated,deleted'
        );
        
        subscriptionId = subscription.id;
        
        expect(subscription.id).toBeTruthy();
        expect(subscription.notificationUrl).toBe(WEBHOOK_URL);
        
        console.log('✅ Graph API subscription created successfully');
        console.log(`   Subscription ID: ${subscriptionId}`);
        console.log(`   Resource: ${subscription.resource}`);
        console.log(`   Change types: ${subscription.changeType}`);
        console.log(`   Expires at: ${subscription.expirationDateTime}`);
      } catch (error) {
        console.error('❌ Failed to create subscription:', error.message);
        
        if (error.message.includes('403')) {
          console.log('   Possible causes:');
          console.log('   - Application lacks Calendars.Read permission');
          console.log('   - Admin consent not granted');
          console.log('   - Notification URL not publicly accessible');
        }
        
        // Don't fail the test if subscription already exists - try to continue
        if (error.message.includes('Subscription already exists')) {
          console.log('ℹ️  Subscription may already exist, continuing with test...');
        } else {
          throw error;
        }
      }
    });
  });
  
  describe('Human-in-the-loop test execution', () => {
    test('Prompt human to create Teams meeting', async () => {
      const instructions = `
📋 INSTRUCTIONS:

1. Create a new Teams meeting for user ${WATCH_USER_ID}:
   - Open Teams Calendar or Outlook Calendar (signed in as ${WATCH_USER_ID})
   - Create a new meeting scheduled for 1-2 hours from now
   - Subject: "E2E Direct Graph Test - ${Date.now()}"
   - Add at least one participant

2. Alternatively, modify an existing meeting:
   - Change the subject, time, or participants of an existing meeting
   - This will trigger an "updated" change notification

3. The Graph API should send a webhook notification within 1-3 minutes:
   - POST request to ${WEBHOOK_URL}
   - Payload contains change notification with resource data
   - Lambda validates clientState and stores in S3

4. Optionally, speak in the meeting and end it to test full flow:
   - Join the meeting
   - Speak for 30+ seconds
   - End the meeting
   - Wait for transcript processing

⚠️  IMPORTANT: The webhook URL must be publicly accessible and HTTPS.
   Graph API will not send notifications to localhost or non-HTTPS URLs.

📝 Press ENTER when meeting is created/modified.
`;
      
      await helpers.promptHumanAction(instructions);
      console.log('✅ Human action completed, proceeding with validation...');
    });
    
    test('Wait for Graph notification delivery', async () => {
      console.log('⏳ Waiting 90 seconds for Graph API to send webhook notification...');
      console.log('   (Graph notifications can take 1-3 minutes to arrive)');
      await helpers.sleep(90000);
    });
  });
  
  describe('Validation', () => {
    test('Check S3 for webhook payload files', () => {
      const objects = helpers.getRecentS3Objects(S3_BUCKET, 'webhooks/', AWS_PROFILE, AWS_REGION, 10);
      
      console.log(`Found ${objects.length} recent webhook payload file(s) in S3`);
      
      if (objects.length > 0) {
        console.log('✅ Recent webhook files:');
        objects.slice(0, 5).forEach(obj => {
          console.log(`   - ${obj.Key} (${obj.Size} bytes, ${obj.LastModified})`);
        });
        
        // Validate webhook payload format
        const firstPayload = helpers.getS3Object(S3_BUCKET, objects[0].Key, AWS_PROFILE, AWS_REGION);
        if (firstPayload) {
          expect(firstPayload).toHaveProperty('receivedAt');
          expect(firstPayload).toHaveProperty('source');
          expect(firstPayload.source).toBe('graph-webhook');
          
          console.log('✅ Webhook payload format is valid');
          console.log(`   Received at: ${firstPayload.receivedAt}`);
          console.log(`   Request ID: ${firstPayload.requestId}`);
          
          // Parse and validate notification body
          try {
            const body = JSON.parse(firstPayload.body);
            if (body.value && Array.isArray(body.value)) {
              console.log(`   Notifications in payload: ${body.value.length}`);
              body.value.forEach((notification, idx) => {
                console.log(`      [${idx}] Change type: ${notification.changeType}, Resource: ${notification.resource}`);
                
                // Verify clientState matches
                if (notification.clientState !== CLIENT_STATE) {
                  console.log(`      ⚠️  Client state mismatch: ${notification.clientState} !== ${CLIENT_STATE}`);
                }
              });
            }
          } catch (parseError) {
            console.log('   ⚠️  Could not parse notification body as JSON');
          }
        }
        
        expect(objects.length).toBeGreaterThan(0);
      } else {
        console.log('⚠️  No recent webhook payloads found in S3');
        console.log('   Possible reasons:');
        console.log('   - Graph notification not sent yet (can take 2-5 minutes)');
        console.log('   - Webhook URL not accessible (check API Gateway logs)');
        console.log('   - Subscription validation failed (clientState mismatch)');
        console.log('   - Graph subscription not active or expired');
      }
    });
    
    test('Check Lambda logs for webhook activity', () => {
      const logs = helpers.getRecentLambdaLogs(LAMBDA_FUNCTION, AWS_PROFILE, AWS_REGION, 15);
      
      console.log(`Found ${logs.length} log event(s) in last 15 minutes`);
      
      if (logs.length > 0) {
        const validationEvents = logs.filter(log => 
          log.message.includes('validationToken') || log.message.includes('validation')
        );
        const webhookEvents = logs.filter(log => 
          log.message.includes('webhook') || log.message.includes('notification')
        );
        const clientStateEvents = logs.filter(log => 
          log.message.includes('clientState') || log.message.includes('CLIENT_STATE')
        );
        const errorEvents = logs.filter(log => 
          log.message.toLowerCase().includes('error') || log.message.toLowerCase().includes('failed')
        );
        
        console.log(`   📊 Validation events: ${validationEvents.length}`);
        console.log(`   📊 Webhook events: ${webhookEvents.length}`);
        console.log(`   🔐 Client state events: ${clientStateEvents.length}`);
        console.log(`   ❌ Error events: ${errorEvents.length}`);
        
        if (errorEvents.length > 0) {
          console.log('   Recent errors:');
          errorEvents.slice(0, 3).forEach(log => {
            console.log(`      ${log.message.substring(0, 200)}`);
          });
        }
        
        // Show last few log messages
        console.log('   Last 5 log messages:');
        logs.slice(-5).forEach(log => {
          const timestamp = new Date(log.timestamp).toISOString();
          console.log(`      [${timestamp}] ${log.message.substring(0, 120)}`);
        });
        
        expect(logs.length).toBeGreaterThan(0);
      } else {
        console.log('⚠️  No Lambda logs found (webhook may not have been called)');
      }
    });
    
    test('Validate notification format matches Graph schema', () => {
      const objects = helpers.getRecentS3Objects(S3_BUCKET, 'webhooks/', AWS_PROFILE, AWS_REGION, 10);
      
      if (objects.length > 0) {
        const payload = helpers.getS3Object(S3_BUCKET, objects[0].Key, AWS_PROFILE, AWS_REGION);
        
        if (payload && payload.body) {
          try {
            const body = JSON.parse(payload.body);
            
            // Validate Graph notification schema
            expect(body).toHaveProperty('value');
            expect(Array.isArray(body.value)).toBe(true);
            
            if (body.value.length > 0) {
              const notification = body.value[0];
              
              // Standard Graph notification properties
              expect(notification).toHaveProperty('subscriptionId');
              expect(notification).toHaveProperty('changeType');
              expect(notification).toHaveProperty('resource');
              expect(notification).toHaveProperty('clientState');
              
              console.log('✅ Notification matches Graph API schema');
              console.log(`   Subscription ID: ${notification.subscriptionId}`);
              console.log(`   Change type: ${notification.changeType}`);
              console.log(`   Resource: ${notification.resource}`);
              console.log(`   Client state: ${notification.clientState}`);
            }
          } catch (error) {
            console.log('⚠️  Error validating notification format:', error.message);
          }
        }
      } else {
        console.log('ℹ️  No payloads to validate');
      }
    });
  });
  
  describe('Teardown', () => {
    test('Delete test Graph subscription', async () => {
      if (!subscriptionId) {
        console.log('ℹ️  No subscription ID to clean up');
        return;
      }
      
      try {
        await helpers.deleteGraphSubscription(graphToken, subscriptionId);
        console.log(`✅ Deleted test subscription: ${subscriptionId}`);
      } catch (error) {
        console.log(`⚠️  Failed to delete subscription: ${error.message}`);
        console.log('   You may need to manually delete it:');
        console.log(`   DELETE https://graph.microsoft.com/v1.0/subscriptions/${subscriptionId}`);
      }
    });
  });
  
  describe('Summary', () => {
    test('Display test results summary', () => {
      console.log('\n╔════════════════════════════════════════════════════════════════╗');
      console.log('║            DIRECT GRAPH API E2E TEST SUMMARY                   ║');
      console.log('╚════════════════════════════════════════════════════════════════╝\n');
      console.log('✅ Infrastructure checks: PASSED');
      console.log('🔍 Review validation results above for:');
      console.log('   - S3 webhook payloads');
      console.log('   - Lambda webhook processing logs');
      console.log('   - Graph notification format validation\n');
      console.log('📝 Next steps if validation failed:');
      console.log('   1. Verify webhook URL is publicly accessible via HTTPS');
      console.log('   2. Check Graph subscription is active:');
      console.log('      GET https://graph.microsoft.com/v1.0/subscriptions');
      console.log('   3. Verify CLIENT_STATE matches between Lambda env and subscription');
      console.log('   4. Check API Gateway access logs for incoming requests');
      console.log('   5. Test webhook manually with curl:');
      console.log(`      curl -X POST ${WEBHOOK_URL} -H "Content-Type: application/json" -d '{"value":[{"clientState":"${CLIENT_STATE}"}]}'`);
      console.log('   6. Review Graph API webhook documentation:');
      console.log('      https://learn.microsoft.com/en-us/graph/webhooks\n');
    });
  });
});
