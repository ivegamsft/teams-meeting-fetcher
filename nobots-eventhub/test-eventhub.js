// Test script to send a sample notification to Event Hub
const { EventHubProducerClient } = require('@azure/event-hubs');
const { DefaultAzureCredential } = require('@azure/identity');
const config = require('./config');

async function sendTestEvent() {
  console.log('🧪 Sending test event to Event Hub...\n');

  if (!config.eventHubNamespace || !config.eventHubName) {
    console.error('❌ Error: EVENT_HUB_NAMESPACE and EVENT_HUB_NAME not configured');
    process.exit(1);
  }

  console.log(`   Using Azure RBAC authentication (DefaultAzureCredential)\n`);

  const credential = new DefaultAzureCredential();
  const producer = new EventHubProducerClient(
    config.eventHubNamespace,
    config.eventHubName,
    credential
  );

  try {
    // Create a sample Graph API notification format
    const sampleNotification = {
      value: [
        {
          subscriptionId: 'test-subscription-id',
          clientState: 'test-client-state',
          changeType: 'updated',
          resource: `users/${config.watchUserId}/events/test-event-123`,
          resourceData: {
            '@odata.type': '#microsoft.graph.event',
            '@odata.id': `users/${config.watchUserId}/events/test-event-123`,
            id: 'test-event-123',
          },
          subscriptionExpirationDateTime: new Date(Date.now() + 3600000).toISOString(),
          tenantId: config.tenantId,
        },
      ],
    };

    const batch = await producer.createBatch();
    batch.tryAdd({ body: sampleNotification });

    await producer.sendBatch(batch);

    console.log('✅ Test event sent successfully!');
    console.log(`   Event Hub: ${config.eventHubName}`);
    console.log(`   Event ID: test-event-123`);
    console.log('\nℹ️  Note: This is a test event and will not fetch a real transcript.');
    console.log("   The processor will try to look up the event but it doesn't exist.\n");

    await producer.close();
  } catch (err) {
    console.error('❌ Error sending test event:', err.message);
    process.exit(1);
  }
}

sendTestEvent();
