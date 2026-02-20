// Poll calendar for changes and forward to Event Hub
const fs = require('fs');
const path = require('path');
const https = require('https');
const { EventHubProducerClient } = require('@azure/event-hubs');
const { DefaultAzureCredential } = require('@azure/identity');
const config = require('./config');
const graphClient = require('./graph-client');

const DATA_DIR = path.join(__dirname, config.dataDir);
const STATE_FILE = path.join(DATA_DIR, 'poll-state.json');
const POLL_INTERVAL_MS = 60000; // 1 minute

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Load previous state
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch (err) {
    console.warn('⚠️  Could not load state file:', err.message);
  }
  return { events: {}, lastCheck: new Date().toISOString() };
}

// Save state
function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error('❌ Error saving state:', err.message);
  }
}

// Get calendar events from Graph API
async function getCalendarEvents() {
  try {
    const token = await graphClient.getAccessToken();
    const now = new Date();
    const startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // Last 7 days
    const endTime = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // Next 30 days

    const filter = `start/dateTime ge '${startTime.toISOString()}' and end/dateTime le '${endTime.toISOString()}'`;
    const path = `/users/${config.watchUserId}/events?$filter=${encodeURIComponent(filter)}&$select=id,subject,start,end,isOnlineMeeting,onlineMeeting`;

    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'graph.microsoft.com',
        path: `/v1.0${path}`,
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
            try {
              const result = JSON.parse(data);
              resolve(result.value || []);
            } catch (err) {
              reject(new Error(`Failed to parse response: ${err.message}`));
            }
          } else {
            reject(new Error(`Graph error ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  } catch (err) {
    console.error('❌ Error fetching calendar events:', err.message);
    throw err;
  }
}

// Forward event to Event Hub
async function forwardToEventHub(eventId, changeType, resourcePath) {
  if (!config.eventHubNamespace || !config.eventHubName) {
    throw new Error('EVENT_HUB_NAMESPACE or EVENT_HUB_NAME not configured');
  }

  const credential = new DefaultAzureCredential();
  const producer = new EventHubProducerClient(
    config.eventHubNamespace,
    config.eventHubName,
    credential
  );

  try {
    // Format as Graph notification
    const notification = {
      value: [
        {
          subscriptionId: 'poll-subscription',
          clientState: 'poll-watcher',
          changeType,
          resource: resourcePath,
          resourceData: {
            '@odata.type': '#microsoft.graph.event',
            id: eventId,
          },
          tenantId: config.tenantId,
        },
      ],
    };

    const batch = await producer.createBatch();
    batch.tryAdd({ body: notification });
    await producer.sendBatch(batch);
  } finally {
    await producer.close();
  }
}

// Detect changes and forward to Event Hub
async function pollAndForward() {
  try {
    const state = loadState();
    const currentEvents = await getCalendarEvents();

    console.log(`\n📅 [${new Date().toLocaleTimeString()}] Polling calendar...`);
    console.log(`   Found ${currentEvents.length} events`);

    let changes = 0;

    // Check for new or updated events
    for (const event of currentEvents) {
      if (!event.isOnlineMeeting) continue;

      const eventKey = event.id;
      const prevEvent = state.events[eventKey];

      if (!prevEvent) {
        // New event
        console.log(`\n✨ NEW: ${event.subject}`);
        console.log(`   Event ID: ${event.id}`);

        try {
          await forwardToEventHub(
            event.id,
            'created',
            `users/${config.watchUserId}/events/${event.id}`
          );
          console.log('   ✅ Forwarded to Event Hub');
          changes++;
        } catch (err) {
          console.error(`   ❌ Error forwarding: ${err.message}`);
        }
      } else if (
        JSON.stringify(prevEvent.modifiedDateTime) !== JSON.stringify(event.lastModifiedDateTime)
      ) {
        // Updated event
        console.log(`\n📝 UPDATED: ${event.subject}`);
        console.log(`   Event ID: ${event.id}`);

        try {
          await forwardToEventHub(
            event.id,
            'updated',
            `users/${config.watchUserId}/events/${event.id}`
          );
          console.log('   ✅ Forwarded to Event Hub');
          changes++;
        } catch (err) {
          console.error(`   ❌ Error forwarding: ${err.message}`);
        }
      }

      // Update state
      state.events[eventKey] = {
        subject: event.subject,
        modifiedDateTime: event.lastModifiedDateTime,
      };
    }

    // Check for deleted events
    for (const eventId in state.events) {
      if (!currentEvents.find((e) => e.id === eventId)) {
        console.log(`\n🗑️  DELETED: ${state.events[eventId].subject}`);

        try {
          await forwardToEventHub(
            eventId,
            'deleted',
            `users/${config.watchUserId}/events/${eventId}`
          );
          console.log('   ✅ Forwarded to Event Hub');
          changes++;
        } catch (err) {
          console.error(`   ❌ Error forwarding: ${err.message}`);
        }

        delete state.events[eventId];
      }
    }

    if (changes === 0) {
      console.log('   ℹ️  No changes detected');
    } else {
      console.log(`\n✅ ${changes} change(s) forwarded to Event Hub`);
    }

    state.lastCheck = new Date().toISOString();
    saveState(state);
  } catch (err) {
    console.error(`\n❌ Error during poll: ${err.message}`);
  }
}

// Start polling
async function start() {
  console.log('🚀 Starting calendar poller...\n');
  console.log(`   User: ${config.watchUserId}`);
  console.log(`   Event Hub: ${config.eventHubName}`);
  console.log(`   Poll interval: ${POLL_INTERVAL_MS / 1000} seconds`);
  console.log(`   State file: ${STATE_FILE}`);
  console.log('');
  console.log('🎧 Listening for calendar changes...');
  console.log('🛑 Press Ctrl+C to stop\n');

  // Initial poll
  await pollAndForward();

  // Poll at regular intervals
  setInterval(pollAndForward, POLL_INTERVAL_MS);
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Stopping poller...');
  console.log('✅ Poller stopped\n');
  process.exit(0);
});

start().catch((err) => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
