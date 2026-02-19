#!/usr/bin/env node
/**
 * Check status of tracked meetings
 * Identifies which have ended and are ready for transcript
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');
const graph = require('./graph-client');

const meetingsFile = path.join(config.dataDir, 'meetings.json');
const statusFile = path.join(config.dataDir, 'status.json');

async function checkStatus() {
  try {
    console.log('📊 Checking meeting statuses...\n');

    if (!fs.existsSync(meetingsFile)) {
      console.log('ℹ️  No meetings tracked. Run 2-poll-meetings.js first.\n');
      return;
    }

    const meetings = JSON.parse(fs.readFileSync(meetingsFile, 'utf8'));
    const now = new Date();

    console.log(`🔐 Getting access token...\n`);
    const token = await graph.getAccessToken();
    console.log('✅ Token acquired\n');

    const status = [];

    for (const meeting of meetings) {
      const endTime = new Date(meeting.endTime);
      const isMeetingEnded = endTime <= now;

      console.log(`📅 ${meeting.subject}`);
      console.log(`   End time: ${endTime.toLocaleString()}`);
      console.log(`   Status: ${isMeetingEnded ? '✅ ENDED' : '⏳ Still in progress'}`);

      if (isMeetingEnded) {
        // Try to find online meeting ID for transcript download
        let onlineMeetingId = null;
        let lookupError = null;

        try {
          if (meeting.joinUrl) {
            console.log(`   Looking up online meeting...`);
            const om = await graph.getOnlineMeetingByJoinUrl(config.watchUserId, meeting.joinUrl);
            if (om) {
              onlineMeetingId = om.id;
              console.log(`   ✅ Online Meeting ID: ${onlineMeetingId}`);
            } else {
              lookupError = 'Could not resolve online meeting from join URL';
              console.log(`   ⚠️  ${lookupError}`);
            }
          } else {
            lookupError = 'No join URL in meeting data';
            console.log(`   ⚠️  ${lookupError}`);
          }
        } catch (lookupErr) {
          lookupError = lookupErr.message;
          console.log(`   ⚠️  Lookup error: ${lookupError}`);
        }

        status.push({
          ...meeting,
          readyForTranscript: !!onlineMeetingId,
          onlineMeetingId,
          lookupError,
          checkTime: now.toISOString(),
        });
      } else {
        status.push({
          ...meeting,
          readyForTranscript: false,
          onlineMeetingId: null,
          checkTime: now.toISOString(),
        });
      }

      console.log('');
    }

    // Store status
    if (!fs.existsSync(config.dataDir)) {
      fs.mkdirSync(config.dataDir, { recursive: true });
    }

    fs.writeFileSync(statusFile, JSON.stringify(status, null, 2));
    console.log(`💾 Status saved to ${statusFile}\n`);

    // Summary
    const readyCount = status.filter((s) => s.readyForTranscript).length;
    console.log(`📈 Summary: ${readyCount}/${status.length} meetings ready for transcript\n`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.body) {
      console.error('   Response:', error.body.substring(0, 300));
    }
    process.exit(1);
  }
}

checkStatus();
