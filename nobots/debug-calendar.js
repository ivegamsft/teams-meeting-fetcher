// Debug script - list ALL meetings today
const config = require('./config');
const graphClient = require('./graph-client');

async function listAllMeetingsToday() {
  console.log('🔍 Listing ALL meetings for today...\n');

  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

  const startISO = startOfDay.toISOString();
  const endISO = endOfDay.toISOString();

  console.log(`   User: ${config.watchUserId}`);
  console.log(`   Start: ${startOfDay.toLocaleString()}`);
  console.log(`   End:   ${endOfDay.toLocaleString()}`);
  console.log('');

  const filter = `start/dateTime ge '${startISO}' and start/dateTime lt '${endISO}'`;

  console.log('🔐 Getting access token...');
  await graphClient.getAccessToken();
  console.log('✅ Token acquired\n');

  console.log('📅 Fetching ALL calendar events...');
  const result = await graphClient.getCalendarEvents(config.watchUserId, filter);
  const events = result.value || [];

  console.log(`\n✅ Found ${events.length} event(s) total\n`);

  events.forEach((event, i) => {
    console.log(`${i + 1}. ${event.subject}`);
    console.log(`   Start: ${new Date(event.start.dateTime).toLocaleString()}`);
    console.log(`   End:   ${new Date(event.end.dateTime).toLocaleString()}`);
    console.log(`   Online: ${event.isOnlineMeeting ? 'Yes' : 'No'}`);
    if (event.onlineMeeting) {
      console.log(`   Join URL: ${event.onlineMeeting.joinUrl}`);
    }
    console.log('');
  });
}

listAllMeetingsToday().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
