import { PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDb } from '../config/dynamodb';
import { config } from '../config';
import { AppConfig, MonitoredGroup } from '../models';

const TABLE = config.aws.dynamodb.configTable;
const CONFIG_ID = 'primary';

export const configStore = {
  async get(): Promise<AppConfig | null> {
    const result = await dynamoDb.send(new GetCommand({
      TableName: TABLE,
      Key: { config_key: CONFIG_ID },
    }));
    const item = result.Item as AppConfig | undefined;
    if (item && !Array.isArray(item.monitoredGroups)) {
      item.monitoredGroups = [];
    }
    return item || null;
  },

  async put(appConfig: Partial<AppConfig>): Promise<void> {
    const now = new Date().toISOString();
    await dynamoDb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        config_key: CONFIG_ID,
        tenantId: config.graph.tenantId,
        monitoredGroups: [],
        eventhubNamespace: config.eventhub.namespace,
        eventhubName: config.eventhub.name,
        monitoredMeetingsCount: 0,
        transcriptionsProcessed: 0,
        transcriptionsPending: 0,
        createdAt: now,
        updatedAt: now,
        ...appConfig,
      },
    }));
  },

  async getMonitoredGroups(): Promise<MonitoredGroup[]> {
    const appConfig = await this.get();
    return appConfig?.monitoredGroups || [];
  },

  async addMonitoredGroup(group: MonitoredGroup): Promise<void> {
    const existing = await this.getMonitoredGroups();
    if (existing.some(g => g.groupId === group.groupId)) return;
    const updated = [...existing, group];
    await dynamoDb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { config_key: CONFIG_ID },
      UpdateExpression: 'SET monitoredGroups = :groups, updatedAt = :now',
      ExpressionAttributeValues: {
        ':groups': updated,
        ':now': new Date().toISOString(),
      },
    }));
  },

  async removeMonitoredGroup(groupId: string): Promise<void> {
    const existing = await this.getMonitoredGroups();
    const updated = existing.filter(g => g.groupId !== groupId);
    await dynamoDb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { config_key: CONFIG_ID },
      UpdateExpression: 'SET monitoredGroups = :groups, updatedAt = :now',
      ExpressionAttributeValues: {
        ':groups': updated,
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
};
