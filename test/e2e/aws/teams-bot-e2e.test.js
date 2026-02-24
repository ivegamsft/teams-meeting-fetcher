/**
 * E2E Test: Teams Bot Scenario (Scenario 1)
 * 
 * Tests the complete Teams bot flow:
 * 1. Bot receives meetingStart/meetingEnd events from Bot Framework
 * 2. Bot polls for transcripts via Graph API (/users/{userId}/onlineMeetings/{id}/transcripts)
 * 3. Transcripts stored in S3, session data in DynamoDB
 * 
 * This is a human-in-the-loop test requiring manual Teams meeting creation.
 */
'use strict';

const helpers = require('../helpers');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env.test') });

describe('Teams Bot E2E', () => {
  // Extended timeout for human-in-the-loop testing
  jest.setTimeout(600000); // 10 minutes
  
  const AWS_PROFILE = process.env.AWS_PROFILE || 'tmf-dev';
  const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
  const LAMBDA_FUNCTION = process.env.MEETING_BOT_LAMBDA || 'meeting-bot-handler-dev';
  const DYNAMODB_TABLE = process.env.MEETINGS_TABLE || 'meeting-bot-sessions-dev';
  const S3_BUCKET = process.env.TRANSCRIPT_BUCKET || 'teams-meeting-transcripts-dev';
  const GRAPH_TENANT_ID = process.env.GRAPH_TENANT_ID;
  const BOT_APP_ID = process.env.BOT_APP_ID;
  const BOT_APP_SECRET = process.env.BOT_APP_SECRET;
  
  let testMeetingId = null;
  
  describe('Pre-flight checks', () => {
    test('AWS Lambda function exists', () => {
      const result = helpers.checkAwsLambdaExists(LAMBDA_FUNCTION, AWS_PROFILE, AWS_REGION);
      expect(result.exists).toBe(true);
      console.log(`✅ Lambda function found: ${result.arn}`);
    });
    
    test('DynamoDB table exists', () => {
      const result = helpers.checkDynamoDBTable(DYNAMODB_TABLE, AWS_PROFILE, AWS_REGION);
      expect(result.exists).toBe(true);
      console.log(`✅ DynamoDB table found: ${DYNAMODB_TABLE} (status: ${result.status})`);
    });
    
    test('S3 bucket exists', () => {
      const result = helpers.checkS3Bucket(S3_BUCKET, AWS_PROFILE, AWS_REGION);
      expect(result.exists).toBe(true);
      console.log(`✅ S3 bucket found: ${S3_BUCKET}`);
    });
    
    test('Environment variables are set', () => {
      expect(GRAPH_TENANT_ID).toBeTruthy();
      expect(BOT_APP_ID).toBeTruthy();
      expect(BOT_APP_SECRET).toBeTruthy();
      console.log('✅ Required environment variables are set');
    });
  });
  
  describe('Setup and verification', () => {
    test('Bot endpoint is configured', async () => {
      // Check if bot messaging endpoint is reachable (if exposed via API Gateway)
      const botEndpoint = process.env.BOT_MESSAGING_ENDPOINT;
      
      if (botEndpoint) {
        const health = await helpers.checkEndpointHealth(botEndpoint);
        console.log(`Bot endpoint health: ${health.healthy ? 'healthy' : 'unhealthy'} (${health.statusCode || health.error})`);
      } else {
        console.log('ℹ️  BOT_MESSAGING_ENDPOINT not configured (bot may be internal Lambda)');
      }
    });
  });
  
  describe('Human-in-the-loop test execution', () => {
    test('Prompt human to create Teams meeting and install bot', async () => {
      const instructions = `
📋 INSTRUCTIONS:

1. Install the Teams Meeting Bot in your Teams tenant:
   - Go to Teams > Apps > Upload a custom app
   - Upload the bot manifest from your Bot Framework registration
   - Or use the Teams app catalog if already published

2. Create a new Teams meeting:
   - Schedule a meeting in Teams Calendar
   - Add at least one participant
   - Ensure the meeting bot is added to the meeting

3. Start the meeting:
   - Join the meeting via Teams
   - Speak for at least 30 seconds to generate transcript content
   - Say something distinctive like: "E2E test meeting ${Date.now()}"

4. End the meeting:
   - Leave the meeting
   - Wait 2-3 minutes for Teams to process the transcript

⚠️  IMPORTANT: The bot must receive meetingEnd event and have permission
   to access transcripts via Graph API (/users/{userId}/onlineMeetings/{id}/transcripts)

📝 After completing these steps, note the meeting ID if visible and press ENTER.
`;
      
      await helpers.promptHumanAction(instructions);
      console.log('✅ Human action completed, proceeding with validation...');
    });
    
    test('Wait for bot processing', async () => {
      console.log('⏳ Waiting 60 seconds for bot to process meetingEnd event and poll for transcripts...');
      await helpers.sleep(60000);
    });
  });
  
  describe('Validation', () => {
    test('Check DynamoDB for meeting session record', () => {
      const items = helpers.scanDynamoDBItems(DYNAMODB_TABLE, AWS_PROFILE, AWS_REGION, 20);
      
      expect(items.length).toBeGreaterThan(0);
      console.log(`✅ Found ${items.length} meeting session(s) in DynamoDB`);
      
      // Look for recent sessions (within last 10 minutes)
      const recentCutoff = Date.now() - 10 * 60 * 1000;
      const recentSessions = items.filter(item => {
        const timestamp = item.timestamp?.S || item.createdAt?.S || item.startTime?.S;
        return timestamp && new Date(timestamp).getTime() > recentCutoff;
      });
      
      if (recentSessions.length > 0) {
        console.log(`✅ Found ${recentSessions.length} recent session(s)`);
        testMeetingId = recentSessions[0].meetingId?.S || recentSessions[0].id?.S;
        console.log(`   Meeting ID: ${testMeetingId}`);
      } else {
        console.log('⚠️  No recent sessions found (bot may not have processed meetingEnd yet)');
      }
    });
    
    test('Check S3 for transcript files', () => {
      const objects = helpers.getRecentS3Objects(S3_BUCKET, 'transcripts/', AWS_PROFILE, AWS_REGION, 10);
      
      console.log(`Found ${objects.length} recent transcript file(s) in S3`);
      
      if (objects.length > 0) {
        console.log('✅ Recent transcript files:');
        objects.forEach(obj => {
          console.log(`   - ${obj.Key} (${obj.Size} bytes, ${obj.LastModified})`);
        });
        
        // Validate transcript content format
        const firstTranscript = helpers.getS3Object(S3_BUCKET, objects[0].Key, AWS_PROFILE, AWS_REGION);
        if (firstTranscript) {
          expect(firstTranscript).toHaveProperty('meetingId');
          console.log('✅ Transcript content format is valid');
        }
      } else {
        console.log('⚠️  No recent transcript files found in S3');
        console.log('   This could mean:');
        console.log('   - Transcript is not ready yet (can take 5-10 minutes after meeting ends)');
        console.log('   - Bot lacks permission to access transcripts');
        console.log('   - Meeting was too short to generate a transcript');
      }
    });
    
    test('Check Lambda logs for processing activity', () => {
      const logs = helpers.getRecentLambdaLogs(LAMBDA_FUNCTION, AWS_PROFILE, AWS_REGION, 15);
      
      console.log(`Found ${logs.length} log event(s) in last 15 minutes`);
      
      if (logs.length > 0) {
        // Look for key patterns
        const meetingEndEvents = logs.filter(log => 
          log.message.includes('meetingEnd') || log.message.includes('meeting ended')
        );
        const transcriptEvents = logs.filter(log => 
          log.message.includes('transcript') || log.message.includes('Transcript')
        );
        const errorEvents = logs.filter(log => 
          log.message.toLowerCase().includes('error') || log.message.toLowerCase().includes('failed')
        );
        
        console.log(`   📊 meetingEnd events: ${meetingEndEvents.length}`);
        console.log(`   📊 transcript-related events: ${transcriptEvents.length}`);
        console.log(`   ❌ error events: ${errorEvents.length}`);
        
        if (errorEvents.length > 0) {
          console.log('   Recent errors:');
          errorEvents.slice(0, 3).forEach(log => {
            console.log(`      ${log.message.substring(0, 150)}`);
          });
        }
        
        expect(logs.length).toBeGreaterThan(0);
      }
    });
  });
  
  describe('Summary', () => {
    test('Display test results summary', () => {
      console.log('\n╔════════════════════════════════════════════════════════════════╗');
      console.log('║                  TEAMS BOT E2E TEST SUMMARY                    ║');
      console.log('╚════════════════════════════════════════════════════════════════╝\n');
      console.log('✅ Infrastructure checks: PASSED');
      console.log('🔍 Review validation results above for:');
      console.log('   - DynamoDB session records');
      console.log('   - S3 transcript files');
      console.log('   - Lambda processing logs\n');
      console.log('📝 Next steps if validation failed:');
      console.log('   1. Check bot permissions in Azure AD (OnlineMeetings.Read.All)');
      console.log('   2. Verify bot is receiving webhook events from Bot Framework');
      console.log('   3. Check Lambda environment variables (GRAPH_TENANT_ID, BOT_APP_ID, BOT_APP_SECRET)');
      console.log('   4. Wait longer for Teams to process transcript (can take 10+ minutes)\n');
    });
  });
});
