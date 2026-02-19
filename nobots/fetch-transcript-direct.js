// Direct transcript fetch using join URL
const config = require('./config');
const graphClient = require('./graph-client');

const JOIN_URL =
  'https://teams.microsoft.com/l/meetup-join/19%3ameeting_MzFjODIzMjMtYTljNS00ZWNjLWE4MzAtYTI0NGVhOWIzYzFl%40thread.v2/0?context=%7b%22Tid%22%3a%2262837751-4e48-4d06-8bcb-57be1a669b78%22%2c%22Oid%22%3a%22e5fe8748-76f0-42ed-b521-241e8252baba%22%7d';

async function fetchTranscriptDirect() {
  console.log('🔍 Attempting direct transcript fetch...\n');
  console.log(`   User: ${config.watchUserId}`);
  console.log(`   Meeting: no robots meeting 1`);
  console.log('');

  console.log('🔐 Getting access token...');
  await graphClient.getAccessToken();
  console.log('✅ Token acquired\n');

  console.log('🔎 Looking up online meeting...');
  try {
    const onlineMeeting = await graphClient.getOnlineMeetingByJoinUrl(config.watchUserId, JOIN_URL);

    if (!onlineMeeting) {
      console.log('❌ Could not resolve online meeting from join URL\n');
      console.log('Possible reasons:');
      console.log("  - Meeting hasn't fully provisioned yet");
      console.log("  - API doesn't have access to this meeting type");
      console.log('  - User permissions issue\n');
      return;
    }

    console.log(`✅ Online Meeting ID: ${onlineMeeting.id}\n`);

    console.log('📝 Fetching transcripts...');
    const transcriptsResult = await graphClient.getMeetingTranscripts(
      config.watchUserId,
      onlineMeeting.id
    );
    const transcripts = transcriptsResult.value || [];

    if (transcripts.length === 0) {
      console.log('⚠️  No transcripts available yet\n');
      console.log('This is normal - Teams needs 30-90 seconds after recording ends to process.');
      console.log('Try again in a minute!\n');
      return;
    }

    console.log(`✅ Found ${transcripts.length} transcript(s)!\n`);

    for (const transcript of transcripts) {
      console.log(`📄 Transcript ID: ${transcript.id}`);
      console.log(`   Created: ${new Date(transcript.createdDateTime).toLocaleString()}\n`);

      console.log('⬇️  Downloading content...');
      const content = await graphClient.getTranscriptContent(
        config.watchUserId,
        onlineMeeting.id,
        transcript.id
      );

      const fileName = `no_robots_meeting_1_${Date.now()}.vtt`;
      const fs = require('fs');
      const path = require('path');

      const transcriptsDir = path.join(__dirname, config.dataDir, 'transcripts');
      if (!fs.existsSync(transcriptsDir)) {
        fs.mkdirSync(transcriptsDir, { recursive: true });
      }

      const filePath = path.join(transcriptsDir, fileName);
      fs.writeFileSync(filePath, content);

      console.log(`✅ Saved to: ${filePath}\n`);
      console.log('First 500 chars:');
      console.log(content.substring(0, 500));
      console.log('\n...\n');
    }
  } catch (err) {
    console.error(`❌ Error: ${err.message}\n`);
  }
}

fetchTranscriptDirect();
