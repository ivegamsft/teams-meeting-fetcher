// List all online meetings for the user (not just calendar events)
const config = require('./config');
const https = require('https');

async function getAccessToken() {
  const postData = new URLSearchParams();
  postData.append('client_id', config.clientId);
  postData.append('client_secret', config.clientSecret);
  postData.append('scope', 'https://graph.microsoft.com/.default');
  postData.append('grant_type', 'client_credentials');

  const postDataString = postData.toString();

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'login.microsoftonline.com',
      path: `/${config.tenantId}/oauth2/v2.0/token`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postDataString),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode === 200) {
          const parsed = JSON.parse(data);
          resolve(parsed.access_token);
        } else {
          reject(new Error(`Token error: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postDataString);
    req.end();
  });
}

async function listOnlineMeetings() {
  console.log('🔍 Listing ALL online meetings...\n');
  console.log(`   User: ${config.watchUserId}`);
  console.log('');

  console.log('🔐 Getting access token...');
  const token = await getAccessToken();
  console.log('✅ Token acquired\n');

  console.log('📞 Fetching online meetings from Graph API...');

  return new Promise((resolve, reject) => {
    const url = `https://graph.microsoft.com/v1.0/users/${config.watchUserId}/onlineMeetings`;

    const options = {
      hostname: 'graph.microsoft.com',
      path: `/v1.0/users/${encodeURIComponent(config.watchUserId)}/onlineMeetings?$top=50`,
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
          const result = JSON.parse(data);
          const meetings = result.value || [];

          console.log(`✅ Found ${meetings.length} online meeting(s)\n`);

          meetings.forEach((meeting, i) => {
            console.log(`${i + 1}. ${meeting.subject || '(No subject)'}`);
            console.log(`   Meeting ID: ${meeting.id}`);
            console.log(
              `   Start: ${meeting.startDateTime ? new Date(meeting.startDateTime).toLocaleString() : 'N/A'}`
            );
            console.log(
              `   End: ${meeting.endDateTime ? new Date(meeting.endDateTime).toLocaleString() : 'N/A'}`
            );
            console.log(`   Join URL: ${meeting.joinWebUrl || meeting.joinUrl || 'N/A'}`);
            console.log('');
          });

          resolve(meetings);
        } else {
          const err = new Error(`Graph error ${res.statusCode}: ${data}`);
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

listOnlineMeetings().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
