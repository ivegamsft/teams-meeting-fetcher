import { PutCommand, GetCommand, QueryCommand, DeleteCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDb } from '../config/dynamodb';
import { config } from '../config';
import { Subscription } from '../models';

const TABLE = config.aws.dynamodb.subscriptionsTable;

export const subscriptionStore = {
  async _resolveKey(subscriptionId: string): Promise<{ subscription_id: string; created_at: string } | null> {
    const result = await dynamoDb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'subscription_id = :pk',
      ExpressionAttributeValues: { ':pk': subscriptionId },
      Limit: 1,
    }));
    if (!result.Items || result.Items.length === 0) return null;
    return { subscription_id: result.Items[0].subscription_id, created_at: result.Items[0].created_at };
  },

  async put(subscription: Subscription): Promise<void> {
    await dynamoDb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        ...subscription,
        created_at: subscription.createdAt,
      },
    }));
  },

  async get(id: string): Promise<Subscription | null> {
    const key = await this._resolveKey(id);
    if (!key) return null;
    const result = await dynamoDb.send(new GetCommand({
      TableName: TABLE,
      Key: key,
    }));
    return (result.Item as Subscription) || null;
  },

  async listAll(): Promise<Subscription[]> {
    const result = await dynamoDb.send(new ScanCommand({
      TableName: TABLE,
    }));
    return (result.Items as Subscription[]) || [];
  },

  async listByStatus(status: string): Promise<Subscription[]> {
    const result = await dynamoDb.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': status },
    }));
    return (result.Items as Subscription[]) || [];
  },

  async listExpiringSoon(withinHours: number = 48): Promise<Subscription[]> {
    const cutoff = new Date(Date.now() + withinHours * 60 * 60 * 1000).toISOString();
    const result = await dynamoDb.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: '#status = :active AND expirationDateTime < :cutoff',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':active': 'active',
        ':cutoff': cutoff,
      },
    }));
    return (result.Items as Subscription[]) || [];
  },

  async updateStatus(id: string, status: string, errorMessage?: string): Promise<void> {
    const key = await this._resolveKey(id);
    if (!key) throw new Error(`Subscription ${id} not found`);

    const updateExpr = errorMessage
      ? 'SET #status = :status, updatedAt = :now, errorMessage = :err'
      : 'SET #status = :status, updatedAt = :now';
    const exprValues: Record<string, unknown> = {
      ':status': status,
      ':now': new Date().toISOString(),
    };
    if (errorMessage) exprValues[':err'] = errorMessage;

    await dynamoDb.send(new UpdateCommand({
      TableName: TABLE,
      Key: key,
      UpdateExpression: updateExpr,
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: exprValues,
    }));
  },

  async updateExpiry(id: string, expirationDateTime: string): Promise<void> {
    const key = await this._resolveKey(id);
    if (!key) throw new Error(`Subscription ${id} not found`);

    await dynamoDb.send(new UpdateCommand({
      TableName: TABLE,
      Key: key,
      UpdateExpression: 'SET expirationDateTime = :exp, lastRenewalAt = :now, updatedAt = :now',
      ExpressionAttributeValues: {
        ':exp': expirationDateTime,
        ':now': new Date().toISOString(),
      },
    }));
  },

  async updateLastNotification(id: string): Promise<void> {
    const key = await this._resolveKey(id);
    if (!key) return;

    await dynamoDb.send(new UpdateCommand({
      TableName: TABLE,
      Key: key,
      UpdateExpression: 'SET lastNotificationAt = :now, updatedAt = :now',
      ExpressionAttributeValues: {
        ':now': new Date().toISOString(),
      },
    }));
  },

  async delete(id: string): Promise<void> {
    const key = await this._resolveKey(id);
    if (!key) return;

    await dynamoDb.send(new DeleteCommand({
      TableName: TABLE,
      Key: key,
    }));
  },
};
