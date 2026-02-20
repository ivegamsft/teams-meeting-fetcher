#!/usr/bin/env node
/**
 * Subscribe to calendar changes for a user
 * Stores subscription ID for later renewal
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');
const graph = require('./graph-client');

const dataFile = path.join(config.dataDir, 'subscriptions.json');

async function subscribe() {
  try {
    console.log('📡 Subscribing to calendar changes...\n');

    // Validate config
    if (!config.clientId || config.clientId === 'your-app-id') {
      throw new Error('GRAPH_CLIENT_ID not configured in .env');
    }
    if (!config.watchUserId || config.watchUserId === 'user@company.com') {
      throw new Error('WATCH_USER_ID not configured in .env');
    }

    const notificationUrl = config.notificationUrl || 'https://webhook.site/your-unique-id'; // placeholder

    console.log(`   Tenant: ${config.tenantId}`);
    console.log(`   Client ID: ${config.clientId}`);
    console.log(`   User: ${config.watchUserId}`);
    console.log(`   Notification URL: ${notificationUrl}\n`);

    console.log('🔐 Getting access token...');
    const token = await graph.getAccessToken();
    console.log('✅ Token acquired\n');

    console.log('📤 Creating subscription...');
    const subscription = await graph.subscribeToCalendarChanges(
      config.watchUserId,
      notificationUrl
    );

    console.log('✅ Subscription created\n');
    console.log(`   ID: ${subscription.id}`);
    console.log(`   Resource: ${subscription.resource}`);
    console.log(`   Expires: ${subscription.expirationDateTime}`);
    console.log(`   Change Types: ${subscription.changeType}\n`);

    // Store subscription
    if (!fs.existsSync(config.dataDir)) {
      fs.mkdirSync(config.dataDir, { recursive: true });
    }

    const data = {
      subscriptionId: subscription.id,
      userId: config.watchUserId,
      createdAt: new Date().toISOString(),
      expiresAt: subscription.expirationDateTime,
      notificationUrl,
      resource: subscription.resource,
    };

    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    console.log(`💾 Subscription saved to ${dataFile}\n`);

    console.log('⚠️  NOTE: To receive notifications, you need a webhook URL.');
    console.log('   Use ngrok for local testing: https://ngrok.com/\n');
    console.log(
      '   Then run: NOTIFICATION_URL=https://your-ngrok-url/webhook node 1-subscribe.js\n'
    );
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.body) {
      console.error('   Response:', error.body.substring(0, 300));
    }
    process.exit(1);
  }
}

subscribe();
