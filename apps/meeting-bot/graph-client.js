/**
 * Microsoft Graph API client with MSAL authentication
 * Handles token acquisition and Graph REST calls for the meeting bot.
 */
'use strict';

const { ConfidentialClientApplication } = require('@azure/msal-node');
const https = require('https');

const TENANT_ID = process.env.GRAPH_TENANT_ID;
// Use the Bot app credentials – the Communications API (/communications/calls)
// requires the calling app to be registered as a bot in Bot Framework.
const CLIENT_ID = process.env.BOT_APP_ID || process.env.GRAPH_CLIENT_ID;
const CLIENT_SECRET = process.env.BOT_APP_SECRET || process.env.GRAPH_CLIENT_SECRET;

let msalClient = null;

function getMsalClient() {
  if (!msalClient) {
    msalClient = new ConfidentialClientApplication({
      auth: {
        clientId: CLIENT_ID,
        authority: `https://login.microsoftonline.com/${TENANT_ID}`,
        clientSecret: CLIENT_SECRET,
      },
    });
  }
  return msalClient;
}

/**
 * Acquire an app-only access token for Microsoft Graph.
 */
async function getAccessToken() {
  const result = await getMsalClient().acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });
  return result.accessToken;
}

/**
 * Make an authenticated HTTP request to Microsoft Graph.
 * @param {string} method - HTTP method
 * @param {string} path - Graph API path (e.g. /communications/calls)
 * @param {object} [body] - JSON body for POST/PATCH
 * @returns {Promise<object>} Parsed JSON response
 */
async function graphRequest(method, path, body) {
  const token = await getAccessToken();
  const url = path.startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`;

  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method,
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
          resolve(data ? JSON.parse(data) : {});
        } else {
          const err = new Error(`Graph ${method} ${path} → ${res.statusCode}: ${data}`);
          err.statusCode = res.statusCode;
          err.body = data;
          reject(err);
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Get meeting transcripts.
 * @param {string} userId - The meeting organizer's AAD user ID
 * @param {string} onlineMeetingId - The online meeting ID (not joinUrl)
 */
async function getMeetingTranscripts(userId, onlineMeetingId) {
  return graphRequest('GET', `/users/${userId}/onlineMeetings/${onlineMeetingId}/transcripts`);
}

/**
 * Download a specific transcript content.
 * @param {string} userId - The meeting organizer's AAD user ID
 * @param {string} onlineMeetingId
 * @param {string} transcriptId
 * @param {string} [format='text/vtt'] - 'text/vtt' or 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
 */
async function getTranscriptContent(userId, onlineMeetingId, transcriptId, format) {
  const token = await getAccessToken();
  const url = `https://graph.microsoft.com/v1.0/users/${userId}/onlineMeetings/${onlineMeetingId}/transcripts/${transcriptId}/content`;
  const fmt = format || 'text/vtt';

  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: fmt,
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`Transcript download failed: ${res.statusCode} ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Send a proactive message to a Teams conversation (chat/channel).
 * Requires the bot's serviceUrl and conversation ID from the original activity.
 */
async function sendBotMessage(serviceUrl, conversationId, text) {
  console.log(
    `📤 sendBotMessage → serviceUrl=${serviceUrl}, conversationId=${conversationId?.substring(0, 40)}...`
  );
  const token = await getBotFrameworkToken();
  const url = `${serviceUrl}v3/conversations/${conversationId}/activities`;
  console.log(`📤 POST ${url.substring(0, 80)}...`);

  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };
    const body = {
      type: 'message',
      text,
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data ? JSON.parse(data) : {});
        } else {
          reject(new Error(`Bot message failed: ${res.statusCode} ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Get a Bot Framework token for proactive messaging.
 *
 * Azure Bot Service registration type vs. token scope:
 *   MultiTenant  → scope: https://api.botframework.com/.default
 *   SingleTenant → scope: https://api.botframework.com/.default  (same scope, tenant-specific authority)
 *
 * The MSAL authority is already tenant-specific (set in getMsalClient).
 */
async function getBotFrameworkToken() {
  const scope = 'https://api.botframework.com/.default';
  console.log(
    `🔑 Acquiring Bot Framework token – scope=${scope}, authority=https://login.microsoftonline.com/${TENANT_ID}`
  );
  try {
    const result = await getMsalClient().acquireTokenByClientCredential({
      scopes: [scope],
    });
    // Log token metadata (NOT the token itself) for debugging
    if (result && result.accessToken) {
      const parts = result.accessToken.split('.');
      if (parts.length === 3) {
        const claims = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        console.log(
          `🔑 Token acquired – aud=${claims.aud}, iss=${claims.iss}, appid=${claims.appid}, tid=${claims.tid}`
        );
      }
    }
    return result.accessToken;
  } catch (err) {
    console.error(`❌ Token acquisition failed: ${err.message}`);
    throw err;
  }
}

/**
 * Check group membership for organizer filtering.
 */
async function isUserInGroup(userId, groupId) {
  if (!groupId || !userId) return true; // No filter = allow all
  try {
    const result = await graphRequest('POST', `/users/${userId}/checkMemberGroups`, {
      groupIds: [groupId],
    });
    return result.value && result.value.includes(groupId);
  } catch (err) {
    console.warn('⚠️ Group membership check failed, allowing:', err.message);
    return true; // Fail-open to avoid blocking meetings
  }
}

// ─── Calendar & Auto-Install APIs ────────────────────────────────────────────

/**
 * Get upcoming online meetings from a user's calendar.
 * Uses calendarView which returns occurrences of recurring events too.
 * @param {string} userId - AAD user ID
 * @param {number} [lookaheadMinutes=60] - How far ahead to look
 * @returns {Promise<object[]>} Calendar events with online meeting info
 */
async function getUpcomingOnlineMeetings(userId, lookaheadMinutes = 60) {
  const now = new Date();
  const end = new Date(now.getTime() + lookaheadMinutes * 60 * 1000);
  const startStr = now.toISOString();
  const endStr = end.toISOString();
  const select = 'id,subject,start,end,isOnlineMeeting,onlineMeeting';
  // Note: isOnlineMeeting does not support $filter on calendarView – filter client-side
  const path = `/users/${userId}/calendarView?startDateTime=${startStr}&endDateTime=${endStr}&$select=${select}&$top=50`;
  const result = await graphRequest('GET', path);
  // Filter to only events that are online meetings with a joinUrl
  const events = (result.value || []).filter((e) => e.isOnlineMeeting && e.onlineMeeting?.joinUrl);
  return { ...result, value: events };
}

/**
 * Look up an online meeting by its join URL to get the chat thread ID.
 * @param {string} userId - AAD user ID (organizer)
 * @param {string} joinUrl - The Teams meeting join URL
 * @returns {Promise<object|null>} Online meeting object with chatInfo, or null
 */
async function getOnlineMeetingByJoinUrl(userId, joinUrl) {
  let decoded = joinUrl;
  try {
    decoded = decodeURIComponent(joinUrl);
  } catch (_) {
    /* already decoded */
  }
  const filterUrl = decoded.replace(/'/g, "''");
  const filter = `joinWebUrl eq '${filterUrl}'`;
  // Note: $select is not supported on the onlineMeetings filter endpoint
  const path = `/users/${userId}/onlineMeetings?$filter=${encodeURIComponent(filter)}`;
  const result = await graphRequest('GET', path);
  return result.value && result.value.length > 0 ? result.value[0] : null;
}

/**
 * List apps installed in a chat.
 * @param {string} chatId - The chat thread ID (e.g. 19:meeting_xxx@thread.v2)
 * @returns {Promise<object>} Graph response with installed apps
 */
async function getInstalledAppsInChat(chatId) {
  return graphRequest('GET', `/chats/${chatId}/installedApps?$expand=teamsApp`);
}

/**
 * Install a Teams app into a chat (proactive installation with RSC consent).
 * @param {string} chatId - The chat thread ID
 * @param {string} teamsAppId - The Teams app catalog ID (not the manifest external ID)
 * @returns {Promise<object>} Graph response
 */
async function installAppInChat(chatId, teamsAppId) {
  // Use beta endpoint – consentedPermissionSet is only available on beta
  return graphRequest('POST', `https://graph.microsoft.com/beta/chats/${chatId}/installedApps`, {
    'teamsApp@odata.bind': `https://graph.microsoft.com/beta/appCatalogs/teamsApps/${teamsAppId}`,
    consentedPermissionSet: {
      resourceSpecificPermissions: [
        { permissionValue: 'OnlineMeeting.ReadBasic.Chat', permissionType: 'Application' },
        { permissionValue: 'OnlineMeetingTranscript.Read.Chat', permissionType: 'Application' },
        { permissionValue: 'OnlineMeetingRecording.Read.Chat', permissionType: 'Application' },
      ],
    },
  });
}

/**
 * List members of an Entra ID group.
 * @param {string} groupId - The group's object ID
 * @returns {Promise<object[]>} Array of group members
 */
async function getGroupMembers(groupId) {
  const result = await graphRequest(
    'GET',
    `/groups/${groupId}/members?$select=id,displayName,userPrincipalName&$top=999`
  );
  return result.value || [];
}

// ─── Graph Subscription APIs ─────────────────────────────────────────────────

/**
 * Create a Graph change notification subscription.
 * @param {string} notificationUrl - HTTPS endpoint to receive notifications
 * @param {string} resource - Graph resource to watch
 * @param {string} changeType - 'created', 'updated', 'deleted'
 * @param {number} expirationMinutes - Subscription lifetime in minutes
 * @param {string} clientState - Secret value for notification validation
 * @param {string} [lifecycleUrl] - Endpoint for lifecycle notifications (required if > 1h)
 */
async function createGraphSubscription(
  notificationUrl,
  resource,
  changeType,
  expirationMinutes,
  clientState,
  lifecycleUrl
) {
  const expirationDateTime = new Date(Date.now() + expirationMinutes * 60 * 1000).toISOString();
  const body = {
    changeType: changeType || 'created',
    notificationUrl,
    resource,
    expirationDateTime,
    clientState: clientState || '',
  };
  if (lifecycleUrl) {
    body.lifecycleNotificationUrl = lifecycleUrl;
  }
  return graphRequest('POST', '/subscriptions', body);
}

/**
 * Renew a Graph change notification subscription.
 * @param {string} subscriptionId - The subscription ID to renew
 * @param {number} expirationMinutes - New lifetime in minutes from now
 */
async function renewGraphSubscription(subscriptionId, expirationMinutes) {
  const expirationDateTime = new Date(Date.now() + expirationMinutes * 60 * 1000).toISOString();
  return graphRequest('PATCH', `/subscriptions/${subscriptionId}`, { expirationDateTime });
}

/**
 * Delete a Graph change notification subscription.
 * @param {string} subscriptionId - The subscription ID to delete
 */
async function deleteGraphSubscription(subscriptionId) {
  return graphRequest('DELETE', `/subscriptions/${subscriptionId}`);
}

/**
 * Get an online meeting by ID (look up chatInfo.threadId for posting).
 * @param {string} userId - The meeting organizer's AAD user ID
 * @param {string} onlineMeetingId - The online meeting ID
 */
async function getOnlineMeeting(userId, onlineMeetingId) {
  return graphRequest(
    'GET',
    `/users/${userId}/onlineMeetings/${onlineMeetingId}?$select=id,chatInfo,subject,startDateTime,endDateTime`
  );
}

/**
 * Update an online meeting's settings (e.g. enable auto-recording + transcription).
 * Requires OnlineMeetings.ReadWrite.All application permission + application access policy.
 * @param {string} userId - The meeting organizer's AAD user ID
 * @param {string} onlineMeetingId - The online meeting ID
 * @param {object} patch - Properties to update (e.g. { recordAutomatically: true, allowTranscription: true })
 */
async function updateOnlineMeeting(userId, onlineMeetingId, patch) {
  return graphRequest('PATCH', `/users/${userId}/onlineMeetings/${onlineMeetingId}`, patch);
}

/**
 * Reply to a specific activity in a conversation.
 * This is the proper way to respond to a user message in Teams.
 */
async function replyToActivity(serviceUrl, conversationId, activityId, text) {
  const token = await getBotFrameworkToken();
  const url = `${serviceUrl}v3/conversations/${conversationId}/activities/${activityId}`;

  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };
    const body = { type: 'message', text };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data ? JSON.parse(data) : {});
        } else {
          reject(new Error(`replyToActivity failed: ${res.statusCode} ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

module.exports = {
  getAccessToken,
  graphRequest,
  getMeetingTranscripts,
  getTranscriptContent,
  sendBotMessage,
  replyToActivity,
  isUserInGroup,
  getUpcomingOnlineMeetings,
  getOnlineMeetingByJoinUrl,
  getInstalledAppsInChat,
  installAppInChat,
  getGroupMembers,
  createGraphSubscription,
  renewGraphSubscription,
  deleteGraphSubscription,
  getOnlineMeeting,
  updateOnlineMeeting,
};
