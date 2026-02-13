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
 * @param {string} onlineMeetingId - The online meeting ID (not joinUrl)
 */
async function getMeetingTranscripts(onlineMeetingId) {
  return graphRequest('GET', `/communications/onlineMeetings/${onlineMeetingId}/transcripts`);
}

/**
 * Download a specific transcript content.
 * @param {string} onlineMeetingId
 * @param {string} transcriptId
 * @param {string} [format='text/vtt'] - 'text/vtt' or 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
 */
async function getTranscriptContent(onlineMeetingId, transcriptId, format) {
  const token = await getAccessToken();
  const url = `https://graph.microsoft.com/v1.0/communications/onlineMeetings/${onlineMeetingId}/transcripts/${transcriptId}/content`;
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
  const token = await getBotFrameworkToken();
  const url = `${serviceUrl}v3/conversations/${conversationId}/activities`;

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
 */
async function getBotFrameworkToken() {
  const result = await getMsalClient().acquireTokenByClientCredential({
    scopes: ['https://api.botframework.com/.default'],
  });
  return result.accessToken;
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

module.exports = {
  getAccessToken,
  graphRequest,
  getMeetingTranscripts,
  getTranscriptContent,
  sendBotMessage,
  isUserInGroup,
};
