import { PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDb } from '../config/dynamodb';
import { config } from '../config';
import { AppConfig } from '../models';

const TABLE = config.aws.dynamodb.configTable;
const CONFIG_ID = 'primary';

export const configStore = {
  async get(): Promise<AppConfig | null> {
    const result = await dynamoDb.send(new GetCommand({
      TableName: TABLE,
      Key: { config_key: CONFIG_ID },
    }));
    return (result.Item as AppConfig) || null;
  },

  async put(appConfig: Partial<AppConfig>): Promise<void> {
    const now = new Date().toISOString();
    await dynamoDb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        config_key: CONFIG_ID,
        tenantId: config.graph.tenantId,
        entraGroupId: config.graph.entraGroupId,
        webhookUrl: config.webhook.notificationUrl,
        monitoredMeetingsCount: 0,
        transcriptionsProcessed: 0,
        transcriptionsPending: 0,
        createdAt: now,
        updatedAt: now,
        ...appConfig,
      },
    }));
  },

  async updateEntraGroupId(entraGroupId: string): Promise<void> {
    await dynamoDb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { config_key: CONFIG_ID },
      UpdateExpression: 'SET entraGroupId = :gid, updatedAt = :now',
      ExpressionAttributeValues: {
        ':gid': entraGroupId,
        ':now': new Date().toISOString(),
      },
    }));
  },

  async incrementCounter(field: 'monitoredMeetingsCount' | 'transcriptionsProcessed' | 'transcriptionsPending', delta: number): Promise<void> {
    await dynamoDb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { config_key: CONFIG_ID },
      UpdateExpression: `SET ${field} = if_not_exists(${field}, :zero) + :delta, updatedAt = :now`,
      ExpressionAttributeValues: {
        ':delta': delta,
        ':zero': 0,
        ':now': new Date().toISOString(),
      },
    }));
  },

  async updateLastWebhook(): Promise<void> {
    await dynamoDb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { config_key: CONFIG_ID },
      UpdateExpression: 'SET lastWebhookReceived = :now, updatedAt = :now',
      ExpressionAttributeValues: {
        ':now': new Date().toISOString(),
      },
    }));
  },
};
