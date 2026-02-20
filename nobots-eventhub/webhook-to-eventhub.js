// Simple webhook receiver that forwards Graph notifications to Event Hub
const http = require('http');
const { EventHubProducerClient } = require('@azure/event-hubs');
const { DefaultAzureCredential } = require('@azure/identity');
const config = require('./config');
const { URL } = require('url');

const PORT = parseInt(config.webhookPort, 10);

function sendValidationResponse(res, token) {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(token);
}

async function forwardToEventHub(payload) {
  if (!config.eventHubNamespace || !config.eventHubName) {
    throw new Error('EVENT_HUB_NAMESPACE or EVENT_HUB_NAME not configured');
  }

  const credential = new DefaultAzureCredential();
  const producer = new EventHubProducerClient(
    config.eventHubNamespace,
    config.eventHubName,
    credential
  );

  try {
    const batch = await producer.createBatch();
    batch.tryAdd({ body: payload });
    await producer.sendBatch(batch);
  } finally {
    await producer.close();
  }
}

async function forwardToEventGrid(payload) {
  if (!config.eventGridTopicEndpoint || !config.eventGridTopicKey) {
    return false;
  }

  const endpoint = new URL(config.eventGridTopicEndpoint);
  const body = JSON.stringify([
    {
      id: `graph-${Date.now()}`,
      eventType: 'Microsoft.Graph.Notification',
      subject: 'graph/notifications',
      eventTime: new Date().toISOString(),
      data: payload,
      dataVersion: '1.0',
    },
  ]);

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: endpoint.hostname,
        path: endpoint.pathname + endpoint.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'aeg-sas-key': config.eventGridTopicKey,
        },
      },
      (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve(res.statusCode));
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && url.searchParams.has('validationToken')) {
      const token = url.searchParams.get('validationToken');
      return sendValidationResponse(res, token);
    }

    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Method not allowed' }));
    }

    const body = await readRequestBody(req);
    const payload = body ? JSON.parse(body) : {};

    if (payload.validationToken) {
      return sendValidationResponse(res, payload.validationToken);
    }

    const eventGridStatus = await forwardToEventGrid(payload);
    await forwardToEventHub(payload);

    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'accepted',
        eventGrid: eventGridStatus || 'skipped',
        eventHub: 'sent',
      })
    );
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`Webhook receiver listening on http://localhost:${PORT}`);
  console.log('POST notifications to / (or use the public URL in NOTIFICATION_URL)');
});
