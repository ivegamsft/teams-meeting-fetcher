import dotenv from 'dotenv';
import path from 'path';

const envFile = process.env.NODE_ENV === 'production'
  ? '.env'
  : `.env.${process.env.NODE_ENV || 'development'}`;

dotenv.config({ path: path.resolve(__dirname, '../../', envFile) });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    dynamodb: {
      subscriptionsTable: process.env.DYNAMODB_SUBSCRIPTIONS_TABLE || 'graph-subscriptions',
      meetingsTable: process.env.DYNAMODB_MEETINGS_TABLE || 'tmf-meetings',
      transcriptsTable: process.env.DYNAMODB_TRANSCRIPTS_TABLE || 'tmf-transcripts',
      configTable: process.env.DYNAMODB_CONFIG_TABLE || 'tmf-config',
    },
    s3: {
      rawBucket: process.env.S3_RAW_TRANSCRIPT_BUCKET || 'tmf-raw-transcripts',
      sanitizedBucket: process.env.S3_SANITIZED_TRANSCRIPT_BUCKET || 'tmf-sanitized-transcripts',
    },
    sqs: {
      notificationQueueUrl: process.env.SQS_NOTIFICATION_QUEUE_URL || '',
    },
    secretsManager: {
      graphSecretName: process.env.GRAPH_SECRET_NAME || 'tmf/graph-credentials',
    },
  },

  graph: {
    tenantId: process.env.GRAPH_TENANT_ID || '',
    clientId: process.env.GRAPH_CLIENT_ID || '',
    clientSecret: process.env.GRAPH_CLIENT_SECRET || '',
  },

  eventhub: {
    namespace: process.env.EVENTHUB_NAMESPACE || '',
    name: process.env.EVENTHUB_NAME || '',
    tenantDomain: process.env.GRAPH_TENANT_DOMAIN || '',
  },

  auth: {
    sessionSecret: process.env.SESSION_SECRET || 'change-me-in-production',
    apiKey: process.env.API_KEY || '',
  },

  entra: {
    tenantId: process.env.ENTRA_TENANT_ID || '',
    clientId: process.env.ENTRA_CLIENT_ID || '',
    clientSecret: process.env.ENTRA_CLIENT_SECRET || '',
    redirectUri: process.env.ENTRA_REDIRECT_URI || '',
    adminGroupId: process.env.ADMIN_GROUP_ID || '',
  },

  sanitization: {
    enabled: process.env.SANITIZATION_ENABLED !== 'false',
    mode: process.env.SANITIZATION_MODE || 'simulated',
  },
};
