/**
 * Meeting Bot – Lambda Handler
 *
 * Automated lifecycle:
 *   meetingStart → group check → send "being recorded" notice to chat
 *   meetingEnd   → fetch transcript → post to chat
 *
 * Transcription is enforced via Teams admin meeting policy (always-on).
 * The bot does NOT join the call; it only reacts to Bot Framework events.
 *
 * Route:
 *   POST /bot/messages – Bot Framework activities (meetingStart, meetingEnd, message)
 */
'use strict';

const AWS = require('aws-sdk');
const graph = require('./graph-client');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.MEETINGS_TABLE || 'meeting-bot-sessions-dev';
const ALLOWED_GROUP_ID = process.env.ALLOWED_GROUP_ID || '';
const BOT_APP_ID = process.env.BOT_APP_ID;

// ─── Retry helper ────────────────────────────────────────────────────────────

async function withRetry(fn, label, retries = 3) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const delay = Math.min(1000 * Math.pow(2, i), 8000);
      console.warn(
        `⚠️  ${label} attempt ${i + 1}/${retries} failed: ${err.message}  – retry in ${delay}ms`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// ─── DynamoDB helpers ────────────────────────────────────────────────────────

async function saveSession(item) {
  item.updated_at = new Date().toISOString();
  item.expires_at = Math.floor(Date.now() / 1000) + 86400 * 7; // 7 days TTL
  await dynamodb.put({ TableName: TABLE_NAME, Item: item }).promise();
}

async function getSession(meetingId) {
  const res = await dynamodb
    .get({ TableName: TABLE_NAME, Key: { meeting_id: meetingId } })
    .promise();
  return res.Item || null;
}

async function updateSessionStatus(meetingId, status, extra) {
  const expr = ['#s = :s', 'updated_at = :u'];
  const names = { '#s': 'status' };
  const vals = { ':s': status, ':u': new Date().toISOString() };

  if (extra) {
    Object.entries(extra).forEach(([k, v]) => {
      expr.push(`${k} = :${k}`);
      vals[`:${k}`] = v;
    });
  }

  await dynamodb
    .update({
      TableName: TABLE_NAME,
      Key: { meeting_id: meetingId },
      UpdateExpression: 'SET ' + expr.join(', '),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: vals,
    })
    .promise();
}

// ─── Lambda entry point ──────────────────────────────────────────────────────

exports.handler = async (event) => {
  try {
    let body = event.body;
    if (typeof body === 'string') body = JSON.parse(body);

    const path = event.rawPath || event.path || '';

    console.log(`📥 ${path} → type=${body?.type || 'none'} name=${body?.name || 'none'}`);

    // ── Bot Framework activities (POST /bot/messages) ──
    if (path.includes('/bot/messages') || path.includes('/bot/meeting-started')) {
      if (!body || !body.type) {
        return respond(200, { ok: true, note: 'empty activity' });
      }

      // Conversational commands (Hi / Hello / Help)
      if (body.type === 'message' && body.text) {
        return respond(200, handleBotCommand(body.text.trim()));
      }

      // Meeting lifecycle events
      if (body.type === 'event') {
        return handleMeetingEvent(body);
      }

      // installationUpdate, conversationUpdate, etc. – acknowledge
      console.log(`ℹ️  Unhandled activity type: ${body.type}`);
      return respond(200, { ok: true, type: body.type });
    }

    // Fallback – unknown route
    return respond(200, { ok: true, note: 'no matching route' });
  } catch (err) {
    console.error('❌ Handler error:', err);
    return respond(500, { error: err.message });
  }
};

// ─── Meeting lifecycle handler ───────────────────────────────────────────────

async function handleMeetingEvent(activity) {
  const eventName = activity.name;
  console.log(`🏁 Meeting event: ${eventName}`);

  if (eventName === 'application/vnd.microsoft.meetingStart') {
    return handleMeetingStart(activity);
  }
  if (eventName === 'application/vnd.microsoft.meetingEnd') {
    return handleMeetingEnd(activity);
  }

  console.log(`ℹ️  Unhandled event name: ${eventName}`);
  return respond(200, { ok: true, event: eventName });
}

// ── Meeting Start ────────────────────────────────────────────────────────────

async function handleMeetingStart(activity) {
  // Fields come from activity.value (Bot Framework meetingStart schema)
  const val = activity.value || {};
  const channelData = activity.channelData || {};
  const meetingId =
    val.Id || channelData.meeting?.id || activity.conversation?.id || `m-${Date.now()}`;
  const joinUrl = val.JoinUrl || '';
  const title = val.Title || '';
  const organizerId = activity.from?.aadObjectId || '';
  const serviceUrl = activity.serviceUrl || '';
  const conversationId = activity.conversation?.id || '';

  console.log(`🔔 Meeting started – id=${meetingId}, title="${title}", organizer=${organizerId}`);

  // 1. Persist initial session
  await saveSession({
    meeting_id: meetingId,
    status: 'active',
    join_url: joinUrl,
    title: title,
    organizer_id: organizerId,
    service_url: serviceUrl,
    conversation_id: conversationId,
    event_type: 'meetingStart',
    received_at: new Date().toISOString(),
  });

  // 2. Group allow-list check (optional)
  if (ALLOWED_GROUP_ID && organizerId) {
    const allowed = await graph.isUserInGroup(organizerId, ALLOWED_GROUP_ID);
    if (!allowed) {
      console.log(`⏭️ Organizer ${organizerId} not in allowed group – skipping`);
      await updateSessionStatus(meetingId, 'skipped', { skip_reason: 'organizer_not_in_group' });
      return respond(200, { ok: true, action: 'skipped' });
    }
  }

  // 3. Send recording/transcription notice to the meeting chat
  try {
    await graph.sendBotMessage(
      serviceUrl,
      conversationId,
      '🔴 **This meeting is being recorded and transcribed.**\n\n' +
        'A transcript will be posted to this chat when the meeting ends.'
    );
    console.log('✅ Recording notice sent to chat');
  } catch (msgErr) {
    console.error(`❌ Failed to send recording notice: ${msgErr.message}`);
  }

  return respond(200, { ok: true, action: 'notified', meetingId });
}

// ── Meeting End ──────────────────────────────────────────────────────────────

async function handleMeetingEnd(activity) {
  const val = activity.value || {};
  const channelData = activity.channelData || {};
  const meetingId = val.Id || channelData.meeting?.id || activity.conversation?.id || '';
  const serviceUrl = activity.serviceUrl || '';
  const conversationId = activity.conversation?.id || '';

  console.log(`🏁 Meeting ended – id=${meetingId}`);

  // Retrieve our stored session
  const session = await getSession(meetingId);
  if (!session) {
    console.warn(`⚠️  No session found for meeting ${meetingId}`);
    return respond(200, { ok: true, action: 'no_session' });
  }

  await updateSessionStatus(meetingId, 'ended');

  // Fetch transcript (with retry + delay to let Graph process it)
  const sUrl = session.service_url || serviceUrl;
  const convId = session.conversation_id || conversationId;

  // Allow Graph a moment to finalize the transcript
  await new Promise((r) => setTimeout(r, 5000));

  try {
    const transcript = await withRetry(
      () => fetchTranscript(meetingId, session),
      'fetchTranscript'
    );
    if (transcript) {
      console.log(`📝 Transcript fetched (${transcript.length} chars)`);
      await updateSessionStatus(meetingId, 'transcript_fetched', {
        transcript_length: transcript.length,
      });

      // Send transcript to the meeting chat via proactive message
      if (sUrl && convId) {
        const preview =
          transcript.length > 3000
            ? transcript.substring(0, 3000) + '\n\n… (truncated)'
            : transcript;
        await graph.sendBotMessage(
          sUrl,
          convId,
          `📝 **Meeting Transcript**\n\n\`\`\`\n${preview}\n\`\`\``
        );
        console.log('✅ Transcript posted to chat');
        await updateSessionStatus(meetingId, 'completed');
      } else {
        console.warn('⚠️  Missing serviceUrl or conversationId – cannot post transcript');
        await updateSessionStatus(meetingId, 'transcript_fetched_no_delivery');
      }
    } else {
      console.log('ℹ️  No transcript available for this meeting');
      await updateSessionStatus(meetingId, 'completed_no_transcript');
    }
  } catch (err) {
    console.error('❌ Transcript fetch failed:', err.message);
    await updateSessionStatus(meetingId, 'error', { error_message: `transcript: ${err.message}` });
  }

  return respond(200, { ok: true, action: 'meeting_ended', meetingId });
}

// ─── Transcript fetching ─────────────────────────────────────────────────────

async function fetchTranscript(meetingId, session) {
  // We need the online-meeting ID (a GUID), not the thread-based meeting ID.
  const joinUrl = session.join_url;
  if (!joinUrl) {
    console.warn('⚠️  No join URL stored – cannot look up online meeting');
    return null;
  }

  // Resolve the online-meeting object from the join URL
  let onlineMeetingId;
  try {
    // The filter uses the raw join URL (not double-encoded)
    const filterUrl = joinUrl.replace(/'/g, "''");
    const meetings = await graph.graphRequest(
      'GET',
      `/communications/onlineMeetings?$filter=joinWebUrl eq '${filterUrl}'`
    );
    if (meetings.value && meetings.value.length > 0) {
      onlineMeetingId = meetings.value[0].id;
    }
  } catch (err) {
    console.warn(`⚠️  Could not resolve onlineMeeting from joinUrl: ${err.message}`);
  }

  if (!onlineMeetingId) {
    console.warn('⚠️  Could not resolve onlineMeetingId');
    return null;
  }

  // List transcripts
  const transcripts = await graph.getMeetingTranscripts(onlineMeetingId);
  if (!transcripts.value || transcripts.value.length === 0) {
    return null;
  }

  // Download the latest transcript as VTT
  const latest = transcripts.value[transcripts.value.length - 1];
  const content = await graph.getTranscriptContent(onlineMeetingId, latest.id, 'text/vtt');
  return content;
}

// ─── Conversational commands ─────────────────────────────────────────────────

function handleBotCommand(text) {
  const cmd = text.toLowerCase().replace(/[^a-z]/g, '');

  if (cmd === 'help') {
    return {
      type: 'message',
      text:
        '**Meeting Fetcher Bot** — Commands:\n\n' +
        '- **Hi** / **Hello** — Say hello\n' +
        '- **Help** — Show this help message\n\n' +
        'This bot notifies you when a meeting is being recorded and ' +
        'posts the transcript when the meeting ends.',
    };
  }

  return {
    type: 'message',
    text:
      "Hello! I'm the **Meeting Fetcher** bot. " +
      'I notify when meetings are recorded and deliver transcripts.\n\n' +
      'Type **Help** for more info.',
  };
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}
