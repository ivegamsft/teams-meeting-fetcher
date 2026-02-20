/**
 * Create Sample Events from Processor Output
 * Takes the processor console output and creates sanitized sample events
 */

const fs = require('fs');
const path = require('path');

// Sample events based on what was captured by the processor
const sampleEvents = [
  {
    id: 'SAMPLE-EVENT-ID-001',
    subject: 'eventhub meeting',
    bodyPreview: 'Test meeting for Event Hub pipeline',
    start: {
      dateTime: '2026-02-19T10:00:00.0000000',
      timeZone: 'UTC'
    },
    end: {
      dateTime: '2026-02-19T10:30:00.0000000',
      timeZone: 'UTC'
    },
    isReminderOn: true,
    reminderMinutesBeforeStart: 15,
    hasAttachments: false,
    isOnlineMeeting: true,
    onlineMeetingProvider: 'teamsForBusiness',
    seriesMasterId: null,
    transactionId: null,
    categories: ['Graph API Test'],
    changeKey: 'REDACTED',
    createdDateTime: '2026-02-19T00:07:59Z',
    lastModifiedDateTime: '2026-02-19T00:10:59Z',
    organizerEmail: 'group-organizer@company.com',
    organizerName: 'Group Calendar',
    attendees: [
      {
        emailAddress: 'attendee1@company.com',
        displayName: 'Attendee 1',
        type: 'required',
        status: {
          response: 'accepted',
          time: '2026-02-19T00:08:00Z'
        }
      },
      {
        emailAddress: 'attendee2@company.com',
        displayName: 'Attendee 2',
        type: 'optional',
        status: {
          response: 'notResponded',
          time: '0001-01-01T00:00:00Z'
        }
      }
    ]
  },
  {
    id: 'SAMPLE-EVENT-ID-002',
    subject: 'Team Standup',
    bodyPreview: 'Daily team sync',
    start: {
      dateTime: '2026-02-20T09:00:00.0000000',
      timeZone: 'UTC'
    },
    end: {
      dateTime: '2026-02-20T09:30:00.0000000',
      timeZone: 'UTC'
    },
    isReminderOn: true,
    reminderMinutesBeforeStart: 10,
    hasAttachments: false,
    isOnlineMeeting: true,
    onlineMeetingProvider: 'teamsForBusiness',
    seriesMasterId: 'SAMPLE-SERIES-ID-001',
    transactionId: null,
    categories: ['Recurring'],
    changeKey: 'REDACTED',
    createdDateTime: '2026-02-15T08:00:00Z',
    lastModifiedDateTime: '2026-02-19T12:00:00Z',
    organizerEmail: 'group-organizer@company.com',
    organizerName: 'Team Lead',
    attendees: [
      {
        emailAddress: 'team-member1@company.com',
        displayName: 'Team Member 1',
        type: 'required',
        status: {
          response: 'accepted',
          time: '2026-02-15T09:00:00Z'
        }
      },
      {
        emailAddress: 'team-member2@company.com',
        displayName: 'Team Member 2',
        type: 'required',
        status: {
          response: 'accepted',
          time: '2026-02-15T09:15:00Z'
        }
      }
    ]
  },
  {
    id: 'SAMPLE-EVENT-ID-003',
    subject: 'Project Review',
    bodyPreview: 'Q1 project status review and planning',
    start: {
      dateTime: '2026-02-21T14:00:00.0000000',
      timeZone: 'UTC'
    },
    end: {
      dateTime: '2026-02-21T15:30:00.0000000',
      timeZone: 'UTC'
    },
    isReminderOn: true,
    reminderMinutesBeforeStart: 30,
    hasAttachments: true,
    isOnlineMeeting: true,
    onlineMeetingProvider: 'teamsForBusiness',
    seriesMasterId: null,
    transactionId: 'SAMPLE-TRANSACTION-ID-001',
    categories: ['Work', 'Important'],
    changeKey: 'REDACTED',
    createdDateTime: '2026-02-10T14:00:00Z',
    lastModifiedDateTime: '2026-02-19T11:00:00Z',
    organizerEmail: 'manager@company.com',
    organizerName: 'Project Manager',
    attendees: [
      {
        emailAddress: 'lead1@company.com',
        displayName: 'Project Lead 1',
        type: 'required',
        status: {
          response: 'accepted',
          time: '2026-02-10T15:00:00Z'
        }
      },
      {
        emailAddress: 'lead2@company.com',
        displayName: 'Project Lead 2',
        type: 'required',
        status: {
          response: 'declined',
          time: '2026-02-10T16:00:00Z'
        }
      },
      {
        emailAddress: 'stakeholder@company.com',
        displayName: 'Stakeholder',
        type: 'optional',
        status: {
          response: 'accepted',
          time: '2026-02-10T15:30:00Z'
        }
      }
    ]
  }
];

async function createSampleEvents() {
  try {
    console.log('📁 Creating sample events with sanitized data...\n');

    // Create fixtures directory
    const fixturesDir = path.join(__dirname, '..', 'test', 'fixtures', 'sample-events');
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    // Save individual events
    sampleEvents.forEach((event, index) => {
      const fileName = `event-${index + 1}-${event.subject.replace(/\s+/g, '-').toLowerCase()}.json`;
      const filePath = path.join(fixturesDir, fileName);
      fs.writeFileSync(filePath, JSON.stringify(event, null, 2));

      console.log(`✅ ${fileName}`);
      console.log(`   Subject: ${event.subject}`);
      console.log(`   Time: ${event.start.dateTime} → ${event.end.dateTime}`);
      console.log(`   Online Meeting: ${event.isOnlineMeeting ? '✓' : '✗'}`);
      console.log(`   Attendees: ${event.attendees.length}\n`);
    });

    // Save manifest file
    const manifestPath = path.join(fixturesDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      description: 'Sample calendar events with sanitized user and tenant data',
      eventCount: sampleEvents.length,
      files: sampleEvents.map((e, i) => ({
        filename: `event-${i + 1}-${e.subject.replace(/\s+/g, '-').toLowerCase()}.json`,
        subject: e.subject,
        eventId: e.id
      })),
      sanitizationNotes: {
        userIds: 'Replaced with generic pattern (attendee1@company.com, etc)',
        tenantIds: 'Replaced with generic group identifiers',
        eventIds: 'Replaced with SAMPLE-EVENT-ID-XXX pattern',
        emailAddresses: 'Replaced with sanitized@company.com pattern',
        timestamps: 'Kept realistic format for testing'
      }
    }, null, 2));

    console.log(`✅ manifest.json`);

    // Create a combined all-events.json
    const allEventsPath = path.join(fixturesDir, 'all-events.json');
    fs.writeFileSync(allEventsPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      count: sampleEvents.length,
      events: sampleEvents
    }, null, 2));

    console.log(`✅ all-events.json\n`);

    console.log(`📊 Summary:`);
    console.log(`   • Total sample events: ${sampleEvents.length}`);
    console.log(`   • Location: ${fixturesDir}\n`);

    console.log(`⚠️  Data Sanitization Applied:`);
    console.log(`   ✓ Real user IDs replaced with generic placeholders`);
    console.log(`   ✓ Email addresses anonymized (attendee1@company.com, etc)`);
    console.log(`   ✓ Tenant identifiers removed`);
    console.log(`   ✓ Event IDs replaced with SAMPLE-EVENT-ID pattern`);
    console.log(`   ✓ Real timestamps kept for realistic testing\n`);

    console.log(`📋 Files created:`);
    console.log(`   event-1-eventhub-meeting.json`);
    console.log(`   event-2-team-standup.json`);
    console.log(`   event-3-project-review.json`);
    console.log(`   manifest.json`);
    console.log(`   all-events.json\n`);

    console.log(`✨ Ready for testing and version control!\n`);

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

createSampleEvents();
