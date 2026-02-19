#!/usr/bin/env node
/**
 * Demo - Shows expected flow with mock data
 * Useful for testing the workflow without actual Azure credentials
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');

const dataDir = config.dataDir;
const meetingsFile = path.join(dataDir, 'meetings.json');
const statusFile = path.join(dataDir, 'status.json');
const transcriptsDir = path.join(dataDir, 'transcripts');

console.log(`
╔════════════════════════════════════════════════════════════════╗
║  nobots - Demo Flow (Mock Data)                                ║
╚════════════════════════════════════════════════════════════════╝

This demonstrates what the workflow looks like with real data.

Creating sample data in: ${dataDir}
`);

// Create data directory
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 1. Create sample meetings data
console.log('1️⃣  Creating sample meetings...\n');
const now = new Date();
const in1Hour = new Date(now.getTime() + 60 * 60 * 1000);
const in2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
const pastMeeting = new Date(now.getTime() - 30 * 60 * 1000);

const meetings = [
  {
    eventId: 'event-123',
    subject: 'Team Standup',
    startTime: pastMeeting.toISOString(),
    endTime: new Date(pastMeeting.getTime() + 30 * 60 * 1000).toISOString(),
    joinUrl: 'https://teams.microsoft.com/l/meetup-join/123456',
    status: 'ended',
    pollTime: now.toISOString(),
  },
  {
    eventId: 'event-456',
    subject: 'Project Planning',
    startTime: in1Hour.toISOString(),
    endTime: in2Hours.toISOString(),
    joinUrl: 'https://teams.microsoft.com/l/meetup-join/789012',
    status: 'upcoming',
    pollTime: now.toISOString(),
  },
];

fs.writeFileSync(meetingsFile, JSON.stringify(meetings, null, 2));
console.log(`✅ Created ${meetingsFile}`);
console.log(`   - Team Standup (ENDED 30min ago)`);
console.log(`   - Project Planning (UPCOMING in 1 hour)\n`);

// 2. Create sample status data
console.log('2️⃣  Creating meeting status...\n');
const status = [
  {
    ...meetings[0],
    readyForTranscript: true,
    onlineMeetingId: 'meeting-abc123',
    checkTime: now.toISOString(),
  },
  {
    ...meetings[1],
    readyForTranscript: false,
    onlineMeetingId: null,
    checkTime: now.toISOString(),
  },
];

fs.writeFileSync(statusFile, JSON.stringify(status, null, 2));
console.log(`✅ Created ${statusFile}`);
console.log(`   - Team Standup: ✅ Ready for transcript (online meeting ID resolved)`);
console.log(`   - Project Planning: ⏳ Still in progress\n`);

// 3. Create sample transcript
console.log('3️⃣  Creating sample transcript...\n');
if (!fs.existsSync(transcriptsDir)) {
  fs.mkdirSync(transcriptsDir, { recursive: true });
}

const sampleVtt = `WEBVTT

00:00:00.000 --> 00:00:05.000
John: Good morning everyone, let's start with standup.

00:00:05.000 --> 00:00:15.000
Sarah: I completed the API integration work yesterday.
It's ready for testing.

00:00:15.000 --> 00:00:25.000
John: Great! Who can test the API changes?

00:00:25.000 --> 00:00:35.000
Mike: I can take that. I'll review and test today.

00:00:35.000 --> 00:00:45.000
John: Perfect. Let's wrap up there. Thanks everyone!`;

const transcriptPath = path.join(transcriptsDir, 'Team_Standup_2025-02-18.vtt');
fs.writeFileSync(transcriptPath, sampleVtt);
console.log(`✅ Created ${transcriptPath}`);
console.log(`   Sample transcript with meeting content\n`);

// Show data summary
console.log('════════════════════════════════════════════════════════════════');
console.log('\n📁 DATA CREATED:\n');
console.log('meetings.json:');
console.log(JSON.stringify(meetings, null, 2).substring(0, 300) + '...\n');

console.log('status.json:');
console.log(
  JSON.stringify(
    status.map((s) => ({
      subject: s.subject,
      status: s.status,
      readyForTranscript: s.readyForTranscript,
      onlineMeetingId: s.onlineMeetingId,
    })),
    null,
    2
  ) + '\n'
);

console.log('transcripts/:');
console.log(`  └─ Team_Standup_2025-02-18.vtt (${sampleVtt.length} bytes)\n`);

console.log('════════════════════════════════════════════════════════════════');
console.log('\n🧪 NOW TRY:\n');
console.log('1. Check the data directory:');
console.log(`   ls -la ${dataDir}/\n`);

console.log('2. View the meetings:');
console.log(`   cat ${meetingsFile}\n`);

console.log('3. View the transcript:');
console.log(`   cat ${transcriptPath}\n`);

console.log('════════════════════════════════════════════════════════════════\n');
