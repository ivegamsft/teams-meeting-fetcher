#!/usr/bin/env node
/**
 * Poll calendar for upcoming meetings
 * Stores active meetings to track
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');
const graph = require('./graph-client');

const meetingsFile = path.join(config.dataDir, 'meetings.json');

async function pollMeetings() {
  try {
    console.log('🔍 Polling calendar for meetings...\n');

    // Validate config
    if (!config.clientId || config.clientId === 'your-app-id') {
      throw new Error('GRAPH_CLIENT_ID not configured in .env');
    }
    if (!config.watchUserId || config.watchUserId === 'user@company.com') {
      throw new Error('WATCH_USER_ID not configured in .env');
    }

    console.log(`   User: ${config.watchUserId}`);
    console.log(`   Time range: now → +24 hours\n`);

    console.log('🔐 Getting access token...');
    const token = await graph.getAccessToken();
    console.log('✅ Token acquired\n');

    console.log('📅 Fetching calendar events...');

    // Get events in the next 24 hours
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const filter = `start/dateTime ge '${now.toISOString()}' and start/dateTime le '${tomorrow.toISOString()}'`;

    const events = await graph.getCalendarEvents(config.watchUserId, filter);

    if (!events.value || events.value.length === 0) {
      console.log('ℹ️  No meetings found in the next 24 hours\n');
      return;
    }

    console.log(`✅ Found ${events.value.length} event(s)\n`);

    const meetings = [];

    for (const event of events.value) {
      if (!event.isOnlineMeeting) {
        console.log(`   ⏭️  ${event.subject} (not online)`);
        continue;
      }

      const startTime = new Date(event.start.dateTime);
      const endTime = new Date(event.end.dateTime);
      const status = startTime > now ? 'upcoming' : endTime > now ? 'in-progress' : 'ended';

      console.log(
        `   ${status === 'in-progress' ? '🔴' : status === 'upcoming' ? '⏰' : '✅'} ${event.subject}`
      );
      console.log(`      Start: ${startTime.toLocaleString()}`);
      console.log(`      End:   ${endTime.toLocaleString()}`);
      if (event.onlineMeetingUrl) {
        console.log(`      URL:   ${event.onlineMeetingUrl.substring(0, 60)}...`);
      }
      console.log(`      Status: ${status}`);

      meetings.push({
        eventId: event.id,
        subject: event.subject,
        startTime: event.start.dateTime,
        endTime: event.end.dateTime,
        joinUrl: event.onlineMeetingUrl,
        onlineMeeting: event.onlineMeeting,
        status,
        pollTime: new Date().toISOString(),
      });
    }

    // Store meetings
    if (!fs.existsSync(config.dataDir)) {
      fs.mkdirSync(config.dataDir, { recursive: true });
    }

    fs.writeFileSync(meetingsFile, JSON.stringify(meetings, null, 2));
    console.log(`\n💾 Meetings saved to ${meetingsFile}\n`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.statusCode === 401 || error.statusCode === 403) {
      console.error('   → Check GRAPH_CLIENT_ID and GRAPH_CLIENT_SECRET');
    } else if (error.body) {
      console.error('   Response:', error.body.substring(0, 300));
    }
    process.exit(1);
  }
}

pollMeetings();
