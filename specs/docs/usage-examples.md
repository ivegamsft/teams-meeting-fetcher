# Usage Examples

Practical code examples for using the Teams Meeting Fetcher API and integrating with the system.

## Table of Contents

- [API Client Examples](#api-client-examples)
- [Integration Examples](#integration-examples)
- [Webhook Examples](#webhook-examples)
- [Automation Examples](#automation-examples)

---

## API Client Examples

### JavaScript/Node.js

#### Fetch All Meetings

```javascript
const apiKey = process.env.API_KEY;
const baseUrl = 'https://your-domain.com';

async function getAllMeetings() {
  const response = await fetch(`${baseUrl}/api/meetings`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.meetings;
}

// Usage
getAllMeetings().then(meetings => {
  console.log(`Found ${meetings.length} meetings`);
  meetings.forEach(m => {
    console.log(`- ${m.subject} (${m.startTime})`);
  });
});
```

#### Fetch Meetings with Filters

```javascript
async function getRecentMeetings(days = 7) {
  const from = new Date();
  from.setDate(from.getDate() - days);
  
  const params = new URLSearchParams({
    from: from.toISOString(),
    status: 'completed',
    sortBy: 'startTime',
    sortOrder: 'desc'
  });
  
  const response = await fetch(
    `${baseUrl}/api/meetings?${params}`,
    {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    }
  );
  
  return response.json();
}
```

#### Download Transcription

```javascript
async function downloadTranscription(meetingId, format = 'txt') {
  const response = await fetch(
    `${baseUrl}/api/meetings/${meetingId}/transcription/download?format=${format}`,
    {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    }
  );
  
  if (!response.ok) {
    throw new Error('Failed to download transcription');
  }
  
  // Get filename from header
  const disposition = response.headers.get('content-disposition');
  const filename = disposition
    .match(/filename="(.+)"/)[1];
  
  // Save to file
  const buffer = await response.arrayBuffer();
  const fs = require('fs');
  fs.writeFileSync(filename, Buffer.from(buffer));
  
  console.log(`Transcription saved to ${filename}`);
}

// Usage
downloadTranscription('meeting-id-123', 'txt');
```

#### Get Meeting Details with Full Event History

```javascript
async function getMeetingWithHistory(meetingId) {
  const response = await fetch(
    `${baseUrl}/api/meetings/${meetingId}`,
    {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    }
  );
  
  const meeting = await response.json();
  
  console.log('Meeting:', meeting.subject);
  console.log('Organizer:', meeting.organizer.displayName);
  console.log('Duration:', `${new Date(meeting.endTime) - new Date(meeting.startTime)} ms`);
  console.log('Recording:', meeting.recording?.status);
  console.log('Transcription:', meeting.transcription?.status);
  console.log('\nWebhook Events:');
  meeting.webhookEvents?.forEach(e => {
    console.log(`  [${e.timestamp}] ${e.event}: ${e.details}`);
  });
  
  if (meeting.transcription?.status === 'completed') {
    const transcript = await fetch(
      `${baseUrl}/api/meetings/${meetingId}/transcription`,
      { headers: { 'Authorization': `Bearer ${apiKey}` } }
    ).then(r => r.json());
    
    console.log('\nTranscription:');
    console.log(`  Words: ${transcript.wordCount}`);
    console.log(`  Language: ${transcript.language}`);
    console.log(`  Content preview: ${transcript.content.substring(0, 200)}...`);
  }
}
```

### Python

#### Fetch and Process Meetings

```python
import requests
import json
from datetime import datetime, timedelta

class MeetingFetcherClient:
    def __init__(self, base_url, api_key):
        self.base_url = base_url
        self.api_key = api_key
        self.headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        }
    
    def get_meetings(self, status=None, from_date=None, to_date=None, page=1):
        """Fetch meetings with optional filters"""
        params = {'page': page}
        
        if status:
            params['status'] = status
        if from_date:
            params['from'] = from_date.isoformat() if hasattr(from_date, 'isoformat') else from_date
        if to_date:
            params['to'] = to_date.isoformat() if hasattr(to_date, 'isoformat') else to_date
        
        response = requests.get(
            f'{self.base_url}/api/meetings',
            headers=self.headers,
            params=params
        )
        response.raise_for_status()
        return response.json()
    
    def get_transcription(self, meeting_id):
        """Get transcription text for a meeting"""
        response = requests.get(
            f'{self.base_url}/api/meetings/{meeting_id}/transcription',
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()
    
    def download_transcription(self, meeting_id, format='txt', output_file=None):
        """Download transcription as file"""
        response = requests.get(
            f'{self.base_url}/api/meetings/{meeting_id}/transcription/download',
            headers=self.headers,
            params={'format': format},
            stream=True
        )
        response.raise_for_status()
        
        # Get filename from header if not specified
        if not output_file:
            disposition = response.headers.get('content-disposition', '')
            if 'filename=' in disposition:
                output_file = disposition.split('filename=')[1].strip('"')
            else:
                output_file = f'transcript-{meeting_id}.{format}'
        
        # Save file
        with open(output_file, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
        
        return output_file

# Usage
client = MeetingFetcherClient('https://your-domain.com', api_key='your-api-key')

# Get completed meetings from last 7 days
week_ago = datetime.now() - timedelta(days=7)
result = client.get_meetings(status='completed', from_date=week_ago)

print(f"Found {len(result['meetings'])} completed meetings")

for meeting in result['meetings']:
    print(f"\n{meeting['subject']}")
    print(f"  Organizer: {meeting['organizer']['displayName']}")
    print(f"  Recording: {meeting['recording']['status']}")
    print(f"  Transcription: {meeting['transcription']['status']}")
    
    if meeting['transcription']['status'] == 'completed':
        # Download transcription
        filename = client.download_transcription(meeting['id'])
        print(f"  Transcript saved to: {filename}")
```

### cURL

#### List Meetings

```bash
#!/bin/bash

API_KEY="your-api-key"
BASE_URL="https://your-domain.com"

# Get completed meetings
curl -H "Authorization: Bearer $API_KEY" \
  "$BASE_URL/api/meetings?status=completed&sortBy=startTime&sortOrder=desc" \
  | jq '.meetings[] | {subject, organizer: .organizer.displayName, status: .transcription.status}'
```

**Output**:
```
{
  "subject": "Q1 Planning",
  "organizer": "John Doe",
  "status": "completed"
}
```

#### Get Single Meeting

```bash
MEETING_ID="AAMkADI5NGY1MjE0"

curl -H "Authorization: Bearer $API_KEY" \
  "$BASE_URL/api/meetings/$MEETING_ID" \
  | jq '.
```

#### Download Transcription

```bash
MEETING_ID="AAMkADI5NGY1MjE0"

curl -H "Authorization: Bearer $API_KEY" \
  "$BASE_URL/api/meetings/$MEETING_ID/transcription/download?format=txt" \
  -o meeting-transcript.txt

# For VTT format (with timestamps)
curl -H "Authorization: Bearer $API_KEY" \
  "$BASE_URL/api/meetings/$MEETING_ID/transcription/download?format=vtt" \
  -o meeting-transcript.vtt
```

---

## Integration Examples

### Send Transcription to Slack

```javascript
const slack = require('@slack/web-api');
const meetingFetcher = require('./client');

const slackClient = new slack.WebClient(process.env.SLACK_BOT_TOKEN);

async function sendTranscriptionToSlack(meetingId, channelId) {
  // Get meeting details
  const meeting = await meetingFetcher.getMeeting(meetingId);
  
  // Get transcription
  const transcript = await meetingFetcher.getTranscription(meetingId);
  
  if (transcript.status !== 'completed') {
    return console.log('Transcription not ready yet');
  }
  
  // Truncate content (Slack has limits)
  const contentPreview = transcript.content.substring(0, 2000);
  
  await slackClient.chat.postMessage({
    channel: channelId,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: meeting.subject
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Organizer:*\n${meeting.organizer.displayName}`
          },
          {
            type: 'mrkdwn',
            text: `*Date:*\n${new Date(meeting.startTime).toLocaleDateString()}`
          }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Transcription:*\n${contentPreview}...`
        }
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View Full Transcript'
            },
            url: `https://your-domain.com/transcript/${meetingId}`
          }
        ]
      }
    ]
  });
}
```

### Send to Email

```javascript
const nodemailer = require('nodemailer');

async function emailTranscription(meetingId, recipientEmail) {
  const meeting = await meetingFetcher.getMeeting(meetingId);
  const transcript = await meetingFetcher.getTranscription(meetingId);
  
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  
  await transporter.sendMail({
    from: 'noreply@company.com',
    to: recipientEmail,
    subject: `Transcription: ${meeting.subject}`,
    html: `
      <h2>${meeting.subject}</h2>
      <p><strong>Date:</strong> ${new Date(meeting.startTime).toLocaleDateString()}</p>
      <p><strong>Organizer:</strong> ${meeting.organizer.displayName}</p>
      <p><strong>Attendees:</strong> ${meeting.attendees.map(a => a.displayName).join(', ')}</p>
      <hr>
      <p>${transcript.content.replace(/\n/g, '<br>')}</p>
    `
  });
  
  console.log(`Transcription emailed to ${recipientEmail}`);
}
```

### Store Transcriptions in SharePoint

```javascript
const { SharePointOnline } = require('@pnp/sp');

async function uploadToSharePoint(meetingId) {
  const meeting = await meetingFetcher.getMeeting(meetingId);
  
  // Download transcription
  const transcriptPath = await meetingFetcher.downloadTranscription(meetingId);
  const fs = require('fs');
  const content = fs.readFileSync(transcriptPath);
  
  // Upload to SharePoint
  const sp = new SharePointOnline({
    siteUrl: 'https://company.sharepoint.com/sites/Meetings'
  });
  
  const filename = `${meeting.subject}-${new Date(meeting.startTime).toISOString()}.txt`;
  
  await sp.web.getFolderByServerRelativeUrl('/sites/Meetings/Shared Documents')
    .files.add(filename, content, true);
  
  console.log(`Uploaded to SharePoint: ${filename}`);
}
```

### Archive to Long-Term Storage

```javascript
const AWS = require('aws-sdk');

async function archiveToS3(meetingId) {
  const s3 = new AWS.S3();
  const meeting = await meetingFetcher.getMeeting(meetingId);
  
  // Download transcription
  const transcriptPath = await meetingFetcher.downloadTranscription(meetingId);
  const fs = require('fs');
  const content = fs.readFileSync(transcriptPath);
  
  // Upload to S3
  const year = new Date(meeting.startTime).getFullYear();
  const month = String(new Date(meeting.startTime).getMonth() + 1).padStart(2, '0');
  
  await s3.putObject({
    Bucket: 'meeting-transcriptions',
    Key: `${year}/${month}/${meeting.id}.txt`,
    Body: content,
    Metadata: {
      'meeting-subject': meeting.subject,
      'organizer': meeting.organizer.email
    }
  }).promise();
  
  console.log(`Archived to S3: ${year}/${month}/${meeting.id}.txt`);
}
```

---

## Webhook Examples

### Manual Webhook Test

```bash
#!/bin/bash

WEBHOOK_URL="https://your-domain.com/api/webhooks/graph"
WEBHOOK_SECRET="your-webhook-auth-secret"

# Simulate a meeting creation notification
curl -X POST "$WEBHOOK_URL" \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "value": [
      {
        "subscriptionId": "test-sub-001",
        "changeType": "created",
        "clientState": "secret-client-state",
        "resource": "/users/86894ae2-0e82-4a4f-b68e-3c72b8797f42/events/AAMkADI5NGY1MjE0",
        "resourceData": {
          "id": "AAMkADI5NGY1MjE0",
          "@odata.type": "#microsoft.graph.event"
        },
        "tenantId": "85203b49-71cc-4b94-94e8-f2b4146a9884"
      }
    ]
  }'
```

### Verify Bearer Token

```bash
# This should fail with 401
curl -X POST "$WEBHOOK_URL" \
  -H "Authorization: Bearer wrong-token" \
  -H "Content-Type: application/json" \
  -d '{"value": []}'

# Expected response: 401 Unauthorized
```

---

## Automation Examples

### Daily Digest Email

```javascript
const cron = require('node-cron');
const nodemailer = require('nodemailer');

// Run every day at 8 AM
cron.schedule('0 8 * * *', async () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  const result = await meetingFetcher.getMeetings({
    status: 'completed',
    from: yesterday.toISOString()
  });
  
  if (result.meetings.length === 0) {
    console.log('No meetings transcribed in the last 24 hours');
    return;
  }
  
  // Generate email
  const html = `
    <h2>Meeting Transcription Digest</h2>
    <p>Meetings transcribed on ${yesterday.toLocaleDateString()}:</p>
    <ul>
      ${result.meetings.map(m => `
        <li>
          <strong>${m.subject}</strong> by ${m.organizer.displayName}
          <br/><small>${m.attendees.length} attendees</small>
        </li>
      `).join('')}
    </ul>
    <p><a href="https://your-domain.com">View all transcriptions</a></p>
  `;
  
  // Send to team
  const transporter = nodemailer.createTransport({...});
  await transporter.sendMail({
    from: 'noreply@company.com',
    to: 'team@company.com',
    subject: 'Daily Meeting Transcription Digest',
    html
  });
  
  console.log(`Daily digest sent with ${result.meetings.length} meetings`);
});
```

### Compliance Archival

```javascript
const cron = require('node-cron');

// Archive meetings older than 30 days
cron.schedule('0 2 * * *', async () => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const result = await meetingFetcher.getMeetings({
    status: 'completed',
    to: thirtyDaysAgo.toISOString()
  });
  
  for (const meeting of result.meetings) {
    try {
      await archiveToLongTermStorage(meeting.id);
      console.log(`Archived meeting: ${meeting.subject}`);
    } catch (error) {
      console.error(`Failed to archive meeting ${meeting.id}:`, error);
    }
  }
});
```

### Compliance Check - All Meetings Recorded

```javascript
const cron = require('node-cron');

// Check that all Entra group meetings are recorded
cron.schedule('0 18 * * *', async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const result = await meetingFetcher.getMeetings({
    from: today.toISOString(),
    to: tomorrow.toISOString()
  });
  
  const unrecorded = result.meetings.filter(
    m => m.recording?.status !== 'available'
  );
  
  if (unrecorded.length > 0) {
    console.warn(
      `WARNING: ${unrecorded.length} meetings not recorded:`,
      unrecorded.map(m => m.subject)
    );
    
    // Send alert to compliance team
    await sendComplianceAlert(unrecorded);
  }
});
```

---

## Advanced: Custom Middleware

### Logging Middleware

```javascript
const express = require('express');
const app = express();

app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `${res.statusCode} ${req.method} ${req.path} - ${duration}ms`
    );
  });
  
  next();
});
```

### Rate Limiting Middleware

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // limit each IP to 60 requests per windowMs
  keyGenerator: (req) => {
    // Use API key if provided, fallback to IP
    const auth = req.headers.authorization || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    return token || req.ip;
  }
});

app.use('/api/', limiter);
```

---

## Testing the System

### Integration Test Suite

```javascript
// test/integration/api.test.js
const { expect } = require('chai');
const client = require('../../src/client');

describe('API Integration Tests', () => {
  it('should fetch meetings', async () => {
    const result = await client.getMeetings();
    expect(result).to.have.property('meetings');
    expect(result.meetings).to.be.an('array');
  });
  
  it('should download transcription', async () => {
    const meetings = await client.getMeetings({
      status: 'completed'
    });
    
    if (meetings.meetings.length > 0) {
      const filename = await client.downloadTranscription(
        meetings.meetings[0].id
      );
      expect(filename).to.exist;
    }
  });
});
```

