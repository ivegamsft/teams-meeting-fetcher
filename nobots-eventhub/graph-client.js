const https = require('https');
const config = require('./config');

let cachedToken = null;
let tokenExpiry = null;

async function getAccessToken() {
  // Return cached token if still valid
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry - 60000) {
    return cachedToken;
  }

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
          cachedToken = parsed.access_token;
          tokenExpiry = Date.now() + parsed.expires_in * 1000;
          resolve(cachedToken);
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

async function graphRequest(method, path, body = null) {
  const token = await getAccessToken();
  const url = new URL(`${config.graphUrl}${path}`);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
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
          const err = new Error(`Graph error ${res.statusCode}: ${data}`);
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

async function subscribeToCalendarChanges(userId, notificationUrl) {
  const subscription = {
    changeType: 'updated,deleted,created',
    notificationUrl,
    resource: `users/${userId}/events`,
    expirationDateTime: new Date(Date.now() + 86400 * 1000).toISOString(), // 1 day
    clientState: 'meeting-fetcher-secret-state',
  };

  const result = await graphRequest('POST', '/subscriptions', subscription);
  return result;
}

// Create subscription to Event Hub with rich notifications support
async function subscribeToEventHub(notificationUrl, resource = '/users', blobStoreUrl = null) {
  const subscription = {
    changeType: 'created,updated,deleted',
    notificationUrl: `EventHub:${notificationUrl}`,
    resource,
    expirationDateTime: new Date(Date.now() + 86400 * 1000).toISOString(), // 1 day
    lifecycleNotificationUrl: `EventHub:${notificationUrl}`, // Same Event Hub for lifecycle notifications (token reauth)
    clientState: 'meeting-fetcher-secret-state',
  };

  // Add blob store URL if provided (for rich notifications > 1MB)
  if (blobStoreUrl) {
    subscription.blobStoreUrl = blobStoreUrl;
  }

  const result = await graphRequest('POST', '/subscriptions', subscription);
  return result;
}

async function getCalendarEvents(userId, filter = null) {
  let path = `/users/${userId}/events?$select=id,subject,start,end,isOnlineMeeting,onlineMeeting,onlineMeetingUrl`;
  if (filter) {
    path += `&$filter=${encodeURIComponent(filter)}`;
  }
  return graphRequest('GET', path);
}

async function getOnlineMeetingByJoinUrl(userId, joinUrl) {
  const filter = `joinWebUrl eq '${joinUrl.replace(/'/g, "''")}'`;
  const encoded = encodeURIComponent(filter);
  const result = await graphRequest('GET', `/users/${userId}/onlineMeetings?$filter=${encoded}`);
  return result.value?.[0] || null;
}

async function getMeetingTranscripts(userId, onlineMeetingId) {
  const result = await graphRequest(
    'GET',
    `/users/${userId}/onlineMeetings/${onlineMeetingId}/transcripts`
  );
  return result;
}

async function getTranscriptContent(userId, onlineMeetingId, transcriptId) {
  return new Promise((resolve, reject) => {
    const url = new URL(
      `${config.graphUrl}/users/${userId}/onlineMeetings/${onlineMeetingId}/transcripts/${transcriptId}/content`
    );

    getAccessToken()
      .then((token) => {
        const options = {
          hostname: url.hostname,
          path: url.pathname + url.search,
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        };

        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(data);
            } else {
              reject(new Error(`Transcript error ${res.statusCode}`));
            }
          });
        });

        req.on('error', reject);
        req.end();
      })
      .catch(reject);
  });
}

module.exports = {
  getAccessToken,
  graphRequest,
  subscribeToCalendarChanges,
  subscribeToEventHub,
  getCalendarEvents,
  getOnlineMeetingByJoinUrl,
  getMeetingTranscripts,
  getTranscriptContent,
};
