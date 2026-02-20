const { EventHubConsumerClient } = require('@azure/event-hubs');
const { DefaultAzureCredential } = require('@azure/identity');
const config = require('./config');
const graphClient = require('./graph-client');
const fs = require('fs');
const path = require('path');

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('\n❌ Unhandled promise rejection:', err);
  console.error(err.stack);
});

let isProcessing = false;

async function processCalendarNotification(eventData) {
  if (isProcessing) return;
  isProcessing = true;

  try {
    console.log('\n📬 Received calendar notification');
    console.log(`   Resource: ${eventData.resource}`);
    console.log(`   Change Type: ${eventData.changeType}`);

    // Extract event ID from resource path
    const eventId = eventData.resourceData?.id;

    if (!eventId) {
      console.log('⚠️  No event ID in notification');
      return;
    }

    console.log(`   Event ID: ${eventId}\n`);

    // Wait a moment for event to be fully updated
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Fetch the event details from Graph
    console.log('📅 Fetching event details...');
    const token = await graphClient.getAccessToken();

    // Get event details
    const eventUrl = `${config.graphUrl}/users/${config.watchUserId}/events/${eventId}`;
    const https = require('https');

    const event = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'graph.microsoft.com',
        path: `/v1.0/users/${encodeURIComponent(config.watchUserId)}/events/${eventId}`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`Graph error ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.end();
    });

    // Check if it's an online meeting that has ended
    if (!event.isOnlineMeeting || !event.onlineMeeting) {
      console.log('⏭️  Not an online meeting, skipping\n');
      return;
    }

    const endTime = new Date(event.end.dateTime);
    const now = new Date();

    console.log(`✅ ${event.subject}`);
    console.log(`   End time: ${endTime.toLocaleString()}`);
    console.log(`   Status: ${endTime < now ? 'ENDED' : 'UPCOMING'}`);

    if (endTime > now) {
      console.log('⏳ Meeting not ended yet\n');
      return;
    }

    // Meeting has ended - try to get transcript
    console.log('\n🔎 Looking up online meeting...');
    const onlineMeeting = await graphClient.getOnlineMeetingByJoinUrl(
      config.watchUserId,
      event.onlineMeeting.joinUrl
    );

    if (!onlineMeeting) {
      console.log('⚠️  Could not resolve online meeting ID\n');
      return;
    }

    console.log(`✅ Online Meeting ID: ${onlineMeeting.id}\n`);

    // Get transcripts
    console.log('📝 Fetching transcripts...');
    const transcriptsResult = await graphClient.getMeetingTranscripts(
      config.watchUserId,
      onlineMeeting.id
    );

    const transcripts = transcriptsResult.value || [];

    if (transcripts.length === 0) {
      console.log('⚠️  No transcripts available yet (Teams needs 30-90s to process)\n');
      return;
    }

    console.log(`✅ Found ${transcripts.length} transcript(s)!\n`);

    // Download transcripts
    const transcriptsDir = path.join(__dirname, config.dataDir, 'transcripts');
    if (!fs.existsSync(transcriptsDir)) {
      fs.mkdirSync(transcriptsDir, { recursive: true });
    }

    for (const transcript of transcripts) {
      const fileName = `${event.subject.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.vtt`;
      const filePath = path.join(transcriptsDir, fileName);

      console.log(`⬇️  Downloading ${fileName}...`);
      const content = await graphClient.getTranscriptContent(
        config.watchUserId,
        onlineMeeting.id,
        transcript.id
      );

      fs.writeFileSync(filePath, content);
      console.log(`✅ Saved to: ${filePath}\n`);
    }
  } catch (err) {
    console.error(`❌ Error processing notification: ${err.message}\n`);
  } finally {
    isProcessing = false;
  }
}

async function startEventHubConsumer() {
  console.log('🚀 Starting Event Hub consumer...\n');

  // Validate configuration
  if (!config.eventHubNamespace || !config.eventHubName) {
    console.error('❌ Error: EVENT_HUB_NAMESPACE and EVENT_HUB_NAME must be configured in .env\n');
    process.exit(1);
  }

  console.log(`   Event Hub: ${config.eventHubName}`);
  console.log(`   Namespace: ${config.eventHubNamespace}`);
  console.log(`   Auth: Azure RBAC (DefaultAzureCredential)`);
  console.log('');
  console.log('🎧 Listening for notifications...');
  console.log('🛑 Press Ctrl+C to stop\n');

  try {
    console.log('🔐 Initializing Azure credentials...');
    const credential = new DefaultAzureCredential({
      logging: {
        allowLoggingAccountIdentifiers: true,
      },
    });

    console.log('📡 Creating Event Hub consumer client...');
    const consumerClient = new EventHubConsumerClient(
      '$Default', // consumer group
      config.eventHubNamespace,
      config.eventHubName,
      credential
    );

    console.log('✅ Consumer client created successfully');
    console.log('🔌 Starting subscription...');

    const subscription = consumerClient.subscribe({
      processEvents: async (events, context) => {
        for (const event of events) {
          console.log('\n' + '='.repeat(60));
          console.log(`[${new Date().toLocaleTimeString()}] New Event`);
          console.log('='.repeat(60));

          try {
            // Parse the notification
            const notification = event.body;

            if (notification.value && Array.isArray(notification.value)) {
              // Graph API sends an array of notifications
              for (const notif of notification.value) {
                await processCalendarNotification(notif);
              }
            } else {
              await processCalendarNotification(notification);
            }
          } catch (err) {
            console.error('❌ Error parsing event:', err.message);
          }
        }
      },
      processError: async (err, context) => {
        console.error(`\n❌ Error from Event Hub: ${err.message}\n`);
      },
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n\n🛑 Stopping consumer...');
      await subscription.close();
      await consumerClient.close();
      console.log('✅ Consumer stopped\n');
      process.exit(0);
    });
  } catch (err) {
    console.error(`❌ Error starting consumer: ${err.message}\n`);
    process.exit(1);
  }
}

startEventHubConsumer();
