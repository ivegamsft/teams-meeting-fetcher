// Create Graph API subscription to Event Hub (direct Event Hub subscription)
// Graph API sends notifications directly to Event Hub via RBAC
const config = require('./config');
const graphClient = require('./graph-client');
const fs = require('fs');
const path = require('path');

async function createEventHubSubscription() {
  console.log('🔔 Creating Graph API subscription to Event Hub...\n');

  // Validate configuration
  if (!config.clientId || config.clientId === 'your-app-client-id') {
    console.error('❌ Error: GRAPH_CLIENT_ID not configured in .env\n');
    process.exit(1);
  }

  if (!config.eventHubNamespace || !config.eventHubName) {
    console.error('❌ Error: EVENT_HUB_NAMESPACE or EVENT_HUB_NAME not configured in .env\n');
    process.exit(1);
  }

  // CRITICAL VALIDATION: Must subscribe to GROUP, not individual user
  const subscriptionResource = config.subscriptionResource || '/users';
  if (subscriptionResource.includes('/users/') && !subscriptionResource.includes('/groups/')) {
    console.error('\n❌ CRITICAL ERROR: Cannot subscribe to individual USER!\n');
    console.error('   Current: ' + subscriptionResource);
    console.error('   Required: GROUP resource path format\n');
    console.error('   Fix: Update .env:\n');
    console.error('   GRAPH_SUBSCRIPTION_RESOURCE=/groups/5e7708f8-b0d2-467d-97f9-d9da4818084a\n');
    process.exit(1);
  }

  console.log(`   Resource: ${config.subscriptionResource || '/users'}`);
  console.log(`   Webhook: ${config.notificationUrl}`);
  console.log(`   Mode: Webhook → Event Hub\n`);

  console.log('🔐 Getting access token...');
  try {
    await graphClient.getAccessToken();
    console.log('✅ Token acquired\n');
  } catch (err) {
    console.error(`❌ Error: ${err.message}\n`);
    process.exit(1);
  }

  // Build Event Hub notification URL
  // CRITICAL FORMAT per Microsoft docs:
  // EventHub:https://<namespace>.servicebus.windows.net/eventhubname/<hubname>?tenantId=<domain>
  // Missing /eventhubname/ or ?tenantId will cause 400 ValidationError from Graph API
  const tenantDomain = 'ibuyspy.net'; // Primary domain
  const eventHubNotificationUrl = `https://${config.eventHubNamespace}/eventhubname/${config.eventHubName}?tenantId=${tenantDomain}`;

  // Build blob store URL for rich notifications (if enabled)
  // For RBAC-only, we rely on the Graph Change Tracking service principal having Storage Blob Data Contributor role
  // Blob storage URL format that Graph API can resolve
  let blobStoreUrl = null;
  if (config.richNotifications && config.blobStoreEndpoint && config.blobStoreContainer) {
    // With RBAC, Graph API can write to blob storage using its service principal identity
    blobStoreUrl = `${config.blobStoreEndpoint}/${config.blobStoreContainer}`;
    console.log(`📦 Rich Notifications: Blobs > 1MB stored at ${blobStoreUrl}\n`);
  }

  console.log('📡 Creating subscription...');

  try {
    const result = await graphClient.subscribeToEventHub(
      eventHubNotificationUrl,
      config.subscriptionResource || '/users',
      blobStoreUrl
    );

    console.log('✅ Subscription created!\n');
    console.log('Subscription Details:');
    console.log(`   ID: ${result.id}`);
    console.log(`   Resource: ${result.resource}`);
    console.log(`   Change Types: ${result.changeType}`);
    console.log(`   Notification URL: EventHub`);
    console.log(`   Expires: ${new Date(result.expirationDateTime).toLocaleString()}`);
    console.log('');

    // Save subscription info
    const dataDir = path.join(__dirname, config.dataDir);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const subscriptionData = {
      id: result.id,
      resource: result.resource,
      changeType: result.changeType,
      notificationUrl: `EventHub:${eventHubNotificationUrl}`,
      blobStoreUrl: blobStoreUrl || null,
      expirationDateTime: result.expirationDateTime,
      lifecycleNotificationUrl: `EventHub:${eventHubNotificationUrl}`,
      createdDateTime: new Date().toISOString(),
    };

    const outputPath = path.join(dataDir, 'subscription.json');
    fs.writeFileSync(outputPath, JSON.stringify(subscriptionData, null, 2));
    console.log(`💾 Subscription info saved to ${outputPath}\n`);

    console.log('📌 IMPORTANT:');
    console.log('   - Subscription expires in 24 hours');
    console.log('   - Run this script daily to renew');
    console.log('   - Graph Change Tracking service principal sends notifications to Event Hub');
    console.log(
      '   - Rich notifications (>1MB) stored in blob: microsoft-graph-change-notifications'
    );
    console.log('   - Run "npm run process" to start consuming Event Hub messages');
    console.log('');
  } catch (err) {
    console.error(`❌ Error creating subscription: ${err.message}\n`);

    if (err.message.includes('400')) {
      console.log('💡 Common issues:');
      console.log('   - Invalid Event Hub namespace or name');
      console.log(
        '   - Graph Change Tracking service principal missing "Azure Event Hubs Data Sender" role'
      );
      console.log('   - Missing permissions (Calendars.Read for user subscriptions)');
      console.log('');
    }

    process.exit(1);
  }
}

createEventHubSubscription();
