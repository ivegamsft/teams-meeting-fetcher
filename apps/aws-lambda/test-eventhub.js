/**
 * Local test for Event Hub Lambda integration
 * 
 * Run: npm run test:eventhub
 */

require('dotenv').config({ path: '.env.test' });

const ehHandler = require('./eventhub-handler');

async function runTest() {
  console.log('=== Event Hub Lambda Integration Test ===\n');

  // Check environment
  const required = [
    'EVENT_HUB_CONNECTION_STRING',
    'EVENT_HUB_NAME',
  ];

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error('❌ Missing environment variables:', missing);
    console.error('Create .env.test with Event Hub credentials');
    process.exit(1);
  }

  console.log('✓ Environment variables configured\n');

  // Create mock Lambda context
  const mockContext = {
    awsRequestId: `test-${Date.now()}`,
    functionName: 'tmf-eventhub-consumer-test',
    memoryLimitInMB: 512,
    getRemainingTimeInMillis: () => 60000,
  };

  // Create mock event
  const mockEvent = {
    source: 'test',
  };

  try {
    console.log('Invoking Event Hub handler...\n');
    const result = await ehHandler.handler(mockEvent, mockContext);

    console.log('Result:');
    console.log(JSON.stringify(result, null, 2));

    // Parse result
    const body = typeof result.body === 'string' 
      ? JSON.parse(result.body) 
      : result.body;

    if (result.statusCode === 200) {
      console.log(`\n✅ Test successful!`);
      console.log(`   Messages received: ${body.messagesReceived}`);
      console.log(`   Messages processed: ${body.messagesProcessed}`);
    } else {
      console.log(`\n⚠️ Handler returned status: ${result.statusCode}`);
      if (body.error) {
        console.log(`   Error: ${body.error}`);
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

runTest();
