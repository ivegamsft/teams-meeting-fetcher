#!/usr/bin/env node
/**
 * Download transcript for ended meetings
 * Requires meeting to be ended and online meeting ID resolved
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');
const graph = require('./graph-client');

const statusFile = path.join(config.dataDir, 'status.json');
const transcriptsDir = path.join(config.dataDir, 'transcripts');

async function getTranscripts() {
  try {
    console.log('📝 Downloading transcripts...\n');

    if (!fs.existsSync(statusFile)) {
      console.log('ℹ️  No status data. Run 3-check-status.js first.\n');
      return;
    }

    const statuses = JSON.parse(fs.readFileSync(statusFile, 'utf8'));

    console.log(`🔐 Getting access token...\n`);
    const token = await graph.getAccessToken();
    console.log('✅ Token acquired\n');

    if (!fs.existsSync(transcriptsDir)) {
      fs.mkdirSync(transcriptsDir, { recursive: true });
    }

    let downloaded = 0;
    let failed = 0;

    for (const meeting of statuses) {
      if (!meeting.readyForTranscript) {
        const reason =
          meeting.onlineMeetingId === null
            ? 'Could not resolve online meeting ID'
            : 'Still in progress';
        console.log(`⏳ ${meeting.subject} - ${reason}`);
        continue;
      }

      if (!meeting.onlineMeetingId) {
        console.log(`⚠️  ${meeting.subject} - No online meeting ID`);
        failed++;
        continue;
      }

      console.log(`📥 ${meeting.subject}`);

      try {
        // List transcripts
        console.log(`   Listing transcripts...`);
        const transcripts = await graph.getMeetingTranscripts(
          config.watchUserId,
          meeting.onlineMeetingId
        );

        if (!transcripts.value || transcripts.value.length === 0) {
          console.log(`   ⚠️  No transcripts available yet\n`);
          failed++;
          continue;
        }

        console.log(`   Found ${transcripts.value.length} transcript(s)`);

        // Download latest transcript
        const latest = transcripts.value[transcripts.value.length - 1];
        console.log(`   Downloading ${latest.id}...`);

        const content = await graph.getTranscriptContent(
          config.watchUserId,
          meeting.onlineMeetingId,
          latest.id
        );

        // Save to file
        const safeName = meeting.subject
          .replace(/[^a-z0-9]/gi, '_')
          .replace(/_+/g, '_')
          .substring(0, 50);
        const dateStr = latest.createdDateTime.split('T')[0];
        const filename = `${safeName}_${dateStr}.vtt`;
        const filepath = path.join(transcriptsDir, filename);

        fs.writeFileSync(filepath, content);
        console.log(`   ✅ Saved: ${filename}`);
        console.log(`   Size: ${content.length} bytes\n`);

        downloaded++;
      } catch (err) {
        console.log(`   ❌ Error: ${err.message}\n`);
        failed++;
      }
    }

    console.log(`📁 Transcripts folder: ${transcriptsDir}`);
    console.log(`📈 Summary: ${downloaded} downloaded, ${failed} failed\n`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.body) {
      console.error('   Response:', error.body.substring(0, 300));
    }
    process.exit(1);
  }
}

getTranscripts();
