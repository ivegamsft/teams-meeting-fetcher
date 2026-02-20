// Poll for recently completed meetings (last 2 hours)
const config = require('./config');
const graphClient = require('./graph-client');
const fs = require('fs');
const path = require('path');

async function pollRecentMeetings() {
  console.log('🔍 Polling for recently completed meetings...\n');
  console.log(`   User: ${config.watchUserId}`);
  console.log(`   Time range: -6 hours → now`);
  console.log('');

  const now = new Date();
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

  const startISO = sixHoursAgo.toISOString();
  const endISO = now.toISOString();

  const filter = `start/dateTime ge '${startISO}' and end/dateTime le '${endISO}'`;

  console.log('🔐 Getting access token...');
  try {
    await graphClient.getAccessToken();
    console.log('✅ Token acquired\n');
  } catch (err) {
    console.error(`❌ Error: ${err.message}\n`);
    process.exit(1);
  }

  console.log('📅 Fetching calendar events...');
  try {
    const result = await graphClient.getCalendarEvents(config.watchUserId, filter);
    const allEvents = result.value || [];

    // Filter for online meetings only
    const events = allEvents.filter((event) => event.isOnlineMeeting && event.onlineMeeting);

    if (events.length === 0) {
      console.log('ℹ️  No online meetings found in the last 6 hours\n');
      return;
    }

    console.log(`✅ Found ${events.length} event(s)\n`);

    const meetings = events.map((event) => {
      const start = new Date(event.start.dateTime);
      const end = new Date(event.end.dateTime);
      const status = end < now ? 'ended' : 'in-progress';

      console.log(`   ${status === 'ended' ? '✅' : '⏰'} ${event.subject}`);
      console.log(`      Start: ${start.toLocaleString()}`);
      console.log(`      End:   ${end.toLocaleString()}`);
      console.log(`      Status: ${status}`);

      return {
        eventId: event.id,
        subject: event.subject,
        startTime: event.start.dateTime,
        endTime: event.end.dateTime,
        joinUrl: event.onlineMeeting?.joinUrl || null,
        onlineMeeting: event.onlineMeeting || null,
        status,
        pollTime: new Date().toISOString(),
      };
    });

    // Save to file
    const dataDir = path.join(__dirname, config.dataDir);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const outputPath = path.join(dataDir, 'meetings.json');
    fs.writeFileSync(outputPath, JSON.stringify(meetings, null, 2));

    console.log(`\n💾 Meetings saved to ${outputPath}\n`);
  } catch (err) {
    console.error(`❌ Error fetching events: ${err.message}\n`);
    process.exit(1);
  }
}

pollRecentMeetings();
