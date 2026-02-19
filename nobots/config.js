require('dotenv').config();

module.exports = {
  tenantId: process.env.GRAPH_TENANT_ID,
  clientId: process.env.GRAPH_CLIENT_ID,
  clientSecret: process.env.GRAPH_CLIENT_SECRET,
  watchUserId: process.env.WATCH_USER_ID,
  dataDir: process.env.DATA_DIR || './data',
  notificationUrl: process.env.NOTIFICATION_URL,

  // Graph API
  authUrl: `https://login.microsoftonline.com/${process.env.GRAPH_TENANT_ID}/oauth2/v2.0/token`,
  graphUrl: 'https://graph.microsoft.com/v1.0',
};
