// Configuration loader for Event Hub-based workflow
require('dotenv').config();

module.exports = {
  // Azure AD / Graph API
  tenantId: process.env.GRAPH_TENANT_ID,
  clientId: process.env.GRAPH_CLIENT_ID,
  clientSecret: process.env.GRAPH_CLIENT_SECRET,
  watchUserId: process.env.WATCH_USER_ID,

  // Graph subscription configuration
  subscriptionResource: process.env.GRAPH_SUBSCRIPTION_RESOURCE || '/users',
  richNotifications: process.env.GRAPH_RICH_NOTIFICATIONS === 'true',
  blobStoreEndpoint: process.env.GRAPH_BLOB_STORE_ENDPOINT,
  blobStoreContainer: process.env.GRAPH_BLOB_STORE_CONTAINER,

  // Azure Event Hub (RBAC authentication with DefaultAzureCredential)
  eventHubNamespace: process.env.EVENT_HUB_NAMESPACE,
  eventHubName: process.env.EVENT_HUB_NAME,
  // eventHubConnectionString: process.env.EVENT_HUB_CONNECTION_STRING, // DEPRECATED: Use RBAC instead
  notificationUrl: process.env.NOTIFICATION_URL,
  webhookUrl: process.env.WEBHOOK_URL,
  webhookPort: process.env.WEBHOOK_PORT || '7071',

  // Optional Event Grid forwarding
  eventGridTopicEndpoint: process.env.EVENT_GRID_TOPIC_ENDPOINT,
  eventGridTopicKey: process.env.EVENT_GRID_TOPIC_KEY,

  // Storage
  dataDir: process.env.DATA_DIR || './data',

  // Graph API endpoints
  graphUrl: 'https://graph.microsoft.com/v1.0',
};
