import { PutCommand, GetCommand, QueryCommand, DeleteCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDb } from '../config/dynamodb';
import { config } from '../config';
import { Subscription } from '../models';

const TABLE = config.aws.dynamodb.subscriptionsTable;

export const subscriptionStore = {
  async put(subscription: Subscription): Promise<void> {
    await dynamoDb.send(new PutCommand({
      TableName: TABLE,
      Item: subscription,
    }));
  },

  async get(id: string): Promise<Subscription | null> {
    const result = await dynamoDb.send(new GetCommand({
      TableName: TABLE,
      Key: { id },
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
      Key: { id },
      UpdateExpression: updateExpr,
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: exprValues,
    }));
  },

  async updateExpiry(id: string, expirationDateTime: string): Promise<void> {
    await dynamoDb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { id },
      UpdateExpression: 'SET expirationDateTime = :exp, lastRenewalAt = :now, updatedAt = :now',
      ExpressionAttributeValues: {
        ':exp': expirationDateTime,
        ':now': new Date().toISOString(),
      },
    }));
  },

  async updateLastNotification(id: string): Promise<void> {
    await dynamoDb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { id },
      UpdateExpression: 'SET lastNotificationAt = :now, updatedAt = :now',
      ExpressionAttributeValues: {
        ':now': new Date().toISOString(),
      },
    }));
  },

  async delete(id: string): Promise<void> {
    await dynamoDb.send(new DeleteCommand({
      TableName: TABLE,
      Key: { id },
    }));
  },
};
