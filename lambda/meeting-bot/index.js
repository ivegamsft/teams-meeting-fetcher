/**
 * Meeting Bot – Lambda Handler
 *
 * Automated lifecycle:
 *   meetingStart → group check → send "being recorded" notice to chat
 *   meetingEnd   → fetch transcript → post to chat
 *
 * Manual commands (for troubleshooting):
 *   "record"  → manually trigger recording notice + save session
 *   "status"  → show current session state for this chat
 *   "debug"   → dump the raw activity JSON (DM only, for privacy)
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
const s3 = new AWS.S3();
const TABLE_NAME = process.env.MEETINGS_TABLE || 'meeting-bot-sessions-dev';
const TRANSCRIPT_BUCKET = process.env.TRANSCRIPT_BUCKET || '';
const ALLOWED_GROUP_ID = process.env.ALLOWED_GROUP_ID || '';
const BOT_APP_ID = process.env.BOT_APP_ID;
const TEAMS_CATALOG_APP_ID = process.env.TEAMS_CATALOG_APP_ID || '';
const WATCHED_USER_IDS = (process.env.WATCHED_USER_IDS || '').split(',').filter(Boolean);
const POLL_LOOKAHEAD_MINUTES = parseInt(process.env.POLL_LOOKAHEAD_MINUTES || '60', 10);

// ─── Structured logger ───────────────────────────────────────────────────────
// Wraps console.log with consistent JSON output for CloudWatch filtering.

function log(level, msg, data) {
  const entry = {
    level,
    msg,
    ts: new Date().toISOString(),
    ...(data || {}),
  };
  if (level === 'ERROR') console.error(JSON.stringify(entry));
  else if (level === 'WARN') console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

// Placeholder AAD IDs that Teams sends for system/anonymous users
const PLACEHOLDER_IDS = [
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000001',
];
function isRealUserId(id) {
  return id && !PLACEHOLDER_IDS.includes(id);
}

// ─── Retry helper ────────────────────────────────────────────────────────────

async function withRetry(fn, label, retries = 5, baseDelay = 15000) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const delay = Math.min(baseDelay * Math.pow(2, i), 60000);
      log('WARN', `${label} attempt ${i + 1}/${retries} failed – retry in ${delay}ms`, {
        error: err.message,
      });
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
    // ── EventBridge scheduled event → auto-install poll ──
    if (event.source === 'aws.events' || event['detail-type'] === 'Scheduled Event') {
      return handleScheduledPoll();
    }

    let body = event.body;
    if (typeof body === 'string') body = JSON.parse(body);

    const path = event.rawPath || event.path || '';

    log('INFO', 'Incoming request', {
      path,
      activityType: body?.type || 'none',
      activityName: body?.name || 'none',
      from: body?.from?.aadObjectId || body?.from?.id || 'unknown',
      conversationId: body?.conversation?.id?.substring(0, 40) || 'none',
      serviceUrl: body?.serviceUrl || 'none',
    });

    // ── Config page for meeting tab (GET /bot/config) ──
    if (path.includes('/bot/config')) {
      return serveConfigPage();
    }

    // ── Bot Framework activities (POST /bot/messages) ──
    if (path.includes('/bot/messages') || path.includes('/bot/meeting-started')) {
      if (!body || !body.type) {
        return respond(200, { ok: true, note: 'empty activity' });
      }

      // Handle user messages (Hi, Hello, Help)
      if (body.type === 'message') {
        return handleMessage(body);
      }

      // Meeting lifecycle events
      if (body.type === 'event') {
        return handleMeetingEvent(body);
      }

      // Bot added to a meeting/chat – send welcome
      if (body.type === 'conversationUpdate' && body.membersAdded) {
        return handleConversationUpdate(body);
      }

      // installationUpdate, etc. – acknowledge
      log('INFO', 'Unhandled activity type', { type: body.type, name: body.name });
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
  // Log the FULL activity so we can see exactly what Teams sends.
  // This is critical for diagnosing casing/schema issues.
  log('INFO', 'Meeting event received', {
    eventName,
    activityKeys: Object.keys(activity),
    valueKeys: activity.value ? Object.keys(activity.value) : [],
    channelDataKeys: activity.channelData ? Object.keys(activity.channelData) : [],
  });
  // Full activity dump (may be large, but essential for debugging)
  log('DEBUG', 'Full meeting activity', { activity });

  if (eventName === 'application/vnd.microsoft.meetingStart') {
    return handleMeetingStart(activity);
  }
  if (eventName === 'application/vnd.microsoft.meetingEnd') {
    return handleMeetingEnd(activity);
  }

  log('WARN', 'Unhandled event name', { eventName });
  return respond(200, { ok: true, event: eventName });
}

// ── Meeting Start ────────────────────────────────────────────────────────────

async function handleMeetingStart(activity) {
  // Fields come from activity.value (Bot Framework meetingStart schema)
  // NOTE: Bot Framework uses PascalCase (Id, JoinUrl, Title, MeetingType)
  //       while channelData uses camelCase (meeting.id, meeting.organizer)
  const val = activity.value || {};
  const channelData = activity.channelData || {};
  const meetingId =
    val.Id || channelData.meeting?.id || activity.conversation?.id || `m-${Date.now()}`;
  const joinUrl = val.JoinUrl || '';
  const title = val.Title || '';

  // Organizer ID: try multiple known paths.
  // Teams is inconsistent – the organizer may be in channelData or activity.value.
  // activity.from.aadObjectId is usually a system placeholder (00000000-...-000001), NOT the real user.
  const candidateIds = [
    channelData.meeting?.organizer?.user?.aadObjectId,
    channelData.meeting?.organizer?.aadObjectId,
    val.Organizer?.User?.Id,
    val.organizer?.user?.id,
    activity.from?.aadObjectId,
  ];
  const organizerId = candidateIds.find(isRealUserId) || '';
  const serviceUrl = activity.serviceUrl || '';
  const conversationId = activity.conversation?.id || '';

  log('INFO', 'Meeting started', {
    meetingId,
    title,
    organizerId,
    joinUrl: joinUrl.substring(0, 80),
    serviceUrl,
    conversationId: conversationId.substring(0, 40),
    candidateIds, // Log ALL candidates so we can see which path worked
    fromId: activity.from?.aadObjectId || 'none',
  });

  // 1. Persist initial session
  log('INFO', 'Saving meeting session to DynamoDB', { meetingId, table: TABLE_NAME });
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
  log('INFO', 'Session saved', { meetingId });

  // 2. Group allow-list check (optional)
  if (ALLOWED_GROUP_ID && organizerId) {
    log('INFO', 'Checking group membership', { organizerId, groupId: ALLOWED_GROUP_ID });
    const allowed = await graph.isUserInGroup(organizerId, ALLOWED_GROUP_ID);
    log('INFO', 'Group check result', { organizerId, allowed });
    if (!allowed) {
      await updateSessionStatus(meetingId, 'skipped', { skip_reason: 'organizer_not_in_group' });
      return respond(200, { ok: true, action: 'skipped' });
    }
  } else if (ALLOWED_GROUP_ID && !organizerId) {
    log('WARN', 'Cannot check group – no organizer ID resolved', {
      meetingId,
      fromId: activity.from?.aadObjectId,
    });
    // Continue anyway – don't block meetings just because we can't identify the organizer
  }

  // 3. Send recording/transcription notice to the meeting chat
  try {
    log('INFO', 'Sending recording notice', {
      serviceUrl,
      conversationId: conversationId.substring(0, 40),
    });
    await graph.sendBotMessage(
      serviceUrl,
      conversationId,
      '🔴 **This meeting is being recorded and transcribed.**\n\n' +
        'A transcript will be posted to this chat when the meeting ends.'
    );
    log('INFO', 'Recording notice sent successfully');
  } catch (msgErr) {
    log('ERROR', 'Failed to send recording notice', {
      error: msgErr.message,
      serviceUrl,
      conversationId: conversationId.substring(0, 40),
    });
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
  // meetingEnd payload includes the JoinUrl — use it as primary source
  const joinUrlFromEvent = val.JoinUrl || '';
  // The from.aadObjectId on meetingEnd is the actual user, not the placeholder
  const fromUserId = activity.from?.aadObjectId || '';

  log('INFO', 'Meeting ended', {
    meetingId,
    serviceUrl,
    conversationId: conversationId.substring(0, 40),
    valueKeys: Object.keys(val),
    joinUrlFromEvent: joinUrlFromEvent.substring(0, 80),
    fromUserId,
  });

  // Retrieve our stored session
  log('INFO', 'Retrieving session from DynamoDB', { meetingId });
  const session = await getSession(meetingId);
  if (!session) {
    log('WARN', 'No session found for meeting', { meetingId });
    // Even without a prior session, we can still try to fetch the transcript
    // if we have the joinUrl from the meetingEnd event itself.
    if (!joinUrlFromEvent) {
      return respond(200, { ok: true, action: 'no_session' });
    }
    log('INFO', 'No session but have joinUrl from event – creating ad-hoc session');
  }

  // Merge: prefer session data but fill gaps from the meetingEnd event
  const effectiveSession = {
    ...(session || {}),
    join_url: (session && session.join_url) || joinUrlFromEvent,
    service_url: (session && session.service_url) || serviceUrl,
    conversation_id: (session && session.conversation_id) || conversationId,
    from_id: (session && session.organizer_id) || fromUserId,
  };

  log('INFO', 'Effective session for transcript fetch', {
    meetingId,
    status: effectiveSession.status || 'none',
    hasJoinUrl: !!effectiveSession.join_url,
    joinUrlSource: session && session.join_url ? 'dynamo' : 'meetingEnd_event',
    organizer: effectiveSession.organizer_id || 'unknown',
  });

  if (session) {
    await updateSessionStatus(meetingId, 'ended');
  }

  // Fetch transcript (with retry + delay to let Graph process it)
  const sUrl = effectiveSession.service_url;
  const convId = effectiveSession.conversation_id;

  // Allow Graph time to finalize the transcript (typically 30-90s after meeting ends)
  log('INFO', 'Waiting 30s for Graph to finalize transcript', { meetingId });
  await new Promise((r) => setTimeout(r, 30000));

  try {
    const transcript = await withRetry(
      () => fetchTranscript(meetingId, effectiveSession),
      'fetchTranscript',
      4, // retries (30s + 15/30/60/60 = ~195s total, well within 300s Lambda timeout)
      15000 // base delay between retries
    );
    if (transcript) {
      log('INFO', 'Transcript fetched', { meetingId, chars: transcript.length });
      await updateSessionStatus(meetingId, 'transcript_fetched', {
        transcript_length: transcript.length,
      });

      // ── Save transcript to S3 ───────────────────────────────────────
      let s3Key = '';
      if (TRANSCRIPT_BUCKET) {
        try {
          const datePrefix = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
          const safeMeetingId = meetingId.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
          s3Key = `transcripts/${datePrefix}/${safeMeetingId}.vtt`;
          await s3
            .putObject({
              Bucket: TRANSCRIPT_BUCKET,
              Key: s3Key,
              Body: transcript,
              ContentType: 'text/vtt',
              Metadata: {
                meetingId: meetingId.substring(0, 256),
                organizerId: effectiveSession.organizer_id || '',
                fetchedAt: new Date().toISOString(),
              },
            })
            .promise();
          log('INFO', 'Transcript saved to S3', {
            meetingId,
            bucket: TRANSCRIPT_BUCKET,
            key: s3Key,
          });
          await updateSessionStatus(meetingId, 'transcript_stored', { s3_key: s3Key });
        } catch (s3Err) {
          log('ERROR', 'Failed to save transcript to S3', { meetingId, error: s3Err.message });
          // Continue – still post to chat even if S3 fails
        }
      } else {
        log('WARN', 'TRANSCRIPT_BUCKET not set – skipping S3 storage', { meetingId });
      }

      // ── Post transcript to meeting chat ──────────────────────────────
      if (sUrl && convId) {
        const preview =
          transcript.length > 3000
            ? transcript.substring(0, 3000) + '\n\n… (truncated)'
            : transcript;
        const s3Note = s3Key ? `\n\n📁 Full transcript saved to S3: \`${s3Key}\`` : '';
        log('INFO', 'Posting transcript to chat', { meetingId, previewLen: preview.length });
        await graph.sendBotMessage(
          sUrl,
          convId,
          `📝 **Meeting Transcript**\n\n\`\`\`\n${preview}\n\`\`\`${s3Note}`
        );
        log('INFO', 'Transcript posted to chat', { meetingId });
        await updateSessionStatus(meetingId, 'completed');
      } else {
        log('WARN', 'Cannot post transcript – missing serviceUrl or conversationId', {
          meetingId,
          hasServiceUrl: !!sUrl,
          hasConvId: !!convId,
        });
        await updateSessionStatus(meetingId, 'transcript_fetched_no_delivery');
      }
    } else {
      log('INFO', 'No transcript available', { meetingId });
      await updateSessionStatus(meetingId, 'completed_no_transcript');
    }
  } catch (err) {
    log('ERROR', 'Transcript fetch failed', { meetingId, error: err.message, stack: err.stack });
    await updateSessionStatus(meetingId, 'error', { error_message: `transcript: ${err.message}` });
  }

  return respond(200, { ok: true, action: 'meeting_ended', meetingId });
}

// ─── Transcript fetching ─────────────────────────────────────────────────────

async function fetchTranscript(meetingId, session) {
  // We need the online-meeting ID (a GUID), not the thread-based meeting ID.
  const joinUrl = session.join_url;
  if (!joinUrl) {
    log('WARN', 'No join URL stored – cannot look up online meeting', { meetingId });
    return null;
  }

  // Resolve the online-meeting object from the join URL
  let onlineMeetingId;
  const userId = session.organizer_id || session.from_id || '';
  try {
    // Decode the join URL – Teams provides it URL-encoded but Graph needs decoded form
    let decodedUrl = joinUrl;
    try {
      decodedUrl = decodeURIComponent(joinUrl);
    } catch (_) {
      /* already decoded */
    }
    // Escape single quotes for OData string literals
    const filterUrl = decodedUrl.replace(/'/g, "''");
    log('INFO', 'Looking up onlineMeeting by joinUrl', {
      meetingId,
      rawUrl: joinUrl.substring(0, 80),
      decodedUrl: decodedUrl.substring(0, 80),
      urlChanged: joinUrl !== decodedUrl,
    });

    // Build the OData $filter and URL-encode it for the HTTP query string.
    const odataFilter = `joinWebUrl eq '${filterUrl}'`;
    const encodedFilter = encodeURIComponent(odataFilter);

    // Try user-scoped endpoint (requires application access policy, set up
    // via New-CsApplicationAccessPolicy + Grant-CsApplicationAccessPolicy).
    // Note: /communications/onlineMeetings does NOT support $filter, so only
    // the user-scoped endpoint works for joinWebUrl lookups.
    const endpoints = [];
    if (userId && userId !== 'unknown' && !userId.startsWith('00000000')) {
      endpoints.push({ path: `/users/${userId}/onlineMeetings`, label: 'user-scoped' });
    }

    for (const ep of endpoints) {
      try {
        log('INFO', `Trying ${ep.label} onlineMeetings endpoint`, { userId: userId || 'n/a' });
        const meetings = await graph.graphRequest('GET', `${ep.path}?$filter=${encodedFilter}`);
        log('INFO', 'onlineMeetings filter result', {
          meetingId,
          endpoint: ep.label,
          count: meetings.value?.length || 0,
        });
        if (meetings.value && meetings.value.length > 0) {
          onlineMeetingId = meetings.value[0].id;
          log('INFO', 'Resolved onlineMeetingId', { meetingId, onlineMeetingId, via: ep.label });
          break;
        }
      } catch (epErr) {
        log('WARN', `${ep.label} endpoint failed (${epErr.statusCode || 'unknown'}), trying next`, {
          meetingId,
          error: epErr.message?.substring(0, 150),
        });
      }
    }
  } catch (err) {
    log('ERROR', 'Could not resolve onlineMeeting from joinUrl', {
      meetingId,
      error: err.message,
      statusCode: err.statusCode,
      body: (err.body || '').substring(0, 300),
    });
  }

  if (!onlineMeetingId) {
    log('WARN', 'Could not resolve onlineMeetingId – no results', { meetingId });
    return null;
  }

  // List transcripts (user-scoped endpoint required by Application Access Policy)
  log('INFO', 'Listing transcripts', { meetingId, onlineMeetingId, userId });
  const transcripts = await graph.getMeetingTranscripts(userId, onlineMeetingId);
  log('INFO', 'Transcripts listed', {
    meetingId,
    count: transcripts.value?.length || 0,
    ids: (transcripts.value || []).map((t) => t.id),
  });
  if (!transcripts.value || transcripts.value.length === 0) {
    throw new Error('No transcripts available yet (Graph may still be processing)');
  }

  // Download the latest transcript as VTT
  const latest = transcripts.value[transcripts.value.length - 1];
  log('INFO', 'Downloading transcript content', {
    meetingId,
    transcriptId: latest.id,
    createdDateTime: latest.createdDateTime,
  });
  const content = await graph.getTranscriptContent(userId, onlineMeetingId, latest.id, 'text/vtt');
  log('INFO', 'Transcript downloaded', { meetingId, chars: content.length });
  return content;
}

// ─── Message handler (Hi/Hello/Help) ─────────────────────────────────────────

async function handleMessage(activity) {
  // Strip bot @mention — Teams wraps it as <at>Bot Name</at>.
  // 1. Remove <at>…</at> blocks entirely (including enclosed text)
  // 2. Strip any remaining HTML tags
  // 3. Also strip the bot display name if it appears as plain text (some clients)
  const botName = (activity.recipient?.name || 'Meeting Fetcher').toLowerCase();
  const text = (activity.text || '')
    .replace(/<at[^>]*>.*?<\/at>/gi, '') // kill <at>...</at> blocks
    .replace(/<[^>]+>/g, '') // kill remaining HTML
    .toLowerCase()
    .replace(botName, '') // kill plain-text bot name
    .trim();
  const serviceUrl = activity.serviceUrl || '';
  const conversationId = activity.conversation?.id || '';
  const activityId = activity.id || '';

  log('INFO', 'Message received', {
    text: text.substring(0, 50),
    from: activity.from?.aadObjectId || 'unknown',
    conversationId: conversationId.substring(0, 40),
  });

  // ── Manual "record" command (troubleshooting) ───────────────────────────
  if (['record', 'start recording', 'start', '/record'].includes(text)) {
    return handleManualRecord(activity);
  }

  // ── "status" command — show current session state ──────────────────────
  if (['status', '/status'].includes(text)) {
    return handleStatusCommand(activity);
  }

  // ── "debug" / "info" command — dump meeting info (for troubleshooting) ─
  if (['debug', '/debug', 'info', '/info'].includes(text)) {
    return handleDebugCommand(activity);
  }

  let reply;
  if (['hi', 'hello', 'hey'].includes(text)) {
    reply =
      "👋 Hello! I'm **Meeting Fetcher** — I automatically record and transcribe your meetings.\n\n" +
      "When a meeting starts, I'll post a recording notice. When it ends, I'll fetch the transcript and share it here.";
  } else if (['help', '?', '/help'].includes(text)) {
    reply =
      '📋 **Meeting Fetcher Help**\n\n' +
      '• **Hi / Hello** — Get a greeting\n' +
      '• **Help** — Show this help message\n' +
      '• **Record** — Manually trigger recording notice (troubleshooting)\n' +
      '• **Status** — Show session state for this chat\n' +
      '• **Debug / Info** — Show meeting info, session data & diagnostics\n\n' +
      'All commands also work with a `/` prefix (e.g. `/debug`, `/info`, `/status`).\n\n' +
      'I work automatically — no commands needed. When a meeting starts, I send a recording notice. ' +
      'When it ends, I fetch and post the transcript.';
  } else {
    reply =
      "I'm **Meeting Fetcher** — I handle meeting recording and transcription automatically. " +
      'Type **Help** to learn more.';
  }

  try {
    if (activityId) {
      await graph.replyToActivity(serviceUrl, conversationId, activityId, reply);
    } else {
      await graph.sendBotMessage(serviceUrl, conversationId, reply);
    }
    log('INFO', 'Replied to message', { text: text.substring(0, 20) });
  } catch (err) {
    log('ERROR', 'Failed to reply', { error: err.message, text: text.substring(0, 20) });
  }

  return respond(200, { ok: true });
}

// ─── Manual record command (troubleshooting) ─────────────────────────────────

async function handleManualRecord(activity) {
  const serviceUrl = activity.serviceUrl || '';
  const conversationId = activity.conversation?.id || '';
  const activityId = activity.id || '';
  const channelData = activity.channelData || {};
  const meetingId = channelData.meeting?.id || conversationId || `manual-${Date.now()}`;
  const userId = activity.from?.aadObjectId || '';

  log('INFO', 'Manual RECORD command', {
    meetingId,
    userId,
    conversationId: conversationId.substring(0, 40),
  });

  // Save a session so meetingEnd can find it later
  await saveSession({
    meeting_id: meetingId,
    status: 'active',
    join_url: '', // we don't have it from a message context
    title: '(manual trigger)',
    organizer_id: userId,
    service_url: serviceUrl,
    conversation_id: conversationId,
    event_type: 'manual_record',
    received_at: new Date().toISOString(),
  });

  // Send the recording notice
  const notice =
    '🔴 **This meeting is being recorded and transcribed.** (manual trigger)\n\n' +
    'A transcript will be posted to this chat when the meeting ends.\n\n' +
    `_Session ID: \`${meetingId.substring(0, 30)}…\`_`;

  try {
    if (activityId) {
      await graph.replyToActivity(serviceUrl, conversationId, activityId, notice);
    } else {
      await graph.sendBotMessage(serviceUrl, conversationId, notice);
    }
    log('INFO', 'Manual recording notice sent', { meetingId });
  } catch (err) {
    log('ERROR', 'Failed to send manual recording notice', { meetingId, error: err.message });
  }

  return respond(200, { ok: true, action: 'manual_record', meetingId });
}

// ─── Status command ──────────────────────────────────────────────────────────

async function handleStatusCommand(activity) {
  const serviceUrl = activity.serviceUrl || '';
  const conversationId = activity.conversation?.id || '';
  const activityId = activity.id || '';
  const channelData = activity.channelData || {};
  const meetingId = channelData.meeting?.id || conversationId || '';

  log('INFO', 'STATUS command', { meetingId });

  let reply;
  if (meetingId) {
    const session = await getSession(meetingId);
    if (session) {
      reply =
        '📊 **Session Status**\n\n' +
        `• **Meeting ID**: \`${session.meeting_id.substring(0, 30)}…\`\n` +
        `• **Status**: ${session.status}\n` +
        `• **Organizer**: \`${session.organizer_id || 'unknown'}\`\n` +
        `• **Event**: ${session.event_type}\n` +
        `• **Join URL**: ${session.join_url ? 'yes' : 'no'}\n` +
        `• **Updated**: ${session.updated_at || session.received_at}\n` +
        (session.error_message ? `• **Error**: ${session.error_message}\n` : '') +
        (session.skip_reason ? `• **Skip reason**: ${session.skip_reason}\n` : '') +
        (session.transcript_length ? `• **Transcript**: ${session.transcript_length} chars\n` : '');
    } else {
      reply = `ℹ️ No session found for this chat.\n\nMeeting ID: \`${meetingId.substring(0, 30)}…\``;
    }
  } else {
    reply = 'ℹ️ Not in a meeting context – no meeting ID available.';
  }

  try {
    if (activityId) {
      await graph.replyToActivity(serviceUrl, conversationId, activityId, reply);
    } else {
      await graph.sendBotMessage(serviceUrl, conversationId, reply);
    }
  } catch (err) {
    log('ERROR', 'Failed to send status reply', { error: err.message });
  }

  return respond(200, { ok: true });
}

// ─── Debug command ───────────────────────────────────────────────────────────

async function handleDebugCommand(activity) {
  const serviceUrl = activity.serviceUrl || '';
  const conversationId = activity.conversation?.id || '';
  const activityId = activity.id || '';
  const channelData = activity.channelData || {};
  const meetingId = channelData.meeting?.id || conversationId || '';
  const userId = activity.from?.aadObjectId || '';

  log('INFO', 'DEBUG/INFO command', { meetingId, userId });

  // ── Part 1: Meeting session from DynamoDB ──────────────────────────────
  let sessionBlock = '';
  if (meetingId) {
    const session = await getSession(meetingId);
    if (session) {
      sessionBlock =
        '📋 **Meeting Session (DynamoDB)**\n\n' +
        `| Field | Value |\n|---|---|\n` +
        `| Meeting ID | \`${session.meeting_id.substring(0, 40)}…\` |\n` +
        `| Status | **${session.status}** |\n` +
        `| Event | ${session.event_type || '—'} |\n` +
        `| Organizer | \`${session.organizer_id || 'unknown'}\` |\n` +
        `| From ID | \`${session.from_id || '—'}\` |\n` +
        `| Join URL | ${session.join_url ? '✅ present' : '❌ missing'} |\n` +
        `| Service URL | ${session.service_url ? '✅' : '❌'} |\n` +
        `| Updated | ${session.updated_at || session.received_at || '—'} |\n` +
        (session.error_message ? `| Error | ${session.error_message} |\n` : '') +
        (session.skip_reason ? `| Skip reason | ${session.skip_reason} |\n` : '') +
        (session.transcript_length ? `| Transcript | ${session.transcript_length} chars |\n` : '') +
        '\n';
    } else {
      sessionBlock = `ℹ️ No DynamoDB session found for meeting ID \`${meetingId.substring(0, 30)}…\`\n\n`;
    }
  } else {
    sessionBlock = 'ℹ️ No meeting context detected (no meeting ID in channelData).\n\n';
  }

  // ── Part 2: Current activity context ───────────────────────────────────
  const contextBlock =
    '🔧 **Current Context**\n\n' +
    `| Field | Value |\n|---|---|\n` +
    `| Your AAD ID | \`${userId || '—'}\` |\n` +
    `| Your Name | ${activity.from?.name || '—'} |\n` +
    `| Conversation | \`${conversationId.substring(0, 40)}…\` |\n` +
    `| Tenant | \`${channelData.tenant?.id || activity.channelData?.tenant?.id || '—'}\` |\n` +
    `| Service URL | ${serviceUrl} |\n` +
    `| Bot App ID | \`${BOT_APP_ID}\` |\n` +
    `| Lambda Env | ${process.env.STAGE || 'dev'} |\n` +
    '\n';

  // ── Part 3: Raw channelData (truncated) ────────────────────────────────
  const rawBlock =
    '<details><summary>🔍 Raw channelData</summary>\n\n' +
    '```json\n' +
    JSON.stringify(channelData, null, 2).substring(0, 2000) +
    '\n```\n</details>';

  const reply = sessionBlock + contextBlock + rawBlock;

  try {
    if (activityId) {
      await graph.replyToActivity(serviceUrl, conversationId, activityId, reply);
    } else {
      await graph.sendBotMessage(serviceUrl, conversationId, reply);
    }
    log('INFO', 'Debug/info dump sent');
  } catch (err) {
    log('ERROR', 'Failed to send debug dump', { error: err.message });
  }

  return respond(200, { ok: true });
}

// ─── Bot added to meeting/chat ───────────────────────────────────────────────

async function handleConversationUpdate(activity) {
  const botId = BOT_APP_ID;
  const added = activity.membersAdded || [];
  const botWasAdded = added.some((m) => m.id && (m.id.includes(botId) || m.id === `28:${botId}`));

  if (!botWasAdded) {
    // A user was added, not the bot – ignore
    return respond(200, { ok: true });
  }

  log('INFO', 'Bot was added to conversation', {
    conversationId: activity.conversation?.id?.substring(0, 40),
    channelData: activity.channelData,
  });
  const serviceUrl = activity.serviceUrl || '';
  const conversationId = activity.conversation?.id || '';

  // Send welcome message
  const welcome =
    '👋 **Meeting Fetcher** has been added!\n\n' +
    "I'll automatically notify when meetings are being recorded and post transcripts when they end.\n\n" +
    'Type **Help** for more info.';
  try {
    await graph.sendBotMessage(serviceUrl, conversationId, welcome);
    log('INFO', 'Welcome message sent');
  } catch (err) {
    log('ERROR', 'Failed to send welcome', { error: err.message });
  }

  // If this is a meeting chat, store the conversation for later use
  const meeting = activity.channelData?.meeting;
  if (meeting && meeting.id) {
    await saveSession({
      meeting_id: meeting.id,
      status: 'bot_installed',
      service_url: serviceUrl,
      conversation_id: conversationId,
      event_type: 'conversationUpdate',
      received_at: new Date().toISOString(),
    });
    log('INFO', 'Stored meeting session from conversationUpdate', { meetingId: meeting.id });
  }

  return respond(200, { ok: true, action: 'bot_added' });
}

// ─── Auto-install: Scheduled poll for upcoming meetings ──────────────────────

async function handleScheduledPoll() {
  log('INFO', 'Scheduled poll triggered', {
    catalogAppId: TEAMS_CATALOG_APP_ID ? 'set' : 'MISSING',
    watchedUsers: WATCHED_USER_IDS.length,
    lookaheadMinutes: POLL_LOOKAHEAD_MINUTES,
  });

  if (!TEAMS_CATALOG_APP_ID) {
    log('ERROR', 'TEAMS_CATALOG_APP_ID not set – cannot auto-install');
    return respond(200, { ok: false, error: 'TEAMS_CATALOG_APP_ID not configured' });
  }

  // Resolve watched users: use explicit list, or fall back to group members
  let userIds = WATCHED_USER_IDS;
  if (userIds.length === 0 && ALLOWED_GROUP_ID) {
    try {
      log('INFO', 'No WATCHED_USER_IDS – resolving from group', { groupId: ALLOWED_GROUP_ID });
      const members = await graph.getGroupMembers(ALLOWED_GROUP_ID);
      userIds = members.map((m) => m.id).filter(Boolean);
      log('INFO', 'Resolved group members', { count: userIds.length });
    } catch (err) {
      log('ERROR', 'Failed to resolve group members', { error: err.message });
      return respond(200, { ok: false, error: 'group_resolution_failed' });
    }
  }

  if (userIds.length === 0) {
    log('WARN', 'No users to watch – set WATCHED_USER_IDS or ALLOWED_GROUP_ID');
    return respond(200, { ok: true, action: 'no_users' });
  }

  let installed = 0;
  let skipped = 0;
  let errors = 0;

  for (const userId of userIds) {
    try {
      const result = await pollUserMeetings(userId);
      installed += result.installed;
      skipped += result.skipped;
      errors += result.errors;
    } catch (err) {
      log('ERROR', 'Failed to poll user meetings', { userId, error: err.message });
      errors++;
    }
  }

  log('INFO', 'Scheduled poll complete', { installed, skipped, errors, usersPolled: userIds.length });
  return respond(200, { ok: true, action: 'poll_complete', installed, skipped, errors });
}

async function pollUserMeetings(userId) {
  let installed = 0;
  let skipped = 0;
  let errors = 0;

  log('INFO', 'Polling upcoming meetings', { userId, lookahead: POLL_LOOKAHEAD_MINUTES });

  let events;
  try {
    events = await graph.getUpcomingOnlineMeetings(userId, POLL_LOOKAHEAD_MINUTES);
  } catch (err) {
    log('ERROR', 'Failed to get calendar events', { userId, error: err.message, statusCode: err.statusCode });
    return { installed: 0, skipped: 0, errors: 1 };
  }

  const meetings = (events.value || []).filter((e) => e.isOnlineMeeting && e.onlineMeeting?.joinUrl);
  log('INFO', 'Found online meetings', { userId, count: meetings.length });

  for (const meeting of meetings) {
    const joinUrl = meeting.onlineMeeting.joinUrl;
    const subject = meeting.subject || '(untitled)';

    try {
      // Check DynamoDB to see if we've already processed this meeting
      const cacheKey = `autoinstall:${joinUrl.substring(0, 120)}`;
      const cached = await getSession(cacheKey);
      if (cached && cached.status === 'installed') {
        skipped++;
        continue;
      }

      // Look up the online meeting to get the chat thread ID
      const onlineMeeting = await graph.getOnlineMeetingByJoinUrl(userId, joinUrl);
      if (!onlineMeeting || !onlineMeeting.chatInfo?.threadId) {
        log('WARN', 'No chatInfo for meeting', { subject, userId });
        skipped++;
        continue;
      }

      const chatId = onlineMeeting.chatInfo.threadId;
      log('INFO', 'Checking if bot is installed in meeting chat', {
        subject,
        chatId: chatId.substring(0, 40),
      });

      // Check if the bot app is already installed
      let alreadyInstalled = false;
      try {
        const apps = await graph.getInstalledAppsInChat(chatId);
        alreadyInstalled = (apps.value || []).some(
          (a) => a.teamsApp?.id === TEAMS_CATALOG_APP_ID
        );
      } catch (checkErr) {
        // 403/404 might mean the chat doesn't exist yet or no access
        log('WARN', 'Could not check installed apps', {
          chatId: chatId.substring(0, 40),
          error: checkErr.message,
          statusCode: checkErr.statusCode,
        });
      }

      if (alreadyInstalled) {
        log('INFO', 'Bot already installed', { subject, chatId: chatId.substring(0, 40) });
        // Cache it so we skip next time
        await saveSession({
          meeting_id: cacheKey,
          status: 'installed',
          join_url: joinUrl,
          title: subject,
          event_type: 'autoinstall_cached',
          received_at: new Date().toISOString(),
        });
        skipped++;
        continue;
      }

      // Install the bot!
      log('INFO', 'Installing bot into meeting chat', {
        subject,
        chatId: chatId.substring(0, 40),
        catalogAppId: TEAMS_CATALOG_APP_ID,
      });
      await graph.installAppInChat(chatId, TEAMS_CATALOG_APP_ID);
      log('INFO', 'Bot installed successfully', { subject, chatId: chatId.substring(0, 40) });

      // Cache the installation
      await saveSession({
        meeting_id: cacheKey,
        status: 'installed',
        join_url: joinUrl,
        title: subject,
        organizer_id: userId,
        event_type: 'autoinstall',
        received_at: new Date().toISOString(),
      });
      installed++;
    } catch (err) {
      // 409 = already installed (race condition)
      if (err.statusCode === 409) {
        log('INFO', 'Bot already installed (409)', { subject });
        skipped++;
      } else {
        log('ERROR', 'Failed to auto-install bot', {
          subject,
          error: err.message,
          statusCode: err.statusCode,
        });
        errors++;
      }
    }
  }

  return { installed, skipped, errors };
}

// ─── Meeting tab config page ─────────────────────────────────────────────────

function serveConfigPage() {
  const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<title>Meeting Fetcher</title>
<script src="https://res.cdn.office.net/teams-js/2.19.0/js/MicrosoftTeams.min.js"></script>
<style>body{font-family:Segoe UI,sans-serif;margin:2rem;color:#333}
h2{color:#004578}p{color:#666;margin-top:.5rem}</style>
</head><body>
<h2>Meeting Fetcher</h2>
<p>This app automatically records and transcribes meetings.<br>
Click <b>Save</b> to enable it for this meeting.</p>
<script>
(async()=>{
  await microsoftTeams.app.initialize();
  microsoftTeams.pages.config.registerOnSaveHandler(e=>{
    microsoftTeams.pages.config.setConfig({
      entityId:"meeting-fetcher",
      contentUrl:window.location.origin+"/dev/bot/config",
      suggestedDisplayName:"Meeting Fetcher"
    });
    e.notifySuccess();
  });
  microsoftTeams.pages.config.setValidityState(true);
})();
</script>
</body></html>`;

  return {
    statusCode: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: html,
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
